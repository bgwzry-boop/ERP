import { expect, test } from "@playwright/test";

test("4174 收货录入按业务字段扫描并显示把条宽幅", async ({ page }) => {
  await page.goto("/?erpReviewCheck=playwright-receipt&erpViewport=desktop#material-receiving");

  await expect(page).toHaveTitle(/本地未部署 · 袋袋赢 ERP 完整评审稿/);
  await expect(page.locator('meta[name="erp-app-id"]')).toHaveAttribute("content", "bagwin-complete-review-4174");
  await expect(page.locator(".receipt-row.head > *")).toHaveText([
    "送货单位 / 票据",
    "送货时间",
    "卷/件数",
    "总重量",
    "复核入库",
    "查重结果",
  ]);

  await page.getByRole("tab", { name: /异常/ }).click();
  const handleStripReceipt = page.locator("button.receipt-row", { hasText: "RMI-0704-003" });
  await expect(handleStripReceipt).toBeVisible();
  await handleStripReceipt.click();

  const facts = page.locator(".receipt-facts > div");
  await expect(facts.nth(0).locator("dt")).toHaveText("类型");
  await expect(facts.nth(0).locator("dd")).toHaveText("把条");
  await expect(facts.nth(1).locator("dt")).toHaveText("宽幅");
  await expect(facts.nth(1).locator("dd")).toHaveText("5cm");
  await expect(page.locator(".receipt-detail")).toContainText("缺少真实重量，尚未入库");
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(0);
});

test("4174 卷料库存按宽幅和克重显示把条默认规格", async ({ page }) => {
  // Supply a weighed, reviewed roll through the read boundary. The real seed's
  // zero-weight handle receipt must stay excluded from warehouse inventory.
  await page.route("**/api/raw-material-inbounds?*", async (route) => {
    const response = await route.fetch();
    const data = await response.json();
    const receipt = data.items.find((item) => item.id === "RMI-0704-003");
    expect(receipt).toBeTruthy();
    data.items.push({
      ...receipt,
      id: "RMI-E2E-WEIGHED-HANDLE",
      status: "已贴标/可用库存",
      rollCount: 1,
      totalWeightKg: 12.5,
      rolls: [{
        ...receipt.rolls[0],
        id: "RM-E2E-HANDLE-01",
        weightKg: 12.5,
        inventoryStatus: "可用",
        labelStatus: "已贴标/可用库存",
        location: "原材料仓库",
      }],
    });
    await route.fulfill({ response, json: data });
  });
  await page.goto("/?erpReviewCheck=playwright-roll-spec&erpViewport=desktop#roll-inventory");

  await expect(page.getByRole("columnheader", { name: "规格（宽幅/克重）" })).toBeVisible();
  const handleStripRow = page.getByRole("row", { name: /RM-E2E-HANDLE-01/ });
  await expect(handleStripRow).toBeVisible();
  await expect(page.getByRole("row", { name: /RM-240704-003-01/ })).toHaveCount(0);
  await expect(handleStripRow.locator(".roll-spec-cell > strong")).toHaveText("5cm 把条");
  await expect(handleStripRow.locator(".roll-spec-cell > small")).toHaveText("65克");
  await expect(handleStripRow.locator(".roll-spec-cell")).not.toContainText("78克");
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(0);
});
