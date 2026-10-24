const taskIdOf = task => task?.productionTaskId ?? task?.id;
export function newConsumptionAssociations(previous = {}, current = {}) {
  const oldIds = new Set((previous.rawMaterialConsumptionRecords ?? []).map(record => record.consumptionRecordId));
  return (current.rawMaterialConsumptionRecords ?? []).filter(record => !oldIds.has(record.consumptionRecordId)
    && (Number(record.consumedWeightKg) > 0 || Number(record.consumedQuantity) > 0)).map(record => {
    const issue = (current.rawMaterialIssueRecords ?? []).find(item => item.issueRecordId === record.issueRecordId && item.rollId === record.rollId);
    return {taskId:record.productionTaskId || issue?.productionTaskId || "", orderLineId:record.productionTaskOrderLineId || issue?.productionTaskOrderLineId || ""};
  }).filter(item => item.taskId || item.orderLineId);
}
export function assertConsumptionProductionCurrent(workspace, previous, current) {
  for (const link of newConsumptionAssociations(previous, current)) {
    const task = link.taskId ? (workspace.productionTasks ?? []).find(item => taskIdOf(item) === link.taskId) : null;
    const lineId = task?.orderLineId ?? task?.order_line_id ?? link.orderLineId;
    const line = (workspace.orderLines ?? []).find(item => (item.orderLineId ?? item.id) === lineId);
    if ((link.taskId && !task) || !line || (link.orderLineId && link.orderLineId !== lineId)
      || ["已取消","已作废"].includes(task?.taskStatus ?? task?.status) || ["已关闭","已取消","已作废"].includes(line.lineStatus ?? line.status)) throw consumptionConflict();
  }
}
export async function readConsumptionProductionConstraints(queryJson, previous, current) {
  const links = newConsumptionAssociations(previous, current);
  if (!links.length) return [];
  const rows = await queryJson(`SELECT COALESCE(json_agg(jsonb_build_object('taskId',task.id,'orderLineId',line.id,'taskRevision',task.revision,'lineRevision',line.revision,'taskStatus',task.task_status,'lineStatus',line.line_status)), '[]'::json) AS result
    FROM jsonb_to_recordset($1::jsonb) link("taskId" text,"orderLineId" text)
    LEFT JOIN production_tasks task ON task.id=NULLIF(link."taskId",'')
    JOIN order_lines line ON line.id=COALESCE(task.order_line_id,NULLIF(link."orderLineId",''))
    WHERE (link."taskId"='' OR task.id IS NOT NULL) AND (link."orderLineId"='' OR line.id=link."orderLineId")`, [JSON.stringify(links)]);
  if (!Array.isArray(rows) || rows.length !== links.length || rows.some(row => ["已取消","已作废"].includes(row.taskStatus) || ["已关闭","已取消","已作废"].includes(row.lineStatus))) throw consumptionConflict();
  return rows;
}
export function consumptionProductionGuardSql(parameters, constraints = []) {
  if (!constraints.length) return "";
  const data = parameters.json(constraints);
  return `consumption_production_links AS MATERIALIZED (SELECT * FROM jsonb_to_recordset(${data}) AS link("taskId" text,"orderLineId" text,"taskRevision" integer,"lineRevision" integer)),
    locked_consumption_tasks AS MATERIALIZED (SELECT task.* FROM production_tasks task WHERE task.id IN (SELECT "taskId" FROM consumption_production_links) ORDER BY task.id FOR UPDATE OF task),
    consumption_production_guard AS MATERIALIZED (SELECT erp_require(NOT EXISTS(
      SELECT 1 FROM consumption_production_links link LEFT JOIN order_lines line ON line.id=link."orderLineId"
      LEFT JOIN locked_consumption_tasks task ON task.id=link."taskId"
      WHERE line.id IS NULL OR line.revision<>link."lineRevision" OR line.line_status IN ('已关闭','已取消','已作废')
        OR (link."taskId" IS NOT NULL AND (task.id IS NULL OR task.order_line_id<>line.id OR task.revision<>link."taskRevision" OR task.task_status IN ('已取消','已作废')))
    ),'ERP_RAW_MATERIAL_PRODUCTION_CONFLICT') AS ok),`;
}
function consumptionConflict() { return Object.assign(new Error("关联订单或生产任务已经变化，请重新核对后记录消耗；未修改原料。"), {statusCode:409,code:"ERP_RAW_MATERIAL_PRODUCTION_CONFLICT"}); }
