import assert from 'node:assert/strict';
import { createApiSharedServiceRegistry } from '../server/apiSharedServiceRegistry.mjs';
import { createLocalProductionPackingTransactionRepository, buildCompletePackingTaskTransactionQuery, buildResolveProductionExceptionTransactionQuery } from '../server/productionPackingTransactionRepository.mjs';
import { confirmDraftOrder } from '../src/state/officeOrderActions.js';
import { parseOrderText } from '../src/lib/orderParser.js';
import { buildDriverDeliveryTask } from '../server/services/driverDeliveryTaskProjectionService.mjs';
const registry = createApiSharedServiceRegistry();
const line = { id:'OL-P1',orderLineId:'OL-P1',orderId:'ORD-P1',customerId:'C001',product:'特殊尺寸空白袋',orderType:'特殊尺寸',size:'43*51*12',color:'红色',handle:'普通提',style:'空白袋',print:'否',qty:100,status:'制袋中',revision:1,fulfillment:'送货' };
const workspace = { users:[{id:'U-OFFICE-A'}],customers:[{id:'C001',name:'测试'}],orderLines:[line],productionTasks:[{id:'PT-P1',productionTaskId:'PT-P1',orderLineId:line.id,taskType:'制袋',taskStatus:'制袋中',revision:1,plannedQty:100,createdBy:'U-OFFICE-A'}],fulfillments:[{id:'F-P1',fulfillmentId:'F-P1',lineId:line.id,orderLineId:line.id,method:'送货',qty:100,status:'待生产',revision:1}],inventories:[],inventoryReservations:[],inventoryLedgers:[],workshopReports:[],productionExceptions:[],packingTasks:[],packages:[],todos:[],operationLogs:[] };
workspace.productionPackingTransactionRepository=createLocalProductionPackingTransactionRepository();
const complete=await registry.productionReportingCommandService.completeProductionReport({workspace,productionTaskId:'PT-P1',operatorId:'U-OFFICE-A',body:{qualifiedQty:100,idempotencyKey:'p1-special-production'}});
assert.ok(complete.response,JSON.stringify(complete)); assert.equal(workspace.inventories.length,0);assert.equal(workspace.inventoryReservations.length,0);assert.equal(workspace.packingTasks.length,1);
const taskId=workspace.packingTasks[0].packingTaskId;
let rejected=await registry.packingCommandService.completePackingTask({workspace,packingTaskId:taskId,operatorId:'U-OFFICE-A',body:{actualPackedQty:100,packages:[{packedQty:60},{packedQty:60}]}});
assert.equal(rejected.code,'PACKING_PACKAGE_QUANTITY_MISMATCH');assert.equal(workspace.packages.length,0);
const packed=await registry.packingCommandService.completePackingTask({workspace,packingTaskId:taskId,operatorId:'U-OFFICE-A',body:{actualPackedQty:100,packages:[{packedQty:60},{packedQty:40}],idempotencyKey:'p1-pack-complete'}});
assert.ok(packed.response,JSON.stringify(packed));assert.equal(workspace.packages.length,2);assert.equal(workspace.packages.reduce((sum,p)=>sum+p.packedQty,0),100);
assert.throws(()=>buildCompletePackingTaskTransactionQuery({packingTask:{...workspace.packingTasks[0],actualPackedQty:100},packages:workspace.packages.map(p=>({...p,packedQty:60})),fulfillment:workspace.fulfillments[0]}),/PACKING_PACKAGE_QUANTITY_MISMATCH/);
const driver=buildDriverDeliveryTask(workspace,workspace.fulfillments[0]);assert.equal(driver.packageChecklist.length,2);
assert.equal(buildDriverDeliveryTask({...workspace,packages:[]},workspace.fulfillments[0]).packageChecklist.length,0);
const row={id:'DR-P1',customerId:'C001',customer:'测试',product:'空白袋',size:'30*38*10',color:'红色',handle:'普通提',style:'空白袋',print:'否',qty:100,fulfillment:'自提',latest:'2026-10-30',printSide:'非印刷',printColor:'非印刷',artworkStatus:'无需图稿'};
const confirmed=confirmDraftOrder({draftRows:[{...row,orderType:'stock'}],inventoryRecords:[],orderLines:[],fulfillments:[],customers:workspace.customers});assert.equal(confirmed.newLines[0].status,'待排产');
const special=confirmDraftOrder({draftRows:[{...row,size:'43*51*12'}],inventoryRecords:[],orderLines:[],fulfillments:[],customers:workspace.customers});assert.equal(special.newLines[0].orderType,'特殊尺寸');assert.equal(special.newLines[0].status,'待排产');
assert.equal(parseOrderText('测试客户 特殊尺寸43*51*12红色100个 明天自提',[],workspace.customers)[0]?.orderType,'custom_special');
const pauseWorkspace={...workspace,productionTasks:[{...workspace.productionTasks[0],taskStatus:'制袋中',status:'制袋中'}],productionExceptions:[],todos:[],todoEvents:[],workshopReports:[],operationLogs:[]};
for (const n of [1,2]) {
 const r=await registry.productionReportingCommandService.recordProductionException({workspace:pauseWorkspace,productionTaskId:'PT-P1',operatorId:'U-OFFICE-A',body:{productionExceptionId:`PEX-P1-${n}`,exceptionType:'机器问题',continuationMode:'暂停等确认',remark:`机器问题${n}`,idempotencyKey:`p1-exception-${n}`}});assert.ok(r.response,JSON.stringify(r));
}
for (const [n,status] of [[1,'异常暂停'],[2,'制袋中']]) {
 const r=await registry.productionReportingCommandService.resolveProductionException({workspace:pauseWorkspace,productionTaskId:'PT-P1',operatorId:'U-OFFICE-A',body:{productionExceptionId:`PEX-P1-${n}`,resolutionCode:'继续生产',resolutionNote:'维修完毕',resolutionConfirmed:true,idempotencyKey:`p1-resolve-${n}`}});assert.ok(r.response,JSON.stringify(r));assert.equal(pauseWorkspace.productionTasks[0].taskStatus,status);
}
assert.equal(typeof buildResolveProductionExceptionTransactionQuery,'function');
console.log('P1 cross-service checks passed: special completion without stock, real packages with conserved totals, no fake driver packages, shortage routing, custom blank classification, all paused exceptions resolved before resume.');
