// 负责人 2026-11-08 设计稿：原料库存「颜色 × 宽幅」+ 查布。真实评审壳 4174，读取全部用匿名测试数据，零写入。
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { chromium } from "playwright";
import { fulfillReceiptRead } from "./receipt-ui-read-fixtures.mjs";
import { buildStockMatrix, cellTone, lookupFabric, parseFabricQuery } from "../docs/prototypes/raw-material-roll-inventory-review/src/stockMatrix.js";

// 纯函数
const sample = [
  { status: "可用", width: "70cm", widthCm: 70, color: "大红", weight: 83 },
  { status: "可用", width: "70cm", widthCm: 70, color: "大红", weight: 82.5 },
  { status: "可用", width: "90cm", widthCm: 90, color: "大红", weight: 100 },
  { status: "可用", width: "60cm", widthCm: 60, color: "（豆沙绿）", colorLabel: "（豆沙绿）", weight: 60 },
  { status: "机边领用", width: "90cm", widthCm: 90, color: "大红", weight: 30 },
  { status: "可用", width: "5cm 把条", widthCm: 5, color: "白色", weight: 10 },
];
const matrix = buildStockMatrix(sample);
assert.deepEqual(matrix.widths.map((w) => w.label), ["60cm", "70cm", "90cm"], "宽幅从小到大，把条不进表格");
assert.deepEqual(matrix.rows.map((r) => r.color), ["大红", "（豆沙绿）"], "卷数多的颜色在前");
assert.deepEqual(matrix.rows[0].cells["70cm"], { count: 2, kg: 165.5 });
assert.equal(matrix.rows[0].cells["90cm"].count, 1, "机边领用不算可用");
assert.equal(cellTone(matrix.rows[0].cells["90cm"]), "low");
assert.equal(cellTone(undefined), "empty");
assert.deepEqual(matrix.strips.map((s) => [s.color, s.count]), [["白色", 1]]);
assert.deepEqual(parseFabricQuery("30*37*10 红"), { widthCm: 90, color: "红", fromSize: "30*37*10", text: "30*37*10 红" }, "袋子尺寸按开单公式换成布宽 37×2+10+6=90");
assert.equal(parseFabricQuery("90 大红").widthCm, 90);
assert.equal(parseFabricQuery("豆沙绿").widthCm, null);
assert.equal(parseFabricQuery("  "), null);
const found = lookupFabric(sample, parseFabricQuery("90 红"));
assert.equal(found.count, 1, "只算可用卷");
assert.equal(lookupFabric(sample, parseFabricQuery("豆沙绿")).items[0].color, "（豆沙绿）", "供应商颜色也能查");
assert.equal(lookupFabric(sample, parseFabricQuery("80 蓝")).count, 0);

async function resetLedger(page) {
  const reset = page.getByRole("button", { name: "重置筛选" });
  if (await reset.count()) await reset.click();
  await page.waitForTimeout(150);
}

