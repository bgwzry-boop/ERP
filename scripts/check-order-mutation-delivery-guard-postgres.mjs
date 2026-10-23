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
  const snapshot = async () => (await pool.query("SELECT jsonb_build_object('orders',(SELECT jsonb_agg(t) FROM order_lines t),'deliveries',(SELECT jsonb_agg(t) FROM fulfillment_records t),'logs',(SELECT jsonb_agg(t) FROM operation_logs t),'changes',(SELECT jsonb_agg(t) FROM order_line_change_records t)) AS value")).rows[0].value;
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
  console.log('PASS PostgreSQL 16: both mutation queries reject five executed-delivery facts even when omitted from update payload; transaction snapshots unchanged; unexecuted controls succeed; verified row-lock races reject stale mutations after loading commits.');
} finally {
  if(pool) await pool.end();
  docker(['rm','-f',name]);
}
