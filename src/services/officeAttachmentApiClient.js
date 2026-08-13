import { getAuthApiBaseUrl, isOfficeApiServerRequired } from "./officeAuthService.js";
import { requestOfficeApi as requestAttachmentApi } from "./officeApiClientCore.js";
import {
  getAttachmentFileExtension,
  getAttachmentUploadPolicy,
} from "../../shared/attachmentUploadPolicy.js";

export async function createOfficeAttachment(input, options = {}) {
  const {
    authState,
    ownerType,
    ownerId,
    fileType = "image",
    purpose,
    fileName,
    contentRef,
    mimeType,
    fileSize,
    contentDataUrl,
    metadata = {},
    uploadedBy,
    remark = "",
  } = input;

  const validationError = validateAttachmentUploadInput(input);
  if (validationError) {
    return {
      source: "client_validation",
      blocked: true,
      error: validationError,
    };
  }

  try {
    const response = await requestAttachmentApi("/attachments", {
      ...options,
      authState,
      method: "POST",
      operatorId: uploadedBy,
      body: {
        ownerType,
        ownerId,
        fileType,
        purpose,
        fileName,
        contentRef,
        mimeType,
        fileSize,
        contentDataUrl,
        metadata: isPlainObject(metadata) ? metadata : {},
        uploadedBy,
        remark,
      },
    });
    const json = await readJson(response);

    if (!response.ok) {
      return {
        source: "api_error",
        blocked: true,
        error: toApiError(json, response.status, "附件登记 API 返回错误。"),
      };
    }

    return {
      source: "api",
      attachment: mapAttachmentSummary(json),
    };
  } catch (error) {
    if (isOfficeApiServerRequired(options)) {
      return buildServerRequiredWriteError("ATTACHMENT_API_UNAVAILABLE", error);
    }
    return {
      source: "local_fallback",
      attachment: createLocalAttachmentSummary(input),
      error: {
        code: "ATTACHMENT_API_UNAVAILABLE",
        message: error?.message ?? String(error),
      },
    };
  }
}

export async function uploadOfficeAttachmentFile(input, options = {}) {
  const file = input.file;
  const validationError = validateAttachmentUploadInput({
    ...input,
    fileSize: Number(file?.size ?? input.fileSize),
    mimeType: file?.type || input.mimeType,
    fileName: file?.name || input.fileName,
    binaryContent: true,
  });
  if (validationError) return { source: "client_validation", blocked: true, error: validationError };
  if (!file) {
    return {
      source: "client_validation",
      blocked: true,
      error: { code: "ATTACHMENT_CONTENT_REQUIRED", message: "请选择实际文件后上传。" },
    };
  }

  const searchParams = new URLSearchParams();
  const values = {
    ownerType: input.ownerType,
    ownerId: input.ownerId,
    fileType: inferAttachmentFileType({ mimeType: file.type || input.mimeType, fileName: file.name || input.fileName }) || input.fileType,
    purpose: input.purpose,
    fileName: file.name || input.fileName,
    contentRef: input.contentRef,
    mimeType: file.type || input.mimeType || "application/octet-stream",
    fileSize: String(file.size),
    remark: input.remark || "",
    metadata: JSON.stringify(isPlainObject(input.metadata) ? input.metadata : {}),
  };
  for (const [key, value] of Object.entries(values)) {
    if (value !== undefined && value !== null && String(value) !== "") searchParams.set(key, String(value));
  }
  try {
    const response = await requestAttachmentApi(`/attachments/binary?${searchParams.toString()}`, {
      ...options,
      authState: input.authState,
      method: "POST",
      operatorId: input.uploadedBy,
      headers: { "content-type": values.mimeType },
      rawBody: file,
    });
    const json = await readJson(response);
    if (!response.ok) {
      return { source: "api_error", blocked: true, error: toApiError(json, response.status, "附件上传失败。") };
    }
    return { source: "api", attachment: mapAttachmentSummary(json) };
  } catch (error) {
    if (isOfficeApiServerRequired(options)) return buildServerRequiredWriteError("ATTACHMENT_API_UNAVAILABLE", error);
    return {
      source: "local_fallback",
      blocked: true,
      error: { code: "ATTACHMENT_BINARY_UPLOAD_API_UNAVAILABLE", message: error?.message ?? String(error) },
    };
  }
}

