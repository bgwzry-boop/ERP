import { requestOfficeApi as requestRawMaterialApi } from "./officeApiClientCore.js";
import { uploadOfficeAttachmentFile } from "./officeAttachmentApiClient.js";
import { attachmentUploadLimits } from "../../shared/attachmentUploadPolicy.js";

export async function listOfficeRawMaterialPurchaseRequests(input = {}, options = {}) {
  const { authState, operatorId } = input;
  try {
    const response = await requestRawMaterialApi("/raw-material-purchase-requests", { ...options, authState, operatorId });
    const json = await readJson(response);
    if (!response.ok) return { source: "api_error", blocked: true, items: [], error: toApiError(json, response.status, "采购请求读取失败。") };
    return { source: "api", items: Array.isArray(json?.items) ? json.items : [], total: Number(json?.total ?? 0) };
  } catch (error) {
    return { source: "api_error", blocked: true, items: [], error: { code: "RAW_MATERIAL_PURCHASE_LIST_UNAVAILABLE", message: error?.message ?? String(error) } };
  }
}

export async function createOfficeRawMaterialPurchaseRequest(input = {}, options = {}) {
  const { authState, operatorId, idempotencyKey, delegatedDecision, directDecisionContent, ...payload } = input;
  return writePurchaseRequest("/raw-material-purchase-requests", {
    ...options,
    authState,
    operatorId,
    idempotencyKey,
    body: { ...payload, idempotencyKey, delegatedDecision, directDecisionContent },
  }, "采购请求创建失败。");
}

export async function updateOfficeRawMaterialPurchaseRequestStatus(input = {}, options = {}) {
  const { authState, operatorId, requestId, expectedRevision, idempotencyKey, status, reason, delegatedDecision, directDecisionContent } = input;
  return writePurchaseRequest(`/raw-material-purchase-requests/${encodeURIComponent(requestId)}/status`, {
    ...options,
    authState,
    operatorId,
    idempotencyKey,
    body: { expectedRevision, idempotencyKey, status, reason, delegatedDecision, directDecisionContent },
  }, "采购状态更新失败。");
}

async function writePurchaseRequest(path, options, fallbackMessage) {
  try {
    const response = await requestRawMaterialApi(path, { ...options, method: "POST" });
    const json = await readJson(response);
    if (!response.ok) return { source: "api_error", blocked: true, error: toApiError(json, response.status, fallbackMessage) };
    return { source: "api", purchaseRequest: json?.purchaseRequest, businessDecision: json?.businessDecision, operationLogId: json?.operationLogId, replayed: json?.replayed === true };
  } catch (error) {
    return { source: "api_error", blocked: true, error: { code: "RAW_MATERIAL_PURCHASE_WRITE_UNAVAILABLE", message: error?.message ?? String(error) } };
  }
}

export async function listOfficeRawMaterialInbounds(input = {}, options = {}) {
  const { authState, operatorId, localInbounds = [], page = 1, pageSize = 200, filters = {} } = input;

  try {
    const response = await requestRawMaterialApi(
      `/raw-material-inbounds${buildRawMaterialInboundQuery({ page, pageSize, filters })}`,
      {
        ...options,
        authState,
        operatorId,
      },
    );
    const json = await readJson(response);
    if (!response.ok) {
      return {
        source: "api_error",
        blocked: true,
        items: [],
        page,
        pageSize,
        total: 0,
        metrics: buildRawMaterialInboundMetrics(localInbounds),
        error: toApiError(json, response.status, "原材料入库列表 API 返回错误。"),
      };
    }

    const items = Array.isArray(json?.items) ? json.items.map(normalizeRawMaterialInbound).filter((item) => item.id) : [];
    return {
      source: "api",
      items,
      page: toNumber(json?.page, page),
      pageSize: toNumber(json?.pageSize, pageSize),
      total: toNumber(json?.total, items.length),
      metrics: json?.metrics ?? buildRawMaterialInboundMetrics(items),
    };
  } catch (error) {
    const items = filterLocalRawMaterialInbounds(localInbounds, filters);
    const size = Math.max(1, Number(pageSize) || 200);
    const start = Math.max(0, (Math.max(1, Number(page) || 1) - 1) * size);
    return {
      source: "local_fallback",
      items: items.slice(start, start + size),
      page,
      pageSize,
      total: items.length,
      metrics: buildRawMaterialInboundMetrics(localInbounds),
      error: {
        code: "RAW_MATERIAL_INBOUND_API_UNAVAILABLE",
        message: error?.message ?? String(error),
      },
    };
  }
}

export async function recognizeOfficeRawMaterialDeliveryNote(input = {}, options = {}) {
  const { authState, operatorId, useNewModel, pages } = input;
  const normalizedPages = (Array.isArray(pages) ? pages : [])
    .map(normalizeDeliveryNotePagePayload)
    .filter((page) => page.contentDataUrl);
  const fallbackPage = normalizeDeliveryNotePagePayload(input);
  const deliveryNotePages = normalizedPages.length ? normalizedPages : (fallbackPage.contentDataUrl ? [fallbackPage] : []);
  if (!deliveryNotePages.length) {
    return {
      source: "api_error",
      blocked: true,
      error: {
        code: "RAW_MATERIAL_DELIVERY_NOTE_REQUIRED",
        message: "请选择原材料送货单照片或 PDF 后再识别。",
      },
    };
  }
  const requestSizeError = validateDeliveryNoteOcrRequestSize({
    operatorId,
    useNewModel: useNewModel === true,
    pages: deliveryNotePages,
  });
  if (requestSizeError) {
    return { source: "client_validation", blocked: true, error: requestSizeError };
  }
  try {
    const uploadedPages = await uploadDeliveryNoteSourcePages({
      authState,
      operatorId,
      pages: deliveryNotePages,
      options,
    });
    if (uploadedPages.error) {
      return { source: uploadedPages.source, blocked: true, error: uploadedPages.error };
    }
    const requestBody = buildDeliveryNoteOcrRequestBody({
      operatorId,
      useNewModel: useNewModel === true,
      pages: uploadedPages.pages,
    });
    const response = await requestRawMaterialApi("/raw-material-inbounds/recognize-delivery-note", {
      ...options,
      authState,
      operatorId,
      method: "POST",
      body: requestBody,
    });
    const json = await readJson(response);
    if (!response.ok) {
      return {
        source: "api_error",
        blocked: true,
        error: toDeliveryNoteOcrApiError(json, response.status),
      };
    }
    return {
      source: "api",
      inbound: normalizeRawMaterialInbound(json?.inbound),
      attachmentId: cleanText(json?.attachmentId),
      attachmentIds: (Array.isArray(json?.attachmentIds) ? json.attachmentIds : []).map(cleanText).filter(Boolean),
      deduplicated: json?.deduplicated === true,
      operationLogId: cleanText(json?.operationLogId),
    };
  } catch (error) {
    return {
      source: "api_error",
      blocked: true,
      error: {
        code: "RAW_MATERIAL_DELIVERY_NOTE_OCR_API_UNAVAILABLE",
        message: error?.message ?? String(error),
      },
    };
  }
}

export async function updateOfficeRawMaterialInboundAction(input = {}, options = {}) {
  const {
    authState,
    operatorId,
    inboundId,
    expectedRevision,
    action,
    rollId,
    sourceReturnInboundId,
    physicalReturnConfirmed,
    confirmation,
    shipmentReferenceNo,
    reason,
    operatorName,
    machineId,
    productionTaskId,
    issuePurpose,
    issuedWeightKg,
    issuedQuantity,
    consumedWeightKg,
    consumedQuantity,
    leftoverWeightKg,
    leftoverQuantity,
    returnLocation,
    reviewedWeightKg,
    reviewedQuantity,
    reviewLocation,
    machineCount,
    qualifiedOutputQuantity,
    reviewFields,
    lineReviews,
    matchResult,
    checkedWeightKg,
    checkedColor,
    checkedSpec,
    location,
    verificationNote,
    note,
  } = input;
  const safeInboundId = cleanText(inboundId);
  const actionSlug = toRawMaterialActionSlug(action);
  if (!safeInboundId || !actionSlug) {
    return {
      source: "api_error",
      blocked: true,
      error: {
        code: "RAW_MATERIAL_INBOUND_ACTION_INVALID",
        message: "缺少原材料入库单或动作。",
      },
    };
  }

  try {
    const response = await requestRawMaterialApi(
      `/raw-material-inbounds/${encodeURIComponent(safeInboundId)}/${actionSlug}`,
      {
        ...options,
        authState,
        operatorId,
        method: "POST",
        body: {
          expectedRevision,
          operatorId,
          operatorName,
          rollId,
          sourceReturnInboundId,
          physicalReturnConfirmed,
          confirmation,
          shipmentReferenceNo,
          reason,
          machineId,
          productionTaskId,
          issuePurpose,
          issuedWeightKg,
          issuedQuantity,
          consumedWeightKg,
          consumedQuantity,
          leftoverWeightKg,
          leftoverQuantity,
          returnLocation,
          reviewedWeightKg,
          reviewedQuantity,
          reviewLocation,
          machineCount,
          qualifiedOutputQuantity,
          reviewFields,
          lineReviews,
          matchResult,
          checkedWeightKg,
          checkedColor,
          checkedSpec,
          location,
          verificationNote,
          note,
        },
      },
    );
    const json = await readJson(response);
    if (!response.ok) {
      return {
        source: "api_error",
        blocked: true,
        error: toApiError(json, response.status, "原材料入库动作 API 返回错误。"),
      };
    }

    return {
      source: "api",
      inbound: normalizeRawMaterialInbound(json?.inbound),
      operationLogId: cleanText(json?.operationLogId),
    };
  } catch (error) {
    return {
      source: "api_error",
      blocked: true,
      error: {
        code: "RAW_MATERIAL_INBOUND_ACTION_API_UNAVAILABLE",
        message: error?.message ?? String(error),
      },
    };
  }
}

