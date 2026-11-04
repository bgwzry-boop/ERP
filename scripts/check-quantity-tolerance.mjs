// P2-05 多做少做：生产出来的单子差 1% 以内自动处理（少了按实际，多了按下单、多出赠送）。
import assert from "node:assert/strict";
import { autoQuantityDifference, autoQuantityToleranceFor, isProductionMadeOrderLine } from "../shared/quantityTolerance.js";
import { resolveFulfillmentBillingQuantity } from "../server/services/fulfillmentBillingQuantityService.mjs";
import { resolveFulfillmentPrintPricing } from "../server/services/fulfillmentPrintPricingService.mjs";
import { buildFulfillmentPrintTemplate } from "../src/domain/printTemplates.js";
import { createPackageGroupRepository } from "../server/packageGroupRepository.mjs";
import { getPackageGroupContext, replacePackageGroup } from "../server/services/packageGroupService.mjs";

const printed = { id: "OL-1", orderType: "custom_print", qtyBasis: "pieces", qty: 5000, amount: 1000 };
const stock = { id: "OL-2", orderType: "stock", qty: 5000, amount: 1000 };
const rolls = { id: "OL-3", orderType: "external_print", qtyBasis: "incoming_rolls", qty: 5000, amount: 1000 };

assert.equal(autoQuantityToleranceFor(5000), 50);
assert.equal(autoQuantityToleranceFor(99), 0, "below 100 there is no automatic room");
assert.equal(isProductionMadeOrderLine(printed), true);
assert.equal(isProductionMadeOrderLine({ orderType: "定制印刷" }), true, "Chinese aliases count");
assert.equal(isProductionMadeOrderLine({ orderType: "外加工印刷" }), true);
assert.equal(isProductionMadeOrderLine(stock), false, "stock orders are not produced");
assert.equal(isProductionMadeOrderLine(rolls), false, "customer rolls are not counted per piece");

const short = autoQuantityDifference({ orderLine: printed, expectedQty: 5000, actualQty: 4999 });
assert.deepEqual({ kind: short.kind, chargeableQty: short.chargeableQty, freeQty: short.freeQty }, { kind: "short", chargeableQty: 4999, freeQty: 0 });
const over = autoQuantityDifference({ orderLine: printed, expectedQty: 5000, actualQty: 5010 });
assert.deepEqual({ kind: over.kind, chargeableQty: over.chargeableQty, freeQty: over.freeQty }, { kind: "over", chargeableQty: 5000, freeQty: 10 });
assert.match(over.note, /多出 10 个赠送/);
assert.equal(autoQuantityDifference({ orderLine: printed, expectedQty: 5000, actualQty: 5050 })?.kind, "over", "exactly 1% is automatic");
assert.equal(autoQuantityDifference({ orderLine: printed, expectedQty: 5000, actualQty: 5051 }), null, "beyond 1% the office decides");
assert.equal(autoQuantityDifference({ orderLine: printed, expectedQty: 5000, actualQty: 4949 }), null);
assert.equal(autoQuantityDifference({ orderLine: printed, expectedQty: 5000, actualQty: 5000 }), null);
assert.equal(autoQuantityDifference({ orderLine: stock, expectedQty: 5000, actualQty: 5010 }), null);

const workspace = { orderLines: [printed, stock] };
const fulfillment = { id: "F-1", lineId: "OL-1", expectedQty: 5000 };
assert.deepEqual(resolveFulfillmentBillingQuantity({ workspace, fulfillment, actualQty: 5010 }), { deliveredQty: 5010, chargeableQty: 5000, freeQty: 10 });
assert.deepEqual(resolveFulfillmentBillingQuantity({ workspace, fulfillment, actualQty: 4999 }), { deliveredQty: 4999, chargeableQty: 4999, freeQty: 0 });
assert.deepEqual(resolveFulfillmentBillingQuantity({ workspace, fulfillment: { ...fulfillment, lineId: "OL-2" }, actualQty: 5010 }), { deliveredQty: 5010, chargeableQty: 5010, freeQty: 0 }, "stock keeps the old rule");
assert.deepEqual(resolveFulfillmentBillingQuantity({ workspace, fulfillment, actualQty: 5100 }), { deliveredQty: 5100, chargeableQty: 5100, freeQty: 0 }, "beyond 1% nothing is free without the office");

