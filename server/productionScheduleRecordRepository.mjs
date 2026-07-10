import { createPostgresPoolClient } from "./postgresPoolClient.mjs";
import { createPostgresParameterBinder } from "./postgresSqlParameters.mjs";

export function createProductionScheduleRecordRepository(options = {}) {
  const mode =
    options.mode ??
    process.env.ERP_PRODUCTION_SCHEDULE_RECORD_STORE ??
    process.env.ERP_PRODUCTION_SCHEDULE_STORE ??
    process.env.ERP_PRODUCTION_STORE ??
    "local";
  if (mode === "postgres") {
    return createPostgresProductionScheduleRecordRepository({
      databaseUrl:
        options.databaseUrl ??
        process.env.ERP_PRODUCTION_SCHEDULE_DATABASE_URL ??
        process.env.ERP_PRODUCTION_DATABASE_URL ??
        process.env.DATABASE_URL ??
        process.env.PGURL,
      queryJson: options.queryJson,
      postgresClient: options.postgresClient,
    });
  }
  if (mode === "local") return createLocalProductionScheduleRecordRepository();
  throw new Error(`Unsupported production schedule record repository mode: ${mode}`);
}

export function createLocalProductionScheduleRecordRepository() {
  return {
    kind: "local_memory",

    loadState() {
      return { productionScheduleRecords: [] };
    },

    listProductionScheduleRecords({ workspace, filters = {} } = {}) {
      return filterProductionScheduleRecords(workspace?.productionScheduleRecords ?? [], filters);
    },

    resequenceMachineQueue(input = {}) {
      const records = normalizeProductionScheduleRecords(input.records ?? []);
      const operationLog = normalizeOperationLogForPersistence(input.operationLog);
      if (!records.length || !operationLog) {
        throw new Error("Production schedule records and operation log are required for resequencing");
      }
      applyProductionScheduleRecordWorkspaceMutation({
        workspace: input.workspace,
        records,
        operationLog: input.operationLog,
      });
      return {
        productionScheduleRecords: records,
        operationLogId: operationLog.id,
      };
    },

    moveMachineQueueItem(input = {}) {
      const records = normalizeProductionScheduleRecords(input.records ?? []);
      const productionTask = normalizeProductionTaskForMachineMove(input.productionTask);
      const operationLog = normalizeOperationLogForPersistence(input.operationLog);
      if (!records.length || !productionTask || !operationLog) {
        throw new Error("Production task, schedule records, and operation log are required for moving a schedule item");
      }
      applyProductionScheduleRecordWorkspaceMutation({
        workspace: input.workspace,
        records,
        productionTask,
        operationLog: input.operationLog,
      });
      return {
        productionTask,
        productionScheduleRecords: records,
        operationLogId: operationLog.id,
      };
    },
  };
}

export function createPostgresProductionScheduleRecordRepository(options = {}) {
  const databaseUrl = options.databaseUrl;
  const postgresClient = options.postgresClient ?? (options.queryJson ? null : createPostgresPoolClient({ databaseUrl }));
  const queryJson =
    options.queryJson ??
    ((text, values) => postgresClient.queryJson(text, values));
  const transactionJson =
    options.queryJson ??
    ((text, values) => postgresClient.transactionJson(text, values));

  return {
    kind: "postgres",

    async loadState() {
      const builtQuery = buildListProductionScheduleRecordsQuery({});
      return {
        productionScheduleRecords: normalizeProductionScheduleRecords(
          await queryJson(builtQuery.text, builtQuery.values),
        ),
      };
    },

    async listProductionScheduleRecords({ filters = {} } = {}) {
      const builtQuery = buildListProductionScheduleRecordsQuery(filters);
      return normalizeProductionScheduleRecords(await queryJson(builtQuery.text, builtQuery.values));
    },

    async resequenceMachineQueue(input = {}) {
      const builtQuery = buildResequenceProductionScheduleRecordsTransactionQuery(input);
      const result = normalizeProductionScheduleResequenceResult(
        await transactionJson(builtQuery.text, builtQuery.values),
      );
      if (!result.productionScheduleRecords.length) {
        throw new Error("PostgreSQL production schedule resequence returned no records");
      }
      applyProductionScheduleRecordWorkspaceMutation({
        workspace: input.workspace,
        records: result.productionScheduleRecords,
        operationLog: input.operationLog,
      });
      return result;
    },

    async moveMachineQueueItem(input = {}) {
      const builtQuery = buildMoveProductionScheduleQueueItemTransactionQuery(input);
      const result = normalizeProductionScheduleMoveResult(
        await transactionJson(builtQuery.text, builtQuery.values),
      );
      if (!result.productionTask || !result.productionScheduleRecords.length) {
        throw new Error("PostgreSQL production schedule move returned no production task or schedule records");
      }
      applyProductionScheduleRecordWorkspaceMutation({
        workspace: input.workspace,
        records: result.productionScheduleRecords,
        productionTask: result.productionTask,
        operationLog: input.operationLog,
      });
      return result;
    },
  };
}

