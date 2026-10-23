export function getBlockingProductionExceptions(records = [], productionTaskId, excludingId = "") {
  return records.filter((record) =>
    String(record.productionTaskId ?? record.production_task_id ?? "") === productionTaskId &&
    String(record.productionExceptionId ?? record.id ?? "") !== excludingId &&
    String(record.continuationMode ?? record.continuation_mode ?? "") === "暂停等确认" &&
    !["已恢复生产", "已作废"].includes(String(record.status ?? "")));
}
