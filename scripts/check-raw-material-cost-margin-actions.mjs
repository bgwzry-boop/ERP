import assert from "node:assert/strict";
import { applyRawMaterialCostMarginAction } from "../server/rawMaterialCostMarginActionService.mjs";

const workspace = {
  productionTasks: [{ id: "TASK-1", orderLineId: "LINE-1", plannedQty: 1_000, machineId: "BAG-01" }],
  orderLines: [{
    id: "LINE-1",
    customerId: "CUSTOMER-1",
    orderNo: "ORDER-1",
    productName: "无纺布袋",
    size: "30*38",
    bagColor: "大红",
    qty: 1_000,
    amount: 900,
  }],
  customers: [{ id: "CUSTOMER-1", name: "测试客户" }],
};
const inbound = {
  id: "RMI-ACTION-1",
  supplierName: "测试供应商",
  deliveryNoteNo: "NOTE-1",
  materialType: "无纺布",
  productName: "大红无纺布",
  spec: "30g",
  factoryColor: "大红",
  unit: "kg",
  unitPrice: 9,
  rawMaterialIssueRecords: [{
    issueRecordId: "ISSUE-1",
    inboundId: "RMI-ACTION-1",
    rollId: "ROLL-1",
    productionTaskId: "TASK-1",
    productionTaskOrderLineId: "LINE-1",
    productionTaskMachineId: "BAG-01",
    productionTaskMatchStatus: "已匹配",
  }],
  rawMaterialConsumptionRecords: [{
    consumptionRecordId: "CONSUMPTION-1",
    inboundId: "RMI-ACTION-1",
    issueRecordId: "ISSUE-1",
    rollId: "ROLL-1",
    consumedWeightKg: 30,
  }],
};
const original = structuredClone(inbound);
const common = {
  workspace,
  operatorId: "U-MANAGER-A",
  operatorName: "管理A",
};

assert.equal(
  applyRawMaterialCostMarginAction({ action: "review", before: inbound, ...common }),
  null,
  "non-cost actions should remain owned by the inbound action router",
);

const drafted = applyRawMaterialCostMarginAction({
  action: "generate_cost_draft",
  before: inbound,
  body: { note: "生成成本草稿" },
  now: "2026-09-02T01:00:00.000Z",
  ...common,
});
assert.deepEqual(inbound, original, "cost action service must not mutate its input inbound");
assert.equal(drafted.costAllocationStatus, "成本草稿待复核");
assert.equal(drafted.costAllocationDraftAmount, 270);
assert.equal(drafted.rawMaterialCostAllocationDrafts[0].orderLineId, "LINE-1");
assert.equal(drafted.rawMaterialIssueRecords[0].costAllocationStatus, "成本草稿待复核");

const confirmed = applyRawMaterialCostMarginAction({
  action: "confirm_cost_draft",
  before: drafted,
  body: { note: "确认成本草稿" },
  now: "2026-09-02T01:01:00.000Z",
  ...common,
});
assert.equal(confirmed.costAllocationStatus, "成本已复核待损耗校准");
assert.equal(confirmed.costAllocationConfirmedAmount, 270);
assert.match(confirmed.rawMaterialCostAllocationConfirmations[0].costConfirmationId, /^RMCC-/);

const calibrated = applyRawMaterialCostMarginAction({
  action: "calibrate_loss",
  before: confirmed,
  body: { expectedOutputQuantity: 1_000, actualQualifiedOutputQuantity: 950 },
  now: "2026-09-02T01:02:00.000Z",
  ...common,
});
assert.equal(calibrated.costAllocationStatus, "损耗已校准待毛利确认");
assert.equal(calibrated.rawMaterialCostLossCalibrations[0].lossRatePercent, 5);
assert.equal(calibrated.rawMaterialCostLossCalibrations[0].marginEffect, "pending_margin_snapshot");

const snapshotted = applyRawMaterialCostMarginAction({
  action: "generate_margin_snapshot",
  before: calibrated,
  body: { note: "生成毛利快照" },
  now: "2026-09-02T01:03:00.000Z",
  ...common,
});
assert.equal(snapshotted.costAllocationStatus, "毛利快照待复核");
assert.equal(snapshotted.rawMaterialOrderMarginSnapshots[0].totalSalesAmount, 900);
assert.equal(snapshotted.rawMaterialOrderMarginSnapshots[0].grossProfitAmount, 630);

const reviewed = applyRawMaterialCostMarginAction({
  action: "review_margin_snapshot",
  before: snapshotted,
  body: { note: "财务复核毛利快照" },
  now: "2026-09-02T01:04:00.000Z",
  ...common,
});
assert.equal(reviewed.costAllocationStatus, "毛利已复核/报表可用");
assert.equal(reviewed.rawMaterialOrderMarginReports[0].grossProfitAmount, 630);
assert.equal(reviewed.rawMaterialOrderMarginSnapshots[0].reviewStatus, "已财务复核/报表可用");

console.log("Raw-material cost/margin action checks passed: routing isolation, input immutability, and the full draft-to-report lifecycle are covered.");
