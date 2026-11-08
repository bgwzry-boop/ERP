import { fulfillReceiptRead, selectReceiptRow } from "./receipt-ui-read-fixtures.mjs";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { chromium } from "playwright";
import { FACTORY_STANDARD_COLOR_DEFINITIONS, getFactoryStandardColorSwatch } from "../shared/factoryStandardColors.js";
import { buildRawMaterialInboundDraftFromOcr } from "../server/services/rawMaterialOcrParserService.mjs";

// Anonymous, browser-only fixtures. No OCR, attachment upload, mapping save,
// receipt confirmation, inventory mutation or printing is performed.
const baseline = process.argv.includes("--expect-baseline-failure");
const origin = process.env.ERP_COLOR_SWATCH_UI_BASE_URL || "http://127.0.0.1:4174/";
const output = process.env.ERP_COLOR_SWATCH_UI_OUTPUT || `screenshots/raw-material-color-swatches${baseline ? "-baseline" : ""}`;
await mkdir(output, { recursive: true });
const cases = [
  { key: "unmapped-beige", factory: "", supplier: "米色", status: "unmapped" },
  { key: "factory-priority", factory: "海蓝", supplier: "海兰", status: "supplier_rule" },
  // Contains common colour words deliberately: substring guessing is forbidden.
  { key: "unknown-ticket", factory: "", supplier: "供应商红蓝新叫法", status: "unmapped" },
  ...FACTORY_STANDARD_COLOR_DEFINITIONS.map(({ name }) => ({ key: name, factory: name, supplier: name, status: "canonical_exact" })),
];
assert.equal(FACTORY_STANDARD_COLOR_DEFINITIONS.length, 35);
for (const { name, swatch } of FACTORY_STANDARD_COLOR_DEFINITIONS) {
  assert.match(swatch, /^#[\da-f]{6}$/iu, `${name}: standard colour must have an explicit swatch`);
  assert.equal(getFactoryStandardColorSwatch(name), swatch);
}
assert.equal(getFactoryStandardColorSwatch("米色"), getFactoryStandardColorSwatch("米白"));
assert.equal(getFactoryStandardColorSwatch(cases[2].supplier), "");

const sourceRows = [
  ["测试原料厂"], ["品名", "颜色", "规格", "数量", "重量", "单价", "金额"],
  ...cases.map(item => ["无纺布", item.supplier, "78*090*1500", "1", "68", "11.8", "802.4"]),
];
const receipt = buildRawMaterialInboundDraftFromOcr({
  inboundId: "RMI-SWATCH-ANONYMOUS", supplierNameHint: "测试原料厂", knownSupplierNames: ["测试原料厂"],
  documentDirectionHint: "supplier_delivery", recognizedAt: "2026-11-02T00:00:00.000Z",
  ocr: { tables: [{ cells: sourceRows.flatMap((row, y) => row.map((text, x) => ({ text, rowTl: y, rowBr: y, colTl: x, colBr: x, confidence: 96 }))) }] },
});
assert.equal(receipt.ocrLines.length, cases.length);
receipt.factoryColor = "";
receipt.supplierColor = "";
receipt.receivedAt = "2026-11-02T00:01:00.000Z";
receipt.ocrLines.forEach((line, index) => {
  const item = cases[index];
  line.values.factoryColor = item.factory;
  line.values.supplierColor = item.supplier;
  line.recognizedValues = { ...line.values };
  line.factoryColorResolution = { factoryColor: item.factory, supplierColor: item.supplier, status: item.status, sourceType: item.status, supplierSourceId: "测试原料厂", candidateFactoryColors: [] };
});
receipt.rolls.forEach((roll, index) => {
  Object.assign(roll, { factoryColor: cases[index].factory, supplierColor: cases[index].supplier, factoryColorMappingStatus: cases[index].status });
});
const inventoryColors = ["米色", "宝蓝", "湖蓝"];
const stockReceipt = {
  id: "RMI-SWATCH-STOCK", supplierName: "测试原料厂", status: "已入库", receivedAt: "2026-11-02T00:00:00.000Z", rollCount: 3, unit: "卷", materialType: "无纺布", factoryColor: "", supplierColor: "", ocrLines: [],
  rolls: inventoryColors.map((color, index) => ({
    id: `RM-SWATCH-STOCK-0${index + 1}`, supplierColor: color, factoryColor: index === 0 ? "" : color,
    factoryColorMappingStatus: index === 0 ? "supplier_provisional" : "human_confirmed", inventoryStatus: "可用", labelStatus: "已贴标", weightKg: 68, spec: "78*090*1500", widthCm: 90, gramWeightGsm: 78, location: "测试原料库",
  })),
};
const finishedItems = inventoryColors.map((color, index) => ({
  id: `INV-SWATCH-0${index + 1}`, color, size: "30*37*10", handle: "标准提", style: "纯色空白袋", category: "无纺布袋", goodsType: "纯色通货", zone: "测试成品库", state: "正常", trustLevel: "confirmed", inStock: 1000, reserved: 0, locked: 0, pending: 0,
}));
const original = JSON.stringify({ receipt, stockReceipt, finishedItems });
const report = { passed: false, expectedBaselineFailure: baseline, anonymousMockBusinessData: true, noCloudOcrOrStorage: true, checks: [], writes: [], errors: [] };
const browser = await chromium.launch();

async function openPage(width) {
  const mobile = width === 390;
  const page = await browser.newPage({ viewport: { width, height: mobile ? 844 : 1000 }, ...(mobile ? { isMobile: true, hasTouch: true, userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1" } : {}) });
  page.on("pageerror", error => report.errors.push(error.message));
  await page.route("**/api/**", async route => {
    const request = route.request(), path = new URL(request.url()).pathname;
    if (!["GET", "HEAD", "OPTIONS"].includes(request.method()) && path !== "/api/auth/prototype-login") {
      report.writes.push({ method: request.method(), path });
      return route.abort();
    }
    if (await fulfillReceiptRead(route, [receipt, stockReceipt])) return;
    const items = path === "/api/inventory/items" ? finishedItems : null;
    if (items) return route.fulfill({ json: { items, page: 1, pageSize: 200, total: items.length } });
    return route.continue();
  });
  const url = new URL(origin);
  url.searchParams.set("swatchReview", `${baseline ? "baseline" : "fixed"}-${width}-${Date.now()}`);
  url.searchParams.set("erpViewport", mobile ? "mobile" : "desktop");
  url.hash = "material-receiving";
  await page.goto(url.href);
  if (!mobile) await selectReceiptRow(page, receipt.id);
  assert.equal(await page.locator('meta[name="erp-app-id"]').getAttribute("content"), "bagwin-complete-review-4174");
  if (mobile) await page.getByRole("button", { name: "核对全部卷材", exact: true }).click();
  await page.locator(mobile ? ".raw-material-mobile-review-list > article" : ".office-roll-row").first().waitFor();
  return page;
}

async function normalizedColor(page, value) {
  return page.evaluate(color => {
    const probe = document.createElement("span");
    probe.style.backgroundColor = color;
    document.body.append(probe);
    const normalized = getComputedStyle(probe).backgroundColor;
    probe.remove();
    return normalized;
  }, value);
}

async function assertSwatch(page, locator, expected, label) {
  assert.equal(await locator.evaluate(element => getComputedStyle(element).backgroundColor), await normalizedColor(page, expected), label);
}

async function checkReceiving(width) {
  const mobile = width === 390, page = await openPage(width);
  try {
    const rows = page.locator(mobile ? ".raw-material-mobile-review-list > article" : ".office-roll-row");
    assert.equal(await rows.count(), cases.length);
    const chipSelector = mobile ? ".raw-material-mobile-review-color" : ".raw-material-color-chip";
    const beigeChip = rows.first().locator(chipSelector);
    const expectedBeige = await normalizedColor(page, getFactoryStandardColorSwatch("米色"));
    const actualBeige = await beigeChip.evaluate(element => getComputedStyle(element).backgroundColor);
    if (baseline) {
      assert.notEqual(actualBeige, expectedBeige, "the old page unexpectedly passed; baseline evidence must come from old code");
      assert.equal(actualBeige, await normalizedColor(page, "#9aa6b2"), "baseline must reproduce the missing-factory neutral chip");
      report.checks.push({ scope: "baseline-core-beige", width, passed: true, actual: actualBeige, required: expectedBeige, regressionReproduced: true });
      await page.screenshot({ path: `${output}/baseline-beige-${width}.png`, fullPage: true });
      return;
    }
    assert.equal(actualBeige, expectedBeige, "unmapped 米色 uses its known display swatch without assigning a factory colour");
    for (const [index, item] of cases.entries()) {
      const row = rows.nth(index);
      const expected = getFactoryStandardColorSwatch(item.factory || item.supplier, mobile ? "var(--erp-roll-neutral)" : "#9aa6b2");
      await assertSwatch(page, row.locator(chipSelector), expected, `${item.key}: ${width}px swatch`);
      const text = row.locator(mobile ? ".line-color" : ".office-roll-color-text");
      assert.equal(await text.textContent(), `${item.factory}（${item.supplier}）`, `${item.key}: colour text/provenance must stay unchanged`);
    }
    const mapped = rows.nth(1).locator(mobile ? ".line-color" : ".office-roll-color-text");
    const typography = await mapped.evaluate(element => {
      const a = getComputedStyle(element.querySelector(".raw-material-factory-color"));
      const b = getComputedStyle(element.querySelector(".raw-material-ticket-color"));
      return { difference: parseFloat(b.fontSize) - parseFloat(a.fontSize), sameFamily: a.fontFamily === b.fontFamily, sameWeight: a.fontWeight === b.fontWeight, nowrap: getComputedStyle(element).whiteSpace };
    });
    assert.deepEqual(typography, { difference: 2, sameFamily: true, sameWeight: true, nowrap: "nowrap" });
    const layout = await rows.evaluateAll((elements, isMobile) => elements.every(row => {
      const chip = row.querySelector(isMobile ? ".raw-material-mobile-review-color" : ".raw-material-color-chip").getBoundingClientRect();
      const text = row.querySelector(isMobile ? ".line-color" : ".office-roll-color-text").getBoundingClientRect();
      const next = row.querySelector(isMobile ? ".line-spec" : ".office-roll-fact:nth-of-type(2)").getBoundingClientRect();
      if (chip.right > text.left + 0.5 || text.right > next.left + 0.5) return false;
      if (isMobile) return true;
      const number = row.querySelector("strong"), box = number.getBoundingClientRect();
      return number.scrollWidth <= number.clientWidth + 1 && chip.left >= box.right + 6;
    }), mobile);
    assert.equal(layout, true, `${width}px colour chip/text must not overlap roll number, width or weight`);
    if (mobile) {
      await rows.first().getByRole("button", { name: "修改", exact: true }).click();
      const resolution = rows.first().getByRole("region", { name: "厂家颜色自动换算" });
      await resolution.getByText("待统一", { exact: true }).waitFor();
      assert.equal(await resolution.getByText("米色", { exact: true }).count(), 1);
      assert.equal(await resolution.getByText("米白", { exact: true }).count(), 0, "a display alias must not fill the factory mapping");
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    } else {
      await rows.first().getByRole("button", { name: "改这一卷", exact: true }).click();
      assert.equal(await page.locator(".office-roll-editor select").inputValue(), "", "display swatch must not silently assign the standard colour");
      await page.locator(".office-roll-editor").getByRole("button", { name: "取消", exact: true }).click();
    }
    await page.screenshot({ path: `${output}/receiving-${width}.png`, fullPage: true });
    report.checks.push({ scope: "receiving", width, passed: true, standardSwatches: 35, unmappedBeige: true, factoryPriority: true, unknownNeutral: true, unchangedMapping: true, layout: true });
    if (!mobile) {
      await page.getByRole("button", { name: "卷料库存", exact: true }).click();
      const stockRows = page.locator("button.roll-row");
      await stockRows.first().waitFor();
      assert.equal(await stockRows.count(), 3);
      for (const color of inventoryColors) await assertSwatch(page, stockRows.filter({ has: page.locator(".roll-color", { hasText: new RegExp(`^${color}$`, "u") }) }).locator(".roll-color .color-chip"), getFactoryStandardColorSwatch(color), `physical stock ${color}`);
      await page.screenshot({ path: `${output}/roll-inventory-${width}.png`, fullPage: true });
      if (!(await page.getByRole("button", { name: "无纺布袋", exact: true }).isVisible())) await page.locator('[data-nav-group="inventory"] > button').click();
      await page.getByRole("button", { name: "无纺布袋", exact: true }).click();
      const goodsRows = page.locator("button.finished-inventory-row");
      await goodsRows.first().waitFor();
      assert.equal(await goodsRows.count(), 3);
      for (const color of inventoryColors) await assertSwatch(page, goodsRows.filter({ has: page.locator(".factory-color-label", { hasText: new RegExp(`^${color}$`, "u") }) }).locator(".factory-color-label .color-chip"), getFactoryStandardColorSwatch(color), `finished stock ${color}`);
      await page.screenshot({ path: `${output}/finished-inventory-${width}.png`, fullPage: true });
      report.checks.push({ scope: "physical-and-finished-inventory", width, passed: true, colors: inventoryColors });
    }
  } catch (error) {
    await page.screenshot({ path: `${output}/failed-${width}.png`, fullPage: true });
    throw error;
  } finally { await page.close(); }
}

try {
  for (const width of baseline ? [1440] : [1440, 800, 390]) await checkReceiving(width);
  assert.deepEqual(report.errors, [], "no browser errors");
  assert.deepEqual(report.writes, [], "no attempted business writes");
  assert.equal(JSON.stringify({ receipt, stockReceipt, finishedItems }), original, "display tests must not mutate colours/mapping fixtures");
  report.passed = true;
  console.log(baseline ? "PASS old UI reproduces the unmapped 米色 neutral-swatch regression." : "PASS 1440/800/390 receiving swatches, unchanged colour provenance/mapping, 35 standard colours, unknown neutral fallback, typography and clear roll numbers; real desktop stock and finished-stock lists use shared swatches. Anonymous mocked business reads, no business writes.");
} finally {
  await browser.close();
  await writeFile(`${output}/report.json`, JSON.stringify(report, null, 2));
}
