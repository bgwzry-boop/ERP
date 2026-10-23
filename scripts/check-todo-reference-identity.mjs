import assert from 'node:assert/strict';
import { resolveTodoReference, normalizeTodoReferenceForWrite, listTodoReferenceCandidates } from '../server/services/todoReferenceService.mjs';
const cases = [
 {workspace:{orderLines:[{id:'O-1',orderNo:'O'},{id:'O-2',orderNo:'O'}]},todo:{type:'订单待办',refType:'order_line',refId:'O'},exact:'O-2'},
 {workspace:{fulfillments:[{id:'F-1',orderLineId:'O-1'},{id:'F-2',orderLineId:'O-1'}]},todo:{type:'出库数量异常',refType:'fulfillment',refId:'O-1'},exact:'F-2'},
 {workspace:{statements:[{id:'ST-1',lineIds:['O-1']},{id:'ST-2',lineIds:['O-1']}]},todo:{type:'对账待办',refType:'statement',refId:'O-1'},exact:'ST-2'},
];
for(const {workspace,todo,exact} of cases){
 const before=JSON.stringify(workspace);
 assert.equal(resolveTodoReference(workspace,todo).referenceStatus,'unverifiable','An alias matching multiple records must not choose the first');
 assert.throws(()=>normalizeTodoReferenceForWrite(workspace,todo),error=>error.code==='TODO_REFERENCE_AMBIGUOUS');
 assert.equal(resolveTodoReference(workspace,{...todo,refId:exact}).resolvedRefId,exact);
 assert.equal(JSON.stringify(workspace),before);
 const one=Object.fromEntries(Object.entries(workspace).map(([key,items])=>[key,items.slice(0,1)]));
 assert.equal(resolveTodoReference(one,todo).referenceStatus,'valid','Unique historical aliases remain compatible');
}
for(const [type,collection,key] of [['production_task','productionTasks','productionTaskId'],['maintenance_task','maintenanceTasks','taskId'],['inventory_item','inventories','inventoryKey'],['inventory_correction','inventoryCorrectionDrafts','correctionDraftId']]) {
 const workspace={[collection]:[{[key]:'CANONICAL'}]};const todo={refType:type,refId:'CANONICAL'};
 assert.equal(resolveTodoReference(workspace,todo).resolvedRefId,'CANONICAL');
 assert.equal(normalizeTodoReferenceForWrite(workspace,todo).refId,'CANONICAL');
}
assert.equal(resolveTodoReference({orderLines:[{orderNo:'O'}]},{refType:'order_line',refId:'O'}).referenceStatus,'unverifiable');
console.log('PASS todo reference identity: ambiguous order/fulfillment/statement aliases blocked, exact and unique legacy references retained, alternate canonical IDs preserved, no workspace mutation.');

const customerWorkspace = {
 todos:[],
 orderDrafts:[{id:'D-B',customerId:'C-B'}],
 orderLines:[{id:'O-A',customerId:'C-A'},{id:'O-B',customerId:'C-B'}],
 fulfillments:[{id:'F-B',orderLineId:'O-B'}],
 productionTasks:[{id:'P-B',orderLineId:'O-B'}],
 statements:[{id:'ST-B',customerId:'C-B'}],
};
for(const [refType,refId] of [['order_draft','D-B'],['order_line','O-B'],['fulfillment','F-B'],['production_task','P-B'],['statement','ST-B']]) {
 const todo={refType,refId,customerId:'C-A'};
 assert.equal(resolveTodoReference(customerWorkspace,todo).referenceStatus,'unverifiable','Existing record IDs must not make a cross-customer reference valid');
 assert.throws(()=>normalizeTodoReferenceForWrite(customerWorkspace,todo),error=>error.code==='TODO_REFERENCE_CUSTOMER_MISMATCH');
 assert.equal(resolveTodoReference(customerWorkspace,{...todo,customerId:'C-B'}).referenceStatus,'valid');
}

