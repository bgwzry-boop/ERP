export function optionalFinancialAmount(value) {
  if (value === null || value === undefined || (typeof value === "string" && !value.trim()) || !["number", "string"].includes(typeof value)) return null;
  const amount = Number(value);
  return Number.isFinite(amount) ? amount : null;
}
