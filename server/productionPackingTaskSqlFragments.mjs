export function buildUpsertProductionTaskSql(productionTask, parameters, dependency = "") {
  if (!productionTask) return "SELECT NULL::json AS result WHERE false";
  const values = `(
  ${parameters.text(productionTask.productionTaskId)},
  ${parameters.text(productionTask.bizNo)},
  ${parameters.text(productionTask.orderLineId)},
  ${parameters.text(productionTask.taskType)},
  ${parameters.nullableText(productionTask.machineId)},
  ${parameters.integer(productionTask.plannedQty)},
  ${parameters.text(productionTask.taskStatus)},
  ${parameters.nullableText(productionTask.publishedScheduleId)},
  1,
  ${parameters.nullableText(productionTask.createdBy)},
  ${timestampParameter(productionTask.createdAt, parameters)},
  now()
)`;
  return `INSERT INTO production_tasks (
  id,
  biz_no,
  order_line_id,
  task_type,
  machine_id,
  planned_qty,
  task_status,
  published_schedule_id,
  revision,
  created_by,
  created_at,
  updated_at
) ${buildInsertValuesSource(values, ["id", "biz_no", "order_line_id", "task_type", "machine_id", "planned_qty", "task_status", "published_schedule_id", "revision", "created_by", "created_at", "updated_at"], dependency)}
ON CONFLICT (id) DO UPDATE SET
  task_type = EXCLUDED.task_type,
  machine_id = EXCLUDED.machine_id,
  planned_qty = EXCLUDED.planned_qty,
  task_status = EXCLUDED.task_status,
  published_schedule_id = EXCLUDED.published_schedule_id,
  revision = production_tasks.revision + 1,
  updated_at = now()
RETURNING ${productionTaskJsonExpression("production_tasks")} AS result`;
}

export function buildInsertWorkshopReportSql(report, parameters, dependency = "") {
  const values = `(
  ${parameters.text(report.reportId)},
  ${parameters.nullableText(report.productionTaskId)},
  ${parameters.text(report.orderLineId)},
  ${parameters.text(report.processType)},
  ${parameters.nullableText(report.machineId)},
  ${parameters.nullableText(report.operatorId)},
  ${parameters.integer(report.qualifiedQty)},
  ${parameters.integer(report.exceptionQty)},
  ${parameters.nullableInteger(report.machineCount)},
  ${parameters.nullableTimestamp(report.startedAt)},
  ${parameters.nullableTimestamp(report.completedAt)},
  ${parameters.nullableText(report.remark)},
  ${parameters.json(report.evidence)},
  ${timestampParameter(report.createdAt, parameters)}
)`;
  return `INSERT INTO workshop_reports (
  id,
  production_task_id,
  order_line_id,
  process_type,
  machine_id,
  operator_id,
  qualified_qty,
  exception_qty,
  machine_count,
  started_at,
  completed_at,
  remark,
  evidence_json,
  created_at
) ${buildInsertValuesSource(values, ["id", "production_task_id", "order_line_id", "process_type", "machine_id", "operator_id", "qualified_qty", "exception_qty", "machine_count", "started_at", "completed_at", "remark", "evidence_json", "created_at"], dependency)}
ON CONFLICT (id) DO UPDATE SET
  qualified_qty = EXCLUDED.qualified_qty,
  exception_qty = EXCLUDED.exception_qty,
  machine_count = EXCLUDED.machine_count,
  completed_at = EXCLUDED.completed_at,
  remark = EXCLUDED.remark,
  evidence_json = EXCLUDED.evidence_json
RETURNING ${workshopReportJsonExpression("workshop_reports")} AS result`;
}

export function buildUpdateOrderLineSql(orderLine, parameters, dependency = "") {
  if (!orderLine) return "SELECT NULL::json AS result WHERE false";
  return `UPDATE order_lines
SET
  line_status = ${parameters.text(orderLine.lineStatus)},
  exception_tags = ${parameters.textArray(orderLine.exceptionTags)},
  revision = order_lines.revision + 1,
  updated_at = now()
WHERE id = ${parameters.text(orderLine.orderLineId)}
${buildWriteGuardCondition(dependency)}
RETURNING ${orderLineJsonExpression("order_lines")} AS result`;
}

export function buildUpsertPackingTaskSql(packingTask, parameters, dependency = "") {
  if (!packingTask) return "SELECT NULL::json AS result WHERE false";
  const values = `(
  ${parameters.text(packingTask.packingTaskId)},
  ${parameters.text(packingTask.bizNo)},
  ${parameters.text(packingTask.orderLineId)},
  ${parameters.integer(packingTask.plannedQty)},
  ${parameters.integer(packingTask.actualPackedQty)},
  ${parameters.text(packingTask.status)},
  1,
  ${parameters.nullableText(packingTask.createdBy)},
  ${timestampParameter(packingTask.createdAt, parameters)},
  now()
)`;
  return `INSERT INTO packing_tasks (
  id,
  biz_no,
  order_line_id,
  planned_qty,
  actual_packed_qty,
  status,
  revision,
  created_by,
  created_at,
  updated_at
) ${buildInsertValuesSource(values, ["id", "biz_no", "order_line_id", "planned_qty", "actual_packed_qty", "status", "revision", "created_by", "created_at", "updated_at"], dependency)}
ON CONFLICT (id) DO UPDATE SET
  planned_qty = EXCLUDED.planned_qty,
  actual_packed_qty = EXCLUDED.actual_packed_qty,
  status = EXCLUDED.status,
  revision = packing_tasks.revision + 1,
  updated_at = now()
RETURNING ${packingTaskJsonExpression("packing_tasks")} AS result`;
}

