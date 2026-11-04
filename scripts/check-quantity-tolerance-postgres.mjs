// P2-05 on a database with every migration applied: a produced order packed 1% over the plan goes
// straight to label printing (no office decision), the paper note bills the plan and marks the rest
// free, and the warehouse can record the real 1010 as shipped. 2% over still waits for the office.
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import pg from 'pg';
import {loadMigrationFiles,validateMigrationSet} from './dbMigrationUtils.mjs';
import {postgresLiveBusinessSeedSql} from './helpers/postgresLiveBusinessSeed.mjs';
import {createPostgresPoolClient} from '../server/postgresPoolClient.mjs';
import {createPostgresCoreWorkspaceReadRepository} from '../server/coreWorkspaceReadRepository.mjs';
import {createPostgresProductionPackingTransactionRepository} from '../server/productionPackingTransactionRepository.mjs';
import {getPackageGroupContext,replacePackageGroup} from '../server/services/packageGroupService.mjs';
import {createApiSharedServiceRegistry} from '../server/apiSharedServiceRegistry.mjs';
import {createPostgresPrintDeviceRepository} from '../server/printDeviceRepository.mjs';
import {createPostgresPrintJobRepository} from '../server/printJobRepository.mjs';
import {createPostgresFulfillmentActionTransactionRepository} from '../server/fulfillmentActionTransactionRepository.mjs';
import {resolveFulfillmentBillingQuantity} from '../server/services/fulfillmentBillingQuantityService.mjs';

