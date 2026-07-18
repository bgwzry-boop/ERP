export function createStatementPolicyService() {
  return Object.freeze({
    mapStatementApiStatus,
    mapVarianceHandlingResult,
    normalizeStatementSendReceiptStatus,
  });
}

function mapStatementApiStatus(value) {
  if (String(value ?? "").includes("已发送")) return "已发送";
  if (value === "已核销") return "已结清";
  return value;
}

function mapVarianceHandlingResult(value, fallback) {
  const map = {
    carry_to_debt: "未收差额转欠款",
    approved_allowance: "抹零/减免已审批",
    bill_needs_recalc: "账单有误待重算",
    waiting_more_payments: "多笔付款待齐",
    other: fallback || "其他",
  };
  return map[value] ?? fallback ?? value ?? "其他";
}

function normalizeStatementSendReceiptStatus(value) {
  const status = String(value ?? "").trim();
  if (["delivered", "read", "confirmed", "no_response"].includes(status)) return status;
  return "read";
}
