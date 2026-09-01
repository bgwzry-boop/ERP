import {
  confirmOfficeRawMaterialSupplierPayment,
  confirmOfficeRawMaterialSupplierStatement,
  confirmOfficeRawMaterialSupplierStatementReview,
  createOfficeRawMaterialSupplierStatementReviewDraft,
  generateOfficeRawMaterialSupplierPayableDraft,
  recognizeOfficeRawMaterialDeliveryNote,
  updateOfficeRawMaterialInboundAction,
} from "../services/officeRawMaterialLazyApi.js";
import {
  applyRawMaterialInboundLocalAction,
  buildRawMaterialInboundToastText,
} from "../domain/rawMaterialInboundLocalActions.js";

const defaultApi = {
  confirmOfficeRawMaterialSupplierPayment,
  confirmOfficeRawMaterialSupplierStatement,
  confirmOfficeRawMaterialSupplierStatementReview,
  createOfficeRawMaterialSupplierStatementReviewDraft,
  generateOfficeRawMaterialSupplierPayableDraft,
  recognizeOfficeRawMaterialDeliveryNote,
  updateOfficeRawMaterialInboundAction,
};

export function createOfficeRawMaterialActions({
  allowLocalFallback,
  api = defaultApi,
  authState,
  customers,
  currentUser,
  currentUserId,
  guardUiAction,
  now = () => new Date().toISOString(),
  nowTimeLabel = () => new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" }),
  orderLines,
  rawMaterialInboundsRef,
  rawMaterialSupplierStatementReviewsRef,
  setRawMaterialInboundMeta,
  setRawMaterialInbounds,
  setRawMaterialSupplierStatementReviewMeta,
  setRawMaterialSupplierStatementReviews,
  setSelectedRawMaterialInboundId,
  setToast,
}) {
  const operatorName = () => currentUser.displayName || currentUserId;

  async function recognizeRawMaterialDeliveryNote(file = {}) {
    if (!guardUiAction("rawMaterial", "复核送货单")) return null;
    const result = await api.recognizeOfficeRawMaterialDeliveryNote({
      authState,
      operatorId: currentUserId,
      fileName: file.fileName,
      mimeType: file.mimeType,
      fileSize: file.fileSize,
      contentDataUrl: file.contentDataUrl,
      sourceMimeType: file.sourceMimeType,
      sourceFileSize: file.sourceFileSize,
      sourceContentDataUrl: file.sourceContentDataUrl,
      sourceFile: file.sourceFile,
      captureId: file.captureId,
      documentDirectionHint: file.documentDirectionHint,
      supplierNameHint: file.supplierNameHint,
      sourceAttachmentId: file.sourceAttachmentId,
      sourceNormalizedForOcr: file.sourceNormalizedForOcr === true,
      pdfPageNumber: file.pdfPageNumber,
      useNewModel: false,
      pages: Array.isArray(file.pages) ? file.pages : undefined,
      onProgress: file.onProgress,
      signal: file.signal,
      duplicateConfirmationToken: file.duplicateConfirmationToken,
      ocrJobId: file.ocrJobId,
    });
    if (
      result.blocked &&
      result.error?.code === "RAW_MATERIAL_DELIVERY_NOTE_DUPLICATE_CONFIRMATION_REQUIRED" &&
      result.error?.details?.confirmationToken &&
      globalThis.confirm?.(`${result.error.message}\n\n确认继续后会保留为另一张独立草稿，不会自动合并。`)
    ) {
      return recognizeRawMaterialDeliveryNote({
        ...file,
        duplicateConfirmationToken: result.error.details.confirmationToken,
        ocrJobId: result.error.details.jobId,
      });
    }
    if (
      result.blocked &&
      result.error?.code === "RAW_MATERIAL_DELIVERY_NOTE_PAGE_OCR_FAILED" &&
      result.error?.details?.jobId &&
      globalThis.confirm?.(`${result.error.message}\n\n确认后只重试失败页，已经成功的页面不会重新上传或重复识别。`)
    ) {
      return recognizeRawMaterialDeliveryNote({
        ...file,
        ocrJobId: result.error.details.jobId,
      });
    }
    if (result.cancelled) return null;
    if (result.blocked || !result.inbound?.id) {
      const message = result.error?.message ?? "原材料送货单 OCR 识别失败。";
      setRawMaterialInboundMeta((current) => ({
        ...current,
        source: result.source || "api_error",
        error: message,
      }));
      setToast(`送货单没有生成草稿：${message}`);
      throw Object.assign(new Error(message), {
        code: result.error?.code || "RAW_MATERIAL_DELIVERY_NOTE_OCR_FAILED",
      });
    }
    setRawMaterialInbounds((current) => [
      result.inbound,
      ...current.filter((item) => item.id !== result.inbound.id),
    ]);
    setRawMaterialInboundMeta((current) => ({
      ...current,
      source: "api",
      total: result.deduplicated ? current.total : Math.max(Number(current.total) || 0, rawMaterialInboundsRef.current.length + 1),
      error: "",
      lastSyncedAt: nowTimeLabel(),
    }));
    setSelectedRawMaterialInboundId(result.inbound.id);
    setToast(
      result.deduplicated
        ? `这张送货单已识别过，已打开草稿 ${result.inbound.id}，没有重复扣 OCR 次数。`
        : `腾讯云 OCR 已生成草稿 ${result.inbound.id}${result.inbound.ocrPageCount > 1 ? `（${result.inbound.ocrPageCount} 页）` : ""}；请对照原图完成人工复核，当前未增加可用库存。`,
    );
    return result.inbound;
  }

  async function updateRawMaterialInbound(action, inboundId, options = {}) {
    if (!guardUiAction("rawMaterial", action)) return null;
    const target = rawMaterialInboundsRef.current.find((item) => item.id === inboundId);
    if (!target) {
      setToast(`未找到原材料入库单 ${inboundId}。`);
      return null;
    }
    const actionAt = now();
    const toastText = buildRawMaterialInboundToastText(action, target, options);
    const result = await api.updateOfficeRawMaterialInboundAction({
      authState,
      operatorId: currentUserId,
      operatorName: operatorName(),
      inboundId,
      // A follow-up write in the same UI interaction (for example, reviewing
      // OCR then deferring labels) must use the version returned by the first
      // write. React state has not necessarily committed by then, so relying
      // only on the ref here would submit the old version and cause a false
      // optimistic-lock conflict.
      expectedRevision: Number(options.expectedRevision ?? target.revision ?? 0),
      action,
      rollId: options.rollId,
      sourceReturnInboundId: options.sourceReturnInboundId,
      physicalReturnConfirmed: options.physicalReturnConfirmed,
      confirmation: options.confirmation,
      shipmentReferenceNo: options.shipmentReferenceNo,
      reason: options.reason,
      machineId: options.machineId,
      productionTaskId: options.productionTaskId,
      issuePurpose: options.issuePurpose,
      issuedWeightKg: options.issuedWeightKg,
      issuedQuantity: options.issuedQuantity,
      consumedWeightKg: options.consumedWeightKg,
      consumedQuantity: options.consumedQuantity,
      leftoverWeightKg: options.leftoverWeightKg,
      leftoverQuantity: options.leftoverQuantity,
      returnLocation: options.returnLocation,
      reviewedWeightKg: options.reviewedWeightKg,
      reviewedQuantity: options.reviewedQuantity,
      reviewLocation: options.reviewLocation,
      machineCount: options.machineCount,
      qualifiedOutputQuantity: options.qualifiedOutputQuantity,
      reviewFields: options.reviewFields,
      lineReviews: options.lineReviews,
      matchResult: options.matchResult,
      checkedWeightKg: options.checkedWeightKg,
      checkedColor: options.checkedColor,
      checkedSpec: options.checkedSpec,
      location: options.location,
      verificationNote: options.verificationNote,
      note: options.note,
    });

    if (!result.blocked && result.inbound?.id) {
      setRawMaterialInbounds((current) =>
        current.map((item) => (item.id === inboundId ? result.inbound : item)),
      );
      setRawMaterialInboundMeta((current) => ({
        ...current,
        source: "api",
        error: "",
        lastSyncedAt: nowTimeLabel(),
      }));
      setSelectedRawMaterialInboundId(inboundId);
      setToast(toastText);
      return result.inbound;
    }

    if (result.error?.requiredPermission || result.error?.status === 403) {
      setRawMaterialInboundMeta((current) => ({
        ...current,
        source: result.source,
        error: result.error?.message ?? "原材料入库动作 API 返回错误。",
      }));
      setToast(
        result.error?.requiredPermission
          ? `后端拒绝原材料动作：缺少权限 ${result.error.requiredPermission}。`
          : `后端拒绝原材料动作：${result.error?.message ?? "未知错误"}`,
      );
      return null;
    }

    if (result.error?.status && result.error.status < 500) {
      setRawMaterialInboundMeta((current) => ({
        ...current,
        source: result.source,
        error: result.error?.message ?? "原材料入库动作 API 返回业务校验错误。",
      }));
      setToast(`后端拒绝原材料动作：${result.error?.message ?? "业务校验未通过"}`);
      return null;
    }

    if (!allowLocalFallback) {
      const message = result.error?.message ?? "原材料入库动作 API 不可用。";
      setRawMaterialInboundMeta((current) => ({
        ...current,
        source: result.source || "api_error",
        error: message,
      }));
      setToast(`原材料动作未保存：${message} 生产/正式后端模式禁止本地降级。`);
      return null;
    }

    const localResult = applyRawMaterialInboundLocalAction(rawMaterialInboundsRef.current, {
      action,
      customers,
      inboundId,
      options,
      now: actionAt,
      operatorName: operatorName(),
      orderLines,
    });
    setRawMaterialInbounds(localResult.items);
    setRawMaterialInboundMeta((current) => ({
      ...current,
      source: "local_fallback",
      error: result.error?.message ?? "",
      lastSyncedAt: nowTimeLabel(),
    }));
    setSelectedRawMaterialInboundId(inboundId);
    setToast(toastText);
    return localResult.updatedItem;
  }

  async function saveRawMaterialSupplierStatementReviewDraft(statementResult, options = {}) {
    if (!guardUiAction("rawMaterial", "复核送货单")) return null;
    const result = await api.createOfficeRawMaterialSupplierStatementReviewDraft({
      authState,
      operatorId: currentUserId,
      statementResult,
      supplierName: options.supplierName,
      fileName: options.fileName,
      note: options.note,
    });
    if (result.blocked || !result.review?.reviewId) {
      setRawMaterialSupplierStatementReviewMeta((current) => ({
        ...current,
        source: result.source,
        error: result.error?.message ?? "保存供应商月结复核草稿失败。",
      }));
      setToast(
        result.error?.requiredPermission
          ? `后端拒绝保存月结复核草稿：缺少权限 ${result.error.requiredPermission}。`
          : `保存月结复核草稿失败：${result.error?.message ?? "未知错误"}`,
      );
      return null;
    }
    setRawMaterialSupplierStatementReviews((current) => [
      result.review,
      ...current.filter((item) => item.reviewId !== result.review.reviewId),
    ].slice(0, 20));
    setRawMaterialSupplierStatementReviewMeta((current) => ({
      ...current,
      source: "api",
      total: Math.max(current.total || 0, rawMaterialSupplierStatementReviewsRef.current.length + 1),
      error: "",
      lastSyncedAt: nowTimeLabel(),
    }));
    setToast(`已保存供应商月结复核草稿 ${result.review.reviewId}；仍不写库存、不生成应付、不确认付款。`);
    return result.review;
  }

  async function updateSupplierReview({ action, failureLabel, permissionLabel, reviewId, successMessage, options = {} }) {
    if (!guardUiAction("rawMaterial", action.guardAction)) return null;
    const result = await action.operation({
      authState,
      operatorId: currentUserId,
      reviewId,
      ...action.buildInput(options),
    });
    if (result.blocked || !result.review?.reviewId) {
      setToast(
        result.error?.requiredPermission
          ? `后端拒绝${permissionLabel}：缺少权限 ${result.error.requiredPermission}。`
          : `${failureLabel}：${result.error?.message ?? "未知错误"}`,
      );
      return null;
    }
    setRawMaterialSupplierStatementReviews((current) =>
      current.map((item) => (item.reviewId === result.review.reviewId ? result.review : item)),
    );
    setToast(successMessage(result));
    return result.review;
  }

  const confirmRawMaterialSupplierStatementReviewDraft = (reviewId, options = {}) => updateSupplierReview({
    action: {
      guardAction: "复核送货单",
      operation: api.confirmOfficeRawMaterialSupplierStatementReview,
      buildInput: (input) => ({ decision: input.decision, adjustments: input.adjustments, note: input.note }),
    },
    failureLabel: "确认月结复核草稿失败",
    permissionLabel: "确认月结复核草稿",
    reviewId,
    options,
    successMessage: (result) => `已标记月结复核草稿 ${result.review.reviewId} 为${result.review.status}；财务付款仍需另走确认。`,
  });

  const confirmRawMaterialSupplierStatement = (reviewId, options = {}) => updateSupplierReview({
    action: {
      guardAction: "复核送货单",
      operation: api.confirmOfficeRawMaterialSupplierStatement,
      buildInput: (input) => ({ note: input.note }),
    },
    failureLabel: "确认供应商月结对账失败",
    permissionLabel: "确认供应商月结对账",
    reviewId,
    options,
    successMessage: (result) => `已确认供应商月结对账 ${result.review.statementConfirmationId || result.review.reviewId}；付款状态：${result.review.paymentStatus || "待财务付款确认"}。`,
  });

  const generateRawMaterialSupplierPayableDraft = (reviewId, options = {}) => updateSupplierReview({
    action: {
      guardAction: "生成应付",
      operation: api.generateOfficeRawMaterialSupplierPayableDraft,
      buildInput: (input) => ({ note: input.note }),
    },
    failureLabel: "生成供应商应付草稿失败",
    permissionLabel: "生成供应商应付草稿",
    reviewId,
    options,
    successMessage: (result) => {
      const amount = result.review.supplierPayableDraft?.payableAmount ?? result.payableDraft?.payableAmount ?? 0;
      return `已生成供应商应付草稿 ${result.review.supplierPayableId}，金额 ¥${amount}；付款仍需财务确认。`;
    },
  });

  const confirmRawMaterialSupplierPayment = (reviewId, options = {}) => updateSupplierReview({
    action: {
      guardAction: "确认付款",
      operation: api.confirmOfficeRawMaterialSupplierPayment,
      buildInput: (input) => ({
        paidAmount: input.paidAmount,
        paymentMethod: input.paymentMethod,
        paymentAccount: input.paymentAccount,
        paymentReferenceNo: input.paymentReferenceNo,
        paymentVoucherNo: input.paymentVoucherNo,
        paidAt: input.paidAt,
        note: input.note,
      }),
    },
    failureLabel: "确认供应商付款失败",
    permissionLabel: "确认供应商付款",
    reviewId,
    options,
    successMessage: (result) => {
      const paymentId = result.review.supplierPaymentConfirmationId || result.paymentRecord?.supplierPaymentConfirmationId;
      const amount = result.review.supplierPaymentRecord?.paidAmount ?? result.paymentRecord?.paidAmount ?? 0;
      return `已确认供应商付款 ${paymentId}，金额 ¥${amount}；该动作只记录付款，不写原材料库存。`;
    },
  });

  return {
    confirmRawMaterialSupplierPayment,
    confirmRawMaterialSupplierStatement,
    confirmRawMaterialSupplierStatementReviewDraft,
    generateRawMaterialSupplierPayableDraft,
    saveRawMaterialSupplierStatementReviewDraft,
    recognizeRawMaterialDeliveryNote,
    updateRawMaterialInbound,
  };
}
