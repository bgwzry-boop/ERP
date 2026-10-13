import { resolveStoreMode } from "./storeMode.mjs";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { createPostgresPoolClient } from "./postgresPoolClient.mjs";
import { createPostgresParameterBinder } from "./postgresSqlParameters.mjs";
import { createPostgresTransactionExecutor } from "./postgresTransactionExecutor.mjs";
import { buildPostgresIdempotencyRequest, resolveRepositoryIdempotencyKey } from "./idempotency.mjs";

export const printBatchRecordStoreKey = "metadata/print-batch-records.json";

export function createPrintBatchRepository(options = {}) {
  const mode = resolveStoreMode({
    explicitMode: options.mode,
    envKeys: ["ERP_PRINT_BATCH_STORE", "ERP_PRINT_STORE"],
    runtimeMode: options.runtimeMode,
    allowLocalFixture: options.allowLocalFixture,
  });
  if (mode === "postgres") {
    return createPostgresPrintBatchRepository({
      databaseUrl: options.databaseUrl ?? process.env.ERP_PRINT_DATABASE_URL ?? process.env.DATABASE_URL ?? process.env.PGURL,
      queryJson: options.queryJson,
      transactionJson: options.transactionJson,
      idempotentTransactionJson: options.idempotentTransactionJson,
      postgresClient: options.postgresClient,
    });
  }
  if (mode === "local") {
    return createLocalPrintBatchRepository({
      storageRoot: options.storageRoot,
    });
  }
  throw new Error(`Unsupported print batch repository mode: ${mode}`);
}

export function createLocalPrintBatchRepository(options = {}) {
  const storageRoot = options.storageRoot ?? getLocalStorageRoot();

  return {
    kind: "local_json",

    loadState() {
      return loadPersistentPrintBatchState(storageRoot);
    },

    createPrintBatchRecord({ workspace, printBatchRecord, operationLog }) {
      const record = normalizePrintBatchRecord({
        ...printBatchRecord,
        operationLogId: operationLog?.id ?? printBatchRecord?.operationLogId,
      });
      if (!record) throw new Error("Invalid print batch record");
      applyPrintBatchWorkspaceMutation({ workspace, printBatchRecord: record, operationLog });
      persistPersistentPrintBatchState(storageRoot, workspace);
      return {
        printBatchRecord: record,
        operationLogId: record.operationLogId,
      };
    },

    listPrintBatchRecords({ workspace, filters = {} }) {
      return filterPrintBatchRecords(workspace.printBatchRecords, filters);
    },
  };
}

export function createPostgresPrintBatchRepository(options = {}) {
  const postgresClient =
    options.postgresClient ?? (options.queryJson || options.transactionJson ? null : createPostgresPoolClient(options));
  const queryJson =
    options.queryJson ??
    ((text, values) => postgresClient.queryJson(text, values));
  const { idempotentTransactionJson } = createPostgresTransactionExecutor(options);

  return {
    kind: "postgres",

    async loadState() {
      const query = buildListPrintBatchRecordsQuery({});
      return {
        printBatchRecords: normalizePrintBatchRecords(await queryJson(query.text, query.values)),
      };
    },

    async createPrintBatchRecord(input = {}) {
      const { workspace, printBatchRecord, operationLog } = input;
      const query = buildCreatePrintBatchRecordTransactionQuery({ printBatchRecord, operationLog });
      const saved = normalizePrintBatchTransactionResult(
        await idempotentTransactionJson(
          buildPostgresIdempotencyRequest({
            scope: "print.batch.create",
            idempotencyKey: resolveRepositoryIdempotencyKey(input.idempotencyKey, operationLog?.id),
            payload: input.idempotencyPayload ?? { action: operationLog?.action, printBatchRecord },
            operatorId: operationLog?.operatorId,
            targetType: "print_batch",
            targetId: printBatchRecord?.printBatchId,
            resourceLocks: [`print-batch:${printBatchRecord?.printBatchId ?? ""}`],
            query,
          }),
        ),
      );
      if (!saved.printBatchRecord) throw new Error("PostgreSQL print batch insert returned an invalid record");
      applyPrintBatchWorkspaceMutation({
        workspace,
        printBatchRecord: saved.printBatchRecord,
        operationLog: saved.operationLogId === operationLog?.id ? operationLog : null,
      });
      return saved;
    },

    async listPrintBatchRecords({ filters = {} }) {
      const query = buildListPrintBatchRecordsQuery(filters);
      return normalizePrintBatchRecords(await queryJson(query.text, query.values));
    },
  };
}

