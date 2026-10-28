export const UNDERPAYMENT_READ_AUDIENCES = Object.freeze(["老板", "财务", "管理"]);
export const UNDERPAYMENT_READ_TODO_TYPE = "收款少付差额待阅";
export const UNDERPAYMENT_EFFECTIVE_STATUS = "少付已登记";
export const ROUNDING_HANDLING_RESULT = "抹零";
export const UNDERPAYMENT_SETTLED_STATUS = "已核销";

const CHINA_OFFSET_MS = 8 * 60 * 60 * 1000;

export function chinaCalendarYear(value) {
  if (value == null || value === "") return null;
  const time = Date.parse(value);
  if (Number.isFinite(time)) return new Date(time + CHINA_OFFSET_MS).getUTCFullYear();
  const match = String(value).match(/^(\d{4})/u);
  return match ? Number(match[1]) : null;
}

function moneyCents(value) {
  const amount = Number(value);
  return Number.isFinite(amount) ? Math.round(amount * 100) : null;
}

export function summarizeAnnualReceiptAndRounding(source = {}, year) {
  const target = Number(year);
  const payments = source.payments ?? source.paymentRecords ?? [];
  const varianceRecords = source.varianceRecords ?? [];
  const receivedCents = (Array.isArray(payments) ? payments : [])
    .filter((row) => chinaCalendarYear(row?.paidAt) === target)
    .reduce((sum, row) => sum + (moneyCents(row?.amount) ?? 0), 0);
  const roundingCents = (Array.isArray(varianceRecords) ? varianceRecords : [])
    .filter((row) => row?.handlingResult === ROUNDING_HANDLING_RESULT && chinaCalendarYear(row?.createdAt || row?.paidAt) === target)
    .reduce((sum, row) => sum + (moneyCents(row?.amount) ?? 0), 0);
  return { year: target, receivedTotal: receivedCents / 100, roundingTotal: roundingCents / 100 };
}

export function underpaymentNoticeAudience(todo) {
  if (UNDERPAYMENT_READ_AUDIENCES.includes(todo?.audience)) return todo.audience;
  const match = String(todo?.summary ?? "").match(/^待阅·(老板|财务|管理)/u);
  return match?.[1] ?? "";
}

export function missingUnderpaymentAudiences(todos, statementId) {
  const covered = new Set(
    (Array.isArray(todos) ? todos : [])
      .filter((todo) => todo?.type === UNDERPAYMENT_READ_TODO_TYPE && (todo.ref === statementId || todo.refId === statementId))
      .map(underpaymentNoticeAudience)
      .filter(Boolean),
  );
  return UNDERPAYMENT_READ_AUDIENCES.filter((audience) => !covered.has(audience));
}
