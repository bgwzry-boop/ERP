// 负责人 2026-11-08：开单即出库。现货、客户当场拿走：打自提单 → 办公室确认打出来 →「客户已拿走」一次办完
// 交库房、实物出库（扣库存）、提货完成。用真实接口和本地仓储跑一遍；浏览器打印那一步用「确认已打印」接口代替。
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApiServer } from "../server/apiServer.mjs";
import { withLocalRepositoryFixture } from "./helpers/localRepositoryFixture.mjs";
import { listenTestServer, getTestServerBaseUrl, closeTestServer, requestJson } from "./helpers/apiIntegrationTestHarness.mjs";
import { getOfficeFulfillment, getOfficeFulfillmentOperatorCandidates, printOfficeFulfillment } from "../src/services/officeFulfillmentApiClient.js";
import { confirmOfficeBrowserPrint, fetchOfficeNotePdf } from "../src/services/officePrintJobApiClient.js";
import { completeWalkInPickup } from "../src/features/fulfillment/walkInPickup.js";

process.env.ERP_E2E_WAREHOUSE_EMPLOYEE_ID = "E2E-WAREHOUSE-001";
const dir = await mkdtemp(join(tmpdir(), "erp-walk-in-"));
const server = createApiServer(withLocalRepositoryFixture({ runtimeMode: "test", runtimeStorageRoot: dir, seedSource: "synthetic", applyProductionEnvFile: false, authMode: "prototype", authSecret: randomBytes(32).toString("hex"), fixedPreviewUserId: "U-MANAGER-A", allowLegacyIdentityHeaders: false, allowActionPermissionOverride: false, allowDefaultSeedUser: false }));
const realFetch = globalThis.fetch;
try {
  await server.ready; await listenTestServer(server);
  const base = getTestServerBaseUrl(server);
  globalThis.fetch = (url, init) => realFetch(String(url).replace("http://127.0.0.1:8787", base), init);
  const login = (await requestJson(base, "/api/auth/prototype-login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ userId: "U-MANAGER-A" }) })).body;
  const authState = { authenticated: true, session: login.session, permissions: login.permissions };
  const auth = { authState, operatorId: "U-MANAGER-A" };
  const headers = { "content-type": "application/json", authorization: `Bearer ${login.session.accessToken}` };
  // 办公室针式机：浏览器打印。
  const device = await requestJson(base, "/api/print-devices", { method: "POST", headers, body: JSON.stringify({ printDeviceId: "PRN-DOT-A", connectionType: "browser_download", settings: { driverMode: "browser_download" }, idempotencyKey: "walk-in-device" }) });
  assert.equal(device.status, 200, JSON.stringify(device.body));

  const pickups = (await requestJson(base, "/api/fulfillments", { headers })).body.items.filter(item => ["自提", "pickup"].includes(item.method) && item.status === "待出库" && !item.physicalOutboundAt);
  assert.ok(pickups.length >= 1, "seed has a stock pickup waiting");

  // 还没打自提单就点「客户已拿走」：不能出库。
  const executors = (await getOfficeFulfillmentOperatorCandidates(auth, { serverRequired: true })).warehouseExecutors;
  assert.ok(executors.length, "warehouse executors listed");
  const early = await completeWalkInPickup({ fulfillmentIds: [pickups[0].fulfillmentId], executorEmployeeId: executors[0].employeeId, ...auth });
  assert.equal(early.done, false);
  assert.match(early.message, /自提单还没确认打印/u);
  const noExecutor = await completeWalkInPickup({ fulfillmentIds: [pickups[0].fulfillmentId], executorEmployeeId: "", ...auth });
  assert.match(noExecutor.message, /经手人/u);

  // 打自提单：浏览器打印的任务排队，PDF 能取到；办公室确认已打印。
  // 种子数据里有的现货没有价格（不能打纸单），取第一样能打的。
  let target; let before; let printed;
  for (const candidate of pickups) {
    before = (await getOfficeFulfillment({ fulfillmentId: candidate.fulfillmentId, ...auth }, { serverRequired: true })).fulfillment;
    printed = await printOfficeFulfillment({ ...auth, fulfillment: before, action: "打印出库单", printAction: "first_print", pickerName: "现场提货人", idempotencyKey: `walk-in-print-${candidate.fulfillmentId}` }, { serverRequired: true });
    if (printed.source === "api") { target = candidate; break; }
  }
  assert.ok(target, JSON.stringify(printed?.error));
  assert.deepEqual([printed.printJob.driverMode, printed.printJob.jobStatus], ["browser_download", "queued"]);
  const pdf = await fetchOfficeNotePdf({ printJobIds: [printed.printJobId], ...auth }, { serverRequired: true });
  assert.equal(pdf.source, "api", JSON.stringify(pdf.error));
  assert.equal(new TextDecoder().decode(new Uint8Array(await pdf.blob.arrayBuffer()).slice(0, 5)), "%PDF-");
  const confirmed = await confirmOfficeBrowserPrint({ printJobId: printed.printJobId, ...auth, idempotencyKey: "walk-in-confirm-1" }, { serverRequired: true });
  assert.equal(confirmed.printJob.jobStatus, "printed", JSON.stringify(confirmed.error));

  // 客户已拿走：纸单交库房后进入实物出库。种子里这样货没有成品库存占用，出库被原来的检查拦住：
  // 不扣库存、不记完成，提示可以再点一次；纸单已交库房，再点一次不会重复交。
  const done = await completeWalkInPickup({ fulfillmentIds: [target.fulfillmentId], executorEmployeeId: executors[0].employeeId, ...auth });
  const after = (await getOfficeFulfillment({ fulfillmentId: target.fulfillmentId, ...auth }, { serverRequired: true })).fulfillment;
  assert.equal(after.paperOutboundDocument?.status, "已交库房");
  if (done.done) {
    assert.equal(after.status, "已交付");
    assert.ok(after.physicalOutboundAt && after.finalDeliveryAt);
    const again = await completeWalkInPickup({ fulfillmentIds: [target.fulfillmentId], executorEmployeeId: executors[0].employeeId, ...auth });
    assert.deepEqual([again.done, again.finished], [true, 1]);
  } else {
    assert.match(done.message, /再点一次「客户已拿走」会接着办/u);
    assert.ok(!after.physicalOutboundAt, "no outbound recorded when the server refuses");
    assert.notEqual(after.status, "已交付");
    const again = await completeWalkInPickup({ fulfillmentIds: [target.fulfillmentId], executorEmployeeId: executors[0].employeeId, ...auth });
    assert.equal(again.message, done.message, "retry resumes at the same step");
  }
  console.log("walk-in pickup ok: no outbound before the note is confirmed printed; browser note PDF; office print confirmation; one click hands the note to the warehouse and runs the outbound under the usual stock checks; a refused step records nothing and the next click resumes there.");
} finally {
  globalThis.fetch = realFetch;
  await closeTestServer(server).catch(() => {});
  await rm(dir, { recursive: true, force: true });
}
