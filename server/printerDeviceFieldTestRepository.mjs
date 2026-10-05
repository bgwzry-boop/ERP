import { resolveStoreMode } from "./storeMode.mjs";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { createPostgresPoolClient } from "./postgresPoolClient.mjs";
import { createPostgresParameterBinder } from "./postgresSqlParameters.mjs";
import { createPostgresTransactionExecutor } from "./postgresTransactionExecutor.mjs";
import { buildPostgresIdempotencyRequest, resolveRepositoryIdempotencyKey } from "./idempotency.mjs";
import {
  getPrinterDeviceFieldTestEvidenceSummary,
  normalizePrinterDeviceFieldTestEvidence,
} from "../src/services/printerDeviceFieldTestClient.js";

export const printerDeviceFieldTestStoreKey = "metadata/printer-device-field-tests.json";

export function createPrinterDeviceFieldTestRepository(options = {}) {
  const mode = resolveStoreMode({
    explicitMode: options.mode,
    envKeys: ["ERP_PRINTER_DEVICE_FIELD_TEST_STORE", "ERP_PRINT_DEVICE_QA_STORE", "ERP_PRINT_DEVICE_STORE"],
    runtimeMode: options.runtimeMode,
    allowLocalFixture: options.allowLocalFixture,
  });
  if (mode === "postgres") {
    return createPostgresPrinterDeviceFieldTestRepository({
      databaseUrl:
        options.databaseUrl ??
        process.env.ERP_PRINTER_DEVICE_FIELD_TEST_DATABASE_URL ??
        process.env.ERP_PRINT_DATABASE_URL ??
        process.env.DATABASE_URL ??
        process.env.PGURL,
      queryJson: options.queryJson,
      transactionJson: options.transactionJson,
      idempotentTransactionJson: options.idempotentTransactionJson,
      postgresClient: options.postgresClient,
    });
  }
  if (mode === "local") {
    return createLocalPrinterDeviceFieldTestRepository({
      storageRoot: options.storageRoot,
    });
  }
  throw new Error(`Unsupported printer device field-test repository mode: ${mode}`);
}

export function createLocalPrinterDeviceFieldTestRepository(options = {}) {
  const storageRoot = options.storageRoot ?? getLocalStorageRoot();

  return {
    kind: "local_json",

    loadState() {
      return loadPersistentPrinterDeviceFieldTestState(storageRoot);
    },

    recordPrinterDeviceFieldTest(input = {}) {
      const record = normalizePrinterDeviceFieldTestRecord(input.record);
      if (!record) throw new Error("Invalid printer device field-test record");
      applyPrinterDeviceFieldTestWorkspaceMutation({
        workspace: input.workspace,
        record,
        operationLog: input.operationLog,
      });
      persistPersistentPrinterDeviceFieldTestState(storageRoot, input.workspace);
      return {
        record,
        operationLogId: input.operationLog?.id ?? "",
      };
    },

    listPrinterDeviceFieldTests({ workspace, filters = {} }) {
      return filterPrinterDeviceFieldTests(workspace.printerDeviceFieldTests, filters);
    },
  };
}

export function createPostgresPrinterDeviceFieldTestRepository(options = {}) {
  const databaseUrl = options.databaseUrl;
  const postgresClient = options.postgresClient ?? (options.queryJson ? null : createPostgresPoolClient({ databaseUrl }));
  const queryJson =
    options.queryJson ??
    ((text, values) => postgresClient.queryJson(text, values));
  const { idempotentTransactionJson } = createPostgresTransactionExecutor({
    ...options,
    databaseUrl,
    postgresClient,
  });

  return {
    kind: "postgres",

    async loadState() {
      const builtQuery = buildListPrinterDeviceFieldTestsQuery({});
      return {
        printerDeviceFieldTests: normalizePrinterDeviceFieldTestRecords(await queryJson(builtQuery.text, builtQuery.values)),
      };
    },

    async recordPrinterDeviceFieldTest(input = {}) {
      const builtQuery = buildRecordPrinterDeviceFieldTestTransactionQuery(input);
      const recordId = input.record?.recordId ?? input.record?.id ?? "";
      const printDeviceId = input.record?.printDeviceId ?? input.record?.printerDeviceId ?? "";
      const result = normalizePrinterDeviceFieldTestTransactionResult(
        await idempotentTransactionJson(
          buildPostgresIdempotencyRequest({
            scope: "print.device.field_test",
            idempotencyKey: resolveRepositoryIdempotencyKey(input.idempotencyKey, input.operationLog?.id),
            payload: input.idempotencyPayload ?? {
              action: input.operationLog?.action,
              record: input.record,
            },
            operatorId: input.operationLog?.operatorId,
            targetType: "print_device",
            targetId: printDeviceId,
            resourceLocks: [
              `print-device:${printDeviceId}`,
              `printer-device-field-test:${recordId}`,
            ],
            query: builtQuery,
          }),
        ),
      );
      if (!result.record) throw new Error("PostgreSQL printer device field-test save returned an invalid record");
      applyPrinterDeviceFieldTestWorkspaceMutation({
        workspace: input.workspace,
        record: result.record,
        operationLog: input.operationLog,
      });
      return result;
    },

    async listPrinterDeviceFieldTests({ filters = {} }) {
      const builtQuery = buildListPrinterDeviceFieldTestsQuery(filters);
      return normalizePrinterDeviceFieldTestRecords(await queryJson(builtQuery.text, builtQuery.values));
    },
  };
}

