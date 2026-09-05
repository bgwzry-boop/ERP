export function normalizeStatementCustomerSummary(item) {
  if (!item || typeof item !== "object") return null;
  const statementId = String(item.statementId ?? item.statement_id ?? "").trim();
  if (!statementId) return null;
  return {
    customerId: String(item.customerId ?? item.customer_id ?? "").trim(),
    customerName: String(item.customerName ?? item.customer_name ?? "").trim(),
    settlementCycle: String(item.settlementCycle ?? item.settlement_cycle ?? "").trim(),
    currentReceivable: Number(item.currentReceivable ?? item.current_receivable ?? 0),
    debtAmount: Number(item.debtAmount ?? item.debt_amount ?? 0),
    overdueAmount: Number(item.overdueAmount ?? item.overdue_amount ?? 0),
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
    customerId: statement.customerId,
    customerName: statement.customerName,
    settlementCycle: statement.settlementCycle,
    currentReceivable: statement.receivable,
    debtAmount: statement.variance ?? statement.debtAmount ?? 0,
    paymentPending: String(statement.status ?? "").includes("收款"),
    lastStatementAt: statement.lastStatementAt,
    status: mapLocalStatementStatus(statement.status),
    statementId: statement.id,
    revision: statement.revision,
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
    id: summary.statementId,
    customerId: summary.customerId,
    customerName: summary.customerName,
    settlementCycle: summary.settlementCycle,
    status: mapStatementSummaryStatus(summary.status),
    receivable: summary.currentReceivable,
    variance: summary.debtAmount,
    debtAmount: summary.debtAmount,
    paymentPending: summary.paymentPending,
    lastStatementAt: summary.lastStatementAt,
    lineIds: Array.isArray(localStatement?.lineIds) ? localStatement.lineIds : [],
    readSummaryStatus: summary.status,
    revision: summary.revision,
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
    receivable: Number(source.receivable ?? localStatement?.receivable ?? 0),
    received: Number(source.received ?? localStatement?.received ?? 0),
    variance: Number(source.variance ?? localStatement?.variance ?? 0),
    lineIds,
    statementLines: lines.length ? lines : localStatement?.statementLines ?? [],
    payments: Array.isArray(wrapper.payments) ? wrapper.payments : localStatement?.payments ?? [],
    varianceRecords: Array.isArray(wrapper.varianceRecords)
      ? wrapper.varianceRecords
      : localStatement?.varianceRecords ?? [],
    operationLogs: Array.isArray(wrapper.operationLogs) ? wrapper.operationLogs : localStatement?.operationLogs ?? [],
  };
}