// An office decision still wins over the automatic rule.
const decided = { ...workspace, fulfillmentQuantityVarianceResolutions: [{ fulfillmentId: "F-1", resolutionResult: "按实际数量出库", expectedQty: 5000, actualQty: 5010, createdAt: "2026-11-04T01:00:00Z" }] };
assert.deepEqual(resolveFulfillmentBillingQuantity({ workspace: decided, fulfillment, actualQty: 5010 }), { deliveredQty: 5010, chargeableQty: 5010, freeQty: 0 });

// The paper note: 5010 delivered, priced as 5000, 10 free.
const { pricing } = resolveFulfillmentPrintPricing({ workspace, fulfillment: { ...fulfillment, actualQty: 5010 }, orderLine: printed });
assert.equal(pricing.deliveredQty, 5010);
assert.equal(pricing.chargeableQty, 5000);
assert.equal(pricing.freeQty, 10);
assert.equal(pricing.amount, 1000, "the whole order amount, nothing extra for the free 10");
const shortPricing = resolveFulfillmentPrintPricing({ workspace, fulfillment: { ...fulfillment, actualQty: 4999 }, orderLine: printed }).pricing;
assert.equal(shortPricing.chargeableQty, 4999);
assert.equal(shortPricing.amount, 999.8, "short is priced by the actual quantity");

const template = buildFulfillmentPrintTemplate({ fulfillment: { ...fulfillment, method: "送货", actualQty: 5010, packages: "5件" }, orderLine: printed, pricing, documentType: "delivery_note" });
assert.equal(template.fields.chargeableQuantityText, "5000个");
assert.equal(template.fields.freeQuantityText, "10个");
assert.match(template.fields.quantityNoteText, /多出 10 个赠送，不收费/);
assert.match(template.fields.lineItems[0].note, /多出 10 个赠送/);

// Packing 1010 of 1000 goes straight to label printing; 1020 waits for the office.
for (const [packedQty, expectAuto] of [[1010, true], [1020, false]]) {
  const ws = {
    customers: [{ id: "C1", name: "客户" }],
    orderLines: [{ id: "OL-P", orderId: "ORD-P", orderType: "custom_print", qtyBasis: "pieces", qty: 1000, status: "待打包", product: "印刷袋" }],
    fulfillments: [{ id: "F-P", lineId: "OL-P", customerId: "C1", method: "送货", expectedQty: 1000, status: "待打包", revision: 1 }],
    packingTasks: [{ id: "PK-P", orderLineId: "OL-P", status: "待打包" }],
    packages: [], todos: [], operationLogs: [], fulfillmentExceptions: [],
    productionPackingTransactionRepository: createPackageGroupRepository(),
  };
  const ctx = getPackageGroupContext(ws, { fulfillmentId: "F-P" });
  const receipt = await replacePackageGroup({ workspace: ws, fulfillmentId: "F-P", operatorId: "U-PACK", body: { fulfillmentIds: ["F-P"], snapshotToken: ctx.snapshotToken,
    physicalContentsConfirmed: true, reason: "逐包核对", idempotencyKey: `pack-${packedQty}`, packages: [{ confirmed: true, items: [{ fulfillmentId: "F-P", orderLineId: "OL-P", packedQty }] }] } });
  assert.equal(receipt.quantityDifferences.length, expectAuto ? 0 : 1, `${packedQty}`);
  assert.equal(Boolean(receipt.autoAcceptedDifferences?.length), expectAuto);
  assert.equal(ws.fulfillments[0].status, expectAuto ? "待打印标签" : "数量差异待处理", `${packedQty}`);
}

console.log("quantity tolerance ok");