export function buildCreatePrintBatchRecordTransactionSql(input) {
  return buildCreatePrintBatchRecordTransactionQuery(input).text;
}

export function buildCreatePrintBatchRecordTransactionQuery(input) {
  const parameters = createPostgresParameterBinder();
  return {
    text: buildCreatePrintBatchRecordTransactionText(input, parameters),
    values: parameters.values,
  };
}

function buildCreatePrintBatchRecordTransactionText(input, parameters) {
  const record = normalizePrintBatchRecord(input.printBatchRecord);
  const operationLog = normalizeOperationLogForPersistence(input.operationLog);
  if (!record || !operationLog) {
    throw new Error("Print batch record and operation log are required for print batch persistence");
  }
  const recordWithLog = {
    ...record,
    operationLogId: operationLog.id,
    createdAt: normalizePersistedTimestamp(record.createdAt, operationLog.occurredAt),
  };
  return `
BEGIN;
WITH inserted_print_batch AS (
  INSERT INTO print_batch_records (
    id,
    biz_no,
    action,
    result_label,
    status,
    todo_ids,
    todo_refs,
    total_task_count,
    total_label_count,
    printed_label_count,
    pending_label_count,
    printed_package_ids,
    pending_package_ids,
    print_packages_json,
    printed_packages_json,
    pending_packages_json,
    summary,
    operation_log_id,
    operator_id,
    operator_name,
    created_at,
    metadata_json
  ) VALUES (
    ${parameters.text(recordWithLog.printBatchId)},
    ${parameters.text(recordWithLog.printBatchId)},
    ${parameters.text(recordWithLog.action)},
    ${parameters.text(recordWithLog.resultLabel)},
    ${parameters.text(recordWithLog.status)},
    ${parameters.textArray(recordWithLog.todoIds)},
    ${parameters.textArray(recordWithLog.todoRefs)},
    ${parameters.integer(recordWithLog.totalTaskCount)},
    ${parameters.integer(recordWithLog.totalLabelCount)},
    ${parameters.integer(recordWithLog.printedLabelCount)},
    ${parameters.integer(recordWithLog.pendingLabelCount)},
    ${parameters.textArray(recordWithLog.printedPackageIds)},
    ${parameters.textArray(recordWithLog.pendingPackageIds)},
    ${parameters.json(recordWithLog.printPackages)},
    ${parameters.json(recordWithLog.printedPackages)},
    ${parameters.json(recordWithLog.pendingPackages)},
    ${parameters.text(recordWithLog.summary)},
    ${parameters.text(operationLog.id)},
    ${parameters.nullableText(recordWithLog.operatorId)},
    ${parameters.text(recordWithLog.operatorName)},
    ${parameters.timestamp(recordWithLog.createdAt)},
    ${parameters.json(recordWithLog.metadata)}
  )
  ON CONFLICT (id) DO UPDATE SET
    action = EXCLUDED.action,
    result_label = EXCLUDED.result_label,
    status = EXCLUDED.status,
    todo_ids = EXCLUDED.todo_ids,
    todo_refs = EXCLUDED.todo_refs,
    total_task_count = EXCLUDED.total_task_count,
    total_label_count = EXCLUDED.total_label_count,
    printed_label_count = EXCLUDED.printed_label_count,
    pending_label_count = EXCLUDED.pending_label_count,
    printed_package_ids = EXCLUDED.printed_package_ids,
    pending_package_ids = EXCLUDED.pending_package_ids,
    print_packages_json = EXCLUDED.print_packages_json,
    printed_packages_json = EXCLUDED.printed_packages_json,
    pending_packages_json = EXCLUDED.pending_packages_json,
    summary = EXCLUDED.summary,
    operation_log_id = EXCLUDED.operation_log_id,
    operator_id = EXCLUDED.operator_id,
    operator_name = EXCLUDED.operator_name,
    metadata_json = EXCLUDED.metadata_json
  RETURNING ${printBatchRecordJsonExpression("print_batch_records")} AS result
),
inserted_operation_log AS (
  ${buildInsertOperationLogSql(operationLog, parameters)}
)
SELECT json_build_object(
  'printBatchRecord', (SELECT result FROM inserted_print_batch),
  'operationLogId', (SELECT id FROM inserted_operation_log)
) AS result;
COMMIT;
`.trim();
}

