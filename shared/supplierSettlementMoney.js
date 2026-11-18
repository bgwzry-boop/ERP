// Settlement is booked in whole cents, including the last installment.
export function supplierAmountCents(value) {
  if (value === undefined || value === null || value === "" || typeof value === "boolean") return null;
  const match = String(value).trim().match(/^(-?)(\d+)(?:\.(\d{1,2}))?$/u);
  if (!match) return null;
  const cents = Number(match[2]) * 100 + Number((match[3] || "").padEnd(2, "0"));
  return Number.isSafeInteger(cents) ? (match[1] ? -cents : cents) : null;
}

export function sumSupplierAmountCents(records, field) {
  let cents = 0;
  for (const item of records) {
    const amount = supplierAmountCents(item[field]);
    if (amount === null || amount < 0 || !Number.isSafeInteger(cents + amount)) return null;
    cents += amount;
  }
  return cents;
}

export function hasSupplierPaymentReference(referenceNo, voucherNo) {
  return [referenceNo, voucherNo].some((value) => typeof value === "string" && /[^\s\p{Cf}]/u.test(value));
}
