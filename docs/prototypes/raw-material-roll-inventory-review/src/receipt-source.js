const text = (value) => String(value ?? "").trim();
const recordedIndex = (value) => value !== null && value !== undefined && value !== "" && Number.isInteger(Number(value)) && Number(value) >= 0 ? Number(value) : null;

export function getReceiptSourcePages(inbound = {}) {
  const ids = Array.isArray(inbound.sourceAttachmentIds) && inbound.sourceAttachmentIds.length
    ? inbound.sourceAttachmentIds.map(text)
    : inbound.sourceAttachmentId ? [text(inbound.sourceAttachmentId)] : [];
  const count = Math.max(ids.length, inbound.ocrPages?.length || 0, Number(inbound.ocrPageCount) || 0);
  return Array.from({ length: Math.min(4, count) }, (_, index) => ({ index, attachmentId: ids[index] || "" }));
}

export function resolveRollSourceEvidence(inbound = {}, roll = {}) {
  const line = (inbound.ocrLines ?? []).find((item) => item.lineId === roll.ocrLineId);
  return {
    deliveryNoteNo: text(inbound.deliveryNoteNo),
    lineId: text(line?.lineId),
    pageIndex: recordedIndex(line?.sourcePageIndex),
    rowIndex: recordedIndex(line?.sourceRowIndex),
    rollIndex: recordedIndex(roll.sourceLineRollIndex),
    sourceText: text(line?.sourceText),
  };
}
