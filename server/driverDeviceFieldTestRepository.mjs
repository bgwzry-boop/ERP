import { createPostgresPoolClient } from "./postgresPoolClient.mjs";
import { createPostgresParameterBinder } from "./postgresSqlParameters.mjs";

export function createDriverDeviceFieldTestRepository(options = {}) {
  const mode =
    options.mode ??
    process.env.ERP_DRIVER_DEVICE_FIELD_TEST_STORE ??
    process.env.ERP_DRIVER_DEVICE_QA_STORE ??
    process.env.ERP_DRIVER_TASK_STORE ??
    process.env.ERP_FULFILLMENT_STORE ??
    "local";
  if (mode === "postgres") {
    return createPostgresDriverDeviceFieldTestRepository({
      databaseUrl:
        options.databaseUrl ??
        process.env.ERP_DRIVER_DEVICE_FIELD_TEST_DATABASE_URL ??
        process.env.ERP_DRIVER_TASK_DATABASE_URL ??
        process.env.DATABASE_URL ??
        process.env.PGURL,
      queryJson: options.queryJson,
      postgresClient: options.postgresClient,
    });
  }
  if (mode === "local") return createLocalDriverDeviceFieldTestRepository();
  throw new Error(`Unsupported driver device field-test repository mode: ${mode}`);
}

export function createLocalDriverDeviceFieldTestRepository() {
  return {
    kind: "local_memory",

    loadState() {
      return { driverDeviceFieldTests: [] };
    },

    recordDriverDeviceFieldTest(input = {}) {
      const record = normalizeDriverDeviceFieldTestRecord(input.record);
      if (!record) throw new Error("Invalid driver device field-test record");
      applyDriverDeviceFieldTestWorkspaceMutation({
        workspace: input.workspace,
        record,
        operationLog: input.operationLog,
      });
      return {
        record,
        operationLogId: input.operationLog?.id ?? "",
      };
    },
  };
}

export function createPostgresDriverDeviceFieldTestRepository(options = {}) {
  const databaseUrl = options.databaseUrl;
  const postgresClient = options.postgresClient ?? (options.queryJson ? null : createPostgresPoolClient({ databaseUrl }));
  const queryJson =
    options.queryJson ??
    ((text, values) => postgresClient.transactionJson(text, values));

  return {
    kind: "postgres",

    async loadState() {
      return { driverDeviceFieldTests: [] };
    },

    async recordDriverDeviceFieldTest(input = {}) {
      const builtQuery = buildRecordDriverDeviceFieldTestTransactionQuery(input);
      const result = normalizeDriverDeviceFieldTestTransactionResult(
        await queryJson(builtQuery.text, builtQuery.values),
      );
      if (!result.record) throw new Error("PostgreSQL driver device field-test save returned an invalid record");
      applyDriverDeviceFieldTestWorkspaceMutation({
        workspace: input.workspace,
        record: result.record,
        operationLog: input.operationLog,
      });
      return result;
    },
  };
}

export function buildRecordDriverDeviceFieldTestTransactionSql(input = {}) {
  return buildRecordDriverDeviceFieldTestTransactionQuery(input).text;
}

