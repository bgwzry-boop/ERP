// 订单录入未保存内容离开守卫：真实评审壳 4174 上的浏览器回归。
// 覆盖：侧栏导航取消保留 / 接受后返回不注入旧示例 / hash 离开取消后地址回退。
import assert from "node:assert/strict";
import { chromium } from "playwright";

const origin = process.env.ERP_RECEIVING_CLEANUP_UI_BASE_URL || "http://127.0.0.1:4174/";
const blockedWrites = [];
const pageErrors = [];
const browser = await chromium.launch();
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await context.route("**/api/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    // 允许签名预览身份交换，其它写请求一律拦截。
    if (!["GET", "HEAD", "OPTIONS"].includes(request.method()) && !path.endsWith("/auth/prototype-login")) {
      blockedWrites.push({ method: request.method(), path });
      return route.abort();
    }
    return route.continue();
  });
  const page = await context.newPage();
  page.on("pageerror", (error) => pageErrors.push(error.message));
  const openEntry = async () => {
    await page.goto(`${origin}?erpViewport=desktop&dirtyLeave=${Date.now()}#order-entry`, { waitUntil: "load" });
    await page.locator('[data-nav-id="order-entry"][aria-current="page"]').waitFor({ timeout: 45000 });
    await page.waitForTimeout(1200);
  };
  const input = () => page.locator("textarea").first();
  const modal = () => page.getByRole("alertdialog");

  await openEntry();
  const original = await input().inputValue();
  await input().fill("3037 红 500 个 黄松");

  // 1) 侧栏离开 -> 确认框 -> 取消，保留未保存原文并留在本页
  await page.locator('[data-nav-id="order-pool"]').click();
  await modal().waitFor({ timeout: 8000 });
  assert.match(await modal().innerText(), /离开订单录入/u);
  await modal().getByRole("button", { name: /继续编辑/u }).click();
  await page.waitForTimeout(400);
  assert.equal(await input().inputValue(), "3037 红 500 个 黄松", "取消必须保留未保存原文");
  assert.equal(await page.locator('[data-nav-id="order-entry"][aria-current="page"]').count(), 1, "取消后仍留在订单录入");

  // 2) 接受离开 -> 返回时必须是空白新单，不能自动灌回旧示例
  await page.locator('[data-nav-id="order-pool"]').click();
  await modal().waitFor({ timeout: 8000 });
  await modal().getByRole("button", { name: /放弃并离开/u }).click();
  await page.locator('[data-nav-id="order-pool"][aria-current="page"]').waitFor({ timeout: 8000 });
  await page.locator('[data-nav-id="order-entry"]').click();
  await page.locator('[data-nav-id="order-entry"][aria-current="page"]').waitFor({ timeout: 8000 });
  await page.waitForTimeout(1200);
  assert.equal(await input().inputValue(), "", "确认离开后不得自动注入旧示例文本");

  // 3) hash 离开 -> 取消后地址回退到订单录入、原文保留
  await input().fill("3037 蓝 300 个");
  await page.evaluate(() => { window.location.hash = "order-pool"; });
  await modal().waitFor({ timeout: 8000 });
  await modal().getByRole("button", { name: /继续编辑/u }).click();
  await page.waitForTimeout(400);
  assert.equal(await page.evaluate(() => window.location.hash), "#order-entry", "取消后地址必须回到订单录入");
  assert.equal(await input().inputValue(), "3037 蓝 300 个", "hash 取消同样保留原文");

  // 4) 编辑器占用中（识别请求未回）时，hash 不得把页面带走
  await input().fill("3037 红 500 个");
  await page.route("**/api/order-drafts/recognize**", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 1500));
    return route.abort();
  });
  await page.getByRole("button", { name: /识别客户消息|按原内容重试识别/u }).click();
  await page.waitForTimeout(200);
  await page.evaluate(() => { window.location.hash = "order-pool"; });
  await page.waitForTimeout(600);
  assert.equal(await page.locator('[data-nav-id="order-entry"][aria-current="page"]').count(), 1, "编辑器占用时不得离开订单录入");
  assert.equal(await modal().count(), 0, "占用状态不应弹确认框");
  await page.waitForTimeout(1600);

  // 5) 确认框打开后再改 hash：只允许一个提示，取消后地址回到原页
  await page.unroute("**/api/order-drafts/recognize**").catch(() => {});
  await openEntry();
  await input().fill("3037 红 500 个 黄松");
  await page.locator('[data-nav-id="order-pool"]').click();
  await modal().waitFor({ timeout: 8000 });
  await page.evaluate(() => { window.location.hash = "shared-todos"; });
  await page.waitForTimeout(600);
  assert.equal(await modal().count(), 1, "重复导航不得叠加第二个确认框");
  await modal().getByRole("button", { name: /继续编辑/u }).click();
  await page.waitForTimeout(600);
  assert.equal(await modal().count(), 0, "取消后不得残留第二个确认框");
  assert.equal(await page.evaluate(() => window.location.hash), "#order-entry", "取消后地址必须回到订单录入");
  assert.equal(await input().inputValue(), "3037 红 500 个 黄松", "取消后原文仍在");

  assert.deepEqual(blockedWrites, [], `不得发生业务写入: ${JSON.stringify(blockedWrites)}`);
  assert.deepEqual(pageErrors, [], `页面不得报错: ${JSON.stringify(pageErrors)}`);
  void original;
  console.log("Order entry dirty-leave UI checks passed: cancel keeps source, accept clears local edit, hash reverts, zero writes.");
} finally {
  await browser.close();
}
