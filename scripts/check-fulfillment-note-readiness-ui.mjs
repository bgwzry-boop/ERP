import assert from "node:assert/strict";
import { chromium } from "playwright";
import { createFulfillmentReadProjectionService } from "../server/services/fulfillmentReadProjectionService.mjs";

// Exercise the real 4174 desktop shell with read-only synthetic business facts.
const stock = { id: "L-STOCK", customerId: "C-STOCK", customerName: "现货客户", orderType: "stock", inventory: "已占用", status: "待出库", qty: 500 };
const partial = { id: "L-PART", customerId: "C-PART", customerName: "分批客户", orderType: "custom_special", status: "制袋中", qty: 1000 };
const printing = { id: "L-PRINT", customerId: "C-PRINT", customerName: "在印客户", orderType: "custom_print", status: "丝印中", qty: 1500 };
const orderLines = [stock, partial, printing].map(line => ({ ...line, size: "30*37*10", color: "红色", printFlag: line === printing }));
function shipment(id, line, expectedQty, actualQty) {
  return { id, orderLineId: line.id, customerId: line.customerId, qty: expectedQty, actualQty, method: "送货", status: "待出库", revision: 1 };
}
const workspace = {
  orderLines,
  customers: orderLines.map(line => ({ id: line.customerId, name: line.customerName })),
  fulfillments: [shipment("F-PRINT", printing, 1500, null), shipment("F-STOCK", stock, 500, null),
    shipment("F-READY", partial, 500, 400), shipment("F-REST", partial, 600, null)],
  productionTasks: [
    { id: "PT1", orderLineId: printing.id, taskType: "丝印", taskStatus: "丝印中" },
    { id: "PT2", orderLineId: partial.id, taskType: "制袋", taskStatus: "已完成" },
    { id: "PT3", orderLineId: partial.id, taskType: "制袋", taskStatus: "制袋中" },
  ],
  workshopReports: [{ orderLineId: partial.id, productionTaskId: "PT2", processType: "制袋", completedAt: "2026-11-13T08:00:00Z", qualifiedQty: 400 }],
  packingTasks: [{ id: "PKT1", orderLineId: partial.id, status: "已完成", actualPackedQty: 400 }],
  packages: [{ id: "PKG1", fulfillmentId: "F-READY", orderLineId: partial.id, packedQty: 400 }],
};
const { items: shipments } = createFulfillmentReadProjectionService().listFulfillments({ workspace });
function updatePaper(status) {
  workspace.paperOutboundDocuments = [{ id: "DOC-STOCK", printRecordId: "PR-STOCK", fulfillmentId: "F-STOCK", documentType: "delivery_note", documentVersion: 1, status }];
  const recordStatus = status === "已作废" ? "voided" : status === "待打印确认" ? "requested" : "printed";
  workspace.printRecords = [{ id: "PR-STOCK", targetType: "fulfillment", targetId: "F-STOCK", documentType: "delivery_note", status: recordStatus }];
  return createFulfillmentReadProjectionService().listFulfillments({ workspace }).items;
}
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  const collections = new Map([["/api/order-lines", orderLines], ["/api/fulfillments", shipments]]);
  await page.route("**/api/**", route => {
    const request = route.request();
    const url = new URL(request.url());
    if (!["GET", "HEAD", "OPTIONS"].includes(request.method()) && url.pathname !== "/api/auth/prototype-login") {
      errors.push(`unexpected business write: ${url.pathname}`);
      return route.abort();
    }
    const items = collections.get(url.pathname);
    if (items) return route.fulfill({ json: { items, total: items.length, page: 1, pageSize: Number(url.searchParams.get("pageSize") || 50) } });
    return route.continue();
  });
  await page.goto("http://127.0.0.1:4174/?erpViewport=desktop#today");
  await page.getByRole("tab", { name: /待打送货单\s*2/ }).click();
  const todayRows = page.locator(".today-row");
  assert.equal(await todayRows.count(), 2);
  const readyRow = todayRows.filter({ hasText: "400个" });
  await readyRow.getByRole("button", { name: "去打单" }).waitFor();
  assert.equal(await todayRows.filter({ hasText: "500个" }).count(), 1);
  assert.equal(await todayRows.filter({ hasText: /1500个|600个/ }).count(), 0);
  await readyRow.getByRole("button", { name: "去打单" }).click();

  const table = page.getByRole("table", { name: "出库交付列表" });
  await table.waitFor();
  const active = table.locator('[aria-pressed="true"]');
  await active.filter({ hasText: partial.id }).waitFor();
  const paper = page.getByRole("group", { name: "纸质出库单", exact: true });
  const create = paper.getByRole("button", { name: "创建打印任务" });
  async function checkCanStart() {
    await create.click();
    const confirm = page.getByRole("group", { name: "提交前核对" });
    await confirm.getByText("创建出库单打印任务").waitFor();
    await confirm.getByRole("button", { name: "返回修改" }).click();
  }
  await checkCanStart();
  await table.getByRole("row").filter({ hasText: stock.id }).click();
  await checkCanStart();

  // Select the other (unpacked) batch on the same order line first, then the printing order.
  await table.getByRole("row").filter({ hasText: partial.id }).filter({ hasText: "待打包" }).click();
  await paper.getByText("请先完成本批打包，确认实际数量。").waitFor();
  assert.equal(await paper.getByRole("button").count(), 0);
  await table.getByRole("row").filter({ hasText: printing.id }).click();
  await paper.getByText("请先完成本批制袋报工。").waitFor();
  assert.equal(await paper.getByRole("button").count(), 0);
  await table.getByRole("row").filter({ hasText: stock.id }).click();
  for (const status of ["待打印确认", "已打印待交库房", "已交库房", "已作废"]) {
    collections.set("/api/fulfillments", updatePaper(status));
    await page.getByLabel("刷新当前工作台").click();
    await paper.getByText(`当前：${status === "已作废" ? "已作废待重打" : status}。`).waitFor();
    assert.equal(await create.count(), 0);
    if (status === "待打印确认") await paper.getByRole("button", { name: "打印纸单并确认" }).waitFor();
    if (status === "已作废") await paper.getByRole("button", { name: "重新打印纸单" }).waitFor();
    if (status === "已打印待交库房" || status === "已交库房") {
      assert.equal(await paper.getByRole("button").count(), 0);
      await page.getByRole("button", { name: "作废重打…" }).waitFor();
    }
  }
  assert.deepEqual(errors, []);
  console.log("PASS 4174 今天与发货安排：在印单与分批余货拦截，完成批次和现货进入核对，已有纸单各状态不重复建单。无业务写入。");
} finally {
  await browser.close();
}
