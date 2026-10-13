import { resolveStoreMode } from "./storeMode.mjs";
import { createPostgresPoolClient } from "./postgresPoolClient.mjs";
import { createPostgresParameterBinder } from "./postgresSqlParameters.mjs";
import { createPostgresTransactionExecutor } from "./postgresTransactionExecutor.mjs";
import {
  buildIdempotencyConflictError,
  buildIdempotencyRequestHash,
  buildPostgresIdempotencyRequest,
  resolveRepositoryIdempotencyKey,
} from "./idempotency.mjs";

export function createMaintenanceTaskRepository(options = {}) {
  const mode = resolveStoreMode({
    explicitMode: options.mode,
    envKeys: ["ERP_MAINTENANCE_STORE", "ERP_V1_STORE"],
    runtimeMode: options.runtimeMode,
    allowLocalFixture: options.allowLocalFixture,
  });
  if (mode === "postgres") return createPostgresMaintenanceTaskRepository(options);
  if (mode === "local") return createLocalMaintenanceTaskRepository();
  throw new Error(`Unsupported maintenance task repository mode: ${mode}`);
}

export function createLocalMaintenanceTaskRepository() {
  return Object.freeze({
    kind: "local_memory",
    loadState({ seedTasks = [] } = {}) {
      return { maintenanceTasks: normalizeMaintenanceTasks(seedTasks) };
    },
    listTasks({ workspace, filters = {} } = {}) {
      return filterMaintenanceTasks(workspace?.maintenanceTasks ?? [], filters);
    },
    createTask(input = {}) {
      return writeLocalMaintenanceTask("maintenance.task.create", input, { create: true });
    },
    updateTask(input = {}) {
      return writeLocalMaintenanceTask("maintenance.task.update", input, { create: false });
    },
  });
}

export function createPostgresMaintenanceTaskRepository(options = {}) {
  const databaseUrl = options.databaseUrl ?? process.env.ERP_MAINTENANCE_DATABASE_URL ?? process.env.DATABASE_URL ?? process.env.PGURL;
  const postgresClient = options.postgresClient ?? (options.queryJson || options.transactionJson ? null : createPostgresPoolClient({ databaseUrl }));
  const { queryJson, idempotentTransactionJson } = createPostgresTransactionExecutor({ ...options, databaseUrl, postgresClient });
  return Object.freeze({
    kind: "postgres",
    async loadState() {
      const query = buildListMaintenanceTasksQuery();
      return { maintenanceTasks: normalizeMaintenanceTasks(await queryJson(query.text, query.values)) };
    },
    async listTasks({ filters = {} } = {}) {
      const query = buildListMaintenanceTasksQuery(filters);
      return normalizeMaintenanceTasks(await queryJson(query.text, query.values));
    },
    async createTask(input = {}) {
      return writePostgresMaintenanceTask("maintenance.task.create", input, buildCreateMaintenanceTaskQuery, idempotentTransactionJson);
    },
    async updateTask(input = {}) {
      return writePostgresMaintenanceTask("maintenance.task.update", input, buildUpdateMaintenanceTaskQuery, idempotentTransactionJson);
    },
  });
}

