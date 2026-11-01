import assert from "node:assert/strict";
import { createProductionSchedulingCommandService } from "../server/services/productionSchedulingCommandService.mjs";
import { createProductionTaskProjectionService } from "../server/services/productionTaskProjectionService.mjs";

// Exercise the real command and production-state resolver. Persistence and
// decision spies prove rejected request fields cannot reach a business write.
function setup({ taskType = "制袋", taskStatus = "待开始", lineStatus = "待排产", orderType = "定制空白" } = {}) {
  const machineId = taskType === "丝印" ? "PRINT-01" : "BAG-01";
  const workspace = {
    machines: [{ id: machineId, machineType: taskType === "丝印" ? "screen_printing" : "bag_making", enabled: true, status: "active" }],
    productionTasks: [{ id: "PT-STATUS", productionTaskId: "PT-STATUS", orderLineId: "OL-STATUS", taskType, taskStatus, status: taskStatus, plannedQty: 100, machineId, revision: 1 }],
    orderLines: [{ id: "OL-STATUS", orderLineId: "OL-STATUS", orderType, lineStatus, status: lineStatus, qty: 100 }],
  };
  const calls = { decision: 0, audit: 0, writes: [] };
  const findOrderLine = (state, id) => state.orderLines.find(row => row.id === id) ?? null;
  const projection = createProductionTaskProjectionService({
    buildPhotoSummary: () => null,
    cleanServerText: value => String(value ?? "").trim(),
    findOrderLine,
  });
  workspace.productionPackingTransactionRepository = {
    async publishProductionSchedule(input) {
      calls.writes.push(input);
      return { productionTask: input.productionTask, productionScheduleRecord: input.productionScheduleRecord,
        orderLine: input.orderLine, businessDecision: input.decisionRecord, operationLogId: input.operationLog.id };
    },
  };
  const service = createProductionSchedulingCommandService({
    ...projection,
    findOrderLine,
    findProductionTask: (state, id) => state.productionTasks.find(row => row.id === id) ?? null,
    buildMachineQueueResponse: async () => ({ items: [] }),
    resolvePersistableCreatedBy: (_state, _createdBy, operatorId) => operatorId,
    summarizeOrderLineForChange: line => ({ id: line.id, status: line.status }),
    buildOperationLog: (_state, input) => { calls.audit += 1; return { id: "LOG-STATUS", ...input }; },
    businessDecisionEvidenceService: {
      prepareDecision: () => { calls.decision += 1; return { record: { id: "BD-STATUS" }, attachmentLinks: [] }; },
      toProjection: value => value,
    },
    now: () => new Date("2026-11-01T08:00:00.000Z"),
  });
  const publish = body => service.publishSchedule({ workspace, productionTaskId: "PT-STATUS", operatorId: "U-OFFICE",
    body: { expectedRevision: 1, plannedQty: 100, machineId, ...body } });
  return { workspace, calls, publish };
}

for (const state of [
  { taskType: "制袋", lineStatus: "待制袋排产", orderType: "定制空白" },
  { taskType: "丝印", lineStatus: "待丝印排产", orderType: "定制印刷" },
  { taskType: "制袋", lineStatus: "待制袋排产", orderType: "纯色通货" },
]) {
  for (const injected of [{ taskStatus: "已完成" }, { lineStatus: "已交付" }, { taskStatus: "已完成", lineStatus: "已交付" }, { lineStatus: "已作废" }]) {
    const { workspace, calls, publish } = setup(state);
    const before = JSON.stringify(workspace);
    const result = await publish(injected);
    assert.equal(result.code, "PRODUCTION_SCHEDULE_STATUS_CONFLICT");
    assert.equal(result.statusCode, 409);
    assert.equal(calls.writes.length, 0);
    assert.equal(calls.decision, 0);
    assert.equal(calls.audit, 0);
    assert.equal(JSON.stringify(workspace), before, "a rejected schedule must leave task/order state intact");
  }
  for (const explicit of [false, true]) {
    const { calls, publish } = setup(state);
    const expected = `${state.taskType}已排产`;
    const result = await publish(explicit ? { taskStatus: expected, lineStatus: expected } : {});
    assert.equal(result.response.taskStatus, expected);
    assert.equal(result.response.orderLineStatus, expected);
    assert.equal(result.response.inventoryCreated, false);
    assert.equal(result.response.packingTaskCreated, false);
    assert.equal(calls.writes.length, 1);
    assert.equal(calls.writes[0].productionTask.taskStatus, expected);
    assert.equal(calls.writes[0].orderLine.lineStatus, expected);
  }
}

const continuing = setup({ taskType: "制袋", taskStatus: "跨日继续", lineStatus: "制袋中" });
const continued = await continuing.publish({ taskStatus: "跨日继续", lineStatus: "跨日继续" });
assert.equal(continued.response.taskStatus, "跨日继续", "existing server-owned progress survives schedule publication");
assert.equal(continued.response.orderLineStatus, "跨日继续");
console.log("PASS schedule status authority: terminal-state injection rejected before writes/audits/decisions; plain and matching legacy requests retain real silk-screen/bag/stock and continuing-stage resolution.");
