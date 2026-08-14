import assert from "node:assert/strict";
import { createProductionReportingCommandService } from "../server/services/productionReportingCommandService.mjs";

const now = new Date("2026-07-11T13:00:00.000Z");
const workspace = {
  users: [{ id: "U-WORKSHOP" }],
  productionTasks: [
    {
      id: "PT-1",
      productionTaskId: "PT-1",
      orderLineId: "OL-1",
      taskType: "制袋",
      machineId: "BAG-01",
      plannedQty: 100,
      taskStatus: "制袋中",
      revision: 2,
      createdBy: "车间A",
      createdAt: "2026-07-11T09:00:00.000Z",
    },
  ],
  orderLines: [
    {
      id: "OL-1",
      orderLineId: "OL-1",
      orderType: "定制印刷",
      size: "30*38",
      color: "白色",
      handle: "普通提",
      style: "定制印刷",
      qty: 100,
      status: "制袋中",
      revision: 4,
    },
  ],
  inventories: [
    {
      id: "INV-1",
      size: "30*38",
      color: "白色",
      handle: "普通提",
      style: "定制印刷",
      state: "仓库已清点",
      inStock: 500,
      reserved: 20,
      revision: 3,
    },
  ],
  workshopReports: [
    {
      reportId: "WDP-OLD",
      productionTaskId: "PT-1",
      orderLineId: "OL-1",
      qualifiedQty: 20,
      evidence: { reportKind: "daily_progress" },
    },
  ],
  productionExceptions: [],
  todos: [],
  todoEvents: [],
  operationLogs: [],
};
const calls = { daily: [], exception: [], exceptionResolution: [], report: [], reportReplay: null };
workspace.productionPackingTransactionRepository = {
  async findProductionReportIdempotentReplay(input) {
    return calls.reportReplay?.idempotencyKey === input.idempotencyKey ? calls.reportReplay.transaction : null;
  },
  async recordProductionDailyProgress(input) {
    calls.daily.push(input);
    return {
      productionTask: { ...input.productionTask, revision: input.productionTask.revision + 1 },
      workshopReport: input.workshopReport,
      operationLogId: input.operationLog.id,
    };
  },
  async recordProductionReport(input) {
    calls.report.push(input);
    const transaction = {
      productionTask: { ...input.productionTask, revision: input.productionTask.revision + 1 },
      workshopReport: input.workshopReport,
      orderLine: { ...input.orderLine, revision: input.orderLine.revision + 1 },
      packingTask: input.packingTask,
      machineCapacityBaseline: input.machineCapacityBaseline,
      inventoryReservations: input.inventoryReservations,
      inventoryLedgerEntries: input.inventoryLedgerEntries,
      operationLogId: input.operationLog.id,
    };
    calls.reportReplay = { idempotencyKey: input.idempotencyKey, transaction };
    return transaction;
  },
  async recordProductionException(input) {
    calls.exception.push(input);
    return {
      productionTask: { ...input.productionTask, revision: input.productionTask.revision + 1 },
      productionException: input.productionException,
      todo: input.todo,
      todoEvent: input.todoEvent,
      operationLogId: input.operationLog.id,
    };
  },
  async resolveProductionException(input) {
    calls.exceptionResolution.push(input);
    return {
      productionTask: { ...input.productionTask, revision: input.productionTask.revision + 1 },
      productionException: input.productionException,
      todo: input.todo,
      todoEvent: input.todoEvent,
      operationLogId: input.operationLog.id,
    };
  },
};

const service = createProductionReportingCommandService({
  now: () => now,
  buildOperationLog(currentWorkspace, input) {
    return {
      id: `LOG-REPORT-${calls.daily.length + calls.report.length + 1}`,
      ...input,
      pageKey: "api",
      occurredAt: now.toISOString(),
      createdAt: now.toISOString(),
    };
  },
  buildProductionTaskFromBody() {
    return null;
  },
  buildTodo(currentWorkspace, input) {
    return { ...input, todoId: input.id, refId: input.ref, ref: input.ref, createdAt: input.createdAt, updatedAt: input.updatedAt };
  },
  findInventoryItem(currentWorkspace, id) {
    return currentWorkspace.inventories.find((item) => item.id === id) ?? null;
  },
  findOrderLine(currentWorkspace, id) {
    return currentWorkspace.orderLines.find((item) => item.id === id || item.orderLineId === id) ?? null;
  },
  findProductionTask(currentWorkspace, id) {
    return currentWorkspace.productionTasks.find((item) => item.id === id || item.productionTaskId === id) ?? null;
  },
  isProductionTaskCompletedStatus(status) {
    return status === "已完成";
  },
  resolvePersistableCreatedBy(currentWorkspace, candidate, fallback) {
    return currentWorkspace.users.some((user) => user.id === candidate) ? candidate : fallback;
  },
  summarizeOrderLineForChange(orderLine) {
    return { id: orderLine.id, status: orderLine.status };
  },
});

