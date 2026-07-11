import { createPostgresPoolClient } from "./postgresPoolClient.mjs";
import { createPostgresParameterBinder } from "./postgresSqlParameters.mjs";
import { createPostgresTransactionExecutor } from "./postgresTransactionExecutor.mjs";
import { buildPostgresIdempotencyRequest, resolveRepositoryIdempotencyKey } from "./idempotency.mjs";

export function createTodoActionRepository(options = {}) {
  const mode = options.mode ?? process.env.ERP_TODO_ACTION_STORE ?? process.env.ERP_CORE_WORKSPACE_STORE ?? "local";
  if (mode === "postgres") return createPostgresTodoActionRepository(options);
  if (mode === "local") return createLocalTodoActionRepository();
  throw new Error(`Unsupported todo action repository mode: ${mode}`);
}

export function createLocalTodoActionRepository() {
  return {
    kind: "local_memory",
    async getTodo({ workspace, todoId }) {
      return findWorkspaceTodo(workspace, todoId);
    },
    async recordTodoAction(input = {}) {
      const todo = normalizeTodoRecord(input.todo, input.todoEvent);
      const todoEvent = normalizeTodoEvent(input.todoEvent);
      if (!todo || !todoEvent) throw new Error("Todo and todo event are required");
      applyTodoActionWorkspaceMutation({
        workspace: input.workspace,
        todo,
        todoEvent,
        operationLog: input.operationLog,
      });
      return {
        todo,
        todoEvent,
        operationLogId: input.operationLog?.id ?? "",
      };
    },
  };
}

export function createPostgresTodoActionRepository(options = {}) {
  const databaseUrl = options.databaseUrl;
  const postgresClient =
    options.postgresClient ?? (options.queryJson || options.transactionJson ? null : createPostgresPoolClient({ databaseUrl }));
  const queryJson = options.queryJson ?? ((text, values) => postgresClient.queryJson(text, values));
  const { idempotentTransactionJson } = createPostgresTransactionExecutor({ ...options, databaseUrl, postgresClient });

  return {
    kind: "postgres",
    async getTodo({ todoId }) {
      const query = buildGetTodoActionStateQuery(todoId);
      return normalizeTodoLookupResult(await queryJson(query.text, query.values));
    },
    async recordTodoAction(input = {}) {
      const query = buildRecordTodoActionTransactionQuery(input);
      const result = normalizeTodoActionTransactionResult(
        await idempotentTransactionJson(
          buildPostgresIdempotencyRequest({
            scope: `todo.action.${normalizeScopePart(input.action)}`,
            idempotencyKey: resolveRepositoryIdempotencyKey(input.idempotencyKey, input.operationLog?.id),
            payload: input.idempotencyPayload ?? { action: input.action, todo: input.todo },
            operatorId: input.operationLog?.operatorId,
            targetType: "todo",
            targetId: input.todo?.id ?? input.todo?.todoId,
            resourceLocks: [`todo:${input.todo?.id ?? input.todo?.todoId ?? ""}`],
            query,
          }),
        ),
        input.todo,
      );
      if (!result.todo) throw new Error("PostgreSQL todo action returned an invalid todo");
      applyTodoActionWorkspaceMutation({
        workspace: input.workspace,
        todo: result.todo,
        todoEvent: result.todoEventId === input.todoEvent?.eventId ? input.todoEvent : null,
        operationLog: result.operationLogId === input.operationLog?.id ? input.operationLog : null,
      });
      return result;
    },
  };
}

export function buildGetTodoActionStateQuery(todoId) {
  const parameters = createPostgresParameterBinder();
  return {
    text: `
SELECT json_build_object(
  'todo', ${todoJsonExpression("todo_record")},
  'todoEvent', CASE WHEN latest_event.id IS NULL THEN NULL ELSE ${todoEventJsonExpression("latest_event")} END
) AS result
FROM todos AS todo_record
LEFT JOIN LATERAL (
  SELECT *
  FROM todo_events
  WHERE todo_id = todo_record.id
  ORDER BY occurred_at DESC, created_at DESC, id DESC
  LIMIT 1
) AS latest_event ON true
WHERE todo_record.id = ${parameters.text(todoId)};
`.trim(),
    values: parameters.values,
  };
}

