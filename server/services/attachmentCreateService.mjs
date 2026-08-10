import { createHash } from "node:crypto";
import {
  getAttachmentFileExtension,
  getAttachmentUploadPolicy,
} from "../../shared/attachmentUploadPolicy.js";

const requiredAttachmentFields = [
  "ownerType",
  "ownerId",
  "fileType",
  "purpose",
  "fileName",
  "contentRef",
  "uploadedBy",
];

export function createAttachmentCommandService(dependencies = {}) {
  const { parseDataUrl, buildOperationLog, nextId } = dependencies;
  for (const [name, value] of Object.entries({ parseDataUrl, buildOperationLog, nextId })) {
    if (typeof value !== "function") throw new TypeError(`${name} must be a function`);
  }

  return {
    createAttachment({ workspace, body = {}, operatorId, contentPayload = null }) {
      return createAttachmentRecord({
        workspace,
        body: { ...body, uploadedBy: operatorId },
        contentPayload,
        parseDataUrl,
        buildOperationLog,
        nextId,
      });
    },
  };
}

export async function createAttachmentRecord({
  workspace,
  body = {},
  contentPayload: providedContentPayload = null,
  parseDataUrl,
  buildOperationLog,
  nextId,
  now = () => new Date(),
}) {
  const missingFields = requiredAttachmentFields.filter((field) => !normalizeText(body[field]));
  if (missingFields.length) {
    return validationFailure(`Missing attachment fields: ${missingFields.join(", ")}`);
  }

  const contentDataUrl = typeof body.contentDataUrl === "string" ? body.contentDataUrl.trim() : "";
  const contentPayload = normalizeProvidedContentPayload(providedContentPayload) ?? (contentDataUrl ? parseDataUrl(contentDataUrl) : null);
  if (contentDataUrl && !contentPayload) {
    return validationFailure("contentDataUrl must be a valid data URL");
  }

  const validationError = validateAttachmentUploadBody(body, contentPayload);
  if (validationError) {
    return {
      ok: false,
      statusCode: 422,
      errorCode: validationError.code,
      message: validationError.message,
    };
  }

  const attachmentId = buildAttachmentRecordId(workspace, body.idempotencyKey, nextId);
  const uploadedAt = new Date(typeof now === "function" ? now() : now).toISOString();
  const contentUrl = `/api/attachments/${encodeURIComponent(attachmentId)}/content`;
  const contentDigest = contentPayload ? createHash("sha256").update(contentPayload.buffer).digest("hex") : "";
  const effectiveMimeType = normalizeText(body.mimeType || contentPayload?.contentType);
  const effectiveFileType = inferAttachmentFileType({
    mimeType: effectiveMimeType,
    fileName: body.fileName,
    fallbackFileType: body.fileType,
  });
  const existingAttachment = contentDigest
    ? await workspace.attachmentRepository.findAttachmentByDigest({
        workspace,
        ownerType: body.ownerType,
        ownerId: body.ownerId,
        purpose: body.purpose,
        contentDigest,
      })
    : null;
  const storedContent = contentPayload && !existingAttachment
    ? await workspace.attachmentObjectStorage.putObject({
        attachmentId,
        fileName: body.fileName,
        contentPayload,
        contentDigest,
      })
    : null;
  const attachment = {
    attachmentId,
    ownerType: body.ownerType,
    ownerId: body.ownerId,
    fileType: effectiveFileType || body.fileType,
    purpose: body.purpose,
    url: contentPayload ? contentUrl : `local://attachments/${attachmentId}/${encodeURIComponent(body.fileName)}`,
    status: "uploaded",
    uploadedBy: body.uploadedBy,
    uploadedAt,
    fileName: body.fileName,
    contentRef: body.contentRef,
    mimeType: effectiveMimeType,
    fileSize: Number.isFinite(Number(body.fileSize)) ? Number(body.fileSize) : contentPayload?.buffer.length,
    contentDataUrl: storedContent ? "" : contentDataUrl,
    storageProvider: storedContent?.storageProvider ?? "",
    storageKey: storedContent?.storageKey ?? "",
    contentDigest: storedContent?.contentDigest ?? contentDigest,
    hasContent: Boolean(contentPayload),
    metadata: body.metadata && typeof body.metadata === "object" && !Array.isArray(body.metadata) ? body.metadata : {},
    remark: body.remark ?? "",
  };
  const attachmentLink = {
    id: `ALINK-${attachmentId}`,
    attachmentId,
    ownerType: body.ownerType,
    ownerId: body.ownerId,
    purpose: body.purpose,
    createdAt: uploadedAt,
  };
  const operationLog = buildOperationLog(workspace, {
    id: buildAttachmentOperationLogId(workspace, body.idempotencyKey, attachmentId, nextId),
    targetType: body.ownerType,
    targetId: body.ownerId,
    action: "create_attachment",
    operatorId: body.uploadedBy,
    after: {
      attachmentId,
      purpose: body.purpose,
      fileName: body.fileName,
      contentDigest,
    },
    reason: body.remark,
  });
  const transaction = await workspace.attachmentRepository.createAttachment({
    workspace,
    attachment,
    link: attachmentLink,
    operationLog,
    idempotencyKey: body.idempotencyKey,
    idempotencyPayload: body,
  });

  return {
    ok: true,
    attachment: transaction.attachment,
    deduplicated: transaction.deduplicated,
    duplicateOfAttachmentId: transaction.deduplicated ? transaction.attachment.attachmentId : "",
    operationLogId: transaction.operationLogId,
  };
}

