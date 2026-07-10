import { createAttachmentObjectStorage } from "./attachmentObjectStorage.mjs";

const defaultStatementExportKeyPrefix = "statement-exports";
const defaultStatementExportContentType = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

export function createStatementExportObjectStorage(options = {}) {
  const mode = options.mode ?? process.env.ERP_STATEMENT_EXPORT_OBJECT_STORAGE ?? "local_fs";
  const keyPrefix = normalizeObjectKeyPrefix(
    options.keyPrefix ?? process.env.ERP_STATEMENT_EXPORT_OBJECT_STORAGE_KEY_PREFIX ?? defaultStatementExportKeyPrefix,
  );
  const storage = createAttachmentObjectStorage(buildAttachmentStorageOptions({ ...options, mode, keyPrefix }));

  return {
    kind: storage.kind,
    provider: storage.provider,
    configured: storage.configured,
    missingFields: storage.missingFields,

    async putExportFile({ exportFile }) {
      const exportFileId = getExportStorageId(exportFile);
      const buffer = exportContentToBuffer(exportFile);
      const stored = await storage.putObject({
        attachmentId: exportFileId,
        fileName: exportFile?.fileName || `${exportFileId}.xlsx`,
        contentPayload: {
          contentType: exportFile?.contentType || defaultStatementExportContentType,
          buffer,
        },
      });
      return {
        storageProvider: stored.storageProvider,
        storageKey: stored.storageKey,
        contentDigest: normalizeContentDigest(stored.contentDigest),
        contentLength: buffer.length,
      };
    },

    async readExportFile({ exportFile }) {
      if (!exportFile?.storageProvider || !exportFile?.storageKey || exportFile.storageProvider === "database") {
        return null;
      }
      const payload = await storage.readObject({
        attachment: {
          attachmentId: getExportStorageId(exportFile),
          storageProvider: exportFile.storageProvider,
          storageKey: exportFile.storageKey,
          mimeType: exportFile.contentType || defaultStatementExportContentType,
        },
      });
      if (!payload?.buffer) return null;
      return {
        contentType: payload.contentType || exportFile.contentType || defaultStatementExportContentType,
        buffer: payload.buffer,
      };
    },

    async deleteExportFile({ storageKey }) {
      if (typeof storage.deleteObject !== "function") {
        return {
          storageProvider: storage.kind,
          deleted: false,
          reason: "delete not supported",
        };
      }
      return storage.deleteObject({ storageKey });
    },
  };
}

export function normalizeContentDigest(value) {
  const digest = String(value ?? "").trim();
  if (!digest) return "";
  return digest.startsWith("sha256:") ? digest : `sha256:${digest}`;
}

function exportContentToBuffer(exportFile) {
  if (Buffer.isBuffer(exportFile?.content)) return exportFile.content;
  if (exportFile?.content instanceof Uint8Array) return Buffer.from(exportFile.content);
  if (exportFile?.content instanceof ArrayBuffer) return Buffer.from(exportFile.content);
  const content = String(exportFile?.content ?? "");
  return exportFile?.contentEncoding === "base64" ? Buffer.from(content, "base64") : Buffer.from(content, "utf8");
}

function buildAttachmentStorageOptions(options) {
  const storageOptions = {
    ...options,
    localKeyPrefix: options.keyPrefix,
    keyPrefix: options.keyPrefix,
  };
  applyStatementStorageEnvFallback(storageOptions, "provider", "ERP_STATEMENT_EXPORT_OBJECT_STORAGE_PROVIDER");
  applyStatementStorageEnvFallback(storageOptions, "endpoint", "ERP_STATEMENT_EXPORT_OBJECT_STORAGE_ENDPOINT");
  applyStatementStorageEnvFallback(storageOptions, "bucket", "ERP_STATEMENT_EXPORT_OBJECT_STORAGE_BUCKET");
  applyStatementStorageEnvFallback(storageOptions, "region", "ERP_STATEMENT_EXPORT_OBJECT_STORAGE_REGION");
  applyStatementStorageEnvFallback(
    storageOptions,
    "accessKeyId",
    "ERP_STATEMENT_EXPORT_OBJECT_STORAGE_ACCESS_KEY_ID",
  );
  applyStatementStorageEnvFallback(
    storageOptions,
    "secretAccessKey",
    "ERP_STATEMENT_EXPORT_OBJECT_STORAGE_SECRET_ACCESS_KEY",
  );
  applyStatementStorageEnvFallback(
    storageOptions,
    "sessionToken",
    "ERP_STATEMENT_EXPORT_OBJECT_STORAGE_SESSION_TOKEN",
  );
  applyStatementStorageEnvFallback(
    storageOptions,
    "forcePathStyle",
    "ERP_STATEMENT_EXPORT_OBJECT_STORAGE_FORCE_PATH_STYLE",
  );
  return storageOptions;
}

function applyStatementStorageEnvFallback(target, optionName, envName) {
  if (target[optionName] !== undefined) return;
  if (process.env[envName] !== undefined) target[optionName] = process.env[envName];
}

function getExportStorageId(exportFile) {
  return String(exportFile?.exportFileId ?? exportFile?.downloadToken ?? "").trim() || "statement-export";
}

function normalizeObjectKeyPrefix(value) {
  return String(value ?? "")
    .trim()
    .replace(/^\/+|\/+$/g, "");
}
