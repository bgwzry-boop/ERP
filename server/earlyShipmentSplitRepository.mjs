// P2-03 先发已做好的部分：拆分订单明细的写入。所有检查都在同一个事务里按锁重做一遍，
// 车间刚报了数量、办公室刚改了订单或开始出库时，拆分会整体失败、什么也不写。
import { buildInsertOperationLogSql } from "./productionPackingExceptionTodoSqlFragments.mjs";
import { createPostgresParameterBinder } from "./postgresSqlParameters.mjs";
import {
  buildIdempotencyConflictError,
  buildIdempotencyRequestHash,
  buildPostgresIdempotencyRequest,
  resolveRepositoryIdempotencyKey,
} from "./idempotency.mjs";

const CLOSED_TASK_STATUSES = ["已完成", "已作废", "已取消"];
const BLOCKED_TASK_STATUSES = ["异常暂停", "数量差异待处理", "待完工确认"];
const CLOSED_LINE_STATUSES = ["已作废", "已取消", "已关闭", "已完成", "已交付"];
const OUTBOUND_FULFILLMENT_STATUSES = ["已交付", "已取消", "已作废", "已出库", "已拉走", "配送中"];

export function createLocalEarlyShipmentSplitRepository() {
  const results = new Map();
  return {
    splitForEarlyShipment(input) {
      const key = `production.early_shipment.split:${resolveRepositoryIdempotencyKey(input.idempotencyKey, input.operationLog?.id)}`;
      const requestHash = buildIdempotencyRequestHash(input.idempotencyPayload ?? {});
      const existing = results.get(key);
      if (existing) {
        if (existing.requestHash !== requestHash) throw buildIdempotencyConflictError();
        return structuredClone(existing.result);
      }
      const { workspace, plan } = input;
      const line = find(workspace.orderLines, plan.orderLineId);
      const task = find(workspace.productionTasks, plan.productionTaskId);
      const fulfillment = find(workspace.fulfillments, plan.fulfillmentId);
      const dailyQty = (workspace.workshopReports ?? [])
        .filter((report) => clean(report.productionTaskId) === plan.productionTaskId)
        .reduce((sum, report) => clean(report.evidence?.reportKind) === "daily_progress" ? sum + Number(report.qualifiedQty ?? 0) : Number.NaN, 0);
      const ok = line && task && fulfillment
        && revision(line) === plan.lineRevision && revision(task) === plan.taskRevision && revision(fulfillment) === plan.fulfillmentRevision
        && Number(line.qty ?? line.originalQty) === plan.plannedQty && Number(task.plannedQty) === plan.plannedQty
        && Number(fulfillment.expectedQty ?? fulfillment.qty) === plan.plannedQty && dailyQty === plan.readyQty
        && !CLOSED_TASK_STATUSES.includes(clean(task.taskStatus ?? task.status)) && !BLOCKED_TASK_STATUSES.includes(clean(task.taskStatus ?? task.status));
      if (!ok) throw conflict();
      const now = input.splitAt;
      const nextLine = { ...line, qty: plan.readyQty, originalQty: plan.readyQty, revision: revision(line) + 1, updatedAt: now };
      const remainderLine = {
        ...line,
        id: input.remainderLine.id,
        orderLineId: input.remainderLine.id,
        bizNo: input.remainderLine.bizNo,
        lineNo: input.remainderLine.id.split("-").at(-1),
        qty: plan.remainderQty,
        originalQty: plan.remainderQty,
        splitFromOrderLineId: plan.orderLineId,
        amount: input.remainderPrice.finalAmount,
        revision: 1,
        createdBy: input.operatorId,
        createdAt: now,
        updatedAt: now,
      };
      nextLine.amount = input.linePrice.finalAmount;
      const nextTask = { ...task, plannedQty: plan.readyQty, qty: plan.readyQty, taskStatus: "待完工确认", status: "待完工确认", revision: revision(task) + 1, updatedAt: now };
      const remainderTask = {
        ...task,
        id: input.remainderTask.id,
        productionTaskId: input.remainderTask.id,
        bizNo: input.remainderTask.bizNo,
        orderLineId: input.remainderLine.id,
        lineId: input.remainderLine.id,
        plannedQty: plan.remainderQty,
        qty: plan.remainderQty,
        taskStatus: input.remainderTask.taskStatus,
        status: input.remainderTask.taskStatus,
        publishedScheduleId: input.remainderTask.publishedScheduleId,
        revision: 1,
        createdBy: input.operatorId,
        createdAt: now,
        updatedAt: now,
      };
      const nextFulfillment = { ...fulfillment, expectedQty: plan.readyQty, qty: plan.readyQty, revision: revision(fulfillment) + 1, updatedAt: now };
      const remainderFulfillment = {
        ...fulfillment,
        id: input.remainderFulfillment.id,
        fulfillmentId: input.remainderFulfillment.id,
        bizNo: input.remainderFulfillment.bizNo,
        orderLineId: input.remainderLine.id,
        lineId: input.remainderLine.id,
        expectedQty: plan.remainderQty,
        qty: plan.remainderQty,
        actualQty: null,
        revision: 1,
        createdBy: input.operatorId,
        createdAt: now,
        updatedAt: now,
      };
      const source = (workspace.priceSnapshots ?? []).find((row) => clean(row.priceSnapshotId ?? row.id) === plan.priceSnapshotId) ?? {};
      const priceRow = (target, orderLineId) => ({
        ...source,
        id: target.priceSnapshotId,
        priceSnapshotId: target.priceSnapshotId,
        orderLineId,
        snapshotType: target.snapshotType,
        versionNo: target.versionNo,
        chargeableQty: target.chargeableQty,
        finalAmount: target.finalAmount,
        amount: target.finalAmount,
        otherFee: target.otherFee,
        adjustmentAmount: target.adjustmentAmount,
        overrideReason: target.overrideReason,
        sourceEvidence: { ...(source.sourceEvidence ?? {}), ...target.sourceEvidence },
        createdBy: input.operatorId,
        createdAt: now,
      });
      replace(workspace, "orderLines", nextLine); workspace.orderLines.push(remainderLine);
      replace(workspace, "productionTasks", nextTask); workspace.productionTasks.push(remainderTask);
      replace(workspace, "fulfillments", nextFulfillment); workspace.fulfillments.push(remainderFulfillment);
      workspace.priceSnapshots = [...(workspace.priceSnapshots ?? []), priceRow(input.linePrice, plan.orderLineId), priceRow(input.remainderPrice, input.remainderLine.id)];
      workspace.operationLogs = [input.operationLog, ...(workspace.operationLogs ?? [])];
      const result = receipt({
        orderLine: { orderLineId: nextLine.id, qty: plan.readyQty, revision: nextLine.revision },
        remainderOrderLine: { orderLineId: remainderLine.id, qty: plan.remainderQty, revision: 1 },
        productionTask: { productionTaskId: nextTask.productionTaskId ?? nextTask.id, plannedQty: plan.readyQty, taskStatus: nextTask.taskStatus, revision: nextTask.revision },
        remainderProductionTask: { productionTaskId: remainderTask.id, plannedQty: plan.remainderQty, taskStatus: remainderTask.taskStatus, machineId: remainderTask.machineId ?? "", revision: 1 },
        fulfillmentId: nextFulfillment.fulfillmentId ?? nextFulfillment.id,
        remainderFulfillmentId: remainderFulfillment.id,
        priceSnapshotIds: [input.linePrice.priceSnapshotId, input.remainderPrice.priceSnapshotId],
        operationLogId: clean(input.operationLog?.id),
      });
      results.set(key, { requestHash, result: structuredClone(result) });
      return result;
    },
  };
}

