import { expect, test } from "@playwright/test";

const apiBaseUrl = `http://127.0.0.1:${process.env.ERP_E2E_API_PORT ?? 18787}/api`;
const operatorId = "U-MANAGER-A";
const printDriverOperatorId = "U-PRINT-DRIVER-A";
const customerName = "张三服饰";
const orderText = `${customerName}，30*38*10红色空白袋10个，普通提，自提，明天下午`;

test("订单确认到收款凭证形成可追溯闭环", async ({ page, request }) => {
  const browserErrors = [];
  page.on("console", (message) => {
    if (message.type() === "error") browserErrors.push(message.text());
  });
  page.on("pageerror", (error) => browserErrors.push(error.message));

  await page.goto("/");
  const accountSwitcher = page.getByRole("combobox", { name: "切换当前账号" });
  if (await accountSwitcher.count()) {
    await accountSwitcher.selectOption(operatorId);
    await expect(accountSwitcher).toHaveValue(operatorId);
  }
  const mainNavigation = page.getByRole("navigation", { name: "主导航" });
  await mainNavigation.getByRole("button", { name: /订单录入/ }).click();
  await expect(page.getByRole("heading", { name: "订单录入" })).toBeVisible();

  await page.getByRole("textbox", { name: "订单原文" }).fill(orderText);
  await page.getByRole("button", { name: "识别", exact: true }).click();
  await expect(page.getByText("可保存确认", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "保存并确认", exact: true }).click();
  await expect(page.getByText("订单已由后端确认", { exact: false })).toBeVisible();
  await expect(page.getByRole("heading", { name: "订单池" })).toBeVisible();

  const orderLinesAfterConfirmation = await apiGet(request, "/order-lines?page=1&pageSize=200");
  const createdLine = orderLinesAfterConfirmation.items.find((item) =>
    item.customerId === "C001" && Number(item.qty) === 10,
  );
  expect(createdLine, "后端订单池应包含刚确认的 10 个自提订单").toBeTruthy();
  expect(["pickup", "自提"]).toContain(createdLine.fulfillmentMethod);

  const inventoriesAfterConfirmation = await apiGet(request, "/inventory/items?page=1&pageSize=200");
  const reservedInventory = inventoriesAfterConfirmation.items.find((item) =>
    item.size === "30*38*10" && item.color === "红色" && item.handle === "普通提" && item.style === "空白袋",
  );
  expect(Number(reservedInventory?.reserved ?? reservedInventory?.reservedQty ?? 0)).toBeGreaterThanOrEqual(10);

  await mainNavigation.getByRole("button", { name: /出库交付/ }).click();
  await expect(page.getByRole("heading", { name: "出库交付" })).toBeVisible();
  await page.getByRole("tab", { name: "自提", exact: true }).click();

  const createdFulfillment = await waitForApiItem(request, "/fulfillments?page=1&pageSize=200", (item) =>
    item.lineId === createdLine.id || item.orderLineId === createdLine.id,
  );
  await page.getByRole("button", { name: /自提 张三服饰 .* 10个 10 1包/ }).click();
  await expect(page.getByText(createdLine.id, { exact: false })).toBeVisible();
  await page.getByRole("button", { name: "完成自提", exact: true }).click();
  await expect(page.getByText("已通过后端 API记录完成自提", { exact: false })).toBeVisible();

  const completedFulfillment = await waitForApiItem(request, "/fulfillments?page=1&pageSize=200", (item) =>
    item.id === createdFulfillment.id && item.status === "已交付",
  );
  expect(completedFulfillment.status).toBe("已交付");

  await mainNavigation.getByRole("button", { name: /对账收款/ }).click();
  await expect(page.getByRole("heading", { name: "对账收款" })).toBeVisible();
  await page.getByPlaceholder("客户名 / 单号 / 联系人").fill(customerName);
  await page.getByRole("button", { name: customerName, exact: false }).first().click();
  await expect(page.getByText(createdLine.id, { exact: false })).toBeVisible();

  await page.getByRole("button", { name: "登记实收", exact: true }).click();
  const paymentDialog = page.getByRole("dialog", { name: "登记实收" });
  await expect(paymentDialog).toBeVisible();
  await paymentDialog.locator('input[type="file"]').setInputFiles({
    name: "e2e-payment-proof.png",
    mimeType: "image/png",
    buffer: createOnePixelPng(),
  });
  await paymentDialog.getByRole("button", { name: "确认提交", exact: true }).click();
  await expect(page.getByText("付款截图已通过后端 API登记", { exact: false })).toBeVisible();
  await expect(page.getByText("e2e-payment-proof.png", { exact: true })).toBeVisible();

  const statementCustomers = await apiGet(request, "/statements/customers?page=1&pageSize=200");
  const customerStatement = statementCustomers.items.find((item) => item.customerId === "C001");
  expect(customerStatement?.statementId, "交付后应存在张三服饰对账单").toBeTruthy();
  const statementDetail = await apiGet(request, `/statements/${encodeURIComponent(customerStatement.statementId)}`);
  expect(statementDetail.lineIds).toContain(createdLine.id);
  const paymentAttachments = await apiGet(
    request,
    `/attachments?ownerType=statement&ownerId=${encodeURIComponent(customerStatement.statementId)}&purpose=payment_screenshot`,
  );
  expect(paymentAttachments.items.some((file) => file.fileName === "e2e-payment-proof.png")).toBe(true);

  expect(browserErrors, `浏览器控制台不应出现错误：\n${browserErrors.join("\n")}`).toEqual([]);
});

