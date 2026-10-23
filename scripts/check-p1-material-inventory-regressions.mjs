import assert from "node:assert/strict";
import { applyRawMaterialInboundAction } from "../server/services/rawMaterialInboundCommandService.mjs";
import { createRawMaterialCostMarginBuilder } from "../server/rawMaterialCostMarginBuilderService.mjs";
import { applyRawMaterialCostMarginLocalAction } from "../src/domain/rawMaterialCostMarginLocalActions.js";
import { evaluateRawMaterialOneClickInbound } from "../src/domain/rawMaterialWholeRollPolicy.js";
import { mergeRawMaterialCurrentInbound } from "../shared/rawMaterialCurrentInbound.js";

const now = "2026-10-23T00:00:00.000Z";
const roll = { id: "MIX-02", ocrLineId: "LINE-02", weightKg: 100, factoryColor: "宝蓝", spec: "78*90*1300", widthCm: 90, materialType: "无纺布", productName: "宝蓝布料", unitPrice: 7, unit: "kg", inventoryStatus: "可用", labelStatus: "已贴标/可用库存" };
const inbound = { id: "MIX", revision: 1, status: "已贴标/可用库存", supplierName: "测试厂家", materialType: "无纺布", productName: "白色布料", factoryColor: "白色", spec: "78*80*1300", widthCm: 80, unitPrice: 2, unit: "kg", rollCount: 1, totalWeightKg: 100, rolls: [roll] };
const act = (before, action, body = {}, context = {}) => applyRawMaterialInboundAction({ workspace: { ...context, rawMaterialInbounds: [before] }, inboundId: before.id, action, body: { expectedRevision: before.revision, ...body }, operatorId: "U-OFFICE-A", serverNow: now }).inbound;
const issued = act(inbound, "issue_to_machine", { rollId: roll.id, machineId: "1号机" });
assert.equal(issued.rolls[0].inventoryStatus, "机边领用");
for (const state of ["机边领用", "部分消耗确认", "已消耗", "余料待复核", "供应商退货暂存", "已退厂"]) {
  for (const [action, labelStatus] of [["reprint_label", "标签已作废/待重打"], ["void_label", "标签或实物不符/待确认"], ["attach_confirm", "已打印待贴标"]]) {
    const source = { ...issued, rolls: [{ ...issued.rolls[0], inventoryStatus: state, labelStatus }] };
    const snapshot = structuredClone(source);
    assert.throws(() => act(source, action, { rollId: roll.id, matchResult: "matched" }), (error) => error.statusCode === 409, `${state} must not return to inventory via ${action}`);
    assert.deepEqual(source, snapshot);
    assert.equal(evaluateRawMaterialOneClickInbound(source).allowed, false);
  }
}
for (const labelStatus of ["待人工复核", "标签待补打", "已打印待贴标", "已贴标/可用库存", "标签或实物不符/待确认", "标签已作废/待重打"]) {
  for (const action of ["void_label", "reprint_label"]) {
    if (action === "void_label" && labelStatus === "标签或实物不符/待确认" || action === "reprint_label" && labelStatus === "标签已作废/待重打") continue;
    const candidate = { ...inbound, rolls: [{ ...roll, inventoryStatus: "待确认", labelStatus }] };
    assert.throws(() => act(candidate, action, { rollId: roll.id }), (error) => error.code === (action === "void_label" ? "RAW_MATERIAL_LABEL_VOID_REQUIRES_MISMATCH" : "RAW_MATERIAL_LABEL_REPRINT_REQUIRES_VOIDED_LABEL"));
  }
}
let corrected = { ...inbound, rolls: [{ ...roll, inventoryStatus: "待确认", labelStatus: "标签或实物不符/待确认", labelVersion: 1 }] };
corrected = act(corrected, "void_label", { rollId: roll.id, reason: "重核颜色" });
corrected = act(corrected, "reprint_label", { rollId: roll.id });
assert.equal(corrected.rolls[0].labelVersion, 2);
assert.throws(() => act(corrected, "attach_confirm", { rollId: roll.id, expectedLabelVersion: 1, matchResult: "matched" }), error => error.code === "RAW_MATERIAL_LABEL_VERSION_CONFLICT");
assert.throws(() => act(corrected, "attach_confirm", { rollId: roll.id, expectedLabelVersion: 2, matchResult: "matched", checkedWeightKg: 99 }), error => error.code === "RAW_MATERIAL_LABEL_FACTS_MISMATCH");
assert.throws(() => act(corrected, "attach_confirm", { rollId: roll.id, expectedLabelVersion: 2, matchResult: "matched", checkedColor: "" }), error => error.code === "RAW_MATERIAL_LABEL_FACTS_MISMATCH");
corrected = act(corrected, "attach_confirm", { rollId: roll.id, expectedLabelVersion: corrected.rolls[0].labelVersion, matchResult: "matched" });
assert.equal(corrected.rolls[0].inventoryStatus, "可用");