function writeLocalMaintenanceTask(scope, input, { create }) {
  const { workspace, task, todo, operationLog } = input;
  if (!workspace || !task?.id || !todo?.id || !operationLog?.id) throw new Error("Maintenance task, todo, operation log, and workspace are required.");
  const key = resolveRepositoryIdempotencyKey(input.idempotencyKey, operationLog.id);
  const requestHash = buildIdempotencyRequestHash(input.idempotencyPayload);
  const stored = (workspace.operationIdempotencyRecords ?? []).find((item) => item.scope === scope && item.idempotencyKey === key);
  if (stored) {
    if (stored.requestHash !== requestHash) throw buildIdempotencyConflictError();
    return { ...cloneJson(stored.response), replayed: true };
  }
  const current = (workspace.maintenanceTasks ?? []).find((item) => cleanText(item.id ?? item.taskId) === cleanText(task.id));
  if (create && current) throw businessError(409, "MAINTENANCE_TASK_CREATE_CONFLICT", "设备任务编号已经存在。");
  if (!create) {
    if (!current) throw businessError(404, "MAINTENANCE_TASK_NOT_FOUND", "设备任务不存在。");
    if (positiveInteger(current.revision, 1) !== positiveInteger(input.expectedRevision)) {
      const error = businessError(409, "MAINTENANCE_TASK_REVISION_CONFLICT", "任务已被其他人更新，请刷新后重试。");
      error.details = { currentTask: normalizeMaintenanceTask(current) };
      throw error;
    }
  }
  const result = { task: normalizeMaintenanceTask(task), todo: normalizeTodo(todo), operationLogId: operationLog.id, replayed: false };
  workspace.maintenanceTasks = upsertById(workspace.maintenanceTasks, result.task);
  workspace.todos = upsertById(workspace.todos, result.todo);
  workspace.operationLogs = upsertById(workspace.operationLogs, operationLog);
  workspace.operationIdempotencyRecords = [
    { scope, idempotencyKey: key, requestHash, response: cloneJson(result) },
    ...(workspace.operationIdempotencyRecords ?? []),
  ];
  return result;
}

async function writePostgresMaintenanceTask(scope, input, queryBuilder, idempotentTransactionJson) {
  const query = queryBuilder(input);
  const result = normalizeMaintenanceTransactionResult(await idempotentTransactionJson(buildPostgresIdempotencyRequest({
    scope,
    idempotencyKey: resolveRepositoryIdempotencyKey(input.idempotencyKey, input.operationLog?.id),
    payload: input.idempotencyPayload ?? { task: input.task, todo: input.todo },
    operatorId: input.operationLog?.operatorId,
    targetType: "maintenance_task",
    targetId: input.task?.id,
    resourceLocks: [`maintenance-task:${input.task?.id ?? ""}`, `todo:${input.todo?.id ?? ""}`],
    query,
  })));
  if (!result.task || !result.todo) throw new Error("PostgreSQL maintenance task transaction returned invalid data.");
  applyWorkspaceMutation(input.workspace, result, input.operationLog);
  return result;
}

export function buildListMaintenanceTasksQuery(filters = {}) {
  const parameters = createPostgresParameterBinder();
  const clauses = [];
  if (cleanText(filters.status) && cleanText(filters.status) !== "all") clauses.push(`status = ${parameters.text(cleanText(filters.status))}`);
  if (cleanText(filters.taskType)) clauses.push(`task_type = ${parameters.text(cleanText(filters.taskType))}`);
  if (cleanText(filters.machineId)) clauses.push(`machine_id = ${parameters.text(cleanText(filters.machineId))}`);
  if (cleanText(filters.assignedEmployeeId)) {
    clauses.push(`(assigned_technician_employee_id = ${parameters.text(cleanText(filters.assignedEmployeeId))} OR assigned_technician_employee_id IS NULL)`);
  }
  return {
    text: `SELECT COALESCE(json_agg(result ORDER BY
  CASE result->>'priority' WHEN '异常' THEN 0 WHEN '今天' THEN 1 WHEN '本周' THEN 2 ELSE 3 END,
  NULLIF(result->>'dueAt', '')::timestamptz NULLS LAST,
  result->>'updatedAt' DESC), '[]'::json) AS result
FROM (
  SELECT ${maintenanceTaskJsonExpression("maintenance_tasks")} AS result
  FROM maintenance_tasks${clauses.length ? ` WHERE ${clauses.join(" AND ")}` : ""}
) AS maintenance_task_rows;`,
    values: parameters.values,
  };
}

