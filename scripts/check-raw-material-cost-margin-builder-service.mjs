import {canGenerateRawMaterialCostDraft} from "../src/features/raw-materials/rawMaterialInboundWorkflow.js";
import {rawMaterialDraftCostAmount} from "../shared/rawMaterialMarginCostCoverage.js";
import { normalizeRawMaterialInbound as normalizeClientInbound } from "../src/services/officeRawMaterialInboundNormalizer.js";
import { normalizeRawMaterialOrderMarginSnapshots, normalizeRawMaterialOrderMarginReports } from "../server/rawMaterialCostMarginRecordNormalizer.mjs";
import { applyRawMaterialCostMarginLocalAction } from "../src/domain/rawMaterialCostMarginLocalActions.js";
import { rawMaterialConsumptionCostBasis } from "../shared/rawMaterialConsumptionCostBasis.js";
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

for (const record of [{}, {consumedWeightKg:0,consumedQuantity:0}, {consumedWeightKg:-1,consumedQuantity:1}, {consumedWeightKg:Infinity}]) assert.equal(rawMaterialConsumptionCostBasis(record,2),null);
for (const price of [-1,0,Infinity]) assert.equal(rawMaterialConsumptionCostBasis({consumedWeightKg:6},price),null);
assert.deepEqual(rawMaterialConsumptionCostBasis({consumedWeightKg:0,consumedQuantity:1},2),{allocatedWeightKg:0,allocatedQuantity:1,allocatedCostAmount:2});
const missingMeasured = builder.buildCostAllocationDrafts({inbound,workspace,now,issueRecords:[{issueRecordId:'ISSUE-EMPTY',rollId:'ROLL-EMPTY',productionTaskId:'TASK-1',productionTaskOrderLineId:'LINE-1',productionTaskMatchStatus:'已匹配'}],consumptionRecords:[{consumptionRecordId:'CONS-EMPTY',issueRecordId:'ISSUE-EMPTY',rollId:'ROLL-EMPTY',consumedWeightKg:0,consumedQuantity:0}]});
assert.equal(missingMeasured.drafts.length,0,'A missing measurement must not become an invented one-piece cost');
assert.match(missingMeasured.warnings.join(' '),/CONS-EMPTY/);

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
const confirmedDrafts=draftResult.drafts.map(draft=>({...draft,costConfirmationId:confirmation.costConfirmationId,confirmedCostAmount:draft.allocatedCostAmount}));

for (const body of [{}, {expectedOutputQuantity:100}, {expectedOutputQuantity:'',actualQualifiedOutputQuantity:95}, {expectedOutputQuantity:100,actualQualifiedOutputQuantity:-1}, {expectedOutputQuantity:Infinity,actualQualifiedOutputQuantity:95}]) {
  assert.throws(() => builder.buildCostLossCalibration({inbound, confirmations:[confirmation], drafts:confirmedDrafts, now, body}), error => error.code === 'RAW_MATERIAL_LOSS_MEASUREMENT_REQUIRED');
}

const calibration = builder.buildCostLossCalibration({
  inbound,
  confirmations: [confirmation],
  drafts: confirmedDrafts,
  body: { expectedOutputQuantity: 1_000, actualQualifiedOutputQuantity: 950 },
  now,
  operatorName: "成本复核",
  operatorId: "U-COST",
});
assert.equal(builder.buildCostLossCalibration({inbound, confirmations:[confirmation], drafts:confirmedDrafts, now, body:{expectedOutputQuantity:100,actualQualifiedOutputQuantity:0}}).lossQuantity,100,'Explicit zero actual output is different from missing input');
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