export function validateAttachmentUploadBody(body = {}, contentPayload = null) {
  const purpose = normalizeText(body.purpose);
  const mimeType = normalizeText(body.mimeType || contentPayload?.contentType).toLowerCase();
  const fileName = normalizeText(body.fileName);
  const fileType = inferAttachmentFileType({
    mimeType,
    fileName,
    fallbackFileType: body.fileType,
  });
  const declaredSize = Number(body.fileSize);
  const actualSize = Buffer.isBuffer(contentPayload?.buffer) ? contentPayload.buffer.length : undefined;
  const effectiveSize = Number.isFinite(actualSize)
    ? actualSize
    : Number.isFinite(declaredSize)
      ? declaredSize
      : 0;
  if (contentPayload && effectiveSize <= 0) {
    return {
      code: "ATTACHMENT_CONTENT_EMPTY",
      message: "附件内容为空，请重新选择文件后上传。",
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

  if ((rule.allowedMimePrefixes.length || rule.allowedMimeTypes.length) && mimeType) {
    const allowedMime =
      rule.allowedMimeTypes.includes(mimeType) ||
      rule.allowedMimePrefixes.some((prefix) => mimeType.startsWith(prefix));
    if (!allowedMime) {
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

  if (rule.requiresContent && !contentPayload) {
    return {
      code: "ATTACHMENT_CONTENT_REQUIRED",
      message: `${rule.label} requires an uploaded file.`,
    };
  }

  return null;
}

export function inferAttachmentFileType({ mimeType = "", fileName = "", fallbackFileType = "" } = {}) {
  const type = normalizeText(mimeType).toLowerCase();
  const name = normalizeText(fileName).toLowerCase();
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
  return normalizeText(fallbackFileType) || "other";
}

export function getAttachmentPurposeRule(purpose) {
  return getAttachmentUploadPolicy(purpose);
}

function normalizeProvidedContentPayload(value) {
  if (!value || !Buffer.isBuffer(value.buffer)) return null;
  return {
    buffer: value.buffer,
    contentType: normalizeText(value.contentType) || "application/octet-stream",
  };
}

function buildAttachmentRecordId(workspace, idempotencyKey, nextId) {
  const key = normalizeText(idempotencyKey);
  if (!key) return nextId("ATT", workspace.attachments);
  return `ATT-${createHash("sha256").update(key).digest("hex").slice(0, 24).toUpperCase()}`;
}

function buildAttachmentOperationLogId(workspace, idempotencyKey, attachmentId, nextId) {
  return normalizeText(idempotencyKey) ? `LOG-${attachmentId}` : nextId("LOG", workspace.operationLogs);
}

function validationFailure(message) {
  return {
    ok: false,
    statusCode: 422,
    errorCode: "VALIDATION_ERROR",
    message,
  };
}

function normalizeText(value) {
  return String(value ?? "").trim();
}

function formatAttachmentSize(bytes) {
  const value = Number(bytes);
  if (!Number.isFinite(value)) return "未知大小";
  if (value >= 1024 * 1024) return `${Math.round((value / 1024 / 1024) * 10) / 10}MB`;
  if (value >= 1024) return `${Math.round((value / 1024) * 10) / 10}KB`;
  return `${value}B`;
}
