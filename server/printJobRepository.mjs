import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { createPostgresPoolClient } from "./postgresPoolClient.mjs";
import { createPostgresParameterBinder } from "./postgresSqlParameters.mjs";
import { createPostgresTransactionExecutor } from "./postgresTransactionExecutor.mjs";
import { buildPostgresIdempotencyRequest, resolveRepositoryIdempotencyKey } from "./idempotency.mjs";

export const printJobStoreKey = "metadata/print-jobs.json";

export function createPrintJobRepository(options = {}) {
  const mode = options.mode ?? process.env.ERP_PRINT_JOB_STORE ?? process.env.ERP_PRINT_STORE ?? "local";
  if (mode === "postgres") {
    return createPostgresPrintJobRepository({
      databaseUrl: options.databaseUrl ?? process.env.ERP_PRINT_DATABASE_URL ?? process.env.DATABASE_URL ?? process.env.PGURL,
      queryJson: options.queryJson,
      transactionJson: options.transactionJson,
      idempotentTransactionJson: options.idempotentTransactionJson,
      postgresClient: options.postgresClient,
    });
  }
  if (mode === "local") {
    return createLocalPrintJobRepository({
      storageRoot: options.storageRoot,
    });
  }
  throw new Error(`Unsupported print job repository mode: ${mode}`);
}

export function createLocalPrintJobRepository(options = {}) {
  const storageRoot = options.storageRoot ?? getLocalStorageRoot();

  return {
    kind: "local_json",

    loadState() {
      return loadPersistentPrintJobState(storageRoot);
    },

    createPrintJob({ workspace, printJob, operationLog }) {
      const record = normalizePrintJobRecord({
        ...printJob,
        operationLogId: operationLog?.id ?? printJob?.operationLogId,
      });
      if (!record) throw new Error("Invalid print job");
      applyPrintJobWorkspaceMutation({ workspace, printJob: record, operationLog });
      persistPersistentPrintJobState(storageRoot, workspace);
      return {
        printJob: record,
        operationLogId: record.operationLogId,
      };
    },

    updatePrintJob({ workspace, printJob, operationLog }) {
      const record = normalizePrintJobRecord({
        ...printJob,
        operationLogId: operationLog?.id ?? printJob?.operationLogId,
      });
      if (!record) throw new Error("Invalid print job");
      applyPrintJobWorkspaceMutation({ workspace, printJob: record, operationLog });
      persistPersistentPrintJobState(storageRoot, workspace);
      return {
        printJob: record,
        operationLogId: record.operationLogId,
      };
    },

    listPrintJobs({ workspace, filters = {} }) {
      return filterPrintJobs(workspace.printJobs, filters);
    },
  };
}

export function createPostgresPrintJobRepository(options = {}) {
  const postgresClient =
    options.postgresClient ?? (options.queryJson || options.transactionJson ? null : createPostgresPoolClient(options));
  const queryJson =
    options.queryJson ??
    ((text, values) => postgresClient.queryJson(text, values));
  const { idempotentTransactionJson } = createPostgresTransactionExecutor(options);

  return {
    kind: "postgres",

    async loadState() {
      const query = buildListPrintJobsQuery({});
      return {
        printJobs: normalizePrintJobs(await queryJson(query.text, query.values)),
      };
    },

    async createPrintJob({ workspace, printJob, operationLog, idempotencyKey, idempotencyPayload }) {
      const query = buildCreatePrintJobTransactionQuery({ printJob, operationLog });
      const saved = normalizePrintJobTransactionResult(
        await idempotentTransactionJson(
          buildPostgresIdempotencyRequest({
            scope: `print.job.create.${printJob?.printJobId ?? printJob?.id ?? "unknown"}`,
            idempotencyKey: resolveRepositoryIdempotencyKey(idempotencyKey, operationLog?.id),
            payload: idempotencyPayload ?? { printJob, action: operationLog?.action },
            operatorId: operationLog?.operatorId,
            targetType: "print_job",
            targetId: printJob?.printJobId ?? printJob?.id,
            resourceLocks: [`print-job:${printJob?.printJobId ?? printJob?.id ?? ""}`],
            query,
          }),
        ),
      );
      if (!saved.printJob) throw new Error("PostgreSQL print job insert returned an invalid record");
      applyPrintJobWorkspaceMutation({
        workspace,
        printJob: saved.printJob,
        operationLog: saved.operationLogId === operationLog?.id ? operationLog : null,
      });
      return saved;
    },

    async updatePrintJob({ workspace, printJob, operationLog, idempotencyKey, idempotencyPayload }) {
      const query = buildUpdatePrintJobTransactionQuery({ printJob, operationLog });
      const saved = normalizePrintJobTransactionResult(
        await idempotentTransactionJson(
          buildPostgresIdempotencyRequest({
            scope: `print.job.update.${printJob?.printJobId ?? printJob?.id ?? "unknown"}`,
            idempotencyKey: resolveRepositoryIdempotencyKey(idempotencyKey, operationLog?.id),
            payload: idempotencyPayload ?? { printJob, action: operationLog?.action },
            operatorId: operationLog?.operatorId,
            targetType: "print_job",
            targetId: printJob?.printJobId ?? printJob?.id,
            resourceLocks: [`print-job:${printJob?.printJobId ?? printJob?.id ?? ""}`],
            query,
          }),
        ),
      );
      if (!saved.printJob) throw new Error("PostgreSQL print job update returned an invalid record");
      applyPrintJobWorkspaceMutation({
        workspace,
        printJob: saved.printJob,
        operationLog: saved.operationLogId === operationLog?.id ? operationLog : null,
      });
      return saved;
    },

    async listPrintJobs({ filters = {} }) {
      const query = buildListPrintJobsQuery(filters);
      return normalizePrintJobs(await queryJson(query.text, query.values));
    },
  };
}