export function validateAttachmentUploadInput(input = {}) {
  const purpose = normalizeAttachmentText(input.purpose);
  const mimeType = normalizeAttachmentText(input.mimeType || inferContentDataUrlMimeType(input.contentDataUrl)).toLowerCase();
  const fileName = normalizeAttachmentText(input.fileName);
  const fileType = inferAttachmentFileType({ mimeType, fileName }) || normalizeAttachmentText(input.fileType);
  const byteLength = getContentDataUrlByteLength(input.contentDataUrl);
  const declaredSize = Number(input.fileSize);
  const effectiveSize = Number.isFinite(byteLength) ? byteLength : Number.isFinite(declaredSize) ? declaredSize : 0;
  if (input.contentDataUrl && !Number.isFinite(byteLength)) {
    return {
      code: "ATTACHMENT_CONTENT_INVALID",
      message: "附件内容不是有效的 data URL，请重新选择文件后上传。",
    };
  }

  const rule = getAttachmentPurposeRule(purpose);
  const fileExtension = getAttachmentFileExtension(fileName);
  if (rule.allowedExtensions?.length && !rule.allowedExtensions.includes(fileExtension)) {
    return {
      code: "ATTACHMENT_FILE_EXTENSION_NOT_ALLOWED",
      message: `${rule.label}只允许上传${rule.allowedLabel}，当前扩展名为${fileExtension || "未知"}。`,
    };
  }
  if (rule.allowedFileTypes.length && !rule.allowedFileTypes.includes(fileType)) {
    return {
      code: "ATTACHMENT_FILE_TYPE_NOT_ALLOWED",
      message: `${rule.label}只允许上传${rule.allowedLabel}，当前文件类型为${fileType || "未知"}。`,
    };
  }

  if (rule.allowedMimePrefixes.length || rule.allowedMimeTypes.length) {
    const allowedMime = isMimeTypeAllowed(mimeType, rule);
    if (mimeType && !allowedMime) {
      return {
        code: "ATTACHMENT_MIME_TYPE_NOT_ALLOWED",
        message: `${rule.label}只允许上传${rule.allowedLabel}，当前文件类型为${mimeType}。`,
      };
    }
  }

  if (Number.isFinite(effectiveSize) && effectiveSize > rule.maxBytes) {
    return {
      code: "ATTACHMENT_FILE_TOO_LARGE",
      message: `${rule.label}不能超过 ${formatAttachmentSize(rule.maxBytes)}，当前约 ${formatAttachmentSize(effectiveSize)}。`,
    };
  }

  if (rule.requiresContent && input.binaryContent !== true && (!Number.isFinite(byteLength) || byteLength <= 0)) {
    return {
      code: "ATTACHMENT_CONTENT_REQUIRED",
      message: `${rule.label}必须选择实际文件后上传。`,
    };
  }

  return null;
}

export async function listOfficeAttachments(input, options = {}) {
  const { authState, ownerType = "", ownerId = "", purpose = "", fileType = "", operatorId, localAttachments = [] } = input;
  const searchParams = new URLSearchParams();
  if (ownerType) searchParams.set("ownerType", ownerType);
  if (ownerId) searchParams.set("ownerId", ownerId);
  if (purpose) searchParams.set("purpose", purpose);
  if (fileType) searchParams.set("fileType", fileType);
  const path = `/attachments${searchParams.size ? `?${searchParams.toString()}` : ""}`;

  try {
    const response = await requestAttachmentApi(path, {
      ...options,
      authState,
      method: "GET",
      operatorId,
    });
    const json = await readJson(response);

    if (!response.ok) {
      return {
        source: "api_error",
        blocked: true,
        error: toApiError(json, response.status, "附件查询 API 返回错误。"),
      };
    }

    return {
      source: "api",
      items: Array.isArray(json?.items) ? json.items.map((item) => mapAttachmentSummary(item)) : [],
      total: Number.isFinite(json?.total) ? json.total : 0,
      page: Number.isFinite(json?.page) ? json.page : 1,
      pageSize: Number.isFinite(json?.pageSize) ? json.pageSize : 50,
    };
  } catch (error) {
    return {
      source: "local_fallback",
      items: filterLocalAttachments(localAttachments, { ownerType, ownerId, purpose, fileType }),
      total: filterLocalAttachments(localAttachments, { ownerType, ownerId, purpose, fileType }).length,
      page: 1,
      pageSize: localAttachments.length,
      error: {
        code: "ATTACHMENT_LIST_API_UNAVAILABLE",
        message: error?.message ?? String(error),
      },
    };
  }
}

