export function validateBusinessAttachment({
  workspace,
  attachmentId,
  findAttachment,
  expectedOwnerType,
  expectedOwnerId,
  expectedPurpose,
  expectedUploaderId,
  requireUploader = false,
  expectedFileType = "image",
  expectedMimePrefix = "image/",
  allowedFileTypes,
  allowedMimePrefixes,
  allowedMimeTypes = [],
  requireContent = true,
  requirePositiveSize = false,
  maxBytes = null,
  allowedStatuses = ["uploaded"],
  validateUploader,
  errorCodePrefix = "BUSINESS_ATTACHMENT",
  label = "business attachment",
} = {}) {
  if (typeof findAttachment !== "function") throw new TypeError("findAttachment must be a function");
  const attachment = findAttachment(workspace, text(attachmentId));
  if (!attachment) return failure(`${errorCodePrefix}_NOT_FOUND`, `The ${label} does not exist.`);

  if (
    text(attachment.ownerType) !== text(expectedOwnerType) ||
    text(attachment.ownerId) !== text(expectedOwnerId)
  ) {
    return failure(`${errorCodePrefix}_OWNER_MISMATCH`, `The ${label} does not belong to this business record.`);
  }
  if (text(attachment.purpose) !== text(expectedPurpose)) {
    return failure(`${errorCodePrefix}_PURPOSE_MISMATCH`, `The ${label} purpose is invalid.`);
  }
  if (expectedUploaderId !== undefined && text(attachment.uploadedBy) !== text(expectedUploaderId)) {
    return failure(
      `${errorCodePrefix}_UPLOADER_MISMATCH`,
      `The ${label} was not uploaded by the authenticated operator.`,
    );
  }
  if (expectedUploaderId === undefined && requireUploader && !text(attachment.uploadedBy)) {
    return failure(`${errorCodePrefix}_UPLOADER_REQUIRED`, `The ${label} has no authenticated uploader.`);
  }
  if (typeof validateUploader === "function" && !validateUploader(text(attachment.uploadedBy), attachment)) {
    return failure(`${errorCodePrefix}_UPLOADER_INVALID`, `The ${label} uploader is not an authenticated allowed operator.`);
  }

  const status = text(attachment.status || "uploaded");
  const fileType = text(attachment.fileType).toLowerCase();
  const mimeType = text(attachment.mimeType).toLowerCase();
  const fileTypes = normalizedList(allowedFileTypes ?? [expectedFileType]);
  const mimePrefixes = normalizedList(allowedMimePrefixes ?? [expectedMimePrefix]);
  const mimeTypes = normalizedList(allowedMimeTypes);
  const mimeAllowed =
    (!mimePrefixes.length && !mimeTypes.length) ||
    Boolean(
      mimeType &&
        (mimeTypes.includes(mimeType) || mimePrefixes.some((prefix) => mimeType.startsWith(prefix))),
    );
  const fileSize = Number(attachment.fileSize ?? attachment.fileSizeBytes ?? 0);
  if (
    !normalizedList(allowedStatuses).includes(status.toLowerCase()) ||
    (requireContent && attachment.hasContent !== true) ||
    (requirePositiveSize && (!Number.isFinite(fileSize) || fileSize <= 0)) ||
    (Number.isFinite(Number(maxBytes)) && Number(maxBytes) > 0 && fileSize > Number(maxBytes)) ||
    (fileTypes.length && !fileTypes.includes(fileType)) ||
    !mimeAllowed
  ) {
    return failure(`${errorCodePrefix}_INVALID`, `The ${label} is not an active allowed file upload.`);
  }

  return { ok: true, attachment };
}

function failure(errorCode, message) {
  return { ok: false, statusCode: 422, errorCode, message };
}

function text(value) {
  return String(value ?? "").trim();
}

function normalizedList(value) {
  return [...new Set((Array.isArray(value) ? value : []).map((item) => text(item).toLowerCase()).filter(Boolean))];
}
