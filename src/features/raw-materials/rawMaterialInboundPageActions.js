export const RAW_MATERIAL_DELIVERY_NOTE_MAX_PAGES = 4;

export function assertRawMaterialDeliveryNotePageCapacity(existingPageCount, incomingPageCount) {
  if (Number(existingPageCount || 0) + Number(incomingPageCount || 0) > RAW_MATERIAL_DELIVERY_NOTE_MAX_PAGES) {
    throw new Error("同一张送货单最多添加 4 页，请删除多余页面后重试。");
  }
}

export function inferDeliveryNoteMimeType(fileName) {
  const name = String(fileName ?? "").toLowerCase();
  if (name.endsWith(".pdf")) return "application/pdf";
  if (name.endsWith(".png")) return "image/png";
  if (name.endsWith(".bmp")) return "image/bmp";
  if (/\.jpe?g$/.test(name)) return "image/jpeg";
  return "";
}

export function isSupportedDeliveryNoteFile(mimeType) {
  return ["image/png", "image/jpeg", "image/jpg", "image/bmp", "application/pdf"].includes(String(mimeType ?? "").toLowerCase());
}

export function toDeliveryNoteCapturePage({ prepared, file, captureId }) {
  return {
    fileName: prepared.sourceFile?.name || (prepared.pdfPageNumber
      ? `${String(file?.name || "送货单.pdf").replace(/\.pdf$/iu, "")}-第${prepared.pdfPageNumber}页.jpg`
      : file?.name),
    mimeType: prepared.mimeType,
    fileSize: prepared.fileSize,
    contentDataUrl: prepared.contentDataUrl,
    sourceMimeType: prepared.sourceMimeType,
    sourceFileSize: prepared.sourceFileSize,
    sourceContentDataUrl: prepared.sourceContentDataUrl,
    sourceFile: prepared.sourceFile,
    captureId,
    sourceNormalizedForOcr: prepared.normalized,
    pdfPageNumber: prepared.pdfPageNumber || undefined,
  };
}

export function createRawMaterialDeliveryNoteCaptureId() {
  const uuid = globalThis.crypto?.randomUUID?.();
  if (uuid) return `RMCAP-${uuid}`;
  return `RMCAP-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

export async function prepareRawMaterialCapturePages({
  files,
  existingPages = [],
  prepareFilePages,
  onProgress,
}) {
  const selectedFiles = Array.from(files ?? []);
  assertRawMaterialDeliveryNotePageCapacity(existingPages.length, selectedFiles.length);
  const captureId = existingPages[0]?.captureId || createRawMaterialDeliveryNoteCaptureId();
  const preparedPages = [];
  for (const [fileIndex, file] of selectedFiles.entries()) {
    onProgress?.(`正在准备第 ${existingPages.length + fileIndex + 1} 页预览…`);
    const mimeType = file.type || inferDeliveryNoteMimeType(file.name);
    if (!isSupportedDeliveryNoteFile(mimeType)) throw new Error("只支持 PNG、JPG、JPEG、BMP 图片或 PDF。");
    const preparedFilePages = await prepareFilePages(file, { mimeType });
    assertRawMaterialDeliveryNotePageCapacity(
      existingPages.length + preparedPages.length,
      preparedFilePages.length,
    );
    preparedPages.push(...preparedFilePages.map((prepared) =>
      toDeliveryNoteCapturePage({ prepared, file, captureId })
    ));
  }
  return preparedPages;
}

export function buildRawMaterialOcrReviewAction({
  selected,
  reviewFields,
  lineReviewDraft,
  excludedRolls = [],
  buildLineReviewDraft,
}) {
  if (!selected?.id) return null;
  const exclusionsByLineId = new Map();
  for (const exclusion of excludedRolls) {
    const current = exclusionsByLineId.get(exclusion.lineId) ?? [];
    current.push(exclusion);
    exclusionsByLineId.set(exclusion.lineId, current);
  }
  const isSupplierReturn = selected.documentDirection === "supplier_return";
  return {
    action: "复核送货单",
    inboundId: selected.id,
    isSupplierReturn,
    payload: {
      reviewFields,
      lineReviews: (selected.ocrLines ?? []).map((line) => {
        const exclusions = exclusionsByLineId.get(line.lineId) ?? [];
        return {
          lineId: line.lineId,
          values: lineReviewDraft[line.lineId] ?? buildLineReviewDraft(line, selected.documentDirection),
          excludedRollIndices: exclusions.map((entry) => entry.lineRollIndex),
          exclusionReason: exclusions[0]?.reason ?? "",
        };
      }),
      reason: `办公室对照原始${isSupplierReturn ? "退货单" : "送货单"}人工核对并确认腾讯云 OCR 字段。`,
      note: isSupplierReturn
        ? "退货 OCR 字段已人工复核；不生成入库卷码、标签或可用库存，金额作为负数厂家对账依据。"
        : "OCR 字段已人工复核；每卷独立卷码生成后先保存为待补标，补打并逐卷贴标核对后才能形成可用库存。",
    },
  };
}

export function getRawMaterialOcrReviewSaveFailureMessage(isSupplierReturn) {
  return `${isSupplierReturn ? "退货单" : "送货单"}没有保存到服务器。当前填写内容仍保留，请稍后重试；如果持续失败，请联系管理员，不要重复拍单。`;
}

export function resolveRawMaterialOcrReviewCompletion({ isSupplierReturn, completedInbound }) {
  if (isSupplierReturn) return { stage: "return-complete", message: null };
  if (completedInbound?.status === "已入库待补打标签") return { stage: "label-deferred", message: null };
  return {
    stage: "print",
    message: {
      tone: "warning",
      title: "卷码已生成，但待补标状态没有保存",
      body: "单据仍停留在打印步骤；请点“暂不打印，保存为待补标”，不要把未贴标卷料当作可用库存。",
    },
  };
}

export function resolveRawMaterialAttachStage(result) {
  const rolls = result?.rolls ?? [];
  const pendingCount = rolls.filter((roll) => roll.labelStatus === "已打印待贴标").length;
  if (pendingCount > 0 || rolls.length === 0) return null;
  const mismatchCount = rolls.filter((roll) => roll.labelStatus === "标签或实物不符/待确认").length;
  const availableCount = rolls.filter((roll) => roll.inventoryStatus === "可用").length;
  if (mismatchCount > 0) return "receive-partial";
  if (availableCount === rolls.length) return "receive-complete";
  return "attach";
}
