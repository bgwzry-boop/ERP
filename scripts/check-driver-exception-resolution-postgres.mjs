import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import pg from 'pg';
import { loadMigrationFiles, validateMigrationSet } from './dbMigrationUtils.mjs';
import { postgresLiveBusinessSeedSql } from './helpers/postgresLiveBusinessSeed.mjs';
import { createPostgresPoolClient } from '../server/postgresPoolClient.mjs';
import { createPostgresFulfillmentActionTransactionRepository } from '../server/fulfillmentActionTransactionRepository.mjs';
import { prepareDriverDeliveryExceptionResolution } from '../server/services/driverDeliveryExceptionResolutionPolicy.mjs';
import { createPostgresCoreWorkspaceReadRepository } from '../server/coreWorkspaceReadRepository.mjs';
import { createFulfillmentReadProjectionService } from '../server/services/fulfillmentReadProjectionService.mjs';
import { createPostgresDriverDeliveryTaskReadRepository } from '../server/driverDeliveryTaskReadRepository.mjs';
const name = `erp-driver-resolution-${process.pid}-${Date.now()}`;
const docker = (args) => { const result = spawnSync('docker', args, { encoding: 'utf8' }); if (result.status !== 0) throw Error(result.stderr || result.stdout); return result.stdout.trim(); };
let pool, blocker;
try {
  docker(['run', '--rm', '-d', '--name', name, '-p', '127.0.0.1::5432', '-e', 'POSTGRES_DB=erp', '-e', 'POSTGRES_USER=erp', '-e', 'POSTGRES_PASSWORD=erp', 'postgres:16-alpine']);
  for (let attempt = 0; attempt < 60; attempt++) {
    if (spawnSync('docker', ['exec', name, 'pg_isready', '-h', '127.0.0.1', '-U', 'erp']).status === 0) break;
    if (attempt === 59) throw Error('PostgreSQL startup timeout');
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  const port = Number(docker(['port', name, '5432/tcp']).split(':').at(-1));
  pool = new pg.Pool({ host: '127.0.0.1', port, database: 'erp', user: 'erp', password: 'erp', statement_timeout: 15000 });
  const migrations = loadMigrationFiles(); validateMigrationSet(migrations);
  for (const migration of migrations) await pool.query(migration.sql);
  await pool.query(postgresLiveBusinessSeedSql);
  await pool.query(`UPDATE fulfillment_records SET status='送货异常', physical_outbound_at='2026-09-04T00:00:00Z', loaded_at='2026-09-04T01:00:00Z' WHERE id='F002';
    INSERT INTO todos(id,biz_no,type,ref_type,ref_id,priority,status,summary) VALUES ('TODO-RESOLVE','TODO-RESOLVE','送货异常待处理','fulfillment','F002','normal','未处理','司机等待联系客户');
    INSERT INTO fulfillment_exceptions(id,fulfillment_id,exception_type,expected_qty,actual_qty,reason_code,reason,todo_id,reported_by) VALUES ('EX-RESOLVE','F002','delivery_exception',1200,0,'customer_unavailable','客户不在','TODO-RESOLVE','U-DRIVER-A');`);
  const repository = createPostgresFulfillmentActionTransactionRepository({ postgresClient: createPostgresPoolClient({ pool }) });
  const workspace = { fulfillments: [{ id:'F002', fulfillmentId:'F002', orderLineId:'ORD-0629-002-01', customerId:'C002', method:'送货', status:'送货异常', revision:1, expectedQty:1200, actualQty:1200, physicalOutboundAt:'2026-09-04T00:00:00Z', loadedAt:'2026-09-04T01:00:00Z', createdBy:'U-OFFICE-A' }], fulfillmentExceptions:[{ id:'EX-RESOLVE', exceptionId:'EX-RESOLVE', fulfillmentId:'F002', exceptionType:'delivery_exception', status:'待办公室处理', expectedQty:1200, actualQty:0, reasonCode:'customer_unavailable', reason:'客户不在', todoId:'TODO-RESOLVE', reportedBy:'U-DRIVER-A' }], todos:[{ id:'TODO-RESOLVE', type:'送货异常待处理', refId:'F002', status:'未处理' }] };
  const coldReader = () => createPostgresCoreWorkspaceReadRepository({ postgresClient: createPostgresPoolClient({ pool }) }).loadState();
  const coldBefore = await coldReader();
  const officeBefore = createFulfillmentReadProjectionService().getFulfillment({ workspace: coldBefore, fulfillmentId: 'F002' });
  assert.equal(officeBefore.deliveryExceptions[0].exceptionId, 'EX-RESOLVE');
  assert.equal(officeBefore.deliveryExceptions[0].actualQty, 0);
  const driverReader = createPostgresDriverDeliveryTaskReadRepository({ postgresClient: createPostgresPoolClient({ pool }) });
  const driverBefore = await driverReader.getDriverDeliveryTask({ fulfillmentId:'F002', operatorId:'U-DRIVER-A' });
  assert.equal(driverBefore.status,'送货异常'); assert.equal(driverBefore.exceptionReason,'客户不在');
  const body = { fulfillmentId:'F002', exceptionId:'EX-RESOLVE', expectedRevision:1, reason:'客户已联系，原数量继续配送', confirmed:true, quantityVerified:true, idempotencyKey:'resolve-live' };
  const makeInput = () => {
    const p = prepareDriverDeliveryExceptionResolution({ workspace, fulfillmentId:'F002', body, operatorId:'U-OFFICE-A' }); assert.equal(p.ok,true,JSON.stringify(p));
    return { workspace, idempotencyKey:body.idempotencyKey, idempotencyPayload:{ ...body, operatorId:'U-OFFICE-A' }, fulfillment:p.after, fulfillmentException:p.updatedException, driverExceptionBefore:p.exception, driverExceptionTodoBefore:p.currentTodo, todo:p.todo, operationLog:{ id:'LOG-RESOLVE', targetType:'fulfillment', targetId:'F002', action:'resolve_driver_delivery_exception', operatorId:'U-OFFICE-A', before:{ fulfillment:p.before, exception:p.exception, todo:p.currentTodo }, after:{ fulfillment:p.after, exception:p.updatedException, todo:p.todo }, reason:p.reason } };
  };
  const originalFulfillment=(await pool.query("SELECT to_jsonb(f) - 'status' - 'revision' - 'updated_at' AS value FROM fulfillment_records f WHERE id='F002'")).rows[0].value;
  const input = makeInput();
  blocker = await pool.connect(); await blocker.query('BEGIN');
  await blocker.query("UPDATE todos SET status='已处理', handled_by='U-OFFICE-B', handled_at='2026-09-05T00:00:00Z', handling_result='同事已联系客户' WHERE id='TODO-RESOLVE'");
  const pending = repository.recordFulfillmentAction(input).then(value=>({value}),error=>({error}));
  let waited=false;
  for(let i=0;i<100;i++) { const {rows}=await pool.query("SELECT count(*)::int AS count FROM pg_stat_activity WHERE pid<>pg_backend_pid() AND wait_event_type='Lock' AND query LIKE '%locked_driver_exception_todo%'"); if(rows[0].count){waited=true;break;} await new Promise(r=>setTimeout(r,20)); }
  await blocker.query('COMMIT'); blocker.release(); blocker=null;
  const rejected=await pending; assert.equal(waited,true, rejected.error?.stack || JSON.stringify(rejected)); assert.ok(rejected.error,JSON.stringify(rejected));
  assert.equal((await pool.query("SELECT status FROM fulfillment_records WHERE id='F002'")).rows[0].status,'送货异常');
  assert.equal((await pool.query("SELECT status FROM fulfillment_exceptions WHERE id='EX-RESOLVE'")).rows[0].status,'待办公室处理');
  assert.equal((await pool.query("SELECT count(*)::int AS count FROM operation_logs WHERE id='LOG-RESOLVE'")).rows[0].count,0);
  Object.assign(workspace.todos[0],{ status:'已处理', handled:true, handledBy:'U-OFFICE-B', handledAt:'2026-09-05T00:00:00Z', handlingResult:'同事已联系客户' });
  const accepted=await repository.recordFulfillmentAction(makeInput()); assert.equal(accepted.fulfillment.status,'配送中');
  assert.deepEqual((await pool.query("SELECT to_jsonb(f) - 'status' - 'revision' - 'updated_at' AS value FROM fulfillment_records f WHERE id='F002'")).rows[0].value,originalFulfillment);
  const persisted=(await pool.query("SELECT status,handled_by,handling_result FROM todos WHERE id='TODO-RESOLVE'")).rows[0];
  assert.deepEqual(persisted,{status:'已处理',handled_by:'U-OFFICE-B',handling_result:'同事已联系客户'});
  const original=(await pool.query("SELECT status,actual_qty,reason,reported_by FROM fulfillment_exceptions WHERE id='EX-RESOLVE'")).rows[0];
  assert.deepEqual(original,{status:'已解决',actual_qty:0,reason:'客户不在',reported_by:'U-DRIVER-A'});
  const coldAfter = await coldReader();
  const officeAfter = createFulfillmentReadProjectionService().getFulfillment({ workspace:coldAfter, fulfillmentId:'F002' });
  assert.equal(officeAfter.status,'配送中'); assert.equal(officeAfter.deliveryExceptions[0].status,'已解决');
  assert.equal(officeAfter.deliveryExceptions[0].reason,'客户不在');
  const driverAfter = await driverReader.getDriverDeliveryTask({ fulfillmentId:'F002', operatorId:'U-DRIVER-A' });
  assert.equal(driverAfter.status,'配送中'); assert.equal(driverAfter.exceptionReason,'');
  assert.equal(await driverReader.getDriverDeliveryTask({ fulfillmentId:'F002', operatorId:'U-OFFICE-B' }),null);
  const replay=await repository.findDriverExceptionResolutionReplay({workspace,body,operatorId:'U-OFFICE-A'}); assert.equal(replay.replayed,true); assert.equal(replay.fulfillment.status,'配送中');
  assert.equal((await pool.query("SELECT count(*)::int AS count FROM operation_logs WHERE id='LOG-RESOLVE'")).rows[0].count,1);
  // Both callers miss the service pre-read before either can enter the pool's
  // business lock. Deliver their actual database receipts only after a later
  // persisted version has reached the shared workspace.
  await pool.query(`UPDATE fulfillment_records SET status='送货异常',revision=10 WHERE id='F002';
    INSERT INTO todos(id,biz_no,type,ref_type,ref_id,priority,status,summary) VALUES ('TODO-POOL-REPLAY','TODO-POOL-REPLAY','送货异常待处理','fulfillment','F002','normal','未处理','第二次联系客户');
    INSERT INTO fulfillment_exceptions(id,fulfillment_id,exception_type,expected_qty,actual_qty,reason_code,reason,todo_id,reported_by) VALUES ('EX-POOL-REPLAY','F002','delivery_exception',1200,0,'customer_unavailable','客户稍后接货','TODO-POOL-REPLAY','U-DRIVER-A');`);
  const raceWorkspace = await coldReader();
  const raceBody = { ...body, exceptionId:'EX-POOL-REPLAY', expectedRevision:10, idempotencyKey:'resolve-pool-race' };
  const poolReceipts = [];
  let signalBothReceipts, releaseReceipts;
  const bothReceipts = new Promise(resolve => { signalBothReceipts=resolve; });
  const receiptDelivery = new Promise(resolve => { releaseReceipts=resolve; });
  const actualClient = createPostgresPoolClient({pool});
  const raceRepository = createPostgresFulfillmentActionTransactionRepository({postgresClient:{
    ...actualClient,
    async idempotentTransactionJson(request) {
      // Always observe pool metadata in the test, but return the exact interface
      // the repository requested. No SQL, receipt or replay decision is mocked.
      const result=await actualClient.idempotentTransactionJson({...request,includeReplayMetadata:true});
      poolReceipts.push(result);if(poolReceipts.length===2)signalBothReceipts();
      await receiptDelivery;
      return request.includeReplayMetadata===true?result:result.value;
    },
  }});
  const raceInput = () => {
    const prepared=prepareDriverDeliveryExceptionResolution({workspace:raceWorkspace,fulfillmentId:'F002',body:raceBody,operatorId:'U-OFFICE-A'});
    assert.equal(prepared.ok,true,JSON.stringify(prepared));
    return {workspace:raceWorkspace,idempotencyKey:raceBody.idempotencyKey,idempotencyPayload:{...raceBody,operatorId:'U-OFFICE-A'},fulfillment:prepared.after,fulfillmentException:prepared.updatedException,driverExceptionBefore:prepared.exception,driverExceptionTodoBefore:prepared.currentTodo,todo:prepared.todo,operationLog:{id:'LOG-POOL-REPLAY',targetType:'fulfillment',targetId:'F002',action:'resolve_driver_delivery_exception',operatorId:'U-OFFICE-A',before:{fulfillment:prepared.before,exception:prepared.exception,todo:prepared.currentTodo},after:{fulfillment:prepared.after,exception:prepared.updatedException,todo:prepared.todo},reason:prepared.reason}};
  };
  const firstRaceInput=raceInput(),secondRaceInput=raceInput();
  for(let call=0;call<2;call++)assert.equal(await raceRepository.findDriverExceptionResolutionReplay({workspace:raceWorkspace,body:raceBody,operatorId:'U-OFFICE-A'}),null,'both pre-reads must miss');
  const raceLocker=await pool.connect();
  try {
    await raceLocker.query("SELECT pg_advisory_lock(hashtextextended($1::text,0))",['fulfillment:F002']);
    const firstRace=raceRepository.recordFulfillmentAction(firstRaceInput);
    const secondRace=raceRepository.recordFulfillmentAction(secondRaceInput);
    let bothWaiting=false;
    for(let attempt=0;attempt<200;attempt++){
      const {rows}=await pool.query("SELECT count(*)::int AS count FROM pg_stat_activity WHERE datname=current_database() AND wait_event='advisory' AND query LIKE '%pg_advisory_xact_lock%'");
      if(rows[0].count>=2){bothWaiting=true;break;}
      await new Promise(resolve=>setTimeout(resolve,10));
    }
    assert.equal(bothWaiting,true,'both actual pool calls must wait before the statement snapshot');
    await raceLocker.query('SELECT pg_advisory_unlock_all()');
    let receiptTimeout;
    try { await Promise.race([bothReceipts,new Promise((_,reject)=>{receiptTimeout=setTimeout(()=>reject(new Error('Both pool receipts did not return')),10000);})]); }
    finally { clearTimeout(receiptTimeout); }
    assert.deepEqual(poolReceipts.map(result=>result.replayed).sort(),[false,true],'one committed SQL write and one internal pool replay');
    await pool.query(`UPDATE fulfillment_records SET status='已交付',revision=revision+1,delivered_at='2026-10-23T04:00:00Z',final_delivery_at='2026-10-23T04:00:00Z' WHERE id='F002';
      UPDATE todos SET handled_by='U-OFFICE-B',handling_result='后续交付已复核',updated_at=now() WHERE id='TODO-POOL-REPLAY';`);
    Object.assign(raceWorkspace,await coldReader());
    const currentWorkspace=JSON.stringify(raceWorkspace);
    releaseReceipts();
    const outcomes=await Promise.all([firstRace,secondRace]);
    assert.deepEqual(outcomes[0],outcomes[1],'original same-key business receipt stays identical');
    assert.equal(outcomes[0].fulfillment.status,'配送中');assert.equal(outcomes[0].fulfillment.revision,11);
    assert.equal(Object.hasOwn(outcomes[0],'value'),false,'pool metadata must not leak into business receipts');
    assert.equal(JSON.stringify(raceWorkspace),currentWorkspace,'neither delayed new-write nor pool replay may restore older cache rows');
    const latest=(await pool.query("SELECT status,revision FROM fulfillment_records WHERE id='F002'")).rows[0];
    assert.deepEqual(latest,{status:'已交付',revision:12});
    assert.equal((await pool.query("SELECT count(*)::int AS count FROM operation_logs WHERE id='LOG-POOL-REPLAY'")).rows[0].count,1);
    assert.equal((await pool.query("SELECT count(*)::int AS count FROM operation_idempotency_keys WHERE scope='fulfillment.resolve_driver_delivery_exception' AND idempotency_key='resolve-pool-race'")).rows[0].count,1);
    assert.equal(raceWorkspace.todos.find(item=>item.id==='TODO-POOL-REPLAY').handlingResult,'后续交付已复核');
  } finally {
    releaseReceipts();await raceLocker.query('SELECT pg_advisory_unlock_all()');raceLocker.release();
  }
  console.log(`Driver resolution PostgreSQL passed: ${migrations.length} migrations, actual todo lock rollback/recovery, immutable evidence; two pre-read misses plus observed pool wait produce one new receipt and one replay, both retain later persisted/cache revision.`);
} finally {
  if(blocker){await blocker.query('ROLLBACK');blocker.release();}
  await pool?.end();
  docker(['rm','-f',name]);
}
