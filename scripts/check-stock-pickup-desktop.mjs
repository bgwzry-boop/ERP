import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { chromium, expect } from "@playwright/test";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { createApiServer } from "../server/apiServer.mjs";
import { loadSeedWorkspace } from "../server/seedData.mjs";
import { buildFulfillmentNotePdf } from "./fulfillment-note-pdf.mjs";
import { closeTestServer, getTestServerBaseUrl, listenTestServer, requestJson } from "./helpers/apiIntegrationTestHarness.mjs";
import { withLocalRepositoryFixture } from "./helpers/localRepositoryFixture.mjs";
import { buildPublishedOrderPriceFixture } from "./helpers/publishedOrderPriceFixture.mjs";

const previewOrigin = "http://127.0.0.1:4174";
const previewUrl = `${previewOrigin}/?stockPickup=isolated&erpViewport=desktop`;
const output = resolve(".erp-local-storage/e2e/stock-pickup-desktop");
const operator = "U-MANAGER-A";
const executor = { id: "EMP-STOCK-PICKUP-TEST", name: "合成库房员工", profileStatus: "active", employmentStatus: "在职", roleName: "库房" };
const stock = {
  id: "STOCK-PICKUP-3037-RED", size: "30*37*10", color: "红色", handle: "普通提", style: "空白袋",
  zone: "隔离测试区", state: "仓库已清点", inStock: 1000, reserved: 0, locked: 0, pending: 0, estimated: false,
};
const stockQty = 500;
const quotedAmount = 170;
const customerMessage = "3037 红 500 个 黄松";
const customer = { id: "C-SHORT-HS", name: "黄松", shortName: "黄松", settlementCycle: "现结", status: "启用" };
const appId = "bagwin-complete-review-4174";
const commit = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
const report = { commit, appId, customerMessage, isolated: true, physicalPrint: false, stage: "setup", pageErrors: [], writes: [], inventory: {} };

