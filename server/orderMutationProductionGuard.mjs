const pending = new Set(["待排产","待开始","已排产","待丝印","待制袋","未开始","已发布","排队中"]);
const terminal = new Set(["已取消","已作废"]);
const invalidPackages = new Set(["已取消","已作废","已失效","已替代","voided","invalidated"]);
const lineIdOf = row => row?.orderLineId ?? row?.lineId ?? row?.order_line_id;
export function hasOrderProductionExecution(workspace, id) {
  return (workspace.productionTasks??[]).some(row=>lineIdOf(row)===id&&!pending.has(row.taskStatus??row.status)&&!terminal.has(row.taskStatus??row.status)) ||
    (workspace.workshopReports??[]).some(row=>lineIdOf(row)===id) ||
    (workspace.packingTasks??[]).some(row=>lineIdOf(row)===id&&(Number(row.actualPackedQty??0)>0||["已完成","打包中"].includes(row.status))) ||
    (workspace.packages??[]).some(row=>!invalidPackages.has(row.status)&&(lineIdOf(row)===id||(row.contents??row.contentsJson??row.contents_json??row.items??[]).some(item=>lineIdOf(item)===id)));
}
export function assertOrderProductionNotExecuted(input) {
  const id=input.orderLine?.orderLineId??input.orderLine?.id;
  if(hasOrderProductionExecution(input.workspace,id))throw Object.assign(new Error("本单已有生产报工或实际包裹，不能直接改量或作废。"),{code:"ERP_ORDER_PRODUCTION_ALREADY_EXECUTED",statusCode:409});
}
export function applyPendingOrderProductionMutation(workspace,line,mode) {
  const id=line.orderLineId??line.id;
  const status=mode==="void"?"已作废":"待排产";
  workspace.productionTasks=(workspace.productionTasks??[]).map(row=>lineIdOf(row)!==id||terminal.has(row.taskStatus??row.status)?row:{...row,plannedQty:mode==="void"?row.plannedQty:line.originalQty??line.qty,taskStatus:status,status,publishedScheduleId:"",revision:Number(row.revision??1)+1});
  workspace.packingTasks=(workspace.packingTasks??[]).map(row=>lineIdOf(row)!==id||terminal.has(row.status)?row:{...row,plannedQty:mode==="void"?row.plannedQty:line.originalQty??line.qty,status:mode==="void"?"已作废":row.status,revision:Number(row.revision??1)+1});
  workspace.productionScheduleRecords=(workspace.productionScheduleRecords??[]).map(row=>lineIdOf(row)!==id||!['active','published','queued'].includes(row.scheduleStatus??row.status)?row:{...row,status:mode==="void"?"canceled":"superseded",scheduleStatus:mode==="void"?"canceled":"superseded"});
}
export function orderMutationProductionLocksSql(lineId) {
  return `locked_mutation_production AS MATERIALIZED (
    SELECT task.* FROM production_tasks task WHERE task.order_line_id = ${lineId} ORDER BY task.id FOR UPDATE OF task
  ), locked_mutation_packing AS MATERIALIZED (
    SELECT task.* FROM packing_tasks task WHERE task.order_line_id = ${lineId} ORDER BY task.id FOR UPDATE OF task
  ), locked_mutation_packages AS MATERIALIZED (
    SELECT package.* FROM packages package WHERE package.order_line_id = ${lineId}
      OR EXISTS(SELECT 1 FROM jsonb_array_elements(COALESCE(to_jsonb(package)->'contents_json','[]'::jsonb)) item WHERE item->>'orderLineId' = ${lineId})
    ORDER BY package.id FOR UPDATE OF package
  ), locked_mutation_schedules AS MATERIALIZED (
    SELECT schedule.* FROM production_schedule_records schedule WHERE schedule.order_line_id = ${lineId} ORDER BY schedule.id FOR UPDATE OF schedule
  ),`;
}
export function orderMutationProductionGuardSql(lineId) {
  return `AND erp_require(
    NOT EXISTS (SELECT 1 FROM locked_mutation_production WHERE task_status NOT IN ('待排产','待开始','已排产','待丝印','待制袋','未开始','已发布','排队中','已取消','已作废'))
    AND NOT EXISTS (SELECT 1 FROM workshop_reports WHERE order_line_id = ${lineId})
    AND NOT EXISTS (SELECT 1 FROM locked_mutation_packing WHERE actual_packed_qty > 0 OR status IN ('已完成','打包中'))
    AND NOT EXISTS (SELECT 1 FROM locked_mutation_packages WHERE status NOT IN ('已取消','已作废','已失效','已替代','voided','invalidated')),
    'ERP_ORDER_PRODUCTION_ALREADY_EXECUTED')`;
}
export function orderMutationProductionUpdatesSql(lineId,mode,quantity) {
  const taskStatus=mode==="void"?"已作废":"待排产";
  return `updated_mutation_production AS (
    UPDATE production_tasks task SET task_status='${taskStatus}',published_schedule_id=NULL,
      ${mode==="void"?"":`planned_qty=${quantity},`} revision=task.revision+1,updated_at=now()
    FROM write_guard guard WHERE task.order_line_id=${lineId} AND guard.ok AND task.task_status NOT IN ('已取消','已作废')
      AND EXISTS(SELECT 1 FROM locked_mutation_production locked WHERE locked.id=task.id)
    RETURNING task.id
  ), updated_mutation_packing AS (
    UPDATE packing_tasks task SET ${mode==="void"?"status='已作废',":`planned_qty=${quantity},`}revision=task.revision+1,updated_at=now()
    FROM write_guard guard WHERE task.order_line_id=${lineId} AND guard.ok AND task.status NOT IN ('已取消','已作废')
      AND EXISTS(SELECT 1 FROM locked_mutation_packing locked WHERE locked.id=task.id)
    RETURNING task.id
  ), updated_mutation_schedules AS (
    UPDATE production_schedule_records schedule SET schedule_status='${mode==="void"?"canceled":"superseded"}',updated_at=now()
    FROM write_guard guard WHERE schedule.order_line_id=${lineId} AND guard.ok AND schedule.schedule_status IN ('active','published','queued')
      AND EXISTS(SELECT 1 FROM locked_mutation_schedules locked WHERE locked.id=schedule.id)
    RETURNING schedule.id
  ),`;
}