export function buildResequenceProductionScheduleRecordsTransactionSql(input = {}) {
  return buildResequenceProductionScheduleRecordsTransactionQuery(input).text;
}

export function buildResequenceProductionScheduleRecordsTransactionQuery(input = {}) {
  const records = normalizeProductionScheduleRecords(input.records ?? []);
  const operationLog = normalizeOperationLogForPersistence(input.operationLog);
  if (!records.length || !operationLog) {
    throw new Error("Production schedule records and operation log are required for resequencing");
  }

  const parameters = createPostgresParameterBinder();
  const scheduleRecordValues = records.map((record) => buildProductionScheduleRecordValuesSql(record, parameters)).join(",\n    ");
  const operationLogSql = buildInsertOperationLogSql(operationLog, parameters);
  return {
    text: `
BEGIN;
WITH upserted_schedule_records AS (
  INSERT INTO production_schedule_records (
    id,
    biz_no,
    production_task_id,
    order_line_id,
    published_schedule_id,
    machine_id,
    queue_seq,
    schedule_status,
    source_kind,
    planned_start_at,
    planned_end_at,
    sequence_updated_at,
    sequence_updated_by,
    remark,
    created_by,
    created_at,
    updated_at
  ) VALUES
    ${scheduleRecordValues}
  ON CONFLICT (machine_id, production_task_id) DO UPDATE SET
    order_line_id = EXCLUDED.order_line_id,
    published_schedule_id = EXCLUDED.published_schedule_id,
    queue_seq = EXCLUDED.queue_seq,
    schedule_status = EXCLUDED.schedule_status,
    source_kind = EXCLUDED.source_kind,
    planned_start_at = EXCLUDED.planned_start_at,
    planned_end_at = EXCLUDED.planned_end_at,
    sequence_updated_at = EXCLUDED.sequence_updated_at,
    sequence_updated_by = EXCLUDED.sequence_updated_by,
    remark = EXCLUDED.remark,
    updated_at = now()
  RETURNING ${productionScheduleRecordJsonExpression("production_schedule_records")} AS result
),
inserted_operation_log AS (
  ${operationLogSql}
)
SELECT json_build_object(
  'productionScheduleRecords', (
    SELECT COALESCE(json_agg(result ORDER BY (result->>'machineId'), (result->>'queueSeq')::int, result->>'productionTaskId'), '[]'::json)
    FROM upserted_schedule_records
  ),
  'operationLogId', (SELECT id FROM inserted_operation_log)
) AS result;
COMMIT;
`.trim(),
    values: parameters.values,
  };
}

export function buildMoveProductionScheduleQueueItemTransactionSql(input = {}) {
  return buildMoveProductionScheduleQueueItemTransactionQuery(input).text;
}