export function buildRecordDriverDeviceFieldTestTransactionQuery(input = {}) {
  const record = normalizeDriverDeviceFieldTestRecord(input.record);
  const operationLog = normalizeOperationLogForPersistence(input.operationLog);
  if (!record || !operationLog) {
    throw new Error("Driver device field-test record and operation log are required");
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
  INSERT INTO driver_device_field_tests (
    id,
    biz_no,
    fulfillment_id,
    order_line_id,
    driver_id,
    operator_id,
    operator_name,
    checked_at,
    device_label,
    browser_label,
    user_agent,
    language,
    checks_json,
    summary_json,
    note,
    operation_log_id,
    created_at,
    updated_at
  ) VALUES (
    ${parameters.text(record.recordId)},
    ${parameters.text(record.bizNo)},
    ${parameters.text(record.fulfillmentId)},
    ${parameters.nullableText(record.orderLineId)},
    ${parameters.nullableText(record.driverId)},
    ${parameters.nullableText(record.operatorId)},
    ${parameters.text(record.operatorName)},
    ${parameters.timestamp(record.checkedAt)},
    ${parameters.text(record.deviceLabel)},
    ${parameters.text(record.browserLabel)},
    ${parameters.text(record.userAgent)},
    ${parameters.text(record.language)},
    ${parameters.json(record.checks)},
    ${parameters.json(buildDriverDeviceFieldTestSummaryForPersistence(record))},
    ${parameters.text(record.note)},
    (SELECT id FROM inserted_operation_log),
    ${parameters.timestamp(record.createdAt)},
    now()
  )
  ON CONFLICT (id) DO UPDATE SET
    biz_no = EXCLUDED.biz_no,
    fulfillment_id = EXCLUDED.fulfillment_id,
    order_line_id = EXCLUDED.order_line_id,
    driver_id = EXCLUDED.driver_id,
    operator_id = EXCLUDED.operator_id,
    operator_name = EXCLUDED.operator_name,
    checked_at = EXCLUDED.checked_at,
    device_label = EXCLUDED.device_label,
    browser_label = EXCLUDED.browser_label,
    user_agent = EXCLUDED.user_agent,
    language = EXCLUDED.language,
    checks_json = EXCLUDED.checks_json,
    summary_json = EXCLUDED.summary_json,
    note = EXCLUDED.note,
    operation_log_id = EXCLUDED.operation_log_id,
    updated_at = now()
  RETURNING ${driverDeviceFieldTestJsonExpression("driver_device_field_tests")} AS result
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

export function normalizeDriverDeviceFieldTestTransactionResult(value = {}) {
  return {
    record: normalizeDriverDeviceFieldTestRecord(value?.record ?? value?.driverDeviceFieldTest),
    operationLogId: cleanText(value?.operationLogId ?? value?.operation_log_id),
  };
}

export function normalizeDriverDeviceFieldTestRecord(value = {}) {
  if (!value || typeof value !== "object") return null;
  const recordId = cleanText(value.recordId ?? value.record_id ?? value.id);
  const fulfillmentId = cleanText(value.fulfillmentId ?? value.fulfillment_id);
  if (!recordId || !fulfillmentId) return null;
  const summary = normalizeObject(value.summary ?? value.summary_json);
  const checks = normalizeArray(value.checks ?? value.checks_json);
  const packageLabelScanSample = normalizeObject(
    value.packageLabelScanSample ??
      value.package_label_scan_sample ??
      summary.packageLabelScanSample ??
      summary.package_label_scan_sample,
  );
  const nativeBridgeDiagnostics = normalizeObject(
    value.nativeBridgeDiagnostics ??
      value.native_bridge_diagnostics ??
      summary.nativeBridgeDiagnostics ??
      summary.native_bridge_diagnostics,
  );
  const nativeNavigationSample = normalizeObject(
    value.nativeNavigationSample ??
      value.native_navigation_sample ??
      summary.nativeNavigationSample ??
      summary.native_navigation_sample,
  );
  const checkedAt = cleanText(value.checkedAt ?? value.checked_at) || new Date().toISOString();
  const createdAt = cleanText(value.createdAt ?? value.created_at) || checkedAt;
  return {
    id: recordId,
    recordId,
    bizNo: cleanText(value.bizNo ?? value.biz_no) || recordId,
    fulfillmentId,
    orderLineId: cleanText(value.orderLineId ?? value.order_line_id),
    driverId: cleanText(value.driverId ?? value.driver_id),
    operatorId: cleanText(value.operatorId ?? value.operator_id),
    operatorName: cleanText(value.operatorName ?? value.operator_name),
    checkedAt,
    deviceLabel: cleanText(value.deviceLabel ?? value.device_label),
    browserLabel: cleanText(value.browserLabel ?? value.browser_label),
    userAgent: cleanText(value.userAgent ?? value.user_agent),
    language: cleanText(value.language),
    summary,
    checks,
    packageLabelScanSample,
    nativeNavigationSample,
    nativeBridgeDiagnostics,
    note: cleanText(value.note),
    operationLogId: cleanText(value.operationLogId ?? value.operation_log_id),
    createdAt,
    updatedAt: cleanText(value.updatedAt ?? value.updated_at) || createdAt,
  };
}

function buildDriverDeviceFieldTestSummaryForPersistence(record = {}) {
  const summary = { ...(record.summary ?? {}) };
  if (record.packageLabelScanSample && Object.keys(record.packageLabelScanSample).length) {
    summary.packageLabelScanSample = record.packageLabelScanSample;
  }
  if (record.nativeBridgeDiagnostics && Object.keys(record.nativeBridgeDiagnostics).length) {
    summary.nativeBridgeDiagnostics = record.nativeBridgeDiagnostics;
  }
  if (record.nativeNavigationSample && Object.keys(record.nativeNavigationSample).length) {
    summary.nativeNavigationSample = record.nativeNavigationSample;
  }
  return summary;
}

function applyDriverDeviceFieldTestWorkspaceMutation(input = {}) {
  const workspace = input.workspace;
  if (!workspace || !input.record) return;
  workspace.driverDeviceFieldTests = upsertById(
    workspace.driverDeviceFieldTests ?? [],
    input.record,
    (item) => item?.recordId ?? item?.id,
  );
  workspace.fulfillments = (workspace.fulfillments ?? []).map((fulfillment) =>
    fulfillment.id === input.record.fulfillmentId || fulfillment.fulfillmentId === input.record.fulfillmentId
      ? {
          ...fulfillment,
          deviceFieldTestRecord: input.record,
          latestDeviceFieldTestRecord: input.record,
          deviceFieldTestSummary: input.record.summary,
          deviceFieldTestCheckedAt: input.record.checkedAt,
        }
      : fulfillment,
  );
  if (input.operationLog) {
    workspace.operationLogs = upsertById(workspace.operationLogs ?? [], input.operationLog);
  }
}

function upsertById(rows, row, getId = (value) => value?.id) {
  if (!row) return rows;
  const id = getId(row);
  if (!id) return rows;
  const index = rows.findIndex((item) => getId(item) === id);
  if (index < 0) return [row, ...rows];
  return rows.map((item, itemIndex) => (itemIndex === index ? { ...item, ...row } : item));
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

function driverDeviceFieldTestJsonExpression(alias) {
  return `json_build_object(
    'recordId', ${alias}.id,
    'id', ${alias}.id,
    'bizNo', ${alias}.biz_no,
    'fulfillmentId', ${alias}.fulfillment_id,
    'orderLineId', COALESCE(${alias}.order_line_id, ''),
    'driverId', COALESCE(${alias}.driver_id, ''),
    'operatorId', COALESCE(${alias}.operator_id, ''),
    'operatorName', ${alias}.operator_name,
    'checkedAt', COALESCE(${alias}.checked_at::TEXT, ''),
    'deviceLabel', ${alias}.device_label,
    'browserLabel', ${alias}.browser_label,
    'userAgent', ${alias}.user_agent,
    'language', ${alias}.language,
    'summary', ${alias}.summary_json,
    'checks', ${alias}.checks_json,
    'packageLabelScanSample', ${alias}.summary_json->'packageLabelScanSample',
    'nativeNavigationSample', ${alias}.summary_json->'nativeNavigationSample',
    'nativeBridgeDiagnostics', ${alias}.summary_json->'nativeBridgeDiagnostics',
    'note', ${alias}.note,
    'operationLogId', COALESCE(${alias}.operation_log_id, ''),
    'createdAt', COALESCE(${alias}.created_at::TEXT, ''),
    'updatedAt', COALESCE(${alias}.updated_at::TEXT, '')
  )`;
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
