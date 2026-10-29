// 给线上同款界面（完整评审稿，npm run review:dev，端口 4174）的主要页面截图，用于界面改动前后对比。
// CI 的 ui-screenshots 工作流会对 PR 分支和目标分支各跑一次。
// 用法：node scripts/capture-ui-screenshots.mjs <输出目录> [前端地址，默认 http://127.0.0.1:4174/]

import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { chromium } from "playwright";

const outDir = process.argv[2] ?? "screenshots/ui-compare";
const baseUrl = (process.argv[3] ?? "http://127.0.0.1:4174/").replace(/\/?$/, "/");

const pages = [
  ["shared-todos", "公共待办"],
  ["order-entry", "订单录入"],
  ["order-pool", "订单池"],
  ["material-receiving", "收货录入"],
  ["roll-inventory", "卷料库存"],
  ["production-tasks", "生产任务"],
  ["packing-labels", "打包标签"],
  ["outbound-delivery", "出库交付"],
  ["inventory-query", "无纺布袋"],
  ["customer-statements", "对账收款"],
  ["supplier-month-end", "供应商月结"],
  ["customer-records", "客户档案"],
];
const viewports = [
  { name: "1440", width: 1440, height: 900, viewport: "desktop" },
  { name: "1280", width: 1280, height: 800, viewport: "desktop" },
];
const mobilePages = [["material-receiving", "收货录入-手机"]];

await mkdir(outDir, { recursive: true });
const browser = await chromium.launch();
const report = [];

async function capture({ width, height, viewport, name }, hash, label, fullPage) {
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
  const errors = [];
  page.on("pageerror", (error) => errors.push(String(error?.message ?? error)));
  const file = `${name}-${label}.png`;
  try {
    await page.goto(`${baseUrl}?erpViewport=${viewport}&uiShot=1#${hash}`, { waitUntil: "load" });
    // 应用会在后台轮询，不等 networkidle；等加载提示消失再截。
    await page.waitForTimeout(1500);
    await page.getByText("正在读取", { exact: false }).first().waitFor({ state: "hidden", timeout: 8000 }).catch(() => {});
    await page.waitForTimeout(500);
    await page.screenshot({ path: join(outDir, file), fullPage });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    report.push({ viewport: name, page: label, file, horizontalOverflowPx: overflow, pageErrors: errors });
  } catch (error) {
    report.push({ viewport: name, page: label, file: null, error: String(error?.message ?? error), pageErrors: errors });
  } finally {
    await page.close();
  }
}

for (const viewport of viewports) {
  for (const [hash, label] of pages) await capture(viewport, hash, label, false);
}
for (const [hash, label] of mobilePages) {
  await capture({ name: "390", width: 390, height: 844, viewport: "mobile" }, hash, label, true);
}

await browser.close();
await writeFile(join(outDir, "report.json"), `${JSON.stringify(report, null, 2)}\n`);
console.log(`Captured ${report.filter((item) => item.file).length}/${report.length} UI screenshots into ${outDir}`);