export function buildCreatePrintJobTransactionSql(input) {
  return buildCreatePrintJobTransactionQuery(input).text;
}

export function buildCreatePrintJobTransactionQuery(input) {
  const parameters = createPostgresParameterBinder();
  return {
    text: buildCreatePrintJobTransactionText(input, parameters),
    values: parameters.values,
  };
}

function buildCreatePrintJobTransactionText(input, parameters) {
  const record = normalizePrintJobRecord(input.printJob);
  const operationLog = normalizeOperationLogForPersistence(input.operationLog);
  if (!record) throw new Error("Print job is required for persistence");
  const recordWithLog = {
    ...record,
    operationLogId: operationLog?.id ?? record.operationLogId,
  };
  return `
BEGIN;
WITH inserted_operation_log AS (
  ${buildInsertOperationLogSql(operationLog, parameters)}
),
inserted_print_job AS (
  INSERT INTO print_jobs (
    id,
    biz_no,
    print_record_id,
    target_type,
    target_id,
    document_type,
    template_id,
    printer_device_id,
    printer_device_snapshot,
    driver_mode,
    job_status,
    attempt_no,
    source_print_job_id,
    requested_by,
    queued_at,
    sent_at,
    finished_at,
    error_code,
    error_message,
    payload_json,
    metadata_json,
    operation_log_id,
    revision,
    created_at,
    updated_at
  ) VALUES (
    ${parameters.text(recordWithLog.printJobId)},
    ${parameters.text(recordWithLog.bizNo)},
    ${parameters.nullableText(recordWithLog.printRecordId)},
    ${parameters.text(recordWithLog.targetType)},
    ${parameters.text(recordWithLog.targetId)},
    ${parameters.text(recordWithLog.documentType)},
    ${parameters.nullableText(recordWithLog.templateId)},
    ${parameters.nullableText(recordWithLog.printDeviceId)},
    ${parameters.json(recordWithLog.printDeviceSnapshot)},
    ${parameters.text(recordWithLog.driverMode)},
    ${parameters.text(recordWithLog.jobStatus)},
    ${parameters.integer(recordWithLog.attemptNo)},
    ${parameters.nullableText(recordWithLog.sourcePrintJobId)},
    ${parameters.nullableText(recordWithLog.requestedBy)},
    ${parameters.nullableTimestamp(recordWithLog.queuedAt)},
    ${parameters.nullableTimestamp(recordWithLog.sentAt)},
    ${parameters.nullableTimestamp(recordWithLog.finishedAt)},
    ${parameters.nullableText(recordWithLog.errorCode)},
    ${parameters.nullableText(recordWithLog.errorMessage)},
    ${parameters.json(recordWithLog.payload)},
    ${parameters.json(recordWithLog.metadata)},
    COALESCE((SELECT id FROM inserted_operation_log), ${parameters.nullableText(recordWithLog.operationLogId)}),
    1,
    ${parameters.timestamp(recordWithLog.createdAt)},
    ${parameters.timestamp(recordWithLog.updatedAt)}
  )
  ON CONFLICT (id) DO NOTHING
  RETURNING ${printJobJsonExpression("print_jobs")} AS result
),
print_job_create_guard AS MATERIALIZED (
  SELECT erp_require(
    (SELECT COUNT(*) FROM inserted_print_job) = 1,
    'ERP_PRINT_JOB_CREATE_CONCURRENCY_CONFLICT'
  ) AS ok
)
SELECT json_build_object(
  'printJob', (SELECT result FROM inserted_print_job),
  'operationLogId', COALESCE((SELECT id FROM inserted_operation_log), ''),
  'writeGuard', (SELECT ok FROM print_job_create_guard)
) AS result;
COMMIT;
`.trim();
}

