import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createDeliveryEvidencePolicyService } from "../server/services/deliveryEvidencePolicyService.mjs";
import { createInventoryReservationPolicyService } from "../server/services/inventoryReservationPolicyService.mjs";
import { createStatementPolicyService } from "../server/services/statementPolicyService.mjs";

const inventoryPolicy = createInventoryReservationPolicyService();
assert.equal(Object.isFrozen(inventoryPolicy), true);
assert.deepEqual(Object.keys(inventoryPolicy), ["isReleasableInventoryReservation"]);
for (const status of ["生效", "active", "reserved", "部分释放", "partially_released", " active "]) {
  assert.equal(inventoryPolicy.isReleasableInventoryReservation({ status }), true, status);
}
for (const status of ["已释放", "expired", "cancelled", "", null]) {
  assert.equal(inventoryPolicy.isReleasableInventoryReservation({ status }), false, String(status));
}
assert.equal(inventoryPolicy.isReleasableInventoryReservation(null), false);

const statementPolicy = createStatementPolicyService();
assert.equal(Object.isFrozen(statementPolicy), true);
assert.deepEqual(Object.keys(statementPolicy), [
  "mapStatementApiStatus",
  "mapVarianceHandlingResult",
  "normalizeStatementSendReceiptStatus",
]);
assert.equal(statementPolicy.mapStatementApiStatus("已发送待回款"), "已发送");
assert.equal(statementPolicy.mapStatementApiStatus("已核销"), "已结清");
assert.equal(statementPolicy.mapStatementApiStatus("差额待确认"), "差额待确认");
assert.equal(statementPolicy.mapStatementApiStatus(undefined), undefined);
for (const status of ["delivered", "read", "confirmed", "no_response"]) {
  assert.equal(statementPolicy.normalizeStatementSendReceiptStatus(` ${status} `), status);
}
assert.equal(statementPolicy.normalizeStatementSendReceiptStatus("unknown"), "read");
assert.equal(statementPolicy.mapVarianceHandlingResult("carry_to_debt"), "未收差额转欠款");
assert.equal(statementPolicy.mapVarianceHandlingResult("approved_allowance"), "抹零/减免已审批");
assert.equal(statementPolicy.mapVarianceHandlingResult("bill_needs_recalc"), "账单有误待重算");
assert.equal(statementPolicy.mapVarianceHandlingResult("waiting_more_payments"), "多笔付款待齐");
assert.equal(statementPolicy.mapVarianceHandlingResult("other", "人工说明"), "人工说明");
assert.equal(statementPolicy.mapVarianceHandlingResult("custom", "人工说明"), "人工说明");
assert.equal(statementPolicy.mapVarianceHandlingResult(undefined, undefined), "其他");

const deliveryPolicy = createDeliveryEvidencePolicyService();
assert.equal(Object.isFrozen(deliveryPolicy), true);
assert.deepEqual(Object.keys(deliveryPolicy), [
  "hasDriverWatermarkEvidence",
  "normalizeDeliveryEvidenceReviewStatus",
  "normalizeTimestamp",
]);
for (const evidence of [
  { watermarkedPhotoAttached: true },
  { watermarkedPhotoAttachmentId: " ATT-1 " },
  { watermarkedPhotoId: "PHOTO-1" },
  { watermarkedPhotoUrl: "https://example.invalid/photo" },
]) {
  assert.equal(deliveryPolicy.hasDriverWatermarkEvidence(evidence), true);
}
assert.equal(deliveryPolicy.hasDriverWatermarkEvidence({ watermarkedPhotoAttachmentId: "  " }), false);
assert.equal(deliveryPolicy.hasDriverWatermarkEvidence(), false);
for (const status of ["已复核", "approved", "REVIEWED", "pass", "passed", "ok"]) {
  assert.equal(deliveryPolicy.normalizeDeliveryEvidenceReviewStatus(status), "已复核");
}
for (const status of ["需重拍", "rejected", "reject", "retake_required", "needs_retake", "failed"]) {
  assert.equal(deliveryPolicy.normalizeDeliveryEvidenceReviewStatus(status), "需重拍");
}
assert.equal(deliveryPolicy.normalizeDeliveryEvidenceReviewStatus("pending"), "");
assert.equal(
  deliveryPolicy.normalizeTimestamp("2026-07-14 19:30:00+08:00", "fallback"),
  "2026-07-14T11:30:00.000Z",
);
assert.equal(deliveryPolicy.normalizeTimestamp("invalid", "fallback"), "fallback");

const apiSource = read("../server/apiServer.mjs");
for (const name of [
  "mapStatementApiStatus",
  "mapVarianceHandlingResult",
  "normalizeStatementSendReceiptStatus",
  "hasDriverWatermarkEvidence",
  "normalizeDeliveryEvidenceReviewStatus",
  "normalizeTimestamp",
  "distributeIntegerQty",
  "isReleasableInventoryReservation",
]) {
  assert.doesNotMatch(apiSource, new RegExp(`\\b${name}\\b`), `${name} must not be owned by apiServer.mjs`);
}

assert.match(read("../server/services/statementCommunicationCommandService.mjs"), /statementPolicyService\.mapStatementApiStatus/);
assert.match(read("../server/services/statementFinancialCommandService.mjs"), /statementPolicyService\.mapVarianceHandlingResult/);
assert.match(read("../server/services/fulfillmentActionCommandService.mjs"), /deliveryEvidencePolicyService\.normalizeTimestamp/);
assert.match(read("../server/services/fulfillmentActionCommandService.mjs"), /inventoryReservationPolicyService\.isReleasableInventoryReservation/);
assert.match(read("../server/services/packingCommandService.mjs"), /distributeIntegerQty = distributeIntegerQuantity/);
assert.match(read("../server/services/orderLineMutationCommandService.mjs"), /inventoryReservationPolicyService\.isReleasableInventoryReservation/);
assert.match(read("../server/services/inventoryReservationReleaseCommandService.mjs"), /inventoryReservationPolicyService\.isReleasableInventoryReservation/);

console.log("Domain policy service checks passed: inventory reservation, statement, delivery evidence, and thin API ownership are covered.");

function read(relativePath) {
  return readFileSync(new URL(relativePath, import.meta.url), "utf8");
}
