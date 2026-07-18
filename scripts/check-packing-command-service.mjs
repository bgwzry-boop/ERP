import assert from "node:assert/strict";
import { createPackingCommandService } from "../server/services/packingCommandService.mjs";

const now = new Date("2026-07-11T14:00:00.000Z");
const workspace = {
  users: [{ id: "U-PACKING" }],
  packingTasks: [
    {
      id: "PKT-1",
      packingTaskId: "PKT-1",
      orderLineId: "OL-1",
      plannedQty: 100,
      status: "待打包",
      revision: 2,
      createdBy: "打包A",
    },
  ],
  orderLines: [
    {
      id: "OL-1",
      orderLineId: "OL-1",
      qty: 100,
      fulfillmentMethod: "express_ltl",
      status: "待打包",
      revision: 3,
    },
  ],
  fulfillments: [
    {
      id: "F-1",
      fulfillmentId: "F-1",
      orderLineId: "OL-1",
      method: "express_ltl",
      expectedQty: 100,
      status: "待打包",
      revision: 4,
    },
  ],
  inventories: [{ id: "INV-1", reserved: 100 }],
  inventoryReservations: [
    { reservationId: "RSV-1", orderLineId: "OL-1", inventoryItemId: "INV-1", reservedQty: 100, status: "生效" },
  ],
  operationLogs: [],
};
const calls = [];
workspace.productionPackingTransactionRepository = {
  async completePackingTask(input) {
    calls.push(input);
    return {
      packingTask: { ...input.packingTask, revision: input.packingTask.revision + 1 },
      packages: input.packages,
      fulfillment: { ...input.fulfillment, revision: input.fulfillment.revision + 1 },
      orderLine: { ...input.orderLine, revision: input.orderLine.revision + 1 },
      inventoryLedgerEntries: input.inventoryLedgerEntries,
      operationLogId: input.operationLog.id,
    };
  },
};

const service = createPackingCommandService({
  now: () => now,
  buildTodo(currentWorkspace, input) {
    assert.ok(currentWorkspace.fulfillments.some((item) => item.id === input.refId));
    return { handled: false, status: "未处理", ref: input.refId, ...input };
  },
  buildOperationLog(currentWorkspace, input) {
    return { id: "LOG-PACK-1", ...input, pageKey: "api", occurredAt: now.toISOString(), createdAt: now.toISOString() };
  },
  findInventoryItem(currentWorkspace, id) {
    return currentWorkspace.inventories.find((item) => item.id === id) ?? null;
  },
  resolvePersistableCreatedBy(currentWorkspace, candidate, fallback) {
    return currentWorkspace.users.some((user) => user.id === candidate) ? candidate : fallback;
  },
});

const completed = await service.completePackingTask({
  workspace,
  packingTaskId: "PKT-1",
  operatorId: "U-PACKING",
  body: {
    packingTaskId: "PKT-1",
    actualPackedQty: 100,
    labelsPrinted: true,
    packages: [
      { packedQty: 60, createdBy: "U-SPOOFED" },
      { packedQty: 40, createdBy: "U-SPOOFED" },
    ],
    operatorId: "U-SPOOFED",
    idempotencyKey: "packing-complete-service-001",
  },
});
assert.equal(completed.response.status, "已完成");
assert.equal(completed.response.actualPackedQty, 100);
assert.equal(completed.response.fulfillmentStatus, "待打印标签");
assert.equal(completed.response.orderLineStatus, "待打印标签");
assert.equal(completed.response.legacyLabelsPrintedIgnored, true);
assert.equal(completed.response.inventoryDeducted, false);
assert.equal(calls[0].packingTask.createdBy, "U-PACKING");
assert.equal(calls[0].packages.length, 2);
assert.equal(calls[0].packages[0].createdBy, "U-PACKING");
assert.equal(calls[0].packages[1].createdBy, "U-PACKING");
assert.equal(calls[0].packages[0].status, "待打印标签");
assert.equal(calls[0].packages[1].status, "待打印标签");
assert.equal(calls[0].fulfillment.confirmedBy, "U-PACKING");
assert.equal(calls[0].inventoryLedgerEntries[0].qtyChange, 0);
assert.equal(calls[0].inventoryLedgerEntries[0].operatorId, "U-PACKING");
assert.match(calls[0].inventoryLedgerEntries[0].remark, /出库\/拉走确认时再扣减/);
assert.equal(calls[0].operationLog.operatorId, "U-PACKING");
assert.equal(calls[0].idempotencyPayload.operatorId, "U-PACKING");

const labelPending = await service.completePackingTask({
  workspace,
  packingTaskId: "PKT-1",
  operatorId: "U-PACKING",
  body: {
    actualPackedQty: 100,
    labelsPrinted: false,
    packageCount: 2,
    idempotencyKey: "packing-complete-label-pending-001",
  },
});
assert.equal(labelPending.response.fulfillmentStatus, "待打印标签");
assert.equal(labelPending.response.todoId, "T-PACK-PKT-1");
assert.equal(calls[1].todo.refType, "fulfillment");
assert.equal(calls[1].todo.refId, "F-1");
assert.equal(calls[1].todoEvent.eventType, "todo_source:packing_completed");

const mismatch = await service.completePackingTask({
  workspace,
  packingTaskId: "PKT-1",
  operatorId: "U-PACKING",
  body: { packingTaskId: "PKT-OTHER", actualPackedQty: 1 },
});
assert.equal(mismatch.code, "VALIDATION_ERROR");

const invalidQty = await service.completePackingTask({
  workspace,
  packingTaskId: "PKT-1",
  operatorId: "U-PACKING",
  body: { actualPackedQty: 0 },
});
assert.equal(invalidQty.code, "VALIDATION_ERROR");

console.log(
  "packing command service checks passed: package identity, browser-reported labels ignored, express label pending status, zero inventory deduction, transaction inputs, and validation are covered.",
);