export async function downloadOfficeAttachmentContent(input, options = {}) {
  const { authState, attachmentId, operatorId } = input;
  if (!attachmentId) {
    return {
      source: "local_fallback",
      error: {
        code: "ATTACHMENT_CONTENT_TOKEN_MISSING",
        message: "缺少附件 ID，无法读取附件内容。",
      },
    };
  }

  try {
    const response = await requestAttachmentApi(`/attachments/${encodeURIComponent(attachmentId)}/content`, {
      ...options,
      authState,
      method: "GET",
      operatorId,
    });

    if (!response.ok) {
      const text = await response.text();
      return {
        source: "api_error",
        blocked: true,
        error: toApiError(parseJsonSafe(text), response.status, "附件内容 API 返回错误。"),
      };
    }
    const contentType = response.headers?.get?.("content-type") ?? "";
    const contentDisposition = response.headers?.get?.("content-disposition") ?? "";
    const contentBlob = typeof response.blob === "function" ? await response.blob() : null;
    const content = contentBlob ? "" : await response.text();

    return {
      source: "api",
      content,
      contentBlob,
      contentType: contentType || contentBlob?.type || "",
      contentDisposition,
    };
  } catch (error) {
    return {
      source: "local_fallback",
      error: {
        code: "ATTACHMENT_CONTENT_API_UNAVAILABLE",
        message: error?.message ?? String(error),
      },
    };
  }
}

export async function createOfficeAttachmentAccessUrl(input, options = {}) {
  const { authState, attachmentId, operatorId, ttlSeconds } = input;
  if (!attachmentId) {
    return {
      source: "local_fallback",
      error: {
        code: "ATTACHMENT_ACCESS_URL_ID_MISSING",
        message: "缺少附件 ID，无法生成附件访问地址。",
      },
    };
  }

  const searchParams = new URLSearchParams();
  if (Number.isFinite(ttlSeconds)) searchParams.set("ttlSeconds", String(ttlSeconds));
  const path = `/attachments/${encodeURIComponent(attachmentId)}/access-url${
    searchParams.size ? `?${searchParams.toString()}` : ""
  }`;

  try {
    const response = await requestAttachmentApi(path, {
      ...options,
      authState,
      method: "GET",
      operatorId,
    });
    const json = await readJson(response);

    if (!response.ok) {
      return {
        source: "api_error",
        blocked: true,
        error: toApiError(json, response.status, "附件访问地址 API 返回错误。"),
      };
    }

    return {
      source: "api",
      access: mapAttachmentAccessUrl(json, options),
    };
  } catch (error) {
    return {
      source: "local_fallback",
      error: {
        code: "ATTACHMENT_ACCESS_URL_API_UNAVAILABLE",
        message: error?.message ?? String(error),
      },
    };
  }
}

export async function listOfficeAttachmentAccessLogs(input, options = {}) {
  const { authState, attachmentId, operatorId, limit } = input;
  if (!attachmentId) {
    return {
      source: "local_fallback",
      attachmentId: "",
      items: [],
      total: 0,
      error: {
        code: "ATTACHMENT_ACCESS_LOG_ID_MISSING",
        message: "缺少附件 ID，无法查询附件访问日志。",
      },
    };
  }

  const searchParams = new URLSearchParams();
  if (Number.isFinite(limit)) searchParams.set("limit", String(limit));
  const path = `/attachments/${encodeURIComponent(attachmentId)}/access-logs${
    searchParams.size ? `?${searchParams.toString()}` : ""
  }`;

  try {
    const response = await requestAttachmentApi(path, {
      ...options,
      authState,
      method: "GET",
      operatorId,
    });
    const json = await readJson(response);

    if (!response.ok) {
      return {
        source: "api_error",
        blocked: true,
        error: toApiError(json, response.status, "附件访问日志 API 返回错误。"),
      };
    }

    const items = Array.isArray(json?.items) ? json.items.map((item) => mapAttachmentAccessLog(item)) : [];
    return {
      source: "api",
      attachmentId: json?.attachmentId ?? attachmentId,
      items,
      total: Number.isFinite(json?.total) ? json.total : items.length,
    };
  } catch (error) {
    return {
      source: "local_fallback",
      attachmentId,
      items: [],
      total: 0,
      error: {
        code: "ATTACHMENT_ACCESS_LOG_API_UNAVAILABLE",
        message: error?.message ?? String(error),
      },
    };
  }
}

export function createPaymentScreenshotAttachmentInput({ statement, operatorId, remark = "", file = null }) {
  const now = new Date();
  const stamp = now.toISOString().replace(/[-:T.Z]/g, "").slice(0, 14);
  const selectedFileName = typeof file?.name === "string" && file.name.trim() ? file.name.trim() : "";
  const fileName = selectedFileName || `payment-${statement.id}-${stamp}.png`;
  const mimeType = typeof file?.type === "string" && file.type.trim() ? file.type.trim() : "image/png";
  const fileType = inferAttachmentFileType({ mimeType, fileName });
  return {
    ownerType: "statement",
    ownerId: statement.id,
    fileType,
    purpose: "payment_screenshot",
    fileName,
    contentRef: selectedFileName
      ? `p0://payment-screenshot/${statement.id}/${stamp}/${encodeURIComponent(fileName)}`
      : `p0://payment-screenshot/${statement.id}/${stamp}`,
    mimeType,
    fileSize: Number.isFinite(file?.size) ? file.size : undefined,
    contentDataUrl: typeof file?.contentDataUrl === "string" ? file.contentDataUrl : undefined,
    uploadedBy: operatorId,
    remark,
  };
}

