import {
  isOfficeApiRequestAbort,
  readOfficeApiJson as readJson,
  requestOfficeApi as requestRawMaterialApi,
  toOfficeApiTransportError,
} from "./officeApiClientCore.js";
import { uploadOfficeAttachmentFile } from "./officeAttachmentApiClient.js";
import { normalizeRawMaterialInbound } from "./officeRawMaterialInboundNormalizer.js";
import { attachmentUploadLimits } from "../../shared/attachmentUploadPolicy.js";
import { toRawMaterialInboundActionSlug } from "../../shared/rawMaterialInboundActionSlugs.js";
import { cleanText, toNumber, toRawMaterialApiError } from "./officeRawMaterialApiSupport.js";

export {
  confirmOfficeRawMaterialSupplierPayment,
  confirmOfficeRawMaterialSupplierStatement,
  confirmOfficeRawMaterialSupplierStatementReview,
  createOfficeRawMaterialSupplierStatementReviewDraft,
  generateOfficeRawMaterialSupplierPayableDraft,
  listOfficeRawMaterialSupplierStatementReviews,
} from "./officeRawMaterialSupplierStatementApiClient.js";

export async function listOfficeRawMaterialPurchaseRequests(input = {}, options = {}) {
  const { authState, operatorId } = input;
  try {
    const response = await requestRawMaterialApi("/raw-material-purchase-requests", { ...options, authState, operatorId });
    const json = await readJson(response);
    if (!response.ok) return { source: "api_error", blocked: true, items: [], error: toRawMaterialApiError(json, response.status, "采购请求读取失败。") };
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
    if (!response.ok) return { source: "api_error", blocked: true, error: toRawMaterialApiError(json, response.status, fallbackMessage) };
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
        error: toRawMaterialApiError(json, response.status, "原材料入库列表 API 返回错误。"),
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
  const { authState, operatorId, useNewModel, pages, onProgress, duplicateConfirmationToken, ocrJobId, documentDirectionHint, signal, supplierNameHint } = input;
  const requestOptions = { ...options, signal: signal ?? options.signal };
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
  try {
    let jobId = cleanText(ocrJobId);
    if (!jobId) {
      const pageSizeError = validateDeliveryNoteOcrPagePayloads(deliveryNotePages);
      if (pageSizeError) return { source: "client_validation", blocked: true, error: pageSizeError };
      const uploadedPages = await uploadDeliveryNoteSourcePages({
        authState,
        operatorId,
        pages: deliveryNotePages,
        options: requestOptions,
        onProgress,
      });
      if (uploadedPages.error) {
        return { source: uploadedPages.source, blocked: true, error: uploadedPages.error };
      }
      const requestBody = buildDeliveryNoteOcrRequestBody({
        documentDirectionHint,
        operatorId,
        supplierNameHint,
        useNewModel: useNewModel === true,
        pages: uploadedPages.pages,
      });
      const requestSizeError = validateDeliveryNoteOcrRequestSize({
        documentDirectionHint,
        operatorId,
        supplierNameHint,
        useNewModel: useNewModel === true,
        pages: uploadedPages.pages,
      });
      if (requestSizeError) return { source: "client_validation", blocked: true, error: requestSizeError };
      const startResponse = await requestRawMaterialApi("/raw-material-inbounds/ocr-jobs", {
        ...requestOptions,
        authState,
        operatorId,
        method: "POST",
        body: requestBody,
      });
      const startJson = await readJson(startResponse);
      if (!startResponse.ok) {
        return { source: "api_error", blocked: true, error: toDeliveryNoteOcrApiError(startJson, startResponse.status) };
      }
      jobId = cleanText(startJson?.job?.jobId);
      if (!jobId) throw new Error("后台没有返回送货单识别任务编号。");
    } else {
      const retryResponse = await requestRawMaterialApi(`/raw-material-inbounds/ocr-jobs/${encodeURIComponent(jobId)}/retry`, {
        ...requestOptions,
        authState,
        operatorId,
        method: "POST",
        body: { duplicateConfirmationToken: cleanText(duplicateConfirmationToken) },
      });
      const retryJson = await readJson(retryResponse);
      if (!retryResponse.ok) {
        return { source: "api_error", blocked: true, error: toDeliveryNoteOcrApiError(retryJson, retryResponse.status) };
      }
    }
    const job = await pollDeliveryNoteOcrJob({ authState, jobId, operatorId, onProgress, options: requestOptions });
    if (job.error) {
      return {
        source: "api_error",
        blocked: true,
        error: {
          ...job.error,
          details: { ...(job.error.details ?? {}), jobId },
        },
      };
    }
    const json = job.result;
    if (!json?.inbound?.id) throw new Error("后台识别任务没有生成入库草稿。");
    notifyDeliveryNoteProgress(onProgress, {
      phase: "complete",
      current: job.pageCount,
      total: job.pageCount,
      message: "识别完成，正在打开核对页面…",
    });
    return {
      source: "api",
      inbound: normalizeRawMaterialInbound(json?.inbound),
      attachmentId: cleanText(json?.attachmentId),
      attachmentIds: (Array.isArray(json?.attachmentIds) ? json.attachmentIds : []).map(cleanText).filter(Boolean),
      deduplicated: json?.deduplicated === true,
      operationLogId: cleanText(json?.operationLogId),
      ocrJobId: jobId,
    };
  } catch (error) {
    if (isOfficeApiRequestAbort(error)) {
      return {
        source: "cancelled",
        blocked: true,
        cancelled: true,
        error: toOfficeApiTransportError(error, "送货单识别已取消。"),
      };
    }
    return {
      source: "api_error",
      blocked: true,
      error: {
        code: "RAW_MATERIAL_DELIVERY_NOTE_OCR_API_UNAVAILABLE",
        message: toDeliveryNoteNetworkErrorMessage(error, deliveryNotePages.length),
        details: cleanText(ocrJobId) ? { jobId: cleanText(ocrJobId) } : undefined,
      },
    };
  }
}

async function pollDeliveryNoteOcrJob({ authState, jobId, operatorId, onProgress, options }) {
  const maximumPolls = Number(options.deliveryNoteJobMaximumPolls) || 300;
  for (let pollIndex = 0; pollIndex < maximumPolls; pollIndex += 1) {
    const response = await requestRawMaterialApi(`/raw-material-inbounds/ocr-jobs/${encodeURIComponent(jobId)}/status`, {
      ...options,
      authState,
      operatorId,
      method: "POST",
      body: {},
    });
    const json = await readJson(response);
    if (!response.ok) throw Object.assign(new Error(toDeliveryNoteOcrApiError(json, response.status).message), { status: response.status });
    const job = json?.job ?? {};
    notifyDeliveryNoteProgress(onProgress, {
      phase: job.status,
      current: Number(job.currentPage) || 0,
      total: Number(job.pageCount) || 0,
      message: cleanText(job.message) || (job.status === "completed"
        ? "识别完成，正在打开核对页面…"
        : job.status === "queued"
          ? "送货单已进入后台识别队列…"
          : "正在后台识别送货单…"),
    });
    if (["completed", "failed", "needs_confirmation"].includes(job.status)) return job;
    await waitForDeliveryNoteJob(options.deliveryNoteJobPollIntervalMs ?? 500, options);
  }
  throw new Error("送货单后台识别等待超时，请直接重试，不需要重新上传。");
}

function waitForDeliveryNoteJob(milliseconds, options = {}) {
  if (typeof options.waitForDeliveryNoteJob === "function") return options.waitForDeliveryNoteJob(milliseconds);
  return new Promise((resolve, reject) => {
    const signal = options.signal;
    let timeoutId = null;
    const cancel = () => {
      clearTimeout(timeoutId);
      const error = new Error("请求已取消。");
      error.code = "REQUEST_ABORTED";
      reject(error);
    };
    if (signal?.aborted) {
      cancel();
      return;
    }
    timeoutId = setTimeout(() => {
      signal?.removeEventListener("abort", cancel);
      resolve();
    }, Math.max(0, Number(milliseconds) || 0));
    signal?.addEventListener("abort", cancel, { once: true });
  });
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
    documentDirectionHint,
    supplierNameHint,
  } = input;
  const safeInboundId = cleanText(inboundId);
  const actionSlug = toRawMaterialInboundActionSlug(action);
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
          documentDirectionHint,
          supplierNameHint,
        },
      },
    );
    const json = await readJson(response);
    if (!response.ok) {
      return {
        source: "api_error",
        blocked: true,
        error: toRawMaterialApiError(json, response.status, "原材料入库动作 API 返回错误。"),
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


function buildRawMaterialInboundQuery({ page, pageSize, filters = {} }) {
  const params = new URLSearchParams();
  params.set("page", String(page));
  params.set("pageSize", String(pageSize));
  if (filters.keyword) params.set("keyword", cleanText(filters.keyword));
  if (filters.status && filters.status !== "全部") params.set("status", cleanText(filters.status));
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
    ocrAttachmentId: cleanText(input.ocrAttachmentId),
    captureId: cleanText(input.captureId),
    sourceNormalizedForOcr: input.sourceNormalizedForOcr === true,
    pdfPageNumber: Number(input.pdfPageNumber) || undefined,
    useNewModel: input.useNewModel === true,
  };
}

async function uploadDeliveryNoteSourcePages({ authState, operatorId, pages, options, onProgress }) {
  const captureId = cleanText(pages[0]?.captureId) || createDeliveryNoteCaptureId();
  const captureOwnerId = buildDeliveryNoteCaptureOwnerId(captureId, operatorId);
  const uploadedPages = [];
  for (const [sourcePageIndex, page] of pages.entries()) {
    let uploadedPage = { ...page };
    const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();
    if (!uploadedPage.sourceAttachmentId) {
      notifyDeliveryNoteProgress(onProgress, {
        phase: "uploading",
        current: sourcePageIndex + 1,
        total: pages.length,
        message: `正在保存第 ${sourcePageIndex + 1}/${pages.length} 页原图…`,
      });
      const sourceFile = uploadedPage.sourceFile || dataUrlToUploadFile(
        uploadedPage.contentDataUrl,
        uploadedPage.fileName || `送货单-第${sourcePageIndex + 1}页.jpg`,
        uploadedPage.mimeType,
      );
      const sourceResult = await uploadOfficeAttachmentFile({
        authState,
        uploadedBy: operatorId,
        file: sourceFile,
        ownerType: "raw_material_inbound_capture",
        ownerId: captureOwnerId,
        purpose: "raw_material_delivery_note",
        contentRef: `raw-material-capture:${captureOwnerId}:page:${sourcePageIndex + 1}:source`,
        remark: `原材料送货单待识别原图第 ${sourcePageIndex + 1}/${pages.length} 页。`,
        metadata: {
          captureId,
          captureOwnerId,
          captureKind: "source_original",
          lifecycleState: "temporary_until_linked",
          expiresAt,
          capturedBy: operatorId,
          sourcePageIndex,
          pageNumber: sourcePageIndex + 1,
          pageCount: pages.length,
        },
      }, options);
      if (sourceResult.blocked || !sourceResult.attachment?.attachmentId) {
        return buildDeliveryNoteUploadFailure(sourceResult, sourcePageIndex, pages.length, "原图");
      }
      uploadedPage = { ...uploadedPage, sourceAttachmentId: sourceResult.attachment.attachmentId };
    }

    if (!uploadedPage.ocrAttachmentId) {
      if (uploadedPage.sourceNormalizedForOcr !== true) {
        uploadedPage.ocrAttachmentId = uploadedPage.sourceAttachmentId;
      } else {
        notifyDeliveryNoteProgress(onProgress, {
          phase: "uploading_ocr_copy",
          current: sourcePageIndex + 1,
          total: pages.length,
          message: `正在准备第 ${sourcePageIndex + 1}/${pages.length} 页识别副本…`,
        });
        const ocrFile = dataUrlToUploadFile(
          uploadedPage.contentDataUrl,
          replaceDeliveryNoteExtension(uploadedPage.fileName, `送货单-第${sourcePageIndex + 1}页-OCR.jpg`),
          uploadedPage.mimeType || "image/jpeg",
        );
        const ocrResult = await uploadOfficeAttachmentFile({
          authState,
          uploadedBy: operatorId,
          file: ocrFile,
          ownerType: "raw_material_inbound_capture",
          ownerId: captureOwnerId,
          purpose: "raw_material_delivery_note",
          contentRef: `raw-material-capture:${captureOwnerId}:page:${sourcePageIndex + 1}:ocr-copy`,
          remark: `原材料送货单第 ${sourcePageIndex + 1}/${pages.length} 页 OCR 临时副本。`,
          metadata: {
            captureId,
            captureOwnerId,
            captureKind: "ocr_copy",
            lifecycleState: "temporary",
            expiresAt,
            capturedBy: operatorId,
            sourcePageIndex,
            pageNumber: sourcePageIndex + 1,
            pageCount: pages.length,
          },
        }, options);
        if (ocrResult.blocked || !ocrResult.attachment?.attachmentId) {
          return buildDeliveryNoteUploadFailure(ocrResult, sourcePageIndex, pages.length, "识别副本");
        }
        uploadedPage.ocrAttachmentId = ocrResult.attachment.attachmentId;
      }
    }
    uploadedPages.push({ ...uploadedPage, contentDataUrl: "", sourceContentDataUrl: "" });
  }
  return { source: "api", pages: uploadedPages };
}

function buildDeliveryNoteUploadFailure(result, sourcePageIndex, pageCount, label) {
  if (result?.error?.status === 413 || result?.error?.code === "REQUEST_BODY_TOO_LARGE") {
    return {
      source: result.source || "api_error",
      error: {
        code: "RAW_MATERIAL_DELIVERY_NOTE_REQUEST_TOO_LARGE",
        message: `送货单第 ${sourcePageIndex + 1} 页过大，系统没有生成草稿，请重新拍摄这一页。`,
      },
    };
  }
  if (/UNAVAILABLE$/u.test(cleanText(result?.error?.code)) || /load failed|failed to fetch|network/iu.test(cleanText(result?.error?.message))) {
    return {
      source: result.source || "api_error",
      error: {
        code: "RAW_MATERIAL_DELIVERY_NOTE_OCR_API_UNAVAILABLE",
        message: `${pageCount > 1 ? `${pageCount} 页送货单` : "送货单"}上传时连接中断。已选页面仍保留，请检查网络后直接重新识别，不用重拍。`,
      },
    };
  }
  return {
    source: result.source || "api_error",
    error: result.error || {
      code: "RAW_MATERIAL_DELIVERY_NOTE_SOURCE_UPLOAD_FAILED",
      message: `送货单第 ${sourcePageIndex + 1} 页${label}没有保存成功，请重试。`,
    },
  };
}

function dataUrlToUploadFile(contentDataUrl, fileName, mimeType) {
  const match = cleanText(contentDataUrl).match(/^data:([^;,]+)?(?:;base64)?,(.*)$/su);
  if (!match) throw new Error("送货单识别副本无效，请重新拍摄。");
  const type = cleanText(match[1]) || cleanText(mimeType) || "image/jpeg";
  const isBase64 = cleanText(contentDataUrl).slice(0, cleanText(contentDataUrl).indexOf(",")).includes(";base64");
  const binary = isBase64 ? globalThis.atob(match[2]) : decodeURIComponent(match[2]);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  const safeName = replaceDeliveryNoteExtension(fileName, "送货单-OCR.jpg");
  if (typeof globalThis.File === "function") return new globalThis.File([bytes], safeName, { type });
  const blob = new Blob([bytes], { type });
  Object.defineProperty(blob, "name", { value: safeName });
  return blob;
}

function replaceDeliveryNoteExtension(fileName, fallback) {
  const value = cleanText(fileName);
  if (!value) return fallback;
  return /\.[a-z0-9]+$/iu.test(value) ? value.replace(/\.[a-z0-9]+$/iu, "-OCR.jpg") : `${value}-OCR.jpg`;
}

function buildDeliveryNoteCaptureOwnerId(captureId, operatorId) {
  const safeCaptureId = cleanText(captureId);
  const safeOperatorId = cleanText(operatorId);
  return `${safeCaptureId}:${safeOperatorId}`;
}

function notifyDeliveryNoteProgress(listener, progress) {
  if (typeof listener !== "function") return;
  listener(progress);
}

function toDeliveryNoteNetworkErrorMessage(error, pageCount) {
  const original = cleanText(error?.message ?? error);
  if (/load failed|failed to fetch|network(?:error| request failed)|fetch failed|网络请求失败/iu.test(original)) {
    return `${pageCount > 1 ? `${pageCount} 页送货单` : "送货单"}上传或识别时连接中断。已选页面仍保留，请检查网络后直接重新识别，不用重拍。`;
  }
  return original || "送货单识别服务暂时无法连接。已选页面仍保留，请稍后直接重新识别。";
}

function buildDeliveryNoteOcrRequestBody({ documentDirectionHint, operatorId, supplierNameHint, useNewModel, pages }) {
  return {
    documentDirectionHint: normalizeDocumentDirectionHint(documentDirectionHint),
    operatorId,
    supplierNameHint: cleanText(supplierNameHint),
    useNewModel,
    pages: pages.map((page) => ({
      fileName: page.fileName,
      mimeType: page.mimeType,
      fileSize: page.fileSize,
      sourceMimeType: page.sourceMimeType,
      sourceFileSize: page.sourceFileSize,
      sourceAttachmentId: page.sourceAttachmentId,
      ocrAttachmentId: page.ocrAttachmentId || page.sourceAttachmentId,
      sourceNormalizedForOcr: page.sourceNormalizedForOcr,
      pdfPageNumber: page.pdfPageNumber,
      useNewModel: page.useNewModel,
    })),
  };
}

function normalizeDocumentDirectionHint(value) {
  const direction = cleanText(value);
  return ["supplier_delivery", "supplier_return"].includes(direction) ? direction : "supplier_delivery";
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

function validateDeliveryNoteOcrPagePayloads(pages) {
  for (const [sourcePageIndex, page] of pages.entries()) {
    const encoded = cleanText(page.contentDataUrl);
    const commaIndex = encoded.indexOf(",");
    const encodedLength = commaIndex >= 0 ? encoded.length - commaIndex - 1 : 0;
    const approximateBytes = Math.floor(encodedLength * 0.75);
    if (!encoded || approximateBytes > attachmentUploadLimits.rawMaterialOcrRequestPageBytes) {
      return {
        code: "RAW_MATERIAL_DELIVERY_NOTE_REQUEST_TOO_LARGE",
        message: `送货单第 ${sourcePageIndex + 1} 页处理后仍然过大，请删除这一页后重新拍摄。`,
      };
    }
  }
  return null;
}

function toDeliveryNoteOcrApiError(json, status) {
  if (status === 413 || json?.code === "REQUEST_BODY_TOO_LARGE") {
    return {
      status,
      code: "RAW_MATERIAL_DELIVERY_NOTE_REQUEST_TOO_LARGE",
      message: "送货单照片数据仍然过大，系统没有生成草稿。请清空后重新拍摄，原图会单独保存。",
    };
  }
  return toRawMaterialApiError(json, status, "原材料送货单 OCR 识别失败。");
}

function createDeliveryNoteCaptureId() {
  const uuid = globalThis.crypto?.randomUUID?.();
  if (uuid) return `RMCAP-${uuid}`;
  return `RMCAP-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
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
