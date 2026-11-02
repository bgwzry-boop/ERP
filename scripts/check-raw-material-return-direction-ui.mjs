import { fulfillReceiptRead, selectReceiptRow, selectReceiptTab } from "./receipt-ui-read-fixtures.mjs";
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { chromium } from "playwright";
import { buildRawMaterialInboundDraftFromOcr } from "../server/services/rawMaterialOcrParserService.mjs";

const output = "screenshots/return-direction-guards";
await mkdir(output, { recursive: true });
const supplierName = "测试原料厂";
const header = ["品名", "颜色", "规格", "数量", "重量", "单价", "金额"];
const incoming = ["无纺布", "本白", "78*090*1500", "1", "68", "11.8", "802.4"];
const outgoing = ["退带色布", "彩布", "", "1", "-68", "11.8", "-802.4"];
function fixture(name, lines) {
  const rows = [[supplierName], header, ...lines];
  return buildRawMaterialInboundDraftFromOcr({
    inboundId: `RMI-UI-RETURN-${name.toUpperCase()}`,
    supplierNameHint: supplierName,
    knownSupplierNames: [supplierName],
    documentDirectionHint: "supplier_delivery",
    recognizedAt: "2026-11-01T00:00:00.000Z",
    ocr: { tables: [{ cells: rows.flatMap((row, y) => row.map((text, x) => ({ text, rowTl: y, rowBr: y, colTl: x, colBr: x, confidence: 96 }))) }] },
  });
}
const scenarios = [
  { name: "normal-note", inbound: fixture("normal-note", [incoming, ["备注", "退货请填写退货单编号"]]) },
  { name: "automatic-return", inbound: fixture("automatic-return", [outgoing]) },
  { name: "mixed-directions", inbound: fixture("mixed-directions", [incoming, outgoing]) },
];
assert.equal(scenarios[0].inbound.documentDirection, "supplier_delivery");
assert.equal(scenarios[1].inbound.documentDirection, "supplier_return");
assert.equal(scenarios[1].inbound.status, "已识别待复核");
assert.deepEqual(scenarios[1].inbound.rolls, []);
assert.equal(scenarios[2].inbound.documentDirection, "supplier_delivery");

const browser = await chromium.launch();
const completed = [];
try {
  for (const width of [1440, 800, 390]) {
    const mobile = width === 390;
    for (const { name, inbound } of scenarios) {
      const page = await browser.newPage({
        viewport: { width, height: mobile ? 844 : 1000 },
        ...(mobile ? { isMobile: true, hasTouch: true, userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1" } : {}),
      });
      const errors = [], writes = [];
      page.on("pageerror", error => errors.push(error.message));
      await page.route("**/api/**", async route => {
        const request = route.request(), path = new URL(request.url()).pathname;
        if (!["GET", "HEAD", "OPTIONS"].includes(request.method()) && path !== "/api/auth/prototype-login") {
          writes.push({ method: request.method(), path });
          return route.abort();
        }
        if (await fulfillReceiptRead(route, [inbound])) return;
        return route.continue();
      });
      try {
        await page.goto(`http://127.0.0.1:4174/?returnDirectionGuard=${name}-${width}&erpViewport=${mobile ? "mobile" : "desktop"}#material-receiving`);
        if (mobile) {
          await page.getByRole("button", { name: name === "automatic-return" ? "核对退货明细" : "核对全部卷材", exact: true }).click();
          await page.getByLabel(name === "automatic-return" ? "退货逐件核对" : "全部卷料核对").waitFor();
          if (name === "mixed-directions") {
            await page.getByRole("alert").filter({ hasText: "原单同时包含送货和退货明细" }).first().waitFor();
            assert.equal(await page.getByRole("button", { name: "请先核对混合方向", exact: true }).isDisabled(), true);
          } else {
            assert.equal(await page.getByText(/原单同时包含送货和退货明细|原单含退货明细，不能按收货入库/).count(), 0);
            assert.equal(await page.locator(".raw-material-mobile-review-list > article").count(), 1);
            const footer = page.locator(".raw-material-mobile-review-footer");
            assert.match(await footer.innerText(), name === "automatic-return" ? /已确认 0\/1.*确认退货/ : /已确认 0\/1.*进入打印/);
            if (name === "automatic-return") {
              assert.match(await page.locator(".raw-material-mobile-review-list").innerText(), /68/);
              assert.equal(await footer.getByRole("button", { name: /确认退货/ }).isDisabled(), true, "a new return still awaits per-item human confirmation");
            }
          }
          assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
        } else {
          if (name === "automatic-return") await selectReceiptTab(page, "退货单 1");
          await selectReceiptRow(page, inbound.id);
          if (name === "mixed-directions") {
            await page.getByRole("alert").filter({ hasText: "原单同时包含送货和退货明细" }).first().waitFor();
            assert.equal(await page.getByRole("button", { name: "请先核对混合方向", exact: true }).isDisabled(), true);
            assert.equal(await page.locator(".office-roll-table").count(), 0);
            await page.getByText("单据与识别明细", { exact: true }).click();
            assert.equal(await page.getByRole("button", { name: "确认人工复核", exact: true }).count(), 0, "the expanded OCR panel must not offer a second review bypass");
          } else {
            const confirm = page.getByRole("button", { name: name === "automatic-return" ? "确认退货，不入库" : "这批都对，去打印", exact: true });
            await confirm.waitFor();
            assert.equal(await confirm.isEnabled(), true);
            assert.equal(await page.getByText(/原单同时包含送货和退货明细|原单含退货明细，不能按收货入库/).count(), 0);
            assert.equal(await page.locator(".office-roll-row").count(), 1);
            if (name === "automatic-return") assert.match(await page.locator(".office-roll-table").innerText(), /-68kg/);
          }
          if (width === 1440) assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
        }
        assert.equal(await page.getByRole("button", { name: "改为退货单核对", exact: true }).count(), 0, `${name}: no automatic or mixed case can expose a direction-correction shortcut`);
        assert.deepEqual(errors, [], `${name} at ${width}px`);
        assert.deepEqual(writes, [], `${name} at ${width}px: no business writes`);
        await page.screenshot({ path: `${output}/${name}-${width}.png`, fullPage: true });
        completed.push(`${name}-${width}`);
      } catch (error) {
        await page.screenshot({ path: `${output}/failed-${name}-${width}.png`, fullPage: true });
        throw error;
      } finally { await page.close(); }
    }
  }
} finally { await browser.close(); }
assert.equal(completed.length, 9);
console.log("PASS real 4174 UI at 1440/800/390: ordinary delivery notes ignore return instructions; new return notes await human confirmation; mixed material directions remain blocked with no correction bypass. Anonymous mocked receipts, no business writes or page errors.");
