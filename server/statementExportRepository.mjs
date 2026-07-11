import crypto from "node:crypto";
import { createPostgresPoolClient } from "./postgresPoolClient.mjs";
import { createPostgresParameterBinder } from "./postgresSqlParameters.mjs";
import { createPostgresTransactionExecutor } from "./postgresTransactionExecutor.mjs";
import { buildPostgresIdempotencyRequest, resolveRepositoryIdempotencyKey } from "./idempotency.mjs";

export function createStatementExportRepository(options = {}) {
  const mode = options.mode ?? process.env.ERP_STATEMENT_EXPORT_STORE ?? process.env.ERP_STATEMENT_STORE ?? "local";
  if (mode === "postgres") {
    return createPostgresStatementExportRepository({
      databaseUrl:
        options.databaseUrl ?? process.env.ERP_STATEMENT_DATABASE_URL ?? process.env.DATABASE_URL ?? process.env.PGURL,
      queryJson: options.queryJson,
      postgresClient: options.postgresClient,
    });
  }
  if (mode === "local") return createLocalStatementExportRepository();
  throw new Error(`Unsupported statement export repository mode: ${mode}`);
}

export function createLocalStatementExportRepository() {
  return {
    kind: "local_memory",

    loadState() {
      return { statementExportFiles: [] };
    },

    createExportFile(input) {
      const exportFile = normalizeStatementExportFile(input.exportFile);
      const statementLines = normalizeStatementLines(input.statementLines ?? [], exportFile?.statementId);
      if (!exportFile) throw new Error("Invalid statement export file");
      applyStatementExportWorkspaceMutation({
        workspace: input.workspace,
        exportFile,
        statementLines,
        operationLog: input.operationLog,
      });
      return normalizeStatementExportTransactionResult({
        exportFile,
        statementLines,
        operationLogId: input.operationLog?.id ?? exportFile.operationLogId,
      });
    },

    listExportFiles({ workspace, statementId, limit = 100 }) {
      return filterStatementExportFiles(workspace.statementExportFiles, { statementId, limit });
    },

    findExportFileByToken({ workspace, statementId, downloadToken }) {
      return (
        filterStatementExportFiles(workspace.statementExportFiles, { statementId }).find(
          (item) => item.downloadToken === downloadToken,
        ) ?? null
      );
    },

    findLatestExportFile({ workspace, statementId, previewType }) {
      return filterStatementExportFiles(workspace.statementExportFiles, { statementId, previewType, limit: 1 })[0] ?? null;
    },
  };
}

export function createPostgresStatementExportRepository(options = {}) {
  const databaseUrl = options.databaseUrl;
  const postgresClient = options.postgresClient ?? (options.queryJson ? null : createPostgresPoolClient({ databaseUrl }));
  const queryJson =
    options.queryJson ??
    ((text, values) => postgresClient.queryJson(text, values));
  const transactionJson =
    options.queryJson ??
    ((text, values) => postgresClient.transactionJson(text, values));
  const { idempotentTransactionJson } = createPostgresTransactionExecutor({
    ...options,
    postgresClient,
    transactionJson,
  });

  return {
    kind: "postgres",

    async loadState() {
      const builtQuery = buildListStatementExportsQuery({ includeContent: false });
      return {
        statementExportFiles: normalizeStatementExportFiles(
          await queryJson(builtQuery.text, builtQuery.values),
        ),
      };
    },

    async createExportFile(input) {
      const builtQuery = buildCreateStatementExportTransactionQuery(input);
      const statementId = input.exportFile?.statementId ?? input.exportFile?.statement_id ?? "";
      const saved = normalizeStatementExportTransactionResult(
        await idempotentTransactionJson(
          buildPostgresIdempotencyRequest({
            scope: "statement.export.create",
            idempotencyKey: resolveRepositoryIdempotencyKey(input.idempotencyKey, input.operationLog?.id),
            payload: input.idempotencyPayload ?? {
              statementId,
              previewType: input.exportFile?.previewType,
              downloadToken: input.exportFile?.downloadToken,
            },
            operatorId: input.operationLog?.operatorId,
            targetType: "statement",
            targetId: statementId,
            resourceLocks: [`statement:${statementId}`],
            query: builtQuery,
          }),
        ),
      );
      if (!saved.exportFile) throw new Error("PostgreSQL statement export insert returned an invalid export file");
      applyStatementExportWorkspaceMutation({
        workspace: input.workspace,
        exportFile: saved.exportFile,
        statementLines: saved.statementLines,
        operationLog: saved.operationLogId === input.operationLog?.id ? input.operationLog : null,
      });
      return saved;
    },

    async listExportFiles({ statementId, limit = 100 }) {
      const builtQuery = buildListStatementExportsQuery({ statementId, limit, includeContent: false });
      return normalizeStatementExportFiles(
        await queryJson(builtQuery.text, builtQuery.values),
      );
    },

    async findExportFileByToken({ statementId, downloadToken }) {
      const builtQuery = buildFindStatementExportByTokenQuery({ statementId, downloadToken, includeContent: true });
      return normalizeStatementExportFile(
        await queryJson(builtQuery.text, builtQuery.values),
      );
    },

    async findLatestExportFile({ statementId, previewType }) {
      const builtQuery = buildFindLatestStatementExportQuery({ statementId, previewType, includeContent: false });
      return normalizeStatementExportFile(
        await queryJson(builtQuery.text, builtQuery.values),
      );
    },
  };
}