export async function listOfficeRawMaterialSupplierStatementReviews(input = {}, options = {}) {
  const { authState, operatorId, page = 1, pageSize = 20, filters = {} } = input;

  try {
    const response = await requestRawMaterialApi(
      `/raw-material-supplier-statement-reviews${buildSupplierStatementReviewQuery({ page, pageSize, filters })}`,
      {
        ...options,
        authState,
        operatorId,
      },
    );
    const json = await readJson(response);
    if (!response.ok) {
      return {
        source: "api_error",
        blocked: true,
        items: [],
        page,
        pageSize,
        total: 0,
        metrics: {},
        error: toApiError(json, response.status, "供应商月结复核草稿 API 返回错误。"),
      };
    }
    const items = Array.isArray(json?.items) ? json.items.map(normalizeSupplierStatementReview).filter((item) => item.reviewId) : [];
    return {
      source: "api",
      items,
      page: toNumber(json?.page, page),
      pageSize: toNumber(json?.pageSize, pageSize),
      total: toNumber(json?.total, items.length),
      metrics: json?.metrics ?? {},
    };
  } catch (error) {
    return {
      source: "api_error",
      blocked: true,
      items: [],
      page,
      pageSize,
      total: 0,
      metrics: {},
      error: {
        code: "RAW_MATERIAL_SUPPLIER_STATEMENT_REVIEW_API_UNAVAILABLE",
        message: error?.message ?? String(error),
      },
    };
  }
}

export async function createOfficeRawMaterialSupplierStatementReviewDraft(input = {}, options = {}) {
  const { authState, operatorId, statementResult, supplierName, fileName, note } = input;
  if (!statementResult || typeof statementResult !== "object") {
    return {
      source: "api_error",
      blocked: true,
      error: {
        code: "RAW_MATERIAL_SUPPLIER_STATEMENT_REVIEW_INVALID",
        message: "缺少供应商月结预检结果。",
      },
    };
  }

  try {
    const response = await requestRawMaterialApi("/raw-material-supplier-statement-reviews", {
      ...options,
      authState,
      operatorId,
      method: "POST",
      body: {
        operatorId,
        supplierName,
        fileName,
        note,
        statementResult,
      },
    });
    const json = await readJson(response);
    if (!response.ok) {
      return {
        source: "api_error",
        blocked: true,
        error: toApiError(json, response.status, "保存供应商月结复核草稿失败。"),
      };
    }
    return {
      source: "api",
      review: normalizeSupplierStatementReview(json?.review),
      operationLogId: cleanText(json?.operationLogId),
    };
  } catch (error) {
    return {
      source: "api_error",
      blocked: true,
      error: {
        code: "RAW_MATERIAL_SUPPLIER_STATEMENT_REVIEW_CREATE_API_UNAVAILABLE",
        message: error?.message ?? String(error),
      },
    };
  }
}

export async function confirmOfficeRawMaterialSupplierStatementReview(input = {}, options = {}) {
  const { authState, operatorId, reviewId, decision, adjustments, note } = input;
  const safeReviewId = cleanText(reviewId);
  if (!safeReviewId) {
    return {
      source: "api_error",
      blocked: true,
      error: {
        code: "RAW_MATERIAL_SUPPLIER_STATEMENT_REVIEW_ID_REQUIRED",
        message: "缺少供应商月结复核草稿号。",
      },
    };
  }
  try {
    const response = await requestRawMaterialApi(
      `/raw-material-supplier-statement-reviews/${encodeURIComponent(safeReviewId)}/confirm-review`,
      {
        ...options,
        authState,
        operatorId,
        method: "POST",
        body: {
          operatorId,
          decision,
          adjustments,
          note,
        },
      },
    );
    const json = await readJson(response);
    if (!response.ok) {
      return {
        source: "api_error",
        blocked: true,
        error: toApiError(json, response.status, "确认供应商月结复核草稿失败。"),
      };
    }
    return {
      source: "api",
      review: normalizeSupplierStatementReview(json?.review),
      operationLogId: cleanText(json?.operationLogId),
    };
  } catch (error) {
    return {
      source: "api_error",
      blocked: true,
      error: {
        code: "RAW_MATERIAL_SUPPLIER_STATEMENT_REVIEW_CONFIRM_API_UNAVAILABLE",
        message: error?.message ?? String(error),
      },
    };
  }
}

export async function confirmOfficeRawMaterialSupplierStatement(input = {}, options = {}) {
  const { authState, operatorId, reviewId, note } = input;
  const safeReviewId = cleanText(reviewId);
  if (!safeReviewId) {
    return {
      source: "api_error",
      blocked: true,
      error: {
        code: "RAW_MATERIAL_SUPPLIER_STATEMENT_ID_REQUIRED",
        message: "缺少供应商月结复核草稿号。",
      },
    };
  }
  try {
    const response = await requestRawMaterialApi(
      `/raw-material-supplier-statement-reviews/${encodeURIComponent(safeReviewId)}/confirm-statement`,
      {
        ...options,
        authState,
        operatorId,
        method: "POST",
        body: {
          operatorId,
          note,
        },
      },
    );
    const json = await readJson(response);
    if (!response.ok) {
      return {
        source: "api_error",
        blocked: true,
        error: toApiError(json, response.status, "确认供应商月结对账失败。"),
      };
    }
    return {
      source: "api",
      review: normalizeSupplierStatementReview(json?.review),
      operationLogId: cleanText(json?.operationLogId),
    };
  } catch (error) {
    return {
      source: "api_error",
      blocked: true,
      error: {
        code: "RAW_MATERIAL_SUPPLIER_STATEMENT_CONFIRM_API_UNAVAILABLE",
        message: error?.message ?? String(error),
      },
    };
  }
}

export async function generateOfficeRawMaterialSupplierPayableDraft(input = {}, options = {}) {
  const { authState, operatorId, reviewId, note } = input;
  const safeReviewId = cleanText(reviewId);
  if (!safeReviewId) {
    return {
      source: "api_error",
      blocked: true,
      error: {
        code: "RAW_MATERIAL_SUPPLIER_PAYABLE_REVIEW_ID_REQUIRED",
        message: "缺少供应商月结复核草稿号。",
      },
    };
  }
  try {
    const response = await requestRawMaterialApi(
      `/raw-material-supplier-statement-reviews/${encodeURIComponent(safeReviewId)}/generate-payable`,
      {
        ...options,
        authState,
        operatorId,
        method: "POST",
        body: {
          operatorId,
          note,
        },
      },
    );
    const json = await readJson(response);
    if (!response.ok) {
      return {
        source: "api_error",
        blocked: true,
        error: toApiError(json, response.status, "生成供应商应付草稿失败。"),
      };
    }
    return {
      source: "api",
      review: normalizeSupplierStatementReview(json?.review),
      payableDraft: normalizeSupplierPayableDraft(json?.payableDraft ?? json?.review?.supplierPayableDraft),
      operationLogId: cleanText(json?.operationLogId),
    };
  } catch (error) {
    return {
      source: "api_error",
      blocked: true,
      error: {
        code: "RAW_MATERIAL_SUPPLIER_PAYABLE_API_UNAVAILABLE",
        message: error?.message ?? String(error),
      },
    };
  }
}

export async function confirmOfficeRawMaterialSupplierPayment(input = {}, options = {}) {
  const { authState, operatorId, reviewId, paidAmount, paymentMethod, paymentAccount, paymentReferenceNo, paymentVoucherNo, paidAt, note } = input;
  const safeReviewId = cleanText(reviewId);
  if (!safeReviewId) {
    return {
      source: "api_error",
      blocked: true,
      error: {
        code: "RAW_MATERIAL_SUPPLIER_PAYMENT_REVIEW_ID_REQUIRED",
        message: "缺少供应商月结复核草稿号。",
      },
    };
  }
  try {
    const response = await requestRawMaterialApi(
      `/raw-material-supplier-statement-reviews/${encodeURIComponent(safeReviewId)}/confirm-payment`,
      {
        ...options,
        authState,
        operatorId,
        method: "POST",
        body: {
          operatorId,
          paidAmount,
          paymentMethod,
          paymentAccount,
          paymentReferenceNo,
          paymentVoucherNo,
          paidAt,
          note,
        },
      },
    );
    const json = await readJson(response);
    if (!response.ok) {
      return {
        source: "api_error",
        blocked: true,
        error: toApiError(json, response.status, "确认供应商付款失败。"),
      };
    }
    return {
      source: "api",
      review: normalizeSupplierStatementReview(json?.review),
      paymentRecord: normalizeSupplierPaymentRecord(json?.paymentRecord ?? json?.review?.supplierPaymentRecord),
      operationLogId: cleanText(json?.operationLogId),
    };
  } catch (error) {
    return {
      source: "api_error",
      blocked: true,
      error: {
        code: "RAW_MATERIAL_SUPPLIER_PAYMENT_API_UNAVAILABLE",
        message: error?.message ?? String(error),
      },
    };
  }
}

