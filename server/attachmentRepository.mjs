import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { createPostgresPoolClient } from "./postgresPoolClient.mjs";
import { createPostgresParameterBinder } from "./postgresSqlParameters.mjs";
import { createPostgresTransactionExecutor } from "./postgresTransactionExecutor.mjs";

export const attachmentRecordStoreKey = "metadata/attachment-records.json";

export function createAttachmentRepository(options = {}) {
  const mode = options.mode ?? process.env.ERP_ATTACHMENT_STORE ?? "local";
  if (mode === "postgres") {
    return createPostgresAttachmentRepository({
      databaseUrl: options.databaseUrl ?? process.env.ERP_ATTACHMENT_DATABASE_URL ?? process.env.DATABASE_URL ?? process.env.PGURL,
      queryJson: options.queryJson,
      transactionJson: options.transactionJson,
      postgresClient: options.postgresClient,
    });
  }
  if (mode === "local") {
    return createLocalAttachmentRepository({
      storageRoot: options.storageRoot,
    });
  }
  throw new Error(`Unsupported attachment repository mode: ${mode}`);
}

export function createLocalAttachmentRepository(options = {}) {
  const storageRoot = options.storageRoot ?? getLocalStorageRoot();

  return {
    kind: "local_json",

    loadState() {
      return loadPersistentAttachmentState(storageRoot);
    },

    createAttachment({ workspace, attachment, link }) {
      workspace.attachments.unshift(attachment);
      workspace.attachmentLinks.unshift(link);
      persistPersistentAttachmentState(storageRoot, workspace);
      return attachment;
    },

    listAttachments({ workspace, filters = {} }) {
      return filterAttachments(workspace.attachments, filters);
    },

    findAttachmentById({ workspace, attachmentId }) {
      return workspace.attachments.find((item) => item.attachmentId === attachmentId) ?? null;
    },
  };
}

export function createPostgresAttachmentRepository(options = {}) {
  const postgresClient =
    options.postgresClient ?? (options.queryJson || options.transactionJson ? null : createPostgresPoolClient(options));
  const queryJson =
    options.queryJson ??
    ((text, values) => postgresClient.queryJson(text, values));
  const { transactionJson } = createPostgresTransactionExecutor(options);

  return {
    kind: "postgres",

    async loadState() {
      const query = buildListAttachmentsQuery({});
      return {
        attachments: normalizeAttachmentList(await queryJson(query.text, query.values)),
        attachmentLinks: [],
      };
    },

    async createAttachment({ workspace, attachment, link }) {
      const query = buildInsertAttachmentQuery(attachment, link);
      const savedAttachment = normalizePersistentAttachment(
        (await transactionJson(query.text, query.values)) ?? attachment,
      );
      if (!savedAttachment) {
        throw new Error("PostgreSQL attachment insert returned an invalid attachment record");
      }
      workspace.attachments.unshift(savedAttachment);
      workspace.attachmentLinks.unshift(link);
      return savedAttachment;
    },

    async listAttachments({ filters = {} }) {
      const query = buildListAttachmentsQuery(filters);
      return normalizeAttachmentList(await queryJson(query.text, query.values));
    },

    async findAttachmentById({ attachmentId }) {
      const query = buildFindAttachmentQuery(attachmentId);
      return normalizePersistentAttachment(await queryJson(query.text, query.values));
    },
  };
}

export function buildInsertAttachmentSql(attachment, link) {
  return buildInsertAttachmentQuery(attachment, link).text;
}

export function buildInsertAttachmentQuery(attachment, link) {
  const parameters = createPostgresParameterBinder();
  return {
    text: buildInsertAttachmentText(attachment, link, parameters),
    values: parameters.values,
  };
}