test("定制印刷订单经生产打包、可信打印和快运拉走后进入对账", async ({ page, request }) => {
  const browserErrors = [];
  page.on("console", (message) => {
    if (message.type() === "error") browserErrors.push(message.text());
  });
  page.on("pageerror", (error) => browserErrors.push(error.message));

  await page.goto("/");
  await switchAccount(page, operatorId);
  const mainNavigation = page.getByRole("navigation", { name: "主导航" });
  await mainNavigation.getByRole("button", { name: /订单录入/ }).click();

  await page.getByRole("textbox", { name: "订单原文" }).fill(
    "美的空调 30*38*10 白印黑 白袋黑提 单面 12个 普通提 明天下午快运",
  );
  await page.getByRole("button", { name: "识别", exact: true }).click();
  await expect(page.getByText("白印黑 / 白袋黑提", { exact: true })).toBeVisible();
  await page.getByLabel("印刷图/稿件").selectOption("已上传");
  await expect(page.getByText("可保存前需复核库存/时间", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "保存并确认", exact: true }).click();
  await expect(page.getByRole("heading", { name: "订单池" })).toBeVisible();

  const createdLine = await waitForApiItem(request, "/order-lines?page=1&pageSize=200", (item) =>
    item.customerId === "C004" && Number(item.qty) === 12 && item.printFlag === true,
  );
  expect(["express_ltl", "快递快运"]).toContain(createdLine.fulfillmentMethod);
  expect(createdLine.bagColor ?? createdLine.color).toBe("白色");
  expect(createdLine.printColor).toBe("黑色");
  expect(createdLine.handleColor).toBe("黑色");
  expect(createdLine.printSide).toBe("单面");

  const productionTask = await waitForApiItem(request, "/production-tasks?page=1&pageSize=200", (item) =>
    item.orderLineId === createdLine.id,
  );
  const productionTaskId = productionTask.productionTaskId;
  const inventoryBeforeReport = await findInventoryItem(request, createdLine);
  const inStockBeforeReport = Number(inventoryBeforeReport.inStock ?? 0);
  const reservedBeforeReport = Number(inventoryBeforeReport.reserved ?? inventoryBeforeReport.reservedQty ?? 0);

  await mainNavigation.getByRole("button", { name: /打包\/标签/ }).click();
  await selectWorkbenchTabIfPresent(page, "生产任务");
  await page.getByRole("button", { name: new RegExp(productionTaskId) }).click();
  await page.getByRole("button", { name: "上传成品图", exact: true }).click();
  await expect(page.getByText("上传成品图附件", { exact: false })).toBeVisible();

  let productionDetail = await waitForApiDetail(
    request,
    `/production-tasks/${encodeURIComponent(productionTaskId)}`,
    (detail) => detail.finishedGoodsPhoto?.status === "待确认",
  );
  expect(productionDetail.finishedGoodsPhoto.attachmentId).toBeTruthy();
  const finishedGoodsAttachments = await apiGet(
    request,
    `/attachments?ownerType=production_task&ownerId=${encodeURIComponent(productionTaskId)}&purpose=finished_goods_photo`,
  );
  expect(finishedGoodsAttachments.items.some((item) =>
    item.attachmentId === productionDetail.finishedGoodsPhoto.attachmentId,
  )).toBe(true);

  await page.getByRole("button", { name: "确认成品图", exact: true }).click();
  await expect(page.getByText("确认成品图", { exact: false })).toBeVisible();
  productionDetail = await waitForApiDetail(
    request,
    `/production-tasks/${encodeURIComponent(productionTaskId)}`,
    (detail) => detail.finishedGoodsPhoto?.status === "已接受",
  );
  expect(productionDetail.finishedGoodsPhoto.reviewedBy).toBe(operatorId);

  await page.getByLabel("合格数量").fill("12");
  await page.getByLabel("异常/废品数").fill("2");
  await page.getByLabel("机器计数/动作次数").fill("9876");
  await page.getByRole("button", { name: /^(提交合格数量|报工完成)$/ }).first().click();
  await expect(page.getByText("完成生产报工", { exact: false })).toBeVisible();

  productionDetail = await waitForApiDetail(
    request,
    `/production-tasks/${encodeURIComponent(productionTaskId)}`,
    (detail) => detail.productionTask?.status === "已完成",
  );
  expect(Number(productionDetail.latestReport?.qualifiedQty)).toBe(12);
  expect(Number(productionDetail.latestReport?.exceptionQty)).toBe(2);
  expect(Number(productionDetail.latestReport?.machineCount)).toBe(9876);
  const packingTaskId = productionDetail.packingTask?.packingTaskId;
  expect(packingTaskId).toBeTruthy();

  const inventoryAfterReport = await findInventoryItem(request, createdLine);
  expect(Number(inventoryAfterReport.inStock)).toBe(inStockBeforeReport + 12);
  expect(Number(inventoryAfterReport.reserved ?? inventoryAfterReport.reservedQty ?? 0)).toBe(reservedBeforeReport + 12);

  await selectWorkbenchTabIfPresent(page, "打包任务");
  await page.getByRole("button", { name: new RegExp(packingTaskId) }).click();
  await page.getByLabel("实际打包数量").fill("12");
  await page.getByLabel("包裹数").fill("2");
  await page.getByLabel("标签状态").selectOption("未打印");
  await page.getByRole("button", { name: "提交打包完成", exact: true }).click();
  await expect(page.getByText("提交打包完成", { exact: false })).toBeVisible();

  const packingDetail = await waitForApiDetail(
    request,
    `/packing-tasks/${encodeURIComponent(packingTaskId)}`,
    (detail) => detail.packingTask?.status === "已完成",
  );
  expect(packingDetail.packages).toHaveLength(2);
  expect(Number(packingDetail.packingTask.actualPackedQty)).toBe(12);
  const fulfillmentId = packingDetail.fulfillment?.fulfillmentId;
  expect(fulfillmentId).toBeTruthy();
  let fulfillment = await waitForApiItem(request, "/fulfillments?page=1&pageSize=200", (item) =>
    item.fulfillmentId === fulfillmentId && item.status === "待打印标签",
  );
  expect(fulfillment.printed).not.toBe(true);
  const inventoryAfterPacking = await findInventoryItem(request, createdLine);
  expect(Number(inventoryAfterPacking.inStock)).toBe(inStockBeforeReport + 12);

  await selectWorkbenchTabIfPresent(page, "打印与设备");
  const printerDeviceQa = page.locator(".printer-device-qa-section");
  await printerDeviceQa.locator(".printer-device-qa-select-row select").selectOption("PRN-LABEL-A");
  await printerDeviceQa.getByLabel("目标模式").selectOption("system_printer");
  await page.getByRole("button", { name: "保存设备模式", exact: true }).click();
  await expect(page.getByText("设备模式已通过后端 API 保存", { exact: false })).toBeVisible();

  await mainNavigation.getByRole("button", { name: /出库交付/ }).click();
  await page.getByRole("tab", { name: "快递快运", exact: true }).click();
  await page.getByText(createdLine.id, { exact: false }).click();
  await page.getByRole("button", { name: "打印标签", exact: true }).click();
  const printDialog = page.getByRole("dialog", { name: "单据 / 标签预览" });
  await expect(printDialog).toBeVisible();
  await printDialog.getByRole("button", { name: "确认提交", exact: true }).click();
  await expect(page.getByText("打印作业已创建", { exact: false })).toBeVisible();

  let printJob = await waitForApiItem(request, "/print-jobs?page=1&pageSize=200", (item) =>
    item.targetId === fulfillmentId && item.jobStatus === "queued",
  );
  expect(printJob.printDeviceId).toBe("PRN-LABEL-A");
  expect(printJob.driverMode).toBe("system_printer");

  await mainNavigation.getByRole("button", { name: /打包\/标签/ }).click();
  await selectWorkbenchTabIfPresent(page, "打印与设备");
  const printJobRow = page.locator(".print-job-row").filter({ hasText: printJob.printJobId });
  await printJobRow.getByRole("button", { name: "派发", exact: true }).click();
  await expect(page.getByText(`打印作业 ${printJob.printJobId} 已派发`, { exact: false })).toBeVisible();
  const dispatchedPrintJobDetail = await waitForApiDetail(
    request,
    `/print-jobs/${encodeURIComponent(printJob.printJobId)}`,
    (detail) => detail.printJob?.jobStatus === "sent",
  );
  printJob = dispatchedPrintJobDetail.printJob;
  const externalJobId = printJob.metadata?.lastDispatch?.externalJobId;
  expect(externalJobId).toBe(`DRY-${printJob.printJobId}`);

  const warehouseCallback = await apiPost(
    request,
    `/print-jobs/${encodeURIComponent(printJob.printJobId)}/driver-status`,
    { status: "printed", externalJobId },
    "U-WAREHOUSE-A",
    403,
  );
  expect(warehouseCallback.requiredPermission).toBe("print.job.callback");

  const callbackResult = await apiPost(
    request,
    `/print-jobs/${encodeURIComponent(printJob.printJobId)}/driver-status`,
    {
      status: "printed",
      externalJobId,
      adapterName: "e2e-dry-run-driver",
      eventSource: "driver_callback",
      driverStatus: "completed",
      message: "D44 isolated trusted print callback",
      idempotencyKey: `D44-${printJob.printJobId}-printed`,
    },
    printDriverOperatorId,
  );
  expect(callbackResult.printJob.jobStatus).toBe("printed");
  expect(callbackResult.physicalPrintConfirmed).toBe(true);

  fulfillment = await waitForApiItem(request, "/fulfillments?page=1&pageSize=200", (item) =>
    item.fulfillmentId === fulfillmentId && item.status === "待确认拉走",
  );
  await page.reload();
  await switchAccount(page, operatorId);
  const refreshedNavigation = page.getByRole("navigation", { name: "主导航" });
  await refreshedNavigation.getByRole("button", { name: /出库交付/ }).click();
  await page.getByRole("tab", { name: "快递快运", exact: true }).click();
  await page.getByText(createdLine.id, { exact: false }).click();
  await page.getByRole("button", { name: "确认已拉走", exact: true }).click();
  await expect(page.getByText("已通过后端 API记录确认已拉走", { exact: false })).toBeVisible();

  fulfillment = await waitForApiItem(request, "/fulfillments?page=1&pageSize=200", (item) =>
    item.fulfillmentId === fulfillmentId && item.status === "已交付",
  );
  expect(fulfillment.actualQty).toBe(12);
  const inventoryAfterFulfillment = await findInventoryItem(request, createdLine);
  expect(Number(inventoryAfterFulfillment.inStock)).toBe(inStockBeforeReport);
  expect(Number(inventoryAfterFulfillment.reserved ?? inventoryAfterFulfillment.reservedQty ?? 0)).toBe(reservedBeforeReport);

  const statementCustomers = await apiGet(request, "/statements/customers?page=1&pageSize=200");
  const customerStatement = statementCustomers.items.find((item) => item.customerId === "C004");
  expect(customerStatement?.statementId).toBeTruthy();
  const statementDetail = await apiGet(request, `/statements/${encodeURIComponent(customerStatement.statementId)}`);
  expect(statementDetail.lineIds).toContain(createdLine.id);
  expect(browserErrors, `浏览器控制台不应出现错误：\n${browserErrors.join("\n")}`).toEqual([]);
});

