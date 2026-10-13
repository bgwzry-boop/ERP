export const STATEMENT_DETAIL_TABS = ["本期明细", "凭证/确认", "导出/归档"];

export const STATEMENT_QUICK_FILTERS = ["默认待处理", "欠款/差额", "收款待确认"];

export const STATEMENT_ACTIONS_BY_TAB = {
  本期明细: ["生成对账单预览", "登记实收", "差额待确认", "确认核销"],
  "凭证/确认": ["标记已发送", "标记已读回执", "登记客户确认", "登记实收"],
  "导出/归档": ["生成对账单预览", "导出Excel"],
};

export function createStatementDecisionDraft(type, now = () => new Date().toISOString()) {
  return {
    type,
    handlingResult: "",
    reason: "",
    delegatedDecision: {
      decisionChannel: "wechat",
      decidedAt: now(),
      decisionContent: { summary: "" },
      authorizationBasis: "",
      evidenceDraftId: "",
      evidenceAttachmentIds: [],
    },
  };
}

export function getStatementBucketTone(bucket) {
  if (bucket === "已结清") return "success";
  if (bucket === "欠款/差额") return "danger";
  if (bucket === "收款待确认") return "warning";
  return "blue";
}

export function getStatementExportTypeLabel(previewType) {
  if (previewType === "customer_send") return "客户发送版";
  if (previewType === "internal_archive") return "内部留档版";
  return "导出文件";
}

export function getStatementExportTimeLabel(value) {
  const text = String(value ?? "");
  if (!text) return "时间待补";
  if (text.includes("T")) return text.slice(5, 16).replace("T", " ");
  return text;
}

export function getStatementExportTokenLabel(value) {
  const text = String(value ?? "");
  if (!text) return "待补";
  return text.length > 10 ? `...${text.slice(-10)}` : text;
}

export function buildStatementDecisionIdempotencyKey(type, statementId, revision, createNonce = defaultNonce) {
  return `statement-${type}:${statementId}:${revision}:${createNonce()}`;
}

function defaultNonce() {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}
