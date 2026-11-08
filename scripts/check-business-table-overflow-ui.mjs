// 成品库存列表（无纺布袋/覆膜袋）在窄桌面的几何回归。
// 用组件夹具而不是线上 GET 数据：两类库存各 30 行，可用/占用/锁定/待处理四项都为正，
// 断言 6 格齐全、图例四项数值精确、首行与末行时表头固定、横向滚动后不被祖先裁切。
import assert from "node:assert/strict";
import { build } from "esbuild";
import { chromium } from "playwright";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

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
  absWorkingDir: fileURLToPath(root),
  stdin: { contents: entry, resolveDir: fileURLToPath(root), loader: "jsx", sourcefile: "overflow-fixture.jsx" },
  bundle: true, write: false, platform: "browser", format: "iife", jsx: "automatic",
  // 根项目与预览项目可能分别安装依赖；组件和夹具渲染器必须使用同一份 React。
  alias: { react: fileURLToPath(new URL("node_modules/react", root)), "react-dom": fileURLToPath(new URL("node_modules/react-dom", root)) },
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
      // 与完整评审页使用相同的网格槽位和高度约束；React 挂载节点不能把表格撑出面板。
      await page.setContent(`<style>${cssText}</style><div class="app-shell"><aside class="sidebar"></aside><header class="topbar"></header><main class="page business-page"><div id="root" style="display:contents"></div></main></div>`);
      await page.addScriptTag({ content: bundle.outputFiles[0].text });
      await page.evaluate(({ navId, items }) => window.renderFixture(navId, items), {
        navId: target.navId,
        items: stock(target.category, 30),
      });
      await page.waitForSelector("button.finished-inventory-row", { timeout: 15000 }).catch((error) => {
        throw new Error(`真实库存组件未显示：${errors.join("; ") || error.message}`, { cause: error });
      });

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

      const headerBefore = await page.locator(".finished-inventory-row.head").boundingBox();
      assert.ok(headerBefore, "夹具必须渲染真实表头");
      // 首行和末行都检查六列；先实际滚入可视区，再测量所有裁切祖先和浏览器视口。
      for (const rowIndex of [0, 29]) for (let column = 0; column < 6; column += 1) {
        const result = await page.evaluate(({ rowIndex, column }) => {
          const head = document.querySelector(".finished-goods-table .finished-inventory-row.head");
          const row = document.querySelectorAll("button.finished-inventory-row")[rowIndex];
          const body = document.querySelector(".finished-goods-table .business-table-body");
          const headCell = head.children[column];
          const cell = row.children[column];
          row.scrollIntoView({ block: "nearest", inline: "nearest" });
          cell.scrollIntoView({ block: "nearest", inline: "nearest" });
          const clippedBy = (element, horizontal = true) => {
            const rect = element.getBoundingClientRect();
            const clipped = [];
            if (rect.width <= 0 || rect.height <= 0) clipped.push("empty box");
            for (let node = element.parentElement; node; node = node.parentElement) {
              const style = getComputedStyle(node);
              const box = node.getBoundingClientRect();
              const left = box.left + node.clientLeft;
              const top = box.top + node.clientTop;
              const clipsX = ["hidden", "clip", "auto", "scroll"].includes(style.overflowX);
              const clipsY = ["hidden", "clip", "auto", "scroll"].includes(style.overflowY);
              if ((horizontal && clipsX && (rect.left < left - 1 || rect.right > left + node.clientWidth + 1))
                || (clipsY && (rect.top < top - 1 || rect.bottom > top + node.clientHeight + 1))) {
                clipped.push(node.className || node.tagName);
              }
            }
            if ((horizontal && (rect.left < -1 || rect.right > innerWidth + 1)) || rect.top < -1 || rect.bottom > innerHeight + 1) clipped.push("viewport");
            return clipped;
          };
          const rect = cell.getBoundingClientRect();
          const headerRect = headCell.getBoundingClientRect();
          const hiddenScroll = [...row.closest(".business-list-panel").querySelectorAll("*")].filter((node) => {
            const style = getComputedStyle(node);
            return (node.scrollLeft && ["hidden", "clip"].includes(style.overflowX)) || (node.scrollTop && ["hidden", "clip"].includes(style.overflowY));
          }).map((node) => node.className || node.tagName);
          const legend = [...cell.querySelectorAll(".inventory-allocation-legend > *")].map((item) => {
            const match = item.textContent.replace(/\s+/g, " ").trim().match(/^(可用|占用|锁定|待处理)\s*([\d,]+)/u);
            return { label: match?.[1] ?? "", value: Number((match?.[2] ?? "").replace(/,/gu, "")), clippedBy: clippedBy(item) };
          });
          return {
            cellClip: clippedBy(cell), headerCellClip: clippedBy(headCell),
            rowClip: clippedBy(row, false), headerClip: clippedBy(head, false),
            leftDelta: rect.left - headerRect.left, rightDelta: rect.right - headerRect.right,
            headerTop: head.getBoundingClientRect().top, hiddenScroll, legend,
            bodyScrollTop: body.scrollTop, bodyClientHeight: body.clientHeight, bodyScrollHeight: body.scrollHeight,
          };
        }, { rowIndex, column });
        const context = `${target.category} ${width} 第 ${rowIndex + 1} 行第 ${column + 1} 列`;
        assert.deepEqual(result.cellClip, [], `${context} 单元格被裁切`);
        assert.deepEqual(result.rowClip, [], `${context} 行未完整进入纵向可视区`);
        assert.deepEqual(result.headerClip, [], `${context} 表头离开可视区`);
        assert.deepEqual(result.headerCellClip, [], `${context} 表头列被裁切`);
        assert.deepEqual(result.hiddenScroll, [], `${context} 不得靠程序滚动隐藏容器制造假可见`);
        assert.ok(Math.abs(result.leftDelta) <= 1 && Math.abs(result.rightDelta) <= 1, `${context} 表头与表体左右边界未对齐`);
        assert.ok(Math.abs(result.headerTop - headerBefore.y) <= 1, `${context} 表头必须固定`);
        if (column === 5) {
          assert.equal(result.legend.length, 4, `${context} 图例必须有四项`);
          for (const expected of expectedLegend) {
            const actual = result.legend.find((item) => item.label === expected.label);
            assert.ok(actual, `${context} 图例缺少「${expected.label}」`);
            assert.equal(actual.value, expected.value, `${context}「${expected.label}」数值错误`);
            assert.deepEqual(actual.clippedBy, [], `${context}「${expected.label}」被裁切`);
          }
        }
        if (rowIndex === 29) {
          assert.ok(result.bodyScrollHeight > result.bodyClientHeight && result.bodyScrollTop > 0, `${context} 必须真实触发表体纵向滚动，不能用撑高表体通过验收`);
        }
      }
      assert.deepEqual(errors, [], `不得有页面错误: ${JSON.stringify(errors)}`);
      await page.close();
      console.log(`ok ${target.category} ${width}: 30 行 / 6 格 / 图例四项精确 / 表头固定`);
    }
  }
  console.log("Business table overflow checks passed: deterministic fixtures for both inventory types.");
} finally {
  await browser.close();
}
