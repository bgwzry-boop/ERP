import assert from 'node:assert/strict';
import {createTodoCommandService} from '../server/services/todoCommandService.mjs';
import {createLocalTodoActionRepository} from '../server/todoActionRepository.mjs';
import {getTodoActions} from '../src/domain/officeRules.js';
const todo={id:'T-RETAKE-CLOSE',type:'成品图需重拍',status:'未处理',handled:false,updatedAt:'2026-09-08T00:00:00Z'};
const workspace={todos:[todo],todoEvents:[],operationLogs:[],todoActionRepository:createLocalTodoActionRepository()};
let audits=0;
const service=createTodoCommandService({buildOperationLog:()=>{audits++;return {id:'unexpected'};}});
for(const action of ['mark_handled','batch_print_confirm','customer_notification_sent']){
 const before=JSON.stringify(workspace);
 const result=await service.handleTodo({workspace,todoId:todo.id,body:{action},operatorId:'U-OFFICE'});
 assert.equal(result.code,'TODO_PHOTO_REVIEW_REQUIRED',action);
 assert.equal(JSON.stringify(workspace),before);
}
assert.equal(audits,0);
for(const referenceStatus of ['valid','missing','unverifiable']){
 assert.ok(!getTodoActions({...todo,referenceStatus}).some(a=>a.label==='处理完成'));
}
console.log('PASS retake cannot close via generic completion/print/notification; no audit or state mutation; UI removes completion');
todo.type='生产异常';
todo.status='处理中';
todo.summary='印刷问题 / 已转售后/质量问题';
for(const action of ['mark_handled','batch_print_confirm','customer_notification_sent']){
 const before=JSON.stringify(workspace);
 const result=await service.handleTodo({workspace,todoId:todo.id,body:{action},operatorId:'U-OFFICE'});
 assert.equal(result.code,'TODO_PRODUCTION_EXCEPTION_RESOLUTION_REQUIRED',action);
 assert.equal(JSON.stringify(workspace),before);
}
assert.equal(audits,0);
for(const referenceStatus of ['valid','missing','unverifiable']){
 const actions=getTodoActions({...todo,referenceStatus});
 assert.ok(!actions.some(a=>a.label==='处理完成'));
 if(referenceStatus==='valid')assert.equal(actions[0]?.label,'打开生产任务');
}
console.log('PASS production exception remains open until its source decision; quality follow-up cannot be dismissed as a generic todo');
