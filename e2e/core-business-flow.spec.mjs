import { expect, test } from "@playwright/test";
import { openInternalWorkbench } from "./helpers/openInternalWorkbench.mjs";

const apiBaseUrl = `http://127.0.0.1:${process.env.ERP_E2E_API_PORT ?? 18787}/api`;
const operatorId = "U-MANAGER-A";
const officeOperatorId = "U-OFFICE-A";
const printDriverOperatorId = "U-PRINT-DRIVER-A";
const warehousePhysicalExecutorEmployeeId = "E2E-WAREHOUSE-001";
const customerName = "张三服饰";
const orderText = `${customerName}，30*38*10红色空白袋10个，普通提，自提，明天下午`;
const dangerOrderText = `${customerName}，30*38*10红色空白袋11个，普通提，自提，明天下午`;

test.beforeAll(async ({ request }) => {
  for (const decisionScope of ["order_priority", "production_schedule", "raw_material_purchase", "fulfillment_quantity_variance", "statement_variance", "statement_write_off"]) {
    await ensureBusinessAuthorization(request, {
      employeeId: "E2E-MANAGER-001",
      decisionScope,
      idempotencyKey: `e2e-manager-authorization-${decisionScope}`,
      note: "E2E 管理账号直接决定授权",
    });
  }
});

test("原材料手机四步流程图标一致且逐卷贴标支持无序确认", async ({ page }) => {
  const browserErrors = [];
  page.on("console", (message) => {
    if (message.type() === "error") browserErrors.push(message.text());
  });
  page.on("pageerror", (error) => browserErrors.push(error.message));

  await page.setViewportSize({ width: 390, height: 844 });
  await openInternalWorkbench(page);
  await switchAccount(page, officeOperatorId);

  await expect(page.getByRole("heading", { name: "录原材料", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "进入原材料录入", exact: true })).toHaveCount(0);
  const progress = page.getByRole("list", { name: "原材料收货进度" });
  const expectedSteps = [
    ["拍单", "camera"],
    ["核对", "check-circle"],
    ["打印", "printer"],
    ["贴标", "tag"],
  ];
  await expect(progress.locator("li")).toHaveCount(expectedSteps.length);
  for (const [index, [label, iconName]] of expectedSteps.entries()) {
    const step = progress.locator("li").nth(index);
    await expect(step.getByText(label, { exact: true })).toBeVisible();
    await expect(step.locator("svg")).toHaveAttribute("data-icon", iconName);
    await expect(step.locator(".anticon")).toHaveAttribute("aria-hidden", "true");
    await expect(step.getByRole("img")).toHaveCount(0);
  }

  await page.getByText(/其他 \d+ 单/, { exact: true }).click();
  const pendingLabels = page.getByRole("button", { name: /继续贴标/ }).first();
  await expect(pendingLabels).toBeEnabled();
  await pendingLabels.click();

  const labelVerification = page.getByRole("region", { name: "逐卷无序贴标" });
  await expect(labelVerification.getByRole("button", { name: /一键确认 \d+ 卷已贴/ })).toBeVisible();
  const confirmRoll = labelVerification.getByRole("button", { name: "确认已贴", exact: true }).first();
  const mismatchRoll = labelVerification.getByRole("button", { name: "标签/实物不符", exact: true }).first();
  await expect(confirmRoll).toBeVisible();
  await expect(mismatchRoll).toBeVisible();
  await expect(confirmRoll.locator("svg")).toHaveAttribute("data-icon", "check-circle");
  await expect(confirmRoll.locator(".anticon")).toHaveAttribute("aria-hidden", "true");
  for (const width of [360, 390, 412, 600]) {
    await page.setViewportSize({ width, height: 900 });
    await expect(page.getByRole("heading", { name: "录原材料", exact: true })).toBeVisible();
    await expect(progress).toBeVisible();
    await expect(confirmRoll).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);

    for (const control of [confirmRoll, mismatchRoll]) {
      expect((await control.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
    }
  }
  expect(browserErrors, `浏览器控制台不应出现错误：\n${browserErrors.join("\n")}`).toEqual([]);
});

test("原材料 OCR 核对页首屏概览全部卷料并按行展开编辑", async ({ page }) => {
  const browserErrors = [];
  page.on("console", (message) => {
    if (message.type() === "error") browserErrors.push(message.text());
  });
  page.on("pageerror", (error) => browserErrors.push(error.message));

  await page.setViewportSize({ width: 1280, height: 844 });
  await openInternalWorkbench(page);
  await switchAccount(page, officeOperatorId);
  await navigateToPage(page, "原材料", "更多工作台");
  await page.setViewportSize({ width: 390, height: 844 });

  let reviewAllRolls = page.getByRole("button", { name: "核对全部卷材", exact: true }).first();
  if (!(await reviewAllRolls.isVisible().catch(() => false))) {
    const otherInbounds = page.locator("details.raw-material-mobile-resume-more");
    await expect(otherInbounds).toBeVisible();
    await otherInbounds.locator("summary").click();
    await expect(otherInbounds).toHaveAttribute("open", "");
    reviewAllRolls = otherInbounds.getByRole("button", { name: /腾胜无纺布.*核对全部卷材/ });
  }
  await expect(reviewAllRolls).toBeVisible();
  await reviewAllRolls.click();
  const review = page.getByRole("region", { name: "全部卷料核对" });
  await expect(review.getByText("识别到 9 卷，共 853.8 kg", { exact: true })).toBeVisible();
  const lineSummaries = review.locator(".raw-material-mobile-review-line-summary");
  await expect(lineSummaries).toHaveCount(9);
  await expect(lineSummaries.nth(0).locator(".line-color")).toHaveText("颜色待补");
  await expect(lineSummaries.nth(0).locator(".line-spec")).toHaveText("78克*70宽*2000米");
  await expect(lineSummaries.nth(0).locator(".line-weight")).toHaveText("109.9 kg");
  await expect(lineSummaries.nth(6).locator(".line-spec")).toHaveText("65克*5宽");
  await expect(lineSummaries.nth(8).locator(".line-weight")).toHaveText("92 kg");
  await expect(review.getByRole("textbox", { name: "第 1 卷颜色", exact: true })).not.toBeVisible();
  await expect(review.getByLabel("供应商 OCR 复核值", { exact: true })).not.toBeVisible();
  await expect(review.getByRole("button", { name: "已确认 0/9 · 进入打印", exact: true })).toBeDisabled();

  const reviewedFactoryColors = ["本白", "本白", "本白", "枣红", "大红", "大红", "大红", "大红", "大红"];
  for (let index = 0; index < 9; index += 1) {
    await lineSummaries.nth(index).getByRole("button").click();
    if (index === 0) {
      await expect(review.getByRole("combobox", { name: "第 1 卷厂内标准色", exact: true })).toHaveValue("");
      await expect(review.getByRole("textbox", { name: "第 1 卷规格 / 宽幅", exact: true })).toHaveValue("78克*70宽*2000米");
      await expect(review.getByRole("spinbutton", { name: "第 1 卷本卷重量 kg", exact: true })).toHaveValue("109.9");
    }
    if (index === 6) {
      await expect(review.getByRole("textbox", { name: "第 7 卷规格 / 宽幅", exact: true })).toHaveValue("65*5");
    }
    await review.getByRole("combobox", { name: `第 ${index + 1} 卷厂内标准色`, exact: true }).selectOption(reviewedFactoryColors[index]);
    await review.getByRole("button", { name: "这卷正确", exact: true }).click();
  }
  const submitReview = review.getByRole("button", { name: "确认送货单（9/9）", exact: true });
  await expect(submitReview).toBeEnabled();

  const [reviewResponse] = await Promise.all([
    page.waitForResponse((response) => (
      response.request().method() === "POST"
      && response.url().includes("/raw-material-inbounds/RMI-260704-001/review")
    )),
    submitReview.click(),
  ]);
  expect(reviewResponse.ok()).toBe(true);

  await expect(review).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "录原材料", exact: true })).toBeVisible();
  const receivingProgress = page.getByRole("list", { name: "原材料收货进度" });
  await expect(receivingProgress.locator("li").filter({ hasText: "核对" })).toHaveClass(/done/);
  await expect(receivingProgress.locator("li").filter({ hasText: "打印" })).toHaveClass(/done/);
  await expect(receivingProgress.locator("li").filter({ hasText: "贴标" })).toHaveClass(/active/);
  const labelDeferred = page.getByRole("region", { name: "卷标待补打" });
  await expect(labelDeferred).toBeVisible();
  await expect(labelDeferred).toContainText("9 卷已保存，标签待补打");
  await expect(labelDeferred).toContainText("补打并贴标核对前不可领料");
  const labelDeferredBox = await labelDeferred.boundingBox();
  expect(labelDeferredBox?.y ?? Number.POSITIVE_INFINITY).toBeGreaterThanOrEqual(0);
  expect(labelDeferredBox?.y ?? Number.POSITIVE_INFINITY).toBeLessThan(844);

  for (const width of [360, 390, 412]) {
    await page.setViewportSize({ width, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
  }
  expect(browserErrors, `浏览器控制台不应出现错误：\n${browserErrors.join("\n")}`).toEqual([]);
});

