import assert from 'node:assert/strict';
import {normalizeCoreWorkspaceState} from '../../server/coreWorkspaceReadRepository.mjs';
import {createPostgresTodoActionRepository} from '../../server/todoActionRepository.mjs';
import {createPostgresTransactionExecutor} from '../../server/postgresTransactionExecutor.mjs';
import {createFulfillmentReadProjectionService} from '../../server/services/fulfillmentReadProjectionService.mjs';

export async function checkTodoFulfillmentRepairReplay({pool, postgresClient, repo, service, clock}) {
  const lineId = 'OL-LIVE-PROD-001';
  const todoId = 'T-PG-REPAIR';
  await pool.query("INSERT INTO packing_tasks(id,biz_no,order_line_id,planned_qty,actual_packed_qty,status) VALUES('PACK-PG-REPAIR','PACK-PG-REPAIR',$1,80,80,'已完成')", [lineId]);
  await pool.query("INSERT INTO packages(id,biz_no,order_line_id,package_seq,package_count,packed_qty,status) SELECT 'PK-PG-REPAIR-'||n,'PK-PG-REPAIR-'||n,$1,n,2,40,'待打印标签' FROM generate_series(1,2) n", [lineId]);
  await pool.query("INSERT INTO todos(id,biz_no,type,ref_type,ref_id,status,summary,created_at,updated_at) VALUES($1,$1,'出库交付待补建','order_line',$2,'未处理','合成补建',$3,$3)", [todoId,lineId,clock]);
  let captured;
  const workspace = {
    ...normalizeCoreWorkspaceState({
      orderLines:(await pool.query('SELECT * FROM order_lines WHERE id=$1',[lineId])).rows,
      customers:(await pool.query("SELECT * FROM customers WHERE id='C-LIVE-REPO'")).rows,
      packingTasks:(await pool.query('SELECT * FROM packing_tasks WHERE order_line_id=$1',[lineId])).rows,
      packages:(await pool.query('SELECT * FROM packages WHERE order_line_id=$1',[lineId])).rows,
    }),
    todoActionRepository:{...repo,repairMissingFulfillment:input=>{captured=input;return repo.repairMissingFulfillment(input);}},
  };
  const first = await service.repairMissingFulfillment({workspace,todoId,body:{reason:'隔离数据库重试核查',idempotencyKey:'pg-repair-original'},operatorId:'U-OFFICE-A'});
  assert.ok(first.fulfillment, JSON.stringify(first));
  assert.equal(first.packages.length,2);
  assert.ok(first.packages.every(record=>record.revision===2),'Binding fulfillment advances each package revision');
  const fulfillmentId=first.fulfillment.fulfillmentId;
  // Synthetic persisted progression; this does not claim printer/device acceptance.
  const later='2026-09-06T01:00:00.000Z';
  await pool.query("INSERT INTO print_records(id,biz_no,target_type,target_id,template_id,print_action,status,printed_by,printed_at) VALUES('PRINT-PG-REPAIR','PRINT-PG-REPAIR','fulfillment',$1,'tpl-p0-express-ltl-label','print','printed','U-OFFICE-A',$2)",[fulfillmentId,later]);
  await pool.query("UPDATE fulfillment_records SET status='待装车',driver_remark='后续交付备注',revision=revision+1,updated_at=$2 WHERE id=$1",[fulfillmentId,later]);
  await pool.query("UPDATE packages SET status='已打印',label_print_record_id='PRINT-PG-REPAIR',revision=revision+1,updated_at=$2 WHERE fulfillment_id=$1",[fulfillmentId,later]);
  workspace.todoActionRepository=repo;
  await pool.query("UPDATE todos SET status='已处理',handled_by='U-PRINT-DRIVER-A',handled_at=$2,handling_result='合成打印来源已完成',updated_at=$2 WHERE id=$1",[first.labelTodo.id,later]);
  const cold={todos:[],todoEvents:[],operationLogs:[],fulfillments:[],packages:[]};
  const retry=await repo.repairMissingFulfillment({...captured,workspace:cold,
    completedTodo:{...captured.completedTodo,lastAction:'错误的新投影'},
    labelTodo:{...captured.labelTodo,lastAction:'错误的新投影'},
    fulfillment:{...captured.fulfillment,goods:'错误的新货品'},
    oldTodoEvent:{...captured.oldTodoEvent,eventPayload:{todo:{...captured.completedTodo,lastAction:'错误事件'}}},
    operationLog:{...captured.operationLog,reason:'错误的新审计'},
  });
  assert.equal(retry.fulfillment.status,'待打印标签','Original receipt remains the original result');
  assert.equal(cold.fulfillments[0].status,'待装车','Repair replay must load current fulfillment');
  assert.equal(cold.fulfillments[0].revision,2);
  assert.equal(cold.fulfillments[0].driverRemark,'后续交付备注');
  assert.ok(cold.packages.every(record=>record.status==='已打印'));
  assert.ok(cold.packages.every(record=>record.revision===3));
  assert.ok(cold.fulfillments[0].packageRecords.every(record=>record.labelPrintRecordId==='PRINT-PG-REPAIR'));
  assert.equal(createFulfillmentReadProjectionService().getFulfillment({workspace:cold,fulfillmentId}).labelsPrinted,true);
  assert.equal(cold.todos.find(record=>record.id===first.labelTodo.id).handled,true);
  assert.equal(retry.todo.lastAction,first.todo.lastAction);
  assert.equal(retry.fulfillment.goods,first.fulfillment.goods);
  assert.equal(cold.operationLogs.find(record=>record.id===first.operationLogId).reason,captured.operationLog.reason);
  assert.equal(cold.todoEvents.find(record=>record.eventId===first.oldTodoEventId).eventPayload.todo.lastAction,captured.oldTodoEvent.eventPayload.todo.lastAction);
  assert.equal((await pool.query('SELECT count(*)::int n FROM fulfillment_records WHERE order_line_id=$1',[lineId])).rows[0].n,1);
  assert.equal((await pool.query('SELECT count(*)::int n FROM todo_events WHERE todo_id=$1',[todoId])).rows[0].n,1);
  const lookup=await repo.findFulfillmentRepairReplay({idempotencyKey:captured.idempotencyKey,idempotencyPayload:captured.idempotencyPayload});
  assert.deepEqual(lookup,first,'Early retry lookup also restores the original extended evidence');
  await assert.rejects(repo.repairMissingFulfillment({...captured,completedTodo:{...captured.completedTodo,id:'WRONG-TODO'}}),error=>error.code==='IDEMPOTENCY_KEY_REUSED');
  await assert.rejects(repo.findFulfillmentRepairReplay({idempotencyKey:captured.idempotencyKey,idempotencyPayload:{...captured.idempotencyPayload,reason:'changed'}}),error=>error.code==='IDEMPOTENCY_KEY_REUSED');

  // One snapshot read may finish after another request has refreshed newer state.
  let pause=true,notifyRead,releaseRead;
  const readCaptured=new Promise(resolve=>notifyRead=resolve);
  const readReleased=new Promise(resolve=>releaseRead=resolve);
  const delayedRepo=createPostgresTodoActionRepository({postgresClient,queryJson:async(text,values)=>{
    const result=await postgresClient.queryJson(text,values);
    if(pause&&text.includes("'state', json_build_object")){pause=false;notifyRead();await readReleased;}
    return result;
  }});
  const delayed=delayedRepo.repairMissingFulfillment({...captured,workspace:cold});
  await readCaptured;
  const newest='2026-09-06T02:00:00.000Z';
  await pool.query("UPDATE fulfillment_records SET status='待打印标签',revision=revision+1,updated_at=$2 WHERE id=$1",[fulfillmentId,newest]);
  await pool.query("UPDATE packages SET status='待打印标签',label_print_record_id=NULL,revision=revision+1,updated_at=$2 WHERE fulfillment_id=$1",[fulfillmentId,newest]);
  await pool.query("UPDATE print_records SET status='voided',void_reason='合成作废核查' WHERE id='PRINT-PG-REPAIR'");
  await service.handleTodo({workspace:{...cold,todoActionRepository:repo},todoId:first.labelTodo.id,body:{action:'reopen',idempotencyKey:'pg-repair-label-reopen'},operatorId:'U-OFFICE-A'});
  await repo.repairMissingFulfillment({...captured,workspace:cold});
  releaseRead();await delayed;
  assert.equal(cold.fulfillments[0].status,'待打印标签');assert.equal(cold.fulfillments[0].revision,3);
  assert.ok(cold.packages.every(record=>record.status==='待打印标签'&&record.revision===4));
  assert.ok(cold.fulfillments[0].packageRecords.every(record=>record.status==='待打印标签'&&record.revision===4));
  assert.equal(cold.printRecords[0].status,'voided','Delayed read cannot revive an obsolete printed record');
  assert.equal(createFulfillmentReadProjectionService().getFulfillment({workspace:cold,fulfillmentId}).labelsPrinted,false);
  assert.equal(cold.todos.find(record=>record.id===first.labelTodo.id).handled,false);

  let failCurrentRead=true;
  const failingReadRepo=createPostgresTodoActionRepository({postgresClient,queryJson:async(text,values)=>{
    if(failCurrentRead&&text.includes("'state', json_build_object")){failCurrentRead=false;throw new Error('Simulated post-commit read failure');}
    return postgresClient.queryJson(text,values);
  }});
  const recovery=await seedRepairFixture(pool,failingReadRepo,clock,'LOST');
  const lostRequest={workspace:recovery.workspace,todoId:recovery.todoId,operatorId:'U-OFFICE-A',body:{reason:'已提交后读取失败',idempotencyKey:'pg-repair-lost-response'}};
  await assert.rejects(service.repairMissingFulfillment(lostRequest),/post-commit read failure/);
  assert.equal(recovery.workspace.fulfillments.length,0);
  recovery.workspace.todoActionRepository=repo;
  const recovered=await service.repairMissingFulfillment(lostRequest);
  assert.ok(recovered.fulfillment);
  assert.equal(recovery.workspace.fulfillments[0].fulfillmentId,recovered.fulfillment.fulfillmentId);
  assert.equal(recovery.workspace.todos.find(record=>record.id===recovery.todoId).handled,true);
  assert.equal(recovery.workspace.todoEvents.length,2);
  assert.equal((await pool.query('SELECT count(*)::int n FROM fulfillment_records WHERE order_line_id=$1',[recovery.lineId])).rows[0].n,1);

  for(const sameKey of [true,false]){
    let arrivals=0,release;
    const barrier=new Promise(resolve=>release=resolve);
    const executor=createPostgresTransactionExecutor({postgresClient});
    const parallelRepo=createPostgresTodoActionRepository({postgresClient,idempotentTransactionJson:async request=>{
      if(++arrivals===2)release();await barrier;return executor.idempotentTransactionJson(request);
    }});
    const fixture=await seedRepairFixture(pool,parallelRepo,clock,sameKey?'SAME':'RACE');
    const results=await Promise.allSettled([0,1].map(index=>service.repairMissingFulfillment({workspace:fixture.workspace,todoId:fixture.todoId,operatorId:'U-OFFICE-A',body:{reason:'并发补建',idempotencyKey:sameKey?'pg-repair-same':`pg-repair-race-${index}`}})));
    assert.equal(results.filter(result=>result.status==='fulfilled').length,sameKey?2:1);
    if(sameKey)assert.deepEqual(results[0].value,results[1].value);
    else assert.equal(results.find(result=>result.status==='rejected').reason.statusCode,409);
    assert.equal((await pool.query('SELECT count(*)::int n FROM fulfillment_records WHERE order_line_id=$1',[fixture.lineId])).rows[0].n,1);
    assert.equal((await pool.query('SELECT count(*)::int n FROM todo_events WHERE todo_id=$1',[fixture.todoId])).rows[0].n,1);
    assert.equal((await pool.query("SELECT count(*)::int n FROM operation_logs WHERE target_type='todo' AND target_id=$1",[fixture.todoId])).rows[0].n,1);
    const winner=results.find(result=>result.status==='fulfilled').value;
    assert.equal((await pool.query("SELECT count(*)::int n FROM todos WHERE type='待打印标签' AND ref_id=$1",[winner.fulfillment.fulfillmentId])).rows[0].n,1);
    assert.equal((await pool.query('SELECT count(*)::int n FROM todo_events WHERE todo_id=$1',[winner.labelTodo.id])).rows[0].n,1);
    assert.equal((await pool.query('SELECT count(*)::int n FROM packages WHERE fulfillment_id=$1',[winner.fulfillment.fulfillmentId])).rows[0].n,2);
    assert.equal(fixture.workspace.packages.length,2);
  }
  // A collision in either event or the audit log rolls back every new object and the receipt.
  for(const field of ['oldTodoEvent','newTodoEvent','operationLog']){
    const fixture=await seedRepairFixture(pool,{...repo,repairMissingFulfillment:async input=>input},clock,field);
    const input=await service.repairMissingFulfillment({workspace:fixture.workspace,todoId:fixture.todoId,operatorId:'U-OFFICE-A',body:{reason:'回滚核查',idempotencyKey:`pg-repair-collision-${field}`}});
    const key=field==='operationLog'?'id':'eventId';
    input[field]={...input[field],[key]:captured[field][key]};
    await assert.rejects(repo.repairMissingFulfillment(input),error=>error.code==='23505');
    assert.equal((await repo.getTodo({todoId:fixture.todoId})).handled,false);
    assert.equal((await pool.query('SELECT count(*)::int n FROM fulfillment_records WHERE order_line_id=$1',[fixture.lineId])).rows[0].n,0);
    assert.equal((await pool.query('SELECT count(*)::int n FROM packages WHERE order_line_id=$1 AND fulfillment_id IS NOT NULL',[fixture.lineId])).rows[0].n,0);
    assert.equal((await pool.query('SELECT count(*)::int n FROM todos WHERE id=$1',[input.labelTodo.id])).rows[0].n,0);
    assert.equal((await pool.query('SELECT count(*)::int n FROM todo_events WHERE todo_id=$1 OR todo_id=$2',[fixture.todoId,input.labelTodo.id])).rows[0].n,0);
    assert.equal((await pool.query('SELECT count(*)::int n FROM operation_logs WHERE target_id=$1',[fixture.todoId])).rows[0].n,0);
    assert.equal((await pool.query('SELECT count(*)::int n FROM operation_idempotency_keys WHERE idempotency_key=$1',[input.idempotencyKey])).rows[0].n,0);
  }
  console.log('PASS fulfillment repair: current records/print projection, package revisions, immutable receipt/audits, post-commit recovery, delayed-read/void ordering, same/different-key concurrency, all-object rollback on three audit collisions. Synthetic progression only.');
}