export function buildCreateMaintenanceTaskQuery(input = {}) {
  const task = normalizeMaintenanceTask(input.task);
  const todo = normalizeTodo(input.todo);
  const operationLog = normalizeOperationLog(input.operationLog);
  if (!task || !todo || !operationLog) throw new Error("Maintenance task create requires task, todo, and operation log.");
  const parameters = createPostgresParameterBinder();
  return {
    text: `
BEGIN;
WITH create_guard AS MATERIALIZED (
  SELECT erp_require(
    NOT EXISTS (SELECT 1 FROM maintenance_tasks WHERE id = ${parameters.text(task.id)}),
    'ERP_MAINTENANCE_TASK_CREATE_CONFLICT'
  ) AS ok
),
inserted_task AS (
  INSERT INTO maintenance_tasks (
    id, biz_no, machine_id, machine_name_snapshot, task_type, fault_category, priority,
    status, summary, due_at, finding, action_taken, photo_attachment_ids_json,
    assigned_technician_employee_id, actual_technician_employee_id, completed_at,
    created_by, updated_by, revision, created_at, updated_at
  )
  SELECT
    ${parameters.text(task.id)}, ${parameters.text(task.bizNo)}, ${parameters.text(task.machineId)},
    ${parameters.text(task.machineName)}, ${parameters.text(task.type)}, ${parameters.text(task.faultCategory)},
    ${parameters.text(task.priority)}, ${parameters.text(task.status)}, ${parameters.text(task.summary)},
    ${parameters.nullableTimestamp(task.dueAt)}, ${parameters.text(task.finding)}, ${parameters.text(task.actionTaken)},
    ${parameters.json(task.photoAttachmentIds)}, ${parameters.nullableText(task.assignedTechnicianEmployeeId)},
    ${parameters.nullableText(task.actualTechnicianEmployeeId)}, ${parameters.nullableTimestamp(task.completedAt)},
    ${parameters.nullableText(task.createdBy)}, ${parameters.nullableText(task.updatedBy)}, ${parameters.integer(task.revision)},
    ${parameters.timestamp(task.createdAt)}, ${parameters.timestamp(task.updatedAt)}
  FROM create_guard WHERE ok
  RETURNING ${maintenanceTaskJsonExpression("maintenance_tasks")} AS result
),
upserted_todo AS (
  ${buildUpsertTodoSql(todo, parameters, "inserted_task")}
),
inserted_operation_log AS (
  ${buildInsertOperationLogSql(operationLog, parameters, "inserted_task")}
)
SELECT json_build_object(
  'task', (SELECT result FROM inserted_task LIMIT 1),
  'todo', (SELECT result FROM upserted_todo LIMIT 1),
  'operationLogId', (SELECT id FROM inserted_operation_log LIMIT 1)
) AS result;
COMMIT;`,
    values: parameters.values,
  };
}

export function buildUpdateMaintenanceTaskQuery(input = {}) {
  const task = normalizeMaintenanceTask(input.task);
  const todo = normalizeTodo(input.todo);
  const operationLog = normalizeOperationLog(input.operationLog);
  const expectedRevision = positiveInteger(input.expectedRevision);
  if (!task || !todo || !operationLog || !expectedRevision) throw new Error("Maintenance task update requires task, todo, operation log, and expected revision.");
  const parameters = createPostgresParameterBinder();
  return {
    text: `
BEGIN;
WITH locked_task AS MATERIALIZED (
  SELECT id, revision FROM maintenance_tasks WHERE id = ${parameters.text(task.id)} FOR UPDATE
),
update_guard AS MATERIALIZED (
  SELECT erp_require(
    EXISTS (SELECT 1 FROM locked_task WHERE revision = ${parameters.integer(expectedRevision)}),
    'ERP_MAINTENANCE_TASK_REVISION_CONFLICT'
  ) AS ok
),
updated_task AS (
  UPDATE maintenance_tasks SET
    status = ${parameters.text(task.status)},
    finding = ${parameters.text(task.finding)},
    action_taken = ${parameters.text(task.actionTaken)},
    photo_attachment_ids_json = ${parameters.json(task.photoAttachmentIds)},
    actual_technician_employee_id = ${parameters.nullableText(task.actualTechnicianEmployeeId)},
    completed_at = ${parameters.nullableTimestamp(task.completedAt)},
    updated_by = ${parameters.nullableText(task.updatedBy)},
    revision = ${parameters.integer(task.revision)},
    updated_at = ${parameters.timestamp(task.updatedAt)}
  WHERE id = ${parameters.text(task.id)} AND EXISTS (SELECT 1 FROM update_guard WHERE ok)
  RETURNING ${maintenanceTaskJsonExpression("maintenance_tasks")} AS result
),
upserted_todo AS (
  ${buildUpsertTodoSql(todo, parameters, "updated_task")}
),
inserted_operation_log AS (
  ${buildInsertOperationLogSql(operationLog, parameters, "updated_task")}
)
SELECT json_build_object(
  'task', (SELECT result FROM updated_task LIMIT 1),
  'todo', (SELECT result FROM upserted_todo LIMIT 1),
  'operationLogId', (SELECT id FROM inserted_operation_log LIMIT 1)
) AS result;
COMMIT;`,
    values: parameters.values,
  };
}