export function createPostgresEarlyShipmentSplitRepository({ idempotentTransactionJson }) {
  return {
    async splitForEarlyShipment(input) {
      const query = buildEarlyShipmentSplitQuery(input);
      const raw = await idempotentTransactionJson(buildPostgresIdempotencyRequest({
        scope: "production.early_shipment.split",
        idempotencyKey: resolveRepositoryIdempotencyKey(input.idempotencyKey, input.operationLog?.id),
        payload: input.idempotencyPayload ?? {},
        operatorId: input.operationLog?.operatorId,
        targetType: "order_line",
        targetId: input.plan.orderLineId,
        resourceLocks: [
          `order-line:${input.plan.orderLineId}`,
          `production-task:${input.plan.productionTaskId}`,
          `fulfillment:${input.plan.fulfillmentId}`,
        ],
        query,
      }));
      if (!raw?.orderLine || !raw?.remainderOrderLine) throw new Error("PostgreSQL early shipment split returned an invalid result");
      return receipt(raw);
    },
  };
}

export function buildEarlyShipmentSplitQuery(input) {
  const { plan } = input;
  const p = createPostgresParameterBinder();
  const lineId = p.text(plan.orderLineId);
  const taskId = p.text(plan.productionTaskId);
  const fulfillmentId = p.text(plan.fulfillmentId);
  const plannedQty = p.integer(plan.plannedQty);
  const readyQty = p.integer(plan.readyQty);
  const remainderQty = p.integer(plan.remainderQty);
  const operator = p.text(input.operatorId);
  const priceCopy = (target, orderLineIdSql, versionSql = p.integer(target.versionNo)) => `INSERT INTO price_snapshots
  SELECT (jsonb_populate_record(NULL::price_snapshots, to_jsonb(source) || jsonb_build_object(
    'id', ${p.text(target.priceSnapshotId)},
    'order_line_id', ${orderLineIdSql},
    'snapshot_type', ${p.text(target.snapshotType)},
    'version_no', ${versionSql},
    'chargeable_qty', ${p.integer(target.chargeableQty)},
    'final_amount', ${p.number(target.finalAmount)},
    'other_fee', ${p.number(target.otherFee)},
    'adjustment_amount', ${p.number(target.adjustmentAmount)},
    'override_reason', ${p.text(target.overrideReason)},
    'source_evidence_json', COALESCE(source.source_evidence_json, '{}'::jsonb) || ${p.json(target.sourceEvidence)},
    'created_by', ${operator},
    'created_at', now()
  ))).*
  FROM price_snapshots AS source, write_guard
  WHERE source.id = ${p.text(plan.priceSnapshotId)} AND write_guard.ok
  RETURNING id`;
  return {
    text: `
BEGIN;
WITH locked_line AS MATERIALIZED (
  SELECT * FROM order_lines WHERE id = ${lineId} FOR UPDATE
),
locked_task AS MATERIALIZED (
  SELECT * FROM production_tasks WHERE id = ${taskId} FOR UPDATE
),
locked_fulfillment AS MATERIALIZED (
  SELECT * FROM fulfillment_records WHERE id = ${fulfillmentId} FOR UPDATE
),
latest_price AS MATERIALIZED (
  SELECT id, chargeable_qty FROM price_snapshots
  WHERE order_line_id = ${lineId}
  ORDER BY created_at DESC, (snapshot_type = 'quantity_adjustment') DESC, version_no DESC
  LIMIT 1
),
write_guard AS MATERIALIZED (
  SELECT erp_require(EXISTS (
      SELECT 1 FROM locked_line
      WHERE revision = ${p.integer(plan.lineRevision)} AND original_qty = ${plannedQty}
        AND COALESCE(qty_basis, 'pieces') = 'pieces' AND line_status <> ALL(${p.textArray(CLOSED_LINE_STATUSES)})
    ), 'ERP_EARLY_SHIPMENT_LINE_CONFLICT')
  AND erp_require(EXISTS (
      SELECT 1 FROM locked_task
      WHERE revision = ${p.integer(plan.taskRevision)} AND order_line_id = ${lineId} AND planned_qty = ${plannedQty}
        AND task_type = ${p.text(plan.taskType)}
        AND task_status <> ALL(${p.textArray([...CLOSED_TASK_STATUSES, ...BLOCKED_TASK_STATUSES])})
    ), 'ERP_EARLY_SHIPMENT_TASK_CONFLICT')
  AND erp_require(NOT EXISTS (
      SELECT 1 FROM production_tasks
      WHERE order_line_id = ${lineId} AND id <> ${taskId} AND task_status <> ALL(${p.textArray(CLOSED_TASK_STATUSES)})
    ), 'ERP_EARLY_SHIPMENT_TASK_CONFLICT')
  AND erp_require(
      (SELECT COALESCE(SUM(qualified_qty), 0) FROM workshop_reports
        WHERE production_task_id = ${taskId} AND evidence_json->>'reportKind' = 'daily_progress') = ${readyQty}
      AND NOT EXISTS (SELECT 1 FROM workshop_reports
        WHERE production_task_id = ${taskId} AND COALESCE(evidence_json->>'reportKind', '') <> 'daily_progress'),
    'ERP_EARLY_SHIPMENT_PROGRESS_CONFLICT')
  AND erp_require(
      (SELECT count(*) FROM fulfillment_records WHERE order_line_id = ${lineId}) = 1
      AND EXISTS (
        SELECT 1 FROM locked_fulfillment
        WHERE order_line_id = ${lineId} AND revision = ${p.integer(plan.fulfillmentRevision)} AND expected_qty = ${plannedQty}
          AND actual_qty IS NULL AND status <> ALL(${p.textArray(OUTBOUND_FULFILLMENT_STATUSES)})
          AND physical_outbound_at IS NULL AND loaded_at IS NULL AND delivered_at IS NULL AND final_delivery_at IS NULL
          AND paper_outbound_document_id IS NULL AND COALESCE(packing_group_anchor_id, '') = ''
      )
      AND NOT EXISTS (SELECT 1 FROM paper_outbound_documents WHERE fulfillment_id = ${fulfillmentId})
      AND NOT EXISTS (SELECT 1 FROM print_records WHERE target_id IN (${fulfillmentId}, ${lineId})),
    'ERP_EARLY_SHIPMENT_FULFILLMENT_CONFLICT')
  AND erp_require(
      NOT EXISTS (SELECT 1 FROM packing_tasks WHERE order_line_id = ${lineId})
      AND NOT EXISTS (SELECT 1 FROM packages WHERE order_line_id = ${lineId})
      AND NOT EXISTS (SELECT 1 FROM statement_lines WHERE order_line_id = ${lineId})
      AND NOT EXISTS (SELECT 1 FROM inventory_reservations WHERE order_line_id = ${lineId} AND status = '生效'),
    'ERP_EARLY_SHIPMENT_DOWNSTREAM_CONFLICT')
  AND erp_require(EXISTS (
      SELECT 1 FROM latest_price WHERE id = ${p.text(plan.priceSnapshotId)} AND chargeable_qty = ${plannedQty}
    ), 'ERP_EARLY_SHIPMENT_PRICE_CONFLICT') AS ok
),
updated_line AS (
  UPDATE order_lines SET original_qty = ${readyQty}, revision = order_lines.revision + 1, updated_at = now()
  FROM write_guard WHERE order_lines.id = ${lineId} AND write_guard.ok
  RETURNING json_build_object('orderLineId', order_lines.id, 'qty', order_lines.original_qty, 'revision', order_lines.revision) AS result
),
inserted_line AS (
  INSERT INTO order_lines
  SELECT (jsonb_populate_record(NULL::order_lines, to_jsonb(source) || jsonb_build_object(
    'id', ${p.text(input.remainderLine.id)},
    'biz_no', ${p.text(input.remainderLine.bizNo)},
    'original_qty', ${remainderQty},
    'split_from_order_line_id', ${lineId},
    'revision', 1,
    'created_by', ${operator},
    'created_at', now(),
    'updated_at', now()
  ))).*
  FROM locked_line AS source, write_guard WHERE write_guard.ok
  RETURNING json_build_object('orderLineId', id, 'qty', original_qty, 'revision', revision) AS result
),
updated_task AS (
  UPDATE production_tasks SET planned_qty = ${readyQty}, task_status = '待完工确认', revision = production_tasks.revision + 1, updated_at = now()
  FROM write_guard WHERE production_tasks.id = ${taskId} AND write_guard.ok
  RETURNING json_build_object('productionTaskId', production_tasks.id, 'plannedQty', production_tasks.planned_qty,
    'taskStatus', production_tasks.task_status, 'revision', production_tasks.revision) AS result
),
inserted_task AS (
  INSERT INTO production_tasks
  SELECT (jsonb_populate_record(NULL::production_tasks, to_jsonb(source) || jsonb_build_object(
    'id', ${p.text(input.remainderTask.id)},
    'biz_no', ${p.text(input.remainderTask.bizNo)},
    'order_line_id', ${p.text(input.remainderLine.id)},
    'planned_qty', ${remainderQty},
    'task_status', ${p.text(input.remainderTask.taskStatus)},
    'published_schedule_id', ${p.nullableText(input.remainderTask.publishedScheduleId)},
    'revision', 1,
    'created_by', ${operator},
    'created_at', now(),
    'updated_at', now()
  ))).*
  FROM locked_task AS source, write_guard WHERE write_guard.ok
  RETURNING json_build_object('productionTaskId', id, 'plannedQty', planned_qty, 'taskStatus', task_status,
    'machineId', COALESCE(machine_id, ''), 'revision', revision) AS result
),
updated_fulfillment AS (
  UPDATE fulfillment_records SET expected_qty = ${readyQty}, revision = fulfillment_records.revision + 1, updated_at = now()
  FROM write_guard WHERE fulfillment_records.id = ${fulfillmentId} AND write_guard.ok
  RETURNING fulfillment_records.id
),
inserted_fulfillment AS (
  INSERT INTO fulfillment_records
  SELECT (jsonb_populate_record(NULL::fulfillment_records, to_jsonb(source) || jsonb_build_object(
    'id', ${p.text(input.remainderFulfillment.id)},
    'biz_no', ${p.text(input.remainderFulfillment.bizNo)},
    'order_line_id', ${p.text(input.remainderLine.id)},
    'expected_qty', ${remainderQty},
    'actual_qty', NULL,
    'revision', 1,
    'created_by', ${operator},
    'created_at', now(),
    'updated_at', now()
  ))).*
  FROM locked_fulfillment AS source, write_guard WHERE write_guard.ok
  RETURNING id
),
inserted_line_price AS (
  ${priceCopy(input.linePrice, lineId, `(SELECT COALESCE(MAX(version_no), 0) + 1 FROM price_snapshots WHERE order_line_id = ${lineId} AND snapshot_type = 'quantity_adjustment')`)}
),
inserted_remainder_price AS (
  ${priceCopy(input.remainderPrice, `(SELECT ${p.text(input.remainderLine.id)} FROM inserted_line LIMIT 1)`)}
),
inserted_operation_log AS (
  ${buildInsertOperationLogSql(input.operationLog, p, "write_guard")}
)
SELECT json_build_object(
  'orderLine', (SELECT result FROM updated_line),
  'remainderOrderLine', (SELECT result FROM inserted_line),
  'productionTask', (SELECT result FROM updated_task),
  'remainderProductionTask', (SELECT result FROM inserted_task),
  'fulfillmentId', (SELECT id FROM updated_fulfillment),
  'remainderFulfillmentId', (SELECT id FROM inserted_fulfillment),
  'priceSnapshotIds', json_build_array((SELECT id FROM inserted_line_price), (SELECT id FROM inserted_remainder_price)),
  'operationLogId', (SELECT id FROM inserted_operation_log)
) AS result;
COMMIT;
`.trim(),
    values: p.values,
  };
}