export function buildUpdatePrintJobTransactionSql(input) {
  return buildUpdatePrintJobTransactionQuery(input).text;
}

export function buildUpdatePrintJobTransactionQuery(input) {
  const parameters = createPostgresParameterBinder();
  return {
    text: buildUpdatePrintJobTransactionText(input, parameters),
    values: parameters.values,
  };
}

function buildUpdatePrintJobTransactionText(input, parameters) {
  const record = normalizePrintJobRecord(input.printJob);
  const operationLog = normalizeOperationLogForPersistence(input.operationLog);
  if (!record) throw new Error("Print job is required for status persistence");
  const recordWithLog = {
    ...record,
    operationLogId: operationLog?.id ?? record.operationLogId,
  };
  const expectedRevision = Math.max(1, Number(recordWithLog.revision) || 1);
  return `
BEGIN;
WITH inserted_operation_log AS (
  ${buildInsertOperationLogSql(operationLog, parameters)}
),
locked_print_job AS MATERIALIZED (
  SELECT id, revision
  FROM print_jobs
  WHERE id = ${parameters.text(recordWithLog.printJobId)}
  FOR UPDATE
),
updated_print_job AS (
  UPDATE print_jobs
  SET
    job_status = ${parameters.text(recordWithLog.jobStatus)},
    sent_at = ${parameters.nullableTimestamp(recordWithLog.sentAt)},
    finished_at = ${parameters.nullableTimestamp(recordWithLog.finishedAt)},
    error_code = ${parameters.nullableText(recordWithLog.errorCode)},
    error_message = ${parameters.nullableText(recordWithLog.errorMessage)},
    metadata_json = ${parameters.json(recordWithLog.metadata)},
    operation_log_id = COALESCE((SELECT id FROM inserted_operation_log), ${parameters.nullableText(
      recordWithLog.operationLogId,
    )}),
    revision = print_jobs.revision + 1,
    updated_at = ${parameters.timestamp(recordWithLog.updatedAt)}
  FROM locked_print_job AS locked
  WHERE print_jobs.id = locked.id
    AND locked.revision = ${parameters.integer(expectedRevision)}
  RETURNING ${printJobJsonExpression("print_jobs")} AS result
),
print_job_write_guard AS MATERIALIZED (
  SELECT erp_require(
    (SELECT COUNT(*) FROM updated_print_job) = 1,
    'ERP_PRINT_JOB_CONCURRENCY_CONFLICT'
  ) AS ok
)
SELECT json_build_object(
  'printJob', (SELECT result FROM updated_print_job),
  'operationLogId', COALESCE((SELECT id FROM inserted_operation_log), ''),
  'writeGuard', (SELECT ok FROM print_job_write_guard)
) AS result;
COMMIT;
`.trim();
}

export function buildListPrintJobsSql(filters = {}) {
  return buildListPrintJobsQuery(filters).text;
}

export function buildListPrintJobsQuery(filters = {}) {
  const parameters = createPostgresParameterBinder();
  const where = buildPrintJobWhereClause(filters, parameters);
  const limit = parameters.integer(normalizePrintJobLimit(filters.limit ?? 100));
  return {
    text: `
SELECT COALESCE(json_agg(record ORDER BY record->>'createdAt' DESC, record->>'printJobId' DESC), '[]'::json) AS result
FROM (
  SELECT ${printJobJsonExpression("print_jobs")} AS record
  FROM print_jobs
  ${where}
  ORDER BY created_at DESC, id DESC
  LIMIT ${limit}
) AS ordered_print_jobs;
`.trim(),
    values: parameters.values,
  };
}

