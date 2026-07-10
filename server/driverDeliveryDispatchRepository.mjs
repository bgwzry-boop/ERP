import { createPostgresPoolClient } from "./postgresPoolClient.mjs";
import { createPostgresParameterBinder } from "./postgresSqlParameters.mjs";

export function createDriverDeliveryDispatchRepository(options = {}) {
  const mode =
    options.mode ??
    process.env.ERP_DRIVER_DELIVERY_DISPATCH_STORE ??
    process.env.ERP_DRIVER_DISPATCH_STORE ??
    process.env.ERP_FULFILLMENT_STORE ??
    "local";
  if (mode === "postgres") {
    return createPostgresDriverDeliveryDispatchRepository({
      databaseUrl:
        options.databaseUrl ?? process.env.ERP_DRIVER_DISPATCH_DATABASE_URL ?? process.env.DATABASE_URL ?? process.env.PGURL,
      queryJson: options.queryJson,
      postgresClient: options.postgresClient,
    });
  }
  if (mode === "local") return createLocalDriverDeliveryDispatchRepository();
  throw new Error(`Unsupported driver delivery dispatch repository mode: ${mode}`);
}

export function createLocalDriverDeliveryDispatchRepository() {
  return {
    kind: "local_memory",

    loadState() {
      return { driverDeliveryDispatches: [] };
    },

    upsertDriverDeliveryDispatch(input) {
      const dispatch = normalizeDriverDeliveryDispatchRecord(input.dispatch);
      if (!dispatch) throw new Error("Invalid driver delivery dispatch record");
      applyDriverDeliveryDispatchWorkspaceMutation({
        workspace: input.workspace,
        dispatch,
        operationLog: input.operationLog,
      });
      return {
        dispatch,
        operationLogId: input.operationLog?.id ?? "",
      };
    },
  };
}

export function createPostgresDriverDeliveryDispatchRepository(options = {}) {
  const databaseUrl = options.databaseUrl;
  const postgresClient = options.postgresClient ?? (options.queryJson ? null : createPostgresPoolClient({ databaseUrl }));
  const queryJson =
    options.queryJson ??
    ((text, values) => postgresClient.transactionJson(text, values));

  return {
    kind: "postgres",

    async loadState() {
      return { driverDeliveryDispatches: [] };
    },

    async upsertDriverDeliveryDispatch(input) {
      const builtQuery = buildUpsertDriverDeliveryDispatchTransactionQuery(input);
      const result = normalizeDriverDeliveryDispatchTransactionResult(
        await queryJson(builtQuery.text, builtQuery.values),
      );
      if (!result.dispatch) throw new Error("PostgreSQL driver delivery dispatch upsert returned an invalid record");
      applyDriverDeliveryDispatchWorkspaceMutation({
        workspace: input.workspace,
        dispatch: result.dispatch,
        operationLog: input.operationLog,
      });
      return result;
    },
  };
}

export function buildUpsertDriverDeliveryDispatchTransactionSql(input = {}) {
  return buildUpsertDriverDeliveryDispatchTransactionQuery(input).text;
}

export function buildUpsertDriverDeliveryDispatchTransactionQuery(input = {}) {
  const dispatch = normalizeDriverDeliveryDispatchRecord(input.dispatch);
  const operationLog = normalizeOperationLogForPersistence(input.operationLog);
  if (!dispatch || !operationLog) {
    throw new Error("Dispatch and operation log are required for driver delivery dispatch transaction");
  }

  const parameters = createPostgresParameterBinder();
  const routeDate = cleanText(dispatch.routeDate);
  return {
    text: `
BEGIN;
WITH upserted_dispatch AS (
  INSERT INTO driver_delivery_dispatches (
    id,
    biz_no,
    fulfillment_id,
    driver_id,
    route_date,
    route_batch_no,
    stop_sequence,
    dispatch_status,
    planned_departure_at,
    assigned_by,
    assigned_at,
    remark,
    created_at,
    updated_at
  ) VALUES (
    ${parameters.text(dispatch.dispatchId)},
    ${parameters.text(dispatch.bizNo)},
    ${parameters.text(dispatch.fulfillmentId)},
    ${parameters.nullableText(dispatch.driverId)},
    ${routeDate ? `${parameters.text(routeDate)}::date` : "NULL"},
    ${parameters.text(dispatch.routeBatchNo)},
    ${parameters.integer(dispatch.stopSequence)},
    ${parameters.text(dispatch.dispatchStatus)},
    ${parameters.nullableTimestamp(dispatch.plannedDepartureAt)},
    ${parameters.nullableText(dispatch.assignedBy)},
    ${parameters.nullableTimestamp(dispatch.assignedAt)},
    ${parameters.text(dispatch.remark)},
    ${parameters.timestamp(dispatch.createdAt)},
    ${parameters.timestamp(dispatch.updatedAt)}
  )
  ON CONFLICT (id) DO UPDATE SET
    biz_no = EXCLUDED.biz_no,
    fulfillment_id = EXCLUDED.fulfillment_id,
    driver_id = EXCLUDED.driver_id,
    route_date = EXCLUDED.route_date,
    route_batch_no = EXCLUDED.route_batch_no,
    stop_sequence = EXCLUDED.stop_sequence,
    dispatch_status = EXCLUDED.dispatch_status,
    planned_departure_at = EXCLUDED.planned_departure_at,
    assigned_by = EXCLUDED.assigned_by,
    assigned_at = EXCLUDED.assigned_at,
    remark = EXCLUDED.remark,
    updated_at = now()
  RETURNING ${driverDeliveryDispatchJsonExpression("driver_delivery_dispatches")} AS result
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
)
SELECT json_build_object(
  'dispatch', (SELECT result FROM upserted_dispatch),
  'operationLogId', (SELECT id FROM inserted_operation_log)
) AS result;
COMMIT;
`.trim(),
    values: parameters.values,
  };
}

