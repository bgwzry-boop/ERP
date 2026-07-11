import { createPostgresPoolClient } from "./postgresPoolClient.mjs";
import { createPostgresParameterBinder } from "./postgresSqlParameters.mjs";
import { createPostgresTransactionExecutor } from "./postgresTransactionExecutor.mjs";
import { buildPostgresIdempotencyRequest, resolveRepositoryIdempotencyKey } from "./idempotency.mjs";

export function createProductionFinishedGoodsPhotoTransactionRepository(options = {}) {
  const mode = options.mode ?? process.env.ERP_PRODUCTION_PHOTO_STORE ?? process.env.ERP_PRODUCTION_STORE ?? "local";
  if (mode === "postgres") return createPostgresProductionFinishedGoodsPhotoTransactionRepository(options);
  if (mode === "local") return createLocalProductionFinishedGoodsPhotoTransactionRepository();
  throw new Error(`Unsupported production finished-goods photo repository mode: ${mode}`);
}

export function createLocalProductionFinishedGoodsPhotoTransactionRepository() {
  return {
    kind: "local_memory",
    async getProductionTask({ workspace, productionTaskId }) {
      return findById(workspace.productionTasks, productionTaskId, "productionTaskId");
    },
    async uploadPhoto(input) {
      applyMutation(input);
      return resultFromInput(input);
    },
    async reviewPhoto(input) {
      applyMutation(input);
      return resultFromInput(input);
    },
  };
}

export function createPostgresProductionFinishedGoodsPhotoTransactionRepository(options = {}) {
  const postgresClient =
    options.postgresClient ?? (options.queryJson || options.transactionJson ? null : createPostgresPoolClient(options));
  const queryJson = options.queryJson ?? ((text, values) => postgresClient.queryJson(text, values));
  const { idempotentTransactionJson } = createPostgresTransactionExecutor({ ...options, postgresClient });
  return {
    kind: "postgres",
    async getProductionTask({ productionTaskId }) {
      const query = buildGetProductionPhotoTaskQuery(productionTaskId);
      return normalizeTask(await queryJson(query.text, query.values));
    },
    async uploadPhoto(input) {
      return persist(input, "production.finished_goods_photo.upload", buildUploadPhotoTransactionQuery, idempotentTransactionJson);
    },
    async reviewPhoto(input) {
      return persist(input, "production.finished_goods_photo.review", buildReviewPhotoTransactionQuery, idempotentTransactionJson);
    },
  };
}

async function persist(input, scope, buildQuery, execute) {
  const query = buildQuery(input);
  const value = await execute(
    buildPostgresIdempotencyRequest({
      scope,
      idempotencyKey: resolveRepositoryIdempotencyKey(input.idempotencyKey, input.operationLog?.id),
      payload: input.idempotencyPayload ?? {},
      operatorId: input.operationLog?.operatorId,
      targetType: "production_task",
      targetId: input.productionTask?.productionTaskId,
      resourceLocks: [
        `production-task:${input.productionTask?.productionTaskId ?? ""}`,
        ...(input.todos ?? []).map((todo) => `todo:${todo.id}`),
      ],
      query,
    }),
  );
  const result = normalizeResult(value, input);
  if (!result.productionTask || !result.operationLogId) {
    throw new Error("PostgreSQL production photo transaction returned invalid data");
  }
  applyMutation({
    ...input,
    productionTask: result.productionTask,
    todos: result.todos,
    todoEvents: result.todoEventIds.length ? input.todoEvents : [],
    operationLog: result.operationLogId === input.operationLog?.id ? input.operationLog : null,
  });
  return result;
}

export function buildGetProductionPhotoTaskQuery(productionTaskId) {
  const parameters = createPostgresParameterBinder();
  return {
    text: `SELECT ${taskJson("production_tasks")} AS result FROM production_tasks WHERE id = ${parameters.text(productionTaskId)};`,
    values: parameters.values,
  };
}

export function buildUploadPhotoTransactionQuery(input = {}) {
  return buildWriteQuery(input, false);
}

export function buildReviewPhotoTransactionQuery(input = {}) {
  return buildWriteQuery(input, true);
}

