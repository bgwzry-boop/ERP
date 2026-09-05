import assert from "node:assert/strict";
import test from "node:test";
import { validateDesktopReceiptReview } from "../src/receipt-review.js";
function fixture() {
  const values = { productName: "无纺布", materialType: "无纺布", factoryColor: "白色", supplierColor: "白", spec: "78*70*2000", rollCount: 2, totalWeightKg: 30, unit: "kg", unitPrice: 2, amount: 60, rollWeightsKg: [10, 20] };
  return { inbound: { revision: 7, sourceAttachmentIds: ["P1", "P2"], ocrLines: [{ lineId: "L1", sourcePageIndex: 1, values }] }, reviewFields: { ...values, supplierName: "测试厂家" }, lineReviews: [{ lineId: "L1", values }], standardColors: [{ name: "白色" }], seenPages: { 0: true, 1: true }, confirmedRolls: { "L1:0": true, "L1:1": true }, reason: "按原图逐卷核对" };
}
test("完整证据复核保留快照版本并拒绝只看部分页、未逐卷确认和汇总错误", () => {
  const input = fixture();
  assert.equal(validateDesktopReceiptReview(input).expectedRevision, 7);
  assert.throws(() => validateDesktopReceiptReview({ ...input, seenPages: { 1: true } }), /全部原始票据/);
  assert.throws(() => validateDesktopReceiptReview({ ...input, confirmedRolls: { "L1:0": true } }), /逐卷核对/);
  assert.throws(() => validateDesktopReceiptReview({ ...input, reviewFields: { ...input.reviewFields, amount: 50 } }), /金额与逐行/);
  assert.throws(() => validateDesktopReceiptReview({ ...input, reviewFields: { ...input.reviewFields, totalWeightKg: 0 } }), /有效的全单/);
});
test("独立分卷重量、未知字段和没有来源页都阻断", () => {
  const input = fixture();
  assert.throws(() => validateDesktopReceiptReview({ ...input, lineReviews: [{ lineId: "L1", values: { ...input.lineReviews[0].values, rollWeightsKg: [] } }] }), /逐卷填写/);
  assert.throws(() => validateDesktopReceiptReview({ ...input, lineReviews: [{ lineId: "L1", values: { ...input.lineReviews[0].values, inventoryStatus: "可用" } }] }), /不允许修改/);
  input.inbound.ocrLines[0].sourcePageIndex = 3;
  assert.throws(() => validateDesktopReceiptReview(input), /真实来源页/);
});