export function buildCreateStatementExportTransactionSql(input) {
  return buildCreateStatementExportTransactionQuery(input).text;
}

export function buildCreateStatementExportTransactionQuery(input) {
  const exportFile = normalizeStatementExportFile(input.exportFile);
  const operationLog = normalizeOperationLogForPersistence(input.operationLog);
  const statementLines = normalizeStatementLines(input.statementLines ?? [], exportFile?.statementId);
  if (!exportFile || !operationLog) {
    throw new Error("Statement export file and operation log are required for statement export transaction");
  }
  const parameters = createPostgresParameterBinder();
  const statementId = parameters.text(exportFile.statementId);
  const insertedStatementLines = buildInsertStatementLinesSql(statementLines, parameters);
  const insertedOperationLog = buildInsertOperationLogSql(operationLog, parameters);
  return {
    text: `
BEGIN;
WITH deleted_statement_lines AS (
  DELETE FROM statement_lines
  WHERE statement_id = ${statementId}
  RETURNING id
),
inserted_statement_lines AS (
  ${insertedStatementLines}
),
inserted_export_file AS (
  INSERT INTO statement_export_files (
    id,
    statement_id,
    preview_type,
    download_token,
    file_name,
    content_type,
    storage_provider,
    storage_key,
    content_text,
    content_digest,
    operation_log_id,
    created_by,
    created_at,
    metadata_json
  ) VALUES (
    ${parameters.text(exportFile.exportFileId)},
    ${statementId},
    ${parameters.text(exportFile.previewType)},
    ${parameters.text(exportFile.downloadToken)},
    ${parameters.text(exportFile.fileName)},
    ${parameters.text(exportFile.contentType)},
    ${parameters.text(exportFile.storageProvider)},
    ${parameters.text(exportFile.storageKey)},
    ${parameters.text(exportFile.content)},
    ${parameters.text(exportFile.contentDigest)},
    ${parameters.text(operationLog.id)},
    ${parameters.nullableText(exportFile.createdBy || operationLog.operatorId)},
    ${parameters.timestamp(exportFile.createdAt)},
    ${parameters.json(exportFile.metadata)}
  )
  ON CONFLICT (id) DO UPDATE SET
    statement_id = EXCLUDED.statement_id,
    preview_type = EXCLUDED.preview_type,
    download_token = EXCLUDED.download_token,
    file_name = EXCLUDED.file_name,
    content_type = EXCLUDED.content_type,
    storage_provider = EXCLUDED.storage_provider,
    storage_key = EXCLUDED.storage_key,
    content_text = EXCLUDED.content_text,
    content_digest = EXCLUDED.content_digest,
    operation_log_id = EXCLUDED.operation_log_id,
    created_by = EXCLUDED.created_by,
    metadata_json = EXCLUDED.metadata_json
  RETURNING ${statementExportJsonExpression("statement_export_files", { includeContent: true })} AS result
),
inserted_operation_log AS (
  ${insertedOperationLog}
)
SELECT json_build_object(
  'exportFile', (SELECT result FROM inserted_export_file),
  'statementLines', (SELECT COALESCE(json_agg(result ORDER BY result->>'statementLineId'), '[]'::json) FROM inserted_statement_lines),
  'operationLogId', (SELECT id FROM inserted_operation_log)
) AS result;
COMMIT;
`.trim(),
    values: parameters.values,
  };
}

export function buildListStatementExportsSql(filters = {}) {
  return buildListStatementExportsQuery(filters).text;
}

