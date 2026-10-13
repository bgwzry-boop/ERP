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
  body: { rollId: "ROLL-1", machineId: "BAG-01", issuedWeightKg: 60 },
  now: "2026-09-02T02:00:00.000Z",
  ...common,
});
assert.deepEqual(inbound, original, "traceability action service must not mutate its input inbound");
assert.equal(issued.status, "部分领料/机边");
assert.equal(issued.rolls[0].weightKg, 40);
assert.equal(issued.rolls[0].inventoryStatus, "可用");
assert.equal(issued.rolls[1].id, "ROLL-1-S01");
assert.equal(issued.rolls[1].weightKg, 60);
assert.equal(issued.rolls[1].inventoryStatus, "机边领用");
assert.equal(issued.rawMaterialIssueRecords[0].remainingWeightKg, 40);
assert.match(issued.rawMaterialSplitRecords[0].splitRecordId, /^RMI-SPLIT-/);

const consumed = applyRawMaterialTraceabilityAction({
  action: "confirm_consumption",
  before: issued,
  body: { rollId: "ROLL-1-S01", consumedWeightKg: 20, machineId: "BAG-01" },
  now: "2026-09-02T02:01:00.000Z",
  ...common,
});
assert.equal(consumed.status, "部分消耗确认");
assert.equal(consumed.rolls[1].weightKg, 40);
assert.equal(consumed.rolls[1].inventoryStatus, "机边领用");
assert.equal(consumed.rawMaterialConsumptionRecords[0].consumedWeightKg, 20);
assert.equal(consumed.rawMaterialIssueRecords[0].remainingMachineSideWeightKg, 40);

const returned = applyRawMaterialTraceabilityAction({
  action: "return_leftover",
  before: consumed,
  body: { rollId: "ROLL-1-S01", returnLocation: "余料区" },
  now: "2026-09-02T02:02:00.000Z",
  ...common,
});
assert.equal(returned.status, "余料待复核");
assert.equal(returned.rolls[1].inventoryStatus, "余料待复核");
assert.equal(returned.rawMaterialLeftoverReturnRecords[0].leftoverWeightKg, 40);

const reviewed = applyRawMaterialTraceabilityAction({
  action: "review_leftover",
  before: returned,
  body: { rollId: "ROLL-1-S01", reviewLocation: "原料库-余料可用区" },
  now: "2026-09-02T02:03:00.000Z",
  ...common,
});
assert.equal(reviewed.status, "余料已复核/可用");
assert.equal(reviewed.rolls[1].inventoryStatus, "可用");
assert.equal(reviewed.rolls[1].weightKg, 40);
assert.equal(reviewed.rawMaterialLeftoverReturnRecords[0].reviewStatus, "复核通过/可用");
assert.match(reviewed.rawMaterialLeftoverReviewRecords[0].leftoverReviewRecordId, /^RMI-LREV-/);

console.log("Raw-material traceability action checks passed: routing isolation, input immutability, split issue, partial consumption, return, and review are covered.");
