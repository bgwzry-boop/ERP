// An ordinary cumulative-receipt update cannot reopen a closed accounting period.
export const closedStatementPaymentStatuses = Object.freeze(["已核销", "已结清", "已确认欠款", "已作废", "作废"]);

export function getStatementPaymentBlocker(statement) {
  if (!closedStatementPaymentStatuses.includes(statement?.status)) return "";
  if (statement.status === "已确认欠款") return "本期已确认欠款，后续补款须关联原欠款记录处理，不能通过本期累计实收重开账单。";
  if (["已作废", "作废"].includes(statement.status)) return "已作废账单不能登记本期实收，请核对付款应关联的有效业务。";
  return "本期已结清，退款或更正须另行留存关联记录，不能覆盖本期累计实收及结清记录。";
}
