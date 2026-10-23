import assert from 'node:assert/strict';
import {createPostgresFulfillmentActionTransactionRepository} from '../server/fulfillmentActionTransactionRepository.mjs';
import {prepareDriverDeliveryExceptionResolution} from '../server/services/driverDeliveryExceptionResolutionPolicy.mjs';

function fixture() {
 const workspace={fulfillments:[{id:'F',fulfillmentId:'F',orderLineId:'OL',customerId:'C',method:'送货',status:'送货异常',revision:1,expectedQty:100,actualQty:100,physicalOutboundAt:'2026-10-22T23:00:00Z',loadedAt:'2026-10-23T00:00:00Z'}],fulfillmentExceptions:[{id:'EX',exceptionId:'EX',fulfillmentId:'F',exceptionType:'delivery_exception',status:'待办公室处理',expectedQty:100,actualQty:0,reasonCode:'customer_unavailable',reason:'客户不在',todoId:'TODO'}],todos:[{id:'TODO',type:'送货异常待处理',refId:'F',status:'未处理'}],operationLogs:[]};
 const body={fulfillmentId:'F',exceptionId:'EX',expectedRevision:1,reason:'客户已联系继续配送',confirmed:true,quantityVerified:true,idempotencyKey:'same-driver-resolution'};
 const p=prepareDriverDeliveryExceptionResolution({workspace,fulfillmentId:'F',body,operatorId:'OFFICE'});assert.equal(p.ok,true,JSON.stringify(p));
 const input={workspace,idempotencyKey:body.idempotencyKey,idempotencyPayload:{...body,operatorId:'OFFICE'},fulfillment:p.after,fulfillmentException:p.updatedException,driverExceptionBefore:p.exception,driverExceptionTodoBefore:p.currentTodo,todo:p.todo,operationLog:{id:'LOG-RESOLVE',targetType:'fulfillment',targetId:'F',action:'resolve_driver_delivery_exception',operatorId:'OFFICE',before:{fulfillment:p.before,exception:p.exception,todo:p.currentTodo},after:{fulfillment:p.after,exception:p.updatedException,todo:p.todo},reason:p.reason}};
 const receipt={fulfillment:{...p.after,revision:2},fulfillmentException:p.updatedException,todo:p.todo,operationLogId:'LOG-RESOLVE'};
 return {workspace,input,receipt};
}
for(const replayed of [true,false]) {
 const {workspace,input,receipt}=fixture();let current,requestedMetadata;
 const repository=createPostgresFulfillmentActionTransactionRepository({queryJson:async()=>null,idempotentTransactionJson:async request=>{
  requestedMetadata=request.includeReplayMetadata;
  // The SQL/receipt finished first; a later action reached the shared cache
  // before this invocation resumes. Test both an internal replay and new write.
  workspace.fulfillments[0]={...workspace.fulfillments[0],revision:9,status:'已交付',deliveredAt:'2026-10-23T01:00:00Z'};
  workspace.todos[0]={...workspace.todos[0],status:'已处理',handledBy:'OTHER',handlingResult:'后续核验'};
  current=structuredClone(workspace);
  return request.includeReplayMetadata?{value:receipt,replayed}:receipt;
 }});
 const result=await repository.recordFulfillmentAction(input);
 assert.equal(result.fulfillment.revision,2,'the historical receipt stays original');
 assert.equal(result.fulfillment.status,'配送中');
 assert.equal(Object.hasOwn(result,'value'),false,'pool transport metadata is not a business receipt');
 assert.deepEqual(workspace,current,`${replayed?'pool replay':'delayed fresh write'} must not restore an older fulfillment/todo bundle`);
 assert.equal(requestedMetadata,true,'repository must ask the pool whether a transaction replayed');
}
{
 const {workspace,input,receipt}=fixture();
 const repository=createPostgresFulfillmentActionTransactionRepository({queryJson:async()=>null,idempotentTransactionJson:async request=>request.includeReplayMetadata?{value:receipt,replayed:false}:receipt});
 const result=await repository.recordFulfillmentAction(input);
 assert.equal(result.fulfillment.revision,2);assert.equal(workspace.fulfillments[0].revision,2);assert.equal(workspace.fulfillments[0].status,'配送中');assert.equal(workspace.fulfillmentExceptions[0].status,'已解决');assert.equal(workspace.operationLogs.length,1);
}
{
 const {workspace,input,receipt}=fixture();
 // Another order updated shared stock/statement after this fulfillment's commit.
 input.operationLog.action='complete_fulfillment';
 workspace.inventories=[{id:'INV',inStock:100,reserved:10,revision:1}];
 workspace.statements=[{id:'ST',customerId:'C',received:0,revision:1}];
 const resultReceipt={...receipt,inventoryItems:[{inventoryItemId:'INV',onHandQty:90,reservedQty:0,revision:2}],statement:{id:'ST',customerId:'C',receivable:50,received:0,revision:2}};
 const repository=createPostgresFulfillmentActionTransactionRepository({queryJson:async()=>null,idempotentTransactionJson:async request=>{workspace.inventories[0]={id:'INV',inStock:70,reserved:5,revision:9};workspace.statements[0]={id:'ST',customerId:'C',receivable:50,received:50,revision:9};return request.includeReplayMetadata?{value:resultReceipt,replayed:false}:resultReceipt;}});
 await repository.recordFulfillmentAction(input);
 assert.equal(workspace.fulfillments[0].revision,2,'a current parent may still merge');
 assert.deepEqual(workspace.inventories,[{id:'INV',inStock:70,reserved:5,revision:9}]);
 assert.equal(workspace.statements[0].received,50);assert.equal(workspace.statements[0].revision,9);
}
console.log('PASS fulfillment pool-cache boundaries: original replay receipt without cache mutation, delayed new-write bundle never regresses current parent, normal new write still merges, newer shared stock/statement retained. Repository/pool transport isolated; no real database.');
