import assert from 'node:assert/strict';
import * as workflow from '../src/features/raw-materials/rawMaterialInboundWorkflow.js';
const quantityFormats=['IssueRecord','ConsumptionRecord','LeftoverReturnRecord','LeftoverReviewRecord','CostAllocationDraft','CostAllocationConfirmation'];
for(const name of quantityFormats){
 const format=workflow['formatRawMaterial'+name];
 assert.match(format({}),/数量待核实/);
 assert.doesNotMatch(format({}),/1件|1项/);
}
assert.match(workflow.formatRawMaterialIssueRecord({issuedWeightKg:0,issuedQuantity:1}),/1件/);
assert.match(workflow.formatRawMaterialConsumptionRecord({consumedWeightKg:0,consumedQuantity:0}),/0件/);
assert.match(workflow.formatRawMaterialConsumptionRecord({consumedWeightKg:0}),/0kg/);
assert.match(workflow.formatRawMaterialConsumptionRecord({consumedWeightKg:' ',consumedQuantity:NaN}),/数量待核实/);
assert.match(workflow.formatRawMaterialSplitRecord({}),/领 重量待核实 \/ 余 重量待核实/);
assert.match(workflow.formatRawMaterialCostLossCalibration({actualQualifiedOutputQuantity:0,expectedOutputQuantity:100,lossRatePercent:100}),/0\/100 合格.*损耗 100%/);
assert.match(workflow.formatRawMaterialCostLossCalibration({confirmedWeightKg:20}),/产量待核实 \/ 20kg/);
assert.match(workflow.formatRawMaterialCostLossCalibration({actualQualifiedOutputQuantity:100,expectedOutputQuantity:100,lossRatePercent:0}),/损耗 0%/);
const report={marginReportCount:1,marginReportGrossProfitAmount:0,marginSnapshotGrossProfitAmount:98765,marginReportGrossMarginRatePercent:0,marginSnapshotGrossMarginRatePercent:80};
assert.match(workflow.formatRawMaterialMarginReportSummary(report,true),/毛利 ¥0 \/ 0%/);
assert.doesNotMatch(workflow.formatRawMaterialMarginReportSummary(report,true),/98765|80%/);
assert.match(workflow.formatRawMaterialMarginReportSummary({...report,marginReportGrossProfitAmount:undefined},true),/金额待核实/);
assert.match(workflow.formatRawMaterialMarginReportSummary({...report,marginReportGrossProfitAmount:-20,marginReportGrossMarginRatePercent:-5},true),/毛利 ¥-20 \/ -5%/);
for(const name of ['OrderMarginSnapshot','OrderMarginReport']){
 const format=workflow['formatRawMaterial'+name];
 assert.match(format({lineItems:[{},{}],totalSalesAmount:100,totalMaterialCostAmount:100,grossProfitAmount:0,grossMarginRatePercent:0},true),/2 个订单行.*毛利 ¥0 \/ 0%/);
 assert.match(format({},true),/订单行数量待核实.*金额待核实/);
 assert.match(format({lineItems:[],orderLineIds:['stale']}),/0 个订单行/);
 assert.doesNotMatch(format({totalSalesAmount:98765,grossMarginRatePercent:80},false),/98765|80%|金额待核实/);
}
for(const name of ['CostAllocationDraft','CostAllocationConfirmation','CostLossCalibration']){
 const format=workflow['formatRawMaterial'+name];
 assert.match(format({},true),/金额待核实/);
 assert.match(format({allocatedCostAmount:0,confirmedCostAmount:0},true),/¥0/);
 assert.doesNotMatch(format({allocatedCostAmount:98765,confirmedCostAmount:98765},false),/98765|金额待核实/);
}
console.log('PASS saved record values: missing/invalid quantities stay unknown, explicit zero stays zero, loss uses kg and zero output, margin report never borrows snapshot money, losses remain negative, line counts are not order counts, permissions hide amounts.');