export function buildUpsertMachineCapacityBaselineSql(record, parameters, dependency = "") {
  if (!record) return "SELECT NULL::json AS result WHERE false";
  return `INSERT INTO machine_capacity_baselines (
  id,
  machine_id,
  size_key,
  daily_capacity_qty,
  hourly_capacity_qty,
  source_kind,
  confidence,
  effective_from,
  remark,
  created_by,
  created_at,
  updated_at
)
SELECT
  ${parameters.text(record.capacityBaselineId)},
  ${parameters.text(record.machineId)},
  ${parameters.text(record.sizeKey)},
  ${parameters.integer(record.dailyCapacityQty)},
  ${parameters.nullableInteger(record.hourlyCapacityQty)},
  ${parameters.text(record.sourceKind)},
  ${parameters.text(record.confidence)},
  ${dateParameter(record.effectiveFrom, parameters)},
  ${parameters.nullableText(record.remark)},
  ${parameters.nullableText(record.createdBy)},
  ${timestampParameter(record.createdAt, parameters)},
  now()
WHERE EXISTS (SELECT 1 FROM machines WHERE id = ${parameters.text(record.machineId)})
${buildWriteGuardCondition(dependency)}
ON CONFLICT (machine_id, size_key, source_kind, effective_from) DO UPDATE SET
  daily_capacity_qty = machine_capacity_baselines.daily_capacity_qty + EXCLUDED.daily_capacity_qty,
  hourly_capacity_qty = EXCLUDED.hourly_capacity_qty,
  confidence = EXCLUDED.confidence,
  remark = EXCLUDED.remark,
  updated_at = now()
RETURNING ${machineCapacityBaselineJsonExpression("machine_capacity_baselines")} AS result`;
}

function buildInsertValuesSource(values, columns, dependency) {
  if (!dependency) return `VALUES\n${values}`;
  return `SELECT payload.*
FROM (VALUES ${values}) AS payload(${columns.join(", ")})
JOIN ${dependency} ON ${dependency}.ok`;
}

function buildWriteGuardCondition(dependency) {
  return dependency ? `AND EXISTS (SELECT 1 FROM ${dependency} WHERE ok)` : "";
}

function productionTaskJsonExpression(alias) {
  return `json_build_object(
    'productionTaskId', ${alias}.id,
    'bizNo', ${alias}.biz_no,
    'orderLineId', ${alias}.order_line_id,
    'taskType', ${alias}.task_type,
    'machineId', ${alias}.machine_id,
    'plannedQty', ${alias}.planned_qty,
    'taskStatus', ${alias}.task_status,
    'publishedScheduleId', ${alias}.published_schedule_id,
    'revision', ${alias}.revision,
    'createdBy', ${alias}.created_by,
    'createdAt', ${alias}.created_at,
    'updatedAt', ${alias}.updated_at
  )`;
}

function workshopReportJsonExpression(alias) {
  return `json_build_object(
    'reportId', ${alias}.id,
    'productionTaskId', ${alias}.production_task_id,
    'orderLineId', ${alias}.order_line_id,
    'processType', ${alias}.process_type,
    'machineId', ${alias}.machine_id,
    'operatorId', ${alias}.operator_id,
    'qualifiedQty', ${alias}.qualified_qty,
    'exceptionQty', ${alias}.exception_qty,
    'machineCount', ${alias}.machine_count,
    'startedAt', ${alias}.started_at,
    'completedAt', ${alias}.completed_at,
    'remark', ${alias}.remark,
    'evidence', ${alias}.evidence_json,
    'createdAt', ${alias}.created_at
  )`;
}

function packingTaskJsonExpression(alias) {
  return `json_build_object(
    'packingTaskId', ${alias}.id,
    'bizNo', ${alias}.biz_no,
    'orderLineId', ${alias}.order_line_id,
    'plannedQty', ${alias}.planned_qty,
    'actualPackedQty', ${alias}.actual_packed_qty,
    'status', ${alias}.status,
    'revision', ${alias}.revision,
    'createdBy', ${alias}.created_by,
    'createdAt', ${alias}.created_at
  )`;
}

function machineCapacityBaselineJsonExpression(alias) {
  return `json_build_object(
    'capacityBaselineId', ${alias}.id,
    'machineId', ${alias}.machine_id,
    'sizeKey', ${alias}.size_key,
    'dailyCapacityQty', ${alias}.daily_capacity_qty,
    'hourlyCapacityQty', ${alias}.hourly_capacity_qty,
    'sourceKind', ${alias}.source_kind,
    'confidence', ${alias}.confidence,
    'effectiveFrom', ${alias}.effective_from,
    'remark', ${alias}.remark,
    'createdBy', ${alias}.created_by,
    'createdAt', ${alias}.created_at
  )`;
}

function orderLineJsonExpression(alias) {
  return `json_build_object(
    'orderLineId', ${alias}.id,
    'lineStatus', ${alias}.line_status,
    'exceptionTags', ${alias}.exception_tags,
    'revision', ${alias}.revision
  )`;
}

function timestampParameter(value, parameters) {
  const text = String(value ?? "").trim();
  return text && !Number.isNaN(Date.parse(text)) ? parameters.timestamp(text) : "now()";
}

function dateParameter(value, parameters) {
  const text = normalizeDateText(value);
  return text ? `${parameters.text(text)}::date` : "CURRENT_DATE";
}

function normalizeDateText(value) {
  const text = String(value ?? "").trim();
  if (!text) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  const timestamp = Date.parse(text);
  if (!Number.isFinite(timestamp)) return "";
  return new Date(timestamp).toISOString().slice(0, 10);
}