function buildUpsertTodoSql(todo, parameters, dependency) {
  return `INSERT INTO todos (
    id, biz_no, type, ref_type, ref_id, priority, status, summary, due_at, remind_at,
    handled_by, handled_at, handling_result, created_by, created_at, updated_at
  )
  SELECT
    ${parameters.text(todo.id)}, ${parameters.text(todo.bizNo)}, ${parameters.text(todo.type)},
    ${parameters.text(todo.refType)}, ${parameters.text(todo.refId)}, ${parameters.text(todo.priority)},
    ${parameters.text(todo.status)}, ${parameters.text(todo.summary)}, ${parameters.nullableTimestamp(todo.dueAt)},
    ${parameters.nullableTimestamp(todo.remindAt)}, ${parameters.nullableText(todo.handledBy)},
    ${parameters.nullableTimestamp(todo.handledAt)}, ${parameters.nullableText(todo.handlingResult)},
    ${parameters.nullableText(todo.createdBy)}, ${parameters.timestamp(todo.createdAt)}, ${parameters.timestamp(todo.updatedAt)}
  FROM ${dependency}
  ON CONFLICT (id) DO UPDATE SET
    priority = EXCLUDED.priority, status = EXCLUDED.status, summary = EXCLUDED.summary,
    due_at = EXCLUDED.due_at, handled_by = EXCLUDED.handled_by, handled_at = EXCLUDED.handled_at,
    handling_result = EXCLUDED.handling_result, updated_at = EXCLUDED.updated_at
  RETURNING ${todoJsonExpression("todos")} AS result`;
}

function buildInsertOperationLogSql(operationLog, parameters, dependency) {
  return `INSERT INTO operation_logs (
    id, target_type, target_id, action, before_json, after_json, reason,
    operator_id, page_key, occurred_at, created_at
  )
  SELECT
    ${parameters.text(operationLog.id)}, ${parameters.text(operationLog.targetType)},
    ${parameters.text(operationLog.targetId)}, ${parameters.text(operationLog.action)},
    ${parameters.json(operationLog.before)}, ${parameters.json(operationLog.after)},
    ${parameters.text(operationLog.reason)}, ${parameters.nullableText(operationLog.operatorId)},
    ${parameters.text(operationLog.pageKey)}, ${parameters.timestamp(operationLog.occurredAt)},
    ${parameters.timestamp(operationLog.createdAt)}
  FROM ${dependency}
  ON CONFLICT (id) DO NOTHING
  RETURNING id`;
}

export function normalizeMaintenanceTasks(value) {
  return (Array.isArray(value) ? value : []).map(normalizeMaintenanceTask).filter(Boolean);
}