const secondDraft = {...draftResult.drafts[0], costAllocationDraftId:'DRAFT-SECOND', consumptionRecordId:'CONS-SECOND', orderLineId:'LINE-2', allocatedCostAmount:8};
const twoLineInput = {inbound,workspace:{...workspace,orderLines:[...workspace.orderLines,{id:'LINE-2',amount:200}]},drafts:[...draftResult.drafts,secondDraft],calibrations:[{...calibration,costAllocationDraftIds:[draftResult.drafts[0].costAllocationDraftId,'DRAFT-SECOND'],orderLineIds:['LINE-1','LINE-2'],confirmedCostAmount:20}],confirmations:[confirmation],now};
const twoLines = builder.buildOrderMarginSnapshot(twoLineInput);
assert.equal(twoLines.totalMaterialCostAmount,20);
assert.deepEqual(twoLines.lineItems.map(line=>line.materialCostAmount),[12,8]);
for (const changed of [
 {drafts:draftResult.drafts},
 {calibrations:[{...twoLineInput.calibrations[0],confirmedCostAmount:21}]},
 {calibrations:[{...calibration,orderLineIds:['LINE-1','LINE-2']}]},
 {drafts:[...twoLineInput.drafts,secondDraft]},
 {calibrations:[calibration,{...calibration,lossCalibrationId:'DUPLICATE-SOURCE'}]},
]) {
 assert.throws(()=>builder.buildOrderMarginSnapshot({...twoLineInput,...changed}),error=>error.code==='RAW_MATERIAL_MARGIN_COST_TRACE_INVALID','Missing, duplicated or mismatched cost must not be evenly invented');
}
const localMarginInput={...inbound,rawMaterialCostLossCalibrations:twoLineInput.calibrations,rawMaterialCostAllocationDrafts:twoLineInput.drafts,rawMaterialCostAllocationConfirmations:[confirmation]};
const localMargin=applyRawMaterialCostMarginLocalAction(localMarginInput,{action:'生成毛利快照',now,orderLines:twoLineInput.workspace.orderLines,customers:workspace.customers});
assert.equal(localMargin.rawMaterialOrderMarginSnapshots[0].totalMaterialCostAmount,20);
assert.equal(applyRawMaterialCostMarginLocalAction({...localMarginInput,rawMaterialCostAllocationDrafts:draftResult.drafts},{action:'生成毛利快照',now,orderLines:twoLineInput.workspace.orderLines}),null,'Local preview cannot invent missing cost either');

const zeroRevenueLines=twoLineInput.workspace.orderLines.map(line=>line.id==='LINE-1'?{...line,amount:0,finalAmount:800}:line);
const zeroRevenueLocal=applyRawMaterialCostMarginLocalAction(localMarginInput,{action:'生成毛利快照',now,orderLines:zeroRevenueLines});
assert.equal(zeroRevenueLocal.rawMaterialOrderMarginSnapshots[0].totalSalesAmount,200,'Explicit zero revenue cannot be replaced by an old positive amount');
assert.equal(builder.buildOrderMarginSnapshot({...twoLineInput,workspace:{...workspace,orderLines:zeroRevenueLines}}).totalSalesAmount,200);

const zeroCost = builder.buildOrderMarginSnapshot({...twoLineInput,drafts:[...draftResult.drafts,{...secondDraft,allocatedCostAmount:0}],calibrations:[{...twoLineInput.calibrations[0],confirmedCostAmount:12}]});
assert.deepEqual(zeroCost.lineItems.map(line=>line.materialCostAmount),[12,0],'A zero-cost line is not assigned half of another line cost');

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