export function buildRecordTodoActionTransactionQuery(input = {}) {
  const todo = normalizeTodoForPersistence(input.todo);
  const todoEvent = normalizeTodoEvent(input.todoEvent);
  const operationLog = normalizeOperationLog(input.operationLog);
  if (!todo || !todoEvent || !operationLog) {
    throw new Error("Todo, todo event, and operation log are required for todo action persistence");
  }
  const parameters = createPostgresParameterBinder();
  const expectedUpdatedAt = parameters.nullableTimestamp(input.expectedUpdatedAt ?? input.before?.updatedAt);
  return {
    text: `
BEGIN;
WITH locked_todo AS MATERIALIZED (
  SELECT id, updated_at
  FROM todos
  WHERE id = ${parameters.text(todo.id)}
  FOR UPDATE
),
todo_write_guard AS MATERIALIZED (
  SELECT erp_require(
    (SELECT COUNT(*) FROM locked_todo) = 1
      AND (
        ${expectedUpdatedAt} IS NULL
        OR EXISTS (
          SELECT 1 FROM locked_todo
          WHERE date_trunc('milliseconds', updated_at) = date_trunc('milliseconds', ${expectedUpdatedAt})
        )
      ),
    'ERP_TODO_CONCURRENCY_CONFLICT'
  ) AS ok
),
updated_todo AS (
  UPDATE todos
  SET
    priority = ${parameters.text(todo.priority)},
    status = ${parameters.text(todo.status)},
    summary = ${parameters.text(todo.summary)},
    due_at = ${parameters.nullableTimestamp(todo.dueAt)},
    remind_at = ${parameters.nullableTimestamp(todo.remindAt)},
    handled_by = ${parameters.nullableText(todo.handledBy)},
    handled_at = ${parameters.nullableTimestamp(todo.handledAt)},
    handling_result = ${parameters.nullableText(todo.handlingResult)},
    updated_at = ${parameters.timestamp(todo.updatedAt)}
  FROM locked_todo, todo_write_guard AS guard
  WHERE todos.id = locked_todo.id AND guard.ok
  RETURNING ${todoJsonExpression("todos")} AS result
),
inserted_todo_event AS (
  INSERT INTO todo_events (
    id, todo_id, event_type, event_payload, operator_id, occurred_at, created_at
  )
  SELECT
    ${parameters.text(todoEvent.eventId)},
    ${parameters.text(todoEvent.todoId)},
    ${parameters.text(todoEvent.eventType)},
    ${parameters.json(todoEvent.eventPayload)},
    ${parameters.nullableText(todoEvent.operatorId)},
    ${parameters.timestamp(todoEvent.occurredAt)},
    ${parameters.timestamp(todoEvent.createdAt)}
  FROM updated_todo
  ON CONFLICT (id) DO NOTHING
  RETURNING id
),
inserted_operation_log AS (
  INSERT INTO operation_logs (
    id, target_type, target_id, action, before_json, after_json, reason,
    operator_id, page_key, occurred_at, created_at
  )
  SELECT
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
  FROM updated_todo
  ON CONFLICT (id) DO NOTHING
  RETURNING id
)
SELECT json_build_object(
  'todo', (SELECT result FROM updated_todo),
  'todoEventId', (SELECT id FROM inserted_todo_event),
  'operationLogId', (SELECT id FROM inserted_operation_log)
) AS result;
COMMIT;
`.trim(),
    values: parameters.values,
  };
}

export function normalizeTodoLookupResult(value) {
  return normalizeTodoRecord(value?.todo, value?.todoEvent);
}

export function normalizeTodoActionTransactionResult(value, projectedTodo = {}) {
  const canonicalTodo = normalizeTodoRecord(value?.todo);
  return {
    todo: canonicalTodo ? { ...projectedTodo, ...canonicalTodo } : null,
    todoEventId: cleanText(value?.todoEventId ?? value?.todo_event_id),
    operationLogId: cleanText(value?.operationLogId ?? value?.operation_log_id),
  };
}

function normalizeTodoRecord(value, todoEvent) {
  if (!value || typeof value !== "object") return null;
  const id = cleanText(value.id ?? value.todoId ?? value.todo_id);
  if (!id) return null;
  const event = normalizeTodoEvent(todoEvent);
  const projectedTodo = normalizeObject(event?.eventPayload?.todo ?? event?.eventPayload?.after);
  const status = cleanText(value.status) || (value.handled ? "已处理" : "未处理");
  return {
    ...projectedTodo,
    id,
    todoId: id,
    bizNo: cleanText(value.bizNo ?? value.biz_no) || id,
    type: cleanText(value.type),
    refType: cleanText(value.refType ?? value.ref_type),
    refId: cleanText(value.refId ?? value.ref_id),
    ref: cleanText(value.ref ?? value.refId ?? value.ref_id),
    priority: cleanText(value.priority),
    urgency: cleanText(value.urgency ?? value.priority),
    status,
    summary: cleanText(value.summary),
    dueAt: normalizeOptionalTimestamp(value.dueAt ?? value.due_at),
    latest: normalizeOptionalTimestamp(value.dueAt ?? value.due_at) || projectedTodo.latest || "待确认",
    remindAt: normalizeOptionalTimestamp(value.remindAt ?? value.remind_at),
    handled: status === "已处理",
    handledBy: cleanText(value.handledBy ?? value.handled_by),
    handledAt: normalizeOptionalTimestamp(value.handledAt ?? value.handled_at),
    handlingResult: cleanText(value.handlingResult ?? value.handling_result),
    createdBy: cleanText(value.createdBy ?? value.created_by),
    createdAt: normalizeTimestampOrText(value.createdAt ?? value.created_at),
    updatedAt: normalizeOptionalTimestamp(value.updatedAt ?? value.updated_at),
  };
}