await mkdir(output, { recursive: true });
await rm(join(output, "failure.png"), { force: true });
const storage = await mkdtemp(join(tmpdir(), "erp-stock-pickup-"));
let server, browser, page;
try {
  const seed = loadSeedWorkspace({ source: "synthetic", runtimeMode: "test" });
  const prices = buildPublishedOrderPriceFixture({ bagPrice: 0.34 });
  let customers = seed.customers;
  server = createApiServer(withLocalRepositoryFixture({
    runtimeMode: "test",
    runtimeStorageRoot: storage,
    seedSource: "synthetic",
    applyProductionEnvFile: false,
    authMode: "prototype",
    authSecret: randomBytes(32).toString("hex"),
    fixedPreviewUserId: "",
    allowLegacyIdentityHeaders: false,
    allowActionPermissionOverride: false,
    allowDefaultSeedUser: false,
    printDriverAdapterOptions: { dryRunEnabled: true, systemPrinterEnabled: false },
    coreWorkspaceReadRepository: {
      kind: "local_memory",
      loadState: () => ({ ...prices, customers, inventories: [...seed.inventories, stock], employees: [executor] }),
    },
  }));
  await server.ready;
  customers = [...seed.customers, customer]; // A maintained customer added after startup must be recognized without a restart.
  await listenTestServer(server);
  const apiOrigin = getTestServerBaseUrl(server);
  assert.notEqual(new URL(apiOrigin).port, "8787");
  const json = { "content-type": "application/json" };
  const login = async userId => (await requestJson(apiOrigin, "/api/auth/prototype-login", {
    method: "POST", headers: json, body: JSON.stringify({ userId }), expectedStatus: 200,
  })).body.session.accessToken;
  const operatorToken = await login(operator);
  const api = async (path, { body, token = operatorToken } = {}) => (await requestJson(apiOrigin, `/api${path}`, {
    method: body ? "POST" : "GET",
    headers: { ...json, authorization: `Bearer ${token}` },
    ...(body ? { body: JSON.stringify(body) } : {}),
  })).body;
  const readStock = async (stage, inStock, reserved) => {
    const inventory = (await api("/inventory/items?pageSize=200")).items.find(item => (item.id ?? item.inventoryId) === stock.id);
    assert.ok(inventory, "isolated red blank SKU must be present");
    report.inventory[stage] = { inStock: inventory.inStock, reserved: inventory.reserved };
    assert.deepEqual(report.inventory[stage], { inStock, reserved }, stage);
  };

  await api("/print-devices/PRN-DOT-A/driver-mode", { body: {
    driverMode: "system_printer", reason: "隔离测试干跑，不连接真实设备",
  } });
  await readStock("before", 1000, 0);

  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1040 }, serviceWorkers: "block" });
  page = await context.newPage();
  page.setDefaultTimeout(12_000);
  page.on("pageerror", error => report.pageErrors.push(error.message));

  let quote, confirmation, paperPrint, recognized;
  // Every browser API request goes to the per-run server. External resources and
  // direct requests to the ordinary local API are blocked before reaching them.
  await context.route("**/*", async route => {
    const request = route.request();
    const url = new URL(request.url());
    if (!url.pathname.startsWith("/api/")) {
      return url.origin === previewOrigin ? route.continue() : route.abort();
    }
    const headers = { ...request.headers() };
    delete headers.host;
    delete headers.origin;
    delete headers["content-length"];
    const response = await fetch(apiOrigin + url.pathname + url.search, {
      method: request.method(), headers, body: request.postDataBuffer() ?? undefined, redirect: "error",
    });
    const body = Buffer.from(await response.arrayBuffer());
    if (request.method() === "POST") {
      report.writes.push({ path: url.pathname, status: response.status });
      if (response.ok && url.pathname.endsWith("/order-drafts/recognize")) recognized = JSON.parse(body);
      if (response.ok && url.pathname.endsWith("/price-quote")) quote = JSON.parse(body).quote;
      if (response.ok && /\/order-drafts\/[^/]+\/confirm$/u.test(url.pathname)) confirmation = JSON.parse(body);
      if (response.ok && /\/fulfillments\/[^/]+\/print$/u.test(url.pathname)) paperPrint = JSON.parse(body);
    }
    await route.fulfill({ status: response.status, contentType: response.headers.get("content-type") ?? "application/json", body });
  });

  const button = (name, parent = page) => parent.getByRole("button", { name, exact: true });
  const screenshot = name => page.screenshot({ path: join(output, `${name}.png`), fullPage: true });
  const selectRow = async (label, id, rowText) => {
    const row = page.getByRole("table", { name: `${label}列表`, exact: true }).locator(".business-table-body").getByRole("row");
    if (rowText) await expect(row.filter({ hasText: rowText }).first()).toBeVisible();
    await page.getByRole("textbox", { name: `${label}搜索`, exact: true }).fill(id);
    await expect(row).toHaveCount(1);
    if (rowText) await expect(row).toContainText(rowText);
    await row.click();
  };

  report.stage = "recognize";
  await page.goto(`${previewUrl}#order-entry`);
  await expect(page.locator('meta[name="erp-app-id"]')).toHaveAttribute("content", appId);
  await expect(page.locator('meta[name="erp-preview-kind"]')).toHaveAttribute("content", "local-unreleased");
  await expect(page.locator('meta[name="erp-preview-base-commit"]')).toHaveAttribute("content", commit);
  const source = page.getByLabel("客户订单原文", { exact: true });
  await expect(source).toHaveValue(/张三服饰/u);
  await page.getByRole("button", { name: /新建订单$/u }).click();
  const customerInput = page.getByPlaceholder("输入客户名称、简称、联系人或电话搜索");
  const checkShortLine = async () => {
    await expect(page.getByLabel("第1行数量", { exact: true })).toHaveValue(String(stockQty));
    await expect(page.getByLabel("第1行规格", { exact: true })).toHaveValue(stock.size);
    await expect(page.getByLabel("第1行袋身颜色", { exact: true })).toHaveValue(stock.color);
    assert.equal(recognized.lines.length, 1);
    assert.equal(recognized.lines[0].qty, stockQty);
  };
  for (const message of ["3037 红 500 个", "3037 红 500个"]) {
    await source.fill(message);
    await button("识别客户消息").click();
    await checkShortLine();
    await expect(customerInput).toHaveValue("");
    await expect(button("开单")).toBeDisabled();
    assert.equal(recognized.lines[0].customerId, "");
    assert.equal(recognized.draft.sourceText, message);
  }
  await screenshot("00-short-message-no-customer");
  await source.fill(customerMessage);
  await button("识别客户消息").click();
  await checkShortLine();
  await expect(page.getByLabel("第1行是否印刷", { exact: true })).toHaveValue("否");
  await expect(customerInput).toHaveValue(customer.name);
  await expect(button("开单")).toBeEnabled();
  await expect(page.getByText("1 行计价明细已齐全", { exact: true })).toBeVisible();
  assert.equal(recognized.lines[0].customerId, customer.id);
  assert.equal(recognized.draft.sourceText, customerMessage);
  await expect(page.getByText(/系统里没有/u)).toHaveCount(0);
  await screenshot("00-short-message-existing-customer");
  report.recognition = { source: customerMessage, customerId: customer.id, size: stock.size, color: stock.color, qty: stockQty };
  // The customer's short message does not specify delivery or deadline: the office
  // supplies those explicitly instead of adding words to make recognition pass.
  await page.getByLabel("整单交付方式", { exact: true }).selectOption("自提");
  await page.getByLabel("整单需要日期", { exact: true }).fill("2099-11-07");

  report.stage = "quote-and-confirm";
  // 2026-11-08：现货一次「开单」：先按价格表算价，算好直接下单。
  await button("开单").click();
  await expect(page.getByText(/正式订单已生成/u)).toBeVisible();
  assert.equal(quote.lines.length, 1);
  assert.equal(quote.lines[0].chargeableQty, stockQty);
  assert.equal(quote.lines[0].amount, quotedAmount);
  await screenshot("01-quoted");
  assert.deepEqual(confirmation.productionTasks, []);
  assert.equal(confirmation.orderLines.length, 1);
  assert.equal(confirmation.orderLines[0].lineStatus, "待出库");
  assert.equal(confirmation.reservations.length, 1);
  assert.equal(confirmation.reservations[0].inventoryItemId, stock.id);
  assert.equal(confirmation.reservations[0].qty, stockQty);
  assert.equal(confirmation.fulfillmentTasks.length, 1);
  report.orderLineId = confirmation.orderLines[0].id;
  report.fulfillmentId = confirmation.fulfillmentTasks[0].fulfillmentId;
  report.quote = { quantity: stockQty, amount: quotedAmount };
  await readStock("afterOrder", 1000, stockQty);
  const readFulfillment = () => api(`/fulfillments/${report.fulfillmentId}`);
  const initialFulfillment = await readFulfillment();
  assert.equal(initialFulfillment.status, "待出库");
  assert.equal(initialFulfillment.customerId, customer.id);
  assert.equal(initialFulfillment.customerName, customer.name);

  report.stage = "paper-create";
  await button("查看订单池").click();
  await expect(page).toHaveURL(/#order-pool$/u);
  await button("出库交付").click();
  await expect(page).toHaveURL(/#outbound-delivery$/u);
  await selectRow("出库交付", report.fulfillmentId, report.orderLineId);
  const panel = page.getByRole("region", { name: "出库办理", exact: true });
  const submit = () => button("确认提交", panel.getByRole("group", { name: "提交前核对", exact: true })).click();
  const handoff = button("确认纸单已交库房", panel);
  await expect(handoff).toHaveCount(0);
  await panel.getByLabel("提货人（实际来拿货的人，可不填）", { exact: true }).fill("测试提货人");
  await button("创建打印任务", panel).click();
  await submit();
  await expect(panel.getByText("打印任务已创建。请在打印中心完成实际打印，再交库房。", { exact: true })).toBeVisible();
  await expect(handoff).toHaveCount(0);
  const { printJob, printRecord } = paperPrint;
  assert.equal(printJob.documentType, "pickup_note");
  assert.equal(printJob.printDeviceId, "PRN-DOT-A");
  assert.equal(paperPrint.physicalPrintConfirmed, false);
  report.printJobId = printJob.printJobId;
  const readPrintJob = async () => (await api(`/print-jobs/${report.printJobId}`)).printJob;

  report.stage = "print-dispatch";
  await button("打印与设备").click();
  await expect(page).toHaveURL(/#print-devices$/u);
  await selectRow("打印与设备", report.printJobId, "pickup_note");
  await button("查看打印作业详情").click();
  const dialog = page.getByRole("dialog", { name: "打印作业详情", exact: true });
  await dialog.getByLabel("操作说明", { exact: true }).fill("隔离测试派发，干跑不出纸");
  await dialog.getByRole("checkbox").check();
  await button("确认派发", dialog).click();
  await expect(dialog.getByText("已提交派发，完成状态以设备回执为准。", { exact: true })).toBeVisible();
  const dispatched = await readPrintJob();
  assert.equal(dispatched.jobStatus, "sent");
  assert.equal(dispatched.metadata.lastDispatch.externalJobId, `DRY-${report.printJobId}`);
  assert.equal((await readFulfillment()).paperOutboundDocument.status, "待打印确认");

  report.stage = "simulated-printer-receipt";
  const driverToken = await login("U-PRINT-DRIVER-A");
  const receipt = await api(`/print-jobs/${report.printJobId}/poll-status`, {
    body: { reason: "隔离测试驱动模拟完成，不代表物理出纸" }, token: driverToken,
  });
  assert.equal(receipt.afterStatus, "printed");
  await button("刷新作业", dialog).click();
  await expect(dialog.getByText("设备回执已完成", { exact: true })).toBeVisible();
  await screenshot("02-print-receipt");
  const printed = await readPrintJob();
  assert.equal(printed.jobStatus, "printed");
  const template = (printed.payloadSnapshot ?? printed.payload).printTemplate;
  const documentDate = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Shanghai", dateStyle: "short" }).format(new Date(printRecord.createdAt));
  assert.equal(template.fields.documentDateText, documentDate);
  report.paper = await verifyPickupPdf(template, documentDate);
  await button("返回列表", dialog).click();

  report.stage = "paper-handoff-and-warehouse";
  await button("出库交付").click();
  await selectRow("出库交付", report.fulfillmentId, report.orderLineId);
  await expect(handoff).toBeVisible();
  await screenshot("03-paper-ready-for-warehouse");
  await handoff.click();
  await submit();
  await expect(panel.getByText("纸单交库房已保存。", { exact: true })).toBeVisible();
  assert.equal((await readFulfillment()).paperOutboundDocument.status, "已交库房");
  await panel.getByLabel("执行人").selectOption(executor.id);
  await panel.getByLabel("执行结果").selectOption("实物已出库");
  await panel.getByLabel("实际数量", { exact: true }).fill(String(stockQty));
  await panel.getByLabel("说明", { exact: true }).fill("隔离测试核对数量，没有真实货物出库");
  await button("核对执行结果", panel).click();
  await submit();
  await expect(panel.getByText("登记库房执行已保存。", { exact: true })).toBeVisible();
  await readStock("afterOutbound", 500, 0);
  const outbound = await readFulfillment();
  assert.equal(outbound.actualQty, stockQty);
  assert.equal(outbound.physicalExecutorEmployeeId, executor.id);
  assert.ok(Number.isFinite(Date.parse(outbound.physicalOutboundAt)));
  await expect(button("登记 / 更正实物包裹", panel)).toHaveCount(0);
  await expect(page.getByRole("table", { name: "出库交付列表", exact: true })).toContainText("包数未登记");
  await screenshot("04-warehouse-outbound");

  report.stage = "complete-pickup";
  await button("核对客户提货", panel).click();
  await submit();
  await expect(panel.getByText("本次交付已结束，保留现有出库与签收记录供核对。", { exact: true })).toBeVisible();
  const completed = await readFulfillment();
  assert.equal(completed.status, "已交付");
  assert.equal(completed.actualQty, stockQty);
  assert.equal(completed.packages, "包数未登记");
  assert.equal(completed.actualPackageCount, 0);
  assert.equal(completed.physicalOutboundAt, outbound.physicalOutboundAt);
  assert.ok(Date.parse(completed.finalDeliveryAt) >= Date.parse(outbound.physicalOutboundAt));
  await readStock("afterPickup", 500, 0);
  assert.deepEqual(report.pageErrors, []);
  report.finalStatus = completed.status;
  report.physicalOutboundAt = completed.physicalOutboundAt;
  report.finalDeliveryAt = completed.finalDeliveryAt;
  await screenshot("05-pickup-complete");
  report.status = "passed";
} catch (error) {
  report.status = "failed";
  report.error = error.message;
  await page?.screenshot({ path: join(output, "failure.png"), fullPage: true }).catch(() => {});
  throw error;
} finally {
  try {
    await writeFile(join(output, "result.json"), JSON.stringify(report, null, 2) + "\n");
  } finally {
    try {
      await browser?.close();
    } finally {
      try {
        await closeTestServer(server, { forceAfterMs: 1000 });
      } finally {
        await rm(storage, { recursive: true, force: true });
      }
    }
  }
}

async function verifyPickupPdf(template, documentDate) {
  const pdfBytes = await buildFulfillmentNotePdf(template);
  const loading = getDocument({ data: Uint8Array.from(pdfBytes) });
  try {
    const pdf = await loading.promise;
    assert.equal(pdf.numPages, 1);
    const page = await pdf.getPage(1);
    const text = (await page.getTextContent()).items.map(item => item.str).join("").replace(/\s/gu, "");
    assert.match(text, /自提单/u);
    assert.match(text, /客户名称：黄松/u);
    assert.match(text, /提货人：测试提货人/u);
    assert.ok(text.includes(`日期：${documentDate}`), "the pickup PDF must print the Beijing issue date");
    assert.match(text, /空白袋30\*37\*10红色5005000\.34170\.00/u, "one row must show the matching SKU, shipped and chargeable quantities and correct amount");
    assert.match(text, /壹佰柒拾元整500500¥170\.00/u, "the PDF totals must agree with the row");
    await writeFile(join(output, "pickup-note.pdf"), pdfBytes);
    return { documentDate, quantity: stockQty, amount: quotedAmount };
  } finally {
    await loading.destroy();
  }
}

console.log(`Desktop stock pickup passed: recognized 3037, reserved and issued 500 once, completed pickup, and verified the dated ¥170 PDF. Evidence: ${output}`);