function buildRawMaterialInboundQuery({ page, pageSize, filters = {} }) {
  const params = new URLSearchParams();
  params.set("page", String(page));
  params.set("pageSize", String(pageSize));
  if (filters.keyword) params.set("keyword", cleanText(filters.keyword));
  if (filters.status && filters.status !== "全部") params.set("status", cleanText(filters.status));
  const query = params.toString();
  return query ? `?${query}` : "";
}

function buildSupplierStatementReviewQuery({ page, pageSize, filters = {} }) {
  const params = new URLSearchParams();
  params.set("page", String(page));
  params.set("pageSize", String(pageSize));
  if (filters.keyword) params.set("keyword", cleanText(filters.keyword));
  if (filters.status && filters.status !== "全部") params.set("status", cleanText(filters.status));
  if (filters.reviewStatus && filters.reviewStatus !== "全部") params.set("reviewStatus", cleanText(filters.reviewStatus));
  if (filters.supplierName) params.set("supplierName", cleanText(filters.supplierName));
  const query = params.toString();
  return query ? `?${query}` : "";
}

function filterLocalRawMaterialInbounds(inbounds = [], filters = {}) {
  let items = (Array.isArray(inbounds) ? inbounds : []).map(normalizeRawMaterialInbound).filter((item) => item.id);
  if (filters.status && filters.status !== "全部") items = items.filter((item) => item.status === filters.status);
  const keyword = cleanText(filters.keyword).toLowerCase();
  if (keyword) {
    items = items.filter((item) =>
      [
        item.id,
        item.supplierName,
        item.deliveryNoteNo,
        item.materialType,
        item.productName,
        item.supplierColor,
        item.factoryColor,
        item.spec,
        item.status,
        ...(item.rolls ?? []).flatMap((roll) => [roll.id, roll.supplierRollNo, roll.labelStatus]),
      ]
        .join(" ")
        .toLowerCase()
        .includes(keyword),
    );
  }
  return items;
}

