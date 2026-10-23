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
  console.log(`Driver resolution PostgreSQL passed: ${migrations.length} migrations, actual concurrent todo lock wait, atomic rollback, refreshed recovery, original handler and exception preservation, exact replay.`);
} finally {
  if(blocker){await blocker.query('ROLLBACK');blocker.release();}
  await pool?.end();
  docker(['rm','-f',name]);
}