export function buildRecordPrinterDeviceFieldTestTransactionSql(input = {}) {
  return buildRecordPrinterDeviceFieldTestTransactionQuery(input).text;
}

export function buildRecordPrinterDeviceFieldTestTransactionQuery(input = {}) {
  const record = normalizePrinterDeviceFieldTestRecord(input.record);
  const operationLog = normalizeOperationLogForPersistence(input.operationLog);
  if (!record || !operationLog) {
    throw new Error("Printer device field-test record and operation log are required");
  }

  const parameters = createPostgresParameterBinder();
  return {
    text: `
BEGIN;
WITH inserted_operation_log AS (
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
  ) VALUES (
    ${parameters.text(operationLog.id)},
    ${parameters.text(operationLog.targetType)},
    ${parameters.text(operationLog.targetId)},
    ${parameters.text(operationLog.action)},
    ${parameters.json(operationLog.before ?? {})},
    ${parameters.json(operationLog.after ?? {})},
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
  RETURNING id
),
upserted_field_test AS (
  INSERT INTO printer_device_field_tests (
    id,
    biz_no,
    printer_device_id,
    print_job_id,
    document_type,
    operator_id,
    operator_name,
    checked_at,
    device_label,
    driver_label,
    paper_label,
    checks_json,
    summary_json,
    note,
    operation_log_id,
    created_at,
    updated_at
  ) VALUES (
    ${parameters.text(record.recordId)},
    ${parameters.text(record.bizNo)},
    ${parameters.text(record.printDeviceId)},
    ${parameters.nullableText(record.printJobId)},
    ${parameters.text(record.documentType)},
    ${parameters.nullableText(record.operatorId)},
    ${parameters.text(record.operatorName)},
    ${parameters.timestamp(record.checkedAt)},
    ${parameters.text(record.deviceLabel)},
    ${parameters.text(record.driverLabel)},
    ${parameters.text(record.paperLabel)},
    ${parameters.json(record.checks)},
    ${parameters.json(record.summary)},
    ${parameters.text(record.note)},
    (SELECT id FROM inserted_operation_log),
    ${parameters.timestamp(record.createdAt)},
    now()
  )
  ON CONFLICT (id) DO UPDATE SET
    biz_no = EXCLUDED.biz_no,
    printer_device_id = EXCLUDED.printer_device_id,
    print_job_id = EXCLUDED.print_job_id,
    document_type = EXCLUDED.document_type,
    operator_id = EXCLUDED.operator_id,
    operator_name = EXCLUDED.operator_name,
    checked_at = EXCLUDED.checked_at,
    device_label = EXCLUDED.device_label,
    driver_label = EXCLUDED.driver_label,
    paper_label = EXCLUDED.paper_label,
    checks_json = EXCLUDED.checks_json,
    summary_json = EXCLUDED.summary_json,
    note = EXCLUDED.note,
    operation_log_id = EXCLUDED.operation_log_id,
    updated_at = now()
  RETURNING ${printerDeviceFieldTestJsonExpression("printer_device_field_tests")} AS result
)
SELECT json_build_object(
  'record', (SELECT result FROM upserted_field_test),
  'operationLogId', (SELECT id FROM inserted_operation_log)
) AS result;
COMMIT;
`.trim(),
    values: parameters.values,
  };
}

export function buildListPrinterDeviceFieldTestsSql(filters = {}) {
  return buildListPrinterDeviceFieldTestsQuery(filters).text;
}

