import assert from "node:assert/strict";
import { createRawMaterialCommandService } from "../server/services/rawMaterialCommandService.mjs";
import { applySupplierPaymentConfirmation } from "../server/rawMaterialSupplierStatementReviewRepository.mjs";

const operatorId = "U-FINANCE-TEST";
const initialReview = {
  reviewId: "RMSR-COMMAND-ROUNDING",
  revision: 1,
  supplierName: "测试原料供应商",
  status: "已生成应付/待付款确认",
  reviewStatus: "statement_confirmed",
  statementConfirmationId: "RMSC-COMMAND-ROUNDING",
  supplierPayableId: "RMSP-COMMAND-ROUNDING",
  paymentStatus: "待财务付款确认",
  supplierPayableDraft: { supplierPayableId: "RMSP-COMMAND-ROUNDING", payableAmount: 10850, currency: "CNY" },
};
function setup(review = initialReview) {
  const workspace = { users: [{ id: operatorId, displayName: "测试财务" }], rawMaterialSupplierStatementReviews: [structuredClone(review)], operationLogs: [] };
  let writes = 0;
  workspace.rawMaterialSupplierStatementReviewRepository = { confirmPayment(input) {
    const result = applySupplierPaymentConfirmation(input);
    workspace.rawMaterialSupplierStatementReviews = result.reviews;
    writes += 1;
    return result;
  } };
  const service = createRawMaterialCommandService();
  return { workspace, writes: () => writes, pay: body => service.confirmSupplierPayment({ workspace, reviewId: review.reviewId, body, operatorId }) };
}
function snapshot(context) {
  return structuredClone({ reviews: context.workspace.rawMaterialSupplierStatementReviews, logs: context.workspace.operationLogs, writes: context.writes() });
}
async function rejected(context, body, message) {
  const before = snapshot(context);
  await assert.rejects(context.pay(body), message);
  assert.deepEqual(snapshot(context), before, "rejected payment must not change records, audit or write count");
}

const single = setup();
const paid = await single.pay({ paidAmount: 10800, roundingAmount: 50, paymentMethod: "银行转账", paymentReferenceNo: "BANK-ANONYMOUS-1" });
assert.equal(paid.review.paymentStatus, "已确认付款");
assert.equal(paid.review.supplierPaidTotal, 10800);
assert.equal(paid.review.supplierRoundingTotal, 50);
assert.equal(paid.review.supplierPayableRemaining, 0);
assert.equal(paid.paymentRecord.roundingAmount, 50);
assert.equal(paid.review.supplierPaymentRecords.length, 1);
assert.equal(paid.review.supplierPayableDraft.payableAmount, 10850, "rounding is separate and never rewrites the payable");
assert.equal(paid.review.inventoryEffect, "none");
assert.equal(single.workspace.operationLogs.length, 1);
assert.equal(single.workspace.operationLogs[0].operatorId, operatorId);
await rejected(single, { paidAmount: 10800, roundingAmount: 50 }, /already confirmed/);
// A refreshed client receives the persisted paid snapshot; repeating the
// completed request cannot create a second installment or audit event.
const refreshed = setup(paid.review);
await rejected(refreshed, { paidAmount: 10800, roundingAmount: 50 }, /already confirmed/);

const withoutRounding = setup();
const partial = await withoutRounding.pay({ paidAmount: 10800 });
assert.equal(partial.review.paymentStatus, "部分付款");
assert.equal(partial.review.supplierRoundingTotal, 0);
assert.equal(partial.review.supplierPayableRemaining, 50);

const installment = setup();
const first = await installment.pay({ paidAmount: 6000 });
assert.equal(first.review.supplierPayableRemaining, 4850);
const final = await installment.pay({ paidAmount: 4800, roundingAmount: 50 });
assert.equal(final.review.paymentStatus, "已确认付款");
assert.equal(final.review.supplierRoundingTotal, 50);
assert.equal(final.review.supplierPaidTotal, 10800);
assert.equal(final.review.supplierPaymentRecords.length, 2);

const invalid = setup();
await rejected(invalid, { paidAmount: 10850, roundingAmount: 50 }, /exceeds the remaining payable/);
await rejected(invalid, { paidAmount: -1 }, /must be greater than zero/);
await rejected(invalid, { paidAmount: 10800, roundingAmount: -1 }, /must be greater than zero/);
await rejected(invalid, { paidAmount: 6000, roundingAmount: 50 }, /only allowed on the payment that clears/);

console.log("PASS supplier payment command rounding: full and final installment forward rounding, missing rounding stays partial, invalid/overpaid requests do not write, and completed retries after refresh cannot duplicate payment.");
