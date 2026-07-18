import { createPostgresPoolClient } from "./postgresPoolClient.mjs";
import { createPostgresParameterBinder } from "./postgresSqlParameters.mjs";
import { createPostgresTransactionExecutor } from "./postgresTransactionExecutor.mjs";
import {
  buildIdempotencyConflictError,
  buildIdempotencyRequestHash,
  buildPostgresIdempotencyRequest,
  readPostgresIdempotencyReplay,
  resolveRepositoryIdempotencyKey,
} from "./idempotency.mjs";

export function createTodoActionRepository(options = {}) {
  const mode = options.mode ?? process.env.ERP_TODO_ACTION_STORE ?? process.env.ERP_CORE_WORKSPACE_STORE ?? "local";
  if (mode === "postgres") return createPostgresTodoActionRepository(options);
  if (mode === "local") return createLocalTodoActionRepository();
  throw new Error(`Unsupported todo action repository mode: ${mode}`);
}

export function createLocalTodoActionRepository() {
  const todoActionResults = new Map();
  const fulfillmentRepairResults = new Map();
  return {
    kind: "local_memory",
    async getTodo({ workspace, todoId }) {
      return buildLocalTodoSnapshot(findWorkspaceTodo(workspace, todoId));
    },
    async recordTodoAction(input = {}) {
      const replay = readLocalTodoActionReplay(todoActionResults, input);
      if (replay) return replay;
      validateLocalTodoActionState(input);
      const todo = normalizeTodoRecord(input.todo, input.todoEvent);
      const todoEvent = normalizeTodoEvent(input.todoEvent);
      if (!todo || !todoEvent) throw new Error("Todo and todo event are required");
      applyTodoActionWorkspaceMutation({
        workspace: input.workspace,
        todo,
        todoEvent,
        operationLog: input.operationLog,
      });
      const result = {
        todo,
        todoEvent,
        operationLogId: input.operationLog?.id ?? "",
      };
      saveLocalTodoActionReplay(todoActionResults, input, result);
      return result;
    },
    async findFulfillmentRepairReplay(input = {}) {
      return readLocalFulfillmentRepairReplay(fulfillmentRepairResults, input);
    },
    async repairMissingFulfillment(input = {}) {
      const replay = readLocalFulfillmentRepairReplay(fulfillmentRepairResults, input);
      if (replay) return replay;
      validateLocalFulfillmentRepairState(input);
      const result = normalizeFulfillmentRepairResult({
        todo: input.completedTodo,
        labelTodo: input.labelTodo,
        fulfillment: input.fulfillment,
        packages: (input.packages ?? []).map((record) => ({
          ...record,
          fulfillmentId: input.fulfillment?.fulfillmentId ?? input.fulfillment?.id,
          status: "待打印标签",
          updatedAt: input.fulfillment?.updatedAt,
        })),
        oldTodoEventId: input.oldTodoEvent?.eventId,
        newTodoEventId: input.newTodoEvent?.eventId,
        operationLogId: input.operationLog?.id,
      }, input);
      applyFulfillmentRepairWorkspaceMutation(input.workspace, result, input);
      saveLocalFulfillmentRepairReplay(fulfillmentRepairResults, input, result);
      return result;
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
    async findFulfillmentRepairReplay(input = {}) {
      const replay = await readPostgresIdempotencyReplay({
        queryJson,
        scope: "todo.fulfillment_repair",
        idempotencyKey: input.idempotencyKey,
        payload: input.idempotencyPayload,
      });
      return replay ? normalizeFulfillmentRepairResult(replay) : null;
    },
    async repairMissingFulfillment(input = {}) {
      const query = buildRepairMissingFulfillmentTransactionQuery(input);
      const saved = normalizeFulfillmentRepairResult(
        await idempotentTransactionJson(
          buildPostgresIdempotencyRequest({
            scope: "todo.fulfillment_repair",
            idempotencyKey: resolveRepositoryIdempotencyKey(input.idempotencyKey, input.operationLog?.id),
            payload: input.idempotencyPayload,
            operatorId: input.operationLog?.operatorId,
            targetType: "todo",
            targetId: input.completedTodo?.id,
            resourceLocks: [
              `todo:${input.completedTodo?.id ?? ""}`,
              `order-line:${input.fulfillment?.orderLineId ?? ""}`,
              `fulfillment:${input.fulfillment?.fulfillmentId ?? input.fulfillment?.id ?? ""}`,
              `packing-task:${input.packingTask?.packingTaskId ?? input.packingTask?.id ?? ""}`,
            ],
            query,
          }),
        ),
        input,
      );
      if (!saved.todo || !saved.labelTodo || !saved.fulfillment || saved.packages.length === 0) {
        throw new Error("PostgreSQL fulfillment repair transaction returned an invalid result");
      }
      applyFulfillmentRepairWorkspaceMutation(input.workspace, saved, input);
      return saved;
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
    ref_type = ${parameters.text(todo.refType)},
    ref_id = ${parameters.text(todo.refId)},
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

export function buildRepairMissingFulfillmentTransactionQuery(input = {}) {
  const completedTodo = normalizeTodoForPersistence(input.completedTodo);
  const labelTodo = normalizeTodoForPersistence(input.labelTodo);
  const fulfillment = normalizeFulfillmentRepairRecord(input.fulfillment);
  const packages = normalizeFulfillmentRepairPackages(input.packages);
  const packingTaskId = cleanText(input.packingTask?.packingTaskId ?? input.packingTask?.id);
  const packingActualQty = nonNegativeInteger(input.packingTask?.actualPackedQty);
  const oldTodoEvent = normalizeTodoEvent(input.oldTodoEvent);
  const newTodoEvent = normalizeTodoEvent(input.newTodoEvent);
  const operationLog = normalizeOperationLog(input.operationLog);
  if (
    !completedTodo || !labelTodo || !fulfillment || packages.length === 0 || !packingTaskId || packingActualQty <= 0
    || !oldTodoEvent || !newTodoEvent || !operationLog
  ) {
    throw new Error("Todo, fulfillment, completed packing data, events, and operation log are required for fulfillment repair");
  }

  const parameters = createPostgresParameterBinder();
  const expectedUpdatedAt = parameters.nullableTimestamp(input.expectedUpdatedAt ?? input.beforeTodo?.updatedAt);
  const packageIds = packages.map((record) => record.packageId);
  const updatedAt = fulfillment.updatedAt || new Date().toISOString();
  return {
    text: `
BEGIN;
WITH locked_todo AS MATERIALIZED (
  SELECT *
  FROM todos
  WHERE id = ${parameters.text(completedTodo.id)}
  FOR UPDATE
),
locked_order_line AS MATERIALIZED (
  SELECT *
  FROM order_lines
  WHERE id = ${parameters.text(fulfillment.orderLineId)}
  FOR UPDATE
),
locked_packing_task AS MATERIALIZED (
  SELECT *
  FROM packing_tasks
  WHERE id = ${parameters.text(packingTaskId)}
  FOR UPDATE
),
locked_packages AS MATERIALIZED (
  SELECT *
  FROM packages
  WHERE order_line_id = ${parameters.text(fulfillment.orderLineId)}
  FOR UPDATE
),
existing_fulfillment AS MATERIALIZED (
  SELECT id
  FROM fulfillment_records
  WHERE order_line_id = ${parameters.text(fulfillment.orderLineId)}
     OR id = ${parameters.text(fulfillment.fulfillmentId)}
  FOR UPDATE
),
repair_guard AS MATERIALIZED (
  SELECT erp_require(
    (SELECT COUNT(*) FROM locked_todo) = 1
      AND EXISTS (
        SELECT 1 FROM locked_todo
        WHERE type = '出库交付待补建'
          AND status <> '已处理'
          AND ref_type = 'order_line'
          AND ref_id = ${parameters.text(fulfillment.orderLineId)}
          AND (
            ${expectedUpdatedAt} IS NULL
            OR date_trunc('milliseconds', updated_at) = date_trunc('milliseconds', ${expectedUpdatedAt})
          )
      )
      AND EXISTS (
        SELECT 1 FROM locked_order_line
        WHERE customer_id = ${parameters.text(fulfillment.customerId)}
          AND fulfillment_method IN ('快递快运', 'express_ltl')
      )
      AND EXISTS (
        SELECT 1 FROM locked_packing_task
        WHERE order_line_id = ${parameters.text(fulfillment.orderLineId)}
          AND status = '已完成'
          AND actual_packed_qty = ${parameters.integer(packingActualQty)}
      )
      AND (SELECT COUNT(*) FROM existing_fulfillment) = 0
      AND (SELECT COUNT(*) FROM locked_packages) = ${parameters.integer(packages.length)}
      AND (
        SELECT COUNT(*) FROM locked_packages
        WHERE id = ANY(${parameters.textArray(packageIds)})
      ) = ${parameters.integer(packages.length)}
      AND (
        SELECT COUNT(*) FROM locked_packages
        WHERE fulfillment_id IS NOT NULL AND fulfillment_id <> ''
      ) = 0
      AND (SELECT COALESCE(SUM(packed_qty), 0) FROM locked_packages) = ${parameters.integer(packingActualQty)},
    'ERP_TODO_FULFILLMENT_REPAIR_CONFLICT'
  ) AS ok
),
inserted_fulfillment AS (
  INSERT INTO fulfillment_records (
    id, biz_no, order_line_id, customer_id, customer_snapshot, method,
    expected_qty, actual_qty, status, latest_needed_at, created_by, created_at, updated_at
  )
  SELECT
    ${parameters.text(fulfillment.fulfillmentId)},
    ${parameters.text(fulfillment.bizNo)},
    ${parameters.text(fulfillment.orderLineId)},
    ${parameters.text(fulfillment.customerId)},
    ${parameters.json(fulfillment.customerSnapshot)},
    ${parameters.text(fulfillment.method)},
    ${parameters.integer(fulfillment.expectedQty)},
    ${parameters.integer(fulfillment.actualQty)},
    ${parameters.text(fulfillment.status)},
    ${parameters.nullableTimestamp(fulfillment.latestNeededAt)},
    ${parameters.nullableText(fulfillment.createdBy)},
    ${parameters.timestamp(fulfillment.createdAt)},
    ${parameters.timestamp(updatedAt)}
  FROM repair_guard
  WHERE ok
  RETURNING ${fulfillmentRepairJsonExpression("fulfillment_records")} AS result
),
updated_packages AS (
  UPDATE packages
  SET
    fulfillment_id = ${parameters.text(fulfillment.fulfillmentId)},
    status = '待打印标签',
    updated_at = ${parameters.timestamp(updatedAt)}
  FROM inserted_fulfillment
  WHERE packages.order_line_id = ${parameters.text(fulfillment.orderLineId)}
    AND packages.id = ANY(${parameters.textArray(packageIds)})
  RETURNING ${fulfillmentRepairPackageJsonExpression("packages")} AS result
),
updated_todo AS (
  UPDATE todos
  SET
    status = ${parameters.text(completedTodo.status)},
    handled_by = ${parameters.nullableText(completedTodo.handledBy)},
    handled_at = ${parameters.nullableTimestamp(completedTodo.handledAt)},
    handling_result = ${parameters.nullableText(completedTodo.handlingResult)},
    updated_at = ${parameters.timestamp(completedTodo.updatedAt)}
  FROM inserted_fulfillment
  WHERE todos.id = ${parameters.text(completedTodo.id)}
  RETURNING ${todoJsonExpression("todos")} AS result
),
inserted_label_todo AS (
  INSERT INTO todos (
    id, biz_no, type, ref_type, ref_id, priority, status, summary,
    due_at, remind_at, handled_by, handled_at, handling_result,
    created_by, created_at, updated_at
  )
  SELECT
    ${parameters.text(labelTodo.id)},
    ${parameters.text(labelTodo.bizNo)},
    ${parameters.text(labelTodo.type)},
    ${parameters.text(labelTodo.refType)},
    ${parameters.text(labelTodo.refId)},
    ${parameters.text(labelTodo.priority)},
    ${parameters.text(labelTodo.status)},
    ${parameters.text(labelTodo.summary)},
    ${parameters.nullableTimestamp(labelTodo.dueAt)},
    ${parameters.nullableTimestamp(labelTodo.remindAt)},
    ${parameters.nullableText(labelTodo.handledBy)},
    ${parameters.nullableTimestamp(labelTodo.handledAt)},
    ${parameters.nullableText(labelTodo.handlingResult)},
    ${parameters.nullableText(labelTodo.createdBy)},
    ${parameters.timestamp(labelTodo.createdAt)},
    ${parameters.timestamp(labelTodo.updatedAt)}
  FROM inserted_fulfillment
  RETURNING ${todoJsonExpression("todos")} AS result
),
inserted_old_todo_event AS (
  INSERT INTO todo_events (id, todo_id, event_type, event_payload, operator_id, occurred_at, created_at)
  SELECT
    ${parameters.text(oldTodoEvent.eventId)},
    ${parameters.text(oldTodoEvent.todoId)},
    ${parameters.text(oldTodoEvent.eventType)},
    ${parameters.json(oldTodoEvent.eventPayload)},
    ${parameters.nullableText(oldTodoEvent.operatorId)},
    ${parameters.timestamp(oldTodoEvent.occurredAt)},
    ${parameters.timestamp(oldTodoEvent.createdAt)}
  FROM updated_todo
  RETURNING id
),
inserted_new_todo_event AS (
  INSERT INTO todo_events (id, todo_id, event_type, event_payload, operator_id, occurred_at, created_at)
  SELECT
    ${parameters.text(newTodoEvent.eventId)},
    ${parameters.text(newTodoEvent.todoId)},
    ${parameters.text(newTodoEvent.eventType)},
    ${parameters.json(newTodoEvent.eventPayload)},
    ${parameters.nullableText(newTodoEvent.operatorId)},
    ${parameters.timestamp(newTodoEvent.occurredAt)},
    ${parameters.timestamp(newTodoEvent.createdAt)}
  FROM inserted_label_todo
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
  FROM updated_todo, inserted_label_todo
  RETURNING id
)
SELECT json_build_object(
  'todo', (SELECT result FROM updated_todo),
  'labelTodo', (SELECT result FROM inserted_label_todo),
  'fulfillment', (SELECT result FROM inserted_fulfillment),
  'packages', (SELECT COALESCE(json_agg(result ORDER BY (result->>'packageSeq')::int), '[]'::json) FROM updated_packages),
  'oldTodoEventId', (SELECT id FROM inserted_old_todo_event),
  'newTodoEventId', (SELECT id FROM inserted_new_todo_event),
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

export function normalizeFulfillmentRepairResult(value, input = {}) {
  const todo = normalizeTodoRecord(value?.todo);
  const labelTodo = normalizeTodoRecord(value?.labelTodo ?? value?.label_todo);
  const fulfillment = normalizeFulfillmentRepairRecord(value?.fulfillment);
  const packages = normalizeFulfillmentRepairPackages(value?.packages);
  return {
    todo: todo ? { ...(input.completedTodo ?? {}), ...todo } : null,
    labelTodo: labelTodo ? { ...(input.labelTodo ?? {}), ...labelTodo } : null,
    fulfillment: fulfillment ? { ...(input.fulfillment ?? {}), ...fulfillment } : null,
    packages,
    oldTodoEventId: cleanText(value?.oldTodoEventId ?? value?.old_todo_event_id),
    newTodoEventId: cleanText(value?.newTodoEventId ?? value?.new_todo_event_id),
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

function normalizeFulfillmentRepairRecord(value) {
  if (!value || typeof value !== "object") return null;
  const fulfillmentId = cleanText(value.fulfillmentId ?? value.id);
  const orderLineId = cleanText(value.orderLineId ?? value.order_line_id ?? value.lineId);
  const customerId = cleanText(value.customerId ?? value.customer_id);
  if (!fulfillmentId || !orderLineId || !customerId) return null;
  const expectedQty = nonNegativeInteger(value.expectedQty ?? value.expected_qty ?? value.qty);
  const actualQty = nonNegativeInteger(value.actualQty ?? value.actual_qty ?? expectedQty);
  const latestNeededAt = normalizeTimestampOrText(value.latestNeededAt ?? value.latest_needed_at ?? value.latest);
  return {
    ...value,
    id: fulfillmentId,
    fulfillmentId,
    bizNo: cleanText(value.bizNo ?? value.biz_no) || fulfillmentId,
    orderLineId,
    lineId: orderLineId,
    customerId,
    customerSnapshot: normalizeObject(value.customerSnapshot ?? value.customer_snapshot),
    method: cleanText(value.method) || "快递快运",
    expectedQty,
    qty: expectedQty,
    actualQty,
    status: cleanText(value.status) || "待打印标签",
    latestNeededAt,
    latest: latestNeededAt || cleanText(value.latest) || "待确认",
    revision: Math.max(1, nonNegativeInteger(value.revision ?? 1)),
    createdBy: cleanText(value.createdBy ?? value.created_by),
    createdAt: normalizeTimestampOrText(value.createdAt ?? value.created_at) || new Date().toISOString(),
    updatedAt: normalizeTimestampOrText(value.updatedAt ?? value.updated_at) || new Date().toISOString(),
  };
}

function normalizeFulfillmentRepairPackages(value) {
  if (!Array.isArray(value)) return [];
  return value.map(normalizeFulfillmentRepairPackage).filter(Boolean);
}

function normalizeFulfillmentRepairPackage(value) {
  if (!value || typeof value !== "object") return null;
  const packageId = cleanText(value.packageId ?? value.id);
  const orderLineId = cleanText(value.orderLineId ?? value.order_line_id);
  if (!packageId || !orderLineId) return null;
  return {
    ...value,
    id: packageId,
    packageId,
    bizNo: cleanText(value.bizNo ?? value.biz_no) || packageId,
    orderLineId,
    fulfillmentId: cleanText(value.fulfillmentId ?? value.fulfillment_id),
    packageSeq: nonNegativeInteger(value.packageSeq ?? value.package_seq ?? 1),
    packageCount: nonNegativeInteger(value.packageCount ?? value.package_count ?? 1),
    packedQty: nonNegativeInteger(value.packedQty ?? value.packed_qty ?? value.qty),
    labelPrintRecordId: cleanText(value.labelPrintRecordId ?? value.label_print_record_id),
    status: cleanText(value.status) || "待打印标签",
    createdBy: cleanText(value.createdBy ?? value.created_by),
    createdAt: normalizeTimestampOrText(value.createdAt ?? value.created_at),
    updatedAt: normalizeTimestampOrText(value.updatedAt ?? value.updated_at),
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

function fulfillmentRepairJsonExpression(alias) {
  return `json_build_object(
    'fulfillmentId', ${alias}.id,
    'bizNo', ${alias}.biz_no,
    'orderLineId', ${alias}.order_line_id,
    'customerId', ${alias}.customer_id,
    'customerSnapshot', ${alias}.customer_snapshot,
    'method', ${alias}.method,
    'expectedQty', ${alias}.expected_qty,
    'actualQty', ${alias}.actual_qty,
    'status', ${alias}.status,
    'latestNeededAt', ${alias}.latest_needed_at,
    'revision', ${alias}.revision,
    'createdBy', ${alias}.created_by,
    'createdAt', ${alias}.created_at,
    'updatedAt', ${alias}.updated_at
  )`;
}

function fulfillmentRepairPackageJsonExpression(alias) {
  return `json_build_object(
    'packageId', ${alias}.id,
    'bizNo', ${alias}.biz_no,
    'orderLineId', ${alias}.order_line_id,
    'fulfillmentId', ${alias}.fulfillment_id,
    'packageSeq', ${alias}.package_seq,
    'packageCount', ${alias}.package_count,
    'packedQty', ${alias}.packed_qty,
    'labelPrintRecordId', ${alias}.label_print_record_id,
    'status', ${alias}.status,
    'createdBy', ${alias}.created_by,
    'createdAt', ${alias}.created_at,
    'updatedAt', ${alias}.updated_at
  )`;
}

function applyTodoActionWorkspaceMutation({ workspace, todo, todoEvent, operationLog }) {
  workspace.todos = upsertById(workspace.todos ?? [], todo, "id");
  if (todoEvent) workspace.todoEvents = upsertById(workspace.todoEvents ?? [], todoEvent, "eventId");
  if (operationLog) workspace.operationLogs = upsertById(workspace.operationLogs ?? [], operationLog, "id");
}

function applyFulfillmentRepairWorkspaceMutation(workspace, result, input = {}) {
  if (!workspace || !result) return;
  if (result.todo) workspace.todos = upsertById(workspace.todos ?? [], result.todo, "id");
  if (result.labelTodo) workspace.todos = upsertById(workspace.todos ?? [], result.labelTodo, "id");
  if (result.fulfillment) workspace.fulfillments = upsertById(workspace.fulfillments ?? [], result.fulfillment, "id");
  for (const packageRecord of result.packages ?? []) {
    workspace.packages = upsertById(workspace.packages ?? [], packageRecord, "packageId");
  }
  if (result.oldTodoEventId === input.oldTodoEvent?.eventId) {
    workspace.todoEvents = upsertById(workspace.todoEvents ?? [], input.oldTodoEvent, "eventId");
  }
  if (result.newTodoEventId === input.newTodoEvent?.eventId) {
    workspace.todoEvents = upsertById(workspace.todoEvents ?? [], input.newTodoEvent, "eventId");
  }
  if (result.operationLogId === input.operationLog?.id) {
    workspace.operationLogs = upsertById(workspace.operationLogs ?? [], input.operationLog, "id");
  }
}

function readLocalTodoActionReplay(store, input = {}) {
  const key = resolveRepositoryIdempotencyKey(input.idempotencyKey, input.operationLog?.id);
  const scope = `todo.action.${normalizeScopePart(input.action)}`;
  const existing = store.get(`${scope}:${key}`);
  if (!existing) return null;
  if (existing.requestHash !== buildIdempotencyRequestHash(input.idempotencyPayload ?? { action: input.action, todo: input.todo })) {
    throw buildIdempotencyConflictError();
  }
  return structuredClone(existing.result);
}

function saveLocalTodoActionReplay(store, input, result) {
  const key = resolveRepositoryIdempotencyKey(input.idempotencyKey, input.operationLog?.id);
  const scope = `todo.action.${normalizeScopePart(input.action)}`;
  store.set(`${scope}:${key}`, {
    requestHash: buildIdempotencyRequestHash(input.idempotencyPayload ?? { action: input.action, todo: input.todo }),
    result: structuredClone(result),
  });
}

function validateLocalTodoActionState(input) {
  const currentTodo = findWorkspaceTodo(input.workspace ?? {}, input.todo?.id ?? input.todo?.todoId);
  const expectedUpdatedAt = cleanText(input.expectedUpdatedAt ?? input.before?.updatedAt);
  if (!currentTodo || !expectedUpdatedAt || resolveLocalTodoVersion(currentTodo) !== expectedUpdatedAt) {
    const error = new Error("The todo changed before this action could be committed.");
    error.statusCode = 409;
    error.code = "BUSINESS_WRITE_CONFLICT";
    throw error;
  }
}

function buildLocalTodoSnapshot(todo) {
  if (!todo) return null;
  return structuredClone({
    ...todo,
    updatedAt: resolveLocalTodoVersion(todo),
  });
}

function resolveLocalTodoVersion(todo) {
  return cleanText(todo?.updatedAt ?? todo?.updated_at ?? todo?.createdAt ?? todo?.created_at)
    || "1970-01-01T00:00:00.000Z";
}

function readLocalFulfillmentRepairReplay(store, input = {}) {
  const key = resolveRepositoryIdempotencyKey(input.idempotencyKey, input.operationLog?.id);
  const existing = store.get(`todo.fulfillment_repair:${key}`);
  if (!existing) return null;
  if (existing.requestHash !== buildIdempotencyRequestHash(input.idempotencyPayload)) {
    throw buildIdempotencyConflictError();
  }
  return structuredClone(existing.result);
}

function saveLocalFulfillmentRepairReplay(store, input, result) {
  const key = resolveRepositoryIdempotencyKey(input.idempotencyKey, input.operationLog?.id);
  store.set(`todo.fulfillment_repair:${key}`, {
    requestHash: buildIdempotencyRequestHash(input.idempotencyPayload),
    result: structuredClone(result),
  });
}

function validateLocalFulfillmentRepairState(input) {
  const workspace = input.workspace ?? {};
  const todoId = cleanText(input.completedTodo?.id);
  const orderLineId = cleanText(input.fulfillment?.orderLineId);
  const fulfillmentId = cleanText(input.fulfillment?.fulfillmentId ?? input.fulfillment?.id);
  const currentTodo = findWorkspaceTodo(workspace, todoId);
  const currentPackingTask = (workspace.packingTasks ?? []).find(
    (record) => cleanText(record.packingTaskId ?? record.id) === cleanText(input.packingTask?.packingTaskId ?? input.packingTask?.id),
  );
  const currentPackages = (workspace.packages ?? []).filter(
    (record) => cleanText(record.orderLineId) === orderLineId,
  );
  const expectedPackageIds = new Set((input.packages ?? []).map((record) => cleanText(record.packageId ?? record.id)));
  const valid = currentTodo
    && cleanText(currentTodo.type) === "出库交付待补建"
    && !currentTodo.handled
    && cleanText(currentTodo.refType) === "order_line"
    && cleanText(currentTodo.refId ?? currentTodo.ref) === orderLineId
    && (!input.expectedUpdatedAt || cleanText(currentTodo.updatedAt) === cleanText(input.expectedUpdatedAt))
    && !(workspace.fulfillments ?? []).some(
      (record) => cleanText(record.orderLineId ?? record.lineId) === orderLineId || cleanText(record.id) === fulfillmentId,
    )
    && currentPackingTask
    && cleanText(currentPackingTask.status) === "已完成"
    && nonNegativeInteger(currentPackingTask.actualPackedQty) === nonNegativeInteger(input.packingTask?.actualPackedQty)
    && currentPackages.length === expectedPackageIds.size
    && currentPackages.every(
      (record) => expectedPackageIds.has(cleanText(record.packageId ?? record.id)) && !cleanText(record.fulfillmentId),
    )
    && currentPackages.reduce((sum, record) => sum + nonNegativeInteger(record.packedQty ?? record.qty), 0)
      === nonNegativeInteger(input.packingTask?.actualPackedQty);
  if (!valid) {
    const error = new Error("The todo, packing task, packages, or fulfillment state changed before repair.");
    error.statusCode = 409;
    error.code = "BUSINESS_WRITE_CONFLICT";
    throw error;
  }
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

function nonNegativeInteger(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.trunc(number)) : 0;
}