function normalizeRawMaterialInbound(input = {}) {
  const item = { ...(input ?? {}) };
  item.id = cleanText(item.id);
  item.supplierName = cleanText(item.supplierName);
  item.deliveryNoteNo = cleanText(item.deliveryNoteNo);
  item.status = cleanText(item.status);
  item.source = cleanText(item.source);
  item.ocrProvider = cleanText(item.ocrProvider);
  item.ocrAction = cleanText(item.ocrAction);
  item.ocrRequestId = cleanText(item.ocrRequestId);
  item.ocrStatus = cleanText(item.ocrStatus);
  item.ocrAngle = Number(item.ocrAngle) || 0;
  item.ocrImageWidth = Math.max(0, Number(item.ocrImageWidth) || 0);
  item.ocrImageHeight = Math.max(0, Number(item.ocrImageHeight) || 0);
  item.ocrPageCount = Math.max(1, toNumber(item.ocrPageCount, 1));
  item.ocrPages = normalizeOcrPages(item.ocrPages, item.ocrPageCount, item.ocrImageWidth, item.ocrImageHeight, item.ocrAngle);
  item.ocrSourceDigest = cleanText(item.ocrSourceDigest);
  item.ocrRecognizedAt = cleanText(item.ocrRecognizedAt);
  item.ocrRawText = cleanText(item.ocrRawText);
  item.sourceAttachmentId = cleanText(item.sourceAttachmentId);
  item.sourceAttachmentIds = normalizeTextList(item.sourceAttachmentIds, item.sourceAttachmentId);
  item.sourceFileName = cleanText(item.sourceFileName);
  item.sourceFileNames = normalizeTextList(item.sourceFileNames, item.sourceFileName);
  item.sourceMimeType = cleanText(item.sourceMimeType);
  item.sourceMimeTypes = normalizeTextList(item.sourceMimeTypes, item.sourceMimeType);
  item.ocrReviewFields = (Array.isArray(item.ocrReviewFields) ? item.ocrReviewFields : []).map((field) => ({
    ...field,
    key: cleanText(field?.key),
    label: cleanText(field?.label),
    recognizedValue: field?.recognizedValue ?? "",
    value: field?.value ?? "",
    confidence: toNumber(field?.confidence, 0),
    reviewStatus: cleanText(field?.reviewStatus),
    required: field?.required === true,
  })).filter((field) => field.key);
  item.ocrLines = (Array.isArray(item.ocrLines) ? item.ocrLines : []).map((line) => {
    const values = line?.values && typeof line.values === "object" ? { ...line.values } : {};
    const recognizedValues = line?.recognizedValues && typeof line.recognizedValues === "object" ? { ...line.recognizedValues } : {};
    return {
      ...line,
      lineId: cleanText(line?.lineId),
      sourcePageIndex: Math.max(0, toNumber(line?.sourcePageIndex, 0)),
      sourceText: cleanText(line?.sourceText),
      reviewStatus: cleanText(line?.reviewStatus),
      values,
      recognizedValues: Object.keys(recognizedValues).length ? recognizedValues : { ...values },
      confidences: line?.confidences && typeof line.confidences === "object" ? { ...line.confidences } : {},
      reviewedFields: (Array.isArray(line?.reviewedFields) ? line.reviewedFields : []).map((field) => ({
        ...field,
        key: cleanText(field?.key),
        recognizedValue: field?.recognizedValue ?? "",
        value: field?.value ?? "",
        reviewStatus: cleanText(field?.reviewStatus),
      })).filter((field) => field.key),
      reviewedBy: cleanText(line?.reviewedBy),
      reviewedByUserId: cleanText(line?.reviewedByUserId),
      reviewedAt: cleanText(line?.reviewedAt),
      reviewDisposition: cleanText(line?.reviewDisposition) || "included",
      reviewProjectedRollCount: Math.max(0, Math.trunc(Number(line?.reviewProjectedRollCount) || 0)),
      excludedRollIndices: (Array.isArray(line?.excludedRollIndices) ? line.excludedRollIndices : [])
        .map(Number)
        .filter((value) => Number.isInteger(value) && value >= 0),
      exclusionReason: cleanText(line?.exclusionReason),
      excludedBy: cleanText(line?.excludedBy),
      excludedByUserId: cleanText(line?.excludedByUserId),
      excludedAt: cleanText(line?.excludedAt),
    };
  }).filter((line) => line.lineId);
  item.issueStatus = cleanText(item.issueStatus);
  item.machineId = cleanText(item.machineId);
  item.productionTaskId = cleanText(item.productionTaskId);
  item.productionTaskMatchStatus = cleanText(item.productionTaskMatchStatus);
  item.productionTaskMatchReason = cleanText(item.productionTaskMatchReason);
  item.productionTaskOrderLineId = cleanText(item.productionTaskOrderLineId);
  item.productionTaskMachineId = cleanText(item.productionTaskMachineId);
  item.productionTaskGoodsSpec = cleanText(item.productionTaskGoodsSpec);
  item.costAllocationStatus = cleanText(item.costAllocationStatus);
  item.costAllocationDraftedBy = cleanText(item.costAllocationDraftedBy);
  item.costAllocationDraftedByUserId = cleanText(item.costAllocationDraftedByUserId);
  item.costAllocationDraftedAt = cleanText(item.costAllocationDraftedAt);
  item.costAllocationDraftCount = toNumber(item.costAllocationDraftCount, 0);
  item.costAllocationDraftAmount = toNumber(item.costAllocationDraftAmount, 0);
  item.costAllocationReviewStatus = cleanText(item.costAllocationReviewStatus);
  item.costAllocationConfirmedBy = cleanText(item.costAllocationConfirmedBy);
  item.costAllocationConfirmedByUserId = cleanText(item.costAllocationConfirmedByUserId);
  item.costAllocationConfirmedAt = cleanText(item.costAllocationConfirmedAt);
  item.costAllocationConfirmedCount = toNumber(item.costAllocationConfirmedCount, 0);
  item.costAllocationConfirmedAmount = toNumber(item.costAllocationConfirmedAmount, 0);
  item.costAllocationConfirmationId = cleanText(item.costAllocationConfirmationId);
  item.lossCalibrationStatus = cleanText(item.lossCalibrationStatus);
  item.lossCalibratedBy = cleanText(item.lossCalibratedBy);
  item.lossCalibratedByUserId = cleanText(item.lossCalibratedByUserId);
  item.lossCalibratedAt = cleanText(item.lossCalibratedAt);
  item.lossCalibrationCount = toNumber(item.lossCalibrationCount, 0);
  item.lossCalibrationId = cleanText(item.lossCalibrationId);
  item.lossCalibrationRatePercent = toNumber(item.lossCalibrationRatePercent, 0);
  item.lossCalibrationActualOutputQuantity = toNumber(item.lossCalibrationActualOutputQuantity, 0);
  item.lossCalibrationExpectedOutputQuantity = toNumber(item.lossCalibrationExpectedOutputQuantity, 0);
  item.lossCalibrationAmount = toNumber(item.lossCalibrationAmount, 0);
  item.rawMaterialCostAllocationWarnings = Array.isArray(item.rawMaterialCostAllocationWarnings)
    ? item.rawMaterialCostAllocationWarnings.map(cleanText).filter(Boolean)
    : [];
  item.marginSnapshotStatus = cleanText(item.marginSnapshotStatus);
  item.marginSnapshotCount = toNumber(item.marginSnapshotCount, 0);
  item.marginSnapshotId = cleanText(item.marginSnapshotId);
  item.marginSnapshotTotalSalesAmount = toNumber(item.marginSnapshotTotalSalesAmount, 0);
  item.marginSnapshotMaterialCostAmount = toNumber(item.marginSnapshotMaterialCostAmount, 0);
  item.marginSnapshotGrossProfitAmount = toNumber(item.marginSnapshotGrossProfitAmount, 0);
  item.marginSnapshotGrossMarginRatePercent = toNumber(item.marginSnapshotGrossMarginRatePercent, 0);
  item.marginSnapshotGeneratedBy = cleanText(item.marginSnapshotGeneratedBy);
  item.marginSnapshotGeneratedAt = cleanText(item.marginSnapshotGeneratedAt);
  item.marginReportStatus = cleanText(item.marginReportStatus);
  item.marginReportCount = toNumber(item.marginReportCount, 0);
  item.marginReportId = cleanText(item.marginReportId);
  item.marginReportTotalSalesAmount = toNumber(item.marginReportTotalSalesAmount, 0);
  item.marginReportMaterialCostAmount = toNumber(item.marginReportMaterialCostAmount, 0);
  item.marginReportGrossProfitAmount = toNumber(item.marginReportGrossProfitAmount, 0);
  item.marginReportGrossMarginRatePercent = toNumber(item.marginReportGrossMarginRatePercent, 0);
  item.marginReviewedBy = cleanText(item.marginReviewedBy);
  item.marginReviewedAt = cleanText(item.marginReviewedAt);
  item.rolls = (Array.isArray(item.rolls) ? item.rolls : []).map((roll) => ({
    ...roll,
    id: cleanText(roll.id),
    supplierRollNo: cleanText(roll.supplierRollNo),
    weightKg: Number(roll.weightKg) || 0,
    originalWeightKg: toNumber(roll.originalWeightKg, 0),
    labelStatus: cleanText(roll.labelStatus),
    inventoryStatus: cleanText(roll.inventoryStatus),
    signedNoteStatus: cleanText(roll.signedNoteStatus),
    parentRollId: cleanText(roll.parentRollId),
    sourceRollId: cleanText(roll.sourceRollId),
    splitRecordId: cleanText(roll.splitRecordId),
    splitStatus: cleanText(roll.splitStatus),
    splitAt: cleanText(roll.splitAt),
    splitBy: cleanText(roll.splitBy),
    splitIssuedWeightKg: toNumber(roll.splitIssuedWeightKg, 0),
    splitRemainingWeightKg: toNumber(roll.splitRemainingWeightKg, 0),
    issueRecordId: cleanText(roll.issueRecordId),
    issuedAt: cleanText(roll.issuedAt),
    issuedBy: cleanText(roll.issuedBy),
    issuedByUserId: cleanText(roll.issuedByUserId),
    machineId: cleanText(roll.machineId),
    productionTaskId: cleanText(roll.productionTaskId),
    productionTaskMatchStatus: cleanText(roll.productionTaskMatchStatus),
    productionTaskMatchReason: cleanText(roll.productionTaskMatchReason),
    productionTaskOrderLineId: cleanText(roll.productionTaskOrderLineId),
    productionTaskMachineId: cleanText(roll.productionTaskMachineId),
    productionTaskGoodsSpec: cleanText(roll.productionTaskGoodsSpec),
    issuePurpose: cleanText(roll.issuePurpose),
    consumptionStatus: cleanText(roll.consumptionStatus),
    consumptionRecordId: cleanText(roll.consumptionRecordId),
    consumedAt: cleanText(roll.consumedAt),
    consumedBy: cleanText(roll.consumedBy),
    lastConsumedWeightKg: toNumber(roll.lastConsumedWeightKg, 0),
    remainingMachineSideWeightKg: toNumber(roll.remainingMachineSideWeightKg, 0),
    leftoverReturnRecordId: cleanText(roll.leftoverReturnRecordId),
    leftoverWeightKg: toNumber(roll.leftoverWeightKg, 0),
    leftoverQuantity: toNumber(roll.leftoverQuantity, 0),
    returnedAt: cleanText(roll.returnedAt),
    returnedBy: cleanText(roll.returnedBy),
    leftoverReviewRecordId: cleanText(roll.leftoverReviewRecordId),
    leftoverReviewedWeightKg: toNumber(roll.leftoverReviewedWeightKg, 0),
    leftoverReviewedQuantity: toNumber(roll.leftoverReviewedQuantity, 0),
    leftoverReviewedAt: cleanText(roll.leftoverReviewedAt),
    leftoverReviewedBy: cleanText(roll.leftoverReviewedBy),
  }));
  item.rawMaterialIssueRecords = Array.isArray(item.rawMaterialIssueRecords)
    ? item.rawMaterialIssueRecords.map((record) => ({
        ...record,
        issueRecordId: cleanText(record.issueRecordId ?? record.id),
        rollId: cleanText(record.rollId),
        sourceRollId: cleanText(record.sourceRollId),
        splitRecordId: cleanText(record.splitRecordId),
        machineId: cleanText(record.machineId),
        productionTaskId: cleanText(record.productionTaskId),
        productionTaskMatchStatus: cleanText(record.productionTaskMatchStatus),
        productionTaskMatchReason: cleanText(record.productionTaskMatchReason),
        productionTaskOrderLineId: cleanText(record.productionTaskOrderLineId),
        productionTaskMachineId: cleanText(record.productionTaskMachineId),
        productionTaskGoodsSpec: cleanText(record.productionTaskGoodsSpec),
        issuePurpose: cleanText(record.issuePurpose),
        consumptionStatus: cleanText(record.consumptionStatus),
        issuedAt: cleanText(record.issuedAt),
        issuedBy: cleanText(record.issuedBy),
        issuedWeightKg: toNumber(record.issuedWeightKg, 0),
        issuedQuantity: toNumber(record.issuedQuantity, 0),
        sourceWeightKg: toNumber(record.sourceWeightKg, 0),
        remainingWeightKg: toNumber(record.remainingWeightKg, 0),
        remainingMachineSideWeightKg: toNumber(record.remainingMachineSideWeightKg, 0),
        issueMode: cleanText(record.issueMode),
        consumptionRecordId: cleanText(record.consumptionRecordId),
        consumedWeightKg: toNumber(record.consumedWeightKg, 0),
        leftoverReturnRecordId: cleanText(record.leftoverReturnRecordId),
        leftoverReviewRecordId: cleanText(record.leftoverReviewRecordId),
        consumedAt: cleanText(record.consumedAt),
        returnedAt: cleanText(record.returnedAt),
        leftoverReviewedAt: cleanText(record.leftoverReviewedAt),
        costAllocationStatus: cleanText(record.costAllocationStatus),
        costAllocationDraftId: cleanText(record.costAllocationDraftId),
        allocatedCostAmount: toNumber(record.allocatedCostAmount, 0),
        allocatedWeightKg: toNumber(record.allocatedWeightKg, 0),
        allocatedQuantity: toNumber(record.allocatedQuantity, 0),
        costConfirmationId: cleanText(record.costConfirmationId),
        confirmedCostAmount: toNumber(record.confirmedCostAmount, 0),
        costConfirmedAt: cleanText(record.costConfirmedAt),
        costConfirmedBy: cleanText(record.costConfirmedBy),
        lossCalibrationId: cleanText(record.lossCalibrationId),
        lossRatePercent: toNumber(record.lossRatePercent, 0),
        lossCalibratedAt: cleanText(record.lossCalibratedAt),
        lossCalibratedBy: cleanText(record.lossCalibratedBy),
        marginSnapshotId: cleanText(record.marginSnapshotId),
        marginReportId: cleanText(record.marginReportId),
        marginReviewedAt: cleanText(record.marginReviewedAt),
        marginReviewedBy: cleanText(record.marginReviewedBy),
      })).filter((record) => record.issueRecordId)
    : [];
  item.rawMaterialConsumptionRecords = Array.isArray(item.rawMaterialConsumptionRecords)
    ? item.rawMaterialConsumptionRecords.map((record) => ({
        ...record,
        consumptionRecordId: cleanText(record.consumptionRecordId ?? record.id),
        issueRecordId: cleanText(record.issueRecordId),
        rollId: cleanText(record.rollId),
        machineId: cleanText(record.machineId),
        productionTaskId: cleanText(record.productionTaskId),
        consumptionStatus: cleanText(record.consumptionStatus),
        consumedWeightKg: toNumber(record.consumedWeightKg, 0),
        consumedQuantity: toNumber(record.consumedQuantity, 0),
        consumedFromWeightKg: toNumber(record.consumedFromWeightKg, 0),
        remainingMachineSideWeightKg: toNumber(record.remainingMachineSideWeightKg, 0),
        partialConsumption: Boolean(record.partialConsumption),
        unit: cleanText(record.unit),
        confirmedAt: cleanText(record.confirmedAt),
        confirmedBy: cleanText(record.confirmedBy),
        costAllocationStatus: cleanText(record.costAllocationStatus),
        costAllocationDraftId: cleanText(record.costAllocationDraftId),
        allocatedCostAmount: toNumber(record.allocatedCostAmount, 0),
        allocatedWeightKg: toNumber(record.allocatedWeightKg, 0),
        allocatedQuantity: toNumber(record.allocatedQuantity, 0),
        costConfirmationId: cleanText(record.costConfirmationId),
        confirmedCostAmount: toNumber(record.confirmedCostAmount, 0),
        costConfirmedAt: cleanText(record.costConfirmedAt),
        costConfirmedBy: cleanText(record.costConfirmedBy),
        lossCalibrationId: cleanText(record.lossCalibrationId),
        lossRatePercent: toNumber(record.lossRatePercent, 0),
        lossCalibratedAt: cleanText(record.lossCalibratedAt),
        lossCalibratedBy: cleanText(record.lossCalibratedBy),
        marginSnapshotId: cleanText(record.marginSnapshotId),
        marginReportId: cleanText(record.marginReportId),
        marginReviewedAt: cleanText(record.marginReviewedAt),
        marginReviewedBy: cleanText(record.marginReviewedBy),
      })).filter((record) => record.consumptionRecordId)
    : [];
  item.rawMaterialLeftoverReturnRecords = Array.isArray(item.rawMaterialLeftoverReturnRecords)
    ? item.rawMaterialLeftoverReturnRecords.map((record) => ({
        ...record,
        leftoverReturnRecordId: cleanText(record.leftoverReturnRecordId ?? record.id),
        issueRecordId: cleanText(record.issueRecordId),
        rollId: cleanText(record.rollId),
        machineId: cleanText(record.machineId),
        productionTaskId: cleanText(record.productionTaskId),
        consumptionStatus: cleanText(record.consumptionStatus),
        issuedWeightKg: toNumber(record.issuedWeightKg, 0),
        machineSideWeightKg: toNumber(record.machineSideWeightKg, 0),
        leftoverWeightKg: toNumber(record.leftoverWeightKg, 0),
        leftoverQuantity: toNumber(record.leftoverQuantity, 0),
        unit: cleanText(record.unit),
        returnLocation: cleanText(record.returnLocation),
        returnedAt: cleanText(record.returnedAt),
        returnedBy: cleanText(record.returnedBy),
        leftoverReviewRecordId: cleanText(record.leftoverReviewRecordId),
        reviewStatus: cleanText(record.reviewStatus),
        reviewedAt: cleanText(record.reviewedAt),
        reviewedBy: cleanText(record.reviewedBy),
      })).filter((record) => record.leftoverReturnRecordId)
    : [];
  item.rawMaterialLeftoverReviewRecords = Array.isArray(item.rawMaterialLeftoverReviewRecords)
    ? item.rawMaterialLeftoverReviewRecords.map((record) => ({
        ...record,
        leftoverReviewRecordId: cleanText(record.leftoverReviewRecordId ?? record.id),
        leftoverReturnRecordId: cleanText(record.leftoverReturnRecordId),
        issueRecordId: cleanText(record.issueRecordId),
        rollId: cleanText(record.rollId),
        reviewStatus: cleanText(record.reviewStatus),
        returnedWeightKg: toNumber(record.returnedWeightKg, 0),
        returnedQuantity: toNumber(record.returnedQuantity, 0),
        reviewedWeightKg: toNumber(record.reviewedWeightKg, 0),
        reviewedQuantity: toNumber(record.reviewedQuantity, 0),
        unit: cleanText(record.unit),
        reviewLocation: cleanText(record.reviewLocation),
        reviewedAt: cleanText(record.reviewedAt),
        reviewedBy: cleanText(record.reviewedBy),
      })).filter((record) => record.leftoverReviewRecordId)
    : [];
  item.rawMaterialSplitRecords = Array.isArray(item.rawMaterialSplitRecords)
    ? item.rawMaterialSplitRecords.map((record) => ({
        ...record,
        splitRecordId: cleanText(record.splitRecordId ?? record.id),
        sourceRollId: cleanText(record.sourceRollId),
        issuedRollId: cleanText(record.issuedRollId),
        splitMode: cleanText(record.splitMode),
        sourceWeightKg: toNumber(record.sourceWeightKg, 0),
        issuedWeightKg: toNumber(record.issuedWeightKg, 0),
        remainingWeightKg: toNumber(record.remainingWeightKg, 0),
        unit: cleanText(record.unit),
        machineId: cleanText(record.machineId),
        productionTaskId: cleanText(record.productionTaskId),
        productionTaskMatchStatus: cleanText(record.productionTaskMatchStatus),
        productionTaskMatchReason: cleanText(record.productionTaskMatchReason),
        productionTaskOrderLineId: cleanText(record.productionTaskOrderLineId),
        productionTaskMachineId: cleanText(record.productionTaskMachineId),
        productionTaskGoodsSpec: cleanText(record.productionTaskGoodsSpec),
        splitAt: cleanText(record.splitAt),
        splitBy: cleanText(record.splitBy),
      })).filter((record) => record.splitRecordId)
    : [];
  item.rawMaterialCostAllocationDrafts = Array.isArray(item.rawMaterialCostAllocationDrafts)
    ? item.rawMaterialCostAllocationDrafts.map((record) => ({
        ...record,
        costAllocationDraftId: cleanText(record.costAllocationDraftId ?? record.id),
        inboundId: cleanText(record.inboundId),
        consumptionRecordId: cleanText(record.consumptionRecordId),
        issueRecordId: cleanText(record.issueRecordId),
        rollId: cleanText(record.rollId),
        sourceRollId: cleanText(record.sourceRollId),
        splitRecordId: cleanText(record.splitRecordId),
        materialType: cleanText(record.materialType),
        productName: cleanText(record.productName),
        spec: cleanText(record.spec),
        factoryColor: cleanText(record.factoryColor),
        unit: cleanText(record.unit),
        unitPrice: toNumber(record.unitPrice, 0),
        allocatedWeightKg: toNumber(record.allocatedWeightKg, 0),
        allocatedQuantity: toNumber(record.allocatedQuantity, 0),
        allocatedCostAmount: toNumber(record.allocatedCostAmount, 0),
        productionTaskId: cleanText(record.productionTaskId),
        orderLineId: cleanText(record.orderLineId),
        productionTaskMachineId: cleanText(record.productionTaskMachineId),
        productionTaskGoodsSpec: cleanText(record.productionTaskGoodsSpec),
        allocationBasis: cleanText(record.allocationBasis),
        allocationStatus: cleanText(record.allocationStatus),
        costEffect: cleanText(record.costEffect),
        marginEffect: cleanText(record.marginEffect),
        lossCalibrationStatus: cleanText(record.lossCalibrationStatus),
        generatedBy: cleanText(record.generatedBy),
        generatedByUserId: cleanText(record.generatedByUserId),
        generatedAt: cleanText(record.generatedAt),
        confirmedCostAmount: toNumber(record.confirmedCostAmount, 0),
        confirmedBy: cleanText(record.confirmedBy),
        confirmedByUserId: cleanText(record.confirmedByUserId),
        confirmedAt: cleanText(record.confirmedAt),
        costConfirmationId: cleanText(record.costConfirmationId),
        reviewNote: cleanText(record.reviewNote),
        lossCalibrationId: cleanText(record.lossCalibrationId),
        lossRatePercent: toNumber(record.lossRatePercent, 0),
        calibratedCostAmount: toNumber(record.calibratedCostAmount, 0),
        calibratedBy: cleanText(record.calibratedBy),
        calibratedAt: cleanText(record.calibratedAt),
        marginSnapshotId: cleanText(record.marginSnapshotId),
        marginSnapshotStatus: cleanText(record.marginSnapshotStatus),
        marginSnapshotGeneratedBy: cleanText(record.marginSnapshotGeneratedBy),
        marginSnapshotGeneratedAt: cleanText(record.marginSnapshotGeneratedAt),
        marginReportId: cleanText(record.marginReportId),
        marginReviewStatus: cleanText(record.marginReviewStatus),
        marginReviewedBy: cleanText(record.marginReviewedBy),
        marginReviewedAt: cleanText(record.marginReviewedAt),
        note: cleanText(record.note),
      })).filter((record) => record.costAllocationDraftId)
    : [];
  item.rawMaterialCostAllocationConfirmations = Array.isArray(item.rawMaterialCostAllocationConfirmations)
    ? item.rawMaterialCostAllocationConfirmations.map((record) => ({
        ...record,
        costConfirmationId: cleanText(record.costConfirmationId ?? record.id),
        inboundId: cleanText(record.inboundId),
        supplierName: cleanText(record.supplierName),
        deliveryNoteNo: cleanText(record.deliveryNoteNo),
        costAllocationDraftIds: Array.isArray(record.costAllocationDraftIds) ? record.costAllocationDraftIds.map(cleanText).filter(Boolean) : [],
        consumptionRecordIds: Array.isArray(record.consumptionRecordIds) ? record.consumptionRecordIds.map(cleanText).filter(Boolean) : [],
        issueRecordIds: Array.isArray(record.issueRecordIds) ? record.issueRecordIds.map(cleanText).filter(Boolean) : [],
        productionTaskIds: Array.isArray(record.productionTaskIds) ? record.productionTaskIds.map(cleanText).filter(Boolean) : [],
        orderLineIds: Array.isArray(record.orderLineIds) ? record.orderLineIds.map(cleanText).filter(Boolean) : [],
        confirmedCount: toNumber(record.confirmedCount, 0),
        confirmedWeightKg: toNumber(record.confirmedWeightKg, 0),
        confirmedQuantity: toNumber(record.confirmedQuantity, 0),
        confirmedCostAmount: toNumber(record.confirmedCostAmount, 0),
        reviewStatus: cleanText(record.reviewStatus),
        costEffect: cleanText(record.costEffect),
        marginEffect: cleanText(record.marginEffect),
        lossCalibrationStatus: cleanText(record.lossCalibrationStatus),
        lossCalibrationId: cleanText(record.lossCalibrationId),
        lossRatePercent: toNumber(record.lossRatePercent, 0),
        calibratedBy: cleanText(record.calibratedBy),
        calibratedAt: cleanText(record.calibratedAt),
        marginSnapshotId: cleanText(record.marginSnapshotId),
        marginSnapshotStatus: cleanText(record.marginSnapshotStatus),
        marginSnapshotGeneratedBy: cleanText(record.marginSnapshotGeneratedBy),
        marginSnapshotGeneratedAt: cleanText(record.marginSnapshotGeneratedAt),
        marginReportId: cleanText(record.marginReportId),
        marginReviewStatus: cleanText(record.marginReviewStatus),
        marginReviewedBy: cleanText(record.marginReviewedBy),
        marginReviewedAt: cleanText(record.marginReviewedAt),
        confirmedBy: cleanText(record.confirmedBy),
        confirmedByUserId: cleanText(record.confirmedByUserId),
        confirmedAt: cleanText(record.confirmedAt),
        note: cleanText(record.note),
      })).filter((record) => record.costConfirmationId)
    : [];
  item.rawMaterialCostLossCalibrations = Array.isArray(item.rawMaterialCostLossCalibrations)
    ? item.rawMaterialCostLossCalibrations.map((record) => ({
        ...record,
        lossCalibrationId: cleanText(record.lossCalibrationId ?? record.id),
        inboundId: cleanText(record.inboundId),
        supplierName: cleanText(record.supplierName),
        deliveryNoteNo: cleanText(record.deliveryNoteNo),
        costConfirmationId: cleanText(record.costConfirmationId),
        costConfirmationIds: Array.isArray(record.costConfirmationIds) ? record.costConfirmationIds.map(cleanText).filter(Boolean) : [],
        costAllocationDraftIds: Array.isArray(record.costAllocationDraftIds) ? record.costAllocationDraftIds.map(cleanText).filter(Boolean) : [],
        consumptionRecordIds: Array.isArray(record.consumptionRecordIds) ? record.consumptionRecordIds.map(cleanText).filter(Boolean) : [],
        issueRecordIds: Array.isArray(record.issueRecordIds) ? record.issueRecordIds.map(cleanText).filter(Boolean) : [],
        productionTaskIds: Array.isArray(record.productionTaskIds) ? record.productionTaskIds.map(cleanText).filter(Boolean) : [],
        orderLineIds: Array.isArray(record.orderLineIds) ? record.orderLineIds.map(cleanText).filter(Boolean) : [],
        confirmedCount: toNumber(record.confirmedCount, 0),
        confirmedWeightKg: toNumber(record.confirmedWeightKg, 0),
        confirmedQuantity: toNumber(record.confirmedQuantity, 0),
        confirmedCostAmount: toNumber(record.confirmedCostAmount, 0),
        expectedOutputQuantity: toNumber(record.expectedOutputQuantity, 0),
        actualQualifiedOutputQuantity: toNumber(record.actualQualifiedOutputQuantity, 0),
        lossQuantity: toNumber(record.lossQuantity, 0),
        lossRatePercent: toNumber(record.lossRatePercent, 0),
        calibrationBasis: cleanText(record.calibrationBasis),
        calibrationStatus: cleanText(record.calibrationStatus),
        costEffect: cleanText(record.costEffect),
        marginEffect: cleanText(record.marginEffect),
        marginSnapshotId: cleanText(record.marginSnapshotId),
        marginSnapshotStatus: cleanText(record.marginSnapshotStatus),
        marginSnapshotGeneratedBy: cleanText(record.marginSnapshotGeneratedBy),
        marginSnapshotGeneratedAt: cleanText(record.marginSnapshotGeneratedAt),
        marginReportId: cleanText(record.marginReportId),
        marginReviewStatus: cleanText(record.marginReviewStatus),
        marginReviewedBy: cleanText(record.marginReviewedBy),
        marginReviewedAt: cleanText(record.marginReviewedAt),
        calibratedBy: cleanText(record.calibratedBy),
        calibratedAt: cleanText(record.calibratedAt),
        note: cleanText(record.note),
      })).filter((record) => record.lossCalibrationId)
    : [];
  item.rawMaterialOrderMarginSnapshots = Array.isArray(item.rawMaterialOrderMarginSnapshots)
    ? item.rawMaterialOrderMarginSnapshots.map((record) => ({
        ...record,
        marginSnapshotId: cleanText(record.marginSnapshotId ?? record.id),
        inboundId: cleanText(record.inboundId),
        supplierName: cleanText(record.supplierName),
        deliveryNoteNo: cleanText(record.deliveryNoteNo),
        lossCalibrationIds: Array.isArray(record.lossCalibrationIds) ? record.lossCalibrationIds.map(cleanText).filter(Boolean) : [],
        costConfirmationIds: Array.isArray(record.costConfirmationIds) ? record.costConfirmationIds.map(cleanText).filter(Boolean) : [],
        costAllocationDraftIds: Array.isArray(record.costAllocationDraftIds) ? record.costAllocationDraftIds.map(cleanText).filter(Boolean) : [],
        consumptionRecordIds: Array.isArray(record.consumptionRecordIds) ? record.consumptionRecordIds.map(cleanText).filter(Boolean) : [],
        issueRecordIds: Array.isArray(record.issueRecordIds) ? record.issueRecordIds.map(cleanText).filter(Boolean) : [],
        productionTaskIds: Array.isArray(record.productionTaskIds) ? record.productionTaskIds.map(cleanText).filter(Boolean) : [],
        orderLineIds: Array.isArray(record.orderLineIds) ? record.orderLineIds.map(cleanText).filter(Boolean) : [],
        lineItems: Array.isArray(record.lineItems)
          ? record.lineItems.map((line) => ({
              ...line,
              orderLineId: cleanText(line.orderLineId),
              orderNo: cleanText(line.orderNo),
              customerId: cleanText(line.customerId),
              customerName: cleanText(line.customerName),
              productName: cleanText(line.productName),
              goodsSpec: cleanText(line.goodsSpec),
              quantity: toNumber(line.quantity, 0),
              salesAmount: toNumber(line.salesAmount, 0),
              materialCostAmount: toNumber(line.materialCostAmount, 0),
              grossProfitAmount: toNumber(line.grossProfitAmount, 0),
              grossMarginRatePercent: toNumber(line.grossMarginRatePercent, 0),
              marginStatus: cleanText(line.marginStatus),
              marginSnapshotId: cleanText(line.marginSnapshotId),
              costAllocationDraftIds: Array.isArray(line.costAllocationDraftIds) ? line.costAllocationDraftIds.map(cleanText).filter(Boolean) : [],
              productionTaskIds: Array.isArray(line.productionTaskIds) ? line.productionTaskIds.map(cleanText).filter(Boolean) : [],
            })).filter((line) => line.orderLineId)
          : [],
        totalSalesAmount: toNumber(record.totalSalesAmount, 0),
        totalMaterialCostAmount: toNumber(record.totalMaterialCostAmount, 0),
        grossProfitAmount: toNumber(record.grossProfitAmount, 0),
        grossMarginRatePercent: toNumber(record.grossMarginRatePercent, 0),
        reviewStatus: cleanText(record.reviewStatus),
        reportStatus: cleanText(record.reportStatus),
        costEffect: cleanText(record.costEffect),
        marginEffect: cleanText(record.marginEffect),
        marginReportId: cleanText(record.marginReportId),
        generatedBy: cleanText(record.generatedBy),
        generatedAt: cleanText(record.generatedAt),
        reviewedBy: cleanText(record.reviewedBy),
        reviewedAt: cleanText(record.reviewedAt),
        note: cleanText(record.note),
        warnings: Array.isArray(record.warnings) ? record.warnings.map(cleanText).filter(Boolean) : [],
      })).filter((record) => record.marginSnapshotId)
    : [];
  item.rawMaterialOrderMarginReports = Array.isArray(item.rawMaterialOrderMarginReports)
    ? item.rawMaterialOrderMarginReports.map((record) => ({
        ...record,
        marginReportId: cleanText(record.marginReportId ?? record.id),
        inboundId: cleanText(record.inboundId),
        supplierName: cleanText(record.supplierName),
        deliveryNoteNo: cleanText(record.deliveryNoteNo),
        marginSnapshotIds: Array.isArray(record.marginSnapshotIds) ? record.marginSnapshotIds.map(cleanText).filter(Boolean) : [],
        lossCalibrationIds: Array.isArray(record.lossCalibrationIds) ? record.lossCalibrationIds.map(cleanText).filter(Boolean) : [],
        costConfirmationIds: Array.isArray(record.costConfirmationIds) ? record.costConfirmationIds.map(cleanText).filter(Boolean) : [],
        costAllocationDraftIds: Array.isArray(record.costAllocationDraftIds) ? record.costAllocationDraftIds.map(cleanText).filter(Boolean) : [],
        consumptionRecordIds: Array.isArray(record.consumptionRecordIds) ? record.consumptionRecordIds.map(cleanText).filter(Boolean) : [],
        issueRecordIds: Array.isArray(record.issueRecordIds) ? record.issueRecordIds.map(cleanText).filter(Boolean) : [],
        productionTaskIds: Array.isArray(record.productionTaskIds) ? record.productionTaskIds.map(cleanText).filter(Boolean) : [],
        orderLineIds: Array.isArray(record.orderLineIds) ? record.orderLineIds.map(cleanText).filter(Boolean) : [],
        lineItems: Array.isArray(record.lineItems)
          ? record.lineItems.map((line) => ({
              ...line,
              marginSnapshotId: cleanText(line.marginSnapshotId),
              orderLineId: cleanText(line.orderLineId),
              orderNo: cleanText(line.orderNo),
              customerId: cleanText(line.customerId),
              customerName: cleanText(line.customerName),
              productName: cleanText(line.productName),
              goodsSpec: cleanText(line.goodsSpec),
              quantity: toNumber(line.quantity, 0),
              salesAmount: toNumber(line.salesAmount, 0),
              materialCostAmount: toNumber(line.materialCostAmount, 0),
              grossProfitAmount: toNumber(line.grossProfitAmount, 0),
              grossMarginRatePercent: toNumber(line.grossMarginRatePercent, 0),
              marginStatus: cleanText(line.marginStatus),
              costAllocationDraftIds: Array.isArray(line.costAllocationDraftIds) ? line.costAllocationDraftIds.map(cleanText).filter(Boolean) : [],
              productionTaskIds: Array.isArray(line.productionTaskIds) ? line.productionTaskIds.map(cleanText).filter(Boolean) : [],
            })).filter((line) => line.orderLineId)
          : [],
        totalSalesAmount: toNumber(record.totalSalesAmount, 0),
        totalMaterialCostAmount: toNumber(record.totalMaterialCostAmount, 0),
        grossProfitAmount: toNumber(record.grossProfitAmount, 0),
        grossMarginRatePercent: toNumber(record.grossMarginRatePercent, 0),
        reviewStatus: cleanText(record.reviewStatus),
        reportStatus: cleanText(record.reportStatus),
        costEffect: cleanText(record.costEffect),
        marginEffect: cleanText(record.marginEffect),
        reviewedBy: cleanText(record.reviewedBy),
        reviewedAt: cleanText(record.reviewedAt),
        note: cleanText(record.note),
        warnings: Array.isArray(record.warnings) ? record.warnings.map(cleanText).filter(Boolean) : [],
      })).filter((record) => record.marginReportId)
    : [];
  return item;
}