export function normalizeMaintenanceTask(value = {}) {
  if (!value || typeof value !== "object") return null;
  const id = cleanText(value.id ?? value.taskId);
  if (!id) return null;
  return {
    ...value,
    id,
    taskId: id,
    bizNo: cleanText(value.bizNo ?? value.biz_no) || id,
    machineId: cleanText(value.machineId ?? value.machine_id),
    machineName: cleanText(value.machineName ?? value.machine_name_snapshot),
    type: cleanText(value.type ?? value.taskType ?? value.task_type),
    faultCategory: cleanText(value.faultCategory ?? value.fault_category),
    priority: cleanText(value.priority) || "普通",
    status: cleanText(value.status),
    summary: cleanText(value.summary),
    dueAt: cleanText(value.dueAt ?? value.due_at),
    finding: cleanText(value.finding),
    actionTaken: cleanText(value.actionTaken ?? value.action_taken ?? value.action),
    photoAttachmentIds: stringList(value.photoAttachmentIds ?? value.photo_attachment_ids_json),
    assignedTechnicianEmployeeId: cleanText(value.assignedTechnicianEmployeeId ?? value.assigned_technician_employee_id),
    actualTechnicianEmployeeId: cleanText(value.actualTechnicianEmployeeId ?? value.actual_technician_employee_id),
    completedAt: cleanText(value.completedAt ?? value.completed_at),
    createdBy: cleanText(value.createdBy ?? value.created_by),
    updatedBy: cleanText(value.updatedBy ?? value.updated_by),
    revision: positiveInteger(value.revision, 1),
    createdAt: cleanText(value.createdAt ?? value.created_at),
    updatedAt: cleanText(value.updatedAt ?? value.updated_at),
  };
}

function normalizeMaintenanceTransactionResult(value = {}) {
  return {
    task: normalizeMaintenanceTask(value.task),
    todo: normalizeTodo(value.todo),
    operationLogId: cleanText(value.operationLogId),
    replayed: value.replayed === true,
  };
}

function normalizeTodo(value = {}) {
  if (!value || typeof value !== "object") return null;
  const id = cleanText(value.id ?? value.todoId);
  if (!id) return null;
  return {
    ...value,
    id,
    todoId: id,
    bizNo: cleanText(value.bizNo ?? value.biz_no) || id,
    refType: cleanText(value.refType ?? value.ref_type),
    refId: cleanText(value.refId ?? value.ref_id ?? value.ref),
    priority: cleanText(value.priority ?? value.urgency) || "普通",
    status: cleanText(value.status) || "未处理",
    dueAt: cleanText(value.dueAt ?? value.due_at),
    remindAt: cleanText(value.remindAt ?? value.remind_at),
    handledBy: cleanText(value.handledBy ?? value.handled_by),
    handledAt: cleanText(value.handledAt ?? value.handled_at),
    handlingResult: cleanText(value.handlingResult ?? value.handling_result),
    createdBy: cleanText(value.createdBy ?? value.created_by),
    createdAt: cleanText(value.createdAt ?? value.created_at),
    updatedAt: cleanText(value.updatedAt ?? value.updated_at),
  };
}

function normalizeOperationLog(value = {}) {
  if (!value || typeof value !== "object" || !cleanText(value.id)) return null;
  return {
    ...value,
    id: cleanText(value.id),
    targetType: cleanText(value.targetType ?? value.target_type),
    targetId: cleanText(value.targetId ?? value.target_id),
    action: cleanText(value.action),
    before: value.before ?? value.before_json ?? null,
    after: value.after ?? value.after_json ?? null,
    reason: cleanText(value.reason),
    operatorId: cleanText(value.operatorId ?? value.operator_id),
    pageKey: cleanText(value.pageKey ?? value.page_key) || "maintenance_mobile",
    occurredAt: cleanText(value.occurredAt ?? value.occurred_at),
    createdAt: cleanText(value.createdAt ?? value.created_at),
  };
}