function normalizeTodoForPersistence(value) {
  const todo = normalizeTodoRecord(value);
  if (!todo) return null;
  return {
    ...todo,
    priority: todo.priority || todo.urgency || "普通",
    status: todo.handled ? "已处理" : cleanText(todo.status) || "未处理",
    updatedAt: normalizeOptionalTimestamp(value.updatedAt ?? value.updated_at) || new Date().toISOString(),
  };
}

function normalizeTodoEvent(value) {
  if (!value || typeof value !== "object") return null;
  const eventId = cleanText(value.eventId ?? value.id);
  const todoId = cleanText(value.todoId ?? value.todo_id);
  if (!eventId || !todoId) return null;
  return {
    eventId,
    todoId,
    eventType: cleanText(value.eventType ?? value.event_type),
    eventPayload: normalizeObject(value.eventPayload ?? value.event_payload),
    operatorId: cleanText(value.operatorId ?? value.operator_id),
    occurredAt: normalizeOptionalTimestamp(value.occurredAt ?? value.occurred_at) || new Date().toISOString(),
    createdAt: normalizeOptionalTimestamp(value.createdAt ?? value.created_at) || new Date().toISOString(),
  };
}

function normalizeOperationLog(value) {
  if (!value || typeof value !== "object") return null;
  const id = cleanText(value.id);
  if (!id) return null;
  return {
    id,
    targetType: cleanText(value.targetType ?? value.target_type),
    targetId: cleanText(value.targetId ?? value.target_id),
    action: cleanText(value.action),
    before: value.before ?? null,
    after: value.after ?? null,
    reason: cleanText(value.reason),
    operatorId: cleanText(value.operatorId ?? value.operator_id),
    pageKey: cleanText(value.pageKey ?? value.page_key) || "api",
    occurredAt: normalizeOptionalTimestamp(value.occurredAt ?? value.occurred_at) || new Date().toISOString(),
    createdAt: normalizeOptionalTimestamp(value.createdAt ?? value.created_at) || new Date().toISOString(),
  };
}

function todoJsonExpression(alias) {
  return `json_build_object(
    'id', ${alias}.id,
    'bizNo', ${alias}.biz_no,
    'type', ${alias}.type,
    'refType', ${alias}.ref_type,
    'refId', ${alias}.ref_id,
    'priority', ${alias}.priority,
    'status', ${alias}.status,
    'summary', ${alias}.summary,
    'dueAt', ${alias}.due_at,
    'remindAt', ${alias}.remind_at,
    'handledBy', ${alias}.handled_by,
    'handledAt', ${alias}.handled_at,
    'handlingResult', ${alias}.handling_result,
    'createdBy', ${alias}.created_by,
    'createdAt', ${alias}.created_at,
    'updatedAt', ${alias}.updated_at
  )`;
}

function todoEventJsonExpression(alias) {
  return `json_build_object(
    'eventId', ${alias}.id,
    'todoId', ${alias}.todo_id,
    'eventType', ${alias}.event_type,
    'eventPayload', ${alias}.event_payload,
    'operatorId', ${alias}.operator_id,
    'occurredAt', ${alias}.occurred_at,
    'createdAt', ${alias}.created_at
  )`;
}

function applyTodoActionWorkspaceMutation({ workspace, todo, todoEvent, operationLog }) {
  workspace.todos = upsertById(workspace.todos ?? [], todo, "id");
  if (todoEvent) workspace.todoEvents = upsertById(workspace.todoEvents ?? [], todoEvent, "eventId");
  if (operationLog) workspace.operationLogs = upsertById(workspace.operationLogs ?? [], operationLog, "id");
}

function findWorkspaceTodo(workspace, todoId) {
  const id = cleanText(todoId);
  return (workspace.todos ?? []).find((item) => cleanText(item.id ?? item.todoId) === id) ?? null;
}

function upsertById(rows, record, key) {
  return [record, ...rows.filter((item) => cleanText(item[key] ?? item.id) !== cleanText(record[key] ?? record.id))];
}

function normalizeScopePart(value) {
  return cleanText(value).toLowerCase().replace(/[^a-z0-9_.:-]+/g, "-") || "unknown";
}

function normalizeOptionalTimestamp(value) {
  const text = cleanText(value);
  if (!text || Number.isNaN(Date.parse(text))) return "";
  return new Date(text).toISOString();
}

function normalizeTimestampOrText(value) {
  const text = cleanText(value);
  if (!text || Number.isNaN(Date.parse(text))) return text;
  return new Date(text).toISOString();
}

function normalizeObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function cleanText(value) {
  return String(value ?? "").trim();
}
