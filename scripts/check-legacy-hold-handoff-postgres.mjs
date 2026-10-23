import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';import pg from 'pg';
import {loadMigrationFiles,validateMigrationSet} from './dbMigrationUtils.mjs';
import {postgresLiveBusinessSeedSql} from './helpers/postgresLiveBusinessSeed.mjs';
import {buildStatementDecisionRecord,buildStatementWriteOffRecord,buildOperationLog,buildVarianceRecord,buildTodo} from './helpers/postgresLiveStatementFixtures.mjs';
import {createPostgresPoolClient} from '../server/postgresPoolClient.mjs';
import {createPostgresOrderConfirmationTransactionRepository} from '../server/orderConfirmationTransactionRepository.mjs';
import {createPostgresOrderDraftRepository} from '../server/orderDraftRepository.mjs';
import {buildConfirmedOrder,buildConfirmedOrderDraft,buildConfirmedOrderLines} from './helpers/postgresLiveOrderConfirmationFixtures.mjs';
const name = `erp-settlement-history-${process.pid}-${Date.now()}`;
const docker = (args) => { const result = spawnSync('docker', args, { encoding: 'utf8' }); if (result.status !== 0) throw Error(result.stderr || result.stdout); return result.stdout.trim(); };
let pool;
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

  for(const migration of migrations)await pool.query(migration.sql);
  await pool.query(postgresLiveBusinessSeedSql);


 const client=createPostgresPoolClient({pool}),repo=createPostgresOrderConfirmationTransactionRepository({postgresClient:client}),draftRepo=createPostgresOrderDraftRepository({postgresClient:client});
 const customerId='C-LIVE-REPO',draftId='DRAFT-LIVE-CONFIRM-001',holdId='HOLD-RACE',intentId='INT-HOLD-RACE',inventoryItemId='INV-LIVE-CONFIRM-001';
 await pool.query("INSERT INTO inventory_intents(id,source_draft_id,source_message_id,customer_id,intent_type,intent_status,source_text,candidate_json,revision,created_by) VALUES($1,$2,'MSG-SYNTHETIC-HOLD',$3,'temporary_hold','临时留货-生效','synthetic','{}',1,'U-OFFICE-A')",[intentId,draftId,customerId]);
 await pool.query("INSERT INTO inventory_reservations(id,inventory_item_id,customer_id,source_intent_id,reserved_qty,reservation_type,status,expires_at,revision,created_by) VALUES($1,$2,$3,$4,5,'临时留货','生效',now()+interval '1 hour',1,'U-OFFICE-A')",[holdId,inventoryItemId,customerId,intentId]);
 const hold=async()=>{const r=(await pool.query('SELECT * FROM inventory_reservations WHERE id=$1',[holdId])).rows[0];return {id:r.id,inventoryItemId:r.inventory_item_id,customerId:r.customer_id,sourceIntentId:r.source_intent_id,reservedQty:r.reserved_qty,revision:r.revision,status:r.status,reservationType:r.reservation_type,expiresAt:r.expires_at.toISOString()};};
 const make=async(name)=>({workspace:{orderDrafts:[]},idempotencyKey:name,idempotencyPayload:{name},expectedDraftRevision:1,orderDraft:buildConfirmedOrderDraft({draftId,customerId,createdBy:'U-OFFICE-A'}),order:buildConfirmedOrder({orderId:'ORD-HOLD-RACE',sourceDraftId:draftId,customerId,createdBy:'U-OFFICE-A'}),orderLines:buildConfirmedOrderLines({orderId:'ORD-HOLD-RACE',customerId,orderLineId:'OL-HOLD-RACE',createdBy:'U-OFFICE-A'}).map(l=>({...l,qty:5})),inventoryReservations:[{...await hold(),reservationId:holdId,orderLineId:'OL-HOLD-RACE',reservedQty:5,reservationType:'待提货锁定',convertFromTemporaryHold:true,inventoryDeltaQty:0,expiresAt:''}],operationLog:{id:'LOG-'+name,targetType:'order_draft',targetId:draftId,action:'confirm_order_draft',operatorId:'U-OFFICE-A'}});
 const snapshot=async()=>{const out={};for(const table of ['order_drafts','original_orders','order_lines','inventory_reservations','inventory_items','inventory_intents','operation_logs','operation_idempotency_keys'])out[table]=(await pool.query(`SELECT COALESCE(json_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text),'[]'::json) rows FROM ${table} t`)).rows[0].rows;return out;};
 const race=async(kind)=>{const input=await make('hold-race-'+kind),writer=await pool.connect();try{await writer.query('BEGIN');const pid=(await writer.query('SELECT pg_backend_pid() pid')).rows[0].pid;await writer.query('SELECT id FROM inventory_reservations WHERE id=$1 FOR UPDATE',[holdId]);let pending;
 if(kind==='draft') {const expected=await hold();await writer.query('UPDATE inventory_reservations SET reserved_qty=6 WHERE id=$1',[holdId]);pending=draftRepo.saveOrderDraft({workspace:{orderDrafts:[]},draft:buildConfirmedOrderDraft({draftId:'DRAFT-INITIAL-RACE',customerId,createdBy:'U-OFFICE-A'}),expectedRevision:0,sourceHoldGuard:expected,operationLog:{id:'LOG-INITIAL-RACE',targetType:'order_draft',targetId:'DRAFT-INITIAL-RACE',action:'recognize_order_draft',operatorId:'U-OFFICE-A'},idempotencyKey:'initial-draft-race',idempotencyPayload:{customerId}});}
 else {if(kind==='customer')await writer.query("UPDATE inventory_reservations SET customer_id='C001' WHERE id=$1",[holdId]);pending=repo.confirmOrder(input);}
 const outcome=pending.then(value=>({value}),error=>({error}));let observed=false;for(let i=0;i<100;i++){if((await pool.query('SELECT pid FROM pg_stat_activity WHERE $1::integer=ANY(pg_blocking_pids(pid))',[pid])).rowCount){observed=true;break;}await new Promise(r=>setTimeout(r,15));}assert.ok(observed,kind+' must wait on real hold row');
 if(kind==='expiry') await writer.query("SELECT pg_sleep(GREATEST(0,extract(epoch FROM(expires_at-clock_timestamp())))+0.1) FROM inventory_reservations WHERE id=$1",[holdId]);
 await writer.query('COMMIT');const before=await snapshot();assert.equal((await outcome).error?.statusCode,409,kind);assert.deepEqual(await snapshot(),before,kind+' must leave committed business rows untouched');
 }finally{await writer.query('ROLLBACK');writer.release();}};
 await race('draft');await pool.query("UPDATE inventory_reservations SET reserved_qty=5 WHERE id=$1",[holdId]);
 await race('customer');await pool.query('UPDATE inventory_reservations SET customer_id=$2 WHERE id=$1',[holdId,customerId]);
 await pool.query("UPDATE inventory_reservations SET expires_at=clock_timestamp()+interval '1 second' WHERE id=$1",[holdId]);await race('expiry');
 await pool.query("UPDATE inventory_reservations SET expires_at=clock_timestamp()+interval '1 hour' WHERE id=$1",[holdId]);const valid=await repo.confirmOrder(await make('valid-hold-confirmation'));assert.equal(valid.inventoryReservations[0].reservationId,holdId);
 console.log('PASS hold PostgreSQL: observed row-lock initial draft quantity change, confirmation customer change and clock expiry all rejected; no overwritten rows; valid conversion keeps original hold identity.');
} finally {await pool?.end();docker(['rm','-f',name]);}