export function buildListStatementExportsQuery(filters = {}) {
  const parameters = createPostgresParameterBinder();
  const where = buildStatementExportWhereClause(filters, parameters);
  const limit = normalizeLimit(filters.limit ?? 100);
  const includeContent = Boolean(filters.includeContent);
  return {
    text: `
SELECT COALESCE(json_agg(export_file), '[]'::json) AS result
FROM (
  SELECT ${statementExportJsonExpression("statement_export_files", { includeContent })} AS export_file
  FROM statement_export_files
  ${where}
  ORDER BY created_at DESC, id DESC
  LIMIT ${parameters.integer(limit)}
) AS ordered_exports;
`.trim(),
    values: parameters.values,
  };
}

export function buildFindStatementExportByTokenSql(filters = {}) {
  return buildFindStatementExportByTokenQuery(filters).text;
}

export function buildFindStatementExportByTokenQuery(filters = {}) {
  const parameters = createPostgresParameterBinder();
  const includeContent = Boolean(filters.includeContent);
  return {
    text: `
SELECT ${statementExportJsonExpression("statement_export_files", { includeContent })} AS result
FROM statement_export_files
WHERE statement_id = ${parameters.text(filters.statementId)}
  AND download_token = ${parameters.text(filters.downloadToken)}
ORDER BY created_at DESC, id DESC
LIMIT 1;
`.trim(),
    values: parameters.values,
  };
}

export function buildFindLatestStatementExportSql(filters = {}) {
  return buildFindLatestStatementExportQuery(filters).text;
}

export function buildFindLatestStatementExportQuery(filters = {}) {
  const parameters = createPostgresParameterBinder();
  const includeContent = Boolean(filters.includeContent);
  const previewClause = filters.previewType ? `\n  AND preview_type = ${parameters.text(filters.previewType)}` : "";
  return {
    text: `
SELECT ${statementExportJsonExpression("statement_export_files", { includeContent })} AS result
FROM statement_export_files
WHERE statement_id = ${parameters.text(filters.statementId)}${previewClause}
ORDER BY created_at DESC, id DESC
LIMIT 1;
`.trim(),
    values: parameters.values,
  };
}

export function normalizeStatementExportTransactionResult(value) {
  if (!value || typeof value !== "object") return { exportFile: null, statementLines: [], operationLogId: "" };
  return {
    exportFile: normalizeStatementExportFile(value.exportFile ?? value.export_file),
    statementLines: normalizeStatementLines(value.statementLines ?? value.statement_lines ?? []),
    operationLogId: String(value.operationLogId ?? value.operation_log_id ?? "").trim(),
  };
}

export function normalizeStatementExportFiles(value) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => normalizeStatementExportFile(item)).filter(Boolean);
}

export function normalizeStatementExportFile(file) {
  if (!file || typeof file !== "object") return null;
  const statementId = String(file.statementId ?? file.statement_id ?? "").trim();
  const downloadToken = String(file.downloadToken ?? file.download_token ?? file.id ?? "").trim();
  if (!statementId || !downloadToken) return null;
  const content = String(file.content ?? file.contentText ?? file.content_text ?? "");
  const metadata = normalizeMetadata(file.metadata ?? file.metadata_json);
  const exportFileId = String(file.exportFileId ?? file.export_file_id ?? file.id ?? downloadToken).trim() || downloadToken;
  const contentDigest =
    String(file.contentDigest ?? file.content_digest ?? "").trim() || (content ? buildContentDigest(content) : "");
  return {
    exportFileId,
    statementId,
    previewType: normalizePreviewType(file.previewType ?? file.preview_type),
    downloadToken,
    operationLogId: String(file.operationLogId ?? file.operation_log_id ?? "").trim(),
    fileName: String(file.fileName ?? file.file_name ?? `statement-${statementId}.xlsx`).trim(),
    contentType: String(
      file.contentType ??
        file.content_type ??
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ).trim(),
    content,
    contentEncoding: String(file.contentEncoding ?? file.content_encoding ?? metadata.contentEncoding ?? "").trim(),
    storageProvider: String(file.storageProvider ?? file.storage_provider ?? "database").trim() || "database",
    storageKey: String(file.storageKey ?? file.storage_key ?? "").trim(),
    contentDigest,
    createdBy: String(file.createdBy ?? file.created_by ?? "").trim(),
    createdAt: String(file.createdAt ?? file.created_at ?? new Date().toISOString()).trim(),
    metadata,
  };
}

export function normalizeStatementLines(value, fallbackStatementId = "") {
  if (!Array.isArray(value)) return [];
  return value.map((item) => normalizeStatementLine(item, fallbackStatementId)).filter(Boolean);
}