test("司机送达写入必须经过可访问确认并可返回修改", async ({ page }) => {
  const browserErrors = [];
  page.on("console", (message) => {
    if (message.type() === "error") browserErrors.push(message.text());
  });
  page.on("pageerror", (error) => browserErrors.push(error.message));

  await page.route("**/api/driver/delivery-tasks**", async (route) => {
    if (route.request().method() !== "GET") return route.continue();
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        items: [{
          fulfillmentId: "F-E2E-DELIVERY-CONFIRM",
          driverTaskId: "DT-E2E-DELIVERY-CONFIRM",
          driverId: "U-DRIVER-A",
          orderLineId: "ORD-E2E-DELIVERY-01",
          customerName: "送达确认测试客户",
          address: "测试工业园 1 号",
          addressArea: "测试园区",
          deliveryNoteNo: "DN-E2E-DELIVERY-01",
          goodsSummary: "测试袋 100 个",
          packageSummary: "1包",
          packageCount: 1,
          qty: 100,
          expectedQty: 100,
          status: "配送中",
          watermarkedPhotoAttached: true,
          watermarkedPhotoAttachmentId: "ATT-E2E-WATERMARK",
          routeDate: "2026-09-02",
          routeNo: "R-E2E-01",
          routeSequence: 1,
        }],
        total: 1,
      }),
    });
  });

  await page.setViewportSize({ width: 390, height: 844 });
  await openInternalWorkbench(page);
  await switchAccount(page, "U-DRIVER-A");

  const mobileNavigation = page.getByRole("navigation", { name: "司机手机导航" });
  await mobileNavigation.getByRole("button", { name: /待处理/ }).click();
  const statusTabs = page.getByRole("tablist", { name: "司机任务状态" });
  await statusTabs.getByRole("tab", { name: "配送中", exact: true }).click();
  const taskList = page.getByRole("region", { name: "司机送货任务列表" });
  await taskList.getByRole("button", { name: /送达确认测试客户/ }).click();

  const detailTabs = page.getByRole("tablist", { name: "司机任务详情" });
  await detailTabs.getByRole("tab", { name: "送达", exact: true }).click();
  const submit = page.getByRole("button", { name: "提交送达", exact: true });
  await expect(submit).toBeEnabled();
  await submit.click();

  const confirmation = page.getByRole("region", { name: "确认提交送达" });
  await expect(confirmation).toBeVisible();
  await expect(confirmation).toBeFocused();
  await expect(confirmation).toHaveAttribute("aria-live", "assertive");
  await expect(confirmation).toContainText("实际数量100 个");
  await expect(confirmation).toContainText("水印照片已准备");
  await expect(confirmation).toContainText("任务将标记为已完成");
  await expect(confirmation.getByRole("button", { name: "确认提交送达", exact: true })).toBeVisible();

  await confirmation.press("Escape");
  await expect(confirmation).toHaveCount(0);
  await expect(page.getByRole("spinbutton", { name: "实际数量" })).toHaveValue("100");
  await expect(submit).toBeFocused();
  expect(browserErrors, `浏览器控制台不应出现错误：\n${browserErrors.join("\n")}`).toEqual([]);
});

test("默认公共待办引用真实业务并可打开保存草稿", async ({ page, request }) => {
  const browserErrors = [];
  page.on("console", (message) => {
    if (message.type() === "error") browserErrors.push(message.text());
  });
  page.on("pageerror", (error) => browserErrors.push(error.message));

  await openInternalWorkbench(page);
  await switchAccount(page, operatorId);
  const todoResponse = await apiGet(request, "/todos?status=open&pageSize=200");
  expect(todoResponse.items).toHaveLength(8);
  expect(todoResponse.items.every((item) => item.referenceStatus === "valid")).toBe(true);
  expect(todoResponse.items.find((item) => item.todoId === "T001")).toMatchObject({
    refType: "order_draft",
    refId: "DRAFT-DEMO-001",
  });

  const draftTodo = page.getByRole("button", { name: /订单草稿待确认.*DRAFT-DEMO-001/ });
  await expect(draftTodo).toHaveCount(1);
  await draftTodo.click();
  await page.getByRole("button", { name: "打开订单录入", exact: true }).click();
  await expect(page.getByRole("heading", { name: "订单录入" })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "订单原文" })).toHaveValue(/张三服饰.*红500.*黑100/);
  await expect(page.locator(".entry-edit-row")).toHaveCount(2);

  const firstRow = page.locator(".entry-edit-row").nth(0);
  const secondRow = page.locator(".entry-edit-row").nth(1);
  await page.locator(".entry-issue-list button").filter({ hasText: /库存缺货\s*60/ }).click();
  await expect(secondRow).toHaveClass(/active/);
  await expect(page.getByRole("heading", { name: /当前选中行详情.*第2行/ })).toBeVisible();
  await expect(secondRow).toBeInViewport();

  const firstRowLatest = page.getByRole("textbox", { name: "第1行最晚时间" });
  const secondRowProduct = page.getByRole("textbox", { name: "第2行品名" });
  await firstRowLatest.focus();
  await expect(firstRow).toHaveClass(/active/);
  await firstRowLatest.press("Tab");
  await expect(secondRowProduct).toBeFocused();
  await expect(secondRow).toHaveClass(/active/);
  const focusedCellOutline = await secondRowProduct.evaluate((element) => {
    const style = window.getComputedStyle(element);
    return { style: style.outlineStyle, width: Number.parseFloat(style.outlineWidth) };
  });
  expect(focusedCellOutline.style).toBe("solid");
  expect(focusedCellOutline.width).toBeGreaterThan(0);

  const confirmationFooter = page.getByLabel("订单汇总与确认");
  await expect(confirmationFooter).toBeVisible();
  const initialFooterBox = await confirmationFooter.boundingBox();
  expect(initialFooterBox?.y).toBeGreaterThanOrEqual(0);
  expect((initialFooterBox?.y ?? 0) + (initialFooterBox?.height ?? 0)).toBeLessThanOrEqual(
    await page.evaluate(() => window.innerHeight),
  );

  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  const reviewPanelBox = await page.locator(".entry-review-panel").boundingBox();
  const bottomFooterBox = await confirmationFooter.boundingBox();
  expect((reviewPanelBox?.y ?? 0) + (reviewPanelBox?.height ?? 0)).toBeLessThanOrEqual(bottomFooterBox?.y ?? 0);

  await switchAccount(page, "U-WORKSHOP-PRINT-A");
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole("navigation", { name: "现场岗位手机导航" })).toBeVisible();
  await expect(page.getByRole("button", { name: /当前任务/ })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  expect(browserErrors, `浏览器控制台不应出现错误：\n${browserErrors.join("\n")}`).toEqual([]);
});

