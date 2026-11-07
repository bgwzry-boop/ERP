// 成品库存列表（无纺布袋/覆膜袋）在窄桌面的几何回归。
// 用组件夹具而不是线上 GET 数据：两类库存各 30 行，可用/占用/锁定/待处理四项都为正，
// 断言 6 格齐全、图例四项数值精确、首行与末行时表头固定、横向滚动后不被祖先裁切。
import assert from "node:assert/strict";
import { build } from "esbuild";
import { chromium } from "playwright";
import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

const quantities = { inStock: 10000, reserved: 2345, locked: 3456, pending: 1234 };
const expectedLegend = [
  { label: "可用", value: 2965 },
  { label: "占用", value: 2345 },
  { label: "锁定", value: 3456 },
  { label: "待处理", value: 1234 },
];
const stock = (category, count) => Array.from({ length: count }, (_, index) => ({
  id: `INV-FIXTURE-${category}-${index}`,
  inventoryItemId: `INV-FIXTURE-${category}-${index}`,
  category,
  goodsType: "纯色通货",
  size: "30*38*10",
  color: "红色",
  handle: "普通提",
  style: "空白袋",
  zone: "A区",
  pattern: "—",
  ...quantities,
  state: "仓库已清点",
  trustLevel: "已清点",
}));

const css = [
  "src/styles/tokens.css",
  "src/styles/semantic-tags.css",
  "docs/prototypes/raw-material-roll-inventory-review/src/styles.css",
  "docs/prototypes/raw-material-roll-inventory-review/src/business-workspaces.css",
  "docs/prototypes/raw-material-roll-inventory-review/src/brand-refresh.css",
  "docs/prototypes/raw-material-roll-inventory-review/src/narrow-desktop.css",
];
const cssText = (await Promise.all(css.map(read))).join("\n");

const entry = `
import React from "react";
import { createRoot } from "react-dom/client";
import { BusinessWorkspace } from "./docs/prototypes/raw-material-roll-inventory-review/src/BusinessWorkspaces.jsx";
window.renderFixture = (navId, items) => {
  const root = createRoot(document.getElementById("root"));
  root.render(<BusinessWorkspace formal={{ data: { inventoryItems: items, statements: [], orderLines: [] }, actions: { refreshAll: () => {} }, meta: {}, permissionContext: {} }} navId={navId} onNavigate={() => {}} />);
};
`;
const bundle = await build({
  absWorkingDir: new URL("../", import.meta.url).pathname,
  stdin: { contents: entry, resolveDir: new URL("../", import.meta.url).pathname, loader: "jsx", sourcefile: "overflow-fixture.jsx" },
  bundle: true, write: false, platform: "browser", format: "iife", jsx: "automatic",
  define: { "import.meta.env": "{}" }, loader: { ".css": "empty" },
});