export function createStatementCustomerConfirmationAttachmentInput({ statement, operatorId, remark = "", file = null }) {
  const now = new Date();
  const stamp = now.toISOString().replace(/[-:T.Z]/g, "").slice(0, 14);
  const selectedFileName = typeof file?.name === "string" && file.name.trim() ? file.name.trim() : "";
  const fileName = selectedFileName || `customer-confirmation-${statement.id}-${stamp}.png`;
  const mimeType = typeof file?.type === "string" && file.type.trim() ? file.type.trim() : "image/png";
  const fileType = inferAttachmentFileType({ mimeType, fileName });
  return {
    ownerType: "statement",
    ownerId: statement.id,
    fileType,
    purpose: "statement_customer_confirmation",
    fileName,
    contentRef: selectedFileName
      ? `p0://statement-customer-confirmation/${statement.id}/${stamp}/${encodeURIComponent(fileName)}`
      : `p0://statement-customer-confirmation/${statement.id}/${stamp}`,
    mimeType,
    fileSize: Number.isFinite(file?.size) ? file.size : undefined,
    contentDataUrl: typeof file?.contentDataUrl === "string" ? file.contentDataUrl : undefined,
    metadata: {
      statementId: statement.id,
      confirmationPurpose: "customer_statement_confirmation",
    },
    uploadedBy: operatorId,
    remark,
  };
}

export function createPayrollAdjustmentEvidenceAttachmentInput({ payrollRunId, employeeId, operatorId, remark = "", file = null }) {
  const now = new Date();
  const stamp = now.toISOString().replace(/[-:T.Z]/g, "").slice(0, 14);
  const selectedFileName = typeof file?.name === "string" && file.name.trim() ? file.name.trim() : "";
  const fileName = selectedFileName || `payroll-adjustment-${employeeId}-${stamp}.pdf`;
  const mimeType = typeof file?.type === "string" && file.type.trim() ? file.type.trim() : "application/pdf";
  const fileType = inferAttachmentFileType({ mimeType, fileName });
  return {
    ownerType: "payroll_run",
    ownerId: payrollRunId,
    fileType,
    purpose: "payroll_adjustment_evidence",
    fileName,
    contentRef: `p0://payroll-adjustment/${payrollRunId}/${employeeId}/${stamp}/${encodeURIComponent(fileName)}`,
    mimeType,
    fileSize: Number.isFinite(file?.size) ? file.size : undefined,
    contentDataUrl: typeof file?.contentDataUrl === "string" ? file.contentDataUrl : undefined,
    metadata: { payrollRunId, employeeId },
    uploadedBy: operatorId,
    remark,
  };
}

export function createInventoryCorrectionEvidenceAttachmentInput({ correctionDraftId, operatorId, remark = "", file = null }) {
  const ownerId = normalizeAttachmentText(correctionDraftId);
  const now = new Date();
  const stamp = now.toISOString().replace(/[-:T.Z]/g, "").slice(0, 14);
  const selectedFileName = typeof file?.name === "string" && file.name.trim() ? file.name.trim() : "";
  const fileName = selectedFileName || `inventory-correction-${ownerId || "draft"}-${stamp}.jpg`;
  const mimeType = typeof file?.type === "string" && file.type.trim() ? file.type.trim() : "image/jpeg";
  const fileType = inferAttachmentFileType({ mimeType, fileName });
  return {
    ownerType: "inventory_correction",
    ownerId,
    fileType,
    purpose: "inventory_correction_evidence",
    fileName,
    contentRef: selectedFileName
      ? `p0://inventory-correction/${ownerId}/${stamp}/${encodeURIComponent(fileName)}`
      : `p0://inventory-correction/${ownerId}/${stamp}`,
    mimeType,
    fileSize: Number.isFinite(file?.size) ? file.size : undefined,
    contentDataUrl: typeof file?.contentDataUrl === "string" ? file.contentDataUrl : undefined,
    metadata: { correctionDraftId: ownerId, evidencePurpose: "inventory_correction_evidence" },
    uploadedBy: operatorId,
    remark,
  };
}