const nextSnapshot={...snapshot,marginSnapshotId:'SECOND-SNAPSHOT',lossCalibrationIds:['SECOND-CALIBRATION'],costConfirmationIds:['SECOND-CONFIRMATION'],consumptionRecordIds:['SECOND-CONSUMPTION'],costAllocationDraftIds:['SECOND-COST'],lineItems:snapshot.lineItems.map(line=>({...line,materialCostAmount:8,costAllocationDraftIds:['SECOND-COST']}))};
const combined=builder.buildOrderMarginReport({inbound,snapshots:[snapshot,nextSnapshot],now});
assert.equal(combined.lineItems.length,1);assert.equal(combined.totalSalesAmount,800);assert.equal(combined.totalMaterialCostAmount,20);assert.equal(combined.grossProfitAmount,780);
assert.deepEqual(combined.lineItems[0].marginSnapshotIds,[snapshot.marginSnapshotId,'SECOND-SNAPSHOT']);assert.equal(combined.lineItems[0].marginSnapshotId,'');
assert.equal(snapshot.lineItems[0].materialCostAmount,12,'Combining must not mutate the immutable source');
const localCombined=applyRawMaterialCostMarginLocalAction({...inbound,rawMaterialOrderMarginSnapshots:[snapshot,nextSnapshot]},{action:'复核毛利快照',now});
assert.equal(localCombined.rawMaterialOrderMarginReports[0].totalSalesAmount,800);
for (const change of [{salesAmount:801},{quantity:1001},{customerId:'ANOTHER-CUSTOMER'}]) {
 assert.throws(()=>builder.buildOrderMarginReport({inbound,snapshots:[snapshot,{...nextSnapshot,lineItems:nextSnapshot.lineItems.map(line=>({...line,...change}))}],now}),error=>error.code==='RAW_MATERIAL_MARGIN_REVENUE_CONFLICT');
}
for (const invalid of [snapshot,{...nextSnapshot,lineItems:snapshot.lineItems},{...nextSnapshot,lineItems:nextSnapshot.lineItems.map(line=>({...line,costAllocationDraftIds:[]}))}]) {
 assert.throws(()=>builder.buildOrderMarginReport({inbound,snapshots:[snapshot,invalid],now}),error=>error.code==='RAW_MATERIAL_MARGIN_REPORT_SOURCE_INVALID');
 assert.equal(applyRawMaterialCostMarginLocalAction({...inbound,rawMaterialOrderMarginSnapshots:[snapshot,invalid]},{action:'复核毛利快照',now}),null);
}
console.log('PASS multi-snapshot report: one revenue per order line, disjoint costs summed, conflicting revenue/identity or repeated sources rejected, original snapshots retained.');

assert.deepEqual(normalizeRawMaterialOrderMarginReports([combined])[0].lineItems[0].marginSnapshotIds,combined.lineItems[0].marginSnapshotIds,'Persisted normalization retains all contributing snapshots');
const separateOrder={...nextSnapshot,orderLineIds:['LINE-2'],lineItems:nextSnapshot.lineItems.map(line=>({...line,orderLineId:'LINE-2'}))};
assert.equal(builder.buildOrderMarginReport({inbound,snapshots:[snapshot,separateOrder],now}).totalSalesAmount,1600,'Different order lines with equal revenue remain distinct');
for (const changed of [{orderLineIds:['MISSING-LINE']},{costAllocationDraftIds:['MISSING-COST']},{consumptionRecordIds:snapshot.consumptionRecordIds}]) assert.throws(()=>builder.buildOrderMarginReport({inbound,snapshots:[snapshot,{...nextSnapshot,...changed}],now}),error=>error.code==='RAW_MATERIAL_MARGIN_REPORT_SOURCE_INVALID');