export function normalizeStatementLine(line, fallbackStatementId = "") {
  if (!line || typeof line !== "object") return null;
  const statementLineId = String(line.statementLineId ?? line.id ?? "").trim();
  const statementId = String(line.statementId ?? line.statement_id ?? fallbackStatementId ?? "").trim();
  const orderLineId = String(line.orderLineId ?? line.order_line_id ?? "").trim();
  if (!statementLineId || !statementId || !orderLineId) return null;
  const deliveredQty = Number(line.deliveredQty ?? line.delivered_qty ?? line.billQty ?? line.chargeableQty ?? 0);
  const chargeableQty = Number(line.chargeableQty ?? line.chargeable_qty ?? line.billQty ?? line.deliveredQty ?? 0);
  const freeQty = Number(line.freeQty ?? line.free_qty ?? Math.max(0, deliveredQty - chargeableQty));
  const amount = Number(line.amount ?? 0);
  const adjustmentAmount = Number(line.adjustmentAmount ?? line.adjustment_amount ?? 0);
  const finalAmount = Number(line.finalAmount ?? line.final_amount ?? amount + adjustmentAmount);
  return {
    statementLineId,
    statementId,
    orderLineId,
    fulfillmentId: String(line.fulfillmentId ?? line.fulfillment_id ?? "").trim(),
    deliveredQty: Number.isFinite(deliveredQty) ? deliveredQty : 0,
    chargeableQty: Number.isFinite(chargeableQty) ? chargeableQty : 0,
    freeQty: Number.isFinite(freeQty) ? freeQty : 0,
    amount: Number.isFinite(amount) ? amount : 0,
    adjustmentAmount: Number.isFinite(adjustmentAmount) ? adjustmentAmount : 0,
    finalAmount: Number.isFinite(finalAmount) ? finalAmount : 0,
    createdAt: String(line.createdAt ?? line.created_at ?? new Date().toISOString()).trim(),
  };
}

function applyStatementExportWorkspaceMutation({ workspace, exportFile, statementLines = [], operationLog }) {
  workspace.statementExportFiles = workspace.statementExportFiles ?? [];
  workspace.statementExportFiles = [
    exportFile,
    ...workspace.statementExportFiles.filter((item) => item.downloadToken !== exportFile.downloadToken),
  ].slice(0, 100);
  if (statementLines.length > 0) {
    workspace.statementLines = workspace.statementLines ?? [];
    workspace.statementLines = [
      ...statementLines,
      ...workspace.statementLines.filter((item) => item.statementId !== exportFile.statementId),
    ];
  }
  if (operationLog) {
    workspace.operationLogs = workspace.operationLogs ?? [];
    workspace.operationLogs = [operationLog, ...workspace.operationLogs.filter((item) => item.id !== operationLog.id)];
  }
}

function filterStatementExportFiles(files, filters = {}) {
  let items = normalizeStatementExportFiles(Array.isArray(files) ? files : []);
  if (filters.statementId) items = items.filter((item) => item.statementId === filters.statementId);
  if (filters.previewType) items = items.filter((item) => item.previewType === filters.previewType);
  items = items.sort((left, right) => {
    const byTime = String(right.createdAt).localeCompare(String(left.createdAt));
    return byTime || String(right.exportFileId).localeCompare(String(left.exportFileId));
  });
  return items.slice(0, Number(filters.limit ?? items.length));
}

function buildStatementExportWhereClause(filters = {}, parameters) {
  const clauses = [];
  if (filters.statementId) clauses.push(`statement_id = ${parameters.text(filters.statementId)}`);
  if (filters.previewType) clauses.push(`preview_type = ${parameters.text(filters.previewType)}`);
  return clauses.length ? `WHERE ${clauses.join("\n  AND ")}` : "";
}

function buildInsertOperationLogSql(operationLog, parameters) {
  return `INSERT INTO operation_logs (
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
) VALUES (
  ${parameters.text(operationLog.id)},
  ${parameters.text(operationLog.targetType)},
  ${parameters.text(operationLog.targetId)},
  ${parameters.text(operationLog.action)},
  ${parameters.json(operationLog.before)},
  ${parameters.json(operationLog.after)},
  ${parameters.text(operationLog.reason)},
  ${parameters.nullableText(operationLog.operatorId)},
  ${parameters.text(operationLog.pageKey)},
  ${parameters.timestamp(operationLog.occurredAt)},
  ${parameters.timestamp(operationLog.createdAt)}
)
ON CONFLICT (id) DO UPDATE SET
  target_type = EXCLUDED.target_type,
  target_id = EXCLUDED.target_id,
  action = EXCLUDED.action,
  before_json = EXCLUDED.before_json,
  after_json = EXCLUDED.after_json,
  reason = EXCLUDED.reason,
  operator_id = EXCLUDED.operator_id,
  page_key = EXCLUDED.page_key
RETURNING id`;
}

