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
import { completeWalkInPickup, readWalkInPickupConfirmation } from "../src/features/fulfillment/walkInPickup.js";

process.env.ERP_E2E_WAREHOUSE_EMPLOYEE_ID = "E2E-WAREHOUSE-001";
const dir = await mkdtemp(join(tmpdir(), "erp-walk-in-"));
const server = createApiServer(withLocalRepositoryFixture({ runtimeMode: "test", runtimeStorageRoot: dir, seedSource: "synthetic", applyProductionEnvFile: false, authMode: "prototype", authSecret: randomBytes(32).toString("hex"), fixedPreviewUserId: "U-MANAGER-A", allowLegacyIdentityHeaders: false, allowActionPermissionOverride: false, allowDefaultSeedUser: false }));
const realFetch = globalThis.fetch;
try {
  await server.ready; await listenTestServer(server);
  const base = getTestServerBaseUrl(server);
  let loseHandoffResponse = false;
  let simulatedPaperQty;
  const attempts = [];
  globalThis.fetch = async (url, init) => {
    const request = String(url).replace("http://127.0.0.1:8787", base);
    const isHandoff = request.endsWith("/paper-handoff");
    const isExecution = request.endsWith("/warehouse-execution");
    if (isHandoff || isExecution) attempts.push({ request, body: JSON.parse(init.body) });
    const response = await realFetch(request, init);
    if (isHandoff && response.ok && loseHandoffResponse) {
      loseHandoffResponse = false;
      throw new Error("模拟已保存、回执中断");
    }
    if (simulatedPaperQty !== undefined && init.method === "GET" && /\/fulfillments\/[^/]+$/u.test(request) && response.ok) {
      const detail = await response.json();
      detail.paperOutboundDocument.instructionQty = simulatedPaperQty;
      return Response.json(detail);
    }
    return response;
  };
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
  const early = await readWalkInPickupConfirmation({ fulfillmentIds: [pickups[0].fulfillmentId], ...auth });
  assert.deepEqual(early.rows, []);
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
  const fulfillmentIds = [target.fulfillmentId];
  const { rows: confirmation, message: readError } = await readWalkInPickupConfirmation({ fulfillmentIds, ...auth });
  assert.equal(confirmation.length, 1, readError);
  assert.equal(confirmation[0].paper.instructionQty, confirmation[0].quantity, "current paper instruction is exposed by the signed detail");
  const command = { fulfillmentIds, confirmation, executorEmployeeId: executors[0].employeeId, ...auth };
  simulatedPaperQty = confirmation[0].quantity + 1;
  const stale = await completeWalkInPickup(command);
  assert.equal(stale.refreshRequired, true, "the user must recheck a different paper");
  assert.equal(attempts.length, 0, "a changed paper prevents all writes");
  const { rows: correctedPaper } = await readWalkInPickupConfirmation({ fulfillmentIds, ...auth });
  assert.equal(correctedPaper[0].quantity, simulatedPaperQty, "show the new paper quantity even when it differs from the order plan");
  simulatedPaperQty = null;
  const { rows: legacyPaper } = await readWalkInPickupConfirmation({ fulfillmentIds, ...auth });
  assert.equal(legacyPaper[0].quantity, legacyPaper[0].fulfillment.expectedQty, "old paper without a frozen quantity keeps the server fallback");
  simulatedPaperQty = undefined;
  assert.equal((await getOfficeFulfillment({ fulfillmentId: target.fulfillmentId, ...auth }, { serverRequired: true })).fulfillment.paperOutboundDocument.status, "已打印待交库房");

  // 客户已拿走：纸单交库房后进入实物出库。种子里这样货没有成品库存占用，出库被原来的检查拦住：
  // 不扣库存、不记完成，提示可以再点一次；纸单已交库房，再点一次不会重复交。
  loseHandoffResponse = true;
  const interrupted = await completeWalkInPickup(command);
  assert.equal(interrupted.done, false);
  assert.ok(interrupted.attempt, "uncertain handoff keeps the attempt");
  assert.equal(attempts.length, 1);
  const done = await completeWalkInPickup({ ...command, attempt: interrupted.attempt });
  assert.equal(attempts.filter(({ request }) => request.endsWith("/paper-handoff")).length, 1, "server-confirmed handoff is not repeated");
  assert.equal(attempts.find(({ request }) => request.endsWith("/warehouse-execution")).body.actualQty, confirmation[0].quantity);
  const after = (await getOfficeFulfillment({ fulfillmentId: target.fulfillmentId, ...auth }, { serverRequired: true })).fulfillment;
  assert.equal(after.paperOutboundDocument?.status, "已交库房");
  if (done.done) {
    assert.equal(after.status, "已交付");
    assert.ok(after.physicalOutboundAt && after.finalDeliveryAt);
    const latest = await readWalkInPickupConfirmation({ fulfillmentIds, ...auth });
    const again = await completeWalkInPickup({ ...command, confirmation: latest.rows });
    assert.deepEqual([again.done, again.finished], [true, 1]);
  } else {
    assert.match(done.message, /再点一次「客户已拿走」会接着办/u);
    assert.ok(!after.physicalOutboundAt, "no outbound recorded when the server refuses");
    assert.notEqual(after.status, "已交付");
    const again = await completeWalkInPickup({ ...command, attempt: done.attempt });
    assert.equal(again.message, done.message, "retry resumes at the same step");
    const outboundAttempts = attempts.filter(({ request }) => request.endsWith("/warehouse-execution"));
    assert.deepEqual(outboundAttempts[1].body, outboundAttempts[0].body, "retry keeps idempotency key and physical record payload");
  }
  console.log("walk-in pickup ok: no outbound before the note is confirmed printed; browser note PDF; office print confirmation; one click hands the note to the warehouse and runs the outbound under the usual stock checks; a refused step records nothing and the next click resumes there.");
} finally {
  globalThis.fetch = realFetch;
  await closeTestServer(server).catch(() => {});
  await rm(dir, { recursive: true, force: true });
}
