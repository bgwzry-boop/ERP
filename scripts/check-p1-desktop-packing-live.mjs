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

// The accepted 4174 UI stays running. EVERY browser API call, including auth
// and writes, is forwarded to a fresh random-port synthetic fixture. No printer
// is invoked. This checks browser/command/readback, not production acceptance.
const previewOrigin = "http://127.0.0.1:4174";
const outputRoot = resolve(".erp-local-storage/e2e/p1-desktop-packing-live");
const storageRoot = await mkdtemp(join(tmpdir(), "erp-p1-desktop-packing-"));
const testedCommit = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
const forwarded = [];
const browserErrors = [];
let server;
let browser;
let page;
let result;
try {
  assert.notEqual(process.env.NODE_ENV, "production");
  const html = await fetch(previewOrigin).then(response => response.text());
  assert.match(html, /bagwin-complete-review-4174/);
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
  assert.ok(!["8787", "4174"].includes(new URL(apiOrigin).port));
  const login = await api("/auth/prototype-login", { userId: "U-MANAGER-A" }, "POST", false);
  const token = login.session.accessToken;
  assert.ok(token);
  assert.ok(login.permissions.actionPermissions.includes("packing.complete"));
  const inventory = await api("/inventory/items?pageSize=200", undefined, "GET");
  const stock = inventory.items.find(item => item.size === "30*38*10" && item.color === "红色"
    && item.handle === "普通提" && item.style === "空白袋");
  assert.ok(stock);
  const available = Number(stock.inStock) - Number(stock.reserved) - Number(stock.locked) - Number(stock.pending);
  assert.ok(available >= 10, "The synthetic order must have real available stock.");
  const sourceText = "王五包装 30*38红10个 明天自提";
  const recognized = await api("/order-drafts/recognize", {
    sourceText, customerId: "C003", idempotencyKey: "p1-desktop-packing-recognize",
  });
  const draftId = recognized.draft.draftId;
  const confirmed = await api(`/order-drafts/${draftId}/confirm`, {
    sourceText, customerId: "C003", clientRevision: recognized.draft.clientRevision,
    idempotencyKey: "p1-desktop-packing-confirm",
    lines: [{
      draftLineId: `${draftId}-01`, customerId: "C003", customer: "王五包装",
      productName: "空白袋", orderType: "stock", size: "30*38*10", bagColor: "红色",
      handleType: "普通提", style: "空白袋", qty: 10, fulfillmentMethod: "自提",
      latestNeededAt: "明天", printFlag: false, printSide: "非印刷", printColor: "非印刷", artworkStatus: "无需图稿",
    }],
  });
  const orderLineId = confirmed.orderLines[0].id;
  const fulfillmentId = confirmed.fulfillmentTasks[0].fulfillmentId;
  const packingTaskId = `PKT-F-${fulfillmentId}`;
  assert.equal(confirmed.productionTasks.length, 0, "Stock on hand should be routed to outbound.");
  assert.equal(confirmed.reservations.length, 1);
  assert.equal(confirmed.reservations[0].qty, 10);
  const orderDetail = await api(`/order-lines/${orderLineId}`, undefined, "GET");
  assert.equal(normalizeOrderType(orderDetail.orderLine.orderType), "stock");
  assert.equal(orderDetail.orderLine.lineStatus, "待出库");
  const beforeFulfillment = await api(`/fulfillments/${fulfillmentId}`, undefined, "GET");
  assert.equal(beforeFulfillment.actualPackageCount, 0);
  const inventoryAfterConfirm = await readStock();
  const printJobsBefore = await api("/print-jobs?pageSize=200", undefined, "GET");

  browser = await chromium.launch({ channel: "chromium" });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, serviceWorkers: "block" });
  await context.route("**/api/**", async route => {
    const request = route.request();
    const source = new URL(request.url());
    const headers = { ...request.headers() };
    delete headers.host;
    delete headers["content-length"];
    // No original-origin route.continue/route.fetch, even for newly added APIs.
    const response = await fetch(`${apiOrigin}${source.pathname}${source.search}`, {
      method: request.method(), headers,
      ...(request.postDataBuffer() ? { body: request.postDataBuffer() } : {}), redirect: "error",
    });
    const body = await response.text();
    forwarded.push({ method: request.method(), path: source.pathname, status: response.status });
    await route.fulfill({ status: response.status, body,
      headers: { "content-type": response.headers.get("content-type") || "application/json" } });
  });
  page = await context.newPage();
  page.on("pageerror", error => browserErrors.push(error.message));
  await page.goto(`${previewOrigin}/?erpReviewCheck=p1-isolated-packing-${Date.now()}#outbound-delivery`);
  await selectFulfillment();
  const panel = page.getByRole("region", { name: "出库办理", exact: true });
  const physical = page.getByRole("region", { name: "实物混装包登记", exact: true });
  await expect(physical).toBeHidden();
  await openPackageWorkbench();
  await expect(panel.getByRole("group", { name: "登记实际包裹", exact: true })).toHaveCount(0);
  await physical.getByLabel("实际包数", { exact: true }).fill("2");
  await physical.getByRole("button", { name: "生成逐包核对表", exact: true }).click();
  await physical.getByLabel("每包数量", { exact: true }).fill("5");
  await physical.getByRole("button", { name: "每包填入此数量", exact: true }).click();
  await expect(physical.getByLabel(`第1包 ${orderLineId} 数量`, { exact: true })).toHaveValue("5");
  await expect(physical.getByLabel(`第2包 ${orderLineId} 数量`, { exact: true })).toHaveValue("5");
  await expect(physical).toContainText("实装 10 / 计划 10 个");
  const prepare = physical.getByRole("button", { name: "核对并生成独立包码", exact: true });
  await expect(prepare).toBeDisabled();
  const checks = physical.getByRole("checkbox", { name: "我已对照本包实物核实每项数量", exact: true });
  await expect(checks).toHaveCount(2);
  for (const checkbox of await checks.all()) await checkbox.check();
  await physical.getByLabel("登记或更正依据").fill("隔离桌面验收：按实物核对两包，每包5个。");
  await expect(prepare).toBeEnabled();
  await prepare.click();
  const confirmation = physical.locator(".package-fixed-summary");
  await expect(confirmation).toContainText("即将保存 2 个实际包裹");
  await expect(confirmation).toContainText("10个");
  assert.equal(forwarded.filter(isPackingWrite).length, 0, "The review step must not save before explicit confirmation.");
  const beforeSubmission = await api(`/fulfillments/${fulfillmentId}`, undefined, "GET");
  assert.equal(beforeSubmission.actualPackageCount, 0);
  await mkdir(outputRoot, { recursive: true });
  await page.screenshot({ path: join(outputRoot, "before-confirm.png"), fullPage: true });
  const responsePromise = page.waitForResponse(response =>
    new URL(response.url()).pathname === `/api/packing-groups/${fulfillmentId}/replace`
    && response.request().method() === "POST");
  await confirmation.getByRole("button", { name: "确认保存 / 原请求重试", exact: true }).click();
  const completedResponse = await responsePromise;
  const completed = await completedResponse.json();
  assert.equal(completedResponse.status(), 200, JSON.stringify(completed));
  assert.equal(completed.anchorFulfillmentId, fulfillmentId);
  assert.equal(completed.packingRevision, 1);
  assert.equal(completed.packages.reduce((sum, item) => sum + item.packedQty, 0), 10);
  assert.ok(completed.operationLogId);
  assert.equal(new Set(completed.packageIds).size, 2);
  const detail = await api(`/packing-groups?fulfillmentId=${fulfillmentId}`, undefined, "GET");
  assert.equal(detail.existing, true);
  assert.equal(detail.packingRevision, 1);
  assert.equal(detail.packages.length, 2);
  assert.equal(new Set(detail.packages.map(item => item.packageId)).size, 2);
  assert.deepEqual(detail.packages.map(item => item.packedQty), [5, 5]);
  assert.deepEqual(detail.packages.map(item => item.packageSeq), [1, 2]);
  assert.ok(detail.packages.every(item => item.packageCount === 2 && item.orderLineId === orderLineId
    && item.fulfillmentId === fulfillmentId && item.createdBy === "U-MANAGER-A"
    && !item.labelPrintRecordId && !/已打印|已重打/.test(item.status)));
  assert.deepEqual(detail.packages.map(item => item.packageId).sort(), [...completed.packageIds].sort());
  assert.ok(detail.packages.every(item => item.contents.length === 1 && item.contents[0].orderLineId === orderLineId && item.contents[0].packedQty === 5));
  const logs = (await api("/operation-logs?pageSize=200", undefined, "GET")).items.filter(item => item.id === completed.operationLogId);
  assert.equal(logs.length, 1);
  assert.equal(logs[0].operatorId, "U-MANAGER-A");
  const afterFulfillment = await api(`/fulfillments/${fulfillmentId}`, undefined, "GET");
  assert.equal(afterFulfillment.actualPackageCount, 2);
  assert.deepEqual(await readStock(), inventoryAfterConfirm, "Packing must not deduct stock or double-reserve it.");
  const printJobsAfter = await api("/print-jobs?pageSize=200", undefined, "GET");
  assert.equal(printJobsAfter.total, printJobsBefore.total, "Registering actual packages must not invoke a printer.");
  await expect(panel).toContainText("实包已登记：2");
  await expect(prepare).toHaveCount(0);
  await page.getByRole("button", { name: "刷新当前工作台", exact: true }).click();
  await openPackageWorkbench();
  await expect(panel).toContainText("实包已登记：2");
  await expect(physical).toContainText("当前有效挂牌 · 第 1 版");
  await expect(physical.locator(".package-label-paper")).toHaveCount(2);
  await expect(physical.getByLabel("实际包数", { exact: true })).toHaveValue("2");
  await page.reload();
  await selectFulfillment();
  await expect(panel).toContainText("实包已登记：2");
  await expect(prepare).toHaveCount(0);
  await expect(physical).toBeHidden();
  await openPackageWorkbench();
  await expect(physical).toContainText("当前有效挂牌 · 第 1 版");
  await expect(physical.locator(".package-label-paper")).toHaveCount(2);
  const persisted = await api(`/packing-groups?fulfillmentId=${fulfillmentId}`, undefined, "GET");
  assert.equal(persisted.packages.length, 2);
  assert.equal(persisted.packingRevision, 1);
  assert.deepEqual(persisted.packages.map(item => item.packageId), completed.packageIds);
  assert.equal(forwarded.filter(isPackingWrite).length, 1);
  assert.equal(forwarded.filter(item => !["GET", "HEAD", "OPTIONS"].includes(item.method)
    && !item.path.startsWith("/api/auth/") && !isPackingWrite(item)).length, 0);
  assert.deepEqual(browserErrors, []);
  await page.screenshot({ path: join(outputRoot, "completed-after-reload.png"), fullPage: true });
  result = { orderLineId, fulfillmentId, packingTaskId, orderType: orderDetail.orderLine.orderType,
    quantity: 10, actualPackageCount: 2, packages: detail.packages,
    operationLogId: completed.operationLogId, operatorId: logs[0].operatorId,
    inventoryDeducted: false, printJobsCreated: 0, browserSubmissions: 1,
    duplicateRegistrationHiddenAfterRefreshAndReload: true };
  await writeFile(join(outputRoot, "result.json"), JSON.stringify({
    checkedAt: new Date().toISOString(), status: "passed", previewOrigin, testedCommit,
    workingTree: "current integration worktree including uncommitted changes; not a deployed release",
    api: "fresh random-port synthetic fixture; backend-signed manager session; no identity/permission overrides",
    persistence: "isolated local fixture, not production PostgreSQL acceptance",
    result, forwarded, browserErrors,
  }, null, 2) + "\n");
  await rm(join(outputRoot, "failure.json"), { force: true });
  await rm(join(outputRoot, "failure.png"), { force: true });
  console.log(`Desktop packing live check passed: 1 real UI submission; 2 independent packages of 5; server task, audit and refresh guard verified. Evidence: ${join(outputRoot, "result.json")}`);

  async function selectFulfillment() {
    await page.getByRole("textbox", { name: "出库交付搜索", exact: true }).fill(fulfillmentId);
    const row = page.getByRole("table", { name: "出库交付列表", exact: true }).locator(".business-table-body").getByRole("row");
    await expect(row).toHaveCount(1);
    await row.click();
  }
  async function openPackageWorkbench() {
    if (await physical.isVisible()) return;
    await page.getByRole("button", { name: "登记 / 更正实物包裹", exact: true }).click();
    await expect(physical).toBeVisible();
  }
  async function readStock() {
    const current = await api(`/inventory/items?keyword=${encodeURIComponent(stock.id)}&pageSize=200`, undefined, "GET");
    const item = current.items.find(item => item.id === stock.id);
    assert.ok(item);
    return { inStock: item.inStock, reserved: item.reserved, locked: item.locked, pending: item.pending };
  }
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
  await writeFile(join(outputRoot, "failure.json"), JSON.stringify({ message: error.message, result, forwarded, browserErrors }, null, 2) + "\n");
  throw error;
} finally {
  await browser?.close();
  await closeTestServer(server, { forceAfterMs: 1000 });
  await rm(storageRoot, { recursive: true, force: true });
}

function isPackingWrite(item) { return item.method === "POST" && /^\/api\/packing-groups\/[^/]+\/replace$/.test(item.path); }
