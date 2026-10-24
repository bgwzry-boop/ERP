import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import pg from 'pg';
import {loadMigrationFiles,validateMigrationSet} from './dbMigrationUtils.mjs';
import {postgresLiveBusinessSeedSql} from './helpers/postgresLiveBusinessSeed.mjs';
import {buildVoidOrderLineTransactionQuery} from '../server/orderLineVoidTransactionRepository.mjs';
import {buildAdjustOrderLineQuantityTransactionQuery} from '../server/orderLineQuantityAdjustmentTransactionRepository.mjs';
const name = `erp-order-delivery-guard-${process.pid}-${Date.now()}`;
const docker = args => {
  const r = spawnSync('docker', args, {
    encoding: 'utf8'
  });
  if (r.status !== 0) throw Error(r.stderr || r.stdout);
  return r.stdout.trim();
};
let pool;
try {
  docker(['run', '--rm', '-d', '--name', name, '-p', '127.0.0.1::5432', '-e', 'POSTGRES_DB=erp', '-e', 'POSTGRES_USER=erp', '-e', 'POSTGRES_PASSWORD=erp', 'postgres:16-alpine']);
  for (let i = 0; i < 60; i++) {
    const r = spawnSync('docker', ['exec', name, 'pg_isready', '-h', '127.0.0.1', '-U', 'erp']);
    if (r.status === 0) break;
    if (i === 59) throw Error('PostgreSQL startup timeout');
    await new Promise(r => setTimeout(r, 250));
  }
  const port = Number(docker(['port', name, '5432/tcp']).split(':').at(-1));
  pool = new pg.Pool({
    host: '127.0.0.1',
    port,
    database: 'erp',
    user: 'erp',
    password: 'erp'
  });
  const migrations = loadMigrationFiles();
  validateMigrationSet(migrations);
  for (const migration of migrations) await pool.query(migration.sql);
  await pool.query(postgresLiveBusinessSeedSql);

  const id = 'OL-LIVE-PROD-001';
  await pool.query("UPDATE order_lines SET line_status='待出库' WHERE id=$1",[id]);
  await pool.query("INSERT INTO fulfillment_records(id,biz_no,order_line_id,customer_id,method,expected_qty,status,created_by) VALUES ('F-GUARD','F-GUARD',$1,'C-LIVE-REPO','送货',80,'待出库','U-OFFICE-A')",[id]);
  const snapshot = async () => (await pool.query("SELECT jsonb_build_object('orders',(SELECT jsonb_agg(t) FROM order_lines t),'deliveries',(SELECT jsonb_agg(t) FROM fulfillment_records t),'logs',(SELECT jsonb_agg(t) FROM operation_logs t),'changes',(SELECT jsonb_agg(t) FROM order_line_change_records t),'tasks',(SELECT jsonb_agg(t) FROM production_tasks t),'packing',(SELECT jsonb_agg(t) FROM packing_tasks t),'schedules',(SELECT jsonb_agg(t) FROM production_schedule_records t),'statementLines',(SELECT jsonb_agg(t) FROM statement_lines t),'statements',(SELECT jsonb_agg(t) FROM statements t)) AS value")).rows[0].value;
  const builders = [buildVoidOrderLineTransactionQuery,buildAdjustOrderLineQuantityTransactionQuery];
  for (const build of builders) {
    for (const facts of ["status='配送中'", "status='待出库',loaded_at=now()", "status='待出库',physical_outbound_at=now()", "status='待出库',final_delivery_at=now()", "status='待出库',delivered_at=now()"]) {
      await pool.query("UPDATE fulfillment_records SET status='待出库',loaded_at=NULL,physical_outbound_at=NULL,final_delivery_at=NULL,delivered_at=NULL WHERE id='F-GUARD'");
      await pool.query("UPDATE fulfillment_records SET "+facts+" WHERE id='F-GUARD'");
      const before = await snapshot();
      const input = {orderLine:{orderLineId:id,orderId:'ORD-LIVE-PROD-001',customerId:'C-LIVE-REPO',lineStatus:'已关闭',originalQty:70,revision:1},expectedOrderLineRevision:1,fulfillmentRecords:[],orderLineChangeRecord:{changeRecordId:'CHANGE-GUARD',orderLineId:id,changedFields:['original_qty'],before:{originalQty:80},after:{originalQty:70},reason:'audit',changedBy:'U-OFFICE-A'},operationLog:{id:'LOG-GUARD',targetType:'order_line',targetId:id,action:'audit',operatorId:'U-OFFICE-A'}};
      const q=build(input);const c=await pool.connect();
      try {
        await c.query('BEGIN');
        await assert.rejects(c.query(q.text.replace(/^BEGIN;/,'').replace(/COMMIT;\s*$/,''),q.values), /ERP_ORDER_DELIVERY_ALREADY_EXECUTED/);
      } finally {await c.query('ROLLBACK');c.release();}
      assert.deepEqual(await snapshot(),before);
      await pool.query("UPDATE fulfillment_records SET status='待出库',loaded_at=NULL,physical_outbound_at=NULL,final_delivery_at=NULL,delivered_at=NULL WHERE id='F-GUARD'");
      const ready = await snapshot();
      const accepted = await pool.connect();
      try {
        await accepted.query('BEGIN');
        await accepted.query(q.text.replace(/^BEGIN;/,'').replace(/COMMIT;\s*$/,''),q.values);
        assert.equal((await accepted.query('SELECT revision FROM order_lines WHERE id=$1',[id])).rows[0].revision,2);
      } finally {await accepted.query('ROLLBACK');accepted.release();}
      assert.deepEqual(await snapshot(),ready);
      if (facts === "status='配送中'") {
        const loader = await pool.connect();
        const stale = await pool.connect();
        let pending;
        try {
          await loader.query('BEGIN');
          await loader.query("UPDATE fulfillment_records SET status='配送中',loaded_at=now() WHERE id='F-GUARD'");
          await stale.query('BEGIN');
          await stale.query("SET LOCAL statement_timeout='5s'");
          const pid = (await stale.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
          pending = stale.query(q.text.replace(/^BEGIN;/,'').replace(/COMMIT;\s*$/,''),q.values).then(value=>({value}),error=>({error}));
          let blocked = false;
          for (let attempt=0;attempt<100;attempt++) {
            blocked = (await pool.query("SELECT wait_event_type='Lock' AS blocked FROM pg_stat_activity WHERE pid=$1",[pid])).rows[0]?.blocked;
            if(blocked) break;
            await new Promise(resolve=>setTimeout(resolve,10));
          }
          assert.equal(blocked,true,'Confirm actual lock contention before committing the loader');
          await loader.query('COMMIT');
          const committed = await snapshot();
          const outcome = await pending;
          assert.match(outcome.error?.message ?? '',/ERP_ORDER_DELIVERY_ALREADY_EXECUTED/);
          await stale.query('ROLLBACK');
          assert.deepEqual(await snapshot(),committed,'Rejected stale mutation must preserve the committed loading facts');
        } finally {
          await loader.query('ROLLBACK');
          if(pending) await pending;
          await stale.query('ROLLBACK');
          loader.release();stale.release();
        }
      }
    }
  }
  // Status labels may lag behind production; the persisted production facts still govern edits.
  await pool.query("INSERT INTO production_tasks(id,biz_no,order_line_id,task_type,planned_qty,task_status,published_schedule_id,created_by) VALUES ('TASK-MUTATION','TASK-MUTATION',$1,'制袋',80,'已排产','SCHEDULE-MUTATION','U-OFFICE-A')",[id]);
  await pool.query("INSERT INTO packing_tasks(id,biz_no,order_line_id,planned_qty,status) VALUES ('PACK-MUTATION','PACK-MUTATION',$1,80,'待打包')",[id]);
  await pool.query("INSERT INTO production_schedule_records(id,biz_no,production_task_id,order_line_id,machine_id,schedule_status) VALUES ('SCHEDULE-MUTATION','SCHEDULE-MUTATION','TASK-MUTATION',$1,'M-MUTATION','active')",[id]);
  for(const [index,build] of builders.entries()) {
    const q=build({orderLine:{orderLineId:id,orderId:'ORD-LIVE-PROD-001',customerId:'C-LIVE-REPO',lineStatus:index===0?'已关闭':'待排产',originalQty:70,revision:1},expectedOrderLineRevision:1,fulfillmentRecords:[],orderLineChangeRecord:{changeRecordId:'CHANGE-MUTATION',orderLineId:id,changedFields:['original_qty'],before:{originalQty:80},after:{originalQty:70},reason:'audit',changedBy:'U-OFFICE-A'},operationLog:{id:'LOG-MUTATION',targetType:'order_line',targetId:id,action:'audit',operatorId:'U-OFFICE-A'}});
    const sql=q.text.replace(/^BEGIN;/,'').replace(/COMMIT;\s*$/,'');
    const before=await snapshot(),c=await pool.connect();
    try {
      await c.query('BEGIN');await c.query(sql,q.values);
      const task=(await c.query("SELECT * FROM production_tasks WHERE id='TASK-MUTATION'")).rows[0];
      assert.equal(task.task_status,index===0?'已作废':'待排产');assert.equal(task.published_schedule_id,null);
      assert.equal(task.planned_qty,index===0?80:70);assert.equal(task.revision,2);
      const packing=(await c.query("SELECT * FROM packing_tasks WHERE id='PACK-MUTATION'")).rows[0];
      assert.equal(packing.status,index===0?'已作废':'待打包');assert.equal(packing.planned_qty,index===0?80:70);
      assert.equal((await c.query("SELECT schedule_status FROM production_schedule_records WHERE id='SCHEDULE-MUTATION'")).rows[0].schedule_status,index===0?'canceled':'superseded');
    } finally {await c.query('ROLLBACK');c.release();}
    assert.deepEqual(await snapshot(),before);
    for(const fact of ['report','packing','package']) {
      if(fact==='report') await pool.query("INSERT INTO workshop_reports(id,production_task_id,order_line_id,process_type,qualified_qty) VALUES ('REPORT-MUTATION','TASK-MUTATION',$1,'制袋',1)",[id]);
      if(fact==='packing') await pool.query("UPDATE packing_tasks SET actual_packed_qty=1 WHERE id='PACK-MUTATION'");
      if(fact==='package') await pool.query("INSERT INTO packages(id,biz_no,order_line_id,packed_qty) VALUES ('PACKAGE-MUTATION','PACKAGE-MUTATION',$1,1)",[id]);
      const persisted=await snapshot(),blocked=await pool.connect();
      try {await blocked.query('BEGIN');await assert.rejects(blocked.query(sql,q.values),/ERP_ORDER_PRODUCTION_ALREADY_EXECUTED/);} finally{await blocked.query('ROLLBACK');blocked.release();}
      assert.deepEqual(await snapshot(),persisted,'Executed production rejects every partial order/accounting mutation');
      if(fact==='report') await pool.query("DELETE FROM workshop_reports WHERE id='REPORT-MUTATION'");
      if(fact==='packing') await pool.query("UPDATE packing_tasks SET actual_packed_qty=0 WHERE id='PACK-MUTATION'");
      if(fact==='package') await pool.query("DELETE FROM packages WHERE id='PACKAGE-MUTATION'");
    }
    const worker=await pool.connect(),editor=await pool.connect();let pending;
    try {
      await worker.query('BEGIN');await worker.query("UPDATE production_tasks SET task_status='生产中' WHERE id='TASK-MUTATION'");
      await editor.query('BEGIN');await editor.query("SET LOCAL statement_timeout='5s'");
      const pid=(await editor.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
      pending=editor.query(sql,q.values).then(value=>({value}),error=>({error}));let waiting=false;
      for(let i=0;i<100;i++){waiting=(await pool.query("SELECT wait_event_type='Lock' AS waiting FROM pg_stat_activity WHERE pid=$1",[pid])).rows[0]?.waiting;if(waiting)break;await new Promise(r=>setTimeout(r,10));}
      assert.equal(waiting,true,'Observe real production-start/edit row lock contention');
      await worker.query('COMMIT');const started=await snapshot();const outcome=await pending;
      assert.match(outcome.error?.message??'',/ERP_ORDER_PRODUCTION_ALREADY_EXECUTED/);await editor.query('ROLLBACK');assert.deepEqual(await snapshot(),started);
    } finally {await worker.query('ROLLBACK');if(pending)await pending;await editor.query('ROLLBACK');worker.release();editor.release();}
    await pool.query("UPDATE production_tasks SET task_status='已排产' WHERE id='TASK-MUTATION'");
  }
  await pool.query("INSERT INTO statement_lines(id,statement_id,order_line_id,delivered_qty,chargeable_qty,amount,final_amount) VALUES ('SL-MUTATION','ST-LIVE-REPO-001',$1,80,80,27.2,27.2)",[id]);
  const billed=await snapshot(),billQuery=buildVoidOrderLineTransactionQuery({orderLine:{orderLineId:id,orderId:'ORD-LIVE-PROD-001',customerId:'C-LIVE-REPO',lineStatus:'已关闭',originalQty:80,revision:1},expectedOrderLineRevision:1,fulfillmentRecords:[],orderLineChangeRecord:{changeRecordId:'CHANGE-BILLED',orderLineId:id,changedFields:['status'],before:{},after:{},reason:'audit',changedBy:'U-OFFICE-A'},operationLog:{id:'LOG-BILLED',targetType:'order_line',targetId:id,action:'audit',operatorId:'U-OFFICE-A'}}),billedClient=await pool.connect();
  try {await billedClient.query('BEGIN');await assert.rejects(billedClient.query(billQuery.text.replace(/^BEGIN;/,'').replace(/COMMIT;\s*$/,''),billQuery.values),/ERP_ORDER_LINE_HAS_STATEMENT/);} finally{await billedClient.query('ROLLBACK');billedClient.release();}
  assert.deepEqual(await snapshot(),billed,'Ordinary void cannot leave a persisted receivable behind a closed order');
  console.log('PASS PostgreSQL 16: both mutation queries reject five executed-delivery facts even when omitted from update payload; transaction snapshots unchanged; unexecuted controls succeed; verified delivery and production-start row-lock races reject stale mutations; pending task/packing quantities and schedule cancellation remain atomic.');
} finally {
  if(pool) await pool.end();
  docker(['rm','-f',name]);
}
