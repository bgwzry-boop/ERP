const clean = value => String(value ?? "").trim();

export const RAW_MATERIAL_ISSUE_CLOSED_TASK = ["已取消", "已作废", "已完成", "已关闭", "cancelled", "canceled", "voided", "completed", "closed"];
export const RAW_MATERIAL_ISSUE_CLOSED_LINE = [...RAW_MATERIAL_ISSUE_CLOSED_TASK, "已交付", "已入库", "已出库"];

export function isPublishedRawMaterialIssueTask(task = {}, line = {}) {
  const scheduleId = clean(task.publishedScheduleId ?? task.published_schedule_id);
  const taskStatus = clean(task.taskStatus ?? task.task_status ?? task.status);
  const lineStatus = clean(line.lineStatus ?? line.line_status ?? line.status);
  return Boolean(scheduleId && taskStatus && !RAW_MATERIAL_ISSUE_CLOSED_TASK.includes(taskStatus)
    && !RAW_MATERIAL_ISSUE_CLOSED_LINE.includes(lineStatus));
}
