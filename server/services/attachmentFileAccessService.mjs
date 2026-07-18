export function createAttachmentFileAccessService({ addOperationLog, nextId, now = () => new Date().toISOString() } = {}) {
  requireFunction(addOperationLog, "addOperationLog");
  requireFunction(nextId, "nextId");

  return {
    createAccessUrl,
    getContent,
    listAccessLogs,
    listAttachments,
    toAttachmentSummary,
  };

  async function listAttachments({ workspace, filters = {} }) {
    requireMethod(workspace.attachmentRepository, "listAttachments", "workspace.attachmentRepository");
    const items = await workspace.attachmentRepository.listAttachments({ workspace, filters });
    return { items: items.map(toAttachmentSummary) };
  }

  async function createAccessUrl({ workspace, attachmentId, ttlSeconds, operatorId }) {
    const attachment = await findAttachment(workspace, attachmentId);
    if (!attachment) return notFound("ATTACHMENT_NOT_FOUND");
    if (!attachment.hasContent) return notFound("ATTACHMENT_CONTENT_NOT_FOUND");
    requireMethod(workspace.attachmentObjectStorage, "createAccessUrl", "workspace.attachmentObjectStorage");
    const safeTtlSeconds = clampNumber(Number(ttlSeconds ?? 900), 60, 3600);
    const access = await workspace.attachmentObjectStorage.createAccessUrl({
      attachmentId,
      storageKey: attachment.storageKey,
      ttlSeconds: safeTtlSeconds,
    });
    const operationLogId = await recordAccessLog(workspace, {
      attachment,
      action: "attachment_access_url_created",
      operatorId,
      accessMode: "permission",
      deliveryMode: access.deliveryMode,
      expiresAt: access.expiresAt,
    });

    return {
      response: {
        attachmentId,
        accessUrl: access.accessUrl,
        expiresAt: access.expiresAt,
        ttlSeconds: safeTtlSeconds,
        deliveryMode: access.deliveryMode,
        storageProvider: attachment.storageProvider || "",
        storageKeyStored: Boolean(attachment.storageKey),
        fileName: attachment.fileName || "",
        contentType: attachment.mimeType || "application/octet-stream",
        operationLogId,
      },
    };
  }

  async function listAccessLogs({ workspace, attachmentId, limit }) {
    const attachment = await findAttachment(workspace, attachmentId);
    if (!attachment) return notFound("ATTACHMENT_NOT_FOUND");
    requireMethod(workspace.attachmentAccessAuditRepository, "listAccessLogs", "workspace.attachmentAccessAuditRepository");
    const safeLimit = clampNumber(Number(limit ?? 50), 1, 100);
    const accessLogs = await workspace.attachmentAccessAuditRepository.listAccessLogs({
      workspace,
      attachmentId,
      limit: safeLimit,
    });
    return {
      response: {
        attachmentId,
        items: (accessLogs.items ?? []).map(toAccessLogSummary),
        total: Number(accessLogs.total ?? 0),
      },
    };
  }

  async function getContent({ workspace, attachmentId, operatorId, accessMode }) {
    const attachment = await findAttachment(workspace, attachmentId);
    if (!attachment) return notFound("ATTACHMENT_NOT_FOUND");
    requireMethod(workspace.attachmentObjectStorage, "readObject", "workspace.attachmentObjectStorage");
    const contentPayload = await workspace.attachmentObjectStorage.readObject({ attachment });
    if (!contentPayload) return notFound("ATTACHMENT_CONTENT_NOT_FOUND");
    const signedUrlAccess = accessMode === "signed_url";
    const contentType = attachment.mimeType || contentPayload.contentType || "application/octet-stream";
    await recordAccessLog(workspace, {
      attachment,
      action: "attachment_content_read",
      operatorId: signedUrlAccess ? "SIGNED_URL" : operatorId,
      accessMode: signedUrlAccess ? "signed_url" : "permission",
      deliveryMode: signedUrlAccess ? "api_proxy_signed_url" : "api_permission",
      contentType,
    });
    return {
      file: {
        body: contentPayload.buffer,
        options: {
          contentType,
          fileName: attachment.fileName || `${attachment.attachmentId}.bin`,
        },
      },
    };
  }

  async function findAttachment(workspace, attachmentId) {
    requireMethod(workspace.attachmentRepository, "findAttachmentById", "workspace.attachmentRepository");
    return workspace.attachmentRepository.findAttachmentById({ workspace, attachmentId });
  }

  async function recordAccessLog(workspace, input) {
    const operationLogId = addOperationLog(workspace, {
      targetType: "attachment",
      targetId: input.attachment.attachmentId,
      action: input.action,
      operatorId: input.operatorId,
      after: {
        ownerType: input.attachment.ownerType,
        ownerId: input.attachment.ownerId,
        purpose: input.attachment.purpose,
        fileName: input.attachment.fileName,
        storageProvider: input.attachment.storageProvider,
        storageKeyStored: Boolean(input.attachment.storageKey),
        accessMode: input.accessMode,
        deliveryMode: input.deliveryMode,
        expiresAt: input.expiresAt ?? "",
        contentType: input.contentType ?? input.attachment.mimeType ?? "",
      },
    });
    const operationLog = (workspace.operationLogs ?? []).find((log) => log.id === operationLogId);
    requireMethod(workspace.attachmentAccessAuditRepository, "recordAccessLog", "workspace.attachmentAccessAuditRepository");
    await workspace.attachmentAccessAuditRepository.recordAccessLog({
      workspace,
      accessLog: {
        logId: nextId("ALOG", workspace.attachmentAccessLogs ?? []),
        attachmentId: input.attachment.attachmentId,
        operationLogId,
        action: input.action,
        operatorId: input.operatorId,
        accessMode: input.accessMode,
        deliveryMode: input.deliveryMode,
        storageProvider: input.attachment.storageProvider,
        storageKey: input.attachment.storageKey,
        ownerType: input.attachment.ownerType,
        ownerId: input.attachment.ownerId,
        purpose: input.attachment.purpose,
        fileName: input.attachment.fileName,
        contentType: input.contentType ?? input.attachment.mimeType ?? "",
        expiresAt: input.expiresAt ?? "",
        occurredAt: operationLog?.occurredAt ?? now(),
      },
    });
    return operationLogId;
  }
}

