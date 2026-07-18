function cleanText(value) {
  return String(value ?? "").trim();
}

function toNonNegativeNumber(value, fallback = 0) {
  const normalized = Number(value);
  if (Number.isFinite(normalized) && normalized >= 0) return normalized;
  return fallback;
}

function formatQuantity(value) {
  return `${toNonNegativeNumber(value)} 个`;
}

function getPackageCount(task = {}) {
  const explicitCount = toNonNegativeNumber(task.packageCount);
  if (explicitCount) return explicitCount;
  if (Array.isArray(task.packageChecklist) && task.packageChecklist.length) return task.packageChecklist.length;
  const parsedCount = cleanText(task.packageSummary).match(/\d+/)?.[0];
  return parsedCount ? Number(parsedCount) : 0;
}

export function buildDriverDeliveryCompletionSummary({ task = {}, payload = {} } = {}) {
  const expectedQty = toNonNegativeNumber(task.expectedQty ?? task.qty);
  const actualQty = toNonNegativeNumber(payload.actualQty, expectedQty);
  const packageCount = getPackageCount(task);
  const hasWatermarkedEvidence = Boolean(
    payload.watermarkedPhotoFile ||
    payload.watermarkedPhotoAttachmentId ||
    payload.watermarkedPhotoAttached ||
    task.watermarkedPhotoAttachmentId ||
    task.watermarkedPhotoAttached,
  );
  const hasSignatureEvidence = Boolean(
    payload.signaturePhotoFile ||
    payload.signaturePhotoAttachmentId ||
    payload.signaturePhotoAttached ||
    task.signaturePhotoAttachmentId ||
    task.signaturePhotoAttached,
  );
  const actualQuantityText = actualQty === expectedQty
    ? formatQuantity(actualQty)
    : `${formatQuantity(actualQty)}（应送 ${formatQuantity(expectedQty)}）`;

  return {
    title: "确认提交送达",
    fields: [
      { label: "送货任务", value: cleanText(task.deliveryNoteNo) || cleanText(task.fulfillmentId) || "待确认" },
      { label: "客户", value: cleanText(task.customerName) || "客户待确认" },
      { label: "货品", value: cleanText(task.goodsSummary) || "货品待确认" },
      { label: "实际数量", value: actualQuantityText },
      { label: "包裹", value: packageCount ? `${packageCount} 包` : cleanText(task.packageSummary) || "待确认" },
      { label: "水印照片", value: hasWatermarkedEvidence ? "已准备" : "缺少" },
      { label: "签收照片", value: hasSignatureEvidence ? "已准备" : "未提供（可选）" },
      { label: "收货人", value: cleanText(payload.receiverName) || cleanText(task.receiverName) || "未填写" },
      { label: "纸质联", value: cleanText(payload.paperNoteStatus) || cleanText(task.paperNoteStatus) || "已交回" },
    ],
    effects: [
      "任务将标记为已完成，送达凭证进入办公室复核。",
      "后端将结算有效库存预占；符合条件时写入出库扣减。",
      "后端将创建对账候选，并记录本次司机、时间与凭证审计日志。",
    ],
  };
}