export function createDeliveryEvidenceAttachmentInput({ task, fulfillmentId, operatorId, evidenceType = "watermark", remark = "", metadata = {}, file = null }) {
  const ownerId = fulfillmentId || task?.fulfillmentId || "";
  const now = new Date();
  const stamp = now.toISOString().replace(/[-:T.Z]/g, "").slice(0, 14);
  const selectedFileName = typeof file?.name === "string" && file.name.trim() ? file.name.trim() : "";
  const purpose = evidenceType === "signature" ? "signature_photo" : "delivery_watermark_photo";
  const prefix = evidenceType === "signature" ? "signature" : "delivery-watermark";
  const fileName = selectedFileName || `${prefix}-${ownerId || "fulfillment"}-${stamp}.jpg`;
  const mimeType = typeof file?.type === "string" && file.type.trim() ? file.type.trim() : "image/jpeg";
  const fileType = inferAttachmentFileType({ mimeType, fileName });
  return {
    ownerType: "fulfillment",
    ownerId,
    fileType,
    purpose,
    fileName,
    contentRef: selectedFileName
      ? `p0://driver-delivery/${ownerId}/${purpose}/${stamp}/${encodeURIComponent(fileName)}`
      : `p0://driver-delivery/${ownerId}/${purpose}/${stamp}`,
    mimeType,
    fileSize: Number.isFinite(file?.size) ? file.size : undefined,
    contentDataUrl: typeof file?.contentDataUrl === "string" ? file.contentDataUrl : undefined,
    metadata: isPlainObject(metadata) ? metadata : {},
    uploadedBy: operatorId,
    remark,
  };
}

export function createFinishedGoodsPhotoAttachmentInput({ productionTaskId, orderLine, operatorId, remark = "", file = null }) {
  const ownerId = String(productionTaskId || orderLine?.productionTaskId || (orderLine?.id ? `PT-${orderLine.id}` : "")).trim();
  const now = new Date();
  const stamp = now.toISOString().replace(/[-:T.Z]/g, "").slice(0, 14);
  const selectedFileName = typeof file?.name === "string" && file.name.trim() ? file.name.trim() : "";
  const fileName = selectedFileName || `finished-goods-${ownerId || orderLine?.id || "production"}-${stamp}.jpg`;
  const mimeType = typeof file?.type === "string" && file.type.trim() ? file.type.trim() : "image/jpeg";
  const fileType = inferAttachmentFileType({ mimeType, fileName });
  return {
    ownerType: "production_task",
    ownerId,
    fileType,
    purpose: "finished_goods_photo",
    fileName,
    contentRef: selectedFileName
      ? `p0://production-finished-goods/${ownerId}/${stamp}/${encodeURIComponent(fileName)}`
      : `p0://production-finished-goods/${ownerId}/${stamp}`,
    mimeType,
    fileSize: Number.isFinite(file?.size) ? file.size : undefined,
    contentDataUrl: typeof file?.contentDataUrl === "string" ? file.contentDataUrl : undefined,
    metadata: {
      productionTaskId: ownerId,
      orderLineId: String(orderLine?.id ?? orderLine?.orderLineId ?? "").trim(),
      purpose: "finished_goods_photo",
    },
    uploadedBy: operatorId,
    remark,
  };
}

export function createMaintenanceEvidenceAttachmentInput({ taskId, operatorId, remark = "", file = null }) {
  const ownerId = normalizeAttachmentText(taskId);
  const now = new Date();
  const stamp = now.toISOString().replace(/[-:T.Z]/g, "").slice(0, 14);
  const selectedFileName = typeof file?.name === "string" && file.name.trim() ? file.name.trim() : "";
  const fileName = selectedFileName || `maintenance-${ownerId || "task"}-${stamp}.jpg`;
  const mimeType = typeof file?.type === "string" && file.type.trim() ? file.type.trim() : "image/jpeg";
  return {
    ownerType: "maintenance_task",
    ownerId,
    fileType: "image",
    purpose: "maintenance_evidence",
    fileName,
    contentRef: selectedFileName
      ? `p0://maintenance/${ownerId}/${stamp}/${encodeURIComponent(fileName)}`
      : `p0://maintenance/${ownerId}/${stamp}`,
    mimeType,
    fileSize: Number.isFinite(file?.size) ? file.size : undefined,
    contentDataUrl: typeof file?.contentDataUrl === "string" ? file.contentDataUrl : undefined,
    metadata: { taskId: ownerId, evidencePurpose: "maintenance_evidence" },
    uploadedBy: operatorId,
    remark,
  };
}

