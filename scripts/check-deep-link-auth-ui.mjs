// 冷启动深链必须在真实身份就绪后才应用：合法目标保留并选中，
// 未知目标在认证后改写为真实默认页；认证前不得因默认 office 权限改写地址。
import assert from "node:assert/strict";
import { chromium } from "playwright";

const origin = process.env.ERP_RECEIVING_CLEANUP_UI_BASE_URL || "http://127.0.0.1:4174/";
const browser = await chromium.launch();
try {
  const open = async (hash) => {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const blocked = [];
    await context.route("**/api/**", async (route) => {
      const request = route.request();
      const path = new URL(request.url()).pathname;
      if (path.endsWith("/auth/prototype-login")) {
        // 延迟签发身份，观察认证前的地址行为
        await new Promise((resolve) => setTimeout(resolve, 1500));
        return route.continue();
      }
      if (!["GET", "HEAD", "OPTIONS"].includes(request.method())) {
        blocked.push(path);
        return route.abort();
      }
      return route.continue();
    });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(`${origin}?erpViewport=desktop&deep=${Date.now()}${hash}`, { waitUntil: "domcontentloaded" });
    return { context, page, blocked, errors };
  };

  // 1) 合法深链：认证前保持原地址，认证后必须选中该页
  {
    const { context, page, blocked, errors } = await open("#roll-inventory");
    await page.waitForTimeout(600);
    assert.equal(await page.evaluate(() => window.location.hash), "#roll-inventory", "认证前不得改写合法深链");
    await page.locator('[data-nav-id="roll-inventory"][aria-current="page"]').waitFor({ timeout: 45000 });
    assert.equal(await page.evaluate(() => window.location.hash), "#roll-inventory", "认证后地址仍是目标页");
    assert.match(await page.locator("main").innerText(), /卷料库存/u);
    assert.deepEqual(blocked, [], "不得业务写入");
    assert.deepEqual(errors, [], "不得报错");
    await context.close();
    console.log("ok cold deep-link allowed: #roll-inventory 保留并选中");
  }

  // 2) 未知深链：认证前也不得提前改写，认证后回落到真实默认页
  {
    const { context, page, blocked, errors } = await open("#definitely-unknown-route");
    await page.waitForTimeout(600);
    await page.locator('[data-nav-id][aria-current="page"]').first().waitFor({ timeout: 45000 });
    await page.waitForFunction(() => window.location.hash !== "#definitely-unknown-route", { timeout: 15000 });
    const finalHash = await page.evaluate(() => window.location.hash);
    assert.notEqual(finalHash, "#definitely-unknown-route", "未知地址最终必须被改写");
    const selected = await page.locator('[data-nav-id][aria-current="page"]').first().getAttribute("data-nav-id");
    assert.equal(finalHash, `#${selected}`, "改写后的地址必须与选中页一致");
    assert.deepEqual(blocked, [], "不得业务写入");
    assert.deepEqual(errors, [], "不得报错");
    await context.close();
    console.log(`ok cold deep-link unknown: 改写为 ${finalHash}`);
  }
  console.log("Deep-link auth checks passed: intent preserved until auth, unknown resolved after.");
} finally {
  await browser.close();
}
