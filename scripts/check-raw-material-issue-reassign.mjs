// 负责人 2026-11-08：布照样整卷领；订单改了 / 领错单时，机边这卷剩下的料转挂到实际做的订单，
// 之后的消耗和成本算新订单，不算到原来那单；已经确认用掉的部分仍算原来那单。
import assert from "node:assert/strict";
import { applyRawMaterialTraceabilityAction } from "../server/rawMaterialTraceabilityActionService.mjs";
import { createRawMaterialCostMarginBuilder } from "../server/rawMaterialCostMarginBuilderService.mjs";
import { assertConsumptionProductionCurrent, newConsumptionAssociations } from "../server/rawMaterialConsumptionProductionGuard.mjs";
import { toRawMaterialInboundActionSlug } from "../shared/rawMaterialInboundActionSlugs.js";

const workspace = {
  productionTasks: [
    { productionTaskId: "PT-A", id: "PT-A", orderLineId: "OL-A", machineId: "BAG-01", taskType: "制袋", taskStatus: "制袋中", plannedQty: 1000 },
    { productionTaskId: "PT-B", id: "PT-B", orderLineId: "OL-B", machineId: "BAG-01", taskType: "制袋", taskStatus: "制袋中", plannedQty: 2000 },
    { productionTaskId: "PT-X", id: "PT-X", orderLineId: "OL-X", machineId: "BAG-01", taskType: "制袋", taskStatus: "已作废", plannedQty: 500 },
  ],
  orderLines: [
    { id: "OL-A", orderLineId: "OL-A", customerId: "C1", productName: "空白袋", size: "30*37*10", bagColor: "大红", qty: 1000, lineStatus: "制袋中", amount: 400 },
    { id: "OL-B", orderLineId: "OL-B", customerId: "C1", productName: "空白袋", size: "30*37*10", bagColor: "大红", qty: 2000, lineStatus: "制袋中", amount: 800 },
    { id: "OL-X", orderLineId: "OL-X", customerId: "C1", productName: "空白袋", size: "30*37*10", bagColor: "大红", qty: 500, lineStatus: "已作废", amount: 200 },
  ],
  customers: [{ id: "C1", name: "客户甲" }],
};
const inbound = {
  id: "RMI-RE-1", materialType: "无纺布", productName: "大红无纺布", spec: "30g", factoryColor: "大红", unit: "kg", unitPrice: 2,
  rolls: [{ id: "ROLL-1", supplierRollNo: "S-1", weightKg: 100, labelStatus: "已贴标/可用库存", inventoryStatus: "可用", location: "原料库-可用区" }],
};
const common = { workspace, operatorId: "U-WORKER", operatorName: "制袋工" };
assert.equal(toRawMaterialInboundActionSlug("转挂订单"), "reassign-issue");

// 1) 整卷领给 A 单，用了 20kg
const issued = applyRawMaterialTraceabilityAction({ action: "issue_to_machine", before: inbound, body: { rollId: "ROLL-1", machineId: "BAG-01", productionTaskId: "PT-A" }, now: "2026-11-12T01:00:00.000Z", ...common });
assert.equal(issued.rolls[0].productionTaskOrderLineId, "OL-A");
const usedForA = applyRawMaterialTraceabilityAction({ action: "confirm_consumption", before: issued, body: { rollId: "ROLL-1", consumedWeightKg: 20 }, now: "2026-11-12T02:00:00.000Z", ...common });
assert.equal(usedForA.rolls[0].weightKg, 80);

// 2) 拒绝：没写原因、挂回同一单、挂到作废单、不在机边的卷
const reassign = (before, body) => applyRawMaterialTraceabilityAction({ action: "reassign_issue", before, body, now: "2026-11-12T03:00:00.000Z", ...common });
assert.throws(() => reassign(usedForA, { rollId: "ROLL-1", productionTaskId: "PT-B" }), { code: "RAW_MATERIAL_REASSIGN_REASON_REQUIRED" });
assert.throws(() => reassign(usedForA, { rollId: "ROLL-1", productionTaskId: "PT-A", reason: "试" }), { code: "RAW_MATERIAL_REASSIGN_SAME_TASK" });
assert.throws(() => reassign(usedForA, { rollId: "ROLL-1", productionTaskId: "PT-X", reason: "试" }), { code: "ERP_RAW_MATERIAL_PRODUCTION_CONFLICT" });
assert.throws(() => reassign(inbound, { rollId: "ROLL-1", productionTaskId: "PT-B", reason: "试" }), { code: "RAW_MATERIAL_REASSIGN_REQUIRES_MACHINE_SIDE_ROLL" });

