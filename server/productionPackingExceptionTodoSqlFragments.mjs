export function buildInsertProductionExceptionSql(record, parameters, dependency = "") {
  if (!record) return "SELECT NULL::json AS result WHERE false";
  const values = `(
  ${parameters.text(record.productionExceptionId)},
  ${parameters.text(record.bizNo)},
  ${parameters.text(record.productionTaskId)},
  ${parameters.text(record.orderLineId)},
  ${parameters.text(record.processType)},
  ${parameters.nullableText(record.machineId)},
  ${parameters.nullableText(record.operatorId)},
  ${parameters.text(record.exceptionType)},
  ${parameters.text(record.continuationMode)},
  ${parameters.text(record.status)},
  ${parameters.integer(record.estimatedLossQty)},
  ${parameters.boolean(record.affectsDelivery)},
  ${parameters.nullableText(record.remark)},
  ${parameters.json(record.evidence)},
  ${timestampParameter(record.occurredAt, parameters)},
  ${timestampParameter(record.createdAt, parameters)}
)`;
  return `INSERT INTO production_exception_records (
  id,
  biz_no,
  production_task_id,
  order_line_id,
  process_type,
  machine_id,
  operator_id,
  exception_type,
  continuation_mode,
  status,
  estimated_loss_qty,
  affects_delivery,
  remark,
  evidence_json,
  occurred_at,
  created_at
) ${buildInsertValuesSource(values, ["id", "biz_no", "production_task_id", "order_line_id", "process_type", "machine_id", "operator_id", "exception_type", "continuation_mode", "status", "estimated_loss_qty", "affects_delivery", "remark", "evidence_json", "occurred_at", "created_at"], dependency)}
ON CONFLICT (id) DO NOTHING
RETURNING ${productionExceptionJsonExpression("production_exception_records")} AS result`;
}

export function buildUpdateProductionExceptionSql(record, parameters, dependency = "") {
  if (!record) return "SELECT NULL::json AS result WHERE false";
  return `UPDATE production_exception_records
SET
  status = ${parameters.text(record.status)},
  resolution_code = ${parameters.nullableText(record.resolutionCode)},
  resolution_note = ${parameters.nullableText(record.resolutionNote)},
  resolved_by = ${parameters.nullableText(record.resolvedBy)},
  resolved_at = ${parameters.nullableTimestamp(record.resolvedAt)},
  evidence_json = ${parameters.json(record.evidence)}
WHERE id = ${parameters.text(record.productionExceptionId)}
${buildWriteGuardCondition(dependency)}
RETURNING ${productionExceptionJsonExpression("production_exception_records")} AS result`;
}

export function buildInsertTodoSql(todo, parameters, dependency = "") {
  if (!todo) return "SELECT NULL::json AS result WHERE false";
  const values = `${parameters.text(todo.id)}, ${parameters.text(todo.bizNo)}, ${parameters.text(todo.type)},
    ${parameters.text(todo.refType)}, ${parameters.text(todo.refId)}, ${parameters.text(todo.priority)},
    ${parameters.text(todo.status)}, ${parameters.nullableText(todo.summary)}, ${parameters.nullableTimestamp(todo.dueAt)},
    ${parameters.nullableTimestamp(todo.remindAt)}, ${parameters.nullableText(todo.handledBy)},
    ${parameters.nullableTimestamp(todo.handledAt)}, ${parameters.nullableText(todo.handlingResult)},
    ${parameters.nullableText(todo.createdBy)}, ${parameters.timestamp(todo.createdAt)}, ${parameters.timestamp(todo.updatedAt)}`;
  return `INSERT INTO todos (
  id, biz_no, type, ref_type, ref_id, priority, status, summary, due_at, remind_at,
  handled_by, handled_at, handling_result, created_by, created_at, updated_at
) ${dependency ? `SELECT ${values} FROM ${dependency} WHERE ok` : `VALUES (${values})`}
ON CONFLICT (id) DO NOTHING
RETURNING ${todoJsonExpression("todos")} AS result`;
}

export function buildUpdateTodoSql(todo, parameters, dependency = "") {
  if (!todo) return "SELECT NULL::json AS result WHERE false";
  return `UPDATE todos
SET
  priority = ${parameters.text(todo.priority)},
  status = ${parameters.text(todo.status)},
  summary = ${parameters.nullableText(todo.summary)},
  due_at = ${parameters.nullableTimestamp(todo.dueAt)},
  remind_at = ${parameters.nullableTimestamp(todo.remindAt)},
  handled_by = ${parameters.nullableText(todo.handledBy)},
  handled_at = ${parameters.nullableTimestamp(todo.handledAt)},
  handling_result = ${parameters.nullableText(todo.handlingResult)},
  updated_at = ${parameters.timestamp(todo.updatedAt)}
WHERE id = ${parameters.text(todo.id)}
${buildWriteGuardCondition(dependency)}
RETURNING ${todoJsonExpression("todos")} AS result`;
}