test("订单录入危险操作确认可取消且已保存后修改原文仍阻止直接清空", async ({ page }) => {
  const browserErrors = [];
  page.on("console", (message) => {
    if (message.type() === "error") browserErrors.push(message.text());
  });
  page.on("pageerror", (error) => browserErrors.push(error.message));

  await openInternalWorkbench(page);
  await switchAccount(page, operatorId);
  await navigateToPage(page, "订单录入", "订单");
  await expect(page.getByRole("heading", { name: "订单录入" })).toBeVisible();

  const sourceText = page.getByRole("textbox", { name: "订单原文" });
  await sourceText.fill(dangerOrderText);
  await page.getByRole("button", { name: "识别", exact: true }).click();
  await expect(page.locator(".entry-edit-row")).toHaveCount(1);

  const deleteRow = page.getByRole("button", { name: "删除当前行", exact: true });
  await clickWithConfirm(page, deleteRow, { accept: false, message: "确认删除当前明细行" });
  await expect(page.locator(".entry-edit-row")).toHaveCount(1);
  await clickWithConfirm(page, deleteRow, { accept: true, message: "确认删除当前明细行" });
  await expect(page.locator(".entry-edit-row")).toHaveCount(0);
  await expect(page.getByText("暂无识别明细", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "识别", exact: true }).click();
  await expect(page.locator(".entry-edit-row")).toHaveCount(1);
  await page.getByRole("button", { name: "保存草稿", exact: true }).click();
  await expect(page.locator(".entry-fact-badge").filter({ hasText: "已保存草稿" })).toBeVisible();

  const changedSourceText = `${dangerOrderText}，备注急单`;
  await sourceText.fill(changedSourceText);
  await expect(page.locator(".entry-fact-badge").filter({ hasText: "原文已修改待重新识别" })).toBeVisible();

  const createOrder = page.locator(".topbar button").filter({ hasText: "新建订单" });
  await expect(createOrder).toHaveCount(1);
  await clickWithConfirm(page, createOrder, { accept: false, message: "当前订单草稿尚未保存" });
  await expect(sourceText).toHaveValue(changedSourceText);
  await expect(page.locator(".entry-edit-row")).toHaveCount(1);

  await clickWithConfirm(page, createOrder, { accept: true, message: "当前订单草稿尚未保存" });
  await expect(sourceText).toHaveValue("");
  await expect(page.locator(".entry-edit-row")).toHaveCount(0);
  expect(browserErrors, `浏览器控制台不应出现错误：\n${browserErrors.join("\n")}`).toEqual([]);
});

