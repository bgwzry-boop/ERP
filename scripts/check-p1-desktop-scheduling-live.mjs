import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { chromium, expect } from "@playwright/test";
import { createApiServer } from "../server/apiServer.mjs";
import { normalizeOrderType } from "../shared/orderRouting.js";
import { withLocalRepositoryFixture } from "./helpers/localRepositoryFixture.mjs";
import { closeTestServer, getTestServerBaseUrl, listenTestServer, requestJson } from "./helpers/apiIntegrationTestHarness.mjs";

// Read the accepted 4174 UI, but intercept EVERY browser API request before it
// can reach the displayed API. All business writes go to a fresh local fixture.
// This proves browser -> real command -> task/queue/audit, not PostgreSQL races
// or production acceptance. It never starts/stops the owner's preview servers.
const previewOrigin = "http://127.0.0.1:4174";
const outputRoot = resolve(".erp-local-storage/e2e/p1-desktop-scheduling-live");
const storageRoot = await mkdtemp(join(tmpdir(), "erp-p1-desktop-schedule-"));
const originalFixtureFlag = process.env.ERP_E2E_BUSINESS_DECISION_FIXTURES;
process.env.ERP_E2E_BUSINESS_DECISION_FIXTURES = "true";
let server;
let browser;
let page;
const forwarded = [];
const browserErrors = [];
const results = [];
const testedCommit = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
try {
  assert.notEqual(process.env.NODE_ENV, "production", "Run this isolated check outside production mode.");
  const html = await fetch(previewOrigin).then(response => response.text());
  assert.match(html, /bagwin-complete-review-4174/, "4174 must serve the accepted complete-review app.");
  server = createApiServer(withLocalRepositoryFixture({
    runtimeMode: "test", runtimeStorageRoot: storageRoot, seedSource: "synthetic",
    applyProductionEnvFile: false, allowLocalFixture: true, authMode: "prototype",
    authSecret: randomBytes(32).toString("hex"), fixedPreviewUserId: "U-MANAGER-A",
    allowLegacyIdentityHeaders: false, allowActionPermissionOverride: false,
    allowDefaultSeedUser: false, phoneRegistrationEnabled: false,
  }));
  await server.ready;
  await listenTestServer(server);
  const apiOrigin = getTestServerBaseUrl(server);
  assert.notEqual(new URL(apiOrigin).port, "8787");
  assert.notEqual(new URL(apiOrigin).port, "4174");
  const login = await api("/auth/prototype-login", { userId: "U-MANAGER-A" }, "POST", false);
  const token = login.session.accessToken;
  assert.ok(token, "Use a real backend-signed preview session.");
  assert.ok(login.permissions.actionPermissions.includes("production.schedule.direct"));
  await api("/business-decision-authorizations", {
    idempotencyKey: "p1-desktop-manager-schedule-authorization",
    employeeId: "E2E-MANAGER-001", decisionScope: "production_schedule", maxAmount: null,
    activeFrom: "2020-01-01T00:00:00.000Z", activeTo: "",
    authorizationNote: "隔离合成夹具：桌面排产决定验收",
  }, "POST", true, 201);

  const scenarios = [
    { key: "short-stock", orderType: "stock", size: "30*38*10", qty: 99001, expectedOrderType: "stock" },
    { key: "special-size", orderType: "特殊尺寸", size: "43*51*12", qty: 501, expectedOrderType: "custom_special" },
  ];
  for (const scenario of scenarios) {
    const sourceText = `王五包装 ${scenario.size} 红色 ${scenario.qty}个 明天自提`;
    const recognized = await api("/order-drafts/recognize", {
      sourceText, customerId: "C003", idempotencyKey: `p1-desktop-recognize-${scenario.key}`,
    });
    const draftId = recognized.draft.draftId;
    const confirmed = await api(`/order-drafts/${draftId}/confirm`, {
      sourceText, customerId: "C003", clientRevision: recognized.draft.clientRevision,
      idempotencyKey: `p1-desktop-confirm-${scenario.key}`,
      lines: [{
        draftLineId: `${draftId}-01`, customerId: "C003", customer: "王五包装",
        productName: "空白袋", orderType: scenario.orderType, size: scenario.size,
        bagColor: "红色", handleType: "普通提", style: "空白袋", qty: scenario.qty,
        fulfillmentMethod: "自提", latestNeededAt: "明天", printFlag: false,
        printSide: "非印刷", printColor: "非印刷", artworkStatus: "无需图稿",
      }],
    });
    assert.equal(confirmed.productionTasks.length, 1, `${scenario.key} must create a real production task.`);
    assert.equal(confirmed.reservations.length, 0, "An unsatisfied order cannot reserve imaginary finished stock.");
    scenario.taskId = confirmed.productionTasks[0].productionTaskId;
    scenario.lineId = confirmed.orderLines[0].id;
    assert.ok(scenario.lineId);
    const orderDetail = await api(`/order-lines/${scenario.lineId}`, undefined, "GET");
    assert.equal(normalizeOrderType(orderDetail.orderLine.orderType), scenario.expectedOrderType);
    assert.equal(orderDetail.orderLine.lineStatus, "待排产");
    assert.equal(orderDetail.orderLine.printFlag, false);
    assert.equal(orderDetail.orderLine.size, scenario.size);
    const before = await api(`/production-tasks/${scenario.taskId}`, undefined, "GET");
    assert.equal(before.productionTask.taskStatus, "待排产");
    assert.ok(!before.productionTask.publishedScheduleId);
    scenario.beforeRevision = before.productionTask.revision;
    const queue = await api("/production-schedules/machine-queue?machineId=BAG-01&status=open", undefined, "GET");
    assert.ok(!queue.items.some(item => item.productionTaskId === scenario.taskId));
    scenario.orderTypeObserved = orderDetail.orderLine.orderType;
    scenario.inventoryCheck = confirmed.inventoryChecks[0];
    if (scenario.key === "short-stock") {
      assert.ok(scenario.inventoryCheck.currentAvailableQty < scenario.qty);
      assert.ok(scenario.inventoryCheck.shortageQty > 0);
    }
  }

  browser = await chromium.launch({ channel: "chromium" });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, serviceWorkers: "block" });
  await context.route("**/api/**", async route => {
    const request = route.request();
    const source = new URL(request.url());
    const headers = { ...request.headers() };
    delete headers.host;
    delete headers["content-length"];
    // Never route.continue/fetch the original origin: even a new API endpoint is isolated.
    const response = await fetch(`${apiOrigin}${source.pathname}${source.search}`, {
      method: request.method(), headers,
      ...(request.postDataBuffer() ? { body: request.postDataBuffer() } : {}),
      redirect: "error",
    });
    const body = await response.text();
    forwarded.push({ method: request.method(), path: source.pathname, status: response.status });
    await route.fulfill({ status: response.status, body,
      headers: { "content-type": response.headers.get("content-type") || "application/json" } });
  });
  page = await context.newPage();
  page.on("pageerror", error => browserErrors.push(error.message));
  await page.goto(`${previewOrigin}/?erpReviewCheck=p1-isolated-scheduling-${Date.now()}#production-tasks`);
  await mkdir(outputRoot, { recursive: true });
  for (const scenario of scenarios) {
    const search = page.getByRole("textbox", { name: "生产任务搜索" });
    await search.fill(scenario.taskId);
    const row = page.locator(".business-table-body").getByRole("row");
    await expect(row).toHaveCount(1);
    await row.click();
    const panel = page.getByRole("region", { name: "办公室排产" });
    await expect(panel.getByLabel("排产数量（个）")).toHaveValue(String(scenario.qty));
    await panel.getByLabel("生产机台").selectOption("BAG-01");
    await panel.getByLabel("安排或调整依据").fill(`隔离合成验收 ${scenario.key}：确认缺货/特殊尺寸需生产，已核对机台与交期。`);
    const submit = panel.getByRole("button", { name: "确认并发布排产", exact: true });
    await expect(submit).toBeEnabled();
    const responsePromise = page.waitForResponse(response =>
      new URL(response.url()).pathname === `/api/production-tasks/${scenario.taskId}/publish-schedule`
      && response.request().method() === "POST");
    await submit.click();
    const publishedResponse = await responsePromise;
    const published = await publishedResponse.json();
    assert.equal(publishedResponse.status(), 200, JSON.stringify(published));
    assert.equal(published.status, "制袋已排产");
    assert.ok(published.publishedScheduleId);
    assert.ok(published.operationLogId);
    assert.equal(published.inventoryCreated, false);
    assert.equal(published.reservationCreated, false);
    assert.equal(published.packingTaskCreated, false);
    const detail = await api(`/production-tasks/${scenario.taskId}`, undefined, "GET");
    const task = detail.productionTask;
    assert.equal(task.taskStatus, "制袋已排产");
    assert.equal(task.machineId, "BAG-01");
    assert.equal(task.plannedQty, scenario.qty);
    assert.equal(task.revision, scenario.beforeRevision + 1);
    assert.equal(task.publishedScheduleId, published.publishedScheduleId);
    const orderDetail = await api(`/order-lines/${scenario.lineId}`, undefined, "GET");
    assert.equal(orderDetail.orderLine.lineStatus, "制袋已排产");
    assert.equal(normalizeOrderType(orderDetail.orderLine.orderType), scenario.expectedOrderType);
    const logs = detail.operationLogs.filter(log => log.action === "publish_production_schedule");
    assert.equal(logs.length, 1);
    assert.equal(logs[0].operatorId, "U-MANAGER-A");
    const queue = await api("/production-schedules/machine-queue?machineId=BAG-01&status=open", undefined, "GET");
    const queued = queue.items.filter(item => item.productionTaskId === scenario.taskId);
    assert.equal(queued.length, 1);
    assert.equal(queued[0].publishedScheduleId, published.publishedScheduleId);
    assert.equal(queued[0].plannedQty, scenario.qty);
    assert.ok(queued[0].queueSeq >= 1);
    assert.equal(queued[0].queueReason, "已发布排产");
    const workshop = await api("/production-tasks?visibility=workshop_mobile&machineId=BAG-01&status=open&pageSize=200", undefined, "GET");
    assert.ok(workshop.items.some(item => item.productionTaskId === scenario.taskId));
    await expect(panel).toContainText(`已发布排产：${published.publishedScheduleId}`);
    await expect(panel.getByRole("button", { name: "确认并发布排产", exact: true })).toHaveCount(0);
    await page.screenshot({ path: join(outputRoot, `${scenario.key}.png`), fullPage: true });
    results.push({ scenario: scenario.key, orderLineId: scenario.lineId, orderType: scenario.orderTypeObserved,
      productionTaskId: scenario.taskId, quantity: scenario.qty, machineId: task.machineId,
      publishedScheduleId: task.publishedScheduleId, revision: task.revision,
      queueSeq: queued[0].queueSeq, operationLogId: published.operationLogId,
      operatorId: logs[0].operatorId, inventoryCheck: scenario.inventoryCheck });
  }
  assert.deepEqual(browserErrors, []);
  assert.equal(forwarded.filter(item => item.method === "POST" && item.path.endsWith("/publish-schedule")).length, 2);
  await writeFile(join(outputRoot, "result.json"), JSON.stringify({
    checkedAt: new Date().toISOString(), status: "passed", previewOrigin, testedCommit,
    workingTree: "current integration worktree including uncommitted changes; not a deployed release",
    api: "fresh random-port synthetic fixture; signed manager session; explicit formal employee authorization",
    persistence: "isolated local fixture, not production PostgreSQL acceptance",
    results, forwarded, browserErrors,
  }, null, 2) + "\n");
  await rm(join(outputRoot, "failure.json"), { force: true });
  await rm(join(outputRoot, "failure.png"), { force: true });
  console.log(`Desktop scheduling live check passed: ${results.length} real UI submissions; server tasks, queues and audit verified. Evidence: ${join(outputRoot, "result.json")}`);

  async function api(path, body, method = "POST", authenticated = true, expectedStatus = 200) {
    const response = await requestJson(apiOrigin, `/api${path}`, {
      method, expectedStatus, headers: { "content-type": "application/json",
        ...(authenticated ? { authorization: `Bearer ${token}` } : {}) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    return response.body;
  }
} catch (error) {
  await mkdir(outputRoot, { recursive: true });
  await page?.screenshot({ path: join(outputRoot, "failure.png"), fullPage: true }).catch(() => {});
  await writeFile(join(outputRoot, "failure.json"), JSON.stringify({
    message: error.message, results, forwarded, browserErrors,
  }, null, 2) + "\n");
  throw error;
} finally {
  await browser?.close();
  await closeTestServer(server, { forceAfterMs: 1000 });
  await rm(storageRoot, { recursive: true, force: true });
  if (originalFixtureFlag === undefined) delete process.env.ERP_E2E_BUSINESS_DECISION_FIXTURES;
  else process.env.ERP_E2E_BUSINESS_DECISION_FIXTURES = originalFixtureFlag;
}