// 3) A 单改了，剩下 80kg 转挂到 B 单
const before = structuredClone(usedForA);
const moved = reassign(usedForA, { rollId: "ROLL-1", productionTaskId: "PT-B", reason: "A 单客户减量，剩下的布做 B 单" });
assert.deepEqual(usedForA, before, "不改输入");
const [oldIssue, newIssue] = moved.rawMaterialIssueRecords;
assert.equal(oldIssue.consumptionStatus, "已转挂");
assert.equal(oldIssue.reassignedToIssueRecordId, newIssue.issueRecordId);
assert.equal(oldIssue.reassignedWeightKg, 80);
assert.equal(newIssue.issueMode, "转挂订单");
assert.equal(newIssue.productionTaskId, "PT-B");
assert.equal(newIssue.productionTaskOrderLineId, "OL-B");
assert.equal(newIssue.issuedWeightKg, 80);
assert.equal(newIssue.previousOrderLineId, "OL-A");
assert.equal(moved.rolls[0].issueRecordId, newIssue.issueRecordId);
assert.equal(moved.rolls[0].inventoryStatus, "机边领用");
assert.equal(moved.rolls[0].weightKg, 80, "转挂不改重量");
assert.deepEqual(moved.rawMaterialConsumptionRecords, usedForA.rawMaterialConsumptionRecords, "已经用掉的 20kg 不动");

// 转挂要在事务里核对新订单还有效；新订单作废了就拒绝
assert.deepEqual(newConsumptionAssociations(usedForA, moved), [{ taskId: "PT-B", orderLineId: "OL-B" }]);
assert.doesNotThrow(() => assertConsumptionProductionCurrent(workspace, usedForA, moved));
const voidedB = { ...workspace, orderLines: workspace.orderLines.map((line) => line.id === "OL-B" ? { ...line, lineStatus: "已作废" } : line) };
assert.throws(() => assertConsumptionProductionCurrent(voidedB, usedForA, moved), { code: "ERP_RAW_MATERIAL_PRODUCTION_CONFLICT" });

// 4) 转挂后不能再按 A 单确认消耗；按 B 单把剩下 80kg 用完
assert.throws(() => applyRawMaterialTraceabilityAction({ action: "confirm_consumption", before: moved, body: { rollId: "ROLL-1", productionTaskId: "PT-A" }, now: "2026-11-12T04:00:00.000Z", ...common }), { code: "RAW_MATERIAL_ISSUE_ASSIGNMENT_CONFLICT" });
const usedForB = applyRawMaterialTraceabilityAction({ action: "confirm_consumption", before: moved, body: { rollId: "ROLL-1" }, now: "2026-11-12T04:00:00.000Z", ...common });
assert.equal(usedForB.rolls[0].inventoryStatus, "已消耗");
const consB = usedForB.rawMaterialConsumptionRecords.at(-1);
assert.equal(consB.issueRecordId, newIssue.issueRecordId);
assert.equal(consB.productionTaskId, "PT-B");
assert.equal(consB.consumedWeightKg, 80);

// 5) 成本：20kg 算 A 单，80kg 算 B 单
const builder = createRawMaterialCostMarginBuilder({
  findProductionTask: (w, id) => w.productionTasks.find((row) => row.productionTaskId === id) ?? null,
  findOrderLine: (w, id) => w.orderLines.find((row) => row.id === id) ?? null,
  findCustomer: (w, id) => w.customers.find((row) => row.id === id) ?? null,
  buildGoodsSpec: (task, line) => `${line.size} ${line.bagColor}`,
});
const drafts = builder.buildCostAllocationDrafts({ inbound: usedForB, workspace, now: "2026-11-12T05:00:00.000Z", operatorId: "U-COST", operatorName: "成本", issueRecords: usedForB.rawMaterialIssueRecords, consumptionRecords: usedForB.rawMaterialConsumptionRecords }).drafts;
const byLine = Object.fromEntries(drafts.map((row) => [row.orderLineId, row.allocatedWeightKg]));
assert.deepEqual(byLine, { "OL-A": 20, "OL-B": 80 }, JSON.stringify(drafts));

// 6) 还没用就发现领错单：整卷 100kg 全部转挂，A 单一点不算
const wrong = reassign(issued, { rollId: "ROLL-1", productionTaskId: "PT-B", reason: "领错单" });
const allB = applyRawMaterialTraceabilityAction({ action: "confirm_consumption", before: wrong, body: { rollId: "ROLL-1" }, now: "2026-11-12T04:00:00.000Z", ...common });
const wrongDrafts = builder.buildCostAllocationDrafts({ inbound: allB, workspace, now: "2026-11-12T05:00:00.000Z", issueRecords: allB.rawMaterialIssueRecords, consumptionRecords: allB.rawMaterialConsumptionRecords }).drafts;
assert.deepEqual(wrongDrafts.map((row) => [row.orderLineId, row.allocatedWeightKg]), [["OL-B", 100]]);

console.log("raw material reassign ok: 机边剩余卷料转挂到实际订单，已用部分仍算原单，之后的消耗和成本算新单；要写原因，不能挂到作废单或同一单");

// 7) 页面上可选的订单：同颜色、还在做的，不含当前这单和作废单
const { buildReassignCandidates } = await import("../docs/prototypes/raw-material-roll-inventory-review/src/rawMaterialReassignCandidates.js");
const options = buildReassignCandidates({ roll: { ...issued.rolls[0], factoryColor: "大红" }, productionTasks: workspace.productionTasks,
  orderLines: [...workspace.orderLines, { id: "OL-W", orderLineId: "OL-W", bagColor: "白色", qty: 1, lineStatus: "制袋中" }] });
assert.deepEqual(options.map((row) => row.productionTaskId), ["PT-B"]);
console.log("reassign candidates ok: 只列同颜色、还在做的订单");
