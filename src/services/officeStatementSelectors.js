import { optionalFinancialAmount } from "../../shared/financialAmount.js";
export { optionalFinancialAmount } from "../../shared/financialAmount.js";

export function normalizeStatementCustomerSummary(item) {
  if (!item || typeof item !== "object") return null;
  const statementId = String(item.statementId ?? item.statement_id ?? "").trim();
  if (!statementId) return null;
  return {
    customerId: String(item.customerId ?? item.customer_id ?? "").trim(),
    customerName: String(item.customerName ?? item.customer_name ?? "").trim(),
    settlementCycle: String(item.settlementCycle ?? item.settlement_cycle ?? "").trim(),
    ...summaryFinancialAmounts({ ...item, currentReceived: item.currentReceived ?? item.current_received ?? item.received ?? item.received_amount }),
    paymentPending: item.paymentPending === true || item.payment_pending === true,
    lastStatementAt: String(item.lastStatementAt ?? item.last_statement_at ?? "").trim(),
    status: String(item.status ?? "current_period").trim(),
    statementId,
    revision: Math.max(1, Number(item.revision ?? 1) || 1),
  };
}

export function mapLocalStatementCustomerSummary(statement) {
  if (!statement?.id) return null;
  return normalizeStatementCustomerSummary({
    ...statement,
    currentReceivable: statement.receivable,
    currentReceived: statement.received,
    varianceAmount: statement.variance,
    paymentPending: String(statement.status ?? "").includes("收款"),
    status: mapLocalStatementStatus(statement.status),
    statementId: statement.id,
  });
}

function mapLocalStatementStatus(status) {
  const value = String(status ?? "");
  if (value.includes("欠款") || value.includes("差额")) return "debt_or_variance";
  if (value.includes("收款")) return "payment_pending";
  if (value.includes("结清") || value.includes("核销")) return "settled";
  return "current_period";
}

function mapStatementSummaryStatus(status) {
  const labels = {
    current_period: "待生成",
    debt_or_variance: "有欠款",
    payment_pending: "收款待确认",
    settled: "已结清",
  };
  return labels[status] ?? status ?? "待生成";
}

export function mapStatementCustomerSummaryToLocal(item, localStatement = null) {
  const summary = normalizeStatementCustomerSummary(item);
  if (!summary) return null;
  return {
    ...(localStatement ?? {}),
    ...summary,
    id: summary.statementId,
    status: mapStatementSummaryStatus(summary.status),
    receivable: summary.currentReceivable,
    received: summary.currentReceived,
    variance: summary.varianceAmount,
    lineIds: Array.isArray(localStatement?.lineIds) ? localStatement.lineIds : [],
    readSummaryStatus: summary.status,
  };
}

export function normalizeStatementDetail(value, localStatement = null) {
  const wrapper = value && typeof value === "object" ? value : {};
  const source = wrapper.statement && typeof wrapper.statement === "object" ? wrapper.statement : wrapper;
  const id = String(source.id ?? source.statementId ?? source.statement_id ?? localStatement?.id ?? "").trim();
  if (!id) return null;
  const lines = Array.isArray(wrapper.lines) ? wrapper.lines : [];
  const lineIds = Array.isArray(source.lineIds)
    ? source.lineIds
    : Array.isArray(source.line_ids)
      ? source.line_ids
      : lines.map((line) => String(line.orderLineId ?? line.order_line_id ?? "").trim()).filter(Boolean);
  return {
    ...(localStatement ?? {}),
    ...source,
    id,
    customerId: String(source.customerId ?? source.customer_id ?? localStatement?.customerId ?? "").trim(),
    status: String(source.status ?? localStatement?.status ?? "待生成").trim(),
    period: String(source.period ?? localStatement?.period ?? "").trim(),
    receivable: optionalFinancialAmount(source.receivable ?? source.receivableAmount ?? source.receivable_amount ?? source.currentReceivable),
    received: optionalFinancialAmount(source.received ?? source.receivedAmount ?? source.received_amount ?? source.currentReceived),
    variance: optionalFinancialAmount(source.variance ?? source.varianceAmount ?? source.variance_amount),
    ...summaryFinancialAmounts(source),
    lineIds,
    statementLines: lines,
    lineSource: String(wrapper.lineSource ?? ""),
    sendRecords: Array.isArray(wrapper.sendRecords) ? wrapper.sendRecords : [],
    confirmationRecords: Array.isArray(wrapper.confirmationRecords) ? wrapper.confirmationRecords : [],
    writeOffRecords: Array.isArray(wrapper.writeOffRecords) ? wrapper.writeOffRecords : [],
    attachments: Array.isArray(wrapper.attachments) ? wrapper.attachments : [],
    evidenceWarnings: wrapper.evidenceWarnings ?? {},
    payments: Array.isArray(wrapper.payments) ? wrapper.payments : localStatement?.payments ?? [],
    varianceRecords: Array.isArray(wrapper.varianceRecords)
      ? wrapper.varianceRecords
      : localStatement?.varianceRecords ?? [],
    operationLogs: Array.isArray(wrapper.operationLogs) ? wrapper.operationLogs : localStatement?.operationLogs ?? [],
  };
}

function summaryFinancialAmounts(source) {
  return Object.fromEntries(["currentReceivable", "currentReceived", "currentUnpaid", "historicalDebt", "cumulativeDebt", "debtAmount", "varianceAmount", "overdueAmount"]
    .map(key => [key, optionalFinancialAmount(source[key] ?? source[key.replace(/[A-Z]/gu, letter => `_${letter.toLowerCase()}`)])]));
}
