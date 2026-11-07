// 1181 窄桌面下，列表右侧数字必须真正可见：表头与表体共用横向滚动，
// 单元格不得被任何祖先裁切；滚动后表头与表体仍对齐。
import assert from "node:assert/strict";
import { chromium } from "playwright";

const origin = process.env.ERP_RECEIVING_CLEANUP_UI_BASE_URL || "http://127.0.0.1:4174/";
const browser = await chromium.launch();
try {
  const context = await browser.newContext({ viewport: { width: 1181, height: 900 } });
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
  await page.goto(`${origin}?erpViewport=desktop&overflow=${Date.now()}#inventory-query`, { waitUntil: "load" });
  await page.locator('[data-nav-id="inventory-query"][aria-current="page"]').waitFor({ timeout: 45000 });
  await page.waitForTimeout(1500);

  const geometry = await page.evaluate(() => {
    const scroller = document.querySelector(".business-table-scroll");
    const table = document.querySelector(".business-table");
    const items = [...document.querySelectorAll(".inventory-allocation-legend > *")].slice(0, 12);
    const clippedBy = (element) => {
      const rect = element.getBoundingClientRect();
      for (let node = element.parentElement; node; node = node.parentElement) {
        const style = getComputedStyle(node);
        const box = node.getBoundingClientRect();
        const hidden = style.overflowX === "hidden" || style.overflow === "hidden";
        if (rect.right > box.right + 1) {
          if (hidden) return node.className || node.tagName;
          if (box.right < document.documentElement.clientWidth) return node.className || node.tagName;
        }
      }
      return null;
    };
    return {
      paneWidth: Math.round(document.querySelector(".business-list-panel")?.getBoundingClientRect().width ?? 0),
      scrollerClientWidth: scroller?.clientWidth ?? 0,
      scrollerScrollWidth: scroller?.scrollWidth ?? 0,
      tableWidth: Math.round(table?.getBoundingClientRect().width ?? 0),
      items: items.map((element) => ({
        text: element.textContent.replace(/\s+/g, " ").trim(),
        right: Math.round(element.getBoundingClientRect().right),
        clippedBy: clippedBy(element),
      })),
    };
  });
  assert.ok(geometry.items.length, `库存结构图例应有条目，实际 ${JSON.stringify(geometry)}`);
  for (const item of geometry.items) {
    assert.equal(item.clippedBy, null, `图例项被 ${item.clippedBy} 裁切: ${item.text}`);
  }
  assert.ok(geometry.tableWidth >= 560, `表格内容宽度被压缩: ${geometry.tableWidth}`);
  if (geometry.scrollerScrollWidth > geometry.scrollerClientWidth) {
    await page.evaluate(() => { const el = document.querySelector(".business-table-scroll"); el.scrollLeft = el.scrollWidth; });
    await page.waitForTimeout(300);
    const after = await page.evaluate(() => {
      const scroller = document.querySelector(".business-table-scroll");
      const firstHeader = document.querySelector(".business-head [role=columnheader]");
      const firstCell = document.querySelector(".business-table-body [role=row] [role=cell]");
      return {
        scrollLeft: scroller.scrollLeft,
        headerLeft: Math.round(firstHeader.getBoundingClientRect().left),
        cellLeft: Math.round(firstCell.getBoundingClientRect().left),
      };
    });
    assert.ok(after.scrollLeft > 0, "窄屏应能横向滚动");
    assert.equal(after.headerLeft, after.cellLeft, "滚动后表头与表体必须对齐");
  }
  assert.deepEqual(blocked, [], `不得发生业务写入: ${JSON.stringify(blocked)}`);
  assert.deepEqual(errors, [], `页面不得报错: ${JSON.stringify(errors)}`);
  console.log("Business table overflow checks passed: numbers not clipped, header/body share scroll, aligned after scroll.");
} finally {
  await browser.close();
}
