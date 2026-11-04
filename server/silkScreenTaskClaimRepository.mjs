// P2-02 丝印个人认领的写入。两个人同时领同一个任务：PostgreSQL 先按任务加锁，
// 再在同一事务里检查“还没人领、还没排机台、版本没变”，所以只会有一个人成功。
import { buildInsertOperationLogSql } from "./productionPackingExceptionTodoSqlFragments.mjs";
import { createPostgresParameterBinder } from "./postgresSqlParameters.mjs";
import { applyProductionPackingWorkspaceMutation } from "./productionPackingWorkspaceProjection.mjs";
import { normalizeOperationLog, normalizeOrderLine, normalizeProductionTask } from "./productionPackingTransactionRecordNormalizer.mjs";
import {
  buildIdempotencyConflictError,
  buildIdempotencyRequestHash,
  buildPostgresIdempotencyRequest,
  resolveRepositoryIdempotencyKey,
} from "./idempotency.mjs";

const CLAIMED = "丝印已排产";
const UNCLAIMED = "待排产";
const CLOSED_LINE_STATUSES = ["已作废", "已取消", "已关闭", "已完成"];

export function createLocalSilkScreenClaimRepository() {
  const results = new Map();
  return {
    claimSilkScreenTask(input) {
      return runLocal(results, input, "production.silk_screen.claim", (current) => {
        const ok = current && current.taskType === "丝印" && revisionOf(current) === revisionOf(input.productionTask)
          && !clean(current.claimedByUserId) && !clean(current.publishedScheduleId) && !clean(current.machineId)
          && clean(current.taskStatus ?? current.status).includes(UNCLAIMED);
        if (!ok) throw conflict();
        return {
          machineId: input.productionTask.machineId,
          publishedScheduleId: input.productionTask.publishedScheduleId,
          taskStatus: CLAIMED,
          claimedByUserId: input.productionTask.claimedByUserId,
          claimedByName: input.productionTask.claimedByName,
          claimedAt: input.productionTask.claimedAt,
        };
      }, (line) => {
        if (CLOSED_LINE_STATUSES.includes(clean(line?.lineStatus ?? line?.status))) throw conflict();
        const status = clean(line?.lineStatus ?? line?.status);
        return !status || status.includes(UNCLAIMED) ? CLAIMED : status;
      });
    },

    releaseSilkScreenTask(input) {
      return runLocal(results, input, "production.silk_screen.release", (current, workspace) => {
        const id = clean(input.productionTask.productionTaskId);
        const started = (workspace.workshopReports ?? []).some((report) => clean(report.productionTaskId ?? report.production_task_id) === id);
        const ok = current && revisionOf(current) === revisionOf(input.productionTask)
          && clean(current.claimedByUserId) === clean(input.claimedByUserId)
          && clean(current.taskStatus ?? current.status) === CLAIMED && !started;
        if (!ok) throw conflict();
        return { machineId: "", publishedScheduleId: "", taskStatus: UNCLAIMED, claimedByUserId: "", claimedByName: "", claimedAt: "" };
      }, (line) => {
        const status = clean(line?.lineStatus ?? line?.status);
        return status === CLAIMED ? UNCLAIMED : status;
      });
    },
  };
}

export function createPostgresSilkScreenClaimRepository({ idempotentTransactionJson }) {
  return {
    async claimSilkScreenTask(input) {
      return savePostgres(input, "production.silk_screen.claim", buildClaimSilkScreenTaskQuery(input), idempotentTransactionJson);
    },
    async releaseSilkScreenTask(input) {
      return savePostgres(input, "production.silk_screen.release", buildReleaseSilkScreenTaskQuery(input), idempotentTransactionJson);
    },
  };
}