function receipt(raw) {
  return {
    orderLineId: clean(raw.orderLine?.orderLineId),
    remainderOrderLineId: clean(raw.remainderOrderLine?.orderLineId),
    orderLine: raw.orderLine,
    remainderOrderLine: raw.remainderOrderLine,
    productionTask: raw.productionTask,
    remainderProductionTask: raw.remainderProductionTask,
    fulfillmentId: clean(raw.fulfillmentId),
    remainderFulfillmentId: clean(raw.remainderFulfillmentId),
    priceSnapshotIds: raw.priceSnapshotIds ?? [],
    operationLogId: clean(raw.operationLogId),
  };
}

function replace(workspace, key, next) {
  workspace[key] = (workspace[key] ?? []).map((row) => clean(row.id ?? row.orderLineId ?? row.productionTaskId ?? row.fulfillmentId) === clean(next.id ?? next.orderLineId ?? next.productionTaskId ?? next.fulfillmentId) ? next : row);
}

function find(rows, id) {
  return (rows ?? []).find((row) => [row?.id, row?.orderLineId, row?.productionTaskId, row?.fulfillmentId].map(clean).includes(clean(id))) ?? null;
}

function revision(row) {
  const value = Number(row?.revision ?? 1);
  return Number.isSafeInteger(value) && value >= 1 ? value : 1;
}

function conflict() {
  const error = new Error("订单或生产进度刚有变动，请刷新后再操作。");
  error.statusCode = 409;
  error.code = "BUSINESS_WRITE_CONFLICT";
  return error;
}

function clean(value) {
  return String(value ?? "").trim();
}
