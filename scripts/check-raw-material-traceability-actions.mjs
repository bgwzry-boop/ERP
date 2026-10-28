import assert from "node:assert/strict";
import { applyRawMaterialTraceabilityAction } from "../server/rawMaterialTraceabilityActionService.mjs";

const inbound = {
  id: "RMI-TRACE-1",
  materialType: "无纺布",
  productName: "大红无纺布",
  spec: "30g",
  factoryColor: "大红",
  unit: "kg",
  rolls: [{
    id: "ROLL-1",
    supplierRollNo: "SUPPLIER-ROLL-1",
    weightKg: 100,
    labelStatus: "已贴标/可用库存",
    inventoryStatus: "可用",
    location: "原料库-可用区",
  }],
};
const original = structuredClone(inbound);
const common = {
  workspace: {},
  operatorId: "U-WAREHOUSE-A",
  operatorName: "库房A",
};

assert.equal(
  applyRawMaterialTraceabilityAction({ action: "print_labels", before: inbound, ...common }),
  null,
  "non-traceability actions should remain owned by the inbound action router",
);

const issued = applyRawMaterialTraceabilityAction({
  action: "issue_to_machine",
  before: inbound,
  body: { rollId: "ROLL-1", machineId: "BAG-01", issuedWeightKg: 100 },
  now: "2026-09-02T02:00:00.000Z",
  ...common,
});
assert.deepEqual(inbound, original, "traceability action service must not mutate its input inbound");
assert.equal(issued.rolls.length, 1, "whole-roll issue must not create a child roll");
assert.equal(issued.rolls[0].weightKg, 100);
assert.equal(issued.rolls[0].inventoryStatus, "机边领用");
assert.equal(issued.rawMaterialIssueRecords[0].remainingWeightKg, 0);
assert.throws(() => applyRawMaterialTraceabilityAction({
  action: "issue_to_machine", before: inbound,
  body: { rollId: "ROLL-1", machineId: "BAG-01", issuedWeightKg: 60 },
  ...common,
}), (error) => error.code === "RAW_MATERIAL_PARTIAL_ISSUE_DISABLED");
assert.deepEqual(inbound, original);

const consumed = applyRawMaterialTraceabilityAction({
  action: "confirm_consumption",
  before: issued,
  body: { rollId: "ROLL-1", consumedWeightKg: 20, machineId: "BAG-01" },
  now: "2026-09-02T02:01:00.000Z",
  ...common,
});
assert.equal(consumed.status, "部分消耗确认");
assert.equal(consumed.rolls[0].weightKg, 80);
assert.equal(consumed.rolls[0].inventoryStatus, "机边领用");
assert.equal(consumed.rawMaterialConsumptionRecords[0].consumedWeightKg, 20);
assert.equal(consumed.rawMaterialIssueRecords[0].remainingMachineSideWeightKg, 80);

for (const action of ["return_leftover", "review_leftover"]) {
  const prior = structuredClone(consumed);
  assert.throws(() => applyRawMaterialTraceabilityAction({
    action, before: consumed, body: { rollId: "ROLL-1", reviewedWeightKg: 80 },
    now: "2026-10-22T06:00:00.000Z", ...common,
  }), (error) => error.code === "RAW_MATERIAL_LEFTOVER_RETURN_TO_AVAILABLE_DISABLED");
  assert.deepEqual(consumed, prior, "a rejected inventory restoration must preserve all machine-side evidence");
  assert.notEqual(consumed.rolls[0].inventoryStatus, "可用");
}
const pendingReview = structuredClone(consumed);
pendingReview.rolls[0].inventoryStatus = "余料待复核";
pendingReview.rolls[0].leftoverWeightKg = 80;
assert.throws(() => applyRawMaterialTraceabilityAction({
  action: "review_leftover",
  before: pendingReview,
  body: { rollId: "ROLL-1", reviewedWeightKg: 80 },
  now: "2026-10-22T06:01:00.000Z",
  ...common,
}), (error) => error.code === "RAW_MATERIAL_LEFTOVER_RETURN_TO_AVAILABLE_DISABLED");
assert.equal(pendingReview.rolls[0].inventoryStatus, "余料待复核");
assert.equal(pendingReview.rawMaterialLeftoverReviewRecords, undefined);
console.log("Raw-material traceability checks passed: whole-roll issue, no split, partial consumption, input immutability, and blocked leftover restoration.");