export function buildMoveProductionScheduleQueueItemTransactionQuery(input = {}) {
  const records = normalizeProductionScheduleRecords(input.records ?? []);
  const productionTask = normalizeProductionTaskForMachineMove(input.productionTask);
  const operationLog = normalizeOperationLogForPersistence(input.operationLog);
  if (!records.length || !productionTask || !operationLog) {
    throw new Error("Production task, schedule records, and operation log are required for moving a schedule item");
  }

  const parameters = createPostgresParameterBinder();
  const machineId = parameters.text(productionTask.machineId);
  const productionTaskId = parameters.text(productionTask.productionTaskId);
  const scheduleRecordValues = records.map((record) => buildProductionScheduleRecordValuesSql(record, parameters)).join(",\n    ");
  const operationLogSql = buildInsertOperationLogSql(operationLog, parameters);
  return {
    text: `
BEGIN;
WITH updated_production_task AS (
  UPDATE production_tasks
  SET
    machine_id = ${machineId},
    updated_at = now()
  WHERE id = ${productionTaskId}
  RETURNING ${productionTaskJsonExpression("production_tasks")} AS result
),
upserted_schedule_records AS (
  INSERT INTO production_schedule_records (
    id,
    biz_no,
    production_task_id,
    order_line_id,
    published_schedule_id,
    machine_id,
    queue_seq,
    schedule_status,
    source_kind,
    planned_start_at,
    planned_end_at,
    sequence_updated_at,
    sequence_updated_by,
    remark,
    created_by,
    created_at,
    updated_at
  ) VALUES
    ${scheduleRecordValues}
  ON CONFLICT (machine_id, production_task_id) DO UPDATE SET
    order_line_id = EXCLUDED.order_line_id,
    published_schedule_id = EXCLUDED.published_schedule_id,
    queue_seq = EXCLUDED.queue_seq,
    schedule_status = EXCLUDED.schedule_status,
    source_kind = EXCLUDED.source_kind,
    planned_start_at = EXCLUDED.planned_start_at,
    planned_end_at = EXCLUDED.planned_end_at,
    sequence_updated_at = EXCLUDED.sequence_updated_at,
    sequence_updated_by = EXCLUDED.sequence_updated_by,
    remark = EXCLUDED.remark,
    updated_at = now()
  RETURNING ${productionScheduleRecordJsonExpression("production_schedule_records")} AS result
),
inserted_operation_log AS (
  ${operationLogSql}
)
SELECT json_build_object(
  'productionTask', (SELECT result FROM updated_production_task),
  'productionScheduleRecords', (
    SELECT COALESCE(json_agg(result ORDER BY (result->>'machineId'), (result->>'queueSeq')::int, result->>'productionTaskId'), '[]'::json)
    FROM upserted_schedule_records
  ),
  'operationLogId', (SELECT id FROM inserted_operation_log)
) AS result;
COMMIT;
`.trim(),
    values: parameters.values,
  };
}

export function buildListProductionScheduleRecordsSql(filters = {}) {
  return buildListProductionScheduleRecordsQuery(filters).text;
}

export function buildListProductionScheduleRecordsQuery(filters = {}) {
  const parameters = createPostgresParameterBinder();
  const where = buildProductionScheduleRecordWhereClause(filters, parameters);
  return {
    text: `
SELECT COALESCE(json_agg(record ORDER BY record->>'machineId', (record->>'queueSeq')::int, record->>'productionTaskId'), '[]'::json) AS result
FROM (
  SELECT ${productionScheduleRecordJsonExpression("production_schedule_records")} AS record
  FROM production_schedule_records
  ${where}
  ORDER BY machine_id ASC, queue_seq ASC, production_task_id ASC
) AS ordered_schedule_records;
`.trim(),
    values: parameters.values,
  };
}

export function normalizeProductionScheduleResequenceResult(value) {
  return {
    productionScheduleRecords: normalizeProductionScheduleRecords(
      value?.productionScheduleRecords ?? value?.production_schedule_records ?? [],
    ),
    operationLogId: cleanText(value?.operationLogId ?? value?.operation_log_id),
  };
}

export function normalizeProductionScheduleMoveResult(value) {
  return {
    productionTask: normalizeProductionTaskForMachineMove(value?.productionTask ?? value?.production_task),
    productionScheduleRecords: normalizeProductionScheduleRecords(
      value?.productionScheduleRecords ?? value?.production_schedule_records ?? [],
    ),
    operationLogId: cleanText(value?.operationLogId ?? value?.operation_log_id),
  };
}

