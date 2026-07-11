import assert from "node:assert/strict";
import { createProductionSchedulingCommandService } from "../server/services/productionSchedulingCommandService.mjs";

const now = new Date("2026-07-11T12:00:00.000Z");
const queueItems = [
  buildQueueItem("PT-1", "OL-1", "BAG-01", "SCH-1", 1),
  buildQueueItem("PT-2", "OL-2", "BAG-01", "SCH-2", 2),
  buildQueueItem("PT-3", "OL-3", "BAG-02", "SCH-3", 1),
];
const workspace = {
  users: [{ id: "U-OFFICE", displayName: "办公室" }],
  productionTasks: [
    buildTask("PT-1", "OL-1", "BAG-01", "SCH-1"),
    buildTask("PT-2", "OL-2", "BAG-01", "SCH-2"),
    buildTask("PT-3", "OL-3", "BAG-02", "SCH-3"),
  ],
  orderLines: [buildOrderLine("OL-1"), buildOrderLine("OL-2"), buildOrderLine("OL-3")],
  productionScheduleRecords: [
    buildScheduleRecord("SQR-1", "PT-1", "OL-1", "BAG-01", "SCH-1", 1),
    buildScheduleRecord("SQR-2", "PT-2", "OL-2", "BAG-01", "SCH-2", 2),
    buildScheduleRecord("SQR-3", "PT-3", "OL-3", "BAG-02", "SCH-3", 1),
  ],
  operationLogs: [],
};
const calls = { publish: [], resequence: [], move: [] };
workspace.productionPackingTransactionRepository = {
  async publishProductionSchedule(input) {
    calls.publish.push(input);
    return {
      productionTask: { ...input.productionTask, revision: 2 },
      orderLine: { ...input.orderLine, revision: 2 },
      operationLogId: input.operationLog.id,
    };
  },
};
workspace.productionScheduleRecordRepository = {
  async resequenceMachineQueue(input) {
    calls.resequence.push(input);
    return {
      productionScheduleRecords: input.records.map((record) => ({ ...record, revision: 2 })),
      transactionContext: input.transactionContext,
      operationLogId: input.operationLog.id,
    };
  },
  async moveMachineQueueItem(input) {
    calls.move.push(input);
    return {
      productionTask: { ...input.productionTask, revision: input.productionTask.revision + 1 },
      productionScheduleRecords: input.records.map((record) => ({ ...record, revision: 2 })),
      transactionContext: input.transactionContext,
      operationLogId: input.operationLog.id,
    };
  },
};

const dependencies = {
  now: () => now,
  async buildMachineQueueResponse({ query = {} }) {
    const items = queueItems.filter((item) => !query.machineId || item.machineId === query.machineId);
    return { items, machines: [], total: items.length, generatedAt: now.toISOString(), source: "test" };
  },
  buildOperationLog(currentWorkspace, input) {
    return {
      id: `LOG-${currentWorkspace.operationLogs.length + calls.publish.length + calls.resequence.length + calls.move.length + 1}`,
      ...input,
      pageKey: "api",
      occurredAt: now.toISOString(),
      createdAt: now.toISOString(),
    };
  },
  buildProductionTaskFromBody(currentWorkspace, productionTaskId, body) {
    const orderLine = currentWorkspace.orderLines.find((line) => line.id === body.orderLineId);
    return orderLine ? buildTask(productionTaskId, orderLine.id, body.machineId || "BAG-01", "") : null;
  },
  findOrderLine(currentWorkspace, id) {
    return currentWorkspace.orderLines.find((line) => line.id === id || line.orderLineId === id) ?? null;
  },
  findProductionTask(currentWorkspace, id) {
    return currentWorkspace.productionTasks.find((task) => task.id === id || task.productionTaskId === id) ?? null;
  },
  inferProductionMachineIdFromTaskType(taskType) {
    return taskType === "丝印" ? "PRINT-01" : "BAG-01";
  },
  inferProductionTaskTypeFromOrderLine(orderLine) {
    return String(orderLine.status).includes("丝印") ? "丝印" : "制袋";
  },
  isProductionTaskCompletedStatus(status) {
    return status === "已完成";
  },
  resolvePersistableCreatedBy(currentWorkspace, candidate, fallback) {
    return currentWorkspace.users.some((user) => user.id === candidate) ? candidate : fallback;
  },
  resolvePublishedProductionLineStatus({ taskType }) {
    return `${taskType}已排产`;
  },
  resolvePublishedProductionTaskStatus({ taskType }) {
    return `${taskType}已排产`;
  },
  summarizeOrderLineForChange(orderLine) {
    return { id: orderLine.id, status: orderLine.status };
  },
};

assert.throws(() => createProductionSchedulingCommandService({}), /buildMachineQueueResponse must be a function/);
const service = createProductionSchedulingCommandService(dependencies);

const published = await service.publishSchedule({
  workspace,
  productionTaskId: "PT-1",
  operatorId: "U-OFFICE",
  body: {
    productionTaskId: "PT-1",
    orderLineId: "OL-1",
    machineId: "BAG-01",
    processType: "制袋",
    plannedQty: 100,
    operatorId: "U-SPOOFED",
    idempotencyKey: "schedule-publish-service-001",
  },
});
assert.equal(published.response.productionTask.createdBy, "U-OFFICE");
assert.equal(published.response.productionTask.revision, 2);
assert.equal(published.response.inventoryCreated, false);
assert.equal(calls.publish[0].operationLog.operatorId, "U-OFFICE");
assert.equal(calls.publish[0].idempotencyPayload.operatorId, "U-OFFICE");
assert.equal(calls.publish[0].idempotencyKey, "schedule-publish-service-001");

