import assert from "node:assert/strict";
import { suppliersAreEquivalent, mergeReviewedSupplierReturnsIntoStatement } from "../server/services/rawMaterialSupplierReturnReconciliationService.mjs";
import { applyStageRawMaterialSupplierReturn } from "../server/services/rawMaterialSupplierReturnInventoryService.mjs";
for (const [left, right] of [["甲无纺布", "甲乙无纺布"], ["腾", "腾胜无纺布"], ["腾胜新材料", "腾胜无纺布"], ["北陈新厂", "北陈辅料"]]) {
  assert.equal(suppliersAreEquivalent(left, right), false, `distinct supplier names must not match by substring: ${left}/${right}`);
}
for (const [left, right] of [["宁晋县腾胜无纺布有限公司", "腾胜送货单"], ["北陈辅料", "宁晋县达翔塑料制品有限公司"], ["人意无纺布销售单", "振恒"], ["河北宏尚无纺布有限公司", "白侯无纺布"]]) {
  assert.equal(suppliersAreEquivalent(left, right), true, `explicit accepted aliases remain supported: ${left}/${right}`);
}
const sourceReturn = { id: "RET-1", supplierName: "甲乙无纺布", documentDirection: "supplier_return", status: "退货单已复核", receivedAt: "2026-09-01", amount: -50, totalWeightKg: 10, rollCount: 1 };
const before = { id: "STOCK-1", supplierName: "甲无纺布", rolls: [{ id: "ROLL-1", weightKg: 10, inventoryStatus: "可用" }] };
assert.throws(() => applyStageRawMaterialSupplierReturn({ before, inbounds: [sourceReturn], body: { rollId: "ROLL-1", sourceReturnInboundId: "RET-1" } }), (error) => error.code === "RAW_MATERIAL_SUPPLIER_RETURN_SUPPLIER_MISMATCH");
const reconciled = mergeReviewedSupplierReturnsIntoStatement({ supplierName: "甲无纺布", fileName: "2026-09.xlsx", rows: [], adjustments: [], summary: {} }, [sourceReturn]);
assert.deepEqual(reconciled.addedSupplierReturnIds, []);
assert.deepEqual(reconciled.linkedSupplierReturnIds, []);
assert.equal(reconciled.adjustments.length, 0);
console.log("Supplier identity checks passed: no substring cross-supplier return/credit assignment; explicit accepted aliases retained.");
