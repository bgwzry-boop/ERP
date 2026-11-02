import { expect, test } from "@playwright/test";

const browserErrors = new WeakMap();
test.beforeEach(({ page }) => {
  const errors = [];
  browserErrors.set(page, errors);
  page.on("pageerror", (error) => errors.push(error.message));
});
test.afterEach(({ page }) => {
  expect(browserErrors.get(page)).toEqual([]);
});

test("4174 收货录入按业务字段扫描并显示把条宽幅", async ({ page }) => {
  await page.goto("/?erpReviewCheck=playwright-receipt&erpViewport=desktop#material-receiving");

  await expect(page).toHaveTitle(/本地未部署 · 袋袋赢 ERP 完整评审稿/);
  await expect(page.locator('meta[name="erp-app-id"]')).toHaveAttribute("content", "bagwin-complete-review-4174");
  // Since the 2026-11-02 redesign the receipt list is a paged queue, not a six-column table.
  const queue = page.getByRole("region", { name: "收货单据队列" });
  await expect(queue.getByRole("tablist", { name: "收货状态" }).getByRole("tab")).toHaveText([/^全部/, /^待核对/, /^退货单/, /^待打印/, /^待贴标/, /^异常/]);
  await expect(queue.getByLabel("搜索送货单位或单号")).toBeVisible();

  await queue.getByRole("tab", { name: /^异常/ }).click();
  const handleStripReceipt = queue.locator("button.receipt-queue-item").filter({ has: page.locator('[title*="RMI-0704-003"]') });
  await expect(handleStripReceipt).toBeVisible();
  await handleStripReceipt.click();

  const facts = page.locator(".formal-receiving-workspace .receipt-facts");
  await expect(facts.locator("div").filter({ has: page.locator("dt", { hasText: /^类型$/ }) }).locator("dd")).toHaveText("把条");
  await expect(facts.locator("div").filter({ has: page.locator("dt", { hasText: /^宽幅$/ }) }).locator("dd")).toHaveText("5cm");
  await expect(page.locator(".formal-receiving-workspace")).toContainText("公斤待补");
  await expect(page.locator(".office-roll-table .office-roll-row")).toHaveCount(4);
  const tableFits = await page.locator(".office-roll-table").evaluate((table) => table.scrollWidth <= table.clientWidth + 1);
  expect(tableFits).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(0);
});

test("4174 卷料库存按宽幅和克重显示把条默认规格", async ({ page }) => {
  // A presentation-only fixture supplies a positive-weight, labelled roll.
  // The original zero-weight receipt remains blocked in the real API.
  await page.route("**/api/raw-material-inbounds?*", async (route) => {
    const response = await route.fetch();
    const body = await response.json();
    const inbound = body.items.find((item) => item.id === "RMI-0704-003");
    expect(inbound).toBeTruthy();
    const roll = inbound.rolls.find((item) => item.id === "RM-240704-003-01");
    expect(roll).toBeTruthy();
    Object.assign(roll, { weightKg: 12, labelStatus: "已贴标", inventoryStatus: "可用" });
    inbound.status = "已贴标/可用库存";
    await route.fulfill({ response, json: body });
  });
  await page.goto("/?erpReviewCheck=playwright-roll-spec&erpViewport=desktop#roll-inventory");

  await expect(page.getByRole("columnheader", { name: "规格（宽幅/克重）" })).toBeVisible();
  const handleStripRow = page.getByRole("row", { name: /RM-240704-003-01/ });
  await expect(handleStripRow).toBeVisible();
  await expect(handleStripRow.locator(".roll-spec-cell > strong")).toHaveText("5cm 把条");
  await expect(handleStripRow.locator(".roll-spec-cell > small")).toHaveText("65克");
  await expect(handleStripRow.locator(".roll-spec-cell")).not.toContainText("78克");
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(0);
});

test("714px 电脑收货详情仍使用办公室流程而不是手机核对页", async ({ page }) => {
  await page.setViewportSize({ width: 714, height: 900 });
  await page.goto("/?erpReviewCheck=narrow-receiving#material-receiving");
  await expect(page.locator("html")).toHaveAttribute("data-erp-runtime-family", "desktop");
  await expect(page.locator(".formal-receiving-workspace .office-inbound-flow")).toBeVisible();
  await expect(page.locator(".formal-receiving-workspace .raw-material-mobile-ocr-review")).toHaveCount(0);
  await expect(page.locator(".receiving-workbench button.receipt-queue-item").first()).toBeAttached();
});