// Exercise the normalization used before finance review, not only raw helper input.
for (const invalidCost of [undefined,null,'',' ',false,true,[],{},NaN,Infinity,'invalid']) {
 const source={...snapshot,lineItems:snapshot.lineItems.map(line=>({...line,materialCostAmount:invalidCost}))};
 const normalized=normalizeRawMaterialOrderMarginSnapshots([source]);
 assert.equal(normalized[0].lineItems[0].materialCostAmount,null);
 assert.throws(()=>builder.buildOrderMarginReport({inbound,snapshots:normalized,now}),error=>error.code==='RAW_MATERIAL_MARGIN_REPORT_SOURCE_INVALID');
 const client=normalizeClientInbound({...inbound,rawMaterialOrderMarginSnapshots:JSON.parse(JSON.stringify(normalized))});
 assert.equal(client.rawMaterialOrderMarginSnapshots[0].lineItems[0].materialCostAmount,null);
 assert.equal(applyRawMaterialCostMarginLocalAction(client,{action:'复核毛利快照',now}),null);
}
const explicitZero=normalizeRawMaterialOrderMarginSnapshots([{...snapshot,lineItems:snapshot.lineItems.map(line=>({...line,materialCostAmount:0}))}]);
assert.equal(builder.buildOrderMarginReport({inbound,snapshots:explicitZero,now}).totalMaterialCostAmount,0);
const hugeAmount=50_000_000_000_000;
for(const field of ['salesAmount','materialCostAmount']) {
 const huge=[snapshot,separateOrder].map(record=>({...record,lineItems:record.lineItems.map(line=>({...line,[field]:hugeAmount}))}));
 assert.throws(()=>builder.buildOrderMarginReport({inbound,snapshots:huge,now}),error=>error.code==='RAW_MATERIAL_MARGIN_REPORT_SOURCE_INVALID','Aggregate cents must remain safe across distinct order lines');
}
console.log('PASS normalized finance review: absent/invalid material cost blocked after server/JSON/client normalization; explicit zero retained; aggregate cents overflow blocked across distinct order lines.');

for (const value of [undefined,null,'',false,NaN,Infinity,-1]) {
 const invalidDraft={...draftResult.drafts[0],allocatedCostAmount:value};
 assert.throws(()=>builder.buildCostAllocationConfirmation({inbound,drafts:[invalidDraft],now}),e=>e.code==='RAW_MATERIAL_COST_AMOUNT_INVALID');
 assert.equal(applyRawMaterialCostMarginLocalAction({...inbound,rawMaterialCostAllocationDrafts:[invalidDraft]},{action:'确认成本草稿',now}),null);
 const invalidConfirmation={...confirmation,confirmedCostAmount:value};
 assert.throws(()=>builder.buildCostLossCalibration({inbound,confirmations:[invalidConfirmation],drafts:draftResult.drafts,body:{expectedOutputQuantity:100,actualQualifiedOutputQuantity:100},now}),e=>e.code==='RAW_MATERIAL_COST_AMOUNT_INVALID');
 assert.equal(applyRawMaterialCostMarginLocalAction({...inbound,rawMaterialCostAllocationConfirmations:[invalidConfirmation],rawMaterialCostAllocationDrafts:draftResult.drafts},{action:'校准损耗',options:{expectedOutputQuantity:100,actualQualifiedOutputQuantity:100},now}),null);
}
const zeroConfirmation={...confirmation,confirmedCostAmount:0};
const zeroConfirmedDrafts=confirmedDrafts.map(draft=>({...draft,confirmedCostAmount:0}));
assert.equal(builder.buildCostLossCalibration({inbound,confirmations:[zeroConfirmation],drafts:zeroConfirmedDrafts,body:{expectedOutputQuantity:100,actualQualifiedOutputQuantity:100},now}).confirmedCostAmount,0,'Zero confirmation must not borrow positive allocated amount');
const zeroLocal=applyRawMaterialCostMarginLocalAction({...inbound,rawMaterialCostAllocationConfirmations:[zeroConfirmation],rawMaterialCostAllocationDrafts:zeroConfirmedDrafts},{action:'校准损耗',options:{expectedOutputQuantity:100,actualQualifiedOutputQuantity:100},now});
assert.equal(zeroLocal.rawMaterialCostLossCalibrations[0].confirmedCostAmount,0);
assert.equal(rawMaterialDraftCostAmount({lossCalibrationId:'LC',calibratedCostAmount:0,confirmedCostAmount:10,allocatedCostAmount:20}),0);
assert.equal(rawMaterialDraftCostAmount({costConfirmationId:'CC',confirmedCostAmount:0,allocatedCostAmount:20}),0);
assert.equal(rawMaterialDraftCostAmount({lossCalibrationId:'LC',allocatedCostAmount:20}),null);
assert.equal(rawMaterialDraftCostAmount({costConfirmationId:'CC',allocatedCostAmount:20}),null);
console.log('PASS cost stages: missing/invalid/negative confirmation inputs rejected in server/local paths, explicit zero never borrows earlier amounts, authoritative stage marker selects its own amount.');

