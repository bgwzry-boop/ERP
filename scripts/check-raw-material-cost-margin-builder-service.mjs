import assert from "node:assert/strict";
import { createRawMaterialCostMarginBuilder } from "../server/rawMaterialCostMarginBuilderService.mjs";
assert.throws(() => createRawMaterialCostMarginBuilder(), /requires findProductionTask/);

const workspace = {
  productionTasks: [{ id: "TASK-1", plannedQty: 1_000 }],
  orderLines: [
    {
      id: "LINE-1",
      customerId: "CUST-1",
      orderNo: "ORD-1",
      productName: "无纺布袋",
      size: "30*38",
      bagColor: "白",
      qty: 1_000,
      amount: 800,
    },
  ],
  customers: [{ id: "CUST-1", name: "客户A" }],
};
const cleanText = (value) => String(value ?? "").trim();
const builder = createRawMaterialCostMarginBuilder({
  findProductionTask: (targetWorkspace, id) => targetWorkspace.productionTasks.find((record) => record.id === cleanText(id)) ?? null,
  findOrderLine: (targetWorkspace, id) => targetWorkspace.orderLines.find((record) => record.id === cleanText(id)) ?? null,
  findCustomer: (targetWorkspace, id) => targetWorkspace.customers.find((record) => record.id === cleanText(id)) ?? null,
  buildGoodsSpec: (task, line) => [line.productName || "生产任务", line.size, line.bagColor, task.plannedQty ? `${task.plannedQty}个` : ""].filter(Boolean).join(" "),
});
const inbound = {
  id: "RMI-1",
  supplierName: "原料供应商",
  deliveryNoteNo: "SN-1",
  materialType: "无纺布",
  productName: "白色无纺布",
  spec: "30g",
  factoryColor: "白",
  unit: "kg",
  unitPrice: 2,
};
const now = "2026-07-16T10:30:00.000Z";
const draftResult = builder.buildCostAllocationDrafts({
  inbound,
  workspace,
  now,
  operatorName: "成本复核",
  operatorId: "U-COST",
  issueRecords: [
    {
      id: "ISSUE-1",
      inboundId: "RMI-1",
      rollId: "ROLL-1",
      productionTaskId: "TASK-1",
      productionTaskOrderLineId: "LINE-1",
      productionTaskMachineId: "BAG-01",
      productionTaskMatchStatus: "已匹配",
    },
  ],
  consumptionRecords: [{ id: "CONS-1", inboundId: "RMI-1", issueRecordId: "ISSUE-1", rollId: "ROLL-1", consumedWeightKg: 6 }],
});
assert.equal(draftResult.drafts.length, 1);
assert.equal(draftResult.drafts[0].allocatedCostAmount, 12);
assert.equal(draftResult.drafts[0].allocationStatus, "草稿/待成本复核");
assert.equal(draftResult.drafts[0].productionTaskGoodsSpec, "无纺布袋 30*38 白 1000个");
assert.match(draftResult.drafts[0].costAllocationDraftId, /^RMCA-20260716-/);

const confirmation = builder.buildCostAllocationConfirmation({
  inbound,
  drafts: draftResult.drafts,
  now,
  operatorName: "成本复核",
  operatorId: "U-COST",
});
assert.equal(confirmation.confirmedCount, 1);
assert.equal(confirmation.confirmedCostAmount, 12);
assert.equal(confirmation.reviewStatus, "已复核/待损耗校准");

const calibration = builder.buildCostLossCalibration({
  inbound,
  confirmations: [confirmation],
  drafts: draftResult.drafts,
  body: { expectedOutputQuantity: 1_000, actualQualifiedOutputQuantity: 950 },
  now,
  operatorName: "成本复核",
  operatorId: "U-COST",
});
assert.equal(calibration.lossQuantity, 50);
assert.equal(calibration.lossRatePercent, 5);
assert.equal(calibration.marginEffect, "pending_margin_snapshot");

const snapshot = builder.buildOrderMarginSnapshot({
  inbound,
  workspace,
  calibrations: [calibration],
  confirmations: [confirmation],
  drafts: draftResult.drafts,
  now,
  operatorName: "财务复核",
  operatorId: "U-FINANCE",
});
assert.equal(snapshot.lineItems.length, 1);
assert.equal(snapshot.lineItems[0].customerName, "客户A");
assert.equal(snapshot.totalSalesAmount, 800);
assert.equal(snapshot.totalMaterialCostAmount, 12);
assert.equal(snapshot.grossProfitAmount, 788);
assert.equal(snapshot.reviewStatus, "已生成/待财务复核");

const report = builder.buildOrderMarginReport({
  inbound,
  snapshots: [snapshot],
  now,
  operatorName: "财务复核",
  operatorId: "U-FINANCE",
});
assert.equal(report.lineItems.length, 1);
assert.equal(report.grossProfitAmount, 788);
assert.equal(report.reviewStatus, "已财务复核/报表可用");
assert.equal(report.marginEffect, "reviewed_margin_report_snapshot");

console.log(
  "Raw-material cost/margin builder service check passed: injected lookups, draft-to-report contracts, and material-only margin boundaries are covered.",
);
