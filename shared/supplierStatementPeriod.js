export function supplierStatementDay(value) {
  const match = String(value ?? "").trim().match(/^(20\d{2})[-/.年](\d{1,2})[-/.月](\d{1,2})(?=$|日|T|\s)/u);
  if (!match) return "";
  const [, year, month, day] = match;
  const date = `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  const parsed = new Date(`${date}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date ? date : "";
}

export function supplierStatementPeriod(start, end) {
  const from = supplierStatementDay(start);
  const through = supplierStatementDay(end);
  return from && through && from <= through ? { from, through } : null;
}

export function supplierDayInPeriod(value, period) {
  const day = supplierStatementDay(value);
  return Boolean(day && period && day >= period.from && day <= period.through);
}