function toAttachmentSummary(attachment) {
  return {
    attachmentId: attachment.attachmentId,
    ownerType: attachment.ownerType,
    ownerId: attachment.ownerId,
    fileType: attachment.fileType,
    purpose: attachment.purpose,
    fileName: attachment.fileName,
    mimeType: attachment.mimeType,
    fileSize: attachment.fileSize,
    url: attachment.url,
    hasContent: attachment.hasContent,
    storageProvider: attachment.storageProvider,
    storageKeyStored: Boolean(attachment.storageKey),
    contentDigest: attachment.contentDigest,
    thumbnailStored: Boolean(attachment.thumbnailStorageKey),
    thumbnailUrl: attachment.thumbnailUrl,
    signedUrlExpiresAt: attachment.signedUrlExpiresAt,
    metadata: isPlainObject(attachment.metadata) ? attachment.metadata : {},
    status: attachment.status,
    uploadedBy: attachment.uploadedBy,
    uploadedAt: attachment.uploadedAt,
  };
}

function toAccessLogSummary(accessLog) {
  return {
    logId: accessLog.logId,
    attachmentId: accessLog.attachmentId,
    operationLogId: accessLog.operationLogId,
    action: accessLog.action,
    operatorId: accessLog.operatorId,
    accessMode: accessLog.accessMode,
    deliveryMode: accessLog.deliveryMode,
    storageProvider: accessLog.storageProvider,
    storageKeyStored: Boolean(accessLog.storageKey),
    ownerType: accessLog.ownerType,
    ownerId: accessLog.ownerId,
    purpose: accessLog.purpose,
    fileName: accessLog.fileName,
    contentType: accessLog.contentType,
    expiresAt: accessLog.expiresAt,
    occurredAt: accessLog.occurredAt,
  };
}

function clampNumber(value, min, max) {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, Math.floor(value)));
}

function isPlainObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function notFound(code) {
  return { notFound: true, code };
}

function requireMethod(owner, methodName, ownerName) {
  if (typeof owner?.[methodName] !== "function") {
    throw new TypeError(`${ownerName}.${methodName} must be a function`);
  }
}

function requireFunction(value, name) {
  if (typeof value !== "function") throw new TypeError(`${name} must be a function`);
}