function normalizeDeliveryNotePagePayload(input = {}) {
  return {
    fileName: cleanText(input.fileName),
    mimeType: cleanText(input.mimeType),
    fileSize: Number(input.fileSize) || undefined,
    contentDataUrl: cleanText(input.contentDataUrl),
    sourceMimeType: cleanText(input.sourceMimeType || input.mimeType),
    sourceFileSize: Number(input.sourceFileSize || input.fileSize) || undefined,
    sourceContentDataUrl: cleanText(input.sourceContentDataUrl),
    sourceFile: input.sourceFile ?? null,
    sourceAttachmentId: cleanText(input.sourceAttachmentId),
    captureId: cleanText(input.captureId),
    sourceNormalizedForOcr: input.sourceNormalizedForOcr === true,
    pdfPageNumber: Number(input.pdfPageNumber) || undefined,
    useNewModel: input.useNewModel === true,
  };
}

async function uploadDeliveryNoteSourcePages({ authState, operatorId, pages, options }) {
  const captureId = cleanText(pages[0]?.captureId) || createDeliveryNoteCaptureId();
  const uploadedPages = [];
  for (const [sourcePageIndex, page] of pages.entries()) {
    if (page.sourceAttachmentId) {
      uploadedPages.push(page);
      continue;
    }
    if (!page.sourceFile) {
      uploadedPages.push(page);
      continue;
    }
    const result = await uploadOfficeAttachmentFile({
      authState,
      uploadedBy: operatorId,
      file: page.sourceFile,
      ownerType: "raw_material_inbound_capture",
      ownerId: captureId,
      purpose: "raw_material_delivery_note",
      contentRef: `raw-material-capture:${captureId}:page:${sourcePageIndex + 1}`,
      remark: `原材料送货单待识别原图第 ${sourcePageIndex + 1}/${pages.length} 页。`,
      metadata: {
        captureId,
        sourcePageIndex,
        pageNumber: sourcePageIndex + 1,
        pageCount: pages.length,
      },
    }, options);
    if (result.blocked || !result.attachment?.attachmentId) {
      return {
        source: result.source || "api_error",
        error: result.error || {
          code: "RAW_MATERIAL_DELIVERY_NOTE_SOURCE_UPLOAD_FAILED",
          message: `送货单第 ${sourcePageIndex + 1} 页原图没有保存成功，请重试。`,
        },
      };
    }
    uploadedPages.push({ ...page, sourceAttachmentId: result.attachment.attachmentId });
  }
  return { source: "api", pages: uploadedPages };
}

