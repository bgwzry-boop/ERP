// 给主要页面截图，用于界面改动前后对比（CI 的 ui-screenshots 工作流会对 PR 分支和基线各跑一次）。
// 用法：node scripts/capture-ui-screenshots.mjs <输出目录> [前端地址，默认 http://127.0.0.1:5173]
// 前端以本地演示数据模式运行（不需要 API 服务），通过点击左侧导航切换页面。

import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { chromium } from "playwright";

const outDir = process.argv[2] ?? "screenshots/ui-compare";
const baseUrl = process.argv[3] ?? "http://127.0.0.1:5173/";

const officePages = ["公共待办", "订单录入", "订单池", "库存查询", "出库交付", "对账收款", "打包/标签", "原材料", "基础资料"];
const viewports = [
  { name: "1440", width: 1440, height: 900 },
  { name: "1280", width: 1280, height: 800 },
];

await mkdir(outDir, { recursive: true });
const browser = await chromium.launch();
const report = [];

async function openApp(viewport) {
  const page = await browser.newPage({ viewport, deviceScaleFactor: 1 });
  const errors = [];
  page.on("pageerror", (error) => errors.push(String(error?.message ?? error)));
  // 应用会在后台轮询，不能等 networkidle；等页面加载完、工作台外壳出现即可。
  await page.goto(baseUrl, { waitUntil: "load" });
  try {
    await page.locator(".app-shell").first().waitFor({ timeout: 30_000 });
  } catch (error) {
    await page.screenshot({ path: join(outDir, `debug-no-shell-${viewport.width}.png`), fullPage: true });
    await writeFile(join(outDir, `debug-no-shell-${viewport.width}.html`), await page.content());
    throw error;
  }
  return { page, errors };
}

async function settle(page) {
  await page.waitForTimeout(900);
}

// 侧边栏是分组折叠的（今日工作 / 订单 / 库存交付 / 对账 / 更多工作台）：
// 先找可见的同名按钮；找不到就逐个展开折叠的分组再找。找不到时返回 false，不中断整个截图流程。
async function findVisibleNavItem(page, label) {
  const sidebar = page.locator("aside.sidebar");
  const escaped = label.replace(/[/]/g, "\\/");
  for (const locator of [
    sidebar.getByRole("button", { name: new RegExp(`^${escaped}`) }),
    sidebar.getByText(label, { exact: true }),
  ]) {
    const count = await locator.count();
    for (let i = 0; i < count; i += 1) {
      const item = locator.nth(i);
      if (await item.isVisible()) return item;
    }
  }
  return null;
}

async function clickNav(page, label) {
  let item = await findVisibleNavItem(page, label);
  if (!item) {
    const triggers = page.locator('aside.sidebar .nav-group-trigger[aria-expanded="false"]');
    const total = await triggers.count();
    for (let i = 0; i < total && !item; i += 1) {
      const trigger = page.locator('aside.sidebar .nav-group-trigger[aria-expanded="false"]').first();
      if (!(await trigger.count())) break;
      await trigger.click();
      await page.waitForTimeout(150);
      item = await findVisibleNavItem(page, label);
    }
  }
  if (!item) return false;
  await item.click();
  return true;
}

for (const viewport of viewports) {
  const { page, errors } = await openApp(viewport);
  for (const [index, label] of officePages.entries()) {
    const found = await clickNav(page, label);
    await settle(page);
    const file = `${viewport.name}-${String(index + 1).padStart(2, "0")}-${label.replace(/[/]/g, "-")}.png`;
    if (found) await page.screenshot({ path: join(outDir, file), fullPage: false });
    // 记录横向溢出：页面宽于视口说明有内容被挤出或截断
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    report.push({ viewport: viewport.name, page: label, found, file: found ? file : null, horizontalOverflowPx: overflow });
  }
  report.push({ viewport: viewport.name, pageErrors: errors });
  await page.close();
}

// 现场手机页：用手机尺寸打开，再从导航进入
for (const label of ["车间手机端", "司机端"]) {
  const { page, errors } = await openApp({ width: 1440, height: 900 });
  const found = await clickNav(page, label);
  await page.setViewportSize({ width: 390, height: 844 });
  await settle(page);
  const file = `mobile-${label}.png`;
  if (found) await page.screenshot({ path: join(outDir, file), fullPage: true });
  report.push({ viewport: "390", page: label, found, file: found ? file : null, pageErrors: errors });
  await page.close();
}

await browser.close();
await writeFile(join(outDir, "report.json"), `${JSON.stringify(report, null, 2)}\n`);
console.log(`Captured UI screenshots into ${outDir}`);
