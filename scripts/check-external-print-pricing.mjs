import assert from "node:assert/strict";
import { LARGE_MACHINE_PRINT_TIERS, largeMachinePrintTier, printUnitPriceFor, quoteLargeMachinePrint, resolvePrintColorCount, resolvePrintMethod } from "../shared/largeMachinePrintPricing.js";
import { resolvePublishedRow } from "../server/orderDraftPublishedPricing.mjs";
import { buildOrderPrintingPriceGroups } from "../server/orderPrintingPriceGroups.mjs";
import { getPrintUnitPrice } from "../src/domain/priceTable.js";
import { quoteMiniappCatalogPrice } from "../server/miniapp/miniappErpProjectionAdapter.mjs";
import { createMiniappCatalogPolicy } from "../server/miniapp/miniappCatalogPolicy.mjs";

// 负责人 2026-11-03：外加工印刷（同行送布料来）只收印刷费，含制版费；大机器丝印阶梯价按下单数量定档，
// 几色翻几倍，单双面同价；应收按实际印好的数量。
const tier = (qty) => largeMachinePrintTier(qty)?.unitPrice;
assert.deepEqual([1, 1999, 2000, 4999, 5000, 9999, 10000, 50000].map(tier), [0.15, 0.15, 0.09, 0.09, 0.08, 0.08, 0.06, 0.06]);
assert.equal(largeMachinePrintTier(0), null);
assert.equal(LARGE_MACHINE_PRINT_TIERS.length, 4);

assert.equal(resolvePrintColorCount({ printColor: "红" }), 1);
assert.equal(resolvePrintColorCount({ printColor: "红/蓝" }), 2);
assert.equal(resolvePrintColorCount({ printColor: "红色、蓝色、白色" }), 3);
assert.equal(resolvePrintColorCount({ printColor: "红/红" }), 1, "the same colour twice is one colour");
assert.equal(resolvePrintColorCount({ printColor: "待确认" }), 0);
assert.equal(resolvePrintColorCount({ printColor: "红", printColorCount: 3 }), 3, "an explicit colour count wins");

// 下单 5000、实际印好 4960：单价仍按 5000 档，按 4960 收。
const actual = quoteLargeMachinePrint({ orderedQty: 5000, colorCount: 2, chargeableQty: 4960 });
assert.deepEqual({ unitPrice: actual.unitPrice, amount: actual.amount, tierLabel: actual.tierLabel }, { unitPrice: 0.16, amount: 793.6, tierLabel: "5000–9999 个" });
// 下单 2000、实际 1999：仍按 0.09。
assert.equal(quoteLargeMachinePrint({ orderedQty: 2000, colorCount: 1, chargeableQty: 1999 }).amount, 179.91);

const source = { priceTable: { id: "PT-1", versionNo: 3 }, priceItems: [] };
const single = resolvePublishedRow(source, { orderType: "external_print", qty: 3000, printColor: "红", printSide: "单面" });
const double = resolvePublishedRow(source, { orderType: "external_print", qty: 3000, printColor: "红", printSide: "双面" });
assert.deepEqual([single.bagPrice, single.printPrice, single.amount], [0, 0.09, 270], "no bag price; 3000 × 0.09");
assert.equal(double.printPrice, single.printPrice, "single and double sided cost the same");
assert.equal(single.sourceEvidence.kind, "external_print_ladder");
assert.equal(single.sourceEvidence.colorCount, 1);
assert.throws(() => resolvePublishedRow(source, { orderType: "external_print", qty: 3000, printColor: "待确认" }),
  (error) => error.code === "ORDER_PRICE_SOURCE_REQUIRED" && /几种颜色/.test(error.message));

// 外加工不进本厂印刷合组，按自己的阶梯逐行计价。
const groups = buildOrderPrintingPriceGroups([
  { id: "L1", orderType: "external_print", customerId: "C1", size: "40*32", printContent: "同行A标", printColor: "红", qty: 3000 },
  { id: "L2", orderType: "external_print", customerId: "C1", size: "40*32", printContent: "同行A标", printColor: "红", qty: 3000 },
]);
assert.equal(groups.length, 0);