function filterMaintenanceTasks(records, filters) {
  return normalizeMaintenanceTasks(records)
    .filter((task) => !cleanText(filters.status) || cleanText(filters.status) === "all" || task.status === cleanText(filters.status))
    .filter((task) => !cleanText(filters.taskType) || task.type === cleanText(filters.taskType))
    .filter((task) => !cleanText(filters.machineId) || task.machineId === cleanText(filters.machineId))
    .filter((task) => !cleanText(filters.assignedEmployeeId) || !task.assignedTechnicianEmployeeId || task.assignedTechnicianEmployeeId === cleanText(filters.assignedEmployeeId));
}

function applyWorkspaceMutation(workspace, result, operationLog) {
  if (!workspace) return;
  workspace.maintenanceTasks = upsertById(workspace.maintenanceTasks, result.task);
  workspace.todos = upsertById(workspace.todos, result.todo);
  if (operationLog && result.operationLogId === cleanText(operationLog.id)) workspace.operationLogs = upsertById(workspace.operationLogs, operationLog);
}

function maintenanceTaskJsonExpression(alias) {
  return `json_build_object(
    'taskId', ${alias}.id, 'bizNo', ${alias}.biz_no, 'machineId', ${alias}.machine_id,
    'machineName', ${alias}.machine_name_snapshot, 'type', ${alias}.task_type,
    'faultCategory', ${alias}.fault_category, 'priority', ${alias}.priority,
    'status', ${alias}.status, 'summary', ${alias}.summary,
    'dueAt', COALESCE(${alias}.due_at::TEXT, ''), 'finding', ${alias}.finding,
    'actionTaken', ${alias}.action_taken, 'photoAttachmentIds', ${alias}.photo_attachment_ids_json,
    'assignedTechnicianEmployeeId', COALESCE(${alias}.assigned_technician_employee_id, ''),
    'actualTechnicianEmployeeId', COALESCE(${alias}.actual_technician_employee_id, ''),
    'completedAt', COALESCE(${alias}.completed_at::TEXT, ''), 'createdBy', COALESCE(${alias}.created_by, ''),
    'updatedBy', COALESCE(${alias}.updated_by, ''), 'revision', ${alias}.revision,
    'createdAt', ${alias}.created_at::TEXT, 'updatedAt', ${alias}.updated_at::TEXT
  )`;
}

function todoJsonExpression(alias) {
  return `json_build_object(
    'todoId', ${alias}.id, 'bizNo', ${alias}.biz_no, 'type', ${alias}.type,
    'refType', ${alias}.ref_type, 'refId', ${alias}.ref_id, 'priority', ${alias}.priority,
    'status', ${alias}.status, 'summary', ${alias}.summary, 'dueAt', COALESCE(${alias}.due_at::TEXT, ''),
    'remindAt', COALESCE(${alias}.remind_at::TEXT, ''), 'handledBy', COALESCE(${alias}.handled_by, ''),
    'handledAt', COALESCE(${alias}.handled_at::TEXT, ''), 'handlingResult', COALESCE(${alias}.handling_result, ''),
    'createdBy', COALESCE(${alias}.created_by, ''), 'createdAt', ${alias}.created_at::TEXT,
    'updatedAt', ${alias}.updated_at::TEXT
  )`;
}

function upsertById(records = [], record) {
  const id = cleanText(record?.id ?? record?.taskId ?? record?.todoId);
  return [record, ...(records ?? []).filter((item) => cleanText(item?.id ?? item?.taskId ?? item?.todoId) !== id)];
}

function stringList(value) {
  if (Array.isArray(value)) return [...new Set(value.map(cleanText).filter(Boolean))];
  if (typeof value === "string") {
    try { return stringList(JSON.parse(value)); } catch { return []; }
  }
  return [];
}

function positiveInteger(value, fallback = 0) {
  const number = Math.trunc(Number(value));
  return number > 0 ? number : fallback;
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value ?? null));
}

function businessError(statusCode, code, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.code = code;
  return error;
}

function cleanText(value) {
  return String(value ?? "").trim();
}