function buildDeliveryNoteOcrRequestBody({ operatorId, useNewModel, pages }) {
  return {
    operatorId,
    useNewModel,
    pages: pages.map((page) => ({
      fileName: page.fileName,
      mimeType: page.mimeType,
      fileSize: page.fileSize,
      contentDataUrl: page.contentDataUrl,
      sourceMimeType: page.sourceMimeType,
      sourceFileSize: page.sourceFileSize,
      sourceContentDataUrl: page.sourceAttachmentId ? "" : page.sourceContentDataUrl,
      sourceAttachmentId: page.sourceAttachmentId,
      sourceNormalizedForOcr: page.sourceNormalizedForOcr,
      pdfPageNumber: page.pdfPageNumber,
      useNewModel: page.useNewModel,
    })),
  };
}

function validateDeliveryNoteOcrRequestSize(input) {
  const body = buildDeliveryNoteOcrRequestBody(input);
  const byteLength = new TextEncoder().encode(JSON.stringify(body)).byteLength;
  if (byteLength <= attachmentUploadLimits.rawMaterialOcrRequestJsonBytes) return null;
  return {
    code: "RAW_MATERIAL_DELIVERY_NOTE_REQUEST_TOO_LARGE",
    message: "这几页送货单处理后仍然过大，系统没有提交识别。请清空后重新拍摄；原图会单独保存，不需要手工压缩。",
  };
}

