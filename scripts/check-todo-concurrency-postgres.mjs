import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import pg from 'pg';
import {loadMigrationFiles,validateMigrationSet} from './dbMigrationUtils.mjs';
import {postgresLiveBusinessSeedSql} from './helpers/postgresLiveBusinessSeed.mjs';
import {createPostgresPoolClient} from '../server/postgresPoolClient.mjs';
import {createPostgresTodoActionRepository} from '../server/todoActionRepository.mjs';
import {createTodoCommandService} from '../server/services/todoCommandService.mjs';
import {createPostgresTransactionExecutor} from '../server/postgresTransactionExecutor.mjs';
import {checkTodoFulfillmentRepairReplay} from './helpers/checkTodoFulfillmentRepairReplay.mjs';
import {checkPrintTodoSourceCompletion} from './helpers/checkPrintTodoSourceCompletion.mjs';
const name=`erp-todo-concurrency-${process.pid}-${Date.now()}`;
const docker=args=>{const result=spawnSync('docker',args,{encoding:'utf8'});if(result.status!==0)throw new Error(result.stderr||result.stdout);return result.stdout.trim();};
const clock='2026-09-06T00:00:00.000Z';let pool;
try{
 docker(['run','--rm','-d','--name',name,'-p','127.0.0.1::5432','-e','POSTGRES_DB=erp','-e','POSTGRES_USER=erp','-e','POSTGRES_PASSWORD=erp','postgres:16-alpine']);
 for(let i=0;i<60;i++){if(spawnSync('docker',['exec',name,'pg_isready','-h','127.0.0.1','-U','erp']).status===0)break;if(i===59)throw Error('Isolated PostgreSQL startup timeout');await new Promise(resolve=>setTimeout(resolve,250));}
 pool=new pg.Pool({host:'127.0.0.1',port:Number(docker(['port',name,'5432/tcp']).split(':').at(-1)),database:'erp',user:'erp',password:'erp',statement_timeout:15000});
 const migrations=loadMigrationFiles();validateMigrationSet(migrations);for(const migration of migrations)await pool.query(migration.sql);await pool.query(postgresLiveBusinessSeedSql);
 const postgresClient=createPostgresPoolClient({pool});const repo=createPostgresTodoActionRepository({postgresClient});
 const service=createTodoCommandService({now:()=>new Date(clock),buildOperationLog:(_workspace,input)=>({...input,occurredAt:clock,createdAt:clock})});
 await checkTodoFulfillmentRepairReplay({pool,postgresClient,repo,service,clock});
 await checkPrintTodoSourceCompletion({pool,postgresClient,repo,service,clock});
 const seed=async id=>pool.query("INSERT INTO todos(id,biz_no,type,ref_type,ref_id,status,summary,created_at,updated_at) VALUES($1,$1,'订单待办','order_line','O-A','未处理','合成待办',$2,$2)",[id,clock]);
 const workspaceFor=repository=>({todos:[],todoEvents:[],operationLogs:[],orderLines:[{id:'O-A',customerId:'C001'}],todoActionRepository:repository});
 const command=(workspace,todoId,action,key)=>({workspace,todoId,operatorId:'U-OFFICE-A',body:{action,idempotencyKey:key}});
 const counts=async id=>(await pool.query('SELECT (SELECT count(*)::int FROM todo_events WHERE todo_id=$1) events,(SELECT count(*)::int FROM operation_logs WHERE target_id=$1) logs',[id])).rows[0];
 await seed('T-PG-STATE');let firstInput;
 const workspace=workspaceFor({...repo,recordTodoAction:async input=>{if(!firstInput)firstInput=input;return repo.recordTodoAction(input);}});
 const firstRequest=command(workspace,'T-PG-STATE','mark_handled','pg-todo-original-close');
 const first=await service.handleTodo(firstRequest);assert.equal(first.todo.handled,true);assert.equal(first.todo.handledAt,clock);assert.equal(first.todo.updatedAt,'2026-09-06T00:00:00.001Z');
 assert.equal((await service.handleTodo(command(workspace,'T-PG-STATE','mark_handled','pg-todo-duplicate-close'))).code,'TODO_ALREADY_HANDLED');
 await service.handleTodo(command(workspace,'T-PG-STATE','reopen','pg-todo-explicit-reopen'));
 assert.equal((await repo.getTodo({todoId:'T-PG-STATE'})).handled,false);
 assert.equal((await service.handleTodo(firstRequest)).operationLogId,first.operationLogId);assert.equal(workspace.todos[0].handled,false);assert.deepEqual(await counts('T-PG-STATE'),{events:2,logs:2});
 // A transaction-level replay can still occur after an early replay lookup misses.
 const originalReplay=await repo.recordTodoAction(firstInput);
 assert.equal(originalReplay.operationLogId,first.operationLogId);
 assert.equal(originalReplay.todo.handled,true,'Original response must stay immutable');
 assert.equal(workspace.todos[0].handled,false,'Old transaction replay must not overwrite the newer workspace state');
 assert.equal((await repo.getTodo({todoId:'T-PG-STATE'})).handled,false);
 assert.equal((await repo.getTodo({todoId:'T-PG-STATE'})).lastAction,'重新打开','Current event projection follows the current version when event clocks tie');
 const drifted={...firstInput,todo:{...firstInput.todo,lastAction:'invented current projection'},todoEvent:{...firstInput.todoEvent,eventPayload:{todo:{...firstInput.todo,lastAction:'invented event'}}},operationLog:{...firstInput.operationLog,after:{...firstInput.todo,lastAction:'invented audit'}}};
 await pool.query("UPDATE operation_idempotency_keys SET response_json=response_json-'todoEvent'-'operationLog' WHERE scope='todo.action.mark_handled' AND idempotency_key=$1",[firstInput.idempotencyKey]);
 const cold=workspaceFor(repo);const historical=await repo.recordTodoAction({...drifted,workspace:cold});
 assert.equal(historical.todo.lastAction,first.todo.lastAction);assert.equal(cold.todos[0].handled,false);assert.equal(cold.todos[0].lastAction,'重新打开');
 assert.equal(cold.todoEvents[0].eventPayload.todo.lastAction,first.todo.lastAction);assert.equal(cold.operationLogs[0].after.lastAction,first.todo.lastAction);
 assert.deepEqual(await counts('T-PG-STATE'),{events:2,logs:2});
 const replayLookup=await repo.findTodoActionReplay({action:firstInput.action,todoId:'T-PG-STATE',idempotencyKey:firstInput.idempotencyKey,idempotencyPayload:firstInput.idempotencyPayload});assert.equal(replayLookup.operationLogId,first.operationLogId);
 await assert.rejects(repo.findTodoActionReplay({action:firstInput.action,todoId:'T-WRONG',idempotencyKey:firstInput.idempotencyKey,idempotencyPayload:firstInput.idempotencyPayload}),error=>error.code==='IDEMPOTENCY_KEY_REUSED');
 await seed('T-PG-COLLISION');const collisionBefore=await repo.getTodo({todoId:'T-PG-COLLISION'});
 for(const field of ['event','log']){
  const after={...collisionBefore,status:'已处理',handled:true,handledBy:'U-OFFICE-A',handledAt:clock,updatedAt:'2026-09-06T00:00:00.001Z'};const key=`pg-todo-collision-${field}`;
  const collision={...firstInput,workspace:workspaceFor(repo),before:collisionBefore,expectedUpdatedAt:collisionBefore.updatedAt,todo:after,todoEvent:{...firstInput.todoEvent,todoId:after.id,eventId:field==='event'?firstInput.todoEvent.eventId:'TE-PG-COLLISION',eventPayload:{todo:after}},operationLog:{...firstInput.operationLog,id:field==='log'?firstInput.operationLog.id:'LOG-PG-COLLISION',targetId:after.id,before:collisionBefore,after},idempotencyKey:key,idempotencyPayload:{action:'mark_handled',todoId:after.id}};
  await assert.rejects(repo.recordTodoAction(collision));assert.deepEqual(await repo.getTodo({todoId:after.id}),collisionBefore);assert.deepEqual(await counts(after.id),{events:0,logs:0});
  assert.equal((await pool.query('SELECT count(*)::int n FROM operation_idempotency_keys WHERE idempotency_key=$1',[key])).rows[0].n,0);
 }
 await seed('T-PG-DELAY');let pauseRead=false,captured,releaseRead;const capturedRead=new Promise(resolve=>captured=resolve);const readRelease=new Promise(resolve=>releaseRead=resolve);const executorForDelay=createPostgresTransactionExecutor({postgresClient});
 const delayedRepo=createPostgresTodoActionRepository({postgresClient,idempotentTransactionJson:async request=>{const result=await executorForDelay.idempotentTransactionJson(request);pauseRead=true;return result;},queryJson:async(text,values)=>{const result=await postgresClient.queryJson(text,values);if(pauseRead&&text.includes('latest_event')){pauseRead=false;captured();await readRelease;}return result;}});
 const delayedWorkspace=workspaceFor(delayedRepo);const delayedClose=service.handleTodo(command(delayedWorkspace,'T-PG-DELAY','mark_handled','pg-todo-delayed-close'));await capturedRead;
 delayedWorkspace.todoActionRepository=repo;await service.handleTodo(command(delayedWorkspace,'T-PG-DELAY','reopen','pg-todo-delayed-reopen'));releaseRead();await delayedClose;
 assert.equal(delayedWorkspace.todos[0].handled,false);assert.equal(delayedWorkspace.todos[0].lastAction,'重新打开');assert.deepEqual(await counts('T-PG-DELAY'),{events:2,logs:2});
 for(const sameKey of [false,true]){
  const id=sameKey?'T-PG-SAME':'T-PG-RACE';await seed(id);let arrivals=0,release;const barrier=new Promise(resolve=>release=resolve);const executor=createPostgresTransactionExecutor({postgresClient});
  const parallel=createPostgresTodoActionRepository({postgresClient,idempotentTransactionJson:async request=>{if(++arrivals===2)release();await barrier;return executor.idempotentTransactionJson(request);}});
  const shared=workspaceFor(parallel);const results=await Promise.allSettled([0,1].map(index=>service.handleTodo(command(shared,id,'mark_handled',sameKey?'pg-todo-same-command':`pg-todo-racing-${index}`))));
  assert.equal(results.filter(item=>item.status==='fulfilled').length,sameKey?2:1);
  if(sameKey)assert.equal(results[0].value.operationLogId,results[1].value.operationLogId);else assert.equal(results.find(item=>item.status==='rejected').reason.statusCode,409);
  assert.deepEqual(await counts(id),{events:1,logs:1});assert.equal(shared.todos[0].handled,true);
 }
 console.log(`PASS real PostgreSQL todo: ${migrations.length} migrations; same-millisecond races, same-key convergence, explicit reopen, original receipt replay, no workspace rollback, delayed-read ordering, historical receipt/audit hydration, audit-identity collision rollback. Isolated data only.`);
}finally{await pool?.end();spawnSync('docker',['rm','-f',name],{stdio:'ignore'});}