const calibrationInput={inbound,confirmations:[confirmation],drafts:confirmedDrafts,body:{expectedOutputQuantity:100,actualQualifiedOutputQuantity:100},now};
const sourceCases=[
 {drafts:[]}, {drafts:[...confirmedDrafts,...confirmedDrafts]},
 {drafts:confirmedDrafts.map(d=>({...d,inboundId:'OTHER'}))},
 {drafts:confirmedDrafts.map(d=>({...d,costConfirmationId:'OTHER'}))},
 {drafts:confirmedDrafts.map(d=>({...d,confirmedCostAmount:13}))},
 {confirmations:[confirmation,confirmation]},
 ...['costAllocationDraftIds','consumptionRecordIds','issueRecordIds','orderLineIds','productionTaskIds'].map(key=>({confirmations:[{...confirmation,[key]:['MISSING']}]})),
 {confirmations:[{...confirmation,confirmedCount:2}]},
];
for(const changed of sourceCases){
 assert.throws(()=>builder.buildCostLossCalibration({...calibrationInput,...changed}),e=>e.code==='RAW_MATERIAL_COST_CONFIRMATION_SOURCE_INVALID');
 const current={...calibrationInput,...changed};
 assert.equal(applyRawMaterialCostMarginLocalAction({...inbound,rawMaterialCostAllocationConfirmations:current.confirmations,rawMaterialCostAllocationDrafts:current.drafts},{action:'校准损耗',options:current.body,now}),null);
}
const partialDraft={...confirmedDrafts[0],costAllocationDraftId:'PARTIAL-DRAFT',consumptionRecordId:'PARTIAL-CONS',confirmedCostAmount:8};
const partialConfirmation={...confirmation,costAllocationDraftIds:[...confirmation.costAllocationDraftIds,'PARTIAL-DRAFT'],consumptionRecordIds:[...confirmation.consumptionRecordIds,'PARTIAL-CONS'],issueRecordIds:[...confirmation.issueRecordIds,...confirmation.issueRecordIds],confirmedCount:2,confirmedCostAmount:20};
assert.equal(builder.buildCostLossCalibration({...calibrationInput,confirmations:[partialConfirmation],drafts:[...confirmedDrafts,partialDraft]}).confirmedCostAmount,20,'Distinct partial consumptions may share the same issue record');
assert.throws(()=>builder.buildCostLossCalibration({...calibrationInput,confirmations:[partialConfirmation],drafts:[...confirmedDrafts,{...partialDraft,consumptionRecordId:confirmedDrafts[0].consumptionRecordId}]}),e=>e.code==='RAW_MATERIAL_COST_CONFIRMATION_SOURCE_INVALID');
console.log('PASS calibration sources: missing/duplicate/cross-inbound/cross-confirmation/mismatched amount/count/scope rejected, legitimate partial consumptions sharing an issue allowed.');

