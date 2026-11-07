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
        return [...head.children].length;
      });
      assert.ok(columns >= 5, `${target.label} 列数异常: ${columns}`);
      for (let column = 0; column < columns; column += 1) {
        const result = await page.evaluate((col) => {
          const scrollerEl = document.querySelector(".finished-goods-table-scroll");
          const head = document.querySelector(".finished-goods-table .finished-inventory-row.head");
          const headCell = head.children[col];
          const row = document.querySelector(".finished-goods-table button.finished-inventory-row");
          if (!row) throw new Error("没有明细行");
          // 用 children：第 5 格是 <strong>、第 6 格是 <div>，用 span 会静默跳过
          if (row.children.length !== 6) throw new Error(`明细行应为 6 格，实际 ${row.children.length}`);
          const cell = row.children[col];
          if (!cell) throw new Error(`第 ${col} 格不存在`);
          const legendItems = [...cell.querySelectorAll(".inventory-allocation-legend > *")].map((item) => {
            const text = item.textContent.replace(/\s+/g, " ").trim();
            const match = text.match(/^(可用|占用|锁定|待处理)\s*(.+)$/u);
            const box = item.getBoundingClientRect();
            return {
              label: match ? match[1] : text,
              value: match ? match[2].replace(/[（(].*$/u, "").trim() : "",
              visible: box.width > 0 && box.height > 0,
            };
          });
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
            legendItems,
            cellText: cell.textContent.trim(),
          };
        }, column);

        assert.ok(result.cellText.length > 0, `${target.label} ${width} 第 ${column} 列不得为空`);
        if (column === 5) {
          const legend = result.legendItems || [];
          assert.ok(legend.length >= 4, `${target.label} 图例应有 4 项，实际 ${JSON.stringify(legend)}`);
          const labels = legend.map((item) => item.label);
          for (const keyword of ["可用", "占用", "锁定", "待处理"]) {
            assert.ok(labels.includes(keyword), `${target.label} 图例缺少「${keyword}」: ${JSON.stringify(legend)}`);
          }
          for (const item of legend) {
            assert.ok(item.value.length > 0, `${target.label} 图例「${item.label}」数值为空`);
            assert.match(item.value, /^[\d,]+$/u, `${target.label} 图例「${item.label}」数值不完整: ${item.value}`);
            assert.ok(item.visible, `${target.label} 图例「${item.label}」不可见`);
          }
        }
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