// 负责人 2026-11-03：印刷费统一收费 —— 自己的网店、客户订单、外加工卷料都用同一套阶梯价。
const ownGroups = buildOrderPrintingPriceGroups([
  { id: "O1", orderType: "custom_print", customerId: "C2", size: "30*38*10", printContent: "店名", printColor: "红", printSide: "双面", qty: 1500 },
  { id: "O2", orderType: "custom_print", customerId: "C2", size: "30*38*10", printContent: "店名", printColor: "红", printSide: "双面", qty: 1000 },
  { id: "O3", orderType: "custom_print", customerId: "C2", size: "30*38*10", printContent: "LOGO", printColor: "红/蓝", printSide: "单面", qty: 6000 },
]);
assert.ok(ownGroups.some((group) => group.quantity === 2500 && group.unitPrice === 0.09), "own-factory double-sided group of 2500: 0.09, same as single sided");
assert.ok(ownGroups.some((group) => group.quantity === 6000 && group.unitPrice === 0.16), "two colours × 0.08");
assert.equal(getPrintUnitPrice({ print: "是", style: "空白袋", printSide: "双面", printColor: "红", qty: 1500 }), 0.15, "office estimate: under 2000 is 0.15 for double sided too");
assert.equal(getPrintUnitPrice({ print: "是", style: "空白袋", printColor: "红/黑", qty: 3000 }), 0.18, "office estimate: two colours × 0.09");
const master = { priceTable: { id: "PT", bizNo: "PT", versionNo: 1 } };
const miniQuote = quoteMiniappCatalogPrice(master, { quantity: 2000, productType: "custom_print", printColor: "红", printColorCount: 2, printSide: "double" }, { item: { bagPrice: 0.3, printPrice: 0.5, otherFee: 0 } });
assert.deepEqual([miniQuote.printFee, miniQuote.amount], [0.18, 960], "mini program: 2000 × (0.30 + 2 × 0.09); a stray table print price no longer overrides the ladder");
const catalog = createMiniappCatalogPolicy();
assert.deepEqual(catalog.printPriceTiers.map((tier) => [tier.minQty, tier.unitPrice]), [[10000, 0.06], [5000, 0.08], [2000, 0.09], [1, 0.15]]);
assert.equal(catalog.printPricePerColor, true);
assert.deepEqual(catalog.printPriceRules, { manualSingle: 0.09, manualDouble: 0.13, machineFrom1000: 0.15, machineFrom2000: 0.09, machineFrom5000: 0.08, machineFrom10000: 0.06,
  below3000Single: 0.09, below3000Double: 0.13, from3000: 0.09, from5000: 0.08, from10000: 0.06 }, "the mini program quote service reads machineFrom*/manual*");

// 手工丝印：1000 个以下默认手工，单面 0.09、双面 0.13，几色翻几倍，版费另收；可明确指定机器或手工。
assert.equal(resolvePrintMethod({}, 999), "manual");
assert.equal(resolvePrintMethod({}, 1000), "machine", "1000 defaults to the machine until the customer chooses");
assert.equal(resolvePrintMethod({ printMethod: "manual" }, 1000), "manual", "the customer's choice wins");
assert.equal(resolvePrintMethod({ printMethod: "machine" }, 500), "machine");
assert.deepEqual([500, 999].map((qty) => printUnitPriceFor({ orderedQty: qty, method: "manual", printSide: "单面" })), [0.09, 0.09]);
assert.equal(printUnitPriceFor({ orderedQty: 500, method: "manual", printSide: "双面" }), 0.13);
assert.equal(printUnitPriceFor({ orderedQty: 500, method: "manual", printSide: "单面", colorCount: 2 }), 0.18);
assert.equal(printUnitPriceFor({ orderedQty: 500, method: "machine" }), 0.15, "a small order printed by machine pays the machine price");
const manualExternal = resolvePublishedRow(source, { orderType: "external_print", qty: 800, printColor: "白", printSide: "双面" });
assert.deepEqual([manualExternal.printPrice, manualExternal.amount, manualExternal.sourceEvidence.printMethod, manualExternal.sourceEvidence.plateFeeIncluded], [0.13, 104, "manual", false]);
assert.match(manualExternal.sourceEvidence.plateFeeNote, /其他费/);
assert.equal(getPrintUnitPrice({ print: "是", style: "空白袋", printSide: "双面", printColor: "红", qty: 600 }), 0.13);
console.log("External print pricing: large-machine ladder by ordered quantity (0.15/0.09/0.08/0.06), × colours, single = double, billed on actual good prints.");