export function buildInsertTodoEventSql(event, parameters, dependency = "") {
  if (!event) return "SELECT NULL::json AS result WHERE false";
  const values = `${parameters.text(event.eventId)}, ${parameters.text(event.todoId)}, ${parameters.text(event.eventType)},
    ${parameters.json(event.eventPayload)}, ${parameters.nullableText(event.operatorId)},
    ${parameters.timestamp(event.occurredAt)}, ${parameters.timestamp(event.createdAt)}`;
  return `INSERT INTO todo_events (id, todo_id, event_type, event_payload, operator_id, occurred_at, created_at)
${dependency ? `SELECT ${values} FROM ${dependency}` : `VALUES (${values})`}
ON CONFLICT (id) DO NOTHING
RETURNING json_build_object(
  'eventId', id,
  'todoId', todo_id,
  'eventType', event_type,
  'eventPayload', event_payload,
  'operatorId', operator_id,
  'occurredAt', occurred_at,
  'createdAt', created_at
) AS result`;
}

export function buildInsertOperationLogSql(operationLog, parameters, dependency = "") {
  const values = `${parameters.text(operationLog.id)},
  ${parameters.text(operationLog.targetType)},
  ${parameters.text(operationLog.targetId)},
  ${parameters.text(operationLog.action)},
  ${parameters.json(operationLog.before)},
  ${parameters.json(operationLog.after)},
  ${parameters.nullableText(operationLog.reason)},
  ${parameters.nullableText(operationLog.operatorId)},
  ${parameters.text(operationLog.pageKey)},
  ${timestampParameter(operationLog.occurredAt, parameters)},
  ${timestampParameter(operationLog.createdAt, parameters)}`;
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
) ${dependency ? `SELECT ${values} FROM ${dependency} WHERE ok` : `VALUES (${values})`}
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

function buildInsertValuesSource(values, columns, dependency) {
  if (!dependency) return `VALUES\n${values}`;
  return `SELECT payload.*
FROM (VALUES\n${values}) AS payload(${columns.join(", ")})
JOIN ${dependency} ON ${dependency}.ok`;
}

function buildWriteGuardCondition(dependency) {
  return dependency ? `AND EXISTS (SELECT 1 FROM ${dependency} WHERE ok)` : "";
}

function productionExceptionJsonExpression(alias) {
  return `json_build_object(
    'productionExceptionId', ${alias}.id,
    'bizNo', ${alias}.biz_no,
    'productionTaskId', ${alias}.production_task_id,
    'orderLineId', ${alias}.order_line_id,
    'processType', ${alias}.process_type,
    'machineId', ${alias}.machine_id,
    'operatorId', ${alias}.operator_id,
    'exceptionType', ${alias}.exception_type,
    'continuationMode', ${alias}.continuation_mode,
    'status', ${alias}.status,
    'resolutionCode', ${alias}.resolution_code,
    'resolutionNote', ${alias}.resolution_note,
    'resolvedBy', ${alias}.resolved_by,
    'resolvedAt', ${alias}.resolved_at,
    'estimatedLossQty', ${alias}.estimated_loss_qty,
    'affectsDelivery', ${alias}.affects_delivery,
    'remark', ${alias}.remark,
    'evidence', ${alias}.evidence_json,
    'occurredAt', ${alias}.occurred_at,
    'createdAt', ${alias}.created_at
  )`;
}

function todoJsonExpression(alias) {
  return `json_build_object(
    'todoId', ${alias}.id,
    'id', ${alias}.id,
    'bizNo', ${alias}.biz_no,
    'type', ${alias}.type,
    'refType', ${alias}.ref_type,
    'refId', ${alias}.ref_id,
    'ref', ${alias}.ref_id,
    'priority', ${alias}.priority,
    'status', ${alias}.status,
    'summary', ${alias}.summary,
    'createdBy', ${alias}.created_by,
    'createdAt', ${alias}.created_at,
    'updatedAt', ${alias}.updated_at
  )`;
}

function timestampParameter(value, parameters) {
  const text = String(value ?? "").trim();
  return text && !Number.isNaN(Date.parse(text)) ? parameters.timestamp(text) : "now()";
}