test("订单确认到收款凭证形成可追溯闭环", async ({ page, request }) => {
  const browserErrors = [];
  page.on("console", (message) => {
    if (message.type() === "error") browserErrors.push(message.text());
  });
  page.on("pageerror", (error) => browserErrors.push(error.message));

  await openInternalWorkbench(page);
  await switchAccount(page, operatorId);
  await navigateToPage(page, "订单录入", "订单");
  await expect(page.getByRole("heading", { name: "订单录入" })).toBeVisible();
  const orderLinesBeforeConfirmation = await apiGet(request, "/order-lines?page=1&pageSize=200");
  const existingOrderLineIds = new Set(orderLinesBeforeConfirmation.items.map((item) => item.id));

  await page.getByRole("textbox", { name: "订单原文" }).fill(orderText);
  await page.getByRole("button", { name: "识别", exact: true }).click();
  await expect(page.getByLabel("缺字段检查")).toHaveText("当前行已完成必要字段校对");

  await page.getByRole("button", { name: "保存并确认", exact: true }).click();
  await expect(page.getByText("订单已由后端确认", { exact: false })).toBeVisible();
  await expect(page.getByRole("heading", { name: "订单池" })).toBeVisible();

  const orderLinesAfterConfirmation = await apiGet(request, "/order-lines?page=1&pageSize=200");
  const createdLine = orderLinesAfterConfirmation.items.find((item) =>
    !existingOrderLineIds.has(item.id) && item.customerId === "C001" && Number(item.qty) === 10,
  );
  expect(createdLine, "后端订单池应包含刚确认的 10 个自提订单").toBeTruthy();
  expect(["pickup", "自提"]).toContain(createdLine.fulfillmentMethod);

  const inventoriesAfterConfirmation = await apiGet(request, "/inventory/items?page=1&pageSize=200");
  const reservedInventory = inventoriesAfterConfirmation.items.find((item) =>
    item.size === "30*38*10" && item.color === "红色" && item.handle === "普通提" && item.style === "空白袋",
  );
  const pickupInStockBeforeOutbound = Number(reservedInventory?.inStock ?? 0);
  const pickupReservedBeforeOutbound = Number(reservedInventory?.reserved ?? reservedInventory?.reservedQty ?? 0);
  expect(Number(reservedInventory?.reserved ?? reservedInventory?.reservedQty ?? 0)).toBeGreaterThanOrEqual(10);

  await navigateToPage(page, "出库交付", "库存交付");
  await expect(page.getByRole("heading", { name: "出库交付" })).toBeVisible();
  await page.getByRole("tab", { name: "自提", exact: true }).click();

  const createdFulfillment = await waitForApiItem(request, "/fulfillments?page=1&pageSize=200", (item) =>
    item.lineId === createdLine.id || item.orderLineId === createdLine.id,
  );
  await switchAccount(page, officeOperatorId);
  await configureSystemPrinter(request, "PRN-DOT-A", officeOperatorId);
  const pickupPrintJob = await submitFulfillmentPrint(page, request, {
    fulfillmentId: createdFulfillment.fulfillmentId,
    methodTab: "自提",
    action: "打印自提单",
    documentType: "pickup_note",
  });
  expect(pickupPrintJob.printDeviceId).toBe("PRN-DOT-A");
  const pickupPrintResult = await dispatchAndConfirmTrustedPrint(page, request, pickupPrintJob, {
    dispatchOperatorId: officeOperatorId,
  });
  expect(pickupPrintResult.physicalPrintConfirmed).toBe(true);

  const printedFulfillment = await waitForApiItem(request, "/fulfillments?page=1&pageSize=200", (item) =>
    item.fulfillmentId === createdFulfillment.fulfillmentId && item.paperOutboundStatus === "已打印待交库房",
  );
  expect(printedFulfillment.paperOutboundDocument?.printRecordId).toBe(pickupPrintJob.printRecordId);
  expect(printedFulfillment.paperOutboundDocument?.printedBy).toBe(officeOperatorId);

  await handoffAndRecordPhysicalOutbound(page, request, {
    fulfillmentId: createdFulfillment.fulfillmentId,
    methodTab: "自提",
    physicalExecutorEmployeeId: warehousePhysicalExecutorEmployeeId,
    feedbackChannel: "纸面",
  });

  const completedFulfillment = await waitForApiItem(request, "/fulfillments?page=1&pageSize=200", (item) =>
    item.id === createdFulfillment.id && item.status === "已交付",
  );
  expect(completedFulfillment.status).toBe("已交付");
  expect(completedFulfillment.paperOutboundStatus).toBe("已交库房");
  expect(completedFulfillment.paperOutboundDocument?.handedToWarehouseBy).toBe(officeOperatorId);
  expect(completedFulfillment.latestWarehouseExecution).toMatchObject({
    result: "实物已出库",
    physicalExecutorEmployeeId: warehousePhysicalExecutorEmployeeId,
    feedbackChannel: "纸面",
    authenticatedOperatorId: officeOperatorId,
    paperDocumentVersion: completedFulfillment.paperOutboundDocument?.documentVersion,
  });
  expect(completedFulfillment.physicalOutboundDocumentId).toBe(completedFulfillment.paperOutboundDocument?.paperOutboundDocumentId);
  expect(completedFulfillment.physicalOutboundAt).toBeTruthy();
  expect(completedFulfillment.finalDeliveryAt).toBeTruthy();
  const pickupInventoryAfterOutbound = await findInventoryItem(request, createdLine);
  expect(Number(pickupInventoryAfterOutbound.inStock)).toBe(pickupInStockBeforeOutbound - 10);
  expect(Number(pickupInventoryAfterOutbound.reserved ?? pickupInventoryAfterOutbound.reservedQty ?? 0)).toBe(pickupReservedBeforeOutbound - 10);

  await navigateToPage(page, "对账收款", "对账");
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
  await page.getByRole("tab", { name: "凭证/确认", exact: true }).click();
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

test("定制印刷订单按岗位交接完成生产、可信打印、快运和对账", async ({ page, request }) => {
  const browserErrors = [];
  const forbiddenResponses = [];
  page.on("console", (message) => {
    if (message.type() === "error" && !message.text().includes("403 (Forbidden)")) browserErrors.push(message.text());
  });
  page.on("pageerror", (error) => browserErrors.push(error.message));
  page.on("response", (response) => {
    if (response.status() === 403) {
      const operator = response.request().headers()["x-erp-user-id"] ?? "unknown";
      forbiddenResponses.push(`${new URL(response.url()).pathname} operator=${operator}`);
    }
  });

  await openInternalWorkbench(page);
  await switchAccount(page, operatorId);
  await navigateToPage(page, "订单录入", "订单");
  const orderLinesBeforeConfirmation = await apiGet(request, "/order-lines?page=1&pageSize=200");
  const existingOrderLineIds = new Set(orderLinesBeforeConfirmation.items.map((item) => item.id));

  await page.getByRole("textbox", { name: "订单原文" }).fill(
    "美的空调 30*38*10 白印黑 白袋黑提 单面 12个 普通提 明天下午快运",
  );
  await page.getByRole("button", { name: "识别", exact: true }).click();
  await expect(page.getByText("白印黑 / 白袋黑提", { exact: true })).toBeVisible();
  await page.locator('.entry-upload-action input[type="file"]').setInputFiles({
    name: "e2e-print-artwork.png",
    mimeType: "image/png",
    buffer: createOnePixelPng(),
  });
  await expect(page.getByLabel("缺字段检查")).toHaveText("当前行已完成必要字段校对");
  await expect(page.getByText("库存需复核", { exact: false })).toBeVisible();
  await page.getByRole("button", { name: "保存并确认", exact: true }).click();
  await expect(page.getByRole("heading", { name: "订单池" })).toBeVisible();

  const createdLine = await waitForApiItem(request, "/order-lines?page=1&pageSize=200", (item) =>
    !existingOrderLineIds.has(item.id) &&
    item.customerId === "C004" &&
    Number(item.qty) === 12 &&
    item.printFlag === true,
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
  expect(productionTask.productionTask.machineId).toBe("PRINT-01");
  const inventoryBeforeReport = await findInventoryItem(request, createdLine);
  const inStockBeforeReport = Number(inventoryBeforeReport.inStock ?? 0);
  const reservedBeforeReport = Number(inventoryBeforeReport.reserved ?? inventoryBeforeReport.reservedQty ?? 0);

  await switchAccount(page, officeOperatorId);
  await navigateToPage(page, "打包/标签", "更多工作台");
  await selectWorkbenchTabIfPresent(page, "生产任务");
  await expect(page.locator(".production-status-hints")).not.toContainText("刷新中");
  await selectProductionTask(page, productionTaskId);
  const scheduleDecisionSection = page.locator(".production-schedule-decision-section");
  await expect(scheduleDecisionSection.getByLabel("业务决定人")).toBeEnabled();
  await scheduleDecisionSection.getByLabel("业务决定人").selectOption("E2E-MANAGER-001");
  await scheduleDecisionSection.getByLabel("决定渠道").selectOption("wechat");
  await scheduleDecisionSection.getByLabel("决定内容").fill("负责人确认本单优先进入丝印排产");
  await scheduleDecisionSection.getByLabel("授权依据").fill("微信经营群确认");
  await page.getByRole("button", { name: "发布排产", exact: true }).click();
  const scheduleConfirmation = page.getByRole("dialog", { name: "确认排产经营决定" });
  await expect(scheduleConfirmation).toBeVisible();
  for (const label of ["原排产", "变更后", "业务决定人", "系统操作人", "决定渠道 / 时间", "决定证据内容", "授权依据", "预计影响"]) {
    await expect(scheduleConfirmation.getByText(label, { exact: true })).toBeVisible();
  }
  await expect(scheduleConfirmation).toContainText("微信");
  await expect(scheduleConfirmation).not.toContainText("wechat");
  await scheduleConfirmation.getByRole("button", { name: "确认提交", exact: true }).click();
  await waitForApiDetail(
    request,
    `/production-tasks/${encodeURIComponent(productionTaskId)}`,
    (detail) => Boolean(detail.productionTask?.publishedScheduleId),
  );
  const scheduleDecisionHistory = await apiGet(
    request,
    `/business-decisions?businessType=production_task&businessId=${encodeURIComponent(productionTaskId)}`,
    officeOperatorId,
  );
  expect(scheduleDecisionHistory.items).toHaveLength(1);
  expect(scheduleDecisionHistory.items[0]).toMatchObject({
    decisionMakerEmployeeId: "E2E-MANAGER-001",
    enteredByUserId: officeOperatorId,
    decisionType: "delegated",
  });

  await switchAccount(page, "U-WORKSHOP-PRINT-A");
  await openWorkshopTask(page, createdLine.id);
  await expect(page.getByRole("heading", { name: productionTaskId, exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "确认成品图", exact: true })).toHaveCount(0);

  const workshopReviewDenied = await apiPost(
    request,
    `/production-tasks/${encodeURIComponent(productionTaskId)}/finished-goods-photo-review`,
    { reviewStatus: "accepted", reason: "workshop must not approve its own photo" },
    "U-WORKSHOP-PRINT-A",
    403,
  );
  expect(workshopReviewDenied.requiredPermission).toBe("production.schedule.publish");
  await page.getByRole("tab", { name: "成品图", exact: true }).click();
  await page.getByRole("button", { name: "上传成品图", exact: true }).click();

  let productionDetail = await waitForApiDetail(
    request,
    `/production-tasks/${encodeURIComponent(productionTaskId)}`,
    (detail) => detail.finishedGoodsPhoto?.status === "待确认",
  );
  expect(productionDetail.finishedGoodsPhoto.attachmentId).toBeTruthy();
  expect(productionDetail.finishedGoodsPhoto.uploadedBy).toBe("U-WORKSHOP-PRINT-A");
  const finishedGoodsAttachments = await apiGet(
    request,
    `/attachments?ownerType=production_task&ownerId=${encodeURIComponent(productionTaskId)}&purpose=finished_goods_photo`,
  );
  expect(finishedGoodsAttachments.items.some((item) =>
    item.attachmentId === productionDetail.finishedGoodsPhoto.attachmentId,
  )).toBe(true);

  await switchAccount(page, operatorId);
  await navigateToPage(page, "打包/标签", "更多工作台");
  await selectWorkbenchTabIfPresent(page, "生产任务");
  await selectProductionTask(page, productionTaskId);
  await page.getByRole("button", { name: "确认成品图", exact: true }).click();
  await expect(page.getByRole("button", { name: "确认成品图", exact: true })).toBeDisabled();
  productionDetail = await waitForApiDetail(
    request,
    `/production-tasks/${encodeURIComponent(productionTaskId)}`,
    (detail) => detail.finishedGoodsPhoto?.status === "已接受",
  );
  expect(productionDetail.finishedGoodsPhoto.reviewedBy).toBe(operatorId);

  await switchAccount(page, "U-WORKSHOP-PRINT-A");
  await openWorkshopTask(page, createdLine.id);
  await page.getByLabel("合格数量").fill("12");
  await page.getByLabel("异常/废品数").fill("2");
  await page.getByLabel("机器计数/动作次数").fill("9876");
  await page.getByRole("button", { name: "报工完成", exact: true }).click();
  await page.getByRole("button", { name: "确认完成生产报工", exact: true }).click();

  productionDetail = await waitForApiDetail(
    request,
    `/production-tasks/${encodeURIComponent(productionTaskId)}`,
    (detail) => detail.productionTask?.status === "已完成",
  );
  expect(Number(productionDetail.latestReport?.qualifiedQty)).toBe(12);
  expect(Number(productionDetail.latestReport?.exceptionQty)).toBe(2);
  expect(Number(productionDetail.latestReport?.machineCount)).toBe(9876);
  expect(productionDetail.latestReport?.operatorId).toBe("U-WORKSHOP-PRINT-A");
  const packingTaskId = productionDetail.packingTask?.packingTaskId;
  expect(packingTaskId).toBeTruthy();

  const inventoryAfterReport = await findInventoryItem(request, createdLine);
  expect(Number(inventoryAfterReport.inStock)).toBe(inStockBeforeReport + 12);
  expect(Number(inventoryAfterReport.reserved ?? inventoryAfterReport.reservedQty ?? 0)).toBe(reservedBeforeReport + 12);

  const packingReportDenied = await apiPost(
    request,
    `/production-tasks/${encodeURIComponent(productionTaskId)}/report-complete`,
    { orderLineId: createdLine.id, qualifiedQty: 12 },
    "U-PACKING-A",
    403,
  );
  expect(packingReportDenied.requiredPermission).toBe("production.report.complete");

  await switchAccount(page, "U-PACKING-A");
  await openMobileTask(page, "打包移动任务", createdLine.id);
  await expect(page.getByText(packingTaskId, { exact: false })).toBeVisible();
  await page.getByLabel("实际打包数量").fill("12");
  await page.getByLabel("包裹数").fill("2");
  await page.getByRole("button", { name: "提交打包完成", exact: true }).click();
  await page.getByRole("button", { name: "确认提交打包完成", exact: true }).click();

  const packingDetail = await waitForApiDetail(
    request,
    `/packing-tasks/${encodeURIComponent(packingTaskId)}`,
    (detail) => detail.packingTask?.status === "已完成",
  );
  expect(packingDetail.packages).toHaveLength(2);
  expect(packingDetail.packages.every((item) => item.createdBy === "U-PACKING-A")).toBe(true);
  expect(Number(packingDetail.packingTask.actualPackedQty)).toBe(12);
  const fulfillmentId = packingDetail.fulfillment?.fulfillmentId;
  expect(fulfillmentId).toBeTruthy();
  let fulfillment = await waitForApiItem(request, "/fulfillments?page=1&pageSize=200", (item) =>
    item.fulfillmentId === fulfillmentId && item.status === "待打印标签",
  );
  expect(fulfillment.printed).not.toBe(true);
  const inventoryAfterPacking = await findInventoryItem(request, createdLine);
  expect(Number(inventoryAfterPacking.inStock)).toBe(inStockBeforeReport + 12);

  await switchAccount(page, officeOperatorId);
  await configureSystemPrinter(request, "PRN-LABEL-A", officeOperatorId);
  await configureSystemPrinter(request, "PRN-DOT-A", officeOperatorId);

  const labelPrintJob = await submitFulfillmentPrint(page, request, {
    fulfillmentId,
    methodTab: "快递快运",
    action: "打印标签",
    documentType: "express_ltl_label",
  });
  expect(labelPrintJob.printDeviceId).toBe("PRN-LABEL-A");
  expect(labelPrintJob.driverMode).toBe("system_printer");
  expect(labelPrintJob.requestedBy).toBe(officeOperatorId);
  const labelCallbackResult = await dispatchAndConfirmTrustedPrint(page, request, labelPrintJob, {
    dispatchOperatorId: officeOperatorId,
    forbiddenCallbackOperatorId: officeOperatorId,
  });
  expect(labelCallbackResult.physicalPrintConfirmed).toBe(true);

  fulfillment = await waitForApiItem(request, "/fulfillments?page=1&pageSize=200", (item) =>
    item.fulfillmentId === fulfillmentId && item.status === "待打印出库单" && item.labelsPrinted === true,
  );
  expect(fulfillment.paperOutboundDocument).toBeNull();
  expect(fulfillment.printed).toBe(false);
  expect(fulfillment.labelPrintRecordId).toBe(labelPrintJob.printRecordId);
  const labelLinkedPackingDetail = await waitForApiDetail(
    request,
    `/packing-tasks/${encodeURIComponent(packingTaskId)}`,
    (detail) => detail.packages?.every((item) => item.labelPrintRecordId === labelPrintJob.printRecordId),
  );
  expect(labelLinkedPackingDetail.packages.every((item) => item.status === "已打印标签")).toBe(true);

  const outboundPrintJob = await submitFulfillmentPrint(page, request, {
    fulfillmentId,
    methodTab: "快递快运",
    action: "打印出库单",
    documentType: "outbound_note",
  });
  expect(outboundPrintJob.printDeviceId).toBe("PRN-DOT-A");
  expect(outboundPrintJob.printRecordId).not.toBe(labelPrintJob.printRecordId);
  const outboundCallbackResult = await dispatchAndConfirmTrustedPrint(page, request, outboundPrintJob, {
    dispatchOperatorId: officeOperatorId,
  });
  expect(outboundCallbackResult.physicalPrintConfirmed).toBe(true);

  const printedPaperFulfillment = await waitForApiItem(request, "/fulfillments?page=1&pageSize=200", (item) =>
    item.fulfillmentId === fulfillmentId && item.paperOutboundStatus === "已打印待交库房",
  );
  expect(printedPaperFulfillment.labelsPrinted).toBe(true);
  expect(printedPaperFulfillment.paperOutboundDocument?.printRecordId).toBe(outboundPrintJob.printRecordId);
  expect(printedPaperFulfillment.paperOutboundDocument?.printRecordId).not.toBe(labelPrintJob.printRecordId);
  expect(printedPaperFulfillment.paperOutboundDocument?.printedBy).toBe(officeOperatorId);

  await handoffAndRecordPhysicalOutbound(page, request, {
    fulfillmentId,
    methodTab: "快递快运",
    physicalExecutorEmployeeId: warehousePhysicalExecutorEmployeeId,
    feedbackChannel: "纸面",
  });

  fulfillment = await waitForApiItem(request, "/fulfillments?page=1&pageSize=200", (item) =>
    item.fulfillmentId === fulfillmentId && item.status === "已交付",
  );
  expect(fulfillment.actualQty).toBe(12);
  expect(fulfillment.latestWarehouseExecution).toMatchObject({
    result: "实物已出库",
    physicalExecutorEmployeeId: warehousePhysicalExecutorEmployeeId,
    feedbackChannel: "纸面",
    authenticatedOperatorId: officeOperatorId,
  });
  expect(fulfillment.physicalOutboundDocumentId).toBe(fulfillment.paperOutboundDocument?.paperOutboundDocumentId);
  const inventoryAfterFulfillment = await findInventoryItem(request, createdLine);
  expect(Number(inventoryAfterFulfillment.inStock)).toBe(inStockBeforeReport);
  expect(Number(inventoryAfterFulfillment.reserved ?? inventoryAfterFulfillment.reservedQty ?? 0)).toBe(reservedBeforeReport);

  await switchAccount(page, "U-FINANCE-A");
  await navigateToPage(page, "对账收款", "对账");
  await page.getByPlaceholder("客户名 / 单号 / 联系人").fill("美的空调网店");
  await page.getByRole("button", { name: "美的空调网店", exact: false }).first().click();
  await expect(page.getByText(createdLine.id, { exact: false })).toBeVisible();

  const statementCustomers = await apiGet(request, "/statements/customers?page=1&pageSize=200", "U-FINANCE-A");
  const customerStatement = statementCustomers.items.find((item) => item.customerId === "C004");
  expect(customerStatement?.statementId).toBeTruthy();
  const statementDetail = await apiGet(
    request,
    `/statements/${encodeURIComponent(customerStatement.statementId)}`,
    "U-FINANCE-A",
  );
  expect(statementDetail.lineIds).toContain(createdLine.id);
  expect(forbiddenResponses, `页面不应发起越权请求：\n${forbiddenResponses.join("\n")}`).toEqual([]);
  expect(browserErrors, `浏览器控制台不应出现错误：\n${browserErrors.join("\n")}`).toEqual([]);
});

test("经营决定区分决定人与操作人并保证授权、幂等和历史可追溯", async ({ request }, testInfo) => {
  const suffix = `${Date.now()}-${testInfo.retry}`;
  const motherAuthorization = await ensureBusinessAuthorization(request, {
    employeeId: "E2E-DM-MOTHER",
    decisionScope: "raw_material_purchase",
    idempotencyKey: `e2e-mother-raw-material-purchase-authorization-${suffix}`,
    note: "负责人确认母亲可决定原材料采购",
  });
  await ensureBusinessAuthorization(request, {
    employeeId: "E2E-DM-AUNT",
    decisionScope: "raw_material_purchase",
    idempotencyKey: "e2e-aunt-raw-material-purchase-authorization",
    note: "负责人确认姨妈可决定原材料采购",
  });
  const officeEffectiveAuthorizations = await apiGet(request, "/business-decision-authorizations?scope=raw_material_purchase&effectiveOnly=true", officeOperatorId);
  expect(officeEffectiveAuthorizations.items.map((item) => item.employeeId)).toContain("E2E-DM-MOTHER");

  const decidedAt = new Date(Date.now() - 5 * 60 * 1000).toISOString();
  const idempotencyKey = `e2e-delegated-purchase-${suffix}`;
  const requestId = `RMP-E2E-EVIDENCE-${suffix}`;
  const evidenceDraft = await apiPost(request, "/business-decision-evidence-drafts", {
    idempotencyKey: `e2e-evidence-draft-${suffix}`,
    businessType: "raw_material_purchase_request",
    businessId: requestId,
    decisionScope: "raw_material_purchase",
  }, officeOperatorId, 201);
  const evidenceAttachment = await apiPost(request, "/attachments", {
    idempotencyKey: `e2e-evidence-attachment-${suffix}`,
    ownerType: "business_decision_evidence_draft",
    ownerId: evidenceDraft.draft.draftId,
    purpose: "business_decision_evidence",
    fileType: "image",
    fileName: "微信经营群采购确认.png",
    contentRef: `e2e://business-decision/${suffix}`,
    mimeType: "image/png",
    fileSize: 8,
    contentDataUrl: "data:image/png;base64,iVBORw0KGgo=",
    uploadedBy: "FORGED-UPLOADER",
  }, officeOperatorId);
  expect(evidenceAttachment.uploadedBy).toBe(officeOperatorId);
  const delegatedDecision = {
    decisionMakerEmployeeId: "E2E-DM-MOTHER",
    decisionChannel: "wechat",
    decidedAt,
    decisionContent: { summary: "同意采购 E2E 米白无纺布并按本周计划执行" },
    authorizationBasis: "微信经营群确认",
    evidenceDraftId: evidenceDraft.draft.draftId,
  };
  const delegatedBody = {
    idempotencyKey,
    requestId,
    supplierName: "E2E 薄膜供应商甲",
    materialLines: [{ materialName: "无纺布", color: "米白", qty: 320, unit: "kg" }],
    delegatedDecision,
    operatorId: "U-MANAGER-A",
    enteredByUserId: "U-MANAGER-A",
  };

  const delegated = await apiPost(request, "/raw-material-purchase-requests", delegatedBody, "U-OFFICE-B");
  expect(delegated.purchaseRequest.status).toBe("待执行");
  expect(delegated.purchaseRequest.createdBy).toBe("U-OFFICE-B");
  expect(delegated.businessDecision).toMatchObject({
    decisionType: "delegated",
    decisionMakerEmployeeId: "E2E-DM-MOTHER",
    enteredByUserId: "U-OFFICE-B",
    decisionChannel: "wechat",
  });
  expect(delegated.businessDecision.decisionMakerEmployeeId).not.toBe(delegated.businessDecision.enteredByUserId);

  const replay = await apiPost(request, "/raw-material-purchase-requests", delegatedBody, "U-OFFICE-B");
  expect(replay.replayed).toBe(true);
  expect(replay.purchaseRequest.id).toBe(delegated.purchaseRequest.id);
  expect(replay.businessDecision.businessDecisionId).toBe(delegated.businessDecision.businessDecisionId);

  const changedReplay = await apiPost(
    request,
    "/raw-material-purchase-requests",
    {
      ...delegatedBody,
      materialLines: [{ materialName: "无纺布", color: "米白", qty: 321, unit: "kg" }],
    },
    "U-OFFICE-B",
    409,
  );
  expect(changedReplay.code).toMatch(/IDEMPOTENCY|CONFLICT/);

  const history = await apiGet(
    request,
    `/business-decisions?businessType=raw_material_purchase_request&businessId=${encodeURIComponent(delegated.purchaseRequest.id)}`,
    officeOperatorId,
  );
  expect(history.total).toBe(1);
  expect(history.items[0]).toMatchObject({
    businessDecisionId: delegated.businessDecision.businessDecisionId,
    decisionMakerEmployeeId: "E2E-DM-MOTHER",
    enteredByUserId: "U-OFFICE-B",
    decisionChannelLabel: "微信",
  });
  expect(history.items[0].evidenceAttachments).toEqual(expect.arrayContaining([
    expect.objectContaining({ attachmentId: evidenceAttachment.attachmentId, fileName: "微信经营群采购确认.png" }),
  ]));

  const direct = await apiPost(
    request,
    "/raw-material-purchase-requests",
    {
      idempotencyKey: `e2e-direct-purchase-${suffix}`,
      supplierName: "E2E 薄膜供应商乙",
      materialLines: [{ materialName: "薄膜", color: "透明", qty: 180, unit: "kg" }],
      directDecisionContent: { summary: "管理人员本人确认采购 E2E 透明薄膜" },
      operatorId: officeOperatorId,
      enteredByUserId: officeOperatorId,
    },
    operatorId,
  );
  expect(direct.businessDecision).toMatchObject({
    decisionType: "direct",
    decisionMakerEmployeeId: "E2E-MANAGER-001",
    enteredByUserId: operatorId,
    decisionChannel: "self_system",
  });

  const purchasesBeforeRejectedWrites = await apiGet(request, "/raw-material-purchase-requests", officeOperatorId);
  const decisionsBeforeRejectedWrites = await apiGet(request, "/business-decisions", officeOperatorId);
  const missingEvidence = await apiPost(
    request,
    "/raw-material-purchase-requests",
    {
      idempotencyKey: `e2e-missing-decision-${suffix}`,
      supplierName: "E2E 不应落库供应商一",
      materialLines: [{ materialName: "薄膜", color: "白", qty: 1, unit: "kg" }],
      delegatedDecision: { ...delegatedDecision, authorizationBasis: "" },
    },
    officeOperatorId,
    422,
  );
  expect(missingEvidence.code).toBe("BUSINESS_DECISION_AUTHORIZATION_BASIS_REQUIRED");

  const unauthorizedDecisionMaker = await apiPost(
    request,
    "/raw-material-purchase-requests",
    {
      idempotencyKey: `e2e-unauthorized-decision-${suffix}`,
      supplierName: "E2E 不应落库供应商二",
      materialLines: [{ materialName: "薄膜", color: "黑", qty: 1, unit: "kg" }],
      delegatedDecision: {
        ...delegatedDecision,
        decisionMakerEmployeeId: warehousePhysicalExecutorEmployeeId,
        evidenceDraftId: "",
      },
    },
    officeOperatorId,
    403,
  );
  expect(unauthorizedDecisionMaker.code).toBe("SCOPE_MISMATCH");

  const purchasesAfterRejectedWrites = await apiGet(request, "/raw-material-purchase-requests", officeOperatorId);
  const decisionsAfterRejectedWrites = await apiGet(request, "/business-decisions", officeOperatorId);
  expect(purchasesAfterRejectedWrites.total).toBe(purchasesBeforeRejectedWrites.total);
  expect(decisionsAfterRejectedWrites.total).toBe(decisionsBeforeRejectedWrites.total);

  const deactivated = await apiPost(request, `/business-decision-authorizations/${encodeURIComponent(motherAuthorization.authorizationId)}/deactivate`, {
    idempotencyKey: `e2e-deactivate-mother-${suffix}`,
    expectedRevision: motherAuthorization.revision,
    reason: "E2E 验证停用后办公室不可再选",
  }, operatorId);
  expect(deactivated.authorization.status).toBe("inactive");
  const officeAfterDeactivate = await apiGet(request, "/business-decision-authorizations?scope=raw_material_purchase&effectiveOnly=true", officeOperatorId);
  expect(officeAfterDeactivate.items.map((item) => item.employeeId)).not.toContain("E2E-DM-MOTHER");
});

test("办公室AB同版本竞争只提交一次并可刷新后重试", async ({ request }, testInfo) => {
  const suffix = `${Date.now()}-${testInfo.retry}`;
  await ensureBusinessAuthorization(request, {
    employeeId: "E2E-DM-AUNT",
    decisionScope: "raw_material_purchase",
    idempotencyKey: `e2e-ab-aunt-authorization-${suffix}`,
    note: "负责人确认姨妈可决定原材料采购",
  });
  const created = await apiPost(
    request,
    "/raw-material-purchase-requests",
    {
      idempotencyKey: `e2e-ab-purchase-${suffix}`,
      supplierName: "E2E AB 并发供应商",
      materialLines: [{ materialName: "无纺布", color: "焦糖", qty: 88, unit: "kg" }],
      delegatedDecision: {
        decisionMakerEmployeeId: "E2E-DM-AUNT",
        decisionChannel: "phone",
        decidedAt: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
        decisionContent: { summary: "同意建立 AB 并发验收采购请求" },
        authorizationBasis: "电话确认",
        evidenceAttachmentIds: [],
      },
    },
    officeOperatorId,
  );
  const requestId = created.purchaseRequest.id;
  const [officeARead, officeBRead] = await Promise.all([
    apiGet(request, `/raw-material-purchase-requests/${encodeURIComponent(requestId)}`, "U-OFFICE-A"),
    apiGet(request, `/raw-material-purchase-requests/${encodeURIComponent(requestId)}`, "U-OFFICE-B"),
  ]);
  expect(officeARead.purchaseRequest.revision).toBe(1);
  expect(officeBRead.purchaseRequest.revision).toBe(1);

  const submitStatus = (currentOperatorId, key) => request.post(
    `${apiBaseUrl}/raw-material-purchase-requests/${encodeURIComponent(requestId)}/status`,
    {
      data: {
        expectedRevision: 1,
        idempotencyKey: key,
        status: "已联系供应商",
        reason: `${currentOperatorId} 根据共享任务池联系供应商`,
      },
      headers: { "x-erp-user-id": currentOperatorId },
    },
  );
  const [officeAWrite, officeBWrite] = await Promise.all([
    submitStatus("U-OFFICE-A", `e2e-ab-a-${suffix}`),
    submitStatus("U-OFFICE-B", `e2e-ab-b-${suffix}`),
  ]);
  expect([officeAWrite.status(), officeBWrite.status()].sort()).toEqual([200, 409]);
  const loserId = officeAWrite.status() === 409 ? "U-OFFICE-A" : "U-OFFICE-B";
  const conflict = await (officeAWrite.status() === 409 ? officeAWrite : officeBWrite).json();
  expect(conflict.code).toBe("BUSINESS_WRITE_CONFLICT");
  expect(conflict.details?.currentRevision ?? conflict.currentRevision).toBe(2);

  const afterConflict = await apiGet(
    request,
    `/raw-material-purchase-requests/${encodeURIComponent(requestId)}`,
    loserId,
  );
  expect(afterConflict.purchaseRequest).toMatchObject({ status: "已联系供应商", revision: 2 });
  const decisionsAfterConflict = await apiGet(
    request,
    `/business-decisions?businessType=raw_material_purchase_request&businessId=${encodeURIComponent(requestId)}`,
    loserId,
  );
  expect(decisionsAfterConflict.total).toBe(1);

  const retried = await apiPost(
    request,
    `/raw-material-purchase-requests/${encodeURIComponent(requestId)}/status`,
    {
      expectedRevision: afterConflict.purchaseRequest.revision,
      idempotencyKey: `e2e-ab-retry-${suffix}`,
      status: "已下单",
      reason: `${loserId} 刷新最新版本并重新确认后下单`,
    },
    loserId,
  );
  expect(retried.purchaseRequest).toMatchObject({ status: "已下单", revision: 3 });
  const decisionsAfterRetry = await apiGet(
    request,
    `/business-decisions?businessType=raw_material_purchase_request&businessId=${encodeURIComponent(requestId)}`,
    loserId,
  );
  expect(decisionsAfterRetry.total).toBe(1);
});

async function ensureBusinessAuthorization(request, { employeeId, decisionScope, idempotencyKey, note }) {
  const existing = await apiGet(
    request,
    `/business-decision-authorizations?includeAll=true&employeeId=${encodeURIComponent(employeeId)}&scope=${encodeURIComponent(decisionScope)}`,
    operatorId,
  );
  const active = existing.items?.find((item) => item.status === "active" && (item.isEffective === true || item.effectiveStatus === "current"));
  if (active) return active;
  const created = await apiPost(request, "/business-decision-authorizations", {
    idempotencyKey,
    employeeId,
    decisionScope,
    maxAmount: null,
    activeFrom: "2020-01-01T00:00:00.000Z",
    activeTo: "",
    authorizationNote: note,
    createdBy: "FORGED-CREATOR",
    updatedBy: "FORGED-UPDATER",
  }, operatorId, 201);
  expect(created.authorization.createdBy).toBe(operatorId);
  expect(created.authorization.updatedBy).toBe(operatorId);
  return created.authorization;
}

async function configureSystemPrinter(request, printDeviceId, currentOperatorId) {
  const result = await apiPost(
    request,
    `/print-devices/${encodeURIComponent(printDeviceId)}/driver-mode`,
    { driverMode: "system_printer", reason: "E2E 可信打印链路准备" },
    currentOperatorId,
  );
  expect(result.printDevice?.printDeviceId).toBe(printDeviceId);
  expect(result.printDevice?.settings?.driverMode).toBe("system_printer");
}

async function submitFulfillmentPrint(page, request, {
  fulfillmentId,
  methodTab,
  action,
  documentType,
}) {
  const before = await apiGet(request, "/print-jobs?page=1&pageSize=200");
  const existingIds = new Set(before.items.map((item) => item.printJobId));
  await navigateToPage(page, "出库交付", "库存交付");
  await page.getByRole("tab", { name: methodTab, exact: true }).click();
  await page.locator(`.fulfillment-table [data-row-id="${fulfillmentId}"]`).click();
  await page.getByRole("button", { name: action, exact: true }).click();
  const printDialog = page.getByRole("dialog", { name: "单据 / 标签预览" });
  await expect(printDialog).toBeVisible();
  await printDialog.getByRole("button", { name: "确认提交", exact: true }).click();
  return waitForApiItem(request, "/print-jobs?page=1&pageSize=200", (item) =>
    !existingIds.has(item.printJobId) &&
    item.targetId === fulfillmentId &&
    item.documentType === documentType &&
    item.jobStatus === "queued",
  );
}

async function dispatchAndConfirmTrustedPrint(page, request, printJob, {
  dispatchOperatorId = officeOperatorId,
  forbiddenCallbackOperatorId = "",
} = {}) {
  await navigateToPage(page, "打包/标签", "更多工作台");
  await selectWorkbenchTabIfPresent(page, "打印与设备");
  await page.getByRole("tab", { name: /打印作业/ }).click();
  const printJobRow = page.locator(".print-job-row").filter({ hasText: printJob.printJobId });
  const dispatchButton = printJobRow.getByRole("button", { name: "派发", exact: true });
  await expect(dispatchButton).toBeEnabled();
  const dispatchResult = await apiPost(
    request,
    `/print-jobs/${encodeURIComponent(printJob.printJobId)}/dispatch`,
    { reason: "E2E 办公室可信打印派发" },
    dispatchOperatorId,
  );
  expect(dispatchResult.printJob?.jobStatus).toBe("sent");
  const dispatched = await apiGet(request, `/print-jobs/${encodeURIComponent(printJob.printJobId)}`);
  const externalJobId = dispatched.printJob.metadata?.lastDispatch?.externalJobId;
  expect(externalJobId).toBe(`DRY-${printJob.printJobId}`);

  if (forbiddenCallbackOperatorId) {
    const forbidden = await apiPost(
      request,
      `/print-jobs/${encodeURIComponent(printJob.printJobId)}/driver-status`,
      { status: "printed", externalJobId },
      forbiddenCallbackOperatorId,
      403,
    );
    expect(forbidden.requiredPermission).toBe("print.job.callback");
  }

  return apiPost(
    request,
    `/print-jobs/${encodeURIComponent(printJob.printJobId)}/driver-status`,
    {
      status: "printed",
      externalJobId,
      adapterName: "e2e-dry-run-driver",
      eventSource: "driver_callback",
      driverStatus: "completed",
      message: "isolated trusted print callback",
      idempotencyKey: `E2E-${printJob.printJobId}-printed`,
    },
    printDriverOperatorId,
  );
}

async function handoffAndRecordPhysicalOutbound(page, request, {
  fulfillmentId,
  methodTab,
  physicalExecutorEmployeeId,
  feedbackChannel,
}) {
  await page.reload();
  await navigateToPage(page, "出库交付", "库存交付");
  await page.getByRole("tab", { name: methodTab, exact: true }).click();
  await page.locator(`.fulfillment-table [data-row-id="${fulfillmentId}"]`).click();
  await page.getByRole("button", { name: "纸单交库房", exact: true }).click();
  const handoffDialog = page.getByRole("dialog", { name: "纸单交库房" });
  await expect(handoffDialog).toBeVisible();
  await handoffDialog.getByPlaceholder("如：纸单已交郭青格，等库房找货").fill("E2E 纸单已交库房");
  await handoffDialog.getByRole("button", { name: "确认交库房", exact: true }).click();
  await waitForApiItem(request, "/fulfillments?page=1&pageSize=200", (item) =>
    item.fulfillmentId === fulfillmentId && item.paperOutboundStatus === "已交库房",
  );

  await page.reload();
  await navigateToPage(page, "出库交付", "库存交付");
  await page.getByRole("tab", { name: methodTab, exact: true }).click();
  await page.locator(`.fulfillment-table [data-row-id="${fulfillmentId}"]`).click();
  await page.getByRole("button", { name: "回录库房结果", exact: true }).click();
  const executionDialog = page.getByRole("dialog", { name: "回录库房实物结果" });
  await expect(executionDialog).toBeVisible();
  await executionDialog.getByLabel("库房反馈结果").selectOption("实物已出库");
  await executionDialog.getByLabel("实物执行人员工编号").fill(physicalExecutorEmployeeId);
  await executionDialog.getByLabel("反馈渠道").selectOption(feedbackChannel);
  await executionDialog.getByLabel("备注").fill("按当前纸单核对规格和数量后完成实物交接");
  await executionDialog.getByRole("button", { name: "下一步确认", exact: true }).click();
  await expect(executionDialog.getByText("只登记库房实物出库并扣减库存", { exact: false })).toBeVisible();
  await executionDialog.getByRole("button", { name: "确认回录", exact: true }).click();
  await waitForApiItem(request, "/fulfillments?page=1&pageSize=200", (item) =>
    item.fulfillmentId === fulfillmentId
      && item.status === (methodTab === "自提" ? "待确认自提交付" : "待承运方拉走")
      && Boolean(item.physicalOutboundAt)
      && !item.finalDeliveryAt,
  );

  await page.reload();
  await navigateToPage(page, "出库交付", "库存交付");
  await page.getByRole("tab", { name: methodTab, exact: true }).click();
  await page.locator(`.fulfillment-table [data-row-id="${fulfillmentId}"]`).click();
  await page.getByRole("button", { name: methodTab === "自提" ? "确认最终自提" : "确认已拉走", exact: true }).click();
  const finalDeliveryDialog = page.getByRole("dialog", { name: "确认最终交付" });
  await expect(finalDeliveryDialog).toBeVisible();
  await expect(finalDeliveryDialog.getByText("库存已在库房实物出库时扣减", { exact: false })).toBeVisible();
  await finalDeliveryDialog.getByRole("button", { name: "确认最终交付", exact: true }).click();
  await waitForApiItem(request, "/fulfillments?page=1&pageSize=200", (item) =>
    item.fulfillmentId === fulfillmentId && item.status === "已交付" && Boolean(item.finalDeliveryAt),
  );
}

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
  const accountSwitcher = page.getByRole("combobox", { name: /切换当前账号|切换演示角色/ });
  await expect(accountSwitcher).toBeVisible();
  const currentUserId = await accountSwitcher.inputValue();
  if (currentUserId === userId) {
    const alternate = await accountSwitcher.locator("option").evaluateAll(
      (options, selectedUserId) => options.map((item) => item.value).find((value) => value !== selectedUserId) ?? "",
      userId,
    );
    if (alternate) await selectPrototypeAccount(page, accountSwitcher, alternate);
  }
  await selectPrototypeAccount(page, page.getByRole("combobox", { name: /切换当前账号|切换演示角色/ }), userId);
}

async function selectPrototypeAccount(page, accountSwitcher, userId) {
  const selectedOption = accountSwitcher.locator(`option[value="${userId}"]`);
  const displayName = (await selectedOption.textContent())?.split(" · ")[0] ?? userId;
  const loginResponsePromise = page.waitForResponse((response) =>
    new URL(response.url()).pathname === "/api/auth/prototype-login" && response.request().method() === "POST",
  );
  await accountSwitcher.selectOption(userId);
  const loginResponse = await loginResponsePromise;
  expect(loginResponse.ok(), `${userId} 原型账号登录应成功`).toBe(true);
  const loginPayload = await loginResponse.json();
  expect(loginPayload.permissions?.user?.userId).toBe(userId);
  await expect(page.getByText(displayName, { exact: true }).first()).toBeVisible();
  const currentSwitcher = page.getByRole("combobox", { name: /切换当前账号|切换演示角色/ });
  if (await currentSwitcher.count()) await expect(currentSwitcher).toHaveValue(userId);
}

async function navigateToPage(page, pageLabel, groupLabel = "") {
  const navigation = page.getByRole("navigation", { name: "主导航" });
  await expect(navigation).toBeVisible();
  let target = navigation.getByRole("button", { name: pageLabel, exact: true });
  if (!(await target.isVisible().catch(() => false)) && groupLabel) {
    await navigation.getByRole("button", { name: groupLabel, exact: true }).click();
    target = navigation.getByRole("button", { name: pageLabel, exact: true });
  }
  await expect(target).toBeVisible();
  await target.click();
}

async function openWorkshopTask(page, orderLineId) {
  await openMobileTask(page, "车间移动任务", orderLineId);
}

async function openMobileTask(page, regionName, recordId) {
  const mobileNavigation = page.getByRole("navigation", { name: "现场岗位手机导航" });
  await expect(mobileNavigation).toBeVisible();
  await mobileNavigation.getByRole("button", { name: /待处理/ }).click();
  const taskRegion = page.getByRole("region", { name: regionName });
  await expect(taskRegion).not.toContainText("刷新中");
  await taskRegion.locator(".mobile-task-row").filter({ hasText: recordId }).click();
}

async function clickWithConfirm(page, locator, { accept, message }) {
  const dialogPromise = page.waitForEvent("dialog");
  const clickPromise = locator.click();
  const dialog = await dialogPromise;
  expect(dialog.type()).toBe("confirm");
  expect(dialog.message()).toContain(message);
  if (accept) await dialog.accept();
  else await dialog.dismiss();
  await clickPromise;
}

async function selectWorkbenchTabIfPresent(page, name) {
  const tab = page.getByRole("tab", { name, exact: true });
  if (await tab.count()) await tab.click();
}

async function selectProductionTask(page, productionTaskId) {
  const taskCard = page.locator(".production-task-card").filter({ hasText: productionTaskId });
  if (await taskCard.count()) {
    await taskCard.first().click();
    return;
  }
  await page.locator(".production-task-table").getByRole("button", { name: new RegExp(productionTaskId) }).click();
}

function createOnePixelPng() {
  return Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
    "base64",
  );
}