function buildWriteQuery(input, includeTodos) {
  const task = normalizeTask(input.productionTask);
  const operationLog = normalizeLog(input.operationLog);
  const todos = (input.todos ?? []).map(normalizeTodo).filter(Boolean);
  const todoEvents = (input.todoEvents ?? []).map(normalizeTodoEvent).filter(Boolean);
  if (!task || !operationLog || (includeTodos && (!todos.length || !todoEvents.length))) {
    throw new Error("Production task, operation log, and review todo records are required");
  }
  const parameters = createPostgresParameterBinder();
  const expectedRevision = Math.max(1, task.revision - 1);
  const todoSql = includeTodos ? buildTodoWrites(todos, parameters) : "SELECT NULL::json AS result WHERE false";
  const eventSql = includeTodos ? buildTodoEventWrites(todoEvents, parameters) : "SELECT NULL::text AS id WHERE false";
  return {
    text: `
BEGIN;
WITH locked_task AS MATERIALIZED (
  SELECT id, revision FROM production_tasks
  WHERE id = ${parameters.text(task.productionTaskId)}
  FOR UPDATE
),
write_guard AS MATERIALIZED (
  SELECT erp_require(
    EXISTS (SELECT 1 FROM locked_task WHERE revision = ${parameters.integer(expectedRevision)}),
    'ERP_PRODUCTION_PHOTO_CONCURRENCY_CONFLICT'
  ) AS ok
),
updated_task AS (
  UPDATE production_tasks
  SET finished_goods_photo = ${parameters.json(task.finishedGoodsPhoto)}, revision = production_tasks.revision + 1,
      updated_at = ${parameters.timestamp(task.updatedAt)}
  FROM locked_task, write_guard AS guard
  WHERE production_tasks.id = locked_task.id AND guard.ok
  RETURNING ${taskJson("production_tasks")} AS result
),
written_todos AS (
  ${todoSql}
),
inserted_todo_events AS (
  ${eventSql}
),
inserted_operation_log AS (
  INSERT INTO operation_logs (
    id, target_type, target_id, action, before_json, after_json, reason, operator_id, page_key, occurred_at, created_at
  ) SELECT
    ${parameters.text(operationLog.id)}, ${parameters.text(operationLog.targetType)}, ${parameters.text(operationLog.targetId)},
    ${parameters.text(operationLog.action)}, ${parameters.json(operationLog.before)}, ${parameters.json(operationLog.after)},
    ${parameters.text(operationLog.reason)}, ${parameters.nullableText(operationLog.operatorId)}, ${parameters.text(operationLog.pageKey)},
    ${parameters.timestamp(operationLog.occurredAt)}, ${parameters.timestamp(operationLog.createdAt)}
  FROM updated_task
  ON CONFLICT (id) DO NOTHING
  RETURNING id
)
SELECT json_build_object(
  'productionTask', (SELECT result FROM updated_task),
  'todos', (SELECT COALESCE(json_agg(result), '[]'::json) FROM written_todos),
  'todoEventIds', (SELECT COALESCE(json_agg(id), '[]'::json) FROM inserted_todo_events),
  'operationLogId', (SELECT id FROM inserted_operation_log)
) AS result;
COMMIT;
`.trim(),
    values: parameters.values,
  };
}