export function buildClaimSilkScreenTaskQuery(input) {
  const { productionTask, operationLog, parameters, taskId, lineId } = prepare(input);
  const guard = `erp_require(EXISTS (
      SELECT 1 FROM locked_task
      WHERE revision = ${parameters.integer(revisionOf(productionTask))}
        AND task_type = '丝印'
        AND claimed_by_user_id IS NULL
        AND NULLIF(published_schedule_id, '') IS NULL
        AND NULLIF(machine_id, '') IS NULL
        AND task_status LIKE '%待排产%'
    ), 'ERP_SILK_SCREEN_CLAIM_CONFLICT')
    AND erp_require(EXISTS (
      SELECT 1 FROM locked_line WHERE COALESCE(line_status, '') <> ALL(${parameters.textArray(CLOSED_LINE_STATUSES)})
    ), 'ERP_ORDER_LINE_CONCURRENCY_CONFLICT')
    AND erp_require(EXISTS (
      SELECT 1 FROM machines
      WHERE id = ${parameters.text(productionTask.machineId)} AND enabled = true AND status = 'active' AND machine_type = 'screen_printing'
      FOR SHARE
    ), 'ERP_PRODUCTION_MACHINE_NOT_AVAILABLE_CONFLICT')`;
  const taskSet = `machine_id = ${parameters.text(productionTask.machineId)},
    published_schedule_id = ${parameters.text(productionTask.publishedScheduleId)},
    task_status = '${CLAIMED}',
    claimed_by_user_id = ${parameters.text(productionTask.claimedByUserId)},
    claimed_by_name = ${parameters.nullableText(productionTask.claimedByName)},
    claimed_at = ${parameters.timestamp(productionTask.claimedAt)}`;
  const lineStatus = `CASE WHEN COALESCE(order_lines.line_status, '') = '' OR order_lines.line_status LIKE '%待排产%' THEN '${CLAIMED}' ELSE order_lines.line_status END`;
  return buildQuery({ parameters, taskId, lineId, operationLog, guard, taskSet, lineStatus });
}

export function buildReleaseSilkScreenTaskQuery(input) {
  const { productionTask, operationLog, parameters, taskId, lineId } = prepare(input);
  const guard = `erp_require(EXISTS (
      SELECT 1 FROM locked_task
      WHERE revision = ${parameters.integer(revisionOf(productionTask))}
        AND claimed_by_user_id = ${parameters.text(input.claimedByUserId)}
        AND task_status = '${CLAIMED}'
    ), 'ERP_SILK_SCREEN_RELEASE_CONFLICT')
    AND erp_require(NOT EXISTS (
      SELECT 1 FROM workshop_reports WHERE production_task_id = ${parameters.text(taskId)}
    ), 'ERP_SILK_SCREEN_RELEASE_CONFLICT')`;
  const taskSet = `machine_id = NULL,
    published_schedule_id = NULL,
    task_status = '${UNCLAIMED}',
    claimed_by_user_id = NULL,
    claimed_by_name = NULL,
    claimed_at = NULL`;
  const lineStatus = `CASE WHEN order_lines.line_status = '${CLAIMED}' THEN '${UNCLAIMED}' ELSE order_lines.line_status END`;
  return buildQuery({ parameters, taskId, lineId, operationLog, guard, taskSet, lineStatus });
}

function buildQuery({ parameters, taskId, lineId, operationLog, guard, taskSet, lineStatus }) {
  return {
    text: `
BEGIN;
WITH locked_task AS MATERIALIZED (
  SELECT id, revision, task_type, task_status, machine_id, published_schedule_id, claimed_by_user_id, order_line_id
  FROM production_tasks
  WHERE id = ${parameters.text(taskId)} AND order_line_id = ${parameters.text(lineId)}
  FOR UPDATE
),
locked_line AS MATERIALIZED (
  SELECT id, line_status FROM order_lines WHERE id = ${parameters.text(lineId)} FOR UPDATE
),
write_guard AS MATERIALIZED (
  SELECT ${guard} AS ok
),
updated_task AS (
  UPDATE production_tasks SET
    ${taskSet},
    revision = production_tasks.revision + 1,
    updated_at = now()
  FROM write_guard
  WHERE production_tasks.id = ${parameters.text(taskId)} AND write_guard.ok
  RETURNING ${taskJson("production_tasks")} AS result
),
updated_line AS (
  UPDATE order_lines SET
    line_status = ${lineStatus},
    revision = order_lines.revision + 1,
    updated_at = now()
  FROM write_guard
  WHERE order_lines.id = ${parameters.text(lineId)} AND write_guard.ok
  RETURNING json_build_object('orderLineId', order_lines.id, 'lineStatus', order_lines.line_status, 'revision', order_lines.revision) AS result
),
inserted_operation_log AS (
  ${buildInsertOperationLogSql(operationLog, parameters, "write_guard")}
)
SELECT json_build_object(
  'productionTask', (SELECT result FROM updated_task),
  'orderLine', (SELECT result FROM updated_line),
  'operationLogId', (SELECT id FROM inserted_operation_log)
) AS result;
COMMIT;
`.trim(),
    values: parameters.values,
  };
}

