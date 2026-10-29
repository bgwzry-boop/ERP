import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  nextSupplierSettlementAction,
  supplierPaymentTotals,
  validateSupplierPaymentForm,
} from "../docs/prototypes/raw-material-roll-inventory-review/src/supplier-settlement-model.js";

const payable = { reviewId: "R1", reviewStatus: "statement_confirmed", statementConfirmationId: "C1", supplierPayableId: "P1", supplierPayableDraft: { payableAmount: 10850 } };

assert.equal(nextSupplierSettlementAction({ reviewId: "R1", reviewStatus: "draft" }).key, "review");
assert.equal(nextSupplierSettlementAction({ reviewId: "R1", reviewStatus: "reviewed", status: "已人工复核/一致" }).key, "confirm-statement");
assert.equal(nextSupplierSettlementAction({ reviewId: "R1", reviewStatus: "reviewed", status: "已人工复核/有差异" }).key, "blocked-difference");
assert.equal(nextSupplierSettlementAction({ reviewId: "R1", reviewStatus: "statement_confirmed", statementConfirmationId: "C1" }).key, "generate-payable");
assert.equal(nextSupplierSettlementAction(payable).key, "pay");
assert.equal(nextSupplierSettlementAction({ ...payable, supplierPayableDraft: { payableAmount: 0 } }).key, "blocked-zero-payable");

const partial = { ...payable, paymentStatus: "部分付款", supplierPaymentRecords: [{ paidAmount: 6000, roundingAmount: 0, installmentNo: 1 }] };
assert.deepEqual(supplierPaymentTotals(partial), { payable: 10850, paid: 6000, rounding: 0, remaining: 4850, settled: false, count: 1 });
assert.equal(nextSupplierSettlementAction(partial).label, "登记下一笔付款");
const settled = { ...partial, paymentStatus: "已确认付款", supplierPaymentRecords: [...partial.supplierPaymentRecords, { paidAmount: 4800, roundingAmount: 50 }] };
assert.equal(nextSupplierSettlementAction(settled), null);
assert.equal(supplierPaymentTotals(settled).remaining, 0);
// Legacy single payment without paymentStatus reads as settled.
assert.equal(nextSupplierSettlementAction({ ...payable, supplierPaymentConfirmationId: "OLD", supplierPaymentRecord: { paidAmount: 10850 } }), null);

// Form validation mirrors the server rules.
assert.equal(validateSupplierPaymentForm(partial, { paidAmount: "4800", roundingAmount: "50" }).clears, true);
assert.equal(validateSupplierPaymentForm(partial, { paidAmount: "3000" }).remainingAfter, 1850);
assert.match(validateSupplierPaymentForm(partial, { paidAmount: "3000", roundingAmount: "50" }).message, /只能在付清/);
assert.match(validateSupplierPaymentForm(partial, { paidAmount: "5000" }).message, /超过了剩余未付/);
assert.equal(validateSupplierPaymentForm(partial, { paidAmount: "" }).ok, false);
assert.equal(validateSupplierPaymentForm(partial, { paidAmount: "0", roundingAmount: "0" }).ok, false);
assert.equal(validateSupplierPaymentForm({ ...payable, paymentStatus: "部分付款", supplierPaymentRecords: [{ paidAmount: 10849.5 }] }, { paidAmount: "0", roundingAmount: "0.5" }).clears, true);

// The workbench is wired to the real actions, not a read-only summary.
const workbench = readFileSync(new URL("../docs/prototypes/raw-material-roll-inventory-review/src/BusinessWorkspaces.jsx", import.meta.url), "utf8");
assert.match(workbench, /<SupplierStatementUpload /);
assert.match(workbench, /<SupplierSettlementActionPanel /);
const hook = readFileSync(new URL("../docs/prototypes/raw-material-roll-inventory-review/src/useFormalDesktopWorkspace.js", import.meta.url), "utf8");
for (const action of ["precheckSupplierStatement", "saveSupplierStatementReviewDraft", "confirmSupplierStatementReview", "confirmSupplierStatement", "generateSupplierPayable", "confirmSupplierPayment"]) {
  assert.match(hook, new RegExp(`\\b${action},`), `${action} must be exposed`);
}

console.log("review supplier settlement model check passed: stages, installments, 抹零 rules, legacy rows, and wired actions.");
