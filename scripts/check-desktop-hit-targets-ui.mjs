// 桌面列表的可点击目标至少 32×32（侧栏与手机端不在此检查范围内）。
import assert from "node:assert/strict";
import { chromium } from "playwright";

const pages = ["order-pool", "outbound-delivery", "inventory-query", "material-receiving", "customer-records"];
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
  await page.goto(`${origin}?erpViewport=desktop&hit=${Date.now()}`, { waitUntil: "load" });
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
    await page.waitForTimeout(800);
    const small = await page.evaluate(() => {
      const inside = (el) => !el.closest("aside.sidebar");
      return [...document.querySelectorAll("main button")]
        .filter((button) => inside(button))
        .map((button) => {
          const rect = button.getBoundingClientRect();
          return { text: (button.textContent || button.getAttribute("aria-label") || "").trim().slice(0, 12), w: Math.round(rect.width), h: Math.round(rect.height) };
        })
        .filter((item) => item.w > 0 && item.h > 0 && (item.w < 32 || item.h < 32));
    });
    assert.deepEqual(small, [], `${id} 存在小于 32×32 的点击目标: ${JSON.stringify(small.slice(0, 6))}`);
  }
  assert.deepEqual(blocked, [], `不得业务写入: ${JSON.stringify(blocked)}`);
  assert.deepEqual(errors, [], `不得页面错误: ${JSON.stringify(errors)}`);
  console.log(`Desktop hit-target checks passed: ${pages.length} 页所有可见按钮 ≥32×32。`);
} finally {
  await browser.close();
}