function buildTodoWrites(todos, parameters) {
  const values = todos.map((todo) => `(
  ${parameters.text(todo.id)}, ${parameters.text(todo.bizNo)}, ${parameters.text(todo.type)}, ${parameters.text(todo.refType)},
  ${parameters.text(todo.refId)}, ${parameters.text(todo.priority)}, ${parameters.text(todo.status)}, ${parameters.text(todo.summary)},
  ${parameters.nullableTimestamp(todo.dueAt)}, ${parameters.nullableTimestamp(todo.remindAt)}, ${parameters.nullableText(todo.handledBy)},
  ${parameters.nullableTimestamp(todo.handledAt)}, ${parameters.nullableText(todo.handlingResult)}, ${parameters.nullableText(todo.createdBy)},
  ${parameters.timestamp(todo.createdAt)}, ${parameters.timestamp(todo.updatedAt)}
)`).join(",\n");
  return `INSERT INTO todos (
  id, biz_no, type, ref_type, ref_id, priority, status, summary, due_at, remind_at,
  handled_by, handled_at, handling_result, created_by, created_at, updated_at
) SELECT
  todo_values.id, todo_values.biz_no, todo_values.type, todo_values.ref_type, todo_values.ref_id,
  todo_values.priority, todo_values.status, todo_values.summary,
  todo_values.due_at::timestamptz, todo_values.remind_at::timestamptz,
  todo_values.handled_by, todo_values.handled_at::timestamptz, todo_values.handling_result,
  todo_values.created_by, todo_values.created_at::timestamptz, todo_values.updated_at::timestamptz
FROM (VALUES
${values}
) AS todo_values (
  id, biz_no, type, ref_type, ref_id, priority, status, summary, due_at, remind_at,
  handled_by, handled_at, handling_result, created_by, created_at, updated_at
)
WHERE EXISTS (SELECT 1 FROM updated_task)
ON CONFLICT (id) DO UPDATE SET
  status = EXCLUDED.status, summary = EXCLUDED.summary, priority = EXCLUDED.priority,
  handled_by = EXCLUDED.handled_by, handled_at = EXCLUDED.handled_at,
  handling_result = EXCLUDED.handling_result, updated_at = EXCLUDED.updated_at
RETURNING ${todoJson("todos")} AS result`;
}

function buildTodoEventWrites(events, parameters) {
  const values = events.map((event) => `(
  ${parameters.text(event.eventId)}, ${parameters.text(event.todoId)}, ${parameters.text(event.eventType)},
  ${parameters.json(event.eventPayload)}, ${parameters.nullableText(event.operatorId)},
  ${parameters.timestamp(event.occurredAt)}, ${parameters.timestamp(event.createdAt)}
)`).join(",\n");
  return `INSERT INTO todo_events (id, todo_id, event_type, event_payload, operator_id, occurred_at, created_at)
SELECT event_values.* FROM (VALUES
${values}
) AS event_values (id, todo_id, event_type, event_payload, operator_id, occurred_at, created_at)
WHERE EXISTS (SELECT 1 FROM updated_task)
ON CONFLICT (id) DO NOTHING
RETURNING id`;
}

function normalizeResult(value, input) {
  return {
    productionTask: merge(input.productionTask, normalizeTask(value?.productionTask)),
    todos: mergeTodos(input.todos, value?.todos),
    todoEventIds: Array.isArray(value?.todoEventIds) ? value.todoEventIds.map(text).filter(Boolean) : [],
    operationLogId: text(value?.operationLogId),
  };
}

function resultFromInput(input) {
  return {
    productionTask: input.productionTask,
    todos: input.todos ?? [],
    todoEventIds: (input.todoEvents ?? []).map((event) => event.eventId),
    operationLogId: input.operationLog?.id ?? "",
  };
}

function applyMutation({ workspace, productionTask, todos = [], todoEvents = [], operationLog }) {
  workspace.productionTasks = upsert(workspace.productionTasks, productionTask, "productionTaskId");
  for (const todo of todos) workspace.todos = upsert(workspace.todos, todo, "id");
  for (const event of todoEvents) workspace.todoEvents = upsert(workspace.todoEvents, event, "eventId");
  if (operationLog) workspace.operationLogs = upsert(workspace.operationLogs, operationLog, "id");
}