const { createWorkspaceRecordService } = await import('../server/services/workspaceRecordService.mjs');
const { createTodoCommandService } = await import('../server/services/todoCommandService.mjs');
const { createLocalTodoActionRepository } = await import('../server/todoActionRepository.mjs');
const wrong = {id:'TODO-CUSTOMER',type:'订单待办',refType:'order_line',refId:'O-B',customerId:'C-A'};
assert.throws(()=>createWorkspaceRecordService().buildTodo(customerWorkspace,wrong),error=>error.code==='TODO_REFERENCE_CUSTOMER_MISMATCH');
assert.deepEqual(listTodoReferenceCandidates(customerWorkspace,wrong).map(item=>item.refId),['O-A']);
const original = {...wrong,refId:'O-B',ref:'O-B',handled:false,updatedAt:'2026-09-06T00:00:00Z'};
const local = {...customerWorkspace,todos:[original],todoEvents:[],operationLogs:[],todoActionRepository:createLocalTodoActionRepository()};
const service=createTodoCommandService({buildOperationLog:(_workspace,input)=>input});
const before=JSON.stringify({todos:local.todos,events:local.todoEvents,logs:local.operationLogs});
const rejected=await service.repairTodoReference({workspace:local,todoId:original.id,operatorId:'U-TEST',body:{refType:'order_line',refId:'O-B',reason:'合成核查',idempotencyKey:'customer-repair-test'}});
assert.equal(rejected.statusCode,422);assert.equal(rejected.code,'TODO_REFERENCE_CUSTOMER_MISMATCH');assert.match(rejected.message,/客户归属不一致/);
assert.equal(JSON.stringify({todos:local.todos,events:local.todoEvents,logs:local.operationLogs}),before);
const repaired=await service.repairTodoReference({workspace:local,todoId:original.id,operatorId:'U-TEST',body:{refType:'order_line',refId:'O-A',reason:'合成核查',idempotencyKey:'customer-repair-ok'}});
assert.equal(repaired.todo.refId,'O-A');assert.equal(repaired.todo.referenceRepair.beforeRefId,'O-B');assert.equal(local.todoEvents.length,1);assert.equal(local.operationLogs.length,1);
const conflicting={...customerWorkspace,productionTasks:[{id:'P-CONFLICT',customerId:'C-A',orderLineId:'O-B'}]};
assert.equal(resolveTodoReference(conflicting,{refType:'production_task',refId:'P-CONFLICT',customerId:'C-A'}).referenceStatus,'unverifiable');
console.log('PASS customer-owned todo references: five target types, linked order ownership, contradictory target facts, candidate filtering, actual buildTodo rejection and local audited repair isolation.');

assert.deepEqual(listTodoReferenceCandidates({orderLines:[{id:'DUP',customerId:'C-A'},{id:'DUP',customerId:'C-A'}]}, {...wrong,refId:'MISSING'}),[]);
const many={orderLines:Array.from({length:10000},(_,i)=>({id:`LINE-${i}`,customerId:i%2?'C-A':'C-B'}))};
assert.equal(listTodoReferenceCandidates(many,{...wrong,refId:'MISSING'},50).length,50);
assert(listTodoReferenceCandidates(many,{...wrong,refId:'MISSING'},50).every(item=>Number(item.refId.split('-')[1])%2===1));

const replay=await service.repairTodoReference({workspace:local,todoId:original.id,operatorId:'U-TEST',body:{refType:'order_line',refId:'O-A',reason:'合成核查',idempotencyKey:'customer-repair-ok'}});
assert.equal(replay.operationLogId,repaired.operationLogId,'A lost successful repair response must replay before the now-valid state guard');
const retryBody={refType:'order_line',refId:'O-A',reason:'合成核查',idempotencyKey:'customer-repair-ok'};
local.todos[0]={...local.todos[0],handled:true,status:'已处理',updatedAt:'2026-09-07T00:00:00Z'};
const latestState=JSON.stringify(local.todos);
assert.equal((await service.repairTodoReference({workspace:local,todoId:original.id,body:retryBody})).operationLogId,repaired.operationLogId);
assert.equal(JSON.stringify(local.todos),latestState,'Old receipt replay must not roll back subsequent handling');
assert.equal(local.todoEvents.length,1);assert.equal(local.operationLogs.length,1);
for(const request of [{todoId:'OTHER-TODO',body:retryBody},{todoId:original.id,body:{...retryBody,reason:'不同依据'}}]) {
 await assert.rejects(service.repairTodoReference({workspace:local,...request}),e=>e.code==='IDEMPOTENCY_KEY_REUSED'&&e.statusCode===409);
}
const {createPostgresTodoActionRepository}=await import('../server/todoActionRepository.mjs');
const {buildIdempotencyRequestHash}=await import('../server/idempotency.mjs');
for(const historical of [false,true]) {
 const saved={todo:{...repaired.todo,referenceRepair:undefined},todoEventId:repaired.todoEvent.eventId,operationLogId:repaired.operationLogId,...(!historical?{todoEvent:repaired.todoEvent,operationLog:local.operationLogs[0]}:{})};
 let writes=0,eventReads=0;
 const pg=createPostgresTodoActionRepository({queryJson(text){
  if(text.includes('operation_idempotency_keys')) return {requestHash:buildIdempotencyRequestHash({refType:'order_line',refId:'O-A',reason:'合成核查'}),response:saved};
  if(text.includes('FROM todo_events')){eventReads++;return repaired.todoEvent;}
  if(text.includes('FROM operation_logs'))return local.operationLogs[0];
  throw new Error('Retry must not fetch mutable current todo');
 },idempotentTransactionJson(){writes++;throw new Error('Retry must not write');}});
 const actual=await service.repairTodoReference({workspace:{todoActionRepository:pg},todoId:original.id,body:retryBody});
 assert.equal(actual.operationLogId,repaired.operationLogId);
 assert.equal(actual.todo.referenceRepair.beforeRefId,'O-B');
 assert.equal(writes,0);assert.equal(eventReads,historical?1:0);
 await assert.rejects(service.repairTodoReference({workspace:{todoActionRepository:pg},todoId:'OTHER-TODO',body:retryBody}),e=>e.code==='IDEMPOTENCY_KEY_REUSED');
}
console.log('PASS todo repair retry: original receipt survives later handling; changed payload/cross-todo keys rejected; PostgreSQL adapter replays immutable event evidence without writes.');