async function apiGet(request, path, currentOperatorId = operatorId) {
  const response = await request.get(`${apiBaseUrl}${path}`, {
    headers: { "x-erp-user-id": currentOperatorId },
  });
  expect(response.ok(), `${path} 应返回成功，实际 ${response.status()}`).toBe(true);
  return response.json();
}

async function apiPost(request, path, data, currentOperatorId = operatorId, expectedStatus = 200) {
  const response = await request.post(`${apiBaseUrl}${path}`, {
    data,
    headers: { "x-erp-user-id": currentOperatorId },
  });
  expect(response.status(), `${path} 应返回 ${expectedStatus}`).toBe(expectedStatus);
  return response.json();
}

async function waitForApiItem(request, path, predicate) {
  let matched = null;
  await expect.poll(async () => {
    const payload = await apiGet(request, path);
    matched = payload.items.find(predicate) ?? null;
    return Boolean(matched);
  }).toBe(true);
  return matched;
}

async function waitForApiDetail(request, path, predicate) {
  let detail = null;
  await expect.poll(async () => {
    detail = await apiGet(request, path);
    return predicate(detail);
  }).toBe(true);
  return detail;
}

async function findInventoryItem(request, line) {
  const payload = await apiGet(request, "/inventory/items?page=1&pageSize=200");
  const item = payload.items.find((inventory) =>
    inventory.size === line.size &&
    inventory.color === (line.bagColor ?? line.color) &&
    inventory.handle === line.handle &&
    inventory.style === line.style,
  );
  expect(item, `应找到 ${line.size} / ${line.bagColor ?? line.color} 的成品库存键`).toBeTruthy();
  return item;
}

async function switchAccount(page, userId) {
  const accountSwitcher = page.getByRole("combobox", { name: "切换当前账号" });
  if (await accountSwitcher.count()) {
    await accountSwitcher.selectOption(userId);
    await expect(accountSwitcher).toHaveValue(userId);
  }
}

async function selectWorkbenchTabIfPresent(page, name) {
  const tab = page.getByRole("tab", { name, exact: true });
  if (await tab.count()) await tab.click();
}

function createOnePixelPng() {
  return Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
    "base64",
  );
}