function buildInsertAttachmentText(attachment, link, parameters) {
  const metadataJson = {
    ...normalizeAttachmentMetadata(attachment.metadata),
    remark: attachment.remark ?? "",
  };
  return `
WITH inserted_attachment AS (
  INSERT INTO attachments (
    id,
    file_name,
    file_type,
    purpose,
    mime_type,
    file_size_bytes,
    has_content,
    storage_provider,
    storage_key,
    storage_url,
    content_ref,
    content_digest,
    thumbnail_storage_key,
    thumbnail_url,
    signed_url_expires_at,
    metadata_json,
    status,
    uploaded_by,
    uploaded_at,
    updated_at
  ) VALUES (
    ${parameters.text(attachment.attachmentId)},
    ${parameters.text(attachment.fileName)},
    ${parameters.text(attachment.fileType)},
    ${parameters.text(attachment.purpose)},
    ${parameters.text(attachment.mimeType ?? "")},
    ${parameters.nullableNumber(attachment.fileSize)},
    ${parameters.boolean(attachment.hasContent)},
    ${parameters.text(attachment.storageProvider ?? "")},
    ${parameters.text(attachment.storageKey ?? "")},
    ${parameters.text(attachment.url ?? "")},
    ${parameters.nullableText(attachment.contentRef)},
    ${parameters.text(attachment.contentDigest ?? "")},
    ${parameters.text(attachment.thumbnailStorageKey ?? "")},
    ${parameters.text(attachment.thumbnailUrl ?? "")},
    ${parameters.nullableTimestamp(attachment.signedUrlExpiresAt)},
    ${parameters.json(metadataJson)},
    ${parameters.text(attachment.status ?? "uploaded")},
    ${parameters.text(attachment.uploadedBy ?? "")},
    ${parameters.timestamp(attachment.uploadedAt)},
    now()
  )
  ON CONFLICT (id) DO UPDATE SET
    file_name = EXCLUDED.file_name,
    file_type = EXCLUDED.file_type,
    purpose = EXCLUDED.purpose,
    mime_type = EXCLUDED.mime_type,
    file_size_bytes = EXCLUDED.file_size_bytes,
    has_content = EXCLUDED.has_content,
    storage_provider = EXCLUDED.storage_provider,
    storage_key = EXCLUDED.storage_key,
    storage_url = EXCLUDED.storage_url,
    content_ref = EXCLUDED.content_ref,
    content_digest = EXCLUDED.content_digest,
    thumbnail_storage_key = EXCLUDED.thumbnail_storage_key,
    thumbnail_url = EXCLUDED.thumbnail_url,
    signed_url_expires_at = EXCLUDED.signed_url_expires_at,
    metadata_json = EXCLUDED.metadata_json,
    status = EXCLUDED.status,
    uploaded_by = EXCLUDED.uploaded_by,
    uploaded_at = EXCLUDED.uploaded_at,
    updated_at = now()
  RETURNING *
),
inserted_link AS (
  INSERT INTO attachment_links (
    id,
    attachment_id,
    owner_type,
    owner_id,
    purpose,
    created_at
  ) VALUES (
    ${parameters.text(link.id)},
    ${parameters.text(link.attachmentId)},
    ${parameters.text(link.ownerType)},
    ${parameters.text(link.ownerId)},
    ${parameters.text(link.purpose ?? "")},
    ${parameters.timestamp(link.createdAt)}
  )
  ON CONFLICT (attachment_id, owner_type, owner_id, purpose) DO UPDATE SET
    created_at = attachment_links.created_at
  RETURNING *
)
SELECT ${attachmentJsonExpression("a", "l")} AS result
FROM inserted_attachment a
LEFT JOIN inserted_link l ON l.attachment_id = a.id
LIMIT 1;
`.trim();
}

export function buildListAttachmentsSql(filters = {}) {
  return buildListAttachmentsQuery(filters).text;
}

export function buildListAttachmentsQuery(filters = {}) {
  const parameters = createPostgresParameterBinder();
  const where = buildAttachmentWhereClause(filters, parameters);
  return {
    text: `
SELECT COALESCE(json_agg(row_result.record ORDER BY row_result.uploaded_sort DESC, row_result.id_sort DESC), '[]'::json) AS result
FROM (
  SELECT
    ${attachmentJsonExpression("a", "l")} AS record,
    a.uploaded_at AS uploaded_sort,
    a.id AS id_sort
  FROM attachments a
  LEFT JOIN attachment_links l ON l.attachment_id = a.id
  ${where}
) row_result;
`.trim(),
    values: parameters.values,
  };
}

export function buildFindAttachmentSql(attachmentId) {
  return buildFindAttachmentQuery(attachmentId).text;
}

export function buildFindAttachmentQuery(attachmentId) {
  const parameters = createPostgresParameterBinder();
  return {
    text: `
SELECT ${attachmentJsonExpression("a", "l")} AS result
FROM attachments a
LEFT JOIN attachment_links l ON l.attachment_id = a.id
WHERE a.id = ${parameters.text(attachmentId)}
ORDER BY l.created_at DESC NULLS LAST
LIMIT 1;
`.trim(),
    values: parameters.values,
  };
}

