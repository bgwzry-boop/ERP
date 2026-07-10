import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { createPostgresPoolClient } from "./postgresPoolClient.mjs";
import { createPostgresParameterBinder } from "./postgresSqlParameters.mjs";

export const attachmentAccessAuditStoreKey = "metadata/attachment-access-logs.json";

export function createAttachmentAccessAuditRepository(options = {}) {
  const mode =
    options.mode ??
    process.env.ERP_ATTACHMENT_ACCESS_AUDIT_STORE ??
    process.env.ERP_ATTACHMENT_STORE ??
    "local";
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
      workspace.attachmentAccessLogs.unshift(normalized);
      persistPersistentAttachmentAccessAuditState(storageRoot, workspace);
      return normalized;
    },

    listAccessLogs({ workspace, attachmentId, limit = 50 }) {
      const items = filterAccessLogs(workspace.attachmentAccessLogs, { attachmentId });
      return {
        items: items.slice(0, limit),
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
      return normalizeAttachmentAccessLogListResponse(
        await queryJson(query.text, query.values),
      );
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
ON CONFLICT (id) DO UPDATE SET
  attachment_id = EXCLUDED.attachment_id,
  operation_log_id = EXCLUDED.operation_log_id,
  action = EXCLUDED.action,
  operator_id = EXCLUDED.operator_id,
  access_mode = EXCLUDED.access_mode,
  delivery_mode = EXCLUDED.delivery_mode,
  storage_provider = EXCLUDED.storage_provider,
  storage_key = EXCLUDED.storage_key,
  owner_type = EXCLUDED.owner_type,
  owner_id = EXCLUDED.owner_id,
  purpose = EXCLUDED.purpose,
  file_name = EXCLUDED.file_name,
  content_type = EXCLUDED.content_type,
  expires_at = EXCLUDED.expires_at,
  metadata_json = EXCLUDED.metadata_json,
  occurred_at = EXCLUDED.occurred_at
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
  if (Array.isArray(value)) {
    const items = normalizeAttachmentAccessLogs(value);
    return { items, total: items.length };
  }
  const items = normalizeAttachmentAccessLogs(value?.items);
  const total = Number(value?.total);
  return {
    items,
    total: Number.isFinite(total) ? total : items.length,
  };
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
  try {
    const content = readFileSync(filePath, "utf8");
    const json = JSON.parse(content);
    return {
      attachmentAccessLogs: normalizeAttachmentAccessLogs(json?.attachmentAccessLogs),
    };
  } catch {
    return { attachmentAccessLogs: [] };
  }
}

function persistPersistentAttachmentAccessAuditState(storageRoot, workspace) {
  const filePath = join(storageRoot, attachmentAccessAuditStoreKey);
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(
    filePath,
    `${JSON.stringify(
      {
        version: 1,
        updatedAt: new Date().toISOString(),
        attachmentAccessLogs: normalizeAttachmentAccessLogs(workspace.attachmentAccessLogs),
      },
      null,
      2,
    )}\n`,
  );
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