export function normalizeProductionScheduleRecords(value) {
  if (!Array.isArray(value)) return [];
  return value.map((record) => normalizeProductionScheduleRecord(record)).filter(Boolean);
}

export function normalizeProductionScheduleRecord(value = {}) {
  if (!value || typeof value !== "object") return null;
  const scheduleRecordId = cleanText(value.scheduleRecordId ?? value.schedule_record_id ?? value.id);
  const productionTaskId = cleanText(value.productionTaskId ?? value.production_task_id);
  const machineId = cleanText(value.machineId ?? value.machine_id);
  if (!scheduleRecordId || !productionTaskId || !machineId) return null;
  const updatedAt = cleanText(value.updatedAt ?? value.updated_at ?? value.sequenceUpdatedAt ?? value.sequence_updated_at);
  const createdAt = cleanText(value.createdAt ?? value.created_at) || updatedAt || new Date().toISOString();
  const sourceKind = cleanText(value.sourceKind ?? value.source_kind ?? value.source) || "manual_resequence";
  const status = cleanText(value.status ?? value.scheduleStatus ?? value.schedule_status) || "active";
  return {
    id: scheduleRecordId,
    scheduleRecordId,
    bizNo: cleanText(value.bizNo ?? value.biz_no) || scheduleRecordId,
    productionTaskId,
    orderLineId: cleanText(value.orderLineId ?? value.order_line_id),
    publishedScheduleId: cleanText(value.publishedScheduleId ?? value.published_schedule_id),
    machineId,
    queueSeq: Math.max(0, toFiniteInteger(value.queueSeq ?? value.queue_seq, 0)),
    status,
    scheduleStatus: status,
    source: sourceKind,
    sourceKind,
    plannedStartAt: cleanText(value.plannedStartAt ?? value.planned_start_at),
    plannedEndAt: cleanText(value.plannedEndAt ?? value.planned_end_at),
    sequenceUpdatedAt: cleanText(value.sequenceUpdatedAt ?? value.sequence_updated_at ?? updatedAt),
    sequenceUpdatedBy: cleanText(value.sequenceUpdatedBy ?? value.sequence_updated_by ?? value.updatedBy ?? value.updated_by),
    remark: cleanText(value.remark),
    createdBy: cleanText(value.createdBy ?? value.created_by),
    createdAt,
    updatedBy: cleanText(value.updatedBy ?? value.updated_by ?? value.sequenceUpdatedBy ?? value.sequence_updated_by),
    updatedAt: updatedAt || createdAt,
  };
}

function applyProductionScheduleRecordWorkspaceMutation(input = {}) {
  const workspace = input.workspace;
  if (!workspace) return;
  const productionTask = normalizeProductionTaskForMachineMove(input.productionTask);
  if (productionTask) {
    workspace.productionTasks = upsertProductionTask(workspace.productionTasks ?? [], productionTask);
  }
  for (const record of normalizeProductionScheduleRecords(input.records ?? [])) {
    workspace.productionScheduleRecords = upsertProductionScheduleRecord(
      workspace.productionScheduleRecords ?? [],
      toWorkspaceProductionScheduleRecord(record),
    );
  }
  if (input.operationLog) {
    workspace.operationLogs = upsertById(workspace.operationLogs ?? [], input.operationLog);
  }
}

function filterProductionScheduleRecords(records = [], filters = {}) {
  const machineId = cleanText(filters.machineId ?? filters.machine_id);
  const status = cleanText(filters.status ?? filters.scheduleStatus ?? filters.schedule_status);
  const productionTaskId = cleanText(filters.productionTaskId ?? filters.production_task_id);
  return normalizeProductionScheduleRecords(records)
    .filter((record) => !machineId || record.machineId === machineId)
    .filter((record) => !status || record.status === status)
    .filter((record) => !productionTaskId || record.productionTaskId === productionTaskId)
    .sort(sortProductionScheduleRecord);
}