export function buildListPrintBatchRecordsSql(filters = {}) {
  return buildListPrintBatchRecordsQuery(filters).text;
}

export function buildListPrintBatchRecordsQuery(filters = {}) {
  const parameters = createPostgresParameterBinder();
  const where = buildPrintBatchWhereClause(filters, parameters);
  const limit = parameters.integer(normalizePrintBatchLimit(filters.limit ?? 100));
  return {
    text: `
SELECT COALESCE(json_agg(record ORDER BY record->>'createdAt' DESC, record->>'printBatchId' DESC), '[]'::json) AS result
FROM (
  SELECT ${printBatchRecordJsonExpression("print_batch_records")} AS record
  FROM print_batch_records
  ${where}
  ORDER BY created_at DESC, id DESC
  LIMIT ${limit}
) AS ordered_print_batches;
`.trim(),
    values: parameters.values,
  };
}

export function normalizePrintBatchTransactionResult(value) {
  if (!value || typeof value !== "object") return { printBatchRecord: null, operationLogId: "" };
  return {
    printBatchRecord: normalizePrintBatchRecord(value.printBatchRecord ?? value.print_batch_record),
    operationLogId: String(value.operationLogId ?? value.operation_log_id ?? "").trim(),
  };
}

export function normalizePrintBatchRecords(value) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => normalizePrintBatchRecord(item)).filter(Boolean);
}

export function normalizePrintBatchRecord(record) {
  if (!record || typeof record !== "object") return null;
  const printBatchId = String(record.printBatchId ?? record.print_batch_id ?? record.id ?? "").trim();
  if (!printBatchId) return null;
  const printPackages = normalizePackageRows(record.printPackages ?? record.print_packages ?? record.print_packages_json);
  const printedPackageIds = normalizeStringList(
    record.printedPackageIds ?? record.printed_package_ids,
    printPackages.filter((item) => item.status === "printed").map((item) => item.packageId),
  );
  const pendingPackageIds = normalizeStringList(
    record.pendingPackageIds ?? record.pending_package_ids,
    printPackages.filter((item) => item.status !== "printed").map((item) => item.packageId),
  );
  return {
    printBatchId,
    action: String(record.action ?? "批量打印标签").trim() || "批量打印标签",
    resultLabel: String(record.resultLabel ?? record.result_label ?? "").trim() || "全部打出",
    status: normalizePrintBatchStatus(record.status),
    todoIds: normalizeStringList(record.todoIds ?? record.todo_ids),
    todoRefs: normalizeStringList(record.todoRefs ?? record.todo_refs),
    totalTaskCount: normalizeInteger(record.totalTaskCount ?? record.total_task_count, 0),
    totalLabelCount: normalizeInteger(record.totalLabelCount ?? record.total_label_count, 0),
    printedLabelCount: normalizeInteger(record.printedLabelCount ?? record.printed_label_count, 0),
    pendingLabelCount: normalizeInteger(record.pendingLabelCount ?? record.pending_label_count, 0),
    printedPackageIds,
    pendingPackageIds,
    printPackages,
    printedPackages: normalizePackageRows(record.printedPackages ?? record.printed_packages ?? record.printed_packages_json),
    pendingPackages: normalizePackageRows(record.pendingPackages ?? record.pending_packages ?? record.pending_packages_json),
    summary: String(record.summary ?? "").trim(),
    operatorId: String(record.operatorId ?? record.operator_id ?? "").trim(),
    operatorName: String(record.operatorName ?? record.operator_name ?? "").trim(),
    createdAt: String(record.createdAt ?? record.created_at ?? new Date().toISOString()).trim(),
    operationLogId: String(record.operationLogId ?? record.operation_log_id ?? "").trim(),
    metadata: normalizeMetadata(record.metadata ?? record.metadata_json),
  };
}

function applyPrintBatchWorkspaceMutation({ workspace, printBatchRecord, operationLog }) {
  workspace.printBatchRecords = workspace.printBatchRecords ?? [];
  workspace.printBatchRecords = [
    printBatchRecord,
    ...workspace.printBatchRecords.filter((item) => item.printBatchId !== printBatchRecord.printBatchId),
  ];
  if (operationLog) {
    workspace.operationLogs = workspace.operationLogs ?? [];
    workspace.operationLogs = [
      operationLog,
      ...workspace.operationLogs.filter((item) => item.id !== operationLog.id),
    ];
  }
}

