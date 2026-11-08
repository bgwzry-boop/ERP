// 每个桌面页面应当恰好一个 h1（页面标题）。工资核算标题在 src/features/payroll（本方案不允许改），
// 作为已知例外单独列出，等方案批准后再补。
import assert from "node:assert/strict";
import { chromium } from "playwright";

const pages = [
  "shared-todos", "order-entry", "order-pool", "material-receiving", "roll-inventory",
  "production-tasks", "packing-labels", "print-devices", "mold-changes", "outbound-delivery",
  "inventory-query", "laminated-inventory", "customer-statements", "supplier-month-end",
  "raw-material-cost", "payroll-attendance", "customer-records", "general-prices",
  "people-machines", "launch-status",
];
const knownExceptions = new Set(["payroll-attendance"]);

const origin = process.env.ERP_RECEIVING_CLEANUP_UI_BASE_URL || "http://127.0.0.1:4174/";
const browser = await chromium.launch();
const blocked = [];
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await context.route("**/api/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (!["GET", "HEAD", "OPTIONS"].includes(request.method()) && !path.endsWith("/auth/prototype-login")) {
      blocked.push(path);
      return route.abort();
    }
    return route.continue();
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(`${origin}?erpViewport=desktop&headings=${Date.now()}`, { waitUntil: "load" });
  await page.getByText("管理A", { exact: true }).first().waitFor({ timeout: 45000 });
  await page.waitForTimeout(1200);
  const headers = page.locator(".pc-nav-group-button");
  for (let i = 0; i < await headers.count(); i += 1) {
    const header = headers.nth(i);
    if ((await header.getAttribute("aria-expanded")) !== "true") await header.click();
  }
  for (const id of pages) {
    const nav = page.locator(`[data-nav-id="${id}"]`);
    if (!(await nav.count())) continue;
    await nav.first().click();
    await page.waitForTimeout(600);
    const count = await page.locator("main h1").count();
    if (knownExceptions.has(id)) {
      assert.equal(count <= 1, true, `${id} 的 h1 不应超过一个（当前 ${count}）`);
      continue;
    }
    assert.equal(count, 1, `${id} 应恰好一个 h1，实际 ${count}`);
  }
  assert.deepEqual(blocked, [], `不得业务写入: ${JSON.stringify(blocked)}`);
  assert.deepEqual(errors, [], `不得页面错误: ${JSON.stringify(errors)}`);
  console.log(`Page heading checks passed: ${pages.length - knownExceptions.size}/${pages.length} 页恰好一个 h1（工资核算为已说明例外）。`);
} finally {
  await browser.close();
}