export function normalizePersistentAttachments(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((record) => normalizePersistentAttachment(record))
    .filter(Boolean);
}

export function normalizePersistentAttachment(record) {
  if (!record || typeof record !== "object") return null;
  const attachmentId = String(record.attachmentId ?? "").trim();
  const ownerType = String(record.ownerType ?? "").trim();
  const ownerId = String(record.ownerId ?? "").trim();
  const fileName = String(record.fileName ?? "").trim();
  if (!attachmentId || !ownerType || !ownerId || !fileName) return null;
  const storageKey = String(record.storageKey ?? "").trim();
  const storageProvider = String(record.storageProvider ?? "").trim();
  const fileSize = Number(record.fileSize);
  return {
    attachmentId,
    ownerType,
    ownerId,
    fileType: String(record.fileType ?? "").trim(),
    purpose: String(record.purpose ?? "").trim(),
    url: String(record.url ?? "").trim(),
    status: String(record.status ?? "uploaded").trim() || "uploaded",
    uploadedBy: String(record.uploadedBy ?? "").trim(),
    uploadedAt: String(record.uploadedAt ?? "").trim(),
    fileName,
    contentRef: String(record.contentRef ?? "").trim(),
    mimeType: String(record.mimeType ?? "").trim(),
    fileSize: Number.isFinite(fileSize) ? fileSize : undefined,
    contentDataUrl: String(record.contentDataUrl ?? "").trim(),
    storageProvider,
    storageKey: isSafeAttachmentStorageKey(storageKey) ? storageKey : "",
    contentDigest: String(record.contentDigest ?? "").trim(),
    thumbnailStorageKey: String(record.thumbnailStorageKey ?? "").trim(),
    thumbnailUrl: String(record.thumbnailUrl ?? "").trim(),
    signedUrlExpiresAt: String(record.signedUrlExpiresAt ?? "").trim(),
    hasContent: Boolean(record.hasContent),
    remark: String(record.remark ?? "").trim(),
    metadata: normalizeAttachmentMetadata(record.metadata),
  };
}

export function normalizePersistentAttachmentLinks(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((record) => {
      if (!record || typeof record !== "object") return null;
      const id = String(record.id ?? "").trim();
      const attachmentId = String(record.attachmentId ?? "").trim();
      const ownerType = String(record.ownerType ?? "").trim();
      const ownerId = String(record.ownerId ?? "").trim();
      if (!id || !attachmentId || !ownerType || !ownerId) return null;
      return {
        id,
        attachmentId,
        ownerType,
        ownerId,
        purpose: String(record.purpose ?? "").trim(),
        createdAt: String(record.createdAt ?? "").trim(),
      };
    })
    .filter(Boolean);
}

function loadPersistentAttachmentState(storageRoot) {
  const filePath = join(storageRoot, attachmentRecordStoreKey);
  if (!existsSync(filePath)) {
    return { attachments: [], attachmentLinks: [] };
  }
  try {
    const content = readFileSync(filePath, "utf8");
    const json = JSON.parse(content);
    return {
      attachments: normalizePersistentAttachments(json?.attachments),
      attachmentLinks: normalizePersistentAttachmentLinks(json?.attachmentLinks),
    };
  } catch {
    return { attachments: [], attachmentLinks: [] };
  }
}

function persistPersistentAttachmentState(storageRoot, workspace) {
  const filePath = join(storageRoot, attachmentRecordStoreKey);
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(
    filePath,
    `${JSON.stringify(
      {
        version: 1,
        updatedAt: new Date().toISOString(),
        attachments: normalizePersistentAttachments(workspace.attachments),
        attachmentLinks: normalizePersistentAttachmentLinks(workspace.attachmentLinks),
      },
      null,
      2,
    )}\n`,
  );
}

function filterAttachments(attachments, filters = {}) {
  let items = Array.isArray(attachments) ? attachments : [];
  items = filterByValue(items, filters.ownerType, "ownerType");
  items = filterByValue(items, filters.ownerId, "ownerId");
  items = filterByValue(items, filters.purpose, "purpose");
  items = filterByValue(items, filters.fileType, "fileType");
  items = filterByKeyword(items, filters.keyword, ["attachmentId", "fileName", "ownerId", "purpose", "uploadedBy"]);
  return items;
}

function filterByValue(items, value, field) {
  const normalized = String(value ?? "").trim();
  if (!normalized) return items;
  return items.filter((item) => String(item?.[field] ?? "") === normalized);
}

