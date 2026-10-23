import { resolveStoreMode } from "./storeMode.mjs";
import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync } from "node:fs";
import { dirname, join } from "node:path";
import { createPostgresPoolClient } from "./postgresPoolClient.mjs";
import { createPostgresParameterBinder } from "./postgresSqlParameters.mjs";

export const attachmentAccessAuditStoreKey = "metadata/attachment-access-logs.json";

export function createAttachmentAccessAuditRepository(options = {}) {
  const mode = resolveStoreMode({
    explicitMode: options.mode,
    envKeys: ["ERP_ATTACHMENT_ACCESS_AUDIT_STORE", "ERP_ATTACHMENT_STORE"],
    runtimeMode: options.runtimeMode,
    allowLocalFixture: options.allowLocalFixture,
  });
  if (mode === "postgres") {
    return createPostgresAttachmentAccessAuditRepository({
      databaseUrl:
        options.databaseUrl ??
        process.env.ERP_ATTACHMENT_ACCESS_AUDIT_DATABASE_URL ??
        process.env.ERP_ATTACHMENT_DATABASE_URL ??
        process.env.DATABASE_URL ??
        process.env.PGURL,
      queryJson: options.queryJson,
      postgresClient: options.postgresClient,
    });
  }
  if (mode === "local") {
    return createLocalAttachmentAccessAuditRepository({ storageRoot: options.storageRoot });
  }
  throw new Error(`Unsupported attachment access-audit repository mode: ${mode}`);
}

export function createLocalAttachmentAccessAuditRepository(options = {}) {
  const storageRoot = options.storageRoot ?? getLocalStorageRoot();

  return {
    kind: "local_json",

    loadState() {
      return loadPersistentAttachmentAccessAuditState(storageRoot);
    },

    recordAccessLog({ workspace, accessLog }) {
      const normalized = normalizeAttachmentAccessLog(accessLog);
      if (!normalized) {
        throw new Error("Invalid attachment access log record");
      }
      if (workspace.attachmentAccessLogs.some(log => log.logId === normalized.logId)) {
        throw new Error("Attachment access audit identity already exists");
      }
      const nextLogs = [normalized, ...workspace.attachmentAccessLogs];
      persistPersistentAttachmentAccessAuditState(storageRoot, { ...workspace, attachmentAccessLogs: nextLogs });
      workspace.attachmentAccessLogs = nextLogs;
      return normalized;
    },

    listAccessLogs({ workspace, attachmentId, limit = 50 }) {
      const items = [...filterAccessLogs(workspace.attachmentAccessLogs, { attachmentId })];
      if (items.some(item => !Number.isFinite(Date.parse(item.occurredAt)))) {
        throw new Error("Attachment access audit list contains invalid occurrence time");
      }
      items.sort((left, right) => Date.parse(right.occurredAt) - Date.parse(left.occurredAt)
        || (left.logId < right.logId ? 1 : left.logId > right.logId ? -1 : 0));
      return {
        items: items.slice(0, clampLimit(limit)),
        total: items.length,
      };
    },
  };
}

export function createPostgresAttachmentAccessAuditRepository(options = {}) {
  const postgresClient = options.postgresClient ?? (options.queryJson ? null : createPostgresPoolClient(options));
  const queryJson =
    options.queryJson ??
    ((text, values) => postgresClient.queryJson(text, values));

  return {
    kind: "postgres",

    async loadState() {
      return { attachmentAccessLogs: [] };
    },

    async recordAccessLog({ workspace, accessLog }) {
      const query = buildInsertAttachmentAccessLogQuery(accessLog);
      const saved = normalizeAttachmentAccessLog(await queryJson(query.text, query.values));
      if (!saved) {
        throw new Error("PostgreSQL attachment access-log insert returned an invalid record");
      }
      workspace.attachmentAccessLogs.unshift(saved);
      return saved;
    },

    async listAccessLogs({ attachmentId, limit = 50 }) {
      const query = buildListAttachmentAccessLogsQuery({ attachmentId, limit });
      const result = normalizeAttachmentAccessLogListResponse(await queryJson(query.text, query.values));
      if (result.items.some(item => item.attachmentId !== attachmentId)) {
        throw new Error("Attachment access audit list belongs to another attachment");
      }
      return result;
    },
  };
}