function buildProductionScheduleRecordWhereClause(filters = {}, parameters) {
  const clauses = [];
  const machineId = cleanText(filters.machineId ?? filters.machine_id);
  const status = cleanText(filters.status ?? filters.scheduleStatus ?? filters.schedule_status);
  const productionTaskId = cleanText(filters.productionTaskId ?? filters.production_task_id);
  if (machineId) clauses.push(`machine_id = ${parameters.text(machineId)}`);
  if (status) clauses.push(`schedule_status = ${parameters.text(status)}`);
  if (productionTaskId) clauses.push(`production_task_id = ${parameters.text(productionTaskId)}`);
  return clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
}

function buildProductionScheduleRecordValuesSql(record, parameters) {
  return `(
      ${parameters.text(record.scheduleRecordId)},
      ${parameters.text(record.bizNo || record.scheduleRecordId)},
      ${parameters.text(record.productionTaskId)},
      ${parameters.nullableText(record.orderLineId)},
      ${parameters.text(record.publishedScheduleId)},
      ${parameters.text(record.machineId)},
      ${parameters.integer(record.queueSeq)},
      ${parameters.text(record.status)},
      ${parameters.text(record.sourceKind)},
      ${parameters.nullableTimestamp(record.plannedStartAt)},
      ${parameters.nullableTimestamp(record.plannedEndAt)},
      ${parameters.nullableTimestamp(record.sequenceUpdatedAt || record.updatedAt)},
      ${parameters.nullableText(record.sequenceUpdatedBy || record.updatedBy)},
      ${parameters.text(record.remark)},
      ${parameters.nullableText(record.createdBy)},
      ${parameters.timestamp(record.createdAt)},
      ${parameters.timestamp(record.updatedAt)}
    )`;
}

function productionTaskJsonExpression(alias) {
  return `json_build_object(
    'productionTaskId', ${alias}.id,
    'id', ${alias}.id,
    'bizNo', ${alias}.biz_no,
    'orderLineId', ${alias}.order_line_id,
    'taskType', ${alias}.task_type,
    'machineId', ${alias}.machine_id,
    'plannedQty', ${alias}.planned_qty,
    'taskStatus', ${alias}.task_status,
    'status', ${alias}.task_status,
    'publishedScheduleId', ${alias}.published_schedule_id,
    'createdBy', ${alias}.created_by,
    'createdAt', ${alias}.created_at,
    'updatedAt', ${alias}.updated_at
  )`;
}