function loadPersistentPrintBatchState(storageRoot) {
  const filePath = join(storageRoot, printBatchRecordStoreKey);
  if (!existsSync(filePath)) return { printBatchRecords: [] };
  try {
    const json = JSON.parse(readFileSync(filePath, "utf8"));
    return {
      printBatchRecords: normalizePrintBatchRecords(json?.printBatchRecords),
    };
  } catch {
    return { printBatchRecords: [] };
  }
}

function persistPersistentPrintBatchState(storageRoot, workspace) {
  const filePath = join(storageRoot, printBatchRecordStoreKey);
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(
    filePath,
    `${JSON.stringify(
      {
        version: 1,
        updatedAt: new Date().toISOString(),
        printBatchRecords: normalizePrintBatchRecords(workspace.printBatchRecords),
      },
      null,
      2,
    )}\n`,
  );
}

function filterPrintBatchRecords(records, filters = {}) {
  let items = normalizePrintBatchRecords(Array.isArray(records) ? records : []);
  if (filters.status) items = items.filter((item) => item.status === filters.status);
  if (filters.todoId) items = items.filter((item) => item.todoIds.includes(filters.todoId));
  return items.sort((left, right) => {
    const byTime = String(right.createdAt).localeCompare(String(left.createdAt));
    return byTime || String(right.printBatchId).localeCompare(String(left.printBatchId));
  });
}

function buildPrintBatchWhereClause(filters = {}, parameters) {
  const clauses = [];
  if (filters.status) clauses.push(`status = ${parameters.text(filters.status)}`);
  if (filters.todoId) clauses.push(`${parameters.text(filters.todoId)} = ANY(todo_ids)`);
  return clauses.length ? `WHERE ${clauses.join("\n  AND ")}` : "";
}

function printBatchRecordJsonExpression(alias) {
  return `json_build_object(
    'printBatchId', ${alias}.id,
    'action', ${alias}.action,
    'resultLabel', ${alias}.result_label,
    'status', ${alias}.status,
    'todoIds', ${alias}.todo_ids,
    'todoRefs', ${alias}.todo_refs,
    'totalTaskCount', ${alias}.total_task_count,
    'totalLabelCount', ${alias}.total_label_count,
    'printedLabelCount', ${alias}.printed_label_count,
    'pendingLabelCount', ${alias}.pending_label_count,
    'printedPackageIds', ${alias}.printed_package_ids,
    'pendingPackageIds', ${alias}.pending_package_ids,
    'printPackages', ${alias}.print_packages_json,
    'printedPackages', ${alias}.printed_packages_json,
    'pendingPackages', ${alias}.pending_packages_json,
    'summary', ${alias}.summary,
    'operationLogId', ${alias}.operation_log_id,
    'operatorId', ${alias}.operator_id,
    'operatorName', ${alias}.operator_name,
    'createdAt', ${alias}.created_at,
    'metadata', ${alias}.metadata_json
  )`;
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

function normalizeStringList(value, fallback = []) {
  const source = Array.isArray(value) ? value : fallback;
  return [...new Set(source.map((item) => String(item ?? "").trim()).filter(Boolean))];
}

function normalizePackageRows(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const packageId = String(item.packageId ?? item.package_id ?? "").trim();
      if (!packageId) return null;
      return {
        ...item,
        packageId,
        packageSeq: normalizeInteger(item.packageSeq ?? item.package_seq, 0),
        packageCount: normalizeInteger(item.packageCount ?? item.package_count, 0),
        labelText: String(item.labelText ?? item.label_text ?? "").trim(),
        status: String(item.status ?? "pending").trim() || "pending",
      };
    })
    .filter(Boolean);
}

function normalizePrintBatchStatus(value) {
  const status = String(value ?? "").trim();
  if (["printed", "partial", "not_printed", "exception"].includes(status)) return status;
  return "printed";
}

function normalizeInteger(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.trunc(number)) : fallback;
}

function normalizeMetadata(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value;
}

function normalizePrintBatchLimit(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 100;
  return Math.min(500, Math.max(1, Math.trunc(number)));
}

function normalizePersistedTimestamp(value, fallback) {
  for (const candidate of [value, fallback]) {
    const date = new Date(candidate ?? "");
    if (!Number.isNaN(date.getTime())) return date.toISOString();
  }
  return new Date().toISOString();
}

function getLocalStorageRoot() {
  return process.env.ERP_LOCAL_STORAGE_DIR ?? join(process.cwd(), ".erp-local-storage");
}