export function createPrintArtworkAttachmentInput({ draftId, draftLine, operatorId, remark = "", file = null }) {
  const draftLineId = normalizeAttachmentText(draftLine?.id ?? draftLine?.draftLineId);
  const normalizedDraftId = normalizeAttachmentText(draftId);
  const ownerId = normalizedDraftId && draftLineId ? `${normalizedDraftId}:${draftLineId}` : normalizedDraftId || draftLineId;
  const selectedFileName = normalizeAttachmentText(file?.name) || `print-artwork-${draftLineId || Date.now()}.pdf`;
  const mimeType = normalizeAttachmentText(file?.type) || "application/octet-stream";
  return {
    ownerType: "order_draft_line",
    ownerId,
    fileType: inferAttachmentFileType({ mimeType, fileName: selectedFileName }),
    purpose: "print_artwork",
    fileName: selectedFileName,
    contentRef: `order-draft-artwork://${encodeURIComponent(ownerId)}/${encodeURIComponent(draftLineId || "line")}/${encodeURIComponent(selectedFileName)}`,
    mimeType,
    fileSize: Number.isFinite(file?.size) ? file.size : undefined,
    file,
    metadata: { draftId: normalizedDraftId, draftLineId, artworkVersion: 1 },
    uploadedBy: operatorId,
    remark,
  };
}

export function createV1FieldEvidenceAttachmentInput({ evidenceItem, operatorId, remark = "", file = null }) {
  const { groupKey, itemKey, ownerId } = getV1FieldEvidenceAttachmentOwner(evidenceItem);
  const now = new Date();
  const stamp = now.toISOString().replace(/[-:T.Z]/g, "").slice(0, 14);
  const selectedFileName = typeof file?.name === "string" && file.name.trim() ? file.name.trim() : "";
  const fileName = selectedFileName || `v1-field-evidence-${groupKey || "group"}-${itemKey || "item"}-${stamp}.pdf`;
  const mimeType = typeof file?.type === "string" && file.type.trim() ? file.type.trim() : "application/pdf";
  const fileType = inferAttachmentFileType({ mimeType, fileName });
  return {
    ownerType: "v1_field_evidence",
    ownerId,
    fileType,
    purpose: "v1_field_evidence",
    fileName,
    contentRef: selectedFileName
      ? `p0://v1-field-evidence/${groupKey || "group"}/${itemKey || "item"}/${stamp}/${encodeURIComponent(fileName)}`
      : `p0://v1-field-evidence/${groupKey || "group"}/${itemKey || "item"}/${stamp}`,
    mimeType,
    fileSize: Number.isFinite(file?.size) ? file.size : undefined,
    contentDataUrl: typeof file?.contentDataUrl === "string" ? file.contentDataUrl : undefined,
    metadata: {
      groupKey,
      itemKey,
      groupLabel: normalizeAttachmentText(evidenceItem?.groupLabel),
      itemLabel: normalizeAttachmentText(evidenceItem?.label ?? evidenceItem?.itemLabel),
      ownerRole: normalizeAttachmentText(evidenceItem?.ownerRole),
      evidencePurpose: "v1_field_evidence",
    },
    uploadedBy: operatorId,
    remark,
  };
}

export function createV1FieldEvidenceAttachmentListInput({ evidenceItem, operatorId } = {}) {
  const { ownerId } = getV1FieldEvidenceAttachmentOwner(evidenceItem);
  return {
    ownerType: "v1_field_evidence",
    ownerId,
    purpose: "v1_field_evidence",
    operatorId,
    localAttachments: [],
  };
}

export function createV1SignoffBoundaryAttachmentInput({ signoffItem, operatorId, remark = "", file = null }) {
  const { type, key, ownerId } = getV1SignoffBoundaryAttachmentOwner(signoffItem);
  const now = new Date();
  const stamp = now.toISOString().replace(/[-:T.Z]/g, "").slice(0, 14);
  const selectedFileName = typeof file?.name === "string" && file.name.trim() ? file.name.trim() : "";
  const fileName = selectedFileName || `v1-${type || "signoff"}-${key || "item"}-${stamp}.pdf`;
  const mimeType = typeof file?.type === "string" && file.type.trim() ? file.type.trim() : "application/pdf";
  const fileType = inferAttachmentFileType({ mimeType, fileName });
  return {
    ownerType: "v1_signoff_boundary",
    ownerId,
    fileType,
    purpose: "v1_signoff_boundary",
    fileName,
    contentRef: selectedFileName
      ? `p0://v1-signoff-boundary/${type || "signoff"}/${key || "item"}/${stamp}/${encodeURIComponent(fileName)}`
      : `p0://v1-signoff-boundary/${type || "signoff"}/${key || "item"}/${stamp}`,
    mimeType,
    fileSize: Number.isFinite(file?.size) ? file.size : undefined,
    contentDataUrl: typeof file?.contentDataUrl === "string" ? file.contentDataUrl : undefined,
    metadata: {
      rowType: type,
      roleKey: key,
      label: normalizeAttachmentText(signoffItem?.label),
      status: normalizeAttachmentText(signoffItem?.status),
      evidencePurpose: "v1_signoff_boundary",
    },
    uploadedBy: operatorId,
    remark,
  };
}

