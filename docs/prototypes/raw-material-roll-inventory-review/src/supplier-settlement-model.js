// Stage logic for the 供应商月结 workbench (pure, testable without React).
// Flow: 上传月结 Excel → 核对（一致 / 有差异）→ 确认对账 → 生成应付 → 登记付款（可分次、可抹零）.

const round2 = (value) => {
  const number = Number(value);
  return Number.isFinite(number) ? Math.round(number * 100) / 100 : null;
};

export function supplierPaymentRecords(record = {}) {
  if (Array.isArray(record.supplierPaymentRecords)) return record.supplierPaymentRecords.filter(Boolean);
  return record.supplierPaymentRecord ? [record.supplierPaymentRecord] : [];
}

export function supplierPaymentTotals(record = {}) {
  const payable = round2(record.supplierPayableDraft?.payableAmount ?? record.payableAmount) ?? 0;
  const records = supplierPaymentRecords(record);
  const paid = round2(records.reduce((sum, item) => sum + (Number(item.paidAmount) || 0), 0)) ?? 0;
  const rounding = round2(records.reduce((sum, item) => sum + (Number(item.roundingAmount) || 0), 0)) ?? 0;
  const settled = record.paymentStatus === "已确认付款" || (Boolean(record.supplierPaymentConfirmationId) && !record.paymentStatus);
  const remaining = settled ? 0 : Math.max(0, round2(payable - paid - rounding) ?? 0);
  return { payable, paid, rounding, remaining, settled, count: records.length };
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
  const paid = form.paidAmount === "" || form.paidAmount === undefined ? NaN : Number(form.paidAmount);
  const rounding = form.roundingAmount === "" || form.roundingAmount === undefined ? 0 : Number(form.roundingAmount);
  if (!Number.isFinite(paid) || paid < 0) return { ok: false, message: "请填写本次实付金额。" };
  if (!Number.isFinite(rounding) || rounding < 0) return { ok: false, message: "抹零金额不能为负数。" };
  if (paid + rounding <= 0) return { ok: false, message: "实付和抹零不能都为 0。" };
  const total = round2(paid + rounding);
  if (total - remaining > 0.01) return { ok: false, message: `实付加抹零超过了剩余未付 ${remaining} 元。` };
  const clears = Math.abs(total - remaining) <= 0.01;
  if (rounding > 0 && !clears) return { ok: false, message: `抹零只能在付清的那一笔登记：实付 + 抹零要正好等于剩余 ${remaining} 元。` };
  return {
    ok: true,
    clears,
    paidAmount: round2(paid),
    roundingAmount: round2(rounding),
    remainingAfter: clears ? 0 : round2(remaining - total),
    message: clears
      ? rounding > 0 ? `付清：实付 ${round2(paid)} 元，抹零 ${round2(rounding)} 元。` : `付清：实付 ${round2(paid)} 元。`
      : `部分付款：本次 ${round2(paid)} 元，付后还剩 ${round2(remaining - total)} 元。`,
  };
}
