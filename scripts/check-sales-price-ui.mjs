// 负责人 2026-11-12「销售价格」页：真实评审壳 4174 上点一遍——空表时按 10-28 价目表建立、
// 核对各分类的价、改价只改一格并写说明、保存后改价记录出现新版本；表格不换行、页面不横向滚动。
// /api/sales-prices 由本脚本用真实服务 + 本地仓库在内存里应答，不写评审服务器，其它写请求一律拦下。
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { chromium } from "playwright";
import { createLocalMasterDataImportTransactionRepository } from "../server/masterDataImportTransactionRepository.mjs";
import { readSalesPrices, saveSalesPriceVersion } from "../server/services/salesPriceService.mjs";

const origin = process.env.ERP_RECEIVING_CLEANUP_UI_BASE_URL || "http://127.0.0.1:4174/";
const outDir = ".erp-local-storage/ci/sales-price-ui";
await mkdir(outDir, { recursive: true });
const memory = { masterDataImportTransactionRepository: createLocalMasterDataImportTransactionRepository({ storageRoot: "/nonexistent" }), users: [{ id: "U-MANAGER-A", displayName: "管理A" }] };
const blocked = []; const errors = [];
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("**/api/**", async (route) => {
    const request = route.request(); const path = new URL(request.url()).pathname;
    if (path === "/api/sales-prices" && request.method() === "GET") return route.fulfill({ json: await readSalesPrices({ workspace: memory }) });
    if (path === "/api/sales-prices/versions" && request.method() === "POST") {
      const result = await saveSalesPriceVersion({ workspace: memory, body: request.postDataJSON(), operatorId: "U-MANAGER-A" });
      return route.fulfill(result.error ? { status: result.statusCode, json: { code: result.code, message: result.message } } : { json: result });
    }
    if (!["GET", "HEAD", "OPTIONS"].includes(request.method()) && path !== "/api/auth/prototype-login") { blocked.push(`${request.method()} ${path}`); return route.abort(); }
    return route.continue();
  });
  await page.goto(`${origin}?erpViewport=desktop&salesPrice=${Date.now()}#sales-prices`, { waitUntil: "load" });
  await page.locator('[data-nav-id="sales-prices"][aria-current="page"]').waitFor({ timeout: 45000 });
  const main = page.getByRole("region", { name: "销售价格" });
  await main.getByText("还没有销售价格表").waitFor({ timeout: 15000 });

  // 1) 空表 → 按 10-28 价目表建立（先给看一遍，确认后再保存）
  await page.getByRole("button", { name: "按 2026-10-28 价目表建立" }).click();
  assert.match(await page.getByLabel("改价说明").inputValue(), /2026-10-28/u);
  assert.equal(await page.getByLabel("裸布-竖中号 30×37×10 单价").inputValue(), "0.41");
  assert.equal(await page.getByLabel("覆膜-横大号 50×40×12 金银").inputValue(), "1.08");
  assert.equal(await page.getByLabel("礼品袋 30×30 福").inputValue(), "0.32");
  assert.equal(await page.getByLabel("礼品袋 30×30 喜").count(), 0, "喜字没有 30×30");
  assert.equal(await page.getByLabel("60cm 提手加价").inputValue(), "0.13");
  await page.getByRole("button", { name: "建立价格表" }).click();
  await page.getByRole("status").filter({ hasText: "已存为第 1 版" }).waitFor({ timeout: 10000 });
  const regular = page.getByRole("table", { name: "常规尺寸价格" });
  assert.equal(await regular.getByRole("row").count(), 12, "常规尺寸 11 个价 + 表头");
  assert.match(await regular.innerText(), /裸布-竖中号\s+30×37×10\s+0\.41/u);
  assert.match(await page.getByRole("table", { name: "机印分档" }).innerText(), /5000–9999 个\s+0\.08/u);
  await page.screenshot({ path: `${outDir}/sales-price-v1.png` });

  // 2) 改价：竖中号 0.41 → 0.42，写说明，只改了 1 处
  await page.getByRole("button", { name: "改价" }).click();
  assert.equal(await page.getByRole("button", { name: "保存为新版本" }).isDisabled(), true, "没改动不能保存");
  await page.getByLabel("裸布-竖中号 30×37×10 单价").fill("0.42");
  assert.match(await page.locator(".sales-price-changes").innerText(), /这次改了 1 处[\s\S]*裸布-竖中号 30×37×10 0\.41 → 0\.42/u);
  await page.getByRole("button", { name: "保存为新版本" }).click();
  await page.getByRole("alert").filter({ hasText: "改价说明" }).waitFor({ timeout: 5000 });
  await page.getByLabel("改价说明").fill("裸布竖中号涨到 0.42");
  await page.getByRole("button", { name: "保存为新版本" }).click();
  await page.getByRole("status").filter({ hasText: "已存为第 2 版" }).waitFor({ timeout: 10000 });
  assert.match(await regular.innerText(), /裸布-竖中号\s+30×37×10\s+0\.42/u);
  const history = page.getByRole("complementary", { name: "改价记录" });
  assert.match(await history.innerText(), /第 2 版\s+生效中[\s\S]*裸布竖中号涨到 0\.42[\s\S]*0\.41 → 0\.42[\s\S]*第 1 版\s+已停用/u);

  // 3) 不换行、不溢出
  const overflow = await page.locator(".sales-price-row > span").evaluateAll((nodes) => nodes.filter((node) => node.scrollWidth > node.clientWidth + 1).map((node) => node.textContent));
  assert.deepEqual(overflow, [], "价格表格子里的字不能被挤出");
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth) <= 1, "页面不能横向滚动");
  await page.screenshot({ path: `${outDir}/sales-price-v2.png` });
  await page.setViewportSize({ width: 1180, height: 820 });
  await page.waitForTimeout(300);
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth) <= 1, "1180 宽也不能横向滚动");
  await page.screenshot({ path: `${outDir}/sales-price-1180.png` });

  assert.deepEqual(blocked, [], `不得写评审服务器：${blocked.join(",")}`);
  assert.deepEqual(errors, [], `页面报错：${errors.join(";")}`);
  console.log("sales price UI ok: 空表按 10-28 价目表建立、各分类价格核对、改价只改一处并要求说明、改价记录出新版本、1440/1180 不换行不溢出");
} finally {
  await browser.close();
}
