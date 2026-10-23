import assert from 'node:assert/strict';
import pg from 'pg';
import {startLivePostgres,stopLivePostgres} from './postgres-live/runtime.mjs';
import {createPostgresPoolClient} from '../server/postgresPoolClient.mjs';
import {createPostgresFulfillmentActionTransactionRepository} from '../server/fulfillmentActionTransactionRepository.mjs';
const runtime=await startLivePostgres();
const pool=new pg.Pool({connectionString:runtime.resolveLiveDatabaseUrl(),max:8});
const repo=createPostgresFulfillmentActionTransactionRepository({postgresClient:createPostgresPoolClient({pool})});
const lineId='ORD-0629-002-01',now='2026-10-23T04:00:00Z';
let sequence=0;
async function fixture({type='stock',actual=10,reserved=10,deduct=actual,reservation=true}={}){
 const key='CONSERVATION-'+(++sequence),itemId='INV-'+key,reservationId='RSV-'+key;
 await pool.query("UPDATE fulfillment_records SET revision=1,status='配送中',expected_qty=10,actual_qty=$1,physical_outbound_at=NULL,loaded_at=NULL,final_delivery_at=NULL,delivered_at=NULL WHERE id='F002'",[actual]);
 await pool.query('UPDATE order_lines SET order_type=$1 WHERE id=$2',[type,lineId]);
 await pool.query("INSERT INTO inventory_items(id,inventory_key,size,standard_color_id,handle_type,style,zone,inventory_state,on_hand_qty,reserved_qty) VALUES($1,$1,'30*38*10','SC-WHITE','普通提','空白袋',$1,'仓库已清点',100,$2)",[itemId,reservation?reserved:0]);
 if(reservation)await pool.query("INSERT INTO inventory_reservations(id,order_line_id,inventory_item_id,reserved_qty,reservation_type,status,created_by) VALUES($1,$2,$3,$4,'订单占用','生效','U-OFFICE-A')",[reservationId,lineId,itemId,reserved]);
 const fulfillment={id:'F002',fulfillmentId:'F002',orderLineId:lineId,customerId:'C002',method:'送货',expectedQty:10,actualQty:actual,status:'已交付',revision:1,deliveredAt:now,finalDeliveryAt:now,createdBy:'U-OFFICE-A'};
 const inventoryReservations=reservation?[{id:reservationId,reservationId,orderLineId:lineId,inventoryItemId:itemId,reservedQty:reserved,status:'已出库',reservationType:'订单占用'}]:[];
 const inventoryAdjustments=deduct?[{inventoryItemId:itemId,onHandQtyChange:-deduct,reservedQtyChange:reservation?-reserved:0}]:[];
 const inventoryLedgerEntries=deduct?[{ledgerId:'LEDGER-'+key,inventoryItemId:itemId,qtyBefore:100,qtyChange:-deduct,qtyAfter:100-deduct,sourceType:'fulfillment_complete',sourceId:'F002',operatorId:'U-OFFICE-A',confirmedBy:'U-OFFICE-A',occurredAt:now,createdAt:now}]:[];
 const workspace={fulfillments:[{...fulfillment,status:'配送中'}],inventories:[{id:itemId,inStock:100,reserved:reservation?reserved:0,revision:1}],inventoryReservations:structuredClone(inventoryReservations),operationLogs:[],inventoryLedgers:[]};
 const input={workspace,fulfillment,inventoryReservations,inventoryAdjustments,inventoryLedgerEntries,idempotencyKey:key,idempotencyPayload:{key},operationLog:{id:'LOG-'+key,targetType:'fulfillment',targetId:'F002',action:'driver_complete_delivery',operatorId:'U-OFFICE-A',before:workspace.fulfillments[0],after:fulfillment,occurredAt:now}};
 return {key,itemId,reservationId,input,workspace};
}
async function assertNoWrite(f){
 assert.deepEqual((await pool.query("SELECT status,revision FROM fulfillment_records WHERE id='F002'")).rows[0],{status:'配送中',revision:1});
 assert.equal((await pool.query('SELECT count(*)::int count FROM operation_logs WHERE id=$1',['LOG-'+f.key])).rows[0].count,0);
 assert.equal((await pool.query('SELECT count(*)::int count FROM inventory_ledger_entries WHERE id=$1',['LEDGER-'+f.key])).rows[0].count,0);
 assert.equal((await pool.query("SELECT count(*)::int count FROM operation_idempotency_keys WHERE scope='fulfillment.driver_complete_delivery' AND idempotency_key=$1",[f.key])).rows[0].count,0);
}
try{
 const partial=await fixture({reserved:6,deduct:6});
 await assert.rejects(repo.recordFulfillmentAction(partial.input),error=>error.statusCode===409,'actual10 but only6 deducted must fail in the repository');await assertNoWrite(partial);
 const underReserved=await fixture({reserved:6,deduct:10});await assert.rejects(repo.recordFulfillmentAction(underReserved.input),error=>error.statusCode===409,'a 6-item hold cannot authorize a 10-item reserved outbound even if on-hand stock exists');await assertNoWrite(underReserved);
 const empty=await fixture({reservation:false,deduct:0});await assert.rejects(repo.recordFulfillmentAction(empty.input),error=>error.statusCode===409,'stock delivery cannot bypass inventory by submitting no movements');await assertNoWrite(empty);
 for(const type of ['custom_special','特殊尺寸空白袋','external_print','外加工印刷']){
  const direct=await fixture({type,reservation:false,deduct:0});const receipt=await repo.recordFulfillmentAction(direct.input);assert.equal(receipt.fulfillment.status,'已交付');assert.equal(receipt.inventoryItems.length,0);assert.equal((await pool.query('SELECT on_hand_qty FROM inventory_items WHERE id=$1',[direct.itemId])).rows[0].on_hand_qty,100);
 }
 for(const config of [{},{actual:6,reserved:10,deduct:6},{reservation:false,deduct:10}]){
  const valid=await fixture(config);await repo.recordFulfillmentAction(valid.input);const item=(await pool.query('SELECT on_hand_qty,reserved_qty FROM inventory_items WHERE id=$1',[valid.itemId])).rows[0];assert.deepEqual(item,{on_hand_qty:100-(config.deduct??10),reserved_qty:0});
 }
 for(const kind of ['quantity','order-owner','item-owner','stock-ledger']){
  const f=await fixture(),blocker=await pool.connect();let pending;
  try{
   await blocker.query('BEGIN');
   if(kind==='quantity')await blocker.query('UPDATE inventory_reservations SET reserved_qty=6 WHERE id=$1',[f.reservationId]);
   if(kind==='order-owner')await blocker.query("UPDATE inventory_reservations SET order_line_id='ORD-0629-001-01' WHERE id=$1",[f.reservationId]);
   if(kind==='item-owner')await blocker.query("UPDATE inventory_reservations SET inventory_item_id='INV-LIVE-PROD-001' WHERE id=$1",[f.reservationId]);
   if(kind==='stock-ledger')await blocker.query('UPDATE inventory_items SET on_hand_qty=95 WHERE id=$1',[f.itemId]);
   const pid=(await blocker.query('SELECT pg_backend_pid() pid')).rows[0].pid;
   pending=repo.recordFulfillmentAction(f.input).then(value=>({value}),error=>({error}));
   let observed=false;for(let attempt=0;attempt<200;attempt++){if((await pool.query('SELECT 1 FROM pg_stat_activity WHERE $1::integer=ANY(pg_blocking_pids(pid))',[pid])).rowCount){observed=true;break;}await new Promise(resolve=>setTimeout(resolve,10));}
   assert.equal(observed,true,'must observe an actual lock wait: '+kind);await blocker.query('COMMIT');
   const outcome=await pending;assert.equal(outcome.error?.statusCode,409,kind+' must reject after reading the changed locked row');await assertNoWrite(f);
  }finally{await blocker.query('ROLLBACK');blocker.release();if(pending)await pending;}
 }
 console.log('PASS actual PostgreSQL inventory conservation: actual quantity fully deducted; stock cannot skip inventory; special-size/external service direct paths remain valid; short delivery may release full prior hold; explicit legacy deduction valid; observed lock-wait quantity/order/item/stock-ledger changes roll back without fulfillment, ledger, audit or idempotency writes.');
}finally{await pool.end();await stopLivePostgres(runtime);}
