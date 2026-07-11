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
  operationLogs: [],
};
const calls = { daily: [], report: [] };
workspace.productionPackingTransactionRepository = {
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
    return {
      productionTask: { ...input.productionTask, revision: input.productionTask.revision + 1 },
      workshopReport: input.workshopReport,
      orderLine: { ...input.orderLine, revision: input.orderLine.revision + 1 },
      packingTask: input.packingTask,
      machineCapacityBaseline: input.machineCapacityBaseline,
      inventoryReservations: input.inventoryReservations,
      inventoryLedgerEntries: input.inventoryLedgerEntries,
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

const completed = await service.completeProductionReport({
  workspace,
  productionTaskId: "PT-1",
  operatorId: "U-WORKSHOP",
  body: {
    productionTaskId: "PT-1",
    inventoryItemId: "INV-1",
    qualifiedQty: 40,
    machineCount: 8888,
    packages: [{ createdBy: "U-SPOOFED" }],
    operatorId: "U-SPOOFED",
    idempotencyKey: "production-report-service-001",
  },
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
  "production reporting command service checks passed: daily progress, completion, inventory snapshots, authenticated identity, and machine-count safety are covered.",
);