export function normalizeDriverDeliveryDispatchTransactionResult(value) {
  return {
    dispatch: normalizeDriverDeliveryDispatchRecord(value?.dispatch ?? value?.driverDeliveryDispatch),
    operationLogId: cleanText(value?.operationLogId ?? value?.operation_log_id),
  };
}

export function normalizeDriverDeliveryDispatchRecord(value = {}) {
  if (!value || typeof value !== "object") return null;
  const dispatchId = cleanText(value.dispatchId ?? value.dispatch_id ?? value.id);
  const fulfillmentId = cleanText(value.fulfillmentId ?? value.fulfillment_id);
  if (!dispatchId || !fulfillmentId) return null;
  const routeNo = cleanText(value.routeNo ?? value.routeBatchNo ?? value.route_batch_no);
  const stopSequence = Math.max(0, toFiniteInteger(value.stopSequence ?? value.routeSequence ?? value.stop_sequence, 0));
  const createdAt = cleanText(value.createdAt ?? value.created_at);
  const updatedAt = cleanText(value.updatedAt ?? value.updated_at);
  return {
    id: dispatchId,
    dispatchId,
    bizNo: cleanText(value.bizNo ?? value.biz_no) || dispatchId,
    fulfillmentId,
    driverId: cleanText(value.driverId ?? value.driver_id),
    routeDate: cleanText(value.routeDate ?? value.route_date),
    routeNo,
    routeBatchNo: routeNo,
    stopSequence,
    routeSequence: stopSequence,
    dispatchStatus: cleanText(value.dispatchStatus ?? value.dispatch_status) || "已派单",
    plannedDepartureAt: cleanText(value.plannedDepartureAt ?? value.planned_departure_at),
    assignedBy: cleanText(value.assignedBy ?? value.assigned_by),
    assignedAt: cleanText(value.assignedAt ?? value.assigned_at),
    remark: cleanText(value.remark),
    createdAt: createdAt || new Date().toISOString(),
    updatedAt: updatedAt || createdAt || new Date().toISOString(),
  };
}

function applyDriverDeliveryDispatchWorkspaceMutation(input) {
  const workspace = input.workspace;
  if (!workspace) return;
  workspace.driverDeliveryDispatches = upsertById(
    workspace.driverDeliveryDispatches ?? [],
    input.dispatch,
    (item) => item?.dispatchId ?? item?.id,
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

function driverDeliveryDispatchJsonExpression(alias) {
  return `json_build_object(
    'dispatchId', ${alias}.id,
    'id', ${alias}.id,
    'bizNo', ${alias}.biz_no,
    'fulfillmentId', ${alias}.fulfillment_id,
    'driverId', COALESCE(${alias}.driver_id, ''),
    'routeDate', COALESCE(${alias}.route_date::TEXT, ''),
    'routeNo', ${alias}.route_batch_no,
    'routeBatchNo', ${alias}.route_batch_no,
    'stopSequence', ${alias}.stop_sequence,
    'routeSequence', ${alias}.stop_sequence,
    'dispatchStatus', ${alias}.dispatch_status,
    'plannedDepartureAt', COALESCE(${alias}.planned_departure_at::TEXT, ''),
    'assignedBy', COALESCE(${alias}.assigned_by, ''),
    'assignedAt', COALESCE(${alias}.assigned_at::TEXT, ''),
    'remark', ${alias}.remark,
    'createdAt', COALESCE(${alias}.created_at::TEXT, ''),
    'updatedAt', COALESCE(${alias}.updated_at::TEXT, '')
  )`;
}

function cleanText(value) {
  return String(value ?? "").trim();
}

function toFiniteInteger(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.trunc(number) : fallback;
}