export function buildListPrinterDeviceFieldTestsQuery(filters = {}) {
  const parameters = createPostgresParameterBinder();
  const where = buildPrinterDeviceFieldTestWhereClause(filters, parameters);
  const limit = normalizeLimit(filters.limit ?? 200);
  return {
    text: `
SELECT COALESCE(json_agg(record), '[]'::json) AS result
FROM (
  SELECT ${printerDeviceFieldTestJsonExpression("printer_device_field_tests")} AS record
  FROM printer_device_field_tests
  ${where}
  ORDER BY checked_at DESC, id DESC
  LIMIT ${parameters.integer(limit)}
) AS ordered_printer_device_field_tests;
`.trim(),
    values: parameters.values,
  };
}

export function normalizePrinterDeviceFieldTestTransactionResult(value = {}) {
  return {
    record: normalizePrinterDeviceFieldTestRecord(value?.record ?? value?.printerDeviceFieldTest),
    operationLogId: cleanText(value?.operationLogId ?? value?.operation_log_id),
  };
}

export function normalizePrinterDeviceFieldTestRecords(value = []) {
  return Array.isArray(value) ? value.map((item) => normalizePrinterDeviceFieldTestRecord(item)).filter(Boolean) : [];
}

export function normalizePrinterDeviceFieldTestRecord(value = {}) {
  if (!value || typeof value !== "object") return null;
  const recordId = cleanText(value.recordId ?? value.record_id ?? value.id);
  const printDeviceId = cleanText(value.printDeviceId ?? value.print_device_id ?? value.printerDeviceId ?? value.printer_device_id);
  if (!recordId || !printDeviceId) return null;
  const summary = normalizeObject(value.summary ?? value.summary_json);
  const checks = normalizeArray(value.checks ?? value.checks_json);
  const evidence = normalizePrinterDeviceFieldTestEvidence(value.evidence ?? value.evidence_json ?? summary.evidence);
  const evidenceSummary = getPrinterDeviceFieldTestEvidenceSummary(evidence);
  const checkedAt = cleanText(value.checkedAt ?? value.checked_at) || new Date().toISOString();
  const createdAt = cleanText(value.createdAt ?? value.created_at) || checkedAt;
  return {
    id: recordId,
    recordId,
    bizNo: cleanText(value.bizNo ?? value.biz_no) || recordId,
    printDeviceId,
    printJobId: cleanText(value.printJobId ?? value.print_job_id),
    documentType: cleanText(value.documentType ?? value.document_type),
    operatorId: cleanText(value.operatorId ?? value.operator_id),
    operatorName: cleanText(value.operatorName ?? value.operator_name),
    checkedAt,
    deviceLabel: cleanText(value.deviceLabel ?? value.device_label),
    driverLabel: cleanText(value.driverLabel ?? value.driver_label),
    paperLabel: cleanText(value.paperLabel ?? value.paper_label),
    summary: {
      ...summary,
      evidence,
      evidenceSummary: summary.evidenceSummary ?? evidenceSummary,
    },
    checks,
    evidence,
    note: cleanText(value.note),
    operationLogId: cleanText(value.operationLogId ?? value.operation_log_id),
    createdAt,
    updatedAt: cleanText(value.updatedAt ?? value.updated_at) || createdAt,
  };
}

function applyPrinterDeviceFieldTestWorkspaceMutation(input = {}) {
  const workspace = input.workspace;
  if (!workspace || !input.record) return;
  workspace.printerDeviceFieldTests = upsertById(
    workspace.printerDeviceFieldTests ?? [],
    input.record,
    (item) => item?.recordId ?? item?.id,
  );
  workspace.printDevices = (workspace.printDevices ?? []).map((device) =>
    device.printDeviceId === input.record.printDeviceId
      ? {
          ...device,
          latestFieldTestRecord: input.record,
          latestFieldTestSummary: input.record.summary,
          latestFieldTestCheckedAt: input.record.checkedAt,
        }
      : device,
  );
  if (input.operationLog) {
    workspace.operationLogs = upsertById(workspace.operationLogs ?? [], input.operationLog);
  }
}

function loadPersistentPrinterDeviceFieldTestState(storageRoot) {
  const filePath = join(storageRoot, printerDeviceFieldTestStoreKey);
  if (!existsSync(filePath)) return { printerDeviceFieldTests: [] };
  try {
    const json = JSON.parse(readFileSync(filePath, "utf8"));
    return {
      printerDeviceFieldTests: normalizePrinterDeviceFieldTestRecords(json?.printerDeviceFieldTests),
    };
  } catch {
    return { printerDeviceFieldTests: [] };
  }
}