const browser = await chromium.launch();
try {
  for (const width of [1181, 1280]) {
    for (const target of [
      { navId: "inventory-query", category: "无纺布袋" },
      { navId: "laminated-inventory", category: "覆膜无纺布袋" },
    ]) {
      const page = await browser.newPage({ viewport: { width, height: 900 } });
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await page.route("**/*", (route) => route.abort());
      await page.setContent(`<style>${cssText}</style><div class="app-shell"><main class="page business-page"><div id="root"></div></main></div>`);
      await page.addScriptTag({ content: bundle.outputFiles[0].text });
      await page.evaluate(({ navId, items }) => window.renderFixture(navId, items), {
        navId: target.navId,
        items: stock(target.category, 30),
      });
      await page.waitForSelector("button.finished-inventory-row", { timeout: 15000 });

      const rows = await page.locator("button.finished-inventory-row").count();
      assert.equal(rows, 30, `${target.category} 应有 30 行，实际 ${rows}（夹具必须确定性，不依赖线上数据）`);

      // 每行必须 6 格且都非空（含第 5 格 strong 与第 6 格 div）
      const rowShapes = await page.evaluate(() => [...document.querySelectorAll("button.finished-inventory-row")].map((row) => ({
        cells: [...row.children].length,
        empty: [...row.children].filter((cell) => !cell.textContent.trim()).length,
      })));
      for (const shape of rowShapes) {
        assert.equal(shape.cells, 6, "明细行必须是 6 格");
        assert.equal(shape.empty, 0, "明细行每一格都必须有内容");
      }

      // 图例四项：标签 + 精确数值 + 可见
      const legend = await page.evaluate(() => [...document.querySelectorAll(".finished-inventory-row:not(.head) .inventory-allocation-legend > *")].slice(0, 4).map((item) => {
        const match = item.textContent.replace(/\s+/g, " ").trim().match(/^(可用|占用|锁定|待处理)\s*([\d,]+)/u);
        const box = item.getBoundingClientRect();
        return {
          label: match?.[1] ?? "",
          value: Number((match?.[2] ?? "").replace(/,/gu, "")),
          visible: box.width > 0 && box.height > 0,
        };
      }));
      assert.equal(legend.length, 4, `${target.category} 图例应有 4 项，实际 ${JSON.stringify(legend)}`);
      for (const expected of expectedLegend) {
        const actual = legend.find((item) => item.label === expected.label);
        assert.ok(actual, `${target.category} 图例缺少「${expected.label}」: ${JSON.stringify(legend)}`);
        assert.equal(actual.value, expected.value, `${target.category}「${expected.label}」数值错误`);
        assert.equal(actual.visible, true, `${target.category}「${expected.label}」不可见`);
      }

      // 横向滚动到每列，单元格不得被任何祖先裁切，表头与表体对齐
      for (let column = 0; column < 6; column += 1) {
        const result = await page.evaluate((col) => {
          const scroller = document.querySelector(".finished-goods-table-scroll");
          const head = document.querySelector(".finished-goods-table .finished-inventory-row.head");
          const row = document.querySelector("button.finished-inventory-row");
          const headCell = head.children[col];
          const cell = row.children[col];
          scroller.scrollLeft = Math.max(0, Math.round(cell.offsetLeft + cell.offsetWidth - scroller.clientWidth + 4));
          const rect = cell.getBoundingClientRect();
          let clippedBy = null;
          for (let node = cell.parentElement; node; node = node.parentElement) {
            const style = getComputedStyle(node);
            const box = node.getBoundingClientRect();
            if (rect.right > box.right + 1 && (style.overflowX === "hidden" || style.overflow === "hidden")) { clippedBy = node.className || node.tagName; break; }
            if (rect.right > window.innerWidth + 1) { clippedBy = "viewport"; break; }
          }
          return { clippedBy, headerLeft: Math.round(headCell.getBoundingClientRect().left), cellLeft: Math.round(rect.left) };
        }, column);
        assert.equal(result.clippedBy, null, `${target.category} ${width} 第 ${column} 列被 ${result.clippedBy} 裁切`);
        assert.equal(result.headerLeft, result.cellLeft, `${target.category} ${width} 第 ${column} 列滚动后表头与表体未对齐`);
      }

      // 首行与末行：表头必须始终固定可见，纵向滚动只发生在表体
      const headerBefore = await page.locator(".finished-inventory-row.head").boundingBox();
      await page.evaluate(() => {
        const body = document.querySelector(".finished-goods-table .business-table-body");
        body.scrollTop = body.scrollHeight;
      });
      await page.waitForTimeout(200);
      const headerAfter = await page.locator(".finished-inventory-row.head").boundingBox();
      assert.ok(headerAfter, `${target.category} 末行滚动后表头消失`);
      assert.ok(Math.abs(headerAfter.y - headerBefore.y) <= 1, `${target.category} 表头必须固定，不允许随长列表滚走`);
      const lastRowVisible = await page.evaluate(() => {
        const rowsEl = [...document.querySelectorAll("button.finished-inventory-row")];
        const last = rowsEl.at(-1).getBoundingClientRect();
        const body = document.querySelector(".finished-goods-table .business-table-body").getBoundingClientRect();
        return last.bottom <= body.bottom + 2 && last.top >= body.top - 2;
      });
      assert.equal(lastRowVisible, true, `${target.category} 滚到底部后最后一行必须可见`);
      assert.deepEqual(errors, [], `不得有页面错误: ${JSON.stringify(errors)}`);
      await page.close();
      console.log(`ok ${target.category} ${width}: 30 行 / 6 格 / 图例四项精确 / 表头固定`);
    }
  }
  console.log("Business table overflow checks passed: deterministic fixtures for both inventory types.");
} finally {
  await browser.close();
}