export async function seedRepairFixture(pool,repo,clock,suffix){
  const lineId=`OL-PG-REPAIR-${suffix}`,todoId=`T-PG-REPAIR-${suffix}`,packingId=`PACK-PG-REPAIR-${suffix}`;
  await pool.query("INSERT INTO order_lines SELECT (jsonb_populate_record(NULL::order_lines,to_jsonb(source)||jsonb_build_object('id',$1::text,'biz_no',$1::text))).* FROM order_lines source WHERE id='OL-LIVE-PROD-001'",[lineId]);
  await pool.query("INSERT INTO packing_tasks(id,biz_no,order_line_id,planned_qty,actual_packed_qty,status) VALUES($1,$1,$2,80,80,'已完成')",[packingId,lineId]);
  await pool.query("INSERT INTO packages(id,biz_no,order_line_id,package_seq,package_count,packed_qty,status) SELECT $2||'-'||n,$2||'-'||n,$1,n,2,40,'待打印标签' FROM generate_series(1,2) n",[lineId,packingId]);
  await pool.query("INSERT INTO todos(id,biz_no,type,ref_type,ref_id,status,summary,created_at,updated_at) VALUES($1,$1,'出库交付待补建','order_line',$2,'未处理','合成补建',$3,$3)",[todoId,lineId,clock]);
  const workspace={...normalizeCoreWorkspaceState({
    orderLines:(await pool.query('SELECT * FROM order_lines WHERE id=$1',[lineId])).rows,
    customers:(await pool.query("SELECT * FROM customers WHERE id='C-LIVE-REPO'")).rows,
    packingTasks:(await pool.query('SELECT * FROM packing_tasks WHERE order_line_id=$1',[lineId])).rows,
    packages:(await pool.query('SELECT * FROM packages WHERE order_line_id=$1',[lineId])).rows,
  }),todoActionRepository:repo};
  return {workspace,lineId,todoId};
}