export function normalizePrintJobTransactionResult(value) {
  if (!value || typeof value !== "object") return { printJob: null, operationLogId: "" };
  return {
    printJob: normalizePrintJobRecord(value.printJob ?? value.print_job),
    operationLogId: String(value.operationLogId ?? value.operation_log_id ?? "").trim(),
  };
}

export function normalizePrintJobs(value) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => normalizePrintJobRecord(item)).filter(Boolean);
}

export function normalizePrintJobRecord(record) {
  if (!record || typeof record !== "object") return null;
  const printJobId = String(record.printJobId ?? record.print_job_id ?? record.id ?? "").trim();
  if (!printJobId) return null;
  const printDeviceSnapshot = normalizeObject(record.printDeviceSnapshot ?? record.printer_device_snapshot);
  const now = new Date().toISOString();
  const createdAt = String(record.createdAt ?? record.created_at ?? now).trim();
  const updatedAt = String(record.updatedAt ?? record.updated_at ?? createdAt).trim();
  const jobStatus = normalizePrintJobStatus(record.jobStatus ?? record.job_status);
  return {
    printJobId,
    bizNo: String(record.bizNo ?? record.biz_no ?? printJobId).trim() || printJobId,
    printRecordId: String(record.printRecordId ?? record.print_record_id ?? "").trim(),
    targetType: String(record.targetType ?? record.target_type ?? "").trim(),
    targetId: String(record.targetId ?? record.target_id ?? "").trim(),
    documentType: String(record.documentType ?? record.document_type ?? "express_ltl_label").trim() || "express_ltl_label",
    templateId: String(record.templateId ?? record.template_id ?? "").trim(),
    printDeviceId: String(record.printDeviceId ?? record.printer_device_id ?? "").trim(),
    printDeviceSnapshot,
    driverMode: normalizeDriverMode(record.driverMode ?? record.driver_mode ?? printDeviceSnapshot?.settings?.driverMode),
    jobStatus,
    attemptNo: normalizeInteger(record.attemptNo ?? record.attempt_no, 1),
    sourcePrintJobId: String(record.sourcePrintJobId ?? record.source_print_job_id ?? "").trim(),
    requestedBy: String(record.requestedBy ?? record.requested_by ?? "").trim(),
    queuedAt: normalizeOptionalIsoTimestamp(record.queuedAt ?? record.queued_at),
    sentAt: normalizeOptionalIsoTimestamp(record.sentAt ?? record.sent_at),
    finishedAt: normalizeOptionalIsoTimestamp(record.finishedAt ?? record.finished_at),
    errorCode: String(record.errorCode ?? record.error_code ?? "").trim(),
    errorMessage: String(record.errorMessage ?? record.error_message ?? "").trim(),
    payload: normalizeObject(record.payload ?? record.payload_json),
    metadata: normalizeObject(record.metadata ?? record.metadata_json),
    operationLogId: String(record.operationLogId ?? record.operation_log_id ?? "").trim(),
    revision: Math.max(0, normalizeInteger(record.revision, 0)),
    createdAt,
    updatedAt,
  };
}

function applyPrintJobWorkspaceMutation({ workspace, printJob, operationLog }) {
  workspace.printJobs = upsertById(workspace.printJobs ?? [], printJob, (item) => item.printJobId);
  if (operationLog) {
    workspace.operationLogs = upsertById(workspace.operationLogs ?? [], operationLog, (item) => item.id);
  }
}

function loadPersistentPrintJobState(storageRoot) {
  const filePath = join(storageRoot, printJobStoreKey);
  if (!existsSync(filePath)) return { printJobs: [] };
  try {
    const json = JSON.parse(readFileSync(filePath, "utf8"));
    return {
      printJobs: normalizePrintJobs(json?.printJobs),
    };
  } catch {
    return { printJobs: [] };
  }
}

function persistPersistentPrintJobState(storageRoot, workspace) {
  const filePath = join(storageRoot, printJobStoreKey);
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(
    filePath,
    `${JSON.stringify(
      {
        version: 1,
        updatedAt: new Date().toISOString(),
        printJobs: normalizePrintJobs(workspace.printJobs),
      },
      null,
      2,
    )}\n`,
  );
}

