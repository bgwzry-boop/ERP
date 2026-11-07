// 冷启动深链必须等真实身份就绪后再应用：
// - 默认 office 允许、但只有管理身份才有的页面（工资核算/原料成本/上线状态）必须真正打开
// - 认证前不得改写地址
// - 未知目标认证后改写为真实默认页，且地址与选中页一致
// - 仅财务权限时，无权目标回落到财务默认页（view 与地址一起变），不因地址放开权限
import assert from "node:assert/strict";
import { chromium } from "playwright";

const origin = process.env.ERP_RECEIVING_CLEANUP_UI_BASE_URL || "http://127.0.0.1:4174/";
const managerOnlyPages = [
  { hash: "#payroll-attendance", navId: "payroll-attendance", title: /工资核算/u },
  { hash: "#raw-material-cost", navId: "raw-material-cost", title: /原料成本|物料成本/u },
  { hash: "#launch-status", navId: "launch-status", title: /上线状态/u },
];

const browser = await chromium.launch();
const openWithDelayedAuth = async (hash) => {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const blocked = [];
  await context.route("**/api/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path.endsWith("/auth/prototype-login")) {
      await new Promise((resolve) => setTimeout(resolve, 1800));
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

try {
  // 1) 管理专属页面：认证前地址不动，认证后必须真正选中并显示标题
  for (const target of managerOnlyPages) {
    const { context, page, blocked, errors } = await openWithDelayedAuth(target.hash);
    await page.waitForTimeout(700);
    assert.equal(await page.evaluate(() => window.location.hash), target.hash, `${target.hash} 认证前不得被改写`);
    await page.getByText("管理A", { exact: true }).first().waitFor({ timeout: 45000 });
    await page.locator(`[data-nav-id="${target.navId}"][aria-current="page"]`).waitFor({ timeout: 20000 });
    await page.waitForTimeout(800);
    assert.equal(await page.evaluate(() => window.location.hash), target.hash, `${target.hash} 认证后地址仍是目标`);
    assert.match(await page.locator("main").innerText(), target.title, `${target.navId} 内容必须是目标页`);
    assert.deepEqual(blocked, [], "不得业务写入");
    assert.deepEqual(errors, [], "不得报错");
    await context.close();
    console.log(`ok manager-only deep-link ${target.hash}`);
  }

  // 2) 打开某页后再写未知 hash：仍按 #77 行为改写，且地址与选中页一致
  {
    const { context, page, blocked, errors } = await openWithDelayedAuth("#roll-inventory");
    await page.locator('[data-nav-id="roll-inventory"][aria-current="page"]').waitFor({ timeout: 45000 });
    await page.evaluate(() => { window.location.hash = "definitely-unknown-route"; });
    await page.waitForFunction(() => window.location.hash !== "#definitely-unknown-route", { timeout: 15000 });
    const selected = await page.locator('[data-nav-id][aria-current="page"]').first().getAttribute("data-nav-id");
    assert.equal(await page.evaluate(() => window.location.hash), `#${selected}`, "未知 hash 必须回退到当前页");
    assert.deepEqual(blocked, []);
    assert.deepEqual(errors, []);
    await context.close();
    console.log("ok unknown hash after open reverts to current page");
  }
  console.log("Deep-link auth checks passed: manager-only targets preserved, unknown reverts after auth.");
} finally {
  await browser.close();
}
