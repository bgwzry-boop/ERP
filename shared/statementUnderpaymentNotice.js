export const UNDERPAYMENT_READ_AUDIENCES = Object.freeze(["老板", "财务", "管理"]);
export const UNDERPAYMENT_READ_TODO_TYPE = "收款少付差额待阅";
export const UNDERPAYMENT_EFFECTIVE_STATUS = "少付已登记";
export const ROUNDING_HANDLING_RESULT = "抹零";
// Owner decision 2026-10-29 (option A): no fixed threshold; the office settles any customer
// 抹零 directly but must pick one of these reasons, and management is notified with the share.
export const CUSTOMER_ROUNDING_REASON_KINDS = Object.freeze(["抹零头", "订单有问题", "其他"]);

export function roundingShareOfBill(rounding, receivable) {
  const bill = Number(receivable);
  const amount = Number(rounding);
  if (!(bill > 0) || !(amount > 0)) return 0;
  return Math.round((amount / bill) * 10000) / 100;
}
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
  if (!["number", "string"].includes(typeof value) || !String(value).trim()) return null;
  const amount = Number(value);
  const cents = Math.round(amount * 100);
  return Number.isSafeInteger(cents) ? cents : null;
}

function receiptRegistrationTime(row) {
  const timestamp = Date.parse(row?.createdAt || row?.paidAt);
  return Number.isFinite(timestamp) ? timestamp : 0;
}

export function summarizeAnnualReceiptAndRounding(source = {}, year) {
  const target = Number(year);
  const payments = source.payments ?? source.paymentRecords ?? [];
  const varianceRecords = source.varianceRecords ?? [];
  const runningByStatement = new Map();
  let receivedCents = 0;
  // Walk all years first: December's last cumulative balance is the baseline
  // for a January registration. Three registrations are not three transfers.
  const registrations = (Array.isArray(payments) ? [...payments] : []).sort((left, right) =>
    receiptRegistrationTime(left) - receiptRegistrationTime(right) ||
    String(left?.paymentRecordId ?? left?.id ?? "").localeCompare(String(right?.paymentRecordId ?? right?.id ?? "")),
  );
  for (const row of registrations) {
    const statementId = String(row?.statementId ?? row?.statement_id ?? "").trim();
    const amount = moneyCents(row?.amount);
    if (!statementId || amount === null || amount < 0) continue;
    const recordedBefore = moneyCents(row?.statementReceivedBefore);
    const before = recordedBefore !== null && recordedBefore >= 0
      ? recordedBefore
      : runningByStatement.get(statementId) ?? 0;
    if (chinaCalendarYear(row.paidAt) === target) receivedCents += amount - before;
    runningByStatement.set(statementId, amount);
  }
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