export function filterPrintJobs(records, filters = {}) {
  let items = normalizePrintJobs(Array.isArray(records) ? records : []);
  if (filters.status) items = items.filter((item) => item.jobStatus === filters.status);
  if (filters.targetType) items = items.filter((item) => item.targetType === filters.targetType);
  if (filters.targetId) items = items.filter((item) => item.targetId === filters.targetId);
  if (filters.printRecordId) items = items.filter((item) => item.printRecordId === filters.printRecordId);
  if (filters.printDeviceId) items = items.filter((item) => item.printDeviceId === filters.printDeviceId);
  return items.sort((left, right) => {
    const byTime = String(right.createdAt).localeCompare(String(left.createdAt));
    return byTime || String(right.printJobId).localeCompare(String(left.printJobId));
  });
}

function buildPrintJobWhereClause(filters = {}, parameters) {
  const clauses = [];
  if (filters.status) clauses.push(`job_status = ${parameters.text(filters.status)}`);
  if (filters.targetType) clauses.push(`target_type = ${parameters.text(filters.targetType)}`);
  if (filters.targetId) clauses.push(`target_id = ${parameters.text(filters.targetId)}`);
  if (filters.printRecordId) clauses.push(`print_record_id = ${parameters.text(filters.printRecordId)}`);
  if (filters.printDeviceId) clauses.push(`printer_device_id = ${parameters.text(filters.printDeviceId)}`);
  return clauses.length ? `WHERE ${clauses.join("\n  AND ")}` : "";
}

export function printJobJsonExpression(alias) {
  return `json_build_object(
    'printJobId', ${alias}.id,
    'bizNo', ${alias}.biz_no,
    'printRecordId', ${alias}.print_record_id,
    'targetType', ${alias}.target_type,
    'targetId', ${alias}.target_id,
    'documentType', ${alias}.document_type,
    'templateId', ${alias}.template_id,
    'printDeviceId', ${alias}.printer_device_id,
    'printDeviceSnapshot', ${alias}.printer_device_snapshot,
    'driverMode', ${alias}.driver_mode,
    'jobStatus', ${alias}.job_status,
    'attemptNo', ${alias}.attempt_no,
    'sourcePrintJobId', ${alias}.source_print_job_id,
    'requestedBy', ${alias}.requested_by,
    'queuedAt', ${alias}.queued_at,
    'sentAt', ${alias}.sent_at,
    'finishedAt', ${alias}.finished_at,
    'errorCode', ${alias}.error_code,
    'errorMessage', ${alias}.error_message,
    'payload', ${alias}.payload_json,
    'metadata', ${alias}.metadata_json,
    'operationLogId', ${alias}.operation_log_id,
    'revision', ${alias}.revision,
    'createdAt', ${alias}.created_at,
    'updatedAt', ${alias}.updated_at
  )`;
}

function buildInsertOperationLogSql(operationLog, parameters) {
  if (!operationLog) return "SELECT NULL::text AS id WHERE false";
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

function upsertById(rows, row, getId) {
  if (!row) return rows;
  const id = getId(row);
  const index = rows.findIndex((item) => getId(item) === id);
  if (index < 0) return [row, ...rows];
  return rows.map((item, itemIndex) => (itemIndex === index ? row : item));
}

function normalizePrintJobStatus(value) {
  const status = String(value ?? "").trim();
  if (["preview_only", "queued", "sent", "printed", "failed", "canceled"].includes(status)) return status;
  return "queued";
}

function normalizeDriverMode(value) {
  const mode = String(value ?? "").trim();
  if (["preview_only", "system_printer", "browser_download", "manual", "adapter_pending"].includes(mode)) return mode;
  return "preview_only";
}

function normalizeInteger(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.trunc(number)) : fallback;
}

function normalizeObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value;
}

function normalizeOptionalIsoTimestamp(value) {
  const text = String(value ?? "").trim();
  if (!text) return "";
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? text : date.toISOString();
}

function normalizePrintJobLimit(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 100;
  return Math.min(500, Math.max(1, Math.trunc(number)));
}

function getLocalStorageRoot() {
  return process.env.ERP_LOCAL_STORAGE_DIR ?? join(process.cwd(), ".erp-local-storage");
}
