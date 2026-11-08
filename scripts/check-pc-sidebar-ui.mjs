// 侧栏不再藏内容：首次只展开当前组、底部提示隐藏组数、当前项是左色条、全部收起可用。
import assert from "node:assert/strict";
import { chromium } from "playwright";

const origin = process.env.ERP_RECEIVING_CLEANUP_UI_BASE_URL || "http://127.0.0.1:4174/";
const browser = await chromium.launch();
const blocked = [];
try {
  const openPage = async (height) => {
    const context = await browser.newContext({ viewport: { width: 1440, height } });
    await context.route("**/api/**", async (route) => {
      const request = route.request();
      const path = new URL(request.url()).pathname;
      if (!["GET", "HEAD", "OPTIONS"].includes(request.method()) && !path.endsWith("/auth/prototype-login")) {
        blocked.push({ method: request.method(), path });
        return route.abort();
      }
      return route.continue();
    });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(`${origin}?erpViewport=desktop&sidebar=${Date.now()}`, { waitUntil: "load" });
    await page.getByText("管理A", { exact: true }).first().waitFor({ timeout: 45000 });
    await page.waitForTimeout(1200);
    return { context, page, errors };
  };

  // 1) 首次打开（无保存偏好）只展开当前页所在分组
  {
    const { context, page, errors } = await openPage(900);
    const expanded = await page.locator(".pc-nav-group.expanded").count();
    assert.equal(expanded, 1, `首次打开应只展开当前组，实际 ${expanded}`);
    const activeId = await page.locator("[data-nav-id][aria-current='page']").first().getAttribute("data-nav-id");
    const activeInExpanded = await page.evaluate((id) => {
      const group = document.querySelector(".pc-nav-group.expanded");
      return Boolean(group?.querySelector(`[data-nav-id="${id}"]`));
    }, activeId);
    assert.equal(activeInExpanded, true, "展开的必须是当前页所在分组");

    // 当前项：左侧 3px 橙色竖条 + 无橙色实底
    const style = await page.locator("[data-nav-id][aria-current='page']").first().evaluate((el) => {
      const cs = getComputedStyle(el);
      return { borderLeftWidth: cs.borderLeftWidth, background: cs.backgroundColor, fontWeight: cs.fontWeight };
    });
    assert.equal(style.borderLeftWidth, "3px", "当前项应有左侧 3px 色条");
    assert.notEqual(style.background, "rgb(229, 103, 45)", "当前项不再使用橙色实底");
    assert.deepEqual(errors, [], `不得有页面错误: ${JSON.stringify(errors)}`);
    await context.close();
    console.log("ok 首次只展开当前组，当前项为左色条");
  }

  // 2) 768 高：把分组展开到需要滚动时，提示出现且数字正确，点击后最后分组可见
  {
    const { context, page, errors } = await openPage(768);
    // 用户手动展开所有分组，模拟"20 项全展开"的情况
    const headers = page.locator(".pc-nav-group-button");
    for (let i = 0; i < await headers.count(); i += 1) {
      const header = headers.nth(i);
      const expanded = await header.getAttribute("aria-expanded");
      if (expanded !== "true") await header.click();
    }
    // 回到顶部，模拟用户从上往下看时"下面还有内容"的场景
    await page.evaluate(() => { const nav = document.querySelector(".pc-business-tree"); if (nav) nav.scrollTop = 0; });
    await page.waitForTimeout(500);
    const hint = page.locator(".pc-nav-more");
    await hint.waitFor({ timeout: 10000 });
    const text = await hint.innerText();
    const shown = Number(text.match(/(\d+)/)?.[1] ?? 0);
    assert.ok(shown >= 1, `提示数字应为正数，实际「${text}」`);
    const aria = await hint.getAttribute("aria-label");
    assert.match(aria, /还有 \d+ 个菜单分组/u, `aria-label 应说明剩余组数，实际「${aria}」`);
    await hint.click();
    await page.waitForTimeout(800);
    const lastVisible = await page.evaluate(() => {
      const nav = document.querySelector(".pc-business-tree");
      const groups = [...nav.querySelectorAll("[data-nav-group]")];
      const last = groups.at(-1).getBoundingClientRect();
      const box = nav.getBoundingClientRect();
      return last.bottom <= box.bottom + 2 && last.top >= box.top - 2;
    });
    assert.equal(lastVisible, true, "点击提示后最后一个分组必须可见");
    assert.deepEqual(errors, []);
    await context.close();
    console.log(`ok 768 高提示 ${shown} 组，点击后最后分组可见`);
  }

  // 3) 全部收起：只保留当前组
  {
    const { context, page } = await openPage(900);
    await page.locator(".pc-nav-collapse-all").click();
    await page.waitForTimeout(400);
    const expanded = await page.locator(".pc-nav-group.expanded").count();
    assert.equal(expanded, 1, `全部收起后应只保留当前组，实际 ${expanded}`);
    const activeVisible = await page.locator("[data-nav-id][aria-current='page']").count();
    assert.equal(activeVisible, 1, "当前页必须仍可见");
    await context.close();
    console.log("ok 全部收起保留当前组");
  }

  assert.deepEqual(blocked, [], `不得业务写入: ${JSON.stringify(blocked)}`);
  console.log("PC sidebar checks passed: default-collapsed groups, hidden-group hint, left-bar active item, collapse-all.");
} finally {
  await browser.close();
}
