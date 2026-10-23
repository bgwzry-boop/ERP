import { resolveStoreMode } from "./storeMode.mjs";
import { createPostgresPoolClient } from "./postgresPoolClient.mjs";
import { createPostgresParameterBinder } from "./postgresSqlParameters.mjs";
import { createPostgresTransactionExecutor } from "./postgresTransactionExecutor.mjs";
import { buildPostgresIdempotencyRequest, resolveRepositoryIdempotencyKey, readPostgresIdempotencyReplay, buildIdempotencyRequestHash, buildIdempotencyConflictError } from "./idempotency.mjs";

export function createProductionFinishedGoodsPhotoTransactionRepository(options = {}) {
  const mode = resolveStoreMode({
    explicitMode: options.mode,
    envKeys: ["ERP_PRODUCTION_PHOTO_STORE", "ERP_PRODUCTION_STORE"],
    runtimeMode: options.runtimeMode,
    allowLocalFixture: options.allowLocalFixture,
  });
  if (mode === "postgres") return createPostgresProductionFinishedGoodsPhotoTransactionRepository(options);
  if (mode === "local") return createLocalProductionFinishedGoodsPhotoTransactionRepository();
  throw new Error(`Unsupported production finished-goods photo repository mode: ${mode}`);
}

export function createLocalProductionFinishedGoodsPhotoTransactionRepository() {
  const receipts = new WeakMap();
  const readReviewReceipt = ({ workspace, idempotencyKey, idempotencyPayload }) => {
    if (!idempotencyKey) return null;
    const stored = receipts.get(workspace)?.get(idempotencyKey);
    if (!stored) return null;
    if (stored.hash !== buildIdempotencyRequestHash(idempotencyPayload)) throw buildIdempotencyConflictError();
    return structuredClone(stored.result);
  };
  return {
    readReviewReceipt,
    kind: "local_memory",
    async getProductionTask({ workspace, productionTaskId }) {
      return findById(workspace.productionTasks, productionTaskId, "productionTaskId");
    },
    async getPhotoTodoContext({ workspace }) {
      return { todos: workspace.todos ?? [], todoEvents: workspace.todoEvents ?? [], productionTasks: workspace.productionTasks ?? [] };
    },
    async uploadPhoto(input) {
      assertLocalPhotoVersion(input);
      applyMutation(input);
      return resultFromInput(input);
    },
    async reviewPhoto(input) {
      const prior = readReviewReceipt(input);
      if (prior) return prior;
      assertLocalPhotoVersion(input);
      applyMutation(input);
      const result = resultFromInput(input);
      if (input.idempotencyKey) {
        if (!receipts.has(input.workspace)) receipts.set(input.workspace, new Map());
        receipts.get(input.workspace).set(input.idempotencyKey, { hash: buildIdempotencyRequestHash(input.idempotencyPayload), result: structuredClone(result) });
      }
      return result;
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
    async readReviewReceipt({ idempotencyKey, idempotencyPayload }) {
      const value = await readPostgresIdempotencyReplay({ queryJson, scope: "production.finished_goods_photo.review", idempotencyKey, payload: idempotencyPayload });
      return value ? normalizeResult(value, {}) : null;
    },
    async getProductionTask({ productionTaskId }) {
      const query = buildGetProductionPhotoTaskQuery(productionTaskId);
      return normalizeTask(await queryJson(query.text, query.values));
    },
    async getPhotoTodoContext({ orderLineId }) {
      const parameters = createPostgresParameterBinder();
      const line = parameters.text(orderLineId);
      const value = await queryJson(`WITH relevant_todos AS (
        SELECT * FROM todos WHERE ref_id = ${line} AND type IN ('成品图需重拍', '待通知客户')
      ) SELECT json_build_object(
        'todos', COALESCE((SELECT json_agg(${todoJson("t")}) FROM relevant_todos t), '[]'::json),
        'todoEvents', COALESCE((SELECT json_agg(json_build_object('todoId', e.todo_id, 'eventPayload', e.event_payload))
          FROM todo_events e JOIN relevant_todos t ON t.id = e.todo_id), '[]'::json),
        'productionTasks', COALESCE((SELECT json_agg(${taskJson("p")}) FROM production_tasks p WHERE p.order_line_id = ${line}), '[]'::json)
      ) AS result`, parameters.values);
      if (!value || !Array.isArray(value.todos) || !Array.isArray(value.todoEvents) || !Array.isArray(value.productionTasks)) {
        throw new Error("Production photo todo context is unavailable");
      }
      return { ...value, todos: value.todos.map(todo => ({ ...todo, id: todo.todoId, handled: ['已处理', 'completed', 'done'].includes(todo.status) })) };
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
  SELECT id, revision, order_line_id FROM production_tasks
  WHERE id = ${parameters.text(task.productionTaskId)}
  FOR UPDATE
),
write_guard AS MATERIALIZED (
  SELECT erp_require(
    EXISTS (SELECT 1 FROM locked_task WHERE revision = ${parameters.integer(expectedRevision)}
      AND order_line_id = ${parameters.text(task.orderLineId)}),
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

function assertLocalPhotoVersion({ workspace, productionTask }) {
  const current = findById(workspace.productionTasks, productionTask?.productionTaskId, "productionTaskId");
  const currentRevision = Number(current?.revision ?? 1);
  if (!current || !Number.isSafeInteger(currentRevision) || currentRevision < 1 ||
      productionTask.revision !== currentRevision + 1 ||
      text(current.orderLineId ?? current.order_line_id) !== text(productionTask.orderLineId)) {
    const error = new Error("成品图或生产任务已更新，请刷新并重新核对后再提交。");
    error.code = "BUSINESS_WRITE_CONFLICT";
    error.statusCode = 409;
    throw error;
  }
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