const name=`erp-qty-tolerance-${process.pid}-${Date.now()}`;
const docker=args=>{const r=spawnSync('docker',args,{encoding:'utf8'});if(r.status!==0)throw Error(r.stderr||r.stdout);return r.stdout.trim();};
let pool;
try {
  docker(['run','--rm','-d','--name',name,'-p','127.0.0.1::5432','-e','POSTGRES_DB=erp','-e','POSTGRES_USER=erp','-e','POSTGRES_PASSWORD=erp','postgres:16-alpine']);
  for(let i=0;i<60;i++){if(spawnSync('docker',['exec',name,'pg_isready','-h','127.0.0.1','-U','erp']).status===0)break;if(i===59)throw Error('PG timeout');await new Promise(r=>setTimeout(r,200));}
  const port=Number(docker(['port',name,'5432/tcp']).split(':').at(-1));
  pool=new pg.Pool({host:'127.0.0.1',port,database:'erp',user:'erp',password:'erp',statement_timeout:15000});
  const migrations=loadMigrationFiles();validateMigrationSet(migrations);for(const m of migrations)await pool.query(m.sql);await pool.query(postgresLiveBusinessSeedSql);
  for(const [key,qty] of [['A',1000],['B',1000]]){
    await pool.query(`INSERT INTO order_lines SELECT (jsonb_populate_record(NULL::order_lines,to_jsonb(l)||jsonb_build_object('id',$1::text,'biz_no',$1::text,'line_no',$3::int,'original_qty',$2::int,'order_type','定制印刷','product_name','定制印刷袋','line_status','待打包'))).* FROM order_lines l WHERE id='ORD-0629-002-01'`,[`OL-TOL-${key}`,qty,key==='A'?7:8]);
    await pool.query(`INSERT INTO fulfillment_records SELECT (jsonb_populate_record(NULL::fulfillment_records,to_jsonb(f)||jsonb_build_object('id',$1::text,'biz_no',$1::text,'order_line_id',$2::text,'expected_qty',$3::int,'actual_qty',NULL,'status','待打包'))).* FROM fulfillment_records f WHERE id='F002'`,[`F-TOL-${key}`,`OL-TOL-${key}`,qty]);
    await pool.query(`INSERT INTO driver_delivery_dispatches SELECT (jsonb_populate_record(NULL::driver_delivery_dispatches,to_jsonb(d)||jsonb_build_object('id',$1::text,'biz_no',$1::text,'fulfillment_id',$2::text))).* FROM driver_delivery_dispatches d WHERE fulfillment_id='F002'`,[`DISPATCH-TOL-${key}`,`F-TOL-${key}`]);
    await pool.query(`INSERT INTO packing_tasks(id,biz_no,order_line_id,planned_qty,status,revision) VALUES($1,$1,$2,$3,'待打包',1)`,[`PACK-TOL-${key}`,`OL-TOL-${key}`,qty]);
    await pool.query(`INSERT INTO price_snapshots(id,order_line_id,snapshot_type,version_no,bag_price,chargeable_qty,final_amount,created_by) VALUES($1,$2,'confirmation',1,0.34,$3,$4,'U-OFFICE-A')`,[`PRICE-TOL-${key}`,`OL-TOL-${key}`,qty,qty*0.34]);
  }
  await pool.query(`INSERT INTO printer_devices(id,biz_no,name,device_type,connection_type,supported_document_types,default_document_types,settings_json,created_by) VALUES('PRINT-TOL-LABEL','PRINT-TOL-LABEL','合成标签机','label','system_printer',ARRAY['package_label'],ARRAY['package_label'],'{"driverMode":"system_printer"}','U-OFFICE-A');
    INSERT INTO printer_devices(id,biz_no,name,device_type,connection_type,supported_document_types,settings_json,created_by) VALUES('PRINT-TOL-PAPER','PRINT-TOL-PAPER','合成针式机','dot_matrix','system_printer',ARRAY['delivery_note'],'{"driverMode":"system_printer"}','U-OFFICE-A');
    -- What production completion leaves behind: the qualified 1010 in stock, reserved for the line.
    INSERT INTO inventory_items(id,inventory_key,size,standard_color_id,handle_type,style,zone,inventory_state,on_hand_qty,reserved_qty,waiting_pickup_locked_qty,pending_handling_qty,trust_level) VALUES('INV-TOL-A','INV-TOL-A','25*32*10','SC-WHITE','加长提','空白袋','TOL','仓库已清点',1010,1010,0,0,'已清点');
    INSERT INTO inventory_reservations(id,order_line_id,inventory_item_id,reserved_qty,reservation_type,status,created_by) VALUES('RES-TOL-A','OL-TOL-A','INV-TOL-A',1010,'生产完成待出库占用','生效','U-OFFICE-A');`);
  const client=createPostgresPoolClient({pool}),reader=createPostgresCoreWorkspaceReadRepository({postgresClient:client}),repo=createPostgresProductionPackingTransactionRepository({postgresClient:client});
  const fresh=async()=>({...await reader.loadState(),productionPackingTransactionRepository:repo,driverDeliveryDispatches:(await pool.query(`SELECT id,fulfillment_id AS "fulfillmentId",driver_id AS "driverId",route_date::text AS "routeDate",route_batch_no AS "routeNo",dispatch_status AS "dispatchStatus",revision FROM driver_delivery_dispatches`)).rows});
  const services=createApiSharedServiceRegistry();
  const preparePrint=async()=>{const w=await fresh();w.fulfillmentActionTransactionRepository=createPostgresFulfillmentActionTransactionRepository({postgresClient:client});w.printDeviceRepository=createPostgresPrintDeviceRepository({postgresClient:client});w.printJobRepository=createPostgresPrintJobRepository({postgresClient:client});Object.assign(w,await w.printJobRepository.loadState());return w;};
  const confirmPrint=async(queued,key)=>{const w=await preparePrint(),job=w.printJobs.find(j=>j.printJobId===queued.printJob.printJobId);return services.printJobBusinessProjectionService.persistFulfillmentPrintJobProjection({workspace:w,printJob:{...job,jobStatus:'printed',finishedAt:new Date().toISOString()},printJobOperationLog:{id:`LOG-${key}`,targetType:'print_job',targetId:job.printJobId,action:'record_print_job_driver_status',operatorId:'U-OFFICE-A',occurredAt:new Date().toISOString(),createdAt:new Date().toISOString()},operatorId:'U-OFFICE-A',idempotencyKey:key});};
  const pack=async(fid,lineId,packedQty,key)=>{const workspace=await fresh();const ctx=getPackageGroupContext(workspace,{fulfillmentId:fid});
    return replacePackageGroup({workspace,fulfillmentId:fid,operatorId:'U-OFFICE-A',body:{fulfillmentIds:[fid],snapshotToken:ctx.snapshotToken,physicalContentsConfirmed:true,reason:'按实物逐包确认',idempotencyKey:key,
      packages:[{confirmed:true,items:[{fulfillmentId:fid,orderLineId:lineId,packedQty}]}]}});};
  const statusOf=async fid=>(await pool.query('SELECT status,actual_qty FROM fulfillment_records WHERE id=$1',[fid])).rows[0];
  const openMismatch=async fid=>(await pool.query("SELECT count(*)::int AS n FROM fulfillment_exceptions WHERE fulfillment_id=$1 AND exception_type='quantity_mismatch'",[fid])).rows[0].n;

  // 1000 planned, 1010 packed (exactly 1%): automatic, no office todo.
  const over=await pack('F-TOL-A','OL-TOL-A',1010,'tolerance-pack-a');
  assert.equal(over.quantityDifferences.length,0,JSON.stringify(over));
  assert.deepEqual(over.autoAcceptedDifferences.map(d=>[d.fulfillmentId,d.kind,d.chargeableQty,d.freeQty]),[['F-TOL-A','over',1000,10]]);
  assert.deepEqual(await statusOf('F-TOL-A'),{status:'待打印标签',actual_qty:1010});
  assert.equal(await openMismatch('F-TOL-A'),0);

  // 1000 planned, 1020 packed (2%): the office still decides.
  const tooMuch=await pack('F-TOL-B','OL-TOL-B',1020,'tolerance-pack-b');
  assert.equal(tooMuch.quantityDifferences.length,1);
  assert.equal(tooMuch.autoAcceptedDifferences,undefined);
  assert.equal((await statusOf('F-TOL-B')).status,'数量差异待处理');
  const blocked=await services.fulfillmentPrintCommandService.printFulfillment({workspace:await preparePrint(),fulfillmentId:'F-TOL-B',body:{documentType:'package_label',printDeviceId:'PRINT-TOL-LABEL',printAction:'first_print',idempotencyKey:'tolerance-label-b'},operatorId:'U-OFFICE-A'});
  assert.equal(blocked.code,'PACKING_QUANTITY_REVIEW_REQUIRED');

  // The 1% line prints its package label without any decision.
  const label=await services.fulfillmentPrintCommandService.printFulfillment({workspace:await preparePrint(),fulfillmentId:'F-TOL-A',body:{documentType:'package_label',printDeviceId:'PRINT-TOL-LABEL',printAction:'first_print',idempotencyKey:'tolerance-label-a'},operatorId:'U-OFFICE-A'});
  assert.ok(label.printJob,JSON.stringify(label));
  assert.equal((await confirmPrint(label,'tolerance-label-a-confirm')).physicalPrintConfirmed,true);

  // The paper note: 1010 delivered, billed as 1000, 10 free.
  const paper=await services.fulfillmentPrintCommandService.printFulfillment({workspace:await preparePrint(),fulfillmentId:'F-TOL-A',body:{documentType:'delivery_note',printDeviceId:'PRINT-TOL-PAPER',idempotencyKey:'tolerance-paper-a'},operatorId:'U-OFFICE-A'});
  assert.ok(paper.printJob,JSON.stringify(paper));
  assert.equal(paper.paperOutboundDocument.instructionQty,1010);
  assert.equal(paper.printTemplate.fields.chargeableQuantityText,'1000个');
  assert.equal(paper.printTemplate.fields.freeQuantityText,'10个');
  assert.match(paper.printTemplate.fields.quantityNoteText,/多出 10 个赠送/);
  assert.equal(paper.printTemplate.fields.totalAmountText,'¥340');
  assert.equal((await confirmPrint(paper,'tolerance-paper-a-confirm')).physicalPrintConfirmed,true);

  // Warehouse hands over and records the real 1010 as shipped.
  let w=await preparePrint();let f=w.fulfillments.find(row=>row.id==='F-TOL-A'),doc=w.paperOutboundDocuments.find(p=>(p.id??p.paperOutboundDocumentId)===f.paperOutboundDocumentId);
  const handed=await services.fulfillmentActionCommandService.handoffPaperOutboundDocument({workspace:w,fulfillmentId:'F-TOL-A',body:{expectedRevision:f.revision,paperOutboundDocumentId:doc.id??doc.paperOutboundDocumentId,paperDocumentVersion:doc.documentVersion,paperDocumentRevision:doc.revision,idempotencyKey:'tolerance-handoff-a'},operatorId:'U-OFFICE-A'});
  assert.ok(handed.response,JSON.stringify(handed));
  w=await preparePrint();f=w.fulfillments.find(row=>row.id==='F-TOL-A');doc=w.paperOutboundDocuments.find(p=>(p.id??p.paperOutboundDocumentId)===f.paperOutboundDocumentId);
  const executed=await services.fulfillmentActionCommandService.recordWarehouseOutboundExecution({workspace:w,fulfillmentId:'F-TOL-A',operatorId:'U-WAREHOUSE-A',body:{expectedRevision:f.revision,paperOutboundDocumentId:doc.id??doc.paperOutboundDocumentId,paperDocumentVersion:doc.documentVersion,paperDocumentRevision:doc.revision,result:'实物已出库',actualQty:1010,physicalExecutorEmployeeId:'EMP-LIVE-MANAGER-001',feedbackChannel:'当面',executedAt:new Date().toISOString(),idempotencyKey:'tolerance-warehouse-a'}});
  assert.ok(executed.response,JSON.stringify(executed));
  assert.equal(executed.response.warehouseOutboundExecution.actualQty,1010);
  assert.deepEqual((await pool.query("SELECT on_hand_qty,reserved_qty FROM inventory_items WHERE id='INV-TOL-A'")).rows[0],{on_hand_qty:0,reserved_qty:0},'all 1010 left the warehouse');

  // Billing for the statement follows the same rule.
  w=await fresh();
  assert.deepEqual(resolveFulfillmentBillingQuantity({workspace:w,fulfillment:w.fulfillments.find(row=>row.id==='F-TOL-A'),actualQty:1010}),{deliveredQty:1010,chargeableQty:1000,freeQty:10});
  console.log(`PASS quantity tolerance PG (${migrations.length} migrations): 1% over packs, labels, prints and ships without an office decision; 2% over still waits.`);
} finally {if(pool)await pool.end();spawnSync('docker',['rm','-f',name],{encoding:'utf8'});}