function toDeliveryNoteOcrApiError(json, status) {
  if (status === 413 || json?.code === "REQUEST_BODY_TOO_LARGE") {
    return {
      status,
      code: "RAW_MATERIAL_DELIVERY_NOTE_REQUEST_TOO_LARGE",
      message: "送货单照片数据仍然过大，系统没有生成草稿。请清空后重新拍摄，原图会单独保存。",
    };
  }
  return toApiError(json, status, "原材料送货单 OCR 识别失败。");
}

function createDeliveryNoteCaptureId() {
  const uuid = globalThis.crypto?.randomUUID?.();
  if (uuid) return `RMCAP-${uuid}`;
  return `RMCAP-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

function normalizeOcrPages(pages, pageCount, imageWidth, imageHeight, angle) {
  const source = Array.isArray(pages) ? pages : [];
  return Array.from({ length: Math.max(pageCount, source.length) }, (_, sourcePageIndex) => ({
    sourcePageIndex,
    pageNumber: sourcePageIndex + 1,
    angle: Number(source[sourcePageIndex]?.angle ?? angle) || 0,
    imageWidth: Math.max(0, Number(source[sourcePageIndex]?.imageWidth ?? imageWidth) || 0),
    imageHeight: Math.max(0, Number(source[sourcePageIndex]?.imageHeight ?? imageHeight) || 0),
    requestId: cleanText(source[sourcePageIndex]?.requestId),
  }));
}

function normalizeTextList(values, fallback) {
  const normalized = (Array.isArray(values) ? values : []).map(cleanText).filter(Boolean);
  if (normalized.length) return normalized;
  const safeFallback = cleanText(fallback);
  return safeFallback ? [safeFallback] : [];
}

function normalizeSupplierStatementReview(input = {}) {
  const item = { ...(input ?? {}) };
  item.reviewId = cleanText(item.reviewId ?? item.id);
  item.id = item.reviewId;
  item.supplierName = cleanText(item.supplierName);
  item.fileName = cleanText(item.fileName);
  item.status = cleanText(item.status);
  item.reviewStatus = cleanText(item.reviewStatus);
  item.summaryText = cleanText(item.summaryText);
  item.summary = item.summary && typeof item.summary === "object" ? item.summary : {};
  item.adapter = item.adapter && typeof item.adapter === "object" ? item.adapter : {};
  item.rows = Array.isArray(item.rows) ? item.rows : [];
  item.adjustments = Array.isArray(item.adjustments) ? item.adjustments : [];
  item.issues = Array.isArray(item.issues) ? item.issues : [];
  item.matchedInboundIds = Array.isArray(item.matchedInboundIds) ? item.matchedInboundIds : [];
  item.statementStatus = cleanText(item.statementStatus);
  item.statementConfirmationId = cleanText(item.statementConfirmationId);
  item.statementConfirmedAt = cleanText(item.statementConfirmedAt);
  item.statementConfirmedBy = cleanText(item.statementConfirmedBy);
  item.paymentStatus = cleanText(item.paymentStatus);
  item.supplierPayableId = cleanText(item.supplierPayableId);
  item.payableStatus = cleanText(item.payableStatus);
  item.supplierPayableDraft = normalizeSupplierPayableDraft(item.supplierPayableDraft);
  item.supplierPayableGeneratedAt = cleanText(item.supplierPayableGeneratedAt);
  item.supplierPayableGeneratedBy = cleanText(item.supplierPayableGeneratedBy);
  item.supplierPaymentConfirmationId = cleanText(item.supplierPaymentConfirmationId);
  item.supplierPaymentRecord = normalizeSupplierPaymentRecord(item.supplierPaymentRecord);
  item.supplierPaymentConfirmedAt = cleanText(item.supplierPaymentConfirmedAt);
  item.supplierPaymentConfirmedBy = cleanText(item.supplierPaymentConfirmedBy);
  return item;
}

function normalizeSupplierPayableDraft(input = {}) {
  if (!input || typeof input !== "object") return null;
  const supplierPayableId = cleanText(input.supplierPayableId ?? input.payableId);
  if (!supplierPayableId) return null;
  return {
    ...input,
    supplierPayableId,
    payableId: supplierPayableId,
    status: cleanText(input.status),
    currency: cleanText(input.currency) || "CNY",
    lineSubtotal: toNumber(input.lineSubtotal, 0),
    currentAdjustmentSubtotal: toNumber(input.currentAdjustmentSubtotal, 0),
    payableAmount: toNumber(input.payableAmount, 0),
    currentAdjustments: Array.isArray(input.currentAdjustments) ? input.currentAdjustments : [],
    referenceAdjustments: Array.isArray(input.referenceAdjustments) ? input.referenceAdjustments : [],
    nextStep: cleanText(input.nextStep),
    generatedAt: cleanText(input.generatedAt),
    generatedBy: cleanText(input.generatedBy),
    note: cleanText(input.note),
  };
}

function normalizeSupplierPaymentRecord(input = {}) {
  if (!input || typeof input !== "object") return null;
  const supplierPaymentConfirmationId = cleanText(input.supplierPaymentConfirmationId ?? input.paymentConfirmationId);
  if (!supplierPaymentConfirmationId) return null;
  return {
    ...input,
    supplierPaymentConfirmationId,
    paymentConfirmationId: supplierPaymentConfirmationId,
    supplierPayableId: cleanText(input.supplierPayableId),
    status: cleanText(input.status) || "已确认付款",
    currency: cleanText(input.currency) || "CNY",
    paidAmount: toNumber(input.paidAmount ?? input.amount, 0),
    paymentMethod: cleanText(input.paymentMethod),
    paymentAccount: cleanText(input.paymentAccount),
    paymentReferenceNo: cleanText(input.paymentReferenceNo),
    paymentVoucherNo: cleanText(input.paymentVoucherNo),
    paidAt: cleanText(input.paidAt),
    confirmedAt: cleanText(input.confirmedAt),
    confirmedBy: cleanText(input.confirmedBy),
    note: cleanText(input.note),
  };
}

function buildRawMaterialInboundMetrics(inbounds = []) {
  const items = (Array.isArray(inbounds) ? inbounds : []).map(normalizeRawMaterialInbound).filter((item) => item.id);
  return {
    totalCount: items.length,
    pendingReviewCount: items.filter((item) => item.status.includes("待复核")).length,
    pendingLabelCount: items.filter((item) => item.status.includes("待打印") || item.status.includes("待贴标")).length,
    partiallyLabeledCount: items.filter((item) => item.status === "部分贴标").length,
    availableCount: items.filter((item) => ["已贴标/可用库存", "已贴标入库/可用"].includes(item.status)).length,
    issuedCount: items.filter((item) => item.status.includes("领料/机边")).length,
    consumptionConfirmedCount: items.filter((item) => item.status.includes("消耗确认")).length,
    leftoverPendingCount: items.filter((item) => item.status.includes("余料")).length,
    leftoverReviewedCount: items.filter((item) => item.status.includes("余料已复核")).length,
    splitRollCount: items.reduce((sum, item) => sum + (item.rawMaterialSplitRecords ?? []).length, 0),
    availableRollCount: items.reduce(
      (sum, item) => sum + (item.rolls ?? []).filter((roll) => roll.inventoryStatus === "可用").length,
      0,
    ),
    machineSideRollCount: items.reduce(
      (sum, item) => sum + (item.rolls ?? []).filter((roll) => roll.inventoryStatus === "机边领用").length,
      0,
    ),
    consumedRollCount: items.reduce(
      (sum, item) => sum + (item.rolls ?? []).filter((roll) => roll.inventoryStatus === "已消耗").length,
      0,
    ),
    leftoverPendingRollCount: items.reduce(
      (sum, item) => sum + (item.rolls ?? []).filter((roll) => roll.inventoryStatus === "余料待复核").length,
      0,
    ),
    leftoverReviewedRollCount: items.reduce(
      (sum, item) => sum + (item.rolls ?? []).filter((roll) => roll.leftoverReviewRecordId).length,
      0,
    ),
    exceptionCount: items.filter((item) => item.status.includes("异常")).length,
  };
}

function toRawMaterialActionSlug(action) {
  const value = cleanText(action);
  if (value === "复核送货单" || value === "review") return "review";
  if (value === "打印卷标" || value === "print_labels" || value === "print-labels") return "print-labels";
  if (value === "确认贴标入库" || value === "attach_confirm" || value === "attach-confirm") return "attach-confirm";
  if (value === "作废卷标" || value === "void_label" || value === "void-label") return "void-label";
  if (value === "重打卷标" || value === "reprint_label" || value === "reprint-label") return "reprint-label";
  if (value === "供应商退货暂存" || value === "stage_supplier_return" || value === "stage-supplier-return") return "stage-supplier-return";
  if (value === "确认退厂" || value === "confirm_supplier_return_shipment" || value === "confirm-supplier-return-shipment") return "confirm-supplier-return-shipment";
  if (value === "机边领料" || value === "扫码出库" || value === "issue_to_machine" || value === "issue-to-machine") return "issue-to-machine";
  if (value === "确认消耗" || value === "confirm_consumption" || value === "confirm-consumption") return "confirm-consumption";
  if (value === "余料退回" || value === "return_leftover" || value === "return-leftover") return "return-leftover";
  if (value === "复核余料可用" || value === "review_leftover" || value === "review-leftover") return "review-leftover";
  if (value === "生成成本草稿" || value === "generate_cost_draft" || value === "generate-cost-draft") return "generate-cost-draft";
  if (value === "确认成本草稿" || value === "confirm_cost_draft" || value === "confirm-cost-draft") return "confirm-cost-draft";
  if (value === "校准损耗" || value === "损耗校准" || value === "calibrate_loss" || value === "calibrate-loss") return "calibrate-loss";
  if (value === "生成毛利快照" || value === "毛利快照" || value === "generate_margin_snapshot" || value === "generate-margin-snapshot") return "generate-margin-snapshot";
  if (value === "复核毛利快照" || value === "确认毛利快照" || value === "毛利报表" || value === "review_margin_snapshot" || value === "review-margin-snapshot") return "review-margin-snapshot";
  if (value === "标记异常" || value === "exception") return "exception";
  return "";
}

async function readJson(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function toApiError(json, status, fallbackMessage) {
  return {
    status,
    code: json?.code ?? `HTTP_${status}`,
    message: json?.message ?? fallbackMessage,
    requiredPermission: json?.requiredPermission,
  };
}

function toNumber(value, fallback) {
  const next = Number(value);
  return Number.isFinite(next) ? next : fallback;
}

function cleanText(value) {
  return String(value ?? "").trim();
}