function persistPersistentPrinterDeviceFieldTestState(storageRoot, workspace = {}) {
  const filePath = join(storageRoot, printerDeviceFieldTestStoreKey);
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(
    filePath,
    `${JSON.stringify(
      {
        version: 1,
        updatedAt: new Date().toISOString(),
        printerDeviceFieldTests: normalizePrinterDeviceFieldTestRecords(workspace.printerDeviceFieldTests),
      },
      null,
      2,
    )}\n`,
  );
}

export function filterPrinterDeviceFieldTests(records, filters = {}) {
  let items = normalizePrinterDeviceFieldTestRecords(Array.isArray(records) ? records : []);
  if (filters.printDeviceId) items = items.filter((item) => item.printDeviceId === filters.printDeviceId);
  if (filters.printJobId) items = items.filter((item) => item.printJobId === filters.printJobId);
  if (filters.documentType) items = items.filter((item) => item.documentType === filters.documentType);
  if (filters.operatorId) items = items.filter((item) => item.operatorId === filters.operatorId);
  return items
    .sort((left, right) => right.checkedAt.localeCompare(left.checkedAt) || right.recordId.localeCompare(left.recordId))
    .slice(0, normalizeLimit(filters.limit ?? 200));
}

function buildPrinterDeviceFieldTestWhereClause(filters = {}, parameters) {
  const clauses = [];
  if (filters.printDeviceId) clauses.push(`printer_device_id = ${parameters.text(filters.printDeviceId)}`);
  if (filters.printJobId) clauses.push(`print_job_id = ${parameters.text(filters.printJobId)}`);
  if (filters.documentType) clauses.push(`document_type = ${parameters.text(filters.documentType)}`);
  if (filters.operatorId) clauses.push(`operator_id = ${parameters.text(filters.operatorId)}`);
  return clauses.length ? `WHERE ${clauses.join("\n  AND ")}` : "";
}

function normalizeOperationLogForPersistence(value = {}) {
  if (!value || typeof value !== "object") return null;
  const id = cleanText(value.id);
  const targetType = cleanText(value.targetType ?? value.target_type);
  const targetId = cleanText(value.targetId ?? value.target_id);
  const action = cleanText(value.action);
  if (!id || !targetType || !targetId || !action) return null;
  return {
    id,
    targetType,
    targetId,
    action,
    before: value.before ?? value.beforeJson ?? value.before_json ?? null,
    after: value.after ?? value.afterJson ?? value.after_json ?? null,
    reason: cleanText(value.reason),
    operatorId: cleanText(value.operatorId ?? value.operator_id),
    pageKey: cleanText(value.pageKey ?? value.page_key) || "api",
    occurredAt: cleanText(value.occurredAt ?? value.occurred_at),
    createdAt: cleanText(value.createdAt ?? value.created_at),
  };
}

function printerDeviceFieldTestJsonExpression(alias) {
  return `json_build_object(
    'recordId', ${alias}.id,
    'id', ${alias}.id,
    'bizNo', ${alias}.biz_no,
    'printDeviceId', ${alias}.printer_device_id,
    'printJobId', COALESCE(${alias}.print_job_id, ''),
    'documentType', ${alias}.document_type,
    'operatorId', COALESCE(${alias}.operator_id, ''),
    'operatorName', ${alias}.operator_name,
    'checkedAt', COALESCE(${alias}.checked_at::TEXT, ''),
    'deviceLabel', ${alias}.device_label,
    'driverLabel', ${alias}.driver_label,
    'paperLabel', ${alias}.paper_label,
    'summary', ${alias}.summary_json,
    'checks', ${alias}.checks_json,
    'evidence', ${alias}.summary_json->'evidence',
    'note', ${alias}.note,
    'operationLogId', COALESCE(${alias}.operation_log_id, ''),
    'createdAt', COALESCE(${alias}.created_at::TEXT, ''),
    'updatedAt', COALESCE(${alias}.updated_at::TEXT, '')
  )`;
}

function upsertById(rows, row, getId = (value) => value?.id) {
  if (!row) return rows;
  const id = getId(row);
  if (!id) return rows;
  const index = rows.findIndex((item) => getId(item) === id);
  if (index < 0) return [row, ...rows];
  return rows.map((item, itemIndex) => (itemIndex === index ? { ...item, ...row } : item));
}

function cleanText(value) {
  return String(value ?? "").trim();
}

function normalizeObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function normalizeArray(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeLimit(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 200;
  return Math.min(500, Math.max(1, Math.trunc(number)));
}


function getLocalStorageRoot() {
  return process.env.ERP_LOCAL_STORAGE_DIR ?? join(process.cwd(), ".erp-local-storage");
}