export function createV1SignoffBoundaryAttachmentListInput({ signoffItem, operatorId } = {}) {
  const { ownerId } = getV1SignoffBoundaryAttachmentOwner(signoffItem);
  return {
    ownerType: "v1_signoff_boundary",
    ownerId,
    purpose: "v1_signoff_boundary",
    operatorId,
    localAttachments: [],
  };
}

function getV1FieldEvidenceAttachmentOwner(evidenceItem = {}) {
  const groupKey = normalizeAttachmentText(evidenceItem?.groupKey);
  const itemKey = normalizeAttachmentText(evidenceItem?.key ?? evidenceItem?.itemKey);
  return {
    groupKey,
    itemKey,
    ownerId: [groupKey || "field_evidence", itemKey || "evidence_item"].join(":"),
  };
}

function getV1SignoffBoundaryAttachmentOwner(signoffItem = {}) {
  const type = normalizeAttachmentText(signoffItem?.type) || "signoff";
  const key = normalizeAttachmentText(signoffItem?.key ?? signoffItem?.role) || "owner";
  return {
    type,
    key,
    ownerId: [type, key].join(":"),
  };
}

export function inferAttachmentFileType({ mimeType = "", fileName = "" } = {}) {
  const type = String(mimeType || "").toLowerCase();
  const name = String(fileName || "").toLowerCase();
  if (type.startsWith("image/")) return "image";
  if (type === "application/pdf" || name.endsWith(".pdf")) return "pdf";
  if (
    type.includes("spreadsheet") ||
    type.includes("excel") ||
    type === "text/csv" ||
    /\.(xlsx|xls|csv)$/i.test(name)
  ) {
    return "spreadsheet";
  }
  if (
    type.includes("wordprocessingml") ||
    type.includes("msword") ||
    type.startsWith("text/") ||
    /\.(docx|doc|txt|rtf)$/i.test(name)
  ) {
    return "document";
  }
  return "other";
}

export function getAttachmentPurposeRule(purpose) {
  return getAttachmentUploadPolicy(purpose);
}

function isMimeTypeAllowed(mimeType, rule) {
  if (!mimeType) return true;
  return (
    rule.allowedMimeTypes.includes(mimeType) ||
    rule.allowedMimePrefixes.some((prefix) => mimeType.startsWith(prefix))
  );
}

function inferContentDataUrlMimeType(dataUrl) {
  const match = String(dataUrl ?? "").match(/^data:([^;,]+)?[;,]/);
  return match?.[1] ?? "";
}

function getContentDataUrlByteLength(dataUrl) {
  if (!dataUrl) return undefined;
  const match = String(dataUrl ?? "").match(/^data:([^;,]+)?(;base64)?,(.*)$/s);
  if (!match) return Number.NaN;
  try {
    if (match[2]) {
      const payload = (match[3] ?? "").replace(/\s/g, "");
      const padding = payload.endsWith("==") ? 2 : payload.endsWith("=") ? 1 : 0;
      return Math.max(0, Math.floor(payload.length * 3 / 4) - padding);
    }
    return new Blob([decodeURIComponent(match[3] ?? "")]).size;
  } catch {
    return Number.NaN;
  }
}

function formatAttachmentSize(bytes) {
  const value = Number(bytes);
  if (!Number.isFinite(value)) return "未知大小";
  if (value >= 1024 * 1024) return `${Math.round((value / 1024 / 1024) * 10) / 10}MB`;
  if (value >= 1024) return `${Math.round((value / 1024) * 10) / 10}KB`;
  return `${value}B`;
}

function mapAttachmentAccessUrl(json, options = {}) {
  const accessUrl = json?.accessUrl ?? "";
  return {
    attachmentId: json?.attachmentId ?? "",
    accessUrl,
    absoluteAccessUrl: toAbsoluteAttachmentAccessUrl(accessUrl, options),
    expiresAt: json?.expiresAt ?? "",
    ttlSeconds: Number.isFinite(json?.ttlSeconds) ? json.ttlSeconds : undefined,
    deliveryMode: json?.deliveryMode ?? "",
    storageProvider: json?.storageProvider ?? "",
    storageKeyStored: Boolean(json?.storageKeyStored),
    fileName: json?.fileName ?? "",
    contentType: json?.contentType ?? "",
    operationLogId: json?.operationLogId ?? "",
  };
}

