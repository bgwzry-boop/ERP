import assert from 'node:assert/strict';
import {createApiSharedServiceRegistry} from '../server/apiSharedServiceRegistry.mjs';
import {createLocalOrderLineQuantityAdjustmentTransactionRepository} from '../server/orderLineQuantityAdjustmentTransactionRepository.mjs';
import {createLocalOrderLineVoidTransactionRepository} from '../server/orderLineVoidTransactionRepository.mjs';
import {createLocalFulfillmentActionTransactionRepository} from '../server/fulfillmentActionTransactionRepository.mjs';
import {applyRawMaterialTraceabilityAction} from '../server/rawMaterialTraceabilityActionService.mjs';
import {hasOrderProductionExecution} from '../server/orderMutationProductionGuard.mjs';
import {hasOrderActiveDocuments} from '../server/orderMutationDocumentGuard.mjs';
const services=createApiSharedServiceRegistry();
const mutate=services.orderLineMutationCommandService;
function workspace() {return {
  orderLines:[{id:'OL-GUARD',orderLineId:'OL-GUARD',orderId:'ORD-GUARD',orderNo:'ORD-GUARD',customerId:'C-GUARD',qty:10,originalQty:10,amount:10,status:'待出库',lineStatus:'待出库',revision:1,orderType:'custom_special',exceptionTags:[]}],
  fulfillments:[{id:'F-GUARD',fulfillmentId:'F-GUARD',orderLineId:'OL-GUARD',lineId:'OL-GUARD',customerId:'C-GUARD',qty:10,expectedQty:10,method:'送货',orderType:'custom_special',status:'待出库',revision:1}],
  priceSnapshots:[{id:'PS-GUARD',priceSnapshotId:'PS-GUARD',orderLineId:'OL-GUARD',snapshotType:'confirmation',versionNo:1,bagPrice:1,printPrice:0,otherFee:0,adjustmentAmount:0,chargeableQty:10,finalAmount:10}],
  inventories:[],inventoryReservations:[],statementLines:[],statements:[],productionTasks:[{id:'TASK-GUARD',productionTaskId:'TASK-GUARD',orderLineId:'OL-GUARD',plannedQty:10,taskStatus:'待排产',status:'待排产',revision:1}],workshopReports:[],packingTasks:[],packages:[],
  paperOutboundDocuments:[],printRecords:[],printJobs:[],operationLogs:[],employees:[{id:'EMP-WH',name:'合成库房',role:'库房',status:'在职'}],rawMaterialInbounds:[],
  customers:[{id:'C-GUARD',name:'合成客户'}],
  orderLineQuantityAdjustmentTransactionRepository:createLocalOrderLineQuantityAdjustmentTransactionRepository(),
  orderLineVoidTransactionRepository:createLocalOrderLineVoidTransactionRepository(),
  fulfillmentActionTransactionRepository:createLocalFulfillmentActionTransactionRepository(),
};}
const command=(w,action,key)=>mutate[action]({workspace:w,orderLineId:'OL-GUARD',body:{newQty:6,reason:'customer_change',reasonText:'合成回归',idempotencyKey:key,expectedRevision:w.orderLines[0].revision},operatorId:'U-OFFICE-A'});
const oldPaper = () => ({id:'PAPER-OLD',paperOutboundDocumentId:'PAPER-OLD',fulfillmentId:'F-GUARD',printRecordId:'PR-OLD',documentType:'outbound_note',documentVersion:1,status:'已打印待交库',instructionQty:null,revision:1});
const oldPrint = () => ({id:'PR-OLD',printRecordId:'PR-OLD',targetType:'fulfillment',targetId:'F-GUARD',printAction:'first_print',status:'printed',printedAt:'2026-10-24T01:00:00Z'});
for (const action of ['adjustOrderLineQuantity','voidOrderLine']) {
  for (const fact of ['paper','print','queue','sent','unknown']) {
    const w=workspace();if(fact==='paper')w.paperOutboundDocuments=[oldPaper()];if(fact==='print')w.printRecords=[oldPrint()];
    if(['queue','sent','unknown'].includes(fact))w.printJobs=[{targetType:'fulfillment',targetId:'F-GUARD',jobStatus:fact==='queue'?'queued':fact}];
    const before=JSON.stringify(w);const result=await command(w,action,`${action}-${fact}`);
    assert.equal(result.statusCode,409,JSON.stringify(result));assert.equal(result.code,'ERP_ORDER_DOCUMENTS_ACTIVE_CONFLICT');assert.equal(JSON.stringify(w),before);
  }
  const issued=workspace();issued.rawMaterialInbounds=[{id:'RAW-GUARD',rolls:[{id:'ROLL-GUARD',weightKg:10,inventoryStatus:'机边领用',issueRecordId:'ISSUE-GUARD',productionTaskId:'TASK-GUARD',machineId:'M-GUARD'}],rawMaterialIssueRecords:[{issueRecordId:'ISSUE-GUARD',rollId:'ROLL-GUARD',machineId:'M-GUARD',productionTaskId:'TASK-GUARD',productionTaskOrderLineId:'OL-GUARD',productionTaskMatchStatus:'已匹配'}]}];
  assert.equal(hasOrderProductionExecution(issued,'OL-GUARD'),false,'Mere issue is not execution');
  const consumed=structuredClone(issued.rawMaterialInbounds[0]);
  const after=applyRawMaterialTraceabilityAction({workspace:issued,action:'confirm_consumption',before:consumed,body:{rollId:'ROLL-GUARD',consumedWeightKg:5},operatorId:'U-WAREHOUSE-A',now:'2026-10-24T01:01:00Z'});
  issued.rawMaterialInbounds=[after];assert.equal(after.rawMaterialConsumptionRecords[0].consumedWeightKg,5);
  assert.equal(hasOrderProductionExecution(issued,'OL-GUARD'),true);
  const before=JSON.stringify(issued);const result=await command(issued,action,`${action}-consumption`);
  assert.equal(result.statusCode,409,JSON.stringify(result));assert.equal(JSON.stringify(issued),before,'Keep 5kg, punches, task and audit without returning material');
  // Direct local-repository calls must not bypass the service guard.
  const input={workspace:issued,orderLine:{...issued.orderLines[0]},expectedOrderLineRevision:1,idempotencyKey:'direct-consumption',idempotencyPayload:{action},operationLog:{id:'LOG-DIRECT'}};
  assert.throws(()=>action==='voidOrderLine'?issued.orderLineVoidTransactionRepository.voidOrderLine(input):issued.orderLineQuantityAdjustmentTransactionRepository.adjustOrderLineQuantity(input),error=>error.code==='ERP_ORDER_PRODUCTION_ALREADY_EXECUTED');
  const noConsumption=workspace();noConsumption.rawMaterialInbounds=[consumed];const accepted=await command(noConsumption,action,`${action}-issued-only`);assert.ok(accepted.response,JSON.stringify(accepted));
  const unrelated=workspace();unrelated.rawMaterialInbounds=[{rawMaterialConsumptionRecords:[{consumptionRecordId:'UNLINKED',consumedWeightKg:5,machineId:'M-GUARD'}]}];assert.equal(hasOrderProductionExecution(unrelated,'OL-GUARD'),false,'Never infer orders from machine/roll alone');
}
// A mixed packing group's anchor document protects every explicitly linked child order.
{
 const grouped=workspace();grouped.fulfillments[0].packingGroupAnchorId='F-ANCHOR';grouped.paperOutboundDocuments=[{...oldPaper(),fulfillmentId:'F-ANCHOR'}];
 assert.equal(hasOrderActiveDocuments(grouped,'OL-GUARD'),true);
 grouped.paperOutboundDocuments[0].status='已作废';grouped.printRecords=[{...oldPrint(),targetId:'F-ANCHOR',status:'voided'}];grouped.printJobs=[{targetType:'fulfillment',targetId:'F-ANCHOR',jobStatus:'printed'}];
 assert.equal(hasOrderActiveDocuments(grouped,'OL-GUARD'),false,'Voided historical paper/records and terminal jobs are retained without blocking');
 grouped.printRecords.push({...oldPrint(),targetId:'F-ANCHOR',status:'previewed'});assert.equal(hasOrderActiveDocuments(grouped,'OL-GUARD'),false,'Pure previews do not become physical papers');
}
const w=workspace();w.paperOutboundDocuments=[oldPaper()];w.printRecords=[oldPrint()];
assert.equal((await command(w,'adjustOrderLineQuantity','qty-legal')).code,'ERP_ORDER_DOCUMENTS_ACTIVE_CONFLICT');
const voided=await services.fulfillmentPrintCommandService.voidPrintRecord({workspace:w,printRecordId:'PR-OLD',body:{voidReason:'order_quantity_changed',idempotencyKey:'void-paper-legal'},operatorId:'U-OFFICE-A'});
assert.equal(voided.printRecord.status,'voided');assert.equal(voided.paperOutboundDocument.status,'已作废');
assert.equal(hasOrderActiveDocuments(w,'OL-GUARD'),false);
const changed=await command(w,'adjustOrderLineQuantity','qty-legal');assert.ok(changed.response,JSON.stringify(changed));assert.equal(w.orderLines[0].qty,6);
w.paperOutboundDocuments.push({...oldPaper(),id:'PAPER-NEW',paperOutboundDocumentId:'PAPER-NEW',printRecordId:'PR-NEW',documentVersion:2,instructionQty:6,status:'已交库房',printedAt:'2026-10-24T01:02:00Z',handedToWarehouseAt:'2026-10-24T01:03:00Z'});
w.printRecords.push({...oldPrint(),id:'PR-NEW',printRecordId:'PR-NEW'});
const retry=await mutate.adjustOrderLineQuantity({workspace:w,orderLineId:'OL-GUARD',body:{newQty:6,reason:'customer_change',reasonText:'合成回归',idempotencyKey:'qty-legal',expectedRevision:1},operatorId:'U-OFFICE-A'});
assert.ok(retry.response,'Original committed request replays despite new paper and changed revision');
const execute=(paper,id)=>services.fulfillmentActionCommandService.recordWarehouseOutboundExecution({workspace:w,fulfillmentId:'F-GUARD',body:{expectedRevision:w.fulfillments[0].revision,paperOutboundDocumentId:paper.paperOutboundDocumentId,paperDocumentVersion:paper.documentVersion,paperDocumentRevision:paper.revision,result:'实物已出库',actualQty:6,physicalExecutorEmployeeId:'EMP-WH',feedbackChannel:'当面',executedAt:'2026-10-24T01:04:00Z',idempotencyKey:id},operatorId:'U-WAREHOUSE-A'});
const old=await execute(w.paperOutboundDocuments.find(p=>p.paperOutboundDocumentId==='PAPER-OLD'),'old-wex-guard');assert.equal(old.statusCode,409,JSON.stringify(old));
const current=await execute(w.paperOutboundDocuments.find(p=>p.paperOutboundDocumentId==='PAPER-NEW'),'new-wex-guard');assert.ok(current.response,JSON.stringify(current));assert.equal(current.response.warehouseOutboundExecution.actualQty,6);
console.log('PASS actual services/local repositories: legacy paper, valid prints and live jobs block both mutations; explicit legal paper void enables quantity correction; original request replays before new paper gate; old paper cannot execute, current 6-unit paper does; actual 5kg consumption blocks both operations, pure issue and unlinked consumption do not.');
