import { isPublishedRawMaterialIssueTask, RAW_MATERIAL_ISSUE_CLOSED_TASK, RAW_MATERIAL_ISSUE_CLOSED_LINE } from "../shared/rawMaterialProductionTask.js";
import { normalizeRawMaterialMachineId } from "./rawMaterialInboundRecordService.mjs";

const taskIdOf = task => task?.productionTaskId ?? task?.id;
const stoppedTask = status => ["已取消", "已作废"].includes(status);
const stoppedLine = status => ["已关闭", "已取消", "已作废"].includes(status);

export function newConsumptionAssociations(previous = {}, current = {}) {
  const oldIds = new Set((previous.rawMaterialConsumptionRecords ?? []).map(record => record.consumptionRecordId));
  const priorIssues = new Set((previous.rawMaterialIssueRecords ?? []).map(record => record.issueRecordId));
  const issues = current.rawMaterialIssueRecords ?? [];
  const consumption = (current.rawMaterialConsumptionRecords ?? []).filter(record => !oldIds.has(record.consumptionRecordId)
    && (Number(record.consumedWeightKg) > 0 || Number(record.consumedQuantity) > 0)).map(record => {
    const issue = issues.find(item => item.issueRecordId === record.issueRecordId && item.rollId === record.rollId);
    return { taskId: record.productionTaskId || issue?.productionTaskId || "", orderLineId: record.productionTaskOrderLineId || issue?.productionTaskOrderLineId || "" };
  });
  const newLinks = issues.filter(record => !priorIssues.has(record.issueRecordId) && record.productionTaskId).map(record => ({
    taskId: record.productionTaskId,
    orderLineId: record.productionTaskOrderLineId || "",
    ...(record.issueMode !== "转挂订单" ? { requirePublished: true,
      expectedMachineId: record.productionTaskMachineId || "", issueMachineId: record.machineId || "" } : {}),
  }));
  return [...consumption, ...newLinks].filter(item => item.taskId || item.orderLineId);
}

function issueTargetCurrent(link, task, line) {
  const machine = normalizeRawMaterialMachineId(task.machineId ?? task.machine_id);
  return isPublishedRawMaterialIssueTask(task, line)
    && machine === normalizeRawMaterialMachineId(link.expectedMachineId)
    && (machine ? machine === normalizeRawMaterialMachineId(link.issueMachineId)
      : /丝印|印刷/u.test(task.taskType ?? task.task_type ?? "") && link.issueMachineId === "丝印车间");
}

export function assertConsumptionProductionCurrent(workspace, previous, current) {
  for (const link of newConsumptionAssociations(previous, current)) {
    const task = link.taskId ? (workspace.productionTasks ?? []).find(item => taskIdOf(item) === link.taskId) : null;
    const lineId = task?.orderLineId ?? task?.order_line_id ?? link.orderLineId;
    const line = (workspace.orderLines ?? []).find(item => (item.orderLineId ?? item.id) === lineId);
    if ((link.taskId && !task) || !line || (link.orderLineId && link.orderLineId !== lineId)
      || stoppedTask(task?.taskStatus ?? task?.status) || stoppedLine(line.lineStatus ?? line.status)
      || (link.requirePublished && !issueTargetCurrent(link, task, line))) throw productionConflict();
  }
}

export async function readConsumptionProductionConstraints(queryJson, previous, current) {
  const links = newConsumptionAssociations(previous, current);
  if (!links.length) return [];
  const rows = await queryJson(`SELECT COALESCE(json_agg(jsonb_build_object(
      'taskId',task.id,'orderLineId',line.id,'taskRevision',task.revision,'lineRevision',line.revision,
      'taskStatus',task.task_status,'lineStatus',line.line_status,'taskType',task.task_type,
      'machineId',COALESCE(task.machine_id,''),'publishedScheduleId',COALESCE(task.published_schedule_id,''),
      'requirePublished',link."requirePublished",'expectedMachineId',link."expectedMachineId",'issueMachineId',link."issueMachineId"
    )), '[]'::json) AS result
    FROM jsonb_to_recordset($1::jsonb) link("taskId" text,"orderLineId" text,"requirePublished" boolean,"expectedMachineId" text,"issueMachineId" text)
    LEFT JOIN production_tasks task ON task.id=NULLIF(link."taskId",'')
    JOIN order_lines line ON line.id=COALESCE(task.order_line_id,NULLIF(link."orderLineId",''))
    WHERE (link."taskId"='' OR task.id IS NOT NULL) AND (link."orderLineId"='' OR line.id=link."orderLineId")`, [JSON.stringify(links)]);
  if (!Array.isArray(rows) || rows.length !== links.length || rows.some(row =>
    stoppedTask(row.taskStatus) || stoppedLine(row.lineStatus) ||
    (row.requirePublished && !issueTargetCurrent(row, row, row)))) throw productionConflict();
  return rows;
}

export function consumptionProductionGuardSql(parameters, constraints = []) {
  if (!constraints.length) return "";
  const data = parameters.json(constraints);
  return `consumption_production_links AS MATERIALIZED (
      SELECT * FROM jsonb_to_recordset(${data}) AS link("taskId" text,"orderLineId" text,"taskRevision" integer,"lineRevision" integer,
        "requirePublished" boolean,"machineId" text,"publishedScheduleId" text)
    ),
    locked_consumption_tasks AS MATERIALIZED (SELECT task.* FROM production_tasks task WHERE task.id IN (SELECT "taskId" FROM consumption_production_links) ORDER BY task.id FOR UPDATE OF task),
    consumption_production_guard AS MATERIALIZED (SELECT erp_require(NOT EXISTS(
      SELECT 1 FROM consumption_production_links link LEFT JOIN order_lines line ON line.id=link."orderLineId"
      LEFT JOIN locked_consumption_tasks task ON task.id=link."taskId"
      WHERE line.id IS NULL OR line.revision<>link."lineRevision" OR line.line_status IN ('已关闭','已取消','已作废')
        OR (link."taskId" IS NOT NULL AND (task.id IS NULL OR task.order_line_id<>line.id OR task.revision<>link."taskRevision" OR task.task_status IN ('已取消','已作废')))
        OR (link."requirePublished" AND (
          COALESCE(task.published_schedule_id,'')='' OR COALESCE(task.published_schedule_id,'')<>link."publishedScheduleId"
          OR COALESCE(task.machine_id,'')<>link."machineId"
          OR task.task_status=ANY(${parameters.textArray(RAW_MATERIAL_ISSUE_CLOSED_TASK)})
          OR line.line_status=ANY(${parameters.textArray(RAW_MATERIAL_ISSUE_CLOSED_LINE)})
        ))
    ),'ERP_RAW_MATERIAL_PRODUCTION_CONFLICT') AS ok),`;
}

function productionConflict() {
  return Object.assign(new Error("关联订单或生产任务已经变化，请刷新后核对；未修改原料。"),
    { statusCode: 409, code: "ERP_RAW_MATERIAL_PRODUCTION_CONFLICT" });
}