function filterByKeyword(items, keyword, fields) {
  const normalized = String(keyword ?? "").trim().toLowerCase();
  if (!normalized) return items;
  return items.filter((item) =>
    fields.some((field) => String(item?.[field] ?? "").toLowerCase().includes(normalized)),
  );
}

function normalizeAttachmentList(value) {
  const rows = Array.isArray(value) ? value : [];
  return rows.map((record) => normalizePersistentAttachment(record)).filter(Boolean);
}

function buildAttachmentWhereClause(filters = {}, parameters) {
  const clauses = [];
  if (filters.ownerType) clauses.push(`l.owner_type = ${parameters.text(filters.ownerType)}`);
  if (filters.ownerId) clauses.push(`l.owner_id = ${parameters.text(filters.ownerId)}`);
  if (filters.purpose) clauses.push(`COALESCE(l.purpose, a.purpose) = ${parameters.text(filters.purpose)}`);
  if (filters.fileType) clauses.push(`a.file_type = ${parameters.text(filters.fileType)}`);
  if (filters.keyword) {
    const keyword = parameters.text(buildAttachmentKeywordPattern(filters.keyword));
    clauses.push(
      `(a.id ILIKE ${keyword} ESCAPE '\\' OR a.file_name ILIKE ${keyword} ESCAPE '\\' OR l.owner_id ILIKE ${keyword} ESCAPE '\\' OR a.purpose ILIKE ${keyword} ESCAPE '\\' OR a.uploaded_by ILIKE ${keyword} ESCAPE '\\')`,
    );
  }
  return clauses.length ? `WHERE ${clauses.join("\n    AND ")}` : "";
}

function attachmentJsonExpression(attachmentAlias, linkAlias) {
  return `json_build_object(
      'attachmentId', ${attachmentAlias}.id,
      'ownerType', COALESCE(${linkAlias}.owner_type, ''),
      'ownerId', COALESCE(${linkAlias}.owner_id, ''),
      'fileType', ${attachmentAlias}.file_type,
      'purpose', COALESCE(${linkAlias}.purpose, ${attachmentAlias}.purpose),
      'fileName', ${attachmentAlias}.file_name,
      'mimeType', ${attachmentAlias}.mime_type,
      'fileSize', ${attachmentAlias}.file_size_bytes,
      'url', ${attachmentAlias}.storage_url,
      'hasContent', ${attachmentAlias}.has_content,
      'storageProvider', ${attachmentAlias}.storage_provider,
      'storageKey', ${attachmentAlias}.storage_key,
      'contentDigest', ${attachmentAlias}.content_digest,
      'thumbnailStorageKey', ${attachmentAlias}.thumbnail_storage_key,
      'thumbnailUrl', ${attachmentAlias}.thumbnail_url,
      'signedUrlExpiresAt', ${attachmentAlias}.signed_url_expires_at,
      'status', ${attachmentAlias}.status,
      'uploadedBy', ${attachmentAlias}.uploaded_by,
      'uploadedAt', ${attachmentAlias}.uploaded_at,
      'contentRef', ${attachmentAlias}.content_ref,
      'remark', COALESCE(${attachmentAlias}.metadata_json->>'remark', ''),
      'metadata', COALESCE(${attachmentAlias}.metadata_json, '{}'::jsonb)
    )`;
}

function normalizeAttachmentMetadata(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => String(key ?? "").trim())
      .map(([key, entryValue]) => [String(key), normalizeAttachmentMetadataValue(entryValue)]),
  );
}

function normalizeAttachmentMetadataValue(value) {
  if (value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value;
  if (Array.isArray(value)) return value.map((item) => normalizeAttachmentMetadataValue(item));
  if (value && typeof value === "object") return normalizeAttachmentMetadata(value);
  return String(value ?? "");
}

function buildAttachmentKeywordPattern(value) {
  const escaped = String(value ?? "")
    .replaceAll("\\", "\\\\")
    .replaceAll("%", "\\%")
    .replaceAll("_", "\\_");
  return `%${escaped}%`;
}

function isSafeAttachmentStorageKey(storageKey) {
  if (!storageKey || storageKey.startsWith("/") || storageKey.startsWith("\\") || storageKey.includes("\0")) {
    return false;
  }
  return !storageKey.split(/[\\/]+/).includes("..");
}

function getLocalStorageRoot() {
  return process.env.ERP_LOCAL_STORAGE_DIR ?? join(process.cwd(), ".erp-local-storage");
}
