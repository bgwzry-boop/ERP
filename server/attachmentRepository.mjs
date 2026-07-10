import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { createPostgresPoolClient } from "./postgresPoolClient.mjs";
import { createPostgresParameterBinder } from "./postgresSqlParameters.mjs";
import { createPostgresTransactionExecutor } from "./postgresTransactionExecutor.mjs";
import { buildPostgresIdempotencyRequest, resolveRepositoryIdempotencyKey } from "./idempotency.mjs";

export const attachmentRecordStoreKey = "metadata/attachment-records.json";

export function createAttachmentRepository(options = {}) {
  const mode = options.mode ?? process.env.ERP_ATTACHMENT_STORE ?? "local";
  if (mode === "postgres") {
    return createPostgresAttachmentRepository({
      databaseUrl: options.databaseUrl ?? process.env.ERP_ATTACHMENT_DATABASE_URL ?? process.env.DATABASE_URL ?? process.env.PGURL,
      queryJson: options.queryJson,
      transactionJson: options.transactionJson,
      idempotentTransactionJson: options.idempotentTransactionJson,
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

    createAttachment({ workspace, attachment, link, operationLog }) {
      const existing = findAttachmentByDigestInMemory(workspace.attachments, attachment);
      const result = {
        attachment: existing ?? attachment,
        deduplicated: Boolean(existing),
        operationLogId: operationLog?.id ?? "",
      };
      applyAttachmentCreateWorkspaceMutation({ workspace, result, link, operationLog });
      persistPersistentAttachmentState(storageRoot, workspace);
      return result;
    },

    listAttachments({ workspace, filters = {} }) {
      return filterAttachments(workspace.attachments, filters);
    },

    findAttachmentById({ workspace, attachmentId }) {
      return workspace.attachments.find((item) => item.attachmentId === attachmentId) ?? null;
    },

    findAttachmentByDigest({ workspace, ownerType, ownerId, purpose, contentDigest }) {
      return findAttachmentByDigestInMemory(workspace.attachments, { ownerType, ownerId, purpose, contentDigest });
    },
  };
}

export function createPostgresAttachmentRepository(options = {}) {
  const postgresClient =
    options.postgresClient ??
    (options.queryJson || options.transactionJson || options.idempotentTransactionJson
      ? null
      : createPostgresPoolClient(options));
  const queryJson =
    options.queryJson ??
    ((text, values) => postgresClient.queryJson(text, values));
  const { transactionJson, idempotentTransactionJson } = createPostgresTransactionExecutor(options);

  return {
    kind: "postgres",

    async loadState() {
      const query = buildListAttachmentsQuery({});
      return {
        attachments: normalizeAttachmentList(await queryJson(query.text, query.values)),
        attachmentLinks: [],
      };
    },

    async createAttachment(input) {
      const query = buildInsertAttachmentQuery(input.attachment, input.link, input.operationLog);
      const idempotencyKey = String(input.idempotencyKey ?? "").trim();
      const value = idempotencyKey
        ? await idempotentTransactionJson(
            buildPostgresIdempotencyRequest({
              scope: "attachment.create",
              idempotencyKey: resolveRepositoryIdempotencyKey(idempotencyKey, input.operationLog?.id),
              payload: input.idempotencyPayload ?? {
                attachment: input.attachment,
                link: input.link,
              },
              operatorId: input.operationLog?.operatorId,
              targetType: input.attachment?.ownerType,
              targetId: input.attachment?.ownerId,
              resourceLocks: buildAttachmentCreateResourceLocks(input.attachment),
              query,
            }),
          )
        : await transactionJson(query.text, query.values);
      const result = normalizeAttachmentCreateResult(value, input.attachment, input.operationLog);
      if (!result.attachment) {
        throw new Error("PostgreSQL attachment insert returned an invalid attachment record");
      }
      applyAttachmentCreateWorkspaceMutation({
        workspace: input.workspace,
        result,
        link: input.link,
        operationLog: input.operationLog,
      });
      return result;
    },

    async listAttachments({ filters = {} }) {
      const query = buildListAttachmentsQuery(filters);
      return normalizeAttachmentList(await queryJson(query.text, query.values));
    },

    async findAttachmentById({ attachmentId }) {
      const query = buildFindAttachmentQuery(attachmentId);
      return normalizePersistentAttachment(await queryJson(query.text, query.values));
    },

    async findAttachmentByDigest({ ownerType, ownerId, purpose, contentDigest }) {
      const query = buildFindAttachmentByDigestQuery({ ownerType, ownerId, purpose, contentDigest });
      return normalizePersistentAttachment(await queryJson(query.text, query.values));
    },
  };
}

export function buildInsertAttachmentSql(attachment, link, operationLog) {
  return buildInsertAttachmentQuery(attachment, link, operationLog).text;
}

export function buildInsertAttachmentQuery(attachment, link, operationLog) {
  assertAttachmentContentDigest(attachment?.contentDigest);
  const parameters = createPostgresParameterBinder();
  return {
    text: buildInsertAttachmentText(attachment, link, operationLog, parameters),
    values: parameters.values,
  };
}

function buildInsertAttachmentText(attachment, link, operationLog, parameters) {
  const normalizedOperationLog = normalizeAttachmentOperationLog(operationLog, attachment);
  const metadataJson = {
    ...normalizeAttachmentMetadata(attachment.metadata),
    remark: attachment.remark ?? "",
  };
  return `
WITH existing_dedup AS MATERIALIZED (
  SELECT attachment_id
  FROM attachment_content_dedup_keys
  WHERE owner_type = ${parameters.text(attachment.ownerType)}
    AND owner_id = ${parameters.text(attachment.ownerId)}
    AND purpose = ${parameters.text(attachment.purpose)}
    AND content_digest = ${parameters.text(attachment.contentDigest ?? "")}
    AND ${parameters.text(attachment.contentDigest ?? "")} <> ''
),
inserted_attachment AS (
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
  )
  SELECT
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
  WHERE NOT EXISTS (SELECT 1 FROM existing_dedup)
  ON CONFLICT (id) DO NOTHING
  RETURNING *
),
attachment_write_guard AS MATERIALIZED (
  SELECT erp_require(
    (SELECT COUNT(*) FROM existing_dedup) = 1 OR (SELECT COUNT(*) FROM inserted_attachment) = 1,
    'ERP_ATTACHMENT_ID_CONCURRENCY_CONFLICT'
  ) AS ok
),
inserted_dedup AS (
  INSERT INTO attachment_content_dedup_keys (
    owner_type,
    owner_id,
    purpose,
    content_digest,
    attachment_id,
    created_at
  )
  SELECT
    ${parameters.text(attachment.ownerType)},
    ${parameters.text(attachment.ownerId)},
    ${parameters.text(attachment.purpose)},
    ${parameters.text(attachment.contentDigest ?? "")},
    inserted_attachment.id,
    now()
  FROM inserted_attachment
  WHERE ${parameters.text(attachment.contentDigest ?? "")} <> ''
  ON CONFLICT (owner_type, owner_id, purpose, content_digest) DO UPDATE SET
    attachment_id = attachment_content_dedup_keys.attachment_id
  RETURNING attachment_id
),
selected_attachment AS MATERIALIZED (
  SELECT attachment_id, true AS deduplicated
  FROM existing_dedup
  UNION ALL
  SELECT COALESCE(
    (SELECT attachment_id FROM inserted_dedup LIMIT 1),
    inserted_attachment.id
  ), false AS deduplicated
  FROM inserted_attachment
  LIMIT 1
),
selected_attachment_record AS MATERIALIZED (
  SELECT inserted_attachment.*
  FROM inserted_attachment
  JOIN selected_attachment ON selected_attachment.attachment_id = inserted_attachment.id
  UNION ALL
  SELECT attachments.*
  FROM attachments
  JOIN selected_attachment ON selected_attachment.attachment_id = attachments.id
  WHERE NOT EXISTS (
    SELECT 1
    FROM inserted_attachment
    WHERE inserted_attachment.id = selected_attachment.attachment_id
  )
),
removed_unclaimed_attachment AS (
  DELETE FROM attachments
  USING inserted_attachment, selected_attachment
  WHERE attachments.id = inserted_attachment.id
    AND inserted_attachment.id <> selected_attachment.attachment_id
  RETURNING attachments.id
),
inserted_link AS (
  INSERT INTO attachment_links (
    id,
    attachment_id,
    owner_type,
    owner_id,
    purpose,
    created_at
  )
  SELECT
    ${parameters.text(link.id)},
    selected_attachment.attachment_id,
    ${parameters.text(link.ownerType)},
    ${parameters.text(link.ownerId)},
    ${parameters.text(link.purpose ?? "")},
    ${parameters.timestamp(link.createdAt)}
  FROM selected_attachment
  ON CONFLICT (attachment_id, owner_type, owner_id, purpose) DO UPDATE SET
    created_at = attachment_links.created_at
  RETURNING *
),
inserted_operation_log AS (
  INSERT INTO operation_logs (
    id,
    target_type,
    target_id,
    action,
    before_json,
    after_json,
    reason,
    operator_id,
    page_key,
    occurred_at,
    created_at
  )
  SELECT
    ${parameters.text(normalizedOperationLog.id)},
    ${parameters.text(normalizedOperationLog.targetType)},
    ${parameters.text(normalizedOperationLog.targetId)},
    CASE WHEN selected_attachment.deduplicated THEN 'reuse_attachment_digest' ELSE ${parameters.text(normalizedOperationLog.action)} END,
    ${parameters.json(normalizedOperationLog.before)},
    jsonb_build_object(
      'attachmentId', selected_attachment.attachment_id,
      'purpose', ${parameters.text(attachment.purpose)},
      'fileName', selected_attachment_record.file_name,
      'contentDigest', selected_attachment_record.content_digest,
      'deduplicated', selected_attachment.deduplicated
    ),
    ${parameters.text(normalizedOperationLog.reason)},
    ${parameters.nullableText(normalizedOperationLog.operatorId)},
    ${parameters.text(normalizedOperationLog.pageKey)},
    ${parameters.timestamp(normalizedOperationLog.occurredAt)},
    ${parameters.timestamp(normalizedOperationLog.createdAt)}
  FROM selected_attachment
  JOIN selected_attachment_record ON selected_attachment_record.id = selected_attachment.attachment_id
  ON CONFLICT (id) DO NOTHING
  RETURNING id
),
operation_log_write_guard AS MATERIALIZED (
  SELECT erp_require(
    (SELECT COUNT(*) FROM inserted_operation_log) = 1,
    'ERP_ATTACHMENT_OPERATION_LOG_ID_CONCURRENCY_CONFLICT'
  ) AS ok
)
SELECT json_build_object(
  'attachment', ${attachmentJsonExpression("a", "l")},
  'deduplicated', selected_attachment.deduplicated,
  'operationLogId', (SELECT id FROM inserted_operation_log),
  'writeGuard', (SELECT ok FROM attachment_write_guard),
  'operationLogWriteGuard', (SELECT ok FROM operation_log_write_guard),
  'removedUnclaimedCount', (SELECT COUNT(*) FROM removed_unclaimed_attachment)
) AS result
FROM selected_attachment
JOIN selected_attachment_record a ON a.id = selected_attachment.attachment_id
LEFT JOIN inserted_link l ON l.attachment_id = a.id
LIMIT 1;
`.trim();
}

export function buildListAttachmentsSql(filters = {}) {
  return buildListAttachmentsQuery(filters).text;
}

export function buildListAttachmentsQuery(filters = {}) {
  const parameters = createPostgresParameterBinder();
  const where = buildAttachmentWhereClause(filters, parameters, [
    "(dedup.attachment_id IS NULL OR dedup.attachment_id = a.id)",
  ]);
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
  LEFT JOIN attachment_content_dedup_keys dedup
    ON dedup.owner_type = l.owner_type
    AND dedup.owner_id = l.owner_id
    AND dedup.purpose = COALESCE(l.purpose, a.purpose)
    AND dedup.content_digest = a.content_digest
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

export function buildFindAttachmentByDigestSql(input = {}) {
  return buildFindAttachmentByDigestQuery(input).text;
}

export function buildFindAttachmentByDigestQuery({ ownerType, ownerId, purpose, contentDigest } = {}) {
  const parameters = createPostgresParameterBinder();
  return {
    text: `
SELECT ${attachmentJsonExpression("attachment", "link")} AS result
FROM attachment_content_dedup_keys AS dedup
JOIN attachments AS attachment ON attachment.id = dedup.attachment_id
JOIN attachment_links AS link
  ON link.attachment_id = attachment.id
  AND link.owner_type = dedup.owner_type
  AND link.owner_id = dedup.owner_id
  AND link.purpose = dedup.purpose
WHERE dedup.owner_type = ${parameters.text(ownerType)}
  AND dedup.owner_id = ${parameters.text(ownerId)}
  AND dedup.purpose = ${parameters.text(purpose)}
  AND dedup.content_digest = ${parameters.text(contentDigest)}
LIMIT 1;
`.trim(),
    values: parameters.values,
  };
}

export function normalizeAttachmentCreateResult(value, fallbackAttachment = null, fallbackOperationLog = null) {
  const source = value && typeof value === "object" && value.attachment ? value : { attachment: value };
  return {
    attachment: normalizePersistentAttachment(source.attachment ?? fallbackAttachment),
    deduplicated: source.deduplicated === true,
    operationLogId: String(source.operationLogId ?? source.operation_log_id ?? fallbackOperationLog?.id ?? "").trim(),
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
  let items = canonicalizeAttachmentList(Array.isArray(attachments) ? attachments : []);
  items = filterByValue(items, filters.ownerType, "ownerType");
  items = filterByValue(items, filters.ownerId, "ownerId");
  items = filterByValue(items, filters.purpose, "purpose");
  items = filterByValue(items, filters.fileType, "fileType");
  items = filterByKeyword(items, filters.keyword, ["attachmentId", "fileName", "ownerId", "purpose", "uploadedBy"]);
  return items;
}

function canonicalizeAttachmentList(attachments) {
  const canonical = new Map();
  for (const attachment of attachments) {
    const digest = String(attachment?.contentDigest ?? "").trim().toLowerCase();
    const key = digest
      ? [attachment?.ownerType, attachment?.ownerId, attachment?.purpose, digest].map((value) => String(value ?? "").trim()).join("\u0000")
      : `attachment-id\u0000${String(attachment?.attachmentId ?? "").trim()}`;
    const existing = canonical.get(key);
    if (!existing || compareAttachmentCanonicalOrder(attachment, existing) < 0) canonical.set(key, attachment);
  }
  return [...canonical.values()];
}

function compareAttachmentCanonicalOrder(left, right) {
  return [String(left?.uploadedAt ?? ""), String(left?.attachmentId ?? "")]
    .join("\u0000")
    .localeCompare([String(right?.uploadedAt ?? ""), String(right?.attachmentId ?? "")].join("\u0000"));
}

function findAttachmentByDigestInMemory(attachments, input = {}) {
  const contentDigest = String(input.contentDigest ?? "").trim().toLowerCase();
  if (!contentDigest) return null;
  const ownerType = String(input.ownerType ?? "").trim();
  const ownerId = String(input.ownerId ?? "").trim();
  const purpose = String(input.purpose ?? "").trim();
  return (Array.isArray(attachments) ? attachments : []).reduce((canonical, item) => {
    const matches =
      String(item.ownerType ?? "").trim() === ownerType &&
      String(item.ownerId ?? "").trim() === ownerId &&
      String(item.purpose ?? "").trim() === purpose &&
      String(item.contentDigest ?? "").trim().toLowerCase() === contentDigest;
    if (!matches) return canonical;
    return !canonical || compareAttachmentCanonicalOrder(item, canonical) < 0 ? item : canonical;
  }, null);
}

function buildAttachmentCreateResourceLocks(attachment = {}) {
  const ownerType = String(attachment.ownerType ?? "").trim();
  const ownerId = String(attachment.ownerId ?? "").trim();
  const purpose = String(attachment.purpose ?? "").trim();
  const contentDigest = String(attachment.contentDigest ?? "").trim().toLowerCase();
  return [
    `attachment:${String(attachment.attachmentId ?? "").trim()}`,
    ...(contentDigest ? [`attachment-digest:${ownerType}:${ownerId}:${purpose}:${contentDigest}`] : []),
  ];
}

function assertAttachmentContentDigest(value) {
  const digest = String(value ?? "").trim().toLowerCase();
  if (digest && !/^[0-9a-f]{64}$/.test(digest)) {
    throw new Error("Attachment content digest must be an empty value or a SHA-256 hex digest");
  }
}

function normalizeAttachmentOperationLog(operationLog, attachment) {
  const source = operationLog && typeof operationLog === "object" ? operationLog : {};
  const now = new Date().toISOString();
  const id = String(source.id ?? "").trim();
  if (!id) throw new Error("An operation log id is required for attachment creation");
  return {
    id,
    targetType: String(source.targetType ?? attachment.ownerType ?? "attachment").trim(),
    targetId: String(source.targetId ?? attachment.ownerId ?? attachment.attachmentId ?? "").trim(),
    action: String(source.action ?? "create_attachment").trim() || "create_attachment",
    before: source.before ?? null,
    reason: String(source.reason ?? attachment.remark ?? ""),
    operatorId: String(source.operatorId ?? attachment.uploadedBy ?? "").trim(),
    pageKey: String(source.pageKey ?? "api").trim() || "api",
    occurredAt: String(source.occurredAt ?? now).trim() || now,
    createdAt: String(source.createdAt ?? source.occurredAt ?? now).trim() || now,
  };
}

function applyAttachmentCreateWorkspaceMutation({ workspace, result, link, operationLog }) {
  workspace.attachments = Array.isArray(workspace.attachments) ? workspace.attachments : [];
  workspace.attachmentLinks = Array.isArray(workspace.attachmentLinks) ? workspace.attachmentLinks : [];
  workspace.operationLogs = Array.isArray(workspace.operationLogs) ? workspace.operationLogs : [];
  if (!workspace.attachments.some((item) => item.attachmentId === result.attachment.attachmentId)) {
    workspace.attachments.unshift(result.attachment);
  }
  const committedLink = {
    ...link,
    attachmentId: result.attachment.attachmentId,
    ownerType: result.attachment.ownerType,
    ownerId: result.attachment.ownerId,
    purpose: result.attachment.purpose,
  };
  if (
    !workspace.attachmentLinks.some(
      (item) =>
        item.attachmentId === committedLink.attachmentId &&
        item.ownerType === committedLink.ownerType &&
        item.ownerId === committedLink.ownerId &&
        item.purpose === committedLink.purpose,
    )
  ) {
    workspace.attachmentLinks.unshift(committedLink);
  }
  if (result.operationLogId && !workspace.operationLogs.some((item) => item.id === result.operationLogId)) {
    workspace.operationLogs.unshift({
      ...operationLog,
      id: result.operationLogId,
      action: result.deduplicated ? "reuse_attachment_digest" : operationLog?.action ?? "create_attachment",
      after: {
        attachmentId: result.attachment.attachmentId,
        purpose: result.attachment.purpose,
        fileName: result.attachment.fileName,
        contentDigest: result.attachment.contentDigest,
        deduplicated: result.deduplicated,
      },
    });
  }
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

function buildAttachmentWhereClause(filters = {}, parameters, baseClauses = []) {
  const clauses = [...baseClauses];
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
