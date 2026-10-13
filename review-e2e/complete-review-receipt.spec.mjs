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

  await page.getByRole("tab", { name: /待贴标/ }).click();
  const handleStripReceipt = page.locator("button.receipt-row", { hasText: "RMI-0704-003" });
  await expect(handleStripReceipt).toBeVisible();
  await handleStripReceipt.click();

  const facts = page.locator(".receipt-facts > div");
  await expect(facts.nth(0).locator("dt")).toHaveText("类型");
  await expect(facts.nth(0).locator("dd")).toHaveText("把条");
  await expect(facts.nth(1).locator("dt")).toHaveText("宽幅");
  await expect(facts.nth(1).locator("dd")).toHaveText("5cm");
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(0);
});

test("4174 卷料库存按宽幅和克重显示把条默认规格", async ({ page }) => {
  await page.goto("/?erpReviewCheck=playwright-roll-spec&erpViewport=desktop#roll-inventory");

  await expect(page.getByRole("columnheader", { name: "规格（宽幅/克重）" })).toBeVisible();
  const handleStripRow = page.getByRole("row", { name: /RM-240704-003-01/ });
  await expect(handleStripRow).toBeVisible();
  await expect(handleStripRow.locator(".roll-spec-cell > strong")).toHaveText("5cm 把条");
  await expect(handleStripRow.locator(".roll-spec-cell > small")).toHaveText("65克");
  await expect(handleStripRow.locator(".roll-spec-cell")).not.toContainText("78克");
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(0);
});
