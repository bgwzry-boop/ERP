import { hasSupplierPaymentReference, supplierAmountCents, sumSupplierAmountCents } from "../../../../shared/supplierSettlementMoney.js";

// Stage logic for the 供应商月结 workbench (pure, testable without React).
// Flow: 上传月结 Excel → 核对（一致 / 有差异）→ 确认对账 → 生成应付 → 登记付款（可分次、可抹零）.

export function supplierPaymentRecords(record = {}) {
  if (Array.isArray(record.supplierPaymentRecords)) return record.supplierPaymentRecords.filter(Boolean);
  return record.supplierPaymentRecord ? [record.supplierPaymentRecord] : [];
}

export function supplierPaymentTotals(record = {}) {
  const payableCents = supplierAmountCents(record.supplierPayableDraft?.payableAmount ?? record.payableAmount);
  const records = supplierPaymentRecords(record);
  const paidCents = sumSupplierAmountCents(records, "paidAmount");
  const roundingCents = sumSupplierAmountCents(records.map((item) => ({ ...item, roundingAmount: item.roundingAmount ?? 0 })), "roundingAmount");
  const settled = record.paymentStatus === "已确认付款" || (Boolean(record.supplierPaymentConfirmationId) && !record.paymentStatus);
  const remainder = payableCents - paidCents - roundingCents;
  const remaining = settled ? 0 : Math.max(0, remainder) / 100;
  return { payable: (payableCents ?? 0) / 100, paid: (paidCents ?? 0) / 100, rounding: (roundingCents ?? 0) / 100, remaining, settled, count: records.length };
}

// The one next action for a review, or null when nothing is left to do.
export function nextSupplierSettlementAction(record = {}) {
  if (!record?.reviewId && !record?.id) return null;
  if (record.reviewStatus === "draft") return { key: "review", label: "核对对账单" };
  if (record.reviewStatus === "reviewed") {
    if (String(record.status || "").includes("一致") && !record.statementConfirmationId) return { key: "confirm-statement", label: "确认对账" };
    return { key: "blocked-difference", label: "有差异，需与供应商核实后重新上传" };
  }
  if (record.statementConfirmationId && !record.supplierPayableId) return { key: "generate-payable", label: "生成应付" };
  if (record.supplierPayableId) {
    const totals = supplierPaymentTotals(record);
    if (totals.settled) return null;
    if (!(totals.payable > 0)) return { key: "blocked-zero-payable", label: "应付金额为 0，无需付款" };
    return { key: "pay", label: totals.count ? "登记下一笔付款" : "登记付款" };
  }
  return null;
}

// Validates the payment form the same way the server does, so the button can
// explain itself before anything is sent.
export function validateSupplierPaymentForm(record = {}, form = {}) {
  const { remaining } = supplierPaymentTotals(record);
  const remainingCents = Math.round(remaining * 100);
  const paid = supplierAmountCents(form.paidAmount);
  const rounding = supplierAmountCents(form.roundingAmount || "0");
  if (paid === null || paid < 0) return { ok: false, message: "请填写本次实付金额，最多保留两位小数。" };
  if (rounding === null || rounding < 0) return { ok: false, message: "抹零金额须为非负数，最多保留两位小数。" };
  if (paid + rounding <= 0) return { ok: false, message: "实付和抹零不能都为 0。" };
  if (paid > remainingCents || rounding > remainingCents - paid) return { ok: false, message: `实付加抹零超过了剩余未付 ${remaining} 元。` };
  const remainingAfter = (remainingCents - paid - rounding) / 100;
  const clears = remainingAfter === 0;
  if (rounding > 0 && !clears) return { ok: false, message: `抹零只能在付清的那一笔登记：实付 + 抹零要正好等于剩余 ${remaining} 元。` };
  if (paid > 0 && !hasSupplierPaymentReference(form.paymentReferenceNo, form.paymentVoucherNo)) {
    return { ok: false, message: "请填写付款流水号或财务凭证号。" };
  }
  return {
    ok: true,
    clears,
    paidAmount: paid / 100,
    roundingAmount: rounding / 100,
    remainingAfter,
    message: clears
      ? rounding > 0 ? `付清：实付 ${paid / 100} 元，抹零 ${rounding / 100} 元。` : `付清：实付 ${paid / 100} 元。`
      : `部分付款：本次 ${paid / 100} 元，付后还剩 ${remainingAfter} 元。`,
  };
}