export function buildInsertAttachmentAccessLogSql(accessLog) {
  return buildInsertAttachmentAccessLogQuery(accessLog).text;
}

export function buildInsertAttachmentAccessLogQuery(accessLog) {
  const parameters = createPostgresParameterBinder();
  return {
    text: buildInsertAttachmentAccessLogText(accessLog, parameters),
    values: parameters.values,
  };
}

function buildInsertAttachmentAccessLogText(accessLog, parameters) {
  return `
INSERT INTO attachment_access_logs (
  id,
  attachment_id,
  operation_log_id,
  action,
  operator_id,
  access_mode,
  delivery_mode,
  storage_provider,
  storage_key,
  owner_type,
  owner_id,
  purpose,
  file_name,
  content_type,
  expires_at,
  metadata_json,
  occurred_at,
  created_at
) VALUES (
  ${parameters.text(accessLog.logId)},
  ${parameters.text(accessLog.attachmentId)},
  ${parameters.text(accessLog.operationLogId ?? accessLog.logId)},
  ${parameters.text(accessLog.action)},
  ${parameters.text(accessLog.operatorId)},
  ${parameters.text(accessLog.accessMode ?? "")},
  ${parameters.text(accessLog.deliveryMode ?? "")},
  ${parameters.text(accessLog.storageProvider ?? "")},
  ${parameters.text(accessLog.storageKey ?? "")},
  ${parameters.text(accessLog.ownerType ?? "")},
  ${parameters.text(accessLog.ownerId ?? "")},
  ${parameters.text(accessLog.purpose ?? "")},
  ${parameters.text(accessLog.fileName ?? "")},
  ${parameters.text(accessLog.contentType ?? "")},
  ${parameters.nullableTimestamp(accessLog.expiresAt)},
  ${parameters.json(accessLog.metadata ?? {})},
  ${parameters.timestamp(accessLog.occurredAt)},
  now()
)
RETURNING ${attachmentAccessLogJsonExpression("attachment_access_logs")} AS result;
`.trim();
}

export function buildListAttachmentAccessLogsSql({ attachmentId, limit = 50 } = {}) {
  return buildListAttachmentAccessLogsQuery({ attachmentId, limit }).text;
}

export function buildListAttachmentAccessLogsQuery({ attachmentId, limit = 50 } = {}) {
  const parameters = createPostgresParameterBinder();
  const safeLimit = parameters.integer(clampLimit(limit));
  return {
    text: `
WITH matched AS (
  SELECT *
  FROM attachment_access_logs
  WHERE attachment_id = ${parameters.text(attachmentId)}
),
paged AS (
  SELECT *
  FROM matched
  ORDER BY occurred_at DESC, id DESC
  LIMIT ${safeLimit}
)
SELECT json_build_object(
  'items', COALESCE(json_agg(${attachmentAccessLogJsonExpression("paged")} ORDER BY paged.occurred_at DESC, paged.id DESC), '[]'::json),
  'total', (SELECT COUNT(*) FROM matched)
) AS result
FROM paged;
`.trim(),
    values: parameters.values,
  };
}

export function normalizeAttachmentAccessLogListResponse(value) {
  const records = Array.isArray(value) ? value : value?.items;
  const items = normalizeAttachmentAccessLogs(records);
  const total = Array.isArray(value) ? items.length : value?.total;
  if (!Array.isArray(records) || items.length !== records.length ||
    new Set(items.map(item => item.logId)).size !== items.length ||
    !Number.isSafeInteger(total) || total < items.length) {
    throw new Error("Invalid attachment access audit list response");
  }
  return { items, total };
}

export function normalizeAttachmentAccessLogs(value) {
  if (!Array.isArray(value)) return [];
  return value.map((record) => normalizeAttachmentAccessLog(record)).filter(Boolean);
}