function buildInsertStatementLinesSql(statementLines, parameters) {
  if (statementLines.length === 0) return "SELECT NULL::json AS result WHERE false";
  const values = statementLines
    .map(
      (line) => `(
    ${parameters.text(line.statementLineId)},
    ${parameters.text(line.statementId)},
    ${parameters.text(line.orderLineId)},
    ${parameters.nullableText(line.fulfillmentId)},
    ${parameters.integer(line.deliveredQty)},
    ${parameters.integer(line.chargeableQty)},
    ${parameters.integer(line.freeQty)},
    ${parameters.number(line.amount)},
    ${parameters.number(line.adjustmentAmount)},
    ${parameters.number(line.finalAmount)},
    ${parameters.timestamp(line.createdAt)}
  )`,
    )
    .join(",\n");
  return `INSERT INTO statement_lines (
  id,
  statement_id,
  order_line_id,
  fulfillment_id,
  delivered_qty,
  chargeable_qty,
  free_qty,
  amount,
  adjustment_amount,
  final_amount,
  created_at
) VALUES
${values}
ON CONFLICT (id) DO UPDATE SET
  statement_id = EXCLUDED.statement_id,
  order_line_id = EXCLUDED.order_line_id,
  fulfillment_id = EXCLUDED.fulfillment_id,
  delivered_qty = EXCLUDED.delivered_qty,
  chargeable_qty = EXCLUDED.chargeable_qty,
  free_qty = EXCLUDED.free_qty,
  amount = EXCLUDED.amount,
  adjustment_amount = EXCLUDED.adjustment_amount,
  final_amount = EXCLUDED.final_amount
RETURNING ${statementLineJsonExpression("statement_lines")} AS result`;
}

function normalizeOperationLogForPersistence(operationLog) {
  if (!operationLog || typeof operationLog !== "object") return null;
  const id = String(operationLog.id ?? "").trim();
  if (!id) return null;
  return {
    id,
    targetType: String(operationLog.targetType ?? operationLog.target_type ?? "").trim(),
    targetId: String(operationLog.targetId ?? operationLog.target_id ?? "").trim(),
    action: String(operationLog.action ?? "").trim(),
    before: operationLog.before ?? null,
    after: operationLog.after ?? null,
    reason: String(operationLog.reason ?? "").trim(),
    operatorId: String(operationLog.operatorId ?? operationLog.operator_id ?? "").trim(),
    pageKey: String(operationLog.pageKey ?? operationLog.page_key ?? "api").trim() || "api",
    occurredAt: operationLog.occurredAt ?? new Date().toISOString(),
    createdAt: operationLog.createdAt ?? new Date().toISOString(),
  };
}

function statementExportJsonExpression(alias, options = {}) {
  const contentExpression = options.includeContent ? `${alias}.content_text` : "''";
  return `json_build_object(
    'exportFileId', ${alias}.id,
    'statementId', ${alias}.statement_id,
    'previewType', ${alias}.preview_type,
    'downloadToken', ${alias}.download_token,
    'operationLogId', ${alias}.operation_log_id,
    'fileName', ${alias}.file_name,
    'contentType', ${alias}.content_type,
    'content', ${contentExpression},
    'storageProvider', ${alias}.storage_provider,
    'storageKey', ${alias}.storage_key,
    'contentDigest', ${alias}.content_digest,
    'createdBy', ${alias}.created_by,
    'createdAt', ${alias}.created_at,
    'metadata', ${alias}.metadata_json
  )`;
}

function statementLineJsonExpression(alias) {
  return `json_build_object(
    'statementLineId', ${alias}.id,
    'statementId', ${alias}.statement_id,
    'orderLineId', ${alias}.order_line_id,
    'fulfillmentId', ${alias}.fulfillment_id,
    'deliveredQty', ${alias}.delivered_qty,
    'chargeableQty', ${alias}.chargeable_qty,
    'freeQty', ${alias}.free_qty,
    'amount', ${alias}.amount,
    'adjustmentAmount', ${alias}.adjustment_amount,
    'finalAmount', ${alias}.final_amount,
    'createdAt', ${alias}.created_at
  )`;
}

function normalizePreviewType(value) {
  return value === "internal_archive" ? "internal_archive" : "customer_send";
}

function normalizeMetadata(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value;
}

function buildContentDigest(content) {
  return `sha256:${crypto.createHash("sha256").update(String(content), "utf8").digest("hex")}`;
}

function normalizeLimit(value) {
  const limit = Number(value);
  if (!Number.isInteger(limit) || limit < 1) return 100;
  return Math.min(limit, 500);
}
