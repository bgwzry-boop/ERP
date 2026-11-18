// Real complete-review UI + isolated PostgreSQL. No external origin is accepted.
// Initial SQL is explicit synthetic fixture setup; all business transitions use UI.
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import { mkdir, rm, writeFile } from "node:fs/promises";
import pg from "pg";
import { chromium, expect } from "@playwright/test";
import { startLivePostgres, stopLivePostgres } from "./postgres-live/runtime.mjs";
import { buildPublishedOrderPriceFixture } from "./helpers/publishedOrderPriceFixture.mjs";
import { createApiServer } from "../server/apiServer.mjs";
import { createPrintDriverAdapter } from "../server/printDriverAdapter.mjs";
import { closeSharedPostgresPools } from "../server/postgresPoolClient.mjs";
import { listenTestServer, getTestServerBaseUrl } from "./helpers/apiIntegrationTestHarness.mjs";

const scenario = process.argv[2] || "all";
assert.ok(["all", "stock", "production"].includes(scenario));
const origin = "http://127.0.0.1:4174";
if (scenario === "all") {
  let ownedPreview;
  const previewIdentity = async () => {
    const response = await fetch(origin, { signal: AbortSignal.timeout(1000) });
    assert.match(await response.text(), /bagwin-complete-review-4174/, "4174 must serve the complete review app");
  };
  try {
    try { await previewIdentity(); }
    catch (error) {
      if (error.cause?.code !== "ECONNREFUSED") throw error;
      ownedPreview = spawn(process.execPath, ["scripts/run-complete-review-dev.mjs"], {
        cwd: process.cwd(), stdio: "inherit", env: { ...process.env, ERP_OFFICE_SEED_SOURCE: "synthetic" },
      });
      for (let attempt = 0; ; attempt++) {
        try { await previewIdentity(); break; }
        catch (failure) {
          if (attempt >= 60 || ownedPreview.exitCode !== null) throw failure;
          await new Promise(resolve => setTimeout(resolve, 250));
        }
      }
    }
    for (const childScenario of ["stock", "production"]) {
      await new Promise((resolve, reject) => {
        const child = spawn(process.execPath, ["scripts/check-full-order-flow-postgres-ui.mjs", childScenario], { cwd: process.cwd(), stdio: "inherit" });
        let timedOut = false;
        const timeout = setTimeout(() => { timedOut = true; child.kill("SIGTERM"); }, 180000);
        child.once("error", error => { clearTimeout(timeout); reject(error); });
        child.once("exit", code => { clearTimeout(timeout); code === 0 && !timedOut ? resolve() : reject(new Error(`${childScenario} UI check ${timedOut ? "timed out after 180s" : `exited ${code}`}`)); });
      });
    }
  } finally {
    if (ownedPreview && ownedPreview.exitCode === null) {
      const stopped = new Promise(resolve => ownedPreview.once("exit", resolve));
      ownedPreview.kill("SIGTERM"); await stopped;
    }
  }
  process.exit(0);
}
const output = `.erp-local-storage/e2e/full-order-flow-postgres/${scenario}`;
await mkdir(output, { recursive: true });
assert.match(await (await fetch(origin)).text(), /bagwin-complete-review-4174/);
const runtime = await startLivePostgres();
let pool, browser, page;
let cleanupPromise;
const cleanup = () => cleanupPromise ??= (async () => {
  try { await browser?.close(); await pool?.end(); await closeSharedPostgresPools(); }
  finally { await stopLivePostgres(runtime); }
})();
const onTermination = () => { void cleanup().finally(() => process.exit(143)); };
process.once("SIGTERM", onTermination);
process.once("SIGINT", onTermination);
const events = [], errors = [], blockedPhysical = [], rejectedOrigins = [];
let orderId, lineId;
const save = (name, value) => writeFile(`${output}/${name}.json`, JSON.stringify(value, null, 2));
try {
  pool = new pg.Pool({ connectionString: runtime.resolveLiveDatabaseUrl() });
  const query = async (sql, values = []) => (await pool.query(sql, values)).rows;
  await query("INSERT INTO customers(id,biz_no,name,short_name,settlement_cycle,created_by) VALUES('C-UI-EXACT','C-UI-EXACT','黄松','黄松','现结','U-OFFICE-A')");
  await query("INSERT INTO employees(id,biz_no,user_id,name,role_name,profile_status,remark) VALUES('E2E-MANAGER-001','UI-0001','U-MANAGER-A','隔离测试主管','管理','active','仅本机隔离合成验收，不代表正式员工身份')");
  await query("INSERT INTO employees(id,biz_no,name,role_name,profile_status) VALUES('E2E-UI-WAREHOUSE','UI-WH','隔离测试库房员','库房','active')");
  await query("UPDATE users SET employee_id='E2E-MANAGER-001' WHERE id='U-MANAGER-A'");
  await query("INSERT INTO business_decision_authorizations(id,employee_id,decision_scope,active_from,status,authorization_note) VALUES('AUTH-UI-SCHEDULE','E2E-MANAGER-001','production_schedule','2020-01-01','active','仅本机隔离排产验收')");
  // The broad legacy seed duplicates the migrated red color; keep one authority.
  await query("UPDATE standard_colors SET enabled=false WHERE name='红色' AND id<>'SC-RED'");
  const price = buildPublishedOrderPriceFixture({ bagPrice: 0.41 }).priceTableItems.find(item => item.sizeKey === "30*37*10" && item.handleType === "普通提" && item.styleKey === "空白袋");
  assert.ok(price);
  await query("UPDATE price_table_items SET bag_price=$1 WHERE id=$2", [price.bagPrice, price.id]);
  assert.equal((await query("SELECT id FROM inventory_items WHERE size='30*37*10'")).length, 0);
  if (scenario === "stock") await query(`INSERT INTO inventory_items(id,inventory_key,size,standard_color_id,handle_type,style,zone,inventory_state,on_hand_qty,reserved_qty,waiting_pickup_locked_qty,pending_handling_qty,trust_level)
    VALUES('INV-UI-3037-RED','UI-3037-RED','30*37*10','SC-RED','普通提','空白袋','隔离测试库位','现货',500,0,0,0,'隔离合成初始现货')`);
  const snapshot = async () => ({
    inventory: await query("SELECT id,size,on_hand_qty,reserved_qty,waiting_pickup_locked_qty,pending_handling_qty FROM inventory_items WHERE size='30*37*10'"),
    orders: await query("SELECT * FROM original_orders WHERE customer_id='C-UI-EXACT'"),
    lines: await query("SELECT * FROM order_lines WHERE customer_id='C-UI-EXACT'"),
    fulfillments: await query("SELECT * FROM fulfillment_records WHERE order_line_id IN(SELECT id FROM order_lines WHERE customer_id='C-UI-EXACT')"),
    reservations: await query("SELECT * FROM inventory_reservations WHERE order_line_id IN(SELECT id FROM order_lines WHERE customer_id='C-UI-EXACT')"),
    prices: await query("SELECT * FROM price_snapshots WHERE order_line_id IN(SELECT id FROM order_lines WHERE customer_id='C-UI-EXACT')"),
    production: await query("SELECT * FROM production_tasks WHERE order_line_id IN(SELECT id FROM order_lines WHERE customer_id='C-UI-EXACT')"),
    packing: await query("SELECT * FROM packing_tasks WHERE order_line_id IN(SELECT id FROM order_lines WHERE customer_id='C-UI-EXACT')"),
    packages: await query("SELECT * FROM packages WHERE order_line_id IN(SELECT id FROM order_lines WHERE customer_id='C-UI-EXACT') ORDER BY package_seq"),
    printJobs: await query("SELECT * FROM print_jobs WHERE requested_by='U-MANAGER-A'"),
  });
  await save("before", await snapshot());
  // Existing server fixture is restricted to runtimeMode=test and synthetic identities.
  process.env.ERP_E2E_BUSINESS_DECISION_FIXTURES = "true";
  const server = createApiServer({ runtimeMode: "test", seedSource: "synthetic", applyProductionEnvFile: false,
    runtimeStorageRoot: runtime.storageRoot, v1PersistenceDatabaseUrl: runtime.resolveLiveDatabaseUrl(),
    v1PersistenceProfile: { repositoryMode: "postgres" }, authMode: "prototype", authSecret: randomBytes(32).toString("hex"),
    fixedPreviewUserId: "U-MANAGER-A", allowLegacyIdentityHeaders: false, allowActionPermissionOverride: false,
    allowDefaultSeedUser: false, phoneRegistrationEnabled: false, firstReleaseScope: null,
    printDriverAdapter: createPrintDriverAdapter({ dryRunEnabled: false, systemPrinterEnabled: false }),
  });
  runtime.server = server;
  await server.ready; await listenTestServer(server);
  const apiOrigin = getTestServerBaseUrl(server);
  assert.equal(new URL(apiOrigin).hostname, "127.0.0.1");
  assert.ok(Number(new URL(apiOrigin).port) > 0);
  assert.ok(!["4174", "8787"].includes(new URL(apiOrigin).port), "isolated PostgreSQL API must use its own random port");
  browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, serviceWorkers: "block" });
  const forwardApi = async route => {
    const request = route.request(), url = new URL(request.url());
    // These are frontend source addresses, never forwarding destinations.
    // No request is continued: every allowed request is sent ONLY to the new
    // server bound above to this run's isolated PostgreSQL container.
    if (![origin, "http://127.0.0.1:8787"].includes(url.origin)) {
      rejectedOrigins.push(url.origin);
      return route.abort();
    }
    if (request.method() !== "GET" && /browser-printed|confirm-outbound|dispatch-physical/.test(url.pathname)) {
      blockedPhysical.push(url.pathname); return route.abort();
    }
    const headers = { ...request.headers() }; delete headers.host; delete headers["content-length"];
    const target = new URL(`${url.pathname}${url.search}`, apiOrigin);
    assert.equal(target.origin, apiOrigin);
    let response;
    try {
      response = await fetch(target, { method: request.method(), headers,
        ...(request.postDataBuffer() ? { body: request.postDataBuffer() } : {}), redirect: "error", signal: AbortSignal.timeout(20000) });
    } catch (error) {
      errors.push(`Isolated API request failed: ${request.method()} ${url.pathname} ${error.name}`);
      return route.abort();
    }
    const body = Buffer.from(await response.arrayBuffer()), contentType = response.headers.get("content-type") || "application/json";
    const event = { method: request.method(), path: url.pathname, status: response.status,
      browserOrigin: url.origin, forwardedOrigin: target.origin };
    if (request.method() !== "GET" || response.status >= 400) {
      if (contentType.includes("json")) { const json = JSON.parse(body.toString()); delete json.session; delete json.permissions; event.receipt = json; }
      console.log(`${event.method} ${event.path} ${event.status}`);
    }
    events.push(event);
    if (contentType.includes("pdf")) { assert.equal(body.subarray(0, 4).toString(), "%PDF"); await writeFile(`${output}/delivery-note.pdf`, body); }
    return route.fulfill({ status: response.status, contentType, body });
  };
  await context.route("**/api/**", forwardApi);
  page = await context.newPage(); page.setDefaultTimeout(15000); page.on("pageerror", error => errors.push(error.message));
  await page.goto(`${origin}/?erpViewport=desktop&isolatedUi=${Date.now()}#order-entry`);
  await page.evaluate(async () => { try { await fetch("https://untrusted-api.invalid/api/health"); } catch { /* must be aborted before network access */ } });
  assert.deepEqual(rejectedOrigins, ["https://untrusted-api.invalid"]);
  const source = page.getByRole("textbox", { name: "客户订单原文", exact: true });
  await expect(source).toBeVisible({ timeout: 30000 }); await source.fill("3037 红 500 个 黄松");
  await page.getByRole("button", { name: "识别客户消息", exact: true }).click();
  await expect(page.getByRole("table", { name: "订单明细", exact: true })).toBeVisible({ timeout: 20000 });
  await page.screenshot({ path: `${output}/01-recognized.png`, fullPage: true });
  await page.getByLabel("整单交付方式", { exact: true }).selectOption({ label: "送货" });
  await page.getByLabel("整单需要日期", { exact: true }).fill(new Date(Date.now() + 4 * 86400000).toISOString().slice(0, 10));
  await page.locator("button.primary-button").filter({ hasText: /^开单$/ }).click();
  if (scenario === "production") {
    await page.getByText("同意分批，缺的安排生产", { exact: true }).click();
    await page.locator("button.primary-button").filter({ hasText: /^开单$/ }).click();
  }
  await expect.poll(async () => (await query("SELECT id FROM original_orders WHERE customer_id='C-UI-EXACT'")).length, { timeout: 20000 }).toBe(1);
  const confirmed = await snapshot();
  [orderId, lineId] = [confirmed.orders[0].id, confirmed.lines[0].id];
  assert.equal(confirmed.prices.reduce((sum, row) => sum + Number(row.final_amount), 0), 205);
  assert.equal(confirmed.lines[0].original_qty, 500);
  assert.equal(confirmed.lines[0].size, "30*37*10");
  await save("confirmed", confirmed);
  await page.screenshot({ path: `${output}/02-confirmed.png`, fullPage: true });
  const desktopPage = page;
  const createPaperFile = async (screenshotName) => {
    page = desktopPage;
    await page.locator('[data-nav-id="outbound-delivery"]').click();
    await page.getByRole("row").filter({ hasText: lineId }).click();
    const operations = page.getByRole("region", { name: "出库办理", exact: true });
    await expect(operations).toBeVisible();
    if (scenario === "stock") {
      await expect(operations.getByRole("button", { name: "创建打印任务", exact: true })).toHaveCount(0);
      await operations.getByLabel("实际备货人", { exact: true }).selectOption("E2E-UI-WAREHOUSE");
      await operations.getByLabel("实点数量（个）", { exact: true }).fill("500");
      await operations.getByRole("button", { name: "核对备货数量", exact: true }).click();
      await page.getByRole("group", { name: "提交前核对", exact: true }).getByRole("button", { name: "确认提交", exact: true }).click();
      await expect(operations.getByText(/已确认备货.*500 个/u)).toBeVisible();
      await page.screenshot({ path: `${output}/03-stock-prepared.png`, fullPage: true });
    }
    await operations.getByRole("button", { name: "创建打印任务", exact: true }).click();
    await page.getByRole("group", { name: "提交前核对", exact: true }).getByRole("button", { name: "确认提交", exact: true }).click();
    await expect.poll(() => events.some(event => event.path === "/api/print-jobs/note.pdf" && event.status === 200), { timeout: 20000 }).toBe(true);
    const cancel = page.getByRole("dialog").getByRole("button", { name: "取消", exact: true });
    if (await cancel.isVisible()) await cancel.click();
    await operations.scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${output}/${screenshotName}.png`, fullPage: true });
  };
  if (scenario === "stock") {
    assert.deepEqual(confirmed.inventory.map(row => [row.on_hand_qty, row.reserved_qty]), [[500, 500]]);
    assert.equal(confirmed.production.length, 0);
    assert.equal(confirmed.reservations.reduce((sum, row) => sum + row.reserved_qty, 0), 500);
    await createPaperFile("03-print-file-created");
  } else {
    assert.equal(confirmed.inventory.length, 0);
    assert.equal(confirmed.production.length, 1);
    const taskId = confirmed.production[0].id;
    await page.locator('[data-nav-id="production-tasks"]').click();
    await page.getByRole("row").filter({ hasText: "黄松" }).click();
    const scheduling = page.getByRole("region", { name: "办公室排产", exact: true });
    await scheduling.locator("select").first().selectOption("BAG-03");
    await scheduling.getByLabel("排产数量（个）", { exact: true }).fill("500");
    await scheduling.getByLabel("安排或调整依据", { exact: true }).fill("本机隔离合成验收，模拟安排500个，不代表真实生产授权或实物执行。");
    await scheduling.getByRole("button", { name: "确认并发布排产", exact: true }).click();
    await expect.poll(async () => (await query("SELECT published_schedule_id FROM production_tasks WHERE id=$1", [taskId]))[0].published_schedule_id).toBeTruthy();
    await page.screenshot({ path: `${output}/03-schedule-published.png`, fullPage: true });
    const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true,
      userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1", serviceWorkers: "block" });
    await phone.route("**/api/**", forwardApi);
    page = await phone.newPage(); page.setDefaultTimeout(15000); page.on("pageerror", error => errors.push(error.message));
    await page.goto(`${origin}/?erpViewport=mobile&isolatedUi=${Date.now()}`);
    await page.getByRole("button", { name: "现场流程测试", exact: true }).click();
    await expect(page.getByText(taskId, { exact: true })).toBeVisible();
    await page.getByLabel("合格数量", { exact: true }).fill("500");
    await page.getByLabel("异常/废品数", { exact: true }).fill("0");
    await page.getByLabel("机器计数/动作次数", { exact: true }).fill("500");
    await expect(page.getByRole("button", { name: "报工完成", exact: true })).toBeEnabled();
    await page.screenshot({ path: `${output}/04-first-sku-ready-to-report.png`, fullPage: true });
    await page.getByRole("button", { name: "报工完成", exact: true }).click();
    await page.getByRole("button", { name: "确认完成生产报工", exact: true }).click();
    await expect.poll(async () => (await query("SELECT id FROM workshop_reports WHERE production_task_id=$1", [taskId])).length).toBe(1);
    const reported = await snapshot();
    assert.deepEqual(reported.inventory.map(row => [row.on_hand_qty, row.reserved_qty]), [[500, 500]]);
    assert.equal(reported.packing.length, 1);
    await save("reported", reported);
    await page.screenshot({ path: `${output}/05-reported.png`, fullPage: true });
    await page.getByRole("button", { name: "全部功能", exact: true }).click();
    await page.getByRole("button", { name: /打包任务/ }).click();
    await page.locator("button.mobile-task-row").filter({ hasText: lineId }).click();
    const packing = page.getByRole("region", { name: "实物混装包登记", exact: true });
    await expect(packing).toBeVisible();
    await packing.getByLabel("实际包数", { exact: true }).fill("5");
    await packing.getByRole("button", { name: "生成逐包核对表", exact: true }).click();
    await packing.getByLabel("每包数量", { exact: true }).fill("100");
    await packing.getByRole("button", { name: "每包填入此数量", exact: true }).click();
    for (const checkbox of await packing.getByRole("checkbox", { name: "我已对照本包实物核实每项数量", exact: true }).all()) await checkbox.check();
    await packing.getByLabel("登记或更正依据", { exact: true }).fill("仅本机隔离合成测试：模拟5包，每包100个。未进行真实打印、贴牌或实物出库。");
    await packing.getByRole("button", { name: "核对并生成独立包码", exact: true }).click();
    await page.screenshot({ path: `${output}/06-packing-summary.png`, fullPage: true });
    await packing.getByRole("button", { name: "确认保存 / 原请求重试", exact: true }).click();
    await expect(packing.getByRole("heading", { name: "当前有效挂牌 · 第 1 版", exact: true })).toBeVisible();
    const packed = await snapshot();
    assert.equal(packed.packing[0].status, "已完成");
    assert.deepEqual(packed.packages.map(row => row.packed_qty), [100, 100, 100, 100, 100]);
    assert.ok(packed.packages.every(row => row.status === "待打印标签" && !row.label_print_record_id));
    await save("packed", packed);
    await page.screenshot({ path: `${output}/07-packed-not-printed.png`, fullPage: true });
    await createPaperFile("08-production-delivery-file-created");
  }
  const after = await snapshot();
  await save("after", after);
  assert.deepEqual(after.inventory.map(row => [row.on_hand_qty, row.reserved_qty]), [[500, 500]], "no physical outbound deduction");
  assert.ok(after.fulfillments.every(row => !row.loaded_at && !row.confirmed_at && !row.delivered_at));
  assert.ok(after.printJobs.every(row => row.job_status === "queued" && !row.finished_at), "file generation is not physical print success");
  assert.equal(after.printJobs.length, 1);
  assert.equal(after.printJobs[0].document_type, "delivery_note");
  const fields = after.printJobs[0].payload_json.printTemplate.fields;
  assert.deepEqual([fields.customerName, fields.totalQuantity, fields.totalAmount], ["黄松", 500, 205]);
  assert.deepEqual(fields.lineItems.map(row => [row.size, row.color, row.quantity, row.bagUnitPriceText]), [["30*37*10", "红色", 500, "0.41"]]);
  assert.deepEqual(blockedPhysical, [], "no physical confirmation may even be attempted");
  assert.deepEqual(errors, []);
  assert.ok(events.length > 0 && events.every(event => event.forwardedOrigin === apiOrigin));
  assert.deepEqual(rejectedOrigins, ["https://untrusted-api.invalid"], "all remote API origins remain forbidden");
  await Promise.all(["failure.png", "failure.txt"].map(file => rm(`${output}/${file}`, { force: true })));
  console.log(`PASS ${scenario}: real UI formal order ${orderId}, 205 total; stopped before physical confirmation.`);
} catch (error) {
  if (page) {
    await page.screenshot({ path: `${output}/failure.png`, fullPage: true }).catch(() => {});
    await writeFile(`${output}/failure.txt`, await page.locator("body").innerText().catch(() => ""));
  }
  throw error;
} finally {
  await save("requests", events); await save("browser-errors", errors); await save("rejected-origins", rejectedOrigins);
  await cleanup();
  process.removeListener("SIGTERM", onTermination);
  process.removeListener("SIGINT", onTermination);
}