function toAbsoluteAttachmentAccessUrl(accessUrl, options = {}) {
  if (!accessUrl) return "";
  if (accessUrl.startsWith("http")) return accessUrl;
  const apiBaseUrl = getAuthApiBaseUrl(options);
  if (accessUrl.startsWith("/api/") && apiBaseUrl.endsWith("/api")) {
    return `${apiBaseUrl.slice(0, -4)}${accessUrl}`;
  }
  return `${apiBaseUrl}${accessUrl}`;
}

function mapAttachmentAccessLog(json) {
  return {
    logId: json?.logId ?? "",
    attachmentId: json?.attachmentId ?? "",
    operationLogId: json?.operationLogId ?? "",
    action: json?.action ?? "",
    operatorId: json?.operatorId ?? "",
    accessMode: json?.accessMode ?? "",
    deliveryMode: json?.deliveryMode ?? "",
    storageProvider: json?.storageProvider ?? "",
    storageKeyStored: Boolean(json?.storageKeyStored),
    ownerType: json?.ownerType ?? "",
    ownerId: json?.ownerId ?? "",
    purpose: json?.purpose ?? "",
    fileName: json?.fileName ?? "",
    expiresAt: json?.expiresAt ?? "",
    occurredAt: json?.occurredAt ?? "",
  };
}

function mapAttachmentSummary(json) {
  return {
    attachmentId: json?.attachmentId ?? "",
    ownerType: json?.ownerType ?? "",
    ownerId: json?.ownerId ?? "",
    fileType: json?.fileType ?? "",
    purpose: json?.purpose ?? "",
    fileName: json?.fileName ?? "",
    mimeType: json?.mimeType ?? "",
    fileSize: Number.isFinite(json?.fileSize) ? json.fileSize : undefined,
    hasContent: Boolean(json?.hasContent),
    storageProvider: json?.storageProvider ?? "",
    storageKey: "",
    storageKeyStored: Boolean(json?.storageKeyStored),
    contentDigest: json?.contentDigest ?? "",
    thumbnailStorageKey: "",
    thumbnailStored: Boolean(json?.thumbnailStored),
    thumbnailUrl: json?.thumbnailUrl ?? "",
    signedUrlExpiresAt: json?.signedUrlExpiresAt ?? "",
    metadata: isPlainObject(json?.metadata) ? json.metadata : {},
    previewDataUrl: "",
    url: json?.url ?? "",
    status: json?.status ?? "uploaded",
    uploadedBy: json?.uploadedBy ?? "",
    uploadedAt: json?.uploadedAt ?? "",
  };
}

function createLocalAttachmentSummary(input) {
  const attachmentId = `LOCAL-ATT-${Date.now().toString(36).toUpperCase()}`;
  return {
    attachmentId,
    ownerType: input.ownerType,
    ownerId: input.ownerId,
    fileType: input.fileType ?? "image",
    purpose: input.purpose,
    fileName: input.fileName ?? "",
    mimeType: input.mimeType ?? "",
    fileSize: input.fileSize,
    hasContent: Boolean(input.contentDataUrl),
    storageProvider: "local_fallback",
    storageKey: "",
    storageKeyStored: false,
    contentDigest: "",
    thumbnailStorageKey: "",
    thumbnailStored: false,
    metadata: isPlainObject(input.metadata) ? input.metadata : {},
    previewDataUrl: typeof input.contentDataUrl === "string" ? input.contentDataUrl : "",
    url: `local://attachments/${attachmentId}/${encodeURIComponent(input.fileName ?? "attachment")}`,
    status: "uploaded",
    uploadedBy: input.uploadedBy ?? "",
    uploadedAt: new Date().toISOString(),
  };
}

function filterLocalAttachments(attachments, filters) {
  return (Array.isArray(attachments) ? attachments : [])
    .filter((attachment) => !filters.ownerType || attachment.ownerType === filters.ownerType)
    .filter((attachment) => !filters.ownerId || attachment.ownerId === filters.ownerId)
    .filter((attachment) => !filters.purpose || attachment.purpose === filters.purpose)
    .filter((attachment) => !filters.fileType || attachment.fileType === filters.fileType)
    .map((attachment) => mapAttachmentSummary(attachment));
}

function isPlainObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function normalizeAttachmentText(value) {
  return String(value ?? "").trim();
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
    code: json?.code ?? `HTTP_${status}`,
    message: json?.message ?? fallbackMessage,
    requiredPermission: json?.requiredPermission,
  };
}

function buildServerRequiredWriteError(code, error) {
  return {
    source: "api_error",
    blocked: true,
    error: {
      code,
      message: `生产模式要求后端事务，未执行本地降级：${error?.message ?? String(error)}`,
    },
  };
}

function parseJsonSafe(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}
