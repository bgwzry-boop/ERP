export function validateBusinessAttachment({
  workspace,
  attachmentId,
  findAttachment,
  expectedOwnerType,
  expectedOwnerId,
  expectedPurpose,
  expectedUploaderId,
  expectedFileType = "image",
  expectedMimePrefix = "image/",
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

  const status = text(attachment.status || "uploaded");
  const fileType = text(attachment.fileType).toLowerCase();
  const mimeType = text(attachment.mimeType).toLowerCase();
  if (
    status !== "uploaded" ||
    (expectedFileType && fileType && fileType !== expectedFileType) ||
    (expectedMimePrefix && mimeType && !mimeType.startsWith(expectedMimePrefix))
  ) {
    return failure(`${errorCodePrefix}_INVALID`, `The ${label} is not an active ${expectedFileType} upload.`);
  }

  return { ok: true, attachment };
}

function failure(errorCode, message) {
  return { ok: false, statusCode: 422, errorCode, message };
}

function text(value) {
  return String(value ?? "").trim();
}