const draftScopeCases=[
 [...draftResult.drafts,...draftResult.drafts],
 [...draftResult.drafts,{...draftResult.drafts[0],costAllocationDraftId:'ANOTHER-ID'}],
 ...[{inboundId:'OTHER'},{orderLineId:''},{productionTaskId:''},{rollId:''},{lossCalibrationId:'OLD-LC'},{marginSnapshotId:'OLD-MS'}].map(change=>draftResult.drafts.map(d=>({...d,...change}))),
];
for(const drafts of draftScopeCases){
 assert.throws(()=>builder.buildCostAllocationConfirmation({inbound,drafts,now}),e=>e.code==='RAW_MATERIAL_COST_DRAFT_SOURCE_INVALID');
 assert.equal(applyRawMaterialCostMarginLocalAction({...inbound,rawMaterialCostAllocationDrafts:drafts},{action:'确认成本草稿',now}),null);
}
const alreadyCosted={...draftResult.drafts[0],costAllocationDraftId:'PREVIOUS-DRAFT',costConfirmationId:'PREVIOUS-CC'};
assert.throws(()=>builder.buildCostAllocationConfirmation({inbound:{...inbound,rawMaterialCostAllocationDrafts:[alreadyCosted,...draftResult.drafts]},drafts:draftResult.drafts,now}),e=>e.code==='RAW_MATERIAL_COST_DRAFT_SOURCE_INVALID');
assert.equal(applyRawMaterialCostMarginLocalAction({...inbound,rawMaterialCostAllocationDrafts:[alreadyCosted,...draftResult.drafts]},{action:'确认成本草稿',now}),null);
const newPartial={...draftResult.drafts[0],costAllocationDraftId:'NEW-PARTIAL',consumptionRecordId:'NEW-CONS',allocatedCostAmount:8};
assert.equal(builder.buildCostAllocationConfirmation({inbound,drafts:[...draftResult.drafts,newPartial],now}).confirmedCostAmount,20);
console.log('PASS cost confirmation scope: duplicate draft/consumption, cross-inbound, missing task/line/roll, orphan later-stage markers and prior-costed consumption blocked; distinct partial consumptions remain valid.');

const sourceIssue={issueRecordId:'ISSUE-SOURCE',inboundId:inbound.id,rollId:'ROLL-SOURCE',productionTaskId:'TASK-1',productionTaskOrderLineId:'LINE-1',productionTaskMatchStatus:'已匹配'};
const sourceConsumption={consumptionRecordId:'CONS-SOURCE',issueRecordId:'ISSUE-SOURCE',inboundId:inbound.id,rollId:'ROLL-SOURCE',consumedWeightKg:6};
const validSource={inbound,workspace,now,issueRecords:[sourceIssue],consumptionRecords:[sourceConsumption]};
assert.equal(builder.buildCostAllocationDrafts(validSource).drafts.length,1);
for(const changed of [
 {consumptionRecords:[{...sourceConsumption,issueRecordId:'MISSING-ISSUE'}]},
 {consumptionRecords:[{...sourceConsumption,rollId:'WRONG-ROLL'}]},
 {consumptionRecords:[{...sourceConsumption,inboundId:'OTHER'}]},
 {consumptionRecords:[{...sourceConsumption,productionTaskId:'OTHER-TASK'}]},
 {consumptionRecords:[{...sourceConsumption,productionTaskOrderLineId:'OTHER-LINE'}]},
 {issueRecords:[{...sourceIssue,inboundId:'OTHER'}]},
 {issueRecords:[sourceIssue,sourceIssue]},
 {consumptionRecords:[sourceConsumption,sourceConsumption]},
]) {
 const current={...validSource,...changed};const result=builder.buildCostAllocationDrafts(current);assert.equal(result.drafts.length,0);
 const localInput={...inbound,rawMaterialIssueRecords:current.issueRecords,rawMaterialConsumptionRecords:current.consumptionRecords};
 const local=applyRawMaterialCostMarginLocalAction(localInput,{action:'生成成本草稿',now});
 assert.equal(local?.rawMaterialCostAllocationDrafts?.length || 0,0);
 assert.equal(canGenerateRawMaterialCostDraft(localInput),false);
}
const reissued={...sourceIssue,issueRecordId:'ISSUE-LATER',productionTaskId:'TASK-LATER',productionTaskOrderLineId:'LINE-LATER'};
const preserved=builder.buildCostAllocationDrafts({...validSource,issueRecords:[reissued,sourceIssue]});
assert.equal(preserved.drafts[0].issueRecordId,sourceIssue.issueRecordId);assert.equal(preserved.drafts[0].productionTaskId,'TASK-1');
console.log('PASS exact cost issue identity: no roll fallback, duplicate/foreign/conflicting sources blocked in server/local/UI eligibility; reissued roll stays linked to the recorded issue.');