function normalizeTask(value) {
  if (!value || typeof value !== "object") return null;
  const productionTaskId = text(value.productionTaskId ?? value.id);
  if (!productionTaskId) return null;
  const photo = object(value.finishedGoodsPhoto ?? value.finished_goods_photo);
  return {
    ...value,
    id: productionTaskId,
    productionTaskId,
    orderLineId: text(value.orderLineId ?? value.order_line_id),
    revision: Math.max(1, integer(value.revision, 1)),
    finishedGoodsPhoto: photo,
    finishedGoodsPhotoStatus: text(photo.status),
    finishedGoodsPhotoAttachmentId: text(photo.attachmentId),
    finishedGoodsPhotoFileName: text(photo.fileName),
    finishedGoodsPhotoUploadedAt: text(photo.uploadedAt),
    finishedGoodsPhotoUploadedBy: text(photo.uploadedBy),
    finishedGoodsPhotoReviewedAt: text(photo.reviewedAt),
    finishedGoodsPhotoReviewedBy: text(photo.reviewedBy),
    finishedGoodsPhotoRejectedReason: text(photo.rejectedReason),
    finishedGoodsPhotoHistory: Array.isArray(photo.history) ? photo.history : [],
    updatedAt: text(value.updatedAt ?? value.updated_at),
  };
}

function normalizeTodo(value) {
  if (!value || typeof value !== "object") return null;
  const id = text(value.id ?? value.todoId);
  if (!id) return null;
  return {
    ...value,
    id,
    bizNo: text(value.bizNo) || id,
    refType: text(value.refType) || "order_line",
    refId: text(value.refId ?? value.ref),
    priority: text(value.priority ?? value.urgency) || "普通",
    status: value.handled ? "已处理" : text(value.status) || "未处理",
    dueAt: text(value.dueAt),
    remindAt: text(value.remindAt),
    handledBy: text(value.handledBy),
    handledAt: text(value.handledAt),
    handlingResult: text(value.handlingResult),
    createdBy: text(value.createdBy),
    createdAt: text(value.createdAt) || new Date().toISOString(),
    updatedAt: text(value.updatedAt) || new Date().toISOString(),
  };
}

function normalizeTodoEvent(value) {
  if (!value?.eventId || !value?.todoId) return null;
  return { ...value, eventPayload: value.eventPayload ?? {} };
}

function normalizeLog(value) {
  if (!value?.id) return null;
  return { ...value, pageKey: text(value.pageKey) || "api" };
}

function taskJson(alias) {
  return `json_build_object(
    'productionTaskId', ${alias}.id, 'orderLineId', ${alias}.order_line_id,
    'revision', ${alias}.revision, 'finishedGoodsPhoto', ${alias}.finished_goods_photo,
    'updatedAt', ${alias}.updated_at
  )`;
}

function todoJson(alias) {
  return `json_build_object(
    'todoId', ${alias}.id, 'bizNo', ${alias}.biz_no, 'type', ${alias}.type,
    'refType', ${alias}.ref_type, 'refId', ${alias}.ref_id, 'priority', ${alias}.priority,
    'status', ${alias}.status, 'summary', ${alias}.summary, 'dueAt', ${alias}.due_at,
    'remindAt', ${alias}.remind_at, 'handledBy', ${alias}.handled_by, 'handledAt', ${alias}.handled_at,
    'handlingResult', ${alias}.handling_result, 'createdBy', ${alias}.created_by,
    'createdAt', ${alias}.created_at, 'updatedAt', ${alias}.updated_at
  )`;
}

function mergeTodos(projected = [], canonical = []) {
  const byId = new Map(projected.map((todo) => [text(todo.id ?? todo.todoId), todo]));
  return (canonical ?? []).map((todo) => {
    const normalized = normalizeTodo(todo);
    const source = byId.get(normalized?.id) ?? {};
    return normalized ? { ...source, ...normalized, id: normalized.id, ref: normalized.refId, handled: normalized.status === "已处理" } : null;
  }).filter(Boolean);
}

function upsert(rows = [], record, key) {
  const id = text(record?.[key] ?? record?.id);
  const existing = (rows ?? []).find((item) => text(item?.[key] ?? item?.id) === id);
  return [{ ...(existing ?? {}), ...record }, ...(rows ?? []).filter((item) => text(item?.[key] ?? item?.id) !== id)];
}

function findById(rows = [], id, key) {
  return (rows ?? []).find((item) => text(item?.[key] ?? item?.id) === text(id)) ?? null;
}

function merge(projected, canonical) {
  return canonical ? { ...projected, ...canonical } : null;
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function integer(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.trunc(number) : fallback;
}

function text(value) {
  return String(value ?? "").trim();
}
