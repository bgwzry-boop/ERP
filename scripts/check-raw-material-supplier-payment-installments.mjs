import assert from "node:assert/strict";
import { applySupplierPaymentConfirmation } from "../server/rawMaterialSupplierStatementReviewRepository.mjs";
import { supplierSettlementState } from "../shared/reviewListSemantics.js";

// Owner decision 2026-10-29: supplier payables are paid in installments and
// most settlements round off (抹零) the tail. 抹零 sits in its own column and
// only on the payment that clears the balance.
let counter = 0;
const idFactory = () => `T${String(++counter).padStart(4, "0")}`;
const baseReview = {
  reviewId: "RMSR-INST-001",
  revision: 4,
  supplierName: "白侯无纺布",
  fileName: "白侯-2026年10月.xlsx",
  status: "已生成应付/待付款确认",
  reviewStatus: "statement_confirmed",
  statementConfirmationId: "RMSC-INST-001",
  supplierPayableId: "RMSP-INST-001",
  payableStatus: "待财务复核",
  paymentStatus: "待财务付款确认",
  supplierPayableDraft: { supplierPayableId: "RMSP-INST-001", payableAmount: 10850, currency: "CNY", status: "待财务复核" },
};
const pay = (review, body, now) =>
  applySupplierPaymentConfirmation({
    workspace: { rawMaterialSupplierStatementReviews: [review] },
    reviewId: review.reviewId,
    ...body,
    operatorId: "U-FINANCE-A",
    operatorName: "财务A",
    now,
    idFactory,
  }).review;

// 1. Two installments, the second rounds off 50: 10850 = 6000 + 4800 + 抹零 50.
const first = pay(baseReview, { paidAmount: 6000, paymentMethod: "银行转账" }, "2026-10-29T08:00:00.000Z");
assert.equal(first.paymentStatus, "部分付款");
assert.equal(first.status, "部分付款/待付清");
assert.equal(first.payableStatus, "部分付款");
assert.equal(first.supplierPaidTotal, 6000);
assert.equal(first.supplierRoundingTotal, 0);
assert.equal(first.supplierPayableRemaining, 4850);
assert.equal(first.supplierPaymentRecords.length, 1);
assert.equal(first.supplierPaymentRecords[0].installmentNo, 1);
assert.equal(first.supplierPayableDraft.payableAmount, 10850, "the payable amount is never rewritten");
assert.equal(first.inventoryEffect, "none");
assert.equal(first.paymentEffect, "supplier_payment_installment_recorded");
assert.equal(supplierSettlementState(first).completedCount, 3, "a partial payment is not settled");

assert.throws(() => pay(first, { paidAmount: 4000, roundingAmount: 50 }, "2026-10-29T09:00:00.000Z"), /only allowed on the payment that clears/);
assert.throws(() => pay(first, { paidAmount: 4900 }, "2026-10-29T09:00:00.000Z"), /exceeds the remaining payable/);
assert.throws(() => pay(first, { paidAmount: 4800, roundingAmount: 60 }, "2026-10-29T09:00:00.000Z"), /exceeds the remaining payable/);
assert.throws(() => pay(first, { paidAmount: 0 }, "2026-10-29T09:00:00.000Z"), /greater than zero/);
assert.throws(() => pay(first, { paidAmount: -1 }, "2026-10-29T09:00:00.000Z"), /greater than zero/);

const second = pay(first, { paidAmount: 4800, roundingAmount: 50, paymentReferenceNo: "BANK-2" }, "2026-10-29T10:00:00.000Z");
assert.equal(second.paymentStatus, "已确认付款");
assert.equal(second.status, "已确认付款/已完成");
assert.equal(second.payableStatus, "已付款");
assert.equal(second.supplierPaidTotal, 10800);
assert.equal(second.supplierRoundingTotal, 50);
assert.equal(second.supplierPayableRemaining, 0);
assert.equal(second.supplierPaymentRecords.length, 2);
assert.equal(second.supplierPaymentRecords[1].roundingAmount, 50);
assert.equal(second.supplierPaymentRecords[1].installmentNo, 2);
assert.equal(second.revision, baseReview.revision + 2);
assert.equal(supplierSettlementState(second).completedCount, 4);
assert.throws(() => pay(second, { paidAmount: 1 }, "2026-10-29T11:00:00.000Z"), /already confirmed/);

// 2. One payment that rounds off: 10850 paid as 10800 + 抹零 50.
const single = pay(baseReview, { paidAmount: 10800, roundingAmount: 50 }, "2026-10-29T08:00:00.000Z");
assert.equal(single.paymentStatus, "已确认付款");
assert.equal(single.supplierRoundingTotal, 50);

// 3. Pure 抹零 to close a small tail left by an installment.
const tail = pay(baseReview, { paidAmount: 10849.5 }, "2026-10-29T08:00:00.000Z");
assert.equal(tail.paymentStatus, "部分付款");
const closed = pay(tail, { paidAmount: 0, roundingAmount: 0.5 }, "2026-10-29T08:30:00.000Z");
assert.equal(closed.paymentStatus, "已确认付款");
assert.equal(closed.supplierPaidTotal, 10849.5);

// 4. No amount given still means "pay the full remaining balance".
const defaulted = pay(first, {}, "2026-10-29T12:00:00.000Z");
assert.equal(defaulted.supplierPaidTotal, 10850);
assert.equal(defaulted.paymentStatus, "已确认付款");

// 5. A review paid before installments existed keeps working as installment one.
const legacy = {
  ...baseReview,
  status: "已确认付款/已完成",
  paymentStatus: "已确认付款",
  supplierPaymentConfirmationId: "RMSPAY-OLD",
  supplierPaymentRecord: { supplierPaymentConfirmationId: "RMSPAY-OLD", paidAmount: 10850 },
};
assert.throws(() => pay(legacy, { paidAmount: 1 }, "2026-10-29T12:00:00.000Z"), /already confirmed/);
assert.equal(supplierSettlementState(legacy).completedCount, 4);
assert.equal(supplierSettlementState({ supplierPaymentConfirmationId: "RMSPAY-OLD" }).completedCount, 4, "legacy rows without paymentStatus stay settled");

console.log("raw-material supplier payment installment check passed: installments add up, 抹零 only clears the balance, overpayment blocked, legacy single payments preserved.");
