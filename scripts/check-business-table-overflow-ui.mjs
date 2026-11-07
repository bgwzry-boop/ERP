// 窄桌面（1181/1280）下成品库存列表右侧数字必须真正可见：
// 表头与表体在同一个滚动容器里，单独滚到每个数值项再测量其是否被任一祖先裁切，
// 并校验滚动后表头与表体仍然对齐。
import assert from "node:assert/strict";
import { chromium } from "playwright";

const origin = process.env.ERP_RECEIVING_CLEANUP_UI_BASE_URL || "http://127.0.0.1:4174/";
const targets = [
  { navId: "inventory-query", label: "无纺布袋" },
  { navId: "laminated-inventory", label: "覆膜袋" },
];
const browser = await chromium.launch();
try {
  for (const width of [1181, 1280]) {
    for (const target of targets) {
      const context = await browser.newContext({ viewport: { width, height: 900 } });
      const blocked = [];
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
      await page.goto(`${origin}?erpViewport=desktop&overflow=${Date.now()}#${target.navId}`, { waitUntil: "load" });
      await page.locator(`[data-nav-id="${target.navId}"][aria-current="page"]`).waitFor({ timeout: 45000 });
      await page.waitForTimeout(1500);

      const scroller = page.locator(".finished-goods-table-scroll").first();
      await scroller.waitFor({ timeout: 10000 });
      const columns = await page.evaluate(() => {
        const head = document.querySelector(".finished-goods-table .finished-inventory-row.head");
        return [...head.querySelectorAll(":scope > span")].length;
      });
      assert.ok(columns >= 5, `${target.label} 列数异常: ${columns}`);
      for (let column = 0; column < columns; column += 1) {
        const result = await page.evaluate((col) => {
          const scrollerEl = document.querySelector(".finished-goods-table-scroll");
          const head = document.querySelector(".finished-goods-table .finished-inventory-row.head");
          const headCell = head.querySelectorAll(":scope > span")[col];
          const row = document.querySelector(".finished-goods-table .finished-inventory-row:not(.head)");
          const cell = row ? row.querySelectorAll(":scope > span")[col] : null;
          if (!cell) return null;
          // 先把共享滚动容器滚到这一列完整可见，再测量
          scrollerEl.scrollLeft = Math.max(0, Math.round(cell.offsetLeft + cell.offsetWidth - scrollerEl.clientWidth + 4));
          const rect = cell.getBoundingClientRect();
          let clippedBy = null;
          for (let node = cell.parentElement; node; node = node.parentElement) {
            const style = getComputedStyle(node);
            const box = node.getBoundingClientRect();
            if (rect.right > box.right + 1 && (style.overflowX === "hidden" || style.overflow === "hidden")) { clippedBy = node.className || node.tagName; break; }
            if (rect.right > window.innerWidth + 1) { clippedBy = "viewport"; break; }
          }
          return {
            text: cell.textContent.replace(/\s+/g, " ").trim().slice(0, 24),
            clippedBy,
            headerLeft: Math.round(headCell.getBoundingClientRect().left),
            cellLeft: Math.round(rect.left),
            scrollLeft: Math.round(scrollerEl.scrollLeft),
          };
        }, column);
        if (!result) continue;
        assert.equal(result.clippedBy, null, `${target.label} ${width} 第 ${column} 列被 ${result.clippedBy} 裁切: ${result.text}`);
        assert.equal(result.headerLeft, result.cellLeft, `${target.label} ${width} 第 ${column} 列滚动后表头与表体未对齐`);
      }
      assert.deepEqual(blocked, [], `不得发生业务写入: ${JSON.stringify(blocked)}`);
      assert.deepEqual(errors, [], `页面不得报错: ${JSON.stringify(errors)}`);
      await context.close();
      console.log(`ok ${target.label} ${width}: ${columns} 列可见且对齐`);
    }
  }
  console.log("Business table overflow checks passed: finished-goods header/body share scroll, cells not clipped, aligned after scroll.");
} finally {
  await browser.close();
}