const consumed = act(issued, "confirm_consumption", { rollId: roll.id, consumedWeightKg: 20 });
for (const record of [issued.rawMaterialIssueRecords[0], consumed.rawMaterialConsumptionRecords[0]]) {
  for (const field of ["factoryColor", "spec", "productName", "materialType"]) assert.equal(record[field], roll[field]);
}
assert.equal(consumed.rolls[0].weightKg, 80);
assert.equal(consumed.rolls[0].inventoryStatus, "机边领用");
const taskWorkspace = { productionTasks: [{ id: "PT", productionTaskId: "PT", orderLineId: "OL", machineId: "1号机", plannedQty: 1000 }], orderLines: [{ id: "OL", productName: "无纺布袋", bagColor: "宝蓝", size: "30*38*8", qty: 1000 }] };
const taskIssued = act(inbound, "issue_to_machine", { rollId: roll.id, machineId: "1号机", productionTaskId: "PT" }, taskWorkspace);
assert.equal(taskIssued.rawMaterialIssueRecords[0].productionTaskMatchStatus, "已匹配");
assert.throws(() => act(inbound, "issue_to_machine", { rollId: roll.id, machineId: "1号机", productionTaskId: "PT" }, { ...taskWorkspace, orderLines: [{ ...taskWorkspace.orderLines[0], bagColor: "白色" }] }), (error) => error.code === "RAW_MATERIAL_PRODUCTION_TASK_COLOR_MISMATCH");

const builder = createRawMaterialCostMarginBuilder({ findProductionTask: () => taskWorkspace.productionTasks[0], findOrderLine: () => taskWorkspace.orderLines[0], findCustomer: () => null, buildGoodsSpec: () => "测试规格" });
const issue = { ...taskIssued.rawMaterialIssueRecords[0], productionTaskOrderLineId: "OL" };
const consumption = { ...consumed.rawMaterialConsumptionRecords[0], issueRecordId: issue.issueRecordId, productionTaskId: "PT" };
for (const [pricingUnit, price] of [["kg", 7], ["吨", 7000]]) {
  const source = { ...consumed, rolls: [{ ...consumed.rolls[0], unit: pricingUnit, unitPrice: price }], rawMaterialIssueRecords: [issue], rawMaterialConsumptionRecords: [consumption] };
  const formal = builder.buildCostAllocationDrafts({ inbound: source, workspace: taskWorkspace, issueRecords: [issue], consumptionRecords: [consumption], now });
  const local = applyRawMaterialCostMarginLocalAction(source, { action: "生成成本草稿", now });
  for (const draft of [formal.drafts[0], local.rawMaterialCostAllocationDrafts[0]]) {
    assert.equal(draft.allocatedCostAmount, 140);
    assert.equal(draft.factoryColor, "宝蓝");
    assert.equal(draft.spec, roll.spec);
    assert.equal(draft.unitPrice, price);
    assert.equal(draft.unit, pricingUnit);
  }
}
for (const invalidRoll of [{ ...roll, unitPrice: 0 }, { ...roll, unit: "米" }]) {
  const invalid = builder.buildCostAllocationDrafts({ inbound: { ...inbound, rolls: [invalidRoll] }, workspace: taskWorkspace, issueRecords: [issue], consumptionRecords: [consumption], now });
  assert.equal(invalid.drafts.length, 0, "An OCR roll cannot borrow the header price or guess an unsupported unit");
}
const current = [{ id: "A", revision: 4 }, { id: "B", revision: 2 }];
assert.deepEqual(mergeRawMaterialCurrentInbound(current, { id: "A", revision: 2 }), current);
assert.deepEqual(mergeRawMaterialCurrentInbound(current, { id: "B", revision: 3 }).map((row) => row.revision), [4, 3]);
console.log("P1 material regressions passed: label-state isolation/recovery, whole-roll conservation, exact roll task/trace facts, roll-specific kg/ton cost and monotonic receipt merges.");

{
  const clock = Date.now;
  Date.now = () => 1792713600000;
  try {
    const results = ["CLOCK-A", "CLOCK-B"].map((id) => applyRawMaterialInboundAction({
      workspace: { rawMaterialInbounds: [{ ...inbound, id }] }, inboundId: id, action: "issue_to_machine",
      body: { expectedRevision: 1, rollId: roll.id, machineId: "1号机" }, operatorId: "U-OFFICE-A", serverNow: now,
    }));
    assert.notEqual(results[0].operationLog.id, results[1].operationLog.id);
    assert.notEqual(results[0].inbound.rawMaterialIssueRecords[0].issueRecordId, results[1].inbound.rawMaterialIssueRecords[0].issueRecordId);
  } finally { Date.now = clock; }
}
