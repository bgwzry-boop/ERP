import assert from "node:assert/strict";
import { LARGE_MACHINE_PRINT_TIERS, largeMachinePrintTier, quoteLargeMachinePrint, resolvePrintColorCount } from "../shared/largeMachinePrintPricing.js";
import { resolvePublishedRow } from "../server/orderDraftPublishedPricing.mjs";
import { buildOrderPrintingPriceGroups } from "../server/orderPrintingPriceGroups.mjs";

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

console.log("External print pricing: large-machine ladder by ordered quantity (0.15/0.09/0.08/0.06), × colours, single = double, billed on actual good prints.");