const daily = await service.recordDailyProgress({
  workspace,
  productionTaskId: "PT-1",
  operatorId: "U-WORKSHOP",
  body: {
    productionTaskId: "PT-1",
    dailyQualifiedQty: 30,
    machineCount: 9999,
    operatorId: "U-SPOOFED",
    idempotencyKey: "daily-progress-service-001",
  },
});
assert.equal(daily.response.previousQualifiedQty, 20);
assert.equal(daily.response.cumulativeQualifiedQty, 50);
assert.equal(daily.response.remainingQty, 50);
assert.equal(daily.response.nextWorkDate, "2026-07-12");
assert.equal(daily.response.machineCount, 9999);
assert.equal(daily.response.machineCountAffectsInventory, false);
assert.equal(daily.response.inventoryCreated, false);
assert.equal(calls.daily[0].productionTask.createdBy, "U-WORKSHOP");
assert.equal(calls.daily[0].workshopReport.operatorId, "U-WORKSHOP");
assert.equal(calls.daily[0].operationLog.operatorId, "U-WORKSHOP");
assert.equal(calls.daily[0].idempotencyPayload.operatorId, "U-WORKSHOP");

workspace.productionTasks[0].taskStatus = "已完成";
const blockedDaily = await service.recordDailyProgress({
  workspace,
  productionTaskId: "PT-1",
  operatorId: "U-WORKSHOP",
  body: { dailyQualifiedQty: 1 },
});
assert.equal(blockedDaily.code, "PRODUCTION_TASK_ALREADY_COMPLETED");
workspace.productionTasks[0].taskStatus = "制袋中";

const exception = await service.recordProductionException({
  workspace,
  productionTaskId: "PT-1",
  operatorId: "U-WORKSHOP",
  body: {
    productionTaskId: "PT-1",
    exceptionType: "机器问题",
    continuationMode: "暂停等确认",
    estimatedLossQty: 6,
    affectsDelivery: true,
    operatorId: "U-SPOOFED",
    idempotencyKey: "production-exception-service-001",
  },
});
assert.equal(exception.response.exceptionType, "机器问题");
assert.equal(exception.response.continuationMode, "暂停等确认");
assert.equal(exception.response.taskStatus, "异常暂停");
assert.equal(exception.response.inventoryCreated, false);
assert.equal(exception.response.reservationCreated, false);
assert.equal(exception.response.packingTaskCreated, false);
assert.equal(exception.response.statementUpdated, false);
assert.equal(calls.exception[0].productionException.operatorId, "U-WORKSHOP");
assert.equal(calls.exception[0].productionException.estimatedLossQty, 6);
assert.equal(calls.exception[0].todo.type, "生产异常");
assert.equal(calls.exception[0].todo.refType, "production_task");
assert.equal(calls.exception[0].todo.refId, "PT-1");
assert.equal(calls.exception[0].todoEvent.eventType, "todo_source:production_exception_reported");
assert.equal(calls.exception[0].operationLog.operatorId, "U-WORKSHOP");
assert.equal(calls.exception[0].idempotencyPayload.operatorId, "U-WORKSHOP");

workspace.productionTasks[0].taskStatus = "异常暂停";
workspace.productionExceptions = [calls.exception[0].productionException];
workspace.todos = [calls.exception[0].todo];
const missingResolutionConfirmation = await service.resolveProductionException({
  workspace,
  productionTaskId: "PT-1",
  operatorId: "U-OFFICE",
  body: {
    productionExceptionId: calls.exception[0].productionException.productionExceptionId,
    resolutionCode: "继续生产",
    resolutionNote: "主管确认机器已调整",
  },
});
assert.equal(missingResolutionConfirmation.code, "PRODUCTION_EXCEPTION_RESOLUTION_CONFIRMATION_REQUIRED");
const resolution = await service.resolveProductionException({
  workspace,
  productionTaskId: "PT-1",
  operatorId: "U-OFFICE",
  body: {
    productionExceptionId: calls.exception[0].productionException.productionExceptionId,
    resolutionCode: "继续生产",
    resolutionNote: "主管确认机器已调整",
    resolutionConfirmed: true,
    idempotencyKey: "production-exception-resolution-service-001",
  },
});
assert.equal(resolution.response.exceptionStatus, "已恢复生产");
assert.equal(resolution.response.taskStatus, "制袋中");
assert.equal(resolution.response.todoStatus, "已处理");
assert.equal(resolution.response.inventoryCreated, false);
assert.equal(resolution.response.reservationCreated, false);
assert.equal(calls.exceptionResolution[0].productionException.resolutionCode, "继续生产");
assert.equal(calls.exceptionResolution[0].todo.status, "已处理");
assert.equal(calls.exceptionResolution[0].todoEvent.eventType, "todo_source:production_exception_resolved");
assert.equal(calls.exceptionResolution[0].operationLog.operatorId, "U-OFFICE");
assert.equal(resolution.response.resolvedBy, "U-OFFICE");
assert.equal(resolution.response.resolvedAt, now.toISOString());
workspace.productionExceptions = [calls.exceptionResolution[0].productionException];
const terminalResolutionBlocked = await service.resolveProductionException({
  workspace,
  productionTaskId: "PT-1",
  operatorId: "U-OFFICE",
  body: {
    productionExceptionId: calls.exception[0].productionException.productionExceptionId,
    resolutionCode: "继续生产",
    resolutionNote: "主管确认机器已调整",
    resolutionConfirmed: true,
  },
});
assert.equal(terminalResolutionBlocked.code, "PRODUCTION_EXCEPTION_ALREADY_RESOLVED");