// 浏览器
const origin = process.env.ERP_RECEIVING_CLEANUP_UI_BASE_URL || "http://127.0.0.1:4174/";
const outDir = ".erp-local-storage/ci/raw-stock-matrix";
await mkdir(outDir, { recursive: true });
const colors = [["大红", "大红", 70, 3], ["大红", "大红", 90, 1], ["", "豆沙绿", 76, 2], ["天兰", "天兰", 90, 2], ["果绿", "果绿", 82, 2]];
let n = 0;
const stockReceipt = {
  id: "RMI-MATRIX-STOCK", supplierName: "测试原料厂", status: "已入库", receivedAt: "2026-11-02T00:00:00.000Z", unit: "卷", materialType: "无纺布", factoryColor: "", supplierColor: "", ocrLines: [],
  rolls: colors.flatMap(([factory, supplier, width, count]) => Array.from({ length: count }, () => {
    n += 1;
    return { id: `RM-MATRIX-${String(n).padStart(2, "0")}`, supplierColor: supplier, factoryColor: factory, factoryColorMappingStatus: factory ? "human_confirmed" : "supplier_provisional", inventoryStatus: "可用", labelStatus: "已贴标", weightKg: 80 + n, spec: `78*0${width}*1500`, widthCm: width, gramWeightGsm: 78, location: "测试原料库" };
  })),
};
stockReceipt.rollCount = stockReceipt.rolls.length;
const writes = []; const errors = [];
const browser = await chromium.launch();
try {
  for (const width of [1440, 1180]) {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    page.on("pageerror", (error) => errors.push(error.message));
    await page.route("**/api/**", async (route) => {
      const request = route.request(); const path = new URL(request.url()).pathname;
      if (!["GET", "HEAD", "OPTIONS"].includes(request.method()) && path !== "/api/auth/prototype-login") { writes.push(`${request.method()} ${path}`); return route.abort(); }
      if (await fulfillReceiptRead(route, [stockReceipt])) return;
      return route.continue();
    });
    await page.goto(`${origin}?erpViewport=desktop&stockMatrix=${width}-${Date.now()}#roll-inventory`, { waitUntil: "load" });
    const table = page.getByRole("table", { name: "可用卷料：颜色 × 宽幅" });
    await table.waitFor({ timeout: 45000 });
    await page.waitForTimeout(600);
    const heads = await table.getByRole("columnheader").allInnerTexts();
    assert.deepEqual(heads.map((t) => t.trim()), ["颜色", "70cm", "76cm", "82cm", "90cm"], `${width}: 宽幅列从小到大`);
    const rows = await table.getByRole("rowheader").allInnerTexts();
    assert.deepEqual(rows.map((t) => t.trim()), ["大红", "（豆沙绿）", "果绿", "天兰"], `${width}: 颜色行`);
    assert.equal(await table.getByRole("cell", { name: /^90cm 大红 1 卷/u }).getAttribute("class").then((c) => c.includes("low")), true, "只剩 1 卷要标出来");
    // 不换行、不溢出
    const wrapped = await page.locator(".stock-matrix-cell, .stock-matrix-color, .stock-matrix-width").evaluateAll((nodes) => nodes.filter((node) => node.scrollWidth > node.clientWidth + 1 || node.getClientRects().length > 1).length);
    assert.equal(wrapped, 0, `${width}: 格子里的字不能被挤出或换行`);
    const pageOverflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    assert.ok(pageOverflow <= 1, `${width}: 页面不能横向滚动`);
    // 点格子筛台账
    await table.getByRole("cell", { name: /^70cm 大红 3 卷/u }).click();
    await page.waitForTimeout(300);
    assert.equal(await page.locator(".roll-table-body button.roll-row").count(), 3, "点格子后台账只剩这一格的 3 卷");
    await table.getByRole("cell", { name: /^70cm 大红 3 卷/u }).click();
    await page.waitForTimeout(300);
    assert.equal(await page.locator(".roll-table-body button.roll-row").count(), 10, "再点一次取消筛选");
    // 查布
    await page.getByLabel("查布", { exact: true }).fill("30*37*10 红");
    const result = page.getByRole("status").filter({ hasText: "要用" });
    assert.match((await result.innerText()).replace(/\s+/g, " "), /30\*37\*10 要用 90cm 红 库里 1 卷/u);
    await page.getByLabel("查布", { exact: true }).fill("80 蓝");
    assert.match(await page.locator(".stock-fabric-result").innerText(), /库里没有，记得订购 \/ 采购/u);
    await page.getByLabel("查布", { exact: true }).fill("豆沙绿");
    await page.locator(".stock-fabric-result button").first().click();
    await page.waitForTimeout(300);
    assert.equal(await page.locator(".roll-table-body button.roll-row").count(), 2, "查布结果可以点开对应的卷");
    await page.getByLabel("查布", { exact: true }).fill("");
    await resetLedger(page);

    // 2026-11-12 复查回归：台账先选了别的宽幅/颜色/库位/搜索，再点格子或查布结果，
    // 台账条数必须等于格子上写的卷数，下拉框跟着变成这一格。
    const ledgerCount = () => page.locator(".roll-table-body button.roll-row").count();
    const cells = table.locator("button.stock-matrix-cell");
    const cellCount = await cells.count();
    assert.ok(cellCount >= 5);
    for (let index = 0; index < cellCount; index += 1) {
      const cell = cells.nth(index);
      const label = await cell.getAttribute("aria-label");
      const [, cellWidth, cellColor, advertised] = label.match(/^(\S+) (\S+) (\d+) 卷/u);
      // 故意设成跟这一格冲突的筛选
      await page.getByRole("combobox", { name: "宽幅" }).selectOption(cellWidth === "70cm" ? "90cm" : "70cm");
      await page.getByRole("combobox", { name: "颜色" }).selectOption(cellColor === "天兰" ? "果绿" : "天兰");
      await page.getByRole("combobox", { name: "可用状态" }).selectOption("机边领用");
      await page.getByPlaceholder("搜索卷码 / 颜色 / 宽幅 / 供应商").fill("不存在的卷");
      await cell.click();
      await page.waitForTimeout(200);
      assert.equal(await ledgerCount(), Number(advertised), `${width}: 已有冲突筛选时点「${label}」，台账条数要等于格子上的卷数`);
      assert.equal(await page.getByRole("combobox", { name: "宽幅" }).inputValue(), cellWidth, "宽幅下拉跟着变成这一格");
      assert.equal(await page.getByRole("combobox", { name: "颜色" }).inputValue(), cellColor, "颜色下拉跟着变成这一格");
      assert.equal(await page.getByPlaceholder("搜索卷码 / 颜色 / 宽幅 / 供应商").inputValue(), "", "搜索清空");
      await cell.click();
      await page.waitForTimeout(200);
      assert.equal(await page.getByRole("combobox", { name: "宽幅" }).inputValue(), "全部宽幅", "再点一次取消，宽幅回到全部");
      assert.equal(await page.getByRole("combobox", { name: "颜色" }).inputValue(), "全部颜色", "再点一次取消，颜色回到全部");
      await resetLedger(page);
    }
    // 查布结果同样：先选 70cm，再查「90 红」并点开
    await page.getByRole("combobox", { name: "宽幅" }).selectOption("70cm");
    assert.equal(await ledgerCount(), 3);
    await page.getByLabel("查布", { exact: true }).fill("90 红");
    const lookup = page.locator(".stock-fabric-result button").first();
    const lookupCount = Number((await lookup.innerText()).match(/(\d+) 卷/u)[1]);
    await lookup.click();
    await page.waitForTimeout(200);
    assert.equal(lookupCount, 1);
    assert.equal(await ledgerCount(), lookupCount, "查布结果点开后台账条数等于结果卷数");
    await page.locator(".active-bucket").click();
    await page.waitForTimeout(200);
    assert.equal(await page.getByRole("combobox", { name: "宽幅" }).inputValue(), "全部宽幅", "点筛选标签上的 × 也回到全部");
    await page.getByLabel("查布", { exact: true }).fill("");
    await page.screenshot({ path: `${outDir}/stock-matrix-${width}.png` });
    await page.close();
  }
  assert.deepEqual(writes, [], `不得写入：${writes.join(",")}`);
  assert.deepEqual(errors, [], `页面报错：${errors.join(";")}`);
  console.log("raw stock matrix ok: 颜色×宽幅、只剩1卷、点格子筛台账（含已有冲突筛选）、查布（宽幅/袋子尺寸/供应商颜色）、1440/1180 不换行不溢出、零写入");
} finally {
  await browser.close();
}