for (const headerPrice of [2,0]) {
 const pricedInbound={...inbound,unitPrice:headerPrice,rolls:[{id:'ROLL-SOURCE',unitPrice:7,unit:'kg',ocrLineId:'OCR-SECOND'}]};
 const server=builder.buildCostAllocationDrafts({...validSource,inbound:pricedInbound});
 assert.equal(server.drafts[0].unitPrice,7);assert.equal(server.drafts[0].allocatedCostAmount,42);
 const local=applyRawMaterialCostMarginLocalAction({...pricedInbound,rawMaterialIssueRecords:[sourceIssue],rawMaterialConsumptionRecords:[sourceConsumption]},{action:'生成成本草稿',now});
 assert.equal(local.rawMaterialCostAllocationDrafts[0].unitPrice,7);assert.equal(local.rawMaterialCostAllocationDrafts[0].allocatedCostAmount,42);
 assert.equal(canGenerateRawMaterialCostDraft({...pricedInbound,rawMaterialIssueRecords:[sourceIssue],rawMaterialConsumptionRecords:[sourceConsumption]}),true);
}
for(const rolls of [
 [{id:'ROLL-SOURCE',unitPrice:0,ocrLineId:'OCR-SECOND'}],
 [{id:'ROLL-SOURCE',unitPrice:-1}],
 [{id:'OTHER-ROLL',unitPrice:7}],
 [{id:'ROLL-SOURCE',unitPrice:7},{id:'ROLL-SOURCE',unitPrice:8}],
 [{id:'ROLL-SOURCE',unitPrice:0},{id:'OTHER-1',unitPrice:7},{id:'OTHER-2',unitPrice:8}],
]) {
 const current={...inbound,rolls};assert.equal(builder.buildCostAllocationDrafts({...validSource,inbound:current}).drafts.length,0);
 assert.equal(canGenerateRawMaterialCostDraft({...current,rawMaterialIssueRecords:[sourceIssue],rawMaterialConsumptionRecords:[sourceConsumption]}),false);
}
assert.equal(builder.buildCostAllocationDrafts({...validSource,inbound:{...inbound,rolls:[{id:'ROLL-SOURCE',unitPrice:0}]}}).drafts[0].allocatedCostAmount,12,'Legacy manual roll without line price retains receipt-price compatibility');
console.log('PASS roll cost price: own OCR roll price overrides first-line/header price, absent OCR/foreign/ambiguous roll price blocked, explicit legacy manual fallback retained, server/local/UI eligibility agree.');

const unitCases=[
 {unit:'kg',weight:6,quantity:0,price:7,amount:42},
 {unit:'吨',weight:6,quantity:0,price:7000,amount:42},
 {unit:'件',weight:0,quantity:2,price:7,amount:14},
 {unit:'卷',weight:0,quantity:2,price:7,amount:14},
 {unit:'件',weight:6,quantity:0,price:7,amount:null},
 {unit:'kg',weight:0,quantity:2,price:7,amount:null},
 {unit:'米',weight:6,quantity:0,price:7,amount:null},
 {unit:'',weight:6,quantity:0,price:7,amount:null},
];
for(const test of unitCases){
 const current={...inbound,unit:'kg',rolls:[{id:'ROLL-SOURCE',unit:test.unit,unitPrice:test.price,ocrLineId:'LINE-UNIT'}],ocrLines:[{lineId:'LINE-UNIT',values:{unit:test.unit}}]};
 const consumption={...sourceConsumption,consumedWeightKg:test.weight,consumedQuantity:test.quantity};
 const result=builder.buildCostAllocationDrafts({...validSource,inbound:current,consumptionRecords:[consumption]});
 const localInput={...current,rawMaterialIssueRecords:[sourceIssue],rawMaterialConsumptionRecords:[consumption]};
 const local=applyRawMaterialCostMarginLocalAction(localInput,{action:'生成成本草稿',now});
 assert.equal(result.drafts[0]?.allocatedCostAmount ?? null,test.amount);
 assert.equal(local?.rawMaterialCostAllocationDrafts?.[0]?.allocatedCostAmount ?? null,test.amount);
 assert.equal(canGenerateRawMaterialCostDraft(localInput),test.amount !== null);
 if(test.unit==='吨')assert.match(result.drafts[0].allocationBasis,/6kg ÷ 1000 × 7000元\/吨/);
}
const oldOcr={...inbound,rolls:[{id:'ROLL-SOURCE',unitPrice:7000,ocrLineId:'OLD-LINE'}],ocrLines:[{lineId:'OLD-LINE',values:{unit:'吨'}}]};
assert.equal(builder.buildCostAllocationDrafts({...validSource,inbound:oldOcr}).drafts[0].allocatedCostAmount,42,'Older OCR roll resolves its original line unit, not the header kg');
console.log('PASS price units: kg/tonne fixed conversion, exact piece/roll count, missing/meter/incompatible measurement blocked, historic OCR line units retained, server/local/UI agree.');