function taskJson(alias) {
  return `json_build_object(
    'productionTaskId', ${alias}.id,
    'bizNo', ${alias}.biz_no,
    'orderLineId', ${alias}.order_line_id,
    'taskType', ${alias}.task_type,
    'machineId', COALESCE(${alias}.machine_id, ''),
    'plannedQty', ${alias}.planned_qty,
    'taskStatus', ${alias}.task_status,
    'publishedScheduleId', COALESCE(${alias}.published_schedule_id, ''),
    'claimedByUserId', COALESCE(${alias}.claimed_by_user_id, ''),
    'claimedByName', COALESCE(${alias}.claimed_by_name, ''),
    'claimedAt', ${alias}.claimed_at,
    'revision', ${alias}.revision,
    'createdBy', ${alias}.created_by,
    'createdAt', ${alias}.created_at,
    'updatedAt', ${alias}.updated_at
  )`;
}

function prepare(input) {
  const productionTask = normalizeProductionTask(input.productionTask);
  const operationLog = normalizeOperationLog(input.operationLog);
  if (!productionTask || !operationLog) throw new Error("A production task and operation log are required for a silk-screen claim change");
  return {
    productionTask,
    operationLog,
    parameters: createPostgresParameterBinder(),
    taskId: productionTask.productionTaskId,
    lineId: productionTask.orderLineId,
  };
}

async function savePostgres(input, scope, query, idempotentTransactionJson) {
  const taskId = clean(input.productionTask?.productionTaskId);
  const raw = await idempotentTransactionJson(buildPostgresIdempotencyRequest({
    scope,
    idempotencyKey: resolveRepositoryIdempotencyKey(input.idempotencyKey, input.operationLog?.id),
    payload: input.idempotencyPayload ?? {},
    operatorId: input.operationLog?.operatorId,
    targetType: "production_task",
    targetId: taskId,
    resourceLocks: [`production-task:${taskId}`, `order-line:${clean(input.productionTask?.orderLineId)}`],
    query,
  }));
  const saved = {
    productionTask: normalizeProductionTask(raw?.productionTask),
    orderLine: normalizeOrderLine(raw?.orderLine),
    operationLogId: clean(raw?.operationLogId),
  };
  if (!saved.productionTask) throw new Error("PostgreSQL silk-screen claim transaction returned an invalid result");
  applyProductionPackingWorkspaceMutation({
    workspace: input.workspace,
    authoritative: true,
    productionTask: saved.productionTask,
    orderLine: saved.orderLine,
    operationLog: saved.operationLogId ? { ...input.operationLog, id: saved.operationLogId } : null,
  });
  return saved;
}

function runLocal(results, input, scope, nextTaskFields, nextLineStatus) {
  const key = `${scope}:${resolveRepositoryIdempotencyKey(input.idempotencyKey, input.operationLog?.id)}`;
  const requestHash = buildIdempotencyRequestHash(input.idempotencyPayload ?? {});
  const existing = results.get(key);
  if (existing) {
    if (existing.requestHash !== requestHash) throw buildIdempotencyConflictError();
    return structuredClone(existing.result);
  }
  const workspace = input.workspace;
  const taskId = clean(input.productionTask?.productionTaskId);
  const current = (workspace.productionTasks ?? []).find((task) => clean(task.productionTaskId ?? task.id) === taskId);
  const fields = nextTaskFields(current, workspace);
  const line = (workspace.orderLines ?? []).find((row) => clean(row.orderLineId ?? row.id) === clean(current.orderLineId ?? current.lineId));
  const lineStatus = nextLineStatus(line);
  const updatedAt = new Date().toISOString();
  const productionTask = normalizeProductionTask({
    ...current,
    ...fields,
    productionTaskId: taskId,
    status: fields.taskStatus,
    revision: revisionOf(current) + 1,
    updatedAt,
  });
  const orderLine = line ? normalizeOrderLine({ ...line, lineStatus, status: lineStatus, revision: revisionOf(line) + 1 }) : null;
  applyProductionPackingWorkspaceMutation({ workspace, productionTask, orderLine, operationLog: input.operationLog });
  const result = { productionTask, orderLine, operationLogId: clean(input.operationLog?.id) };
  results.set(key, { requestHash, result: structuredClone(result) });
  return result;
}

function conflict() {
  const error = new Error("任务刚有变动，请刷新后再试。");
  error.statusCode = 409;
  error.code = "BUSINESS_WRITE_CONFLICT";
  return error;
}

function revisionOf(record) {
  const value = Number(record?.revision ?? 1);
  return Number.isSafeInteger(value) && value >= 1 ? value : 1;
}

function clean(value) {
  return String(value ?? "").trim();
}