workspace.productionTasks[0].taskStatus = "异常暂停";
const pausedDailyBlocked = await service.recordDailyProgress({
  workspace,
  productionTaskId: "PT-1",
  operatorId: "U-WORKSHOP",
  body: { dailyQualifiedQty: 1 },
});
assert.equal(pausedDailyBlocked.code, "PRODUCTION_TASK_EXCEPTION_PAUSED");
const pausedCompletionBlocked = await service.completeProductionReport({
  workspace,
  productionTaskId: "PT-1",
  operatorId: "U-WORKSHOP",
  body: { inventoryItemId: "INV-1", qualifiedQty: 1 },
});
assert.equal(pausedCompletionBlocked.code, "PRODUCTION_TASK_EXCEPTION_PAUSED");
workspace.productionTasks[0].taskStatus = "制袋中";

const otherExceptionBlocked = await service.recordProductionException({
  workspace,
  productionTaskId: "PT-1",
  operatorId: "U-WORKSHOP",
  body: { exceptionType: "其他", continuationMode: "继续生产" },
});
assert.equal(otherExceptionBlocked.code, "PRODUCTION_EXCEPTION_REMARK_REQUIRED");

workspace.productionTasks[0].taskStatus = "已完成";
const completedExceptionBlocked = await service.recordProductionException({
  workspace,
  productionTaskId: "PT-1",
  operatorId: "U-WORKSHOP",
  body: { exceptionType: "机器问题", continuationMode: "继续生产" },
});
assert.equal(completedExceptionBlocked.code, "PRODUCTION_TASK_ALREADY_COMPLETED");
workspace.productionTasks[0].taskStatus = "制袋中";

const completedBody = {
  productionTaskId: "PT-1",
  inventoryItemId: "INV-1",
  qualifiedQty: 40,
  machineCount: 8888,
  packages: [{ createdBy: "U-SPOOFED" }],
  operatorId: "U-SPOOFED",
  idempotencyKey: "production-report-service-001",
};
const completed = await service.completeProductionReport({
  workspace,
  productionTaskId: "PT-1",
  operatorId: "U-WORKSHOP",
  body: completedBody,
});
assert.equal(completed.response.qualifiedQty, 40);
assert.equal(completed.response.machineCount, 8888);
assert.equal(completed.response.machineCountAffectsInventory, false);
assert.equal(completed.response.capacityCalibration.dailyCapacityQty, 40);
assert.equal(calls.report[0].productionTask.createdBy, "U-WORKSHOP");
assert.equal(calls.report[0].workshopReport.operatorId, "U-WORKSHOP");
assert.equal(calls.report[0].packingTask.createdBy, "U-WORKSHOP");
assert.equal(calls.report[0].inventoryReservations[0].createdBy, "U-WORKSHOP");
assert.equal(calls.report[0].inventoryAdjustments[0].onHandQtyChange, 40);
assert.equal(calls.report[0].inventoryAdjustments[0].reservedQtyChange, 40);
assert.equal(calls.report[0].inventoryAdjustments[0].expectedRevision, 3);
assert.equal(calls.report[0].inventoryLedgerEntries[0].qtyChange, 40);
assert.match(calls.report[0].inventoryLedgerEntries[0].remark, /机器计数 8888 不参与库存/);
assert.equal(calls.report[0].operationLog.operatorId, "U-WORKSHOP");
assert.equal(calls.report[0].idempotencyPayload.operatorId, "U-WORKSHOP");
workspace.productionTasks[0].taskStatus = "已完成";
const replayedCompleted = await service.completeProductionReport({
  workspace,
  productionTaskId: "PT-1",
  operatorId: "U-WORKSHOP",
  body: completedBody,
});
assert.equal(replayedCompleted.response.reportId, completed.response.reportId);
assert.equal(replayedCompleted.response.operationLogId, completed.response.operationLogId);
assert.equal(calls.report.length, 1, "an idempotent completion retry must not execute another production report");
workspace.productionTasks[0].taskStatus = "制袋中";

workspace.orderLines[0].orderType = "外加工印刷";
const externalReport = await service.completeProductionReport({
  workspace,
  productionTaskId: "PT-1",
  operatorId: "U-WORKSHOP",
  body: { qualifiedQty: 10, inventoryItemId: "INV-1" },
});
assert.equal(externalReport.code, "PRODUCTION_REPORT_EXTERNAL_PROCESSING_NOT_INVENTORY");
workspace.orderLines[0].orderType = "定制印刷";

console.log(
  "production reporting command service checks passed: daily progress, exception records, completion, inventory snapshots, authenticated identity, and machine-count safety are covered.",
);
