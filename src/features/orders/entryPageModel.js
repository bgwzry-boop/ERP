export const ENTRY_STEPS = [
  { id: 1, title: "第一步：粘贴原文" },
  { id: 2, title: "第二步：校对明细" },
  { id: 3, title: "第三步：库存与确认" },
];

export function getArtworkDisplayValue(row = {}) {
  if (row.print !== "是") return "非印刷不需要";
  const attachment = row.artworkAttachment;
  if (!attachment?.fileName) return row.artworkStatus ?? "待上传";
  const size = Number(attachment.fileSize);
  const sizeLabel = Number.isFinite(size) && size > 0 ? ` · ${formatFileSize(size)}` : "";
  return `${attachment.fileName}${sizeLabel} · 已上传`;
}

export function formatFileSize(bytes) {
  if (bytes >= 1024 * 1024) return `${Math.round((bytes / 1024 / 1024) * 10) / 10}MB`;
  if (bytes >= 1024) return `${Math.round((bytes / 1024) * 10) / 10}KB`;
  return `${bytes}B`;
}

export function buildValidationIssues({ draftRows, missingRows, inventoryIssueRows, reviewRows, getDraftMissingFields }) {
  const issues = [];
  const add = (row, label, tone, kind) => {
    const rowIndex = draftRows.indexOf(row);
    const id = `${kind}-${row.id}`;
    if (!issues.some((item) => item.id === id)) issues.push({ id, row, rowIndex, label, tone });
  };
  missingRows.forEach((row) => add(row, `缺 ${getDraftMissingFields(row).join("、")}`, "danger", "missing"));
  inventoryIssueRows.forEach((row) => add(row, `库存${String(row.inventory).replace(/^库存/, "")}`, row.inventory?.startsWith("缺货") ? "danger" : "warning", "inventory"));
  reviewRows.forEach((row) => {
    const label = row.print === "是" && !["已上传", "已有稿件"].includes(row.artworkStatus) ? "印刷稿件待上传" : "识别内容待确认";
    add(row, label, "warning", "review");
  });
  return issues;
}

export function getConfidenceScore(confidence) {
  if (confidence === "high") return "0.96";
  if (confidence === "medium") return "0.92";
  return "0.68";
}

export function getUnitPrice(row) {
  const qty = toFiniteNumber(row.qty);
  const amount = toFiniteNumber(row.amount);
  if (!qty) return "¥0.00";
  return `¥${(amount / qty).toFixed(2)}`;
}

export function toFiniteNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

export function getQueueKindLabel(kind) {
  return {
    inventory_inquiry: "库存询问",
    temporary_hold: "临时留货",
    duplicate_review: "重复候选",
    cancellation_review: "取消复核",
    intent_review: "意图复核",
  }[kind] ?? "复核上下文";
}

export function isCancelledDraftRow(row) {
  return Boolean(row) && (row.excludedFromConfirmation === true || row.cancellationStatus === "库存不足取消");
}

export function getCancellationLinkState(queueItem, selectedRow) {
  const cancellationIntent = queueItem?.inventoryIntents?.find((intent) => intent.intentType === "shortage_cancellation") ?? null;
  const cancellationCustomerId = cancellationIntent?.customerId || queueItem?.draft?.customerId || "";
  const canLink = Boolean(
    queueItem?.kind === "cancellation_review"
      && cancellationIntent
      && cancellationCustomerId
      && selectedRow?.customerId === cancellationCustomerId
      && !isCancelledDraftRow(selectedRow),
  );
  return { cancellationIntent, cancellationCustomerId, canLink };
}

export function withCurrentColor(colors, currentColor) {
  return [...new Set([currentColor, ...colors].filter(Boolean))];
}

export function getEntryDraftRowDomId(rowIndex) {
  return `entry-draft-row-${rowIndex + 1}`;
}