function productionScheduleRecordJsonExpression(alias) {
  return `json_build_object(
    'scheduleRecordId', ${alias}.id,
    'bizNo', ${alias}.biz_no,
    'productionTaskId', ${alias}.production_task_id,
    'orderLineId', ${alias}.order_line_id,
    'publishedScheduleId', ${alias}.published_schedule_id,
    'machineId', ${alias}.machine_id,
    'queueSeq', ${alias}.queue_seq,
    'status', ${alias}.schedule_status,
    'scheduleStatus', ${alias}.schedule_status,
    'source', ${alias}.source_kind,
    'sourceKind', ${alias}.source_kind,
    'plannedStartAt', ${alias}.planned_start_at,
    'plannedEndAt', ${alias}.planned_end_at,
    'sequenceUpdatedAt', ${alias}.sequence_updated_at,
    'sequenceUpdatedBy', ${alias}.sequence_updated_by,
    'remark', ${alias}.remark,
    'createdBy', ${alias}.created_by,
    'createdAt', ${alias}.created_at,
    'updatedBy', ${alias}.sequence_updated_by,
    'updatedAt', ${alias}.updated_at
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
  ${parameters.nullableText(operationLog.reason)},
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

function normalizeOperationLogForPersistence(value = {}) {
  if (!value || typeof value !== "object") return null;
  const id = cleanText(value.id);
  if (!id) return null;
  const createdAt = cleanText(value.createdAt ?? value.created_at) || new Date().toISOString();
  return {
    id,
    targetType: cleanText(value.targetType ?? value.target_type),
    targetId: cleanText(value.targetId ?? value.target_id),
    action: cleanText(value.action),
    before: value.before ?? value.before_json ?? null,
    after: value.after ?? value.after_json ?? null,
    reason: cleanText(value.reason),
    operatorId: cleanText(value.operatorId ?? value.operator_id),
    pageKey: cleanText(value.pageKey ?? value.page_key) || "api",
    occurredAt: cleanText(value.occurredAt ?? value.occurred_at) || createdAt,
    createdAt,
  };
}

function normalizeProductionTaskForMachineMove(value = {}) {
  if (!value || typeof value !== "object") return null;
  const productionTaskId = cleanText(value.productionTaskId ?? value.production_task_id ?? value.id);
  const machineId = cleanText(value.machineId ?? value.machine_id);
  if (!productionTaskId || !machineId) return null;
  return {
    ...value,
    id: productionTaskId,
    productionTaskId,
    bizNo: cleanText(value.bizNo ?? value.biz_no) || productionTaskId,
    orderLineId: cleanText(value.orderLineId ?? value.order_line_id),
    taskType: cleanText(value.taskType ?? value.task_type),
    machineId,
    plannedQty: toFiniteInteger(value.plannedQty ?? value.planned_qty, 0),
    taskStatus: cleanText(value.taskStatus ?? value.task_status ?? value.status),
    status: cleanText(value.status ?? value.taskStatus ?? value.task_status),
    publishedScheduleId: cleanText(value.publishedScheduleId ?? value.published_schedule_id),
    createdBy: cleanText(value.createdBy ?? value.created_by),
    createdAt: cleanText(value.createdAt ?? value.created_at),
    updatedAt: cleanText(value.updatedAt ?? value.updated_at) || new Date().toISOString(),
  };
}

function toWorkspaceProductionScheduleRecord(record) {
  return {
    ...record,
    id: record.scheduleRecordId,
    scheduleRecordId: record.scheduleRecordId,
    status: record.status,
    source: record.sourceKind,
    updatedBy: record.updatedBy || record.sequenceUpdatedBy,
    updatedAt: record.updatedAt,
  };
}

function upsertProductionScheduleRecord(records, record) {
  const key = getProductionScheduleRecordKey(record);
  const next = [...records];
  const index = next.findIndex((item) => getProductionScheduleRecordKey(item) === key || cleanText(item.id ?? item.scheduleRecordId) === record.scheduleRecordId);
  if (index >= 0) next[index] = { ...next[index], ...record };
  else next.push(record);
  return next.sort(sortProductionScheduleRecord);
}

function upsertProductionTask(records, productionTask) {
  const id = cleanText(productionTask?.productionTaskId ?? productionTask?.id);
  if (!id) return records;
  const next = [...records];
  const index = next.findIndex((item) => cleanText(item.productionTaskId ?? item.id) === id);
  if (index >= 0) next[index] = { ...next[index], ...productionTask, id, productionTaskId: id };
  else next.push({ ...productionTask, id, productionTaskId: id });
  return next;
}

function getProductionScheduleRecordKey(record = {}) {
  return `${cleanText(record.machineId ?? record.machine_id)}::${cleanText(record.productionTaskId ?? record.production_task_id)}`;
}

function sortProductionScheduleRecord(left, right) {
  const leftMachine = cleanText(left.machineId ?? left.machine_id);
  const rightMachine = cleanText(right.machineId ?? right.machine_id);
  if (leftMachine !== rightMachine) return leftMachine.localeCompare(rightMachine);
  const leftSeq = toFiniteInteger(left.queueSeq ?? left.queue_seq, 0);
  const rightSeq = toFiniteInteger(right.queueSeq ?? right.queue_seq, 0);
  if (leftSeq !== rightSeq) return leftSeq - rightSeq;
  return cleanText(left.productionTaskId ?? left.production_task_id).localeCompare(
    cleanText(right.productionTaskId ?? right.production_task_id),
  );
}

function upsertById(records, record) {
  const id = cleanText(record?.id);
  if (!id) return records;
  const next = [...records];
  const index = next.findIndex((item) => cleanText(item.id) === id);
  if (index >= 0) next[index] = { ...next[index], ...record };
  else next.push(record);
  return next;
}


function toFiniteInteger(value, fallback = 0) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.trunc(number);
}

function cleanText(value) {
  return String(value ?? "").trim();
}
