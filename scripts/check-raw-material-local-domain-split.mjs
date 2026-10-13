import assert from "node:assert/strict";
import { applyRawMaterialInboundLocalAction } from "../src/domain/rawMaterialInboundLocalActions.js";
import {
  applyRawMaterialCostMarginLocalAction,
  buildRawMaterialCostMarginToastText,
} from "../src/domain/rawMaterialCostMarginLocalActions.js";

const baseInbound = {
  id: "RMI-DOMAIN-SPLIT",
  supplierName: "领域拆分供应商",
  deliveryNoteNo: "DN-DOMAIN-SPLIT",
  materialType: "无纺布",
  productName: "白色无纺布",
  spec: "80g",
  factoryColor: "本白",
  unit: "kg",
  unitPrice: 9,
  rawMaterialIssueRecords: [{
    issueRecordId: "ISS-DOMAIN-SPLIT",
    rollId: "ROLL-DOMAIN-SPLIT",
    productionTaskId: "PT-DOMAIN-SPLIT",
    productionTaskOrderLineId: "OL-DOMAIN-SPLIT",
    productionTaskMachineId: "BAG-01",
    productionTaskGoodsSpec: "白色袋料 30*38",
    productionTaskMatchStatus: "已匹配",
  }],
  rawMaterialConsumptionRecords: [{
    consumptionRecordId: "CONS-DOMAIN-SPLIT",
    issueRecordId: "ISS-DOMAIN-SPLIT",
    rollId: "ROLL-DOMAIN-SPLIT",
    consumedWeightKg: 30,
    consumedQuantity: 0,
    unit: "kg",
  }],
};
const originalInbound = structuredClone(baseInbound);
const commonInput = {
  now: "2026-07-14T10:00:00.000Z",
  operatorName: "成本复核A",
  customers: [{ id: "C-DOMAIN-SPLIT", name: "领域拆分客户" }],
  orderLines: [{
    id: "OL-DOMAIN-SPLIT",
    orderNo: "ORD-DOMAIN-SPLIT",
    customerId: "C-DOMAIN-SPLIT",
    productName: "白色活动袋",
    size: "30*38",
    color: "白色",
    qty: 1_000,
    amount: 1_000,
  }],
};

assert.equal(
  applyRawMaterialCostMarginLocalAction(baseInbound, { ...commonInput, action: "机边领料" }),
  null,
  "traceability actions must not enter the cost/margin state machine",
);
assert.equal(
  applyRawMaterialCostMarginLocalAction({ ...baseInbound, rawMaterialIssueRecords: [] }, { ...commonInput, action: "生成成本草稿" }),
  null,
  "an ineligible cost action must report no update instead of fabricating a draft",
);

const drafted = applyRawMaterialCostMarginLocalAction(baseInbound, {
  ...commonInput,
  action: "生成成本草稿",
});
assert.equal(drafted.rawMaterialCostAllocationDrafts.length, 1);
assert.equal(drafted.rawMaterialCostAllocationDrafts[0].allocatedCostAmount, 270);
assert.equal(drafted.rawMaterialCostAllocationDrafts[0].marginEffect, "none");
assert.deepEqual(baseInbound, originalInbound, "cost actions must not mutate their input projection");

const dispatchedDraft = applyRawMaterialInboundLocalAction([baseInbound], {
  ...commonInput,
  inboundId: baseInbound.id,
  action: "生成成本草稿",
});
assert.equal(
  dispatchedDraft.updatedItem.rawMaterialCostAllocationDrafts[0].allocatedCostAmount,
  270,
  "the inbound entrypoint must delegate cost actions to the cost/margin state machine",
);
assert.deepEqual(
  dispatchedDraft.items[0],
  dispatchedDraft.updatedItem,
  "the delegated result must replace only the targeted inbound projection",
);

const traced = applyRawMaterialInboundLocalAction([{
  ...baseInbound,
  rolls: [{
    id: "ROLL-DOMAIN-SPLIT",
    inventoryStatus: "可用",
    currentWeightKg: 40,
    weightKg: 40,
  }],
}], {
  ...commonInput,
  inboundId: baseInbound.id,
  action: "机边领料",
  options: {
    rollId: "ROLL-DOMAIN-SPLIT",
    machineId: "BAG-01",
    productionTaskId: "PT-DOMAIN-SPLIT",
    productionTaskOrderLineId: "OL-DOMAIN-SPLIT",
  },
});
assert.equal(traced.updatedItem.rolls[0].inventoryStatus, "机边领用");
assert.equal(
  traced.updatedItem.rawMaterialCostAllocationDrafts?.length ?? 0,
  0,
  "traceability actions must not create cost/margin records",
);

const confirmed = applyRawMaterialCostMarginLocalAction(drafted, {
  ...commonInput,
  action: "确认成本草稿",
});
assert.equal(confirmed.rawMaterialCostAllocationConfirmations[0].confirmedCostAmount, 270);
assert.equal(confirmed.rawMaterialCostAllocationDrafts[0].costEffect, "confirmed_material_cost_snapshot");

const calibrated = applyRawMaterialCostMarginLocalAction(confirmed, {
  ...commonInput,
  action: "校准损耗",
  options: { expectedOutputQuantity: 1_000, actualQualifiedOutputQuantity: 950 },
});
assert.equal(calibrated.rawMaterialCostLossCalibrations[0].lossRatePercent, 5);
assert.equal(calibrated.rawMaterialCostLossCalibrations[0].marginEffect, "pending_margin_snapshot");

const snapshotted = applyRawMaterialCostMarginLocalAction(calibrated, {
  ...commonInput,
  action: "生成毛利快照",
});
assert.equal(snapshotted.rawMaterialOrderMarginSnapshots[0].totalSalesAmount, 1_000);
assert.equal(snapshotted.rawMaterialOrderMarginSnapshots[0].totalMaterialCostAmount, 270);
assert.equal(snapshotted.rawMaterialOrderMarginSnapshots[0].grossProfitAmount, 730);

const reviewed = applyRawMaterialCostMarginLocalAction(snapshotted, {
  ...commonInput,
  action: "复核毛利快照",
});
assert.equal(reviewed.rawMaterialOrderMarginReports[0].grossProfitAmount, 730);
assert.equal(reviewed.rawMaterialOrderMarginReports[0].marginEffect, "reviewed_margin_report_snapshot");
assert.equal(reviewed.nextStep.includes("客户对账和最终收款结算仍走独立流程"), true);

assert.match(
  buildRawMaterialCostMarginToastText("校准损耗", "DN-DOMAIN-SPLIT", { lossRatePercent: 5 }),
  /损耗率 5%/,
);
assert.equal(buildRawMaterialCostMarginToastText("机边领料", "DN-DOMAIN-SPLIT"), "");

console.log("Raw-material local domain split check passed: traceability and cost/margin state machines are isolated with the full cost review chain preserved.");