const factualInbound={...inbound,rolls:[{id:'ROLL-SOURCE',unit:'kg',unitPrice:7,ocrLineId:'FACT-LINE',materialType:'无纺布',productName:'宝蓝卷料',spec:'95*78*1300',factoryColor:'宝蓝'}]};
const factualServer=builder.buildCostAllocationDrafts({...validSource,inbound:factualInbound}).drafts[0];
const factualLocal=applyRawMaterialCostMarginLocalAction({...factualInbound,rawMaterialIssueRecords:[sourceIssue],rawMaterialConsumptionRecords:[sourceConsumption]},{action:'生成成本草稿',now}).rawMaterialCostAllocationDrafts[0];
for(const draft of [factualServer,factualLocal]){assert.equal(draft.productName,'宝蓝卷料');assert.equal(draft.spec,'95*78*1300');assert.equal(draft.factoryColor,'宝蓝');}
console.log('PASS cost draft facts use consumed roll rather than first receipt line in server/local paths.');

const identityClock=Date.now;
try {
 Date.now=()=>1788314400000;
 const cases=[
  [()=>builder.buildCostAllocationDrafts({inbound,workspace,now,issueRecords:[sourceIssue],consumptionRecords:[sourceConsumption]}).drafts[0],'costAllocationDraftId'],
  [()=>builder.buildCostAllocationConfirmation({inbound,drafts:draftResult.drafts,now}),'costConfirmationId'],
  [()=>builder.buildCostLossCalibration({inbound,confirmations:[confirmation],drafts:confirmedDrafts,now,body:{expectedOutputQuantity:1000,actualQualifiedOutputQuantity:950}}),'lossCalibrationId'],
  [()=>builder.buildOrderMarginSnapshot({inbound,workspace,calibrations:[calibration],confirmations:[confirmation],drafts:draftResult.drafts,now}),'marginSnapshotId'],
  [()=>builder.buildOrderMarginReport({inbound,snapshots:[snapshot],now}),'marginReportId'],
 ];
 for(const [create,key] of cases) assert.notEqual(create()[key],create()[key],key+' must not collide at equal wall-clock time');
 const input={...inbound,rawMaterialIssueRecords:[sourceIssue],rawMaterialConsumptionRecords:[sourceConsumption]};
 const a=applyRawMaterialCostMarginLocalAction(input,{action:'生成成本草稿',now});
 const b=applyRawMaterialCostMarginLocalAction(input,{action:'生成成本草稿',now});
 assert.notEqual(a.rawMaterialCostAllocationDrafts[0].costAllocationDraftId,b.rawMaterialCostAllocationDrafts[0].costAllocationDraftId);
} finally {Date.now=identityClock;}
console.log('PASS fixed-clock cost draft/confirmation/calibration/margin/report identities and local cost draft. Identity uniqueness is separate from command idempotency.');