const completedTask = workspace.productionTasks[0];
completedTask.taskStatus = "已完成";
const blockedPublish = await service.publishSchedule({ workspace, productionTaskId: "PT-1", body: {}, operatorId: "U-OFFICE" });
assert.equal(blockedPublish.code, "PRODUCTION_TASK_ALREADY_COMPLETED");
completedTask.taskStatus = "制袋已排产";

const duplicateSequence = await service.resequenceMachineQueue({
  workspace,
  operatorId: "U-OFFICE",
  body: { machineId: "BAG-01", orderedProductionTaskIds: ["PT-1", "PT-1"] },
});
assert.equal(duplicateSequence.code, "VALIDATION_ERROR");

const incompleteSequence = await service.resequenceMachineQueue({
  workspace,
  operatorId: "U-OFFICE",
  body: { machineId: "BAG-01", orderedProductionTaskIds: ["PT-1"] },
});
assert.equal(incompleteSequence.code, "PRODUCTION_SCHEDULE_QUEUE_SEQUENCE_INCOMPLETE");

const resequenced = await service.resequenceMachineQueue({
  workspace,
  operatorId: "U-OFFICE",
  body: {
    machineId: "BAG-01",
    orderedProductionTaskIds: ["PT-2", "PT-1"],
    operatorId: "U-SPOOFED",
    idempotencyKey: "schedule-resequence-service-001",
  },
});
assert.equal(resequenced.response.updatedBy, "U-OFFICE");
assert.equal(resequenced.response.inventoryCreated, false);
assert.equal(calls.resequence[0].records[0].productionTaskId, "PT-2");
assert.equal(calls.resequence[0].records[0].queueSeq, 1);
assert.equal(calls.resequence[0].expectedRecords.length, 2);
assert.deepEqual(calls.resequence[0].lockedMachineIds, ["BAG-01"]);
assert.equal(calls.resequence[0].operationLog.operatorId, "U-OFFICE");
assert.equal(calls.resequence[0].idempotencyPayload.operatorId, "U-OFFICE");

const missingInsertTarget = await service.moveMachineQueueItem({
  workspace,
  operatorId: "U-OFFICE",
  body: {
    productionTaskId: "PT-1",
    targetMachineId: "BAG-02",
    insertBeforeProductionTaskId: "PT-MISSING",
  },
});
assert.equal(missingInsertTarget.code, "PRODUCTION_SCHEDULE_INSERT_TARGET_NOT_FOUND");

const moved = await service.moveMachineQueueItem({
  workspace,
  operatorId: "U-OFFICE",
  body: {
    productionTaskId: "PT-1",
    targetMachineId: "BAG-02",
    insertBeforeProductionTaskId: "PT-3",
    operatorId: "U-SPOOFED",
    idempotencyKey: "schedule-move-service-001",
  },
});
assert.equal(moved.response.sourceMachineId, "BAG-01");
assert.equal(moved.response.targetMachineId, "BAG-02");
assert.equal(moved.response.targetQueueSeq, 1);
assert.equal(moved.response.productionTask.machineId, "BAG-02");
assert.equal(moved.response.inventoryCreated, false);
assert.deepEqual(calls.move[0].lockedMachineIds, ["BAG-01", "BAG-02"]);
assert.equal(calls.move[0].expectedRecords.length, 3);
assert.equal(calls.move[0].operationLog.operatorId, "U-OFFICE");
assert.equal(calls.move[0].idempotencyPayload.operatorId, "U-OFFICE");
assert.equal(
  calls.move[0].records.some((record) => record.productionTaskId === "PT-1" && record.machineId === "BAG-01" && record.status === "moved"),
  true,
);
assert.equal(
  calls.move[0].records.some((record) => record.productionTaskId === "PT-1" && record.machineId === "BAG-02" && record.queueSeq === 1),
  true,
);

console.log(
  "production scheduling command service checks passed: publish, resequence, move, validation, authenticated identity, and transaction inputs are covered.",
);

function buildTask(productionTaskId, orderLineId, machineId, publishedScheduleId) {
  return {
    id: productionTaskId,
    productionTaskId,
    bizNo: productionTaskId,
    orderLineId,
    taskType: "制袋",
    machineId,
    plannedQty: 100,
    taskStatus: "制袋已排产",
    status: "制袋已排产",
    publishedScheduleId,
    revision: 1,
    createdBy: "办公室A",
    createdAt: "2026-07-11T10:00:00.000Z",
  };
}

function buildOrderLine(id) {
  return { id, orderLineId: id, orderType: "定制印刷", qty: 100, status: "待排产", revision: 1 };
}

function buildQueueItem(productionTaskId, orderLineId, machineId, publishedScheduleId, queueSeq) {
  return {
    scheduleRecordId: `SQR-${productionTaskId}`,
    productionTaskId,
    orderLineId,
    machineId,
    publishedScheduleId,
    queueSeq,
    plannedQty: 100,
    remainingQty: 100,
    status: "制袋已排产",
  };
}

function buildScheduleRecord(scheduleRecordId, productionTaskId, orderLineId, machineId, publishedScheduleId, queueSeq) {
  return {
    scheduleRecordId,
    productionTaskId,
    orderLineId,
    machineId,
    publishedScheduleId,
    queueSeq,
    status: "active",
    sourceKind: "manual_resequence",
    revision: 1,
    createdBy: "U-OFFICE",
    createdAt: "2026-07-11T10:00:00.000Z",
    updatedBy: "U-OFFICE",
    updatedAt: "2026-07-11T10:00:00.000Z",
  };
}