export function normalizeAttachmentAccessLog(record) {
  if (!record || typeof record !== "object") return null;
  const logId = String(record.logId ?? record.id ?? "").trim();
  const attachmentId = String(record.attachmentId ?? record.attachment_id ?? "").trim();
  const action = String(record.action ?? "").trim();
  const operatorId = String(record.operatorId ?? record.operator_id ?? "").trim();
  if (!logId || !attachmentId || !action || !operatorId) return null;
  return {
    logId,
    attachmentId,
    operationLogId: String(record.operationLogId ?? record.operation_log_id ?? logId).trim(),
    action,
    operatorId,
    accessMode: String(record.accessMode ?? record.access_mode ?? "").trim(),
    deliveryMode: String(record.deliveryMode ?? record.delivery_mode ?? "").trim(),
    storageProvider: String(record.storageProvider ?? record.storage_provider ?? "").trim(),
    storageKey: String(record.storageKey ?? record.storage_key ?? "").trim(),
    ownerType: String(record.ownerType ?? record.owner_type ?? "").trim(),
    ownerId: String(record.ownerId ?? record.owner_id ?? "").trim(),
    purpose: String(record.purpose ?? "").trim(),
    fileName: String(record.fileName ?? record.file_name ?? "").trim(),
    contentType: String(record.contentType ?? record.content_type ?? "").trim(),
    expiresAt: String(record.expiresAt ?? record.expires_at ?? "").trim(),
    occurredAt: String(record.occurredAt ?? record.occurred_at ?? "").trim(),
  };
}

function loadPersistentAttachmentAccessAuditState(storageRoot) {
  const filePath = join(storageRoot, attachmentAccessAuditStoreKey);
  if (!existsSync(filePath)) {
    return { attachmentAccessLogs: [] };
  }
  const json = JSON.parse(readFileSync(filePath, "utf8"));
  if (json?.version !== 1 || !Array.isArray(json.attachmentAccessLogs)) {
    throw new Error("Invalid attachment access audit snapshot");
  }
  const logs = normalizeAttachmentAccessLogs(json.attachmentAccessLogs);
  if (logs.length !== json.attachmentAccessLogs.length || new Set(logs.map(log => log.logId)).size !== logs.length) {
    throw new Error("Attachment access audit snapshot contains invalid or duplicate records");
  }
  return { attachmentAccessLogs: logs };
}

function persistPersistentAttachmentAccessAuditState(storageRoot, workspace) {
  const sourceLogs = workspace.attachmentAccessLogs;
  const logs = normalizeAttachmentAccessLogs(sourceLogs);
  if (!Array.isArray(sourceLogs) || logs.length !== sourceLogs.length || new Set(logs.map(log => log.logId)).size !== logs.length) {
    throw new Error("Attachment access audit write contains invalid or duplicate records");
  }
  const filePath = join(storageRoot, attachmentAccessAuditStoreKey);
  mkdirSync(dirname(filePath), { recursive: true, mode: 0o700 });
  writeFileSync(
    `${filePath}.tmp`,
    `${JSON.stringify(
      {
        version: 1,
        updatedAt: new Date().toISOString(),
        attachmentAccessLogs: logs,
      },
      null,
      2,
    )}\n`,
    { mode: 0o600 },
  );
  renameSync(`${filePath}.tmp`, filePath);
}

function filterAccessLogs(accessLogs, filters = {}) {
  const attachmentId = String(filters.attachmentId ?? "").trim();
  let items = Array.isArray(accessLogs) ? accessLogs : [];
  if (attachmentId) items = items.filter((item) => item.attachmentId === attachmentId);
  return items;
}

function attachmentAccessLogJsonExpression(alias) {
  return `json_build_object(
    'logId', ${alias}.id,
    'attachmentId', ${alias}.attachment_id,
    'operationLogId', ${alias}.operation_log_id,
    'action', ${alias}.action,
    'operatorId', ${alias}.operator_id,
    'accessMode', ${alias}.access_mode,
    'deliveryMode', ${alias}.delivery_mode,
    'storageProvider', ${alias}.storage_provider,
    'storageKey', ${alias}.storage_key,
    'ownerType', ${alias}.owner_type,
    'ownerId', ${alias}.owner_id,
    'purpose', ${alias}.purpose,
    'fileName', ${alias}.file_name,
    'contentType', ${alias}.content_type,
    'expiresAt', ${alias}.expires_at,
    'occurredAt', ${alias}.occurred_at
  )`;
}

function clampLimit(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 50;
  return Math.max(1, Math.min(100, Math.trunc(number)));
}

function getLocalStorageRoot() {
  return process.env.ERP_LOCAL_STORAGE_DIR ?? join(process.cwd(), ".erp-local-storage");
}
