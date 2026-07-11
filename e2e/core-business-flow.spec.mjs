import { expect, test } from "@playwright/test";

const apiBaseUrl = `http://127.0.0.1:${process.env.ERP_E2E_API_PORT ?? 18787}/api`;
const operatorId = "U-MANAGER-A";
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

async function apiGet(request, path) {
  const response = await request.get(`${apiBaseUrl}${path}`, {
    headers: { "x-erp-user-id": operatorId },
  });
  expect(response.ok(), `${path} 应返回成功，实际 ${response.status()}`).toBe(true);
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

function createOnePixelPng() {
  return Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
    "base64",
  );
}
