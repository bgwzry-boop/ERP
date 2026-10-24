import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import pg from 'pg';
import {loadMigrationFiles,validateMigrationSet} from './dbMigrationUtils.mjs';
import {postgresLiveBusinessSeedSql} from './helpers/postgresLiveBusinessSeed.mjs';
import {createPostgresPoolClient} from '../server/postgresPoolClient.mjs';
import {createPostgresCoreWorkspaceReadRepository} from '../server/coreWorkspaceReadRepository.mjs';
import {createPostgresProductionPackingTransactionRepository} from '../server/productionPackingTransactionRepository.mjs';
import {getPackageGroupContext,replacePackageGroup} from '../server/services/packageGroupService.mjs';
import {confirmPackageGroupLoaded} from '../server/services/packageGroupLoadService.mjs';
import {createPostgresDriverDeliveryTaskReadRepository} from '../server/driverDeliveryTaskReadRepository.mjs';
import {buildFulfillmentPrintTemplate} from '../src/domain/printTemplates.js';
import {hasTrustedCurrentFulfillmentLabel} from '../server/services/printJobBusinessProjectionService.mjs';
import {createPostgresBusinessDecisionEvidenceRepository} from '../server/businessDecisionEvidenceRepository.mjs';
import {createApiSharedServiceRegistry} from '../server/apiSharedServiceRegistry.mjs';
import {createPostgresPrintDeviceRepository} from '../server/printDeviceRepository.mjs';
import {createPostgresPrintJobRepository} from '../server/printJobRepository.mjs';
import {createPostgresFulfillmentActionTransactionRepository} from '../server/fulfillmentActionTransactionRepository.mjs';
import {packageLabelRows} from '../shared/packageContents.js';
const name=`erp-mixed-packages-${process.pid}-${Date.now()}`;
const docker=args=>{const r=spawnSync('docker',args,{encoding:'utf8'});if(r.status!==0)throw Error(r.stderr||r.stdout);return r.stdout.trim();};
let pool,blocker;
try {
 docker(['run','--rm','-d','--name',name,'-p','127.0.0.1::5432','-e','POSTGRES_DB=erp','-e','POSTGRES_USER=erp','-e','POSTGRES_PASSWORD=erp','postgres:16-alpine']);
 for(let i=0;i<60;i++){if(spawnSync('docker',['exec',name,'pg_isready','-h','127.0.0.1','-U','erp']).status===0)break;if(i===59)throw Error('PG timeout');await new Promise(r=>setTimeout(r,200));}
 const port=Number(docker(['port',name,'5432/tcp']).split(':').at(-1));pool=new pg.Pool({host:'127.0.0.1',port,database:'erp',user:'erp',password:'erp',statement_timeout:15000});
 const migrations=loadMigrationFiles();validateMigrationSet(migrations.filter(m=>!m.filename.startsWith("0054_")));for(const m of migrations)await pool.query(m.sql);await pool.query(postgresLiveBusinessSeedSql);
 await pool.query(`INSERT INTO order_lines SELECT (jsonb_populate_record(NULL::order_lines,to_jsonb(l)||'{"id":"LINE-MIX-B","biz_no":"LINE-MIX-B","line_no":2,"original_qty":800,"bag_color":"红色","size":"30*40*10"}'::jsonb)).* FROM order_lines l WHERE id='ORD-0629-002-01';
 INSERT INTO fulfillment_records SELECT (jsonb_populate_record(NULL::fulfillment_records,to_jsonb(f)||'{"id":"F-MIX-B","biz_no":"F-MIX-B","order_line_id":"LINE-MIX-B","expected_qty":800,"actual_qty":800}'::jsonb)).* FROM fulfillment_records f WHERE id='F002';
 INSERT INTO driver_delivery_dispatches SELECT (jsonb_populate_record(NULL::driver_delivery_dispatches,to_jsonb(d)||'{"id":"DISPATCH-MIX-B","biz_no":"DISPATCH-MIX-B","fulfillment_id":"F-MIX-B"}'::jsonb)).* FROM driver_delivery_dispatches d WHERE fulfillment_id='F002';`);
 const client=createPostgresPoolClient({pool}),reader=createPostgresCoreWorkspaceReadRepository({postgresClient:client}),repo=createPostgresProductionPackingTransactionRepository({postgresClient:client});
 const fresh=async()=>({...await reader.loadState(),productionPackingTransactionRepository:repo,driverDeliveryDispatches:(await pool.query(`SELECT id,fulfillment_id AS "fulfillmentId",driver_id AS "driverId",route_date::text AS "routeDate",route_batch_no AS "routeNo",dispatch_status AS "dispatchStatus",revision FROM driver_delivery_dispatches`)).rows});
 const services=createApiSharedServiceRegistry();
 await pool.query(`INSERT INTO printer_devices(id,biz_no,name,device_type,connection_type,supported_document_types,default_document_types,settings_json,created_by) VALUES('PRINT-MIX-DEVICE','PRINT-MIX-DEVICE','合成标签机','label','system_printer',ARRAY['package_label'],ARRAY['package_label'],'{"driverMode":"system_printer"}','U-OFFICE-A')`);
 await pool.query(`INSERT INTO printer_devices(id,biz_no,name,device_type,connection_type,supported_document_types,settings_json,created_by) VALUES('PRINT-MIX-PAPER','PRINT-MIX-PAPER','合成针式机','dot_matrix','system_printer',ARRAY['delivery_note'],'{"driverMode":"system_printer"}','U-OFFICE-A');
 INSERT INTO business_decision_authorizations(id,employee_id,decision_scope,active_from,status,authorization_note) VALUES('AUTH-MIX-QTY','EMP-LIVE-MANAGER-001','fulfillment_quantity_variance','2026-01-01','active','合成数量差异授权');
 INSERT INTO price_snapshots(id,order_line_id,snapshot_type,version_no,bag_price,chargeable_qty,final_amount,created_by) VALUES('PRICE-MIX-A','ORD-0629-002-01','confirmation',1,0.34,1200,408,'U-OFFICE-A'),('PRICE-MIX-B','LINE-MIX-B','confirmation',1,0.34,800,272,'U-OFFICE-A');
 INSERT INTO inventory_items(id,inventory_key,size,standard_color_id,handle_type,style,zone,inventory_state,on_hand_qty,reserved_qty,waiting_pickup_locked_qty,pending_handling_qty,trust_level) VALUES('INV-MIX-B','INV-MIX-B','30*40*10','SC-RED','加长提','空白袋','MIX','仓库已清点',800,800,0,0,'已清点');
 INSERT INTO inventory_reservations(id,order_line_id,inventory_item_id,reserved_qty,status,created_by) VALUES('RES-MIX-A','ORD-0629-002-01','25*32*10-白色-加长提-空白袋-B区-服装',1200,'生效','U-OFFICE-A'),('RES-MIX-B','LINE-MIX-B','INV-MIX-B',800,'生效','U-OFFICE-A');`);
 const preparePrint=async()=>{const w=await fresh();w.fulfillmentActionTransactionRepository=createPostgresFulfillmentActionTransactionRepository({postgresClient:client});w.printDeviceRepository=createPostgresPrintDeviceRepository({postgresClient:client});w.printJobRepository=createPostgresPrintJobRepository({postgresClient:client});Object.assign(w,await w.printJobRepository.loadState());return w;};
 async function queueLabel(key){const w=await preparePrint();const r=await services.fulfillmentPrintCommandService.printFulfillment({workspace:w,fulfillmentId:'F002',body:{documentType:'package_label',printDeviceId:'PRINT-MIX-DEVICE',printAction:'first_print',idempotencyKey:key},operatorId:'U-OFFICE-A'});assert.ok(r.printJob,JSON.stringify(r));const cold=await fresh();assert.equal(cold.fulfillments.find(f=>f.id==='F002').packingGroupAnchorId,'F002');assert.equal(cold.printRecords.find(p=>p.id===r.printRecord.printRecordId).documentType,'package_label');return r;}
 async function confirmPrint(queued,key){const w=await preparePrint(),job=w.printJobs.find(j=>j.printJobId===queued.printJob.printJobId);const projected=await services.printJobBusinessProjectionService.persistFulfillmentPrintJobProjection({workspace:w,printJob:{...job,jobStatus:'printed',finishedAt:new Date().toISOString()},printJobOperationLog:{id:`LOG-${key}`,targetType:'print_job',targetId:job.printJobId,action:'record_print_job_driver_status',operatorId:'U-OFFICE-A',occurredAt:new Date().toISOString(),createdAt:new Date().toISOString()},operatorId:'U-OFFICE-A',idempotencyKey:key});return projected;}
 let workspace=await fresh();
 const body=()=>({fulfillmentIds:['F002','F-MIX-B'],snapshotToken:getPackageGroupContext(workspace,{fulfillmentId:'F002'}).snapshotToken,physicalContentsConfirmed:true,reason:'按实物逐包确认',idempotencyKey:'mixed-create',packages:Array.from({length:2},()=>({confirmed:true,items:[{fulfillmentId:'F002',orderLineId:'ORD-0629-002-01',packedQty:600},{fulfillmentId:'F-MIX-B',orderLineId:'LINE-MIX-B',packedQty:400}]}))});
 const request=body(),input={workspace,fulfillmentId:'F002',body:request,operatorId:'U-OFFICE-A'};
 const ledgerBefore=(await pool.query('SELECT count(*)::int AS n FROM inventory_ledger_entries')).rows[0].n;
 let committedReadFailure=false;
 const faultRepository=createPostgresProductionPackingTransactionRepository({queryJson:async(text,values)=>{if(committedReadFailure&&text.includes("'customers',")){committedReadFailure=false;throw Error('synthetic post-commit cold read failure');}return client.queryJson(text,values);},idempotentTransactionJson:async request=>{const saved=await client.idempotentTransactionJson(request);committedReadFailure=true;return saved;}});
 workspace.productionPackingTransactionRepository=faultRepository;await assert.rejects(()=>replacePackageGroup(input),/synthetic post-commit cold read failure/);
 workspace.productionPackingTransactionRepository=repo;
 const receipt=await replacePackageGroup(input);assert.deepEqual(workspace.packages.filter(p=>p.fulfillmentId==='F002'&&p.status==='待打印标签').map(p=>p.packageId).sort(),[...receipt.packageIds].sort(),'original-key retry refreshes authoritative packages after committed read failure');assert.equal(receipt.packageIds.length,2);assert.equal(receipt.quantityDifferences.length,0);assert.equal(workspace.packages.filter(p=>p.status==='已失效').length,3);
 assert.equal((await pool.query('SELECT count(*)::int AS n FROM inventory_ledger_entries')).rows[0].n,ledgerBefore);
 workspace=await fresh();assert.equal(workspace.packages.filter(p=>p.fulfillmentId==='F002'&&p.contents.length===2).length,2);assert.equal(workspace.fulfillments.find(f=>f.id==='F-MIX-B').packingGroupAnchorId,'F002');
 assert.deepEqual(await replacePackageGroup({...input,workspace}),receipt);
 await assert.rejects(()=>replacePackageGroup({...input,workspace,body:{...request,reason:'不能重复使用不同请求'}}),e=>e.code==='IDEMPOTENCY_KEY_REUSED');
 const labels=buildFulfillmentPrintTemplate({documentType:'package_label',fulfillment:workspace.fulfillments.find(f=>f.id==='F002'),packageLabelRows:packageLabelRows(receipt.packages)});
 assert.deepEqual(labels.labels.map(p=>p.sequence),['1/2','2/2']);assert.deepEqual(labels.labels.map(p=>p.barcodeText),receipt.packageIds);assert.equal(labels.labels[0].contents.length,2);assert.doesNotMatch(JSON.stringify(labels),/unitPrice|receivable|amount|salePrice/);
 const driverRead=createPostgresDriverDeliveryTaskReadRepository({postgresClient:client});
 let tasks=await driverRead.listDriverDeliveryTasks({operatorId:'U-DRIVER-A'});assert.equal(tasks.items.some(t=>t.fulfillmentId==='F-MIX-B'),false);assert.equal(tasks.items.find(t=>t.fulfillmentId==='F002').packageCount,2);assert.equal(tasks.items.find(t=>t.fulfillmentId==='F002').packageChecklist[0].contents.length,2);
 // Real PostgreSQL print command creates the exact immutable per-package payload;
 // only the trusted-driver projection below grants label success. No hardware is invoked.
 const oldPrint=await queueLabel('mixed-old-label');assert.equal(oldPrint.printJob.payload.printTemplate.labels.length,2);assert.equal(oldPrint.printJob.payload.printTemplate.labels[0].contents.length,2);
 assert.equal((await confirmPrint(oldPrint,'mixed-old-label-confirm')).physicalPrintConfirmed,true);
 workspace=await fresh();assert.ok(workspace.packages.filter(p=>receipt.packageIds.includes(p.packageId)).every(p=>p.status==='已打印标签'&&p.contents.length===2));
 // Correction creates all-new physical codes and keeps old code history.
 const correction={...body(),idempotencyKey:'mixed-correction',reason:'按实物改正：白袋实际1000，须办公室决定差异',packages:body().packages.map(p=>({...p,items:p.items.map(i=>i.fulfillmentId==='F002'?{...i,packedQty:500}:i)}))};
 const corrected=await replacePackageGroup({workspace,fulfillmentId:'F002',body:correction,operatorId:'U-OFFICE-A'});assert.ok(corrected.packageIds.every(id=>!receipt.packageIds.includes(id)));
 assert.equal((await pool.query('SELECT count(*)::int AS n FROM packages WHERE id=ANY($1) AND status=\'已失效\'',[receipt.packageIds])).rows[0].n,2);
 const late=await confirmPrint(oldPrint,'mixed-obsolete-print-callback');assert.equal(late.handled,false);
 assert.equal((await pool.query("SELECT status FROM print_records WHERE id=$1",[oldPrint.printRecord.printRecordId])).rows[0].status,'voided');
 // A stale writer waiting behind a real persisted downstream change must fully roll back.
 workspace=await fresh();const stale={...body(),idempotencyKey:'mixed-stale'};
 blocker=await pool.connect();await blocker.query('BEGIN');await blocker.query("UPDATE order_lines SET revision=revision+1 WHERE id='LINE-MIX-B'");
 const pending=replacePackageGroup({workspace,fulfillmentId:'F002',body:stale,operatorId:'U-OFFICE-A'}).then(value=>({value}),error=>({error}));
 await new Promise(r=>setTimeout(r,120));await blocker.query('COMMIT');blocker.release();blocker=null;assert.ok((await pending).error);
 assert.equal((await pool.query("SELECT count(*)::int AS n FROM operation_idempotency_keys WHERE idempotency_key='mixed-stale'")).rows[0].n,0);

 // Actual shortage remains blocked until an authorized durable decision exists.
 let office=await preparePrint();let denied=await services.fulfillmentPrintCommandService.printFulfillment({workspace:office,fulfillmentId:'F002',body:{documentType:'package_label',printDeviceId:'PRINT-MIX-DEVICE',idempotencyKey:'mixed-denied-label'},operatorId:'U-OFFICE-A'});assert.equal(denied.code,'PACKING_QUANTITY_REVIEW_REQUIRED');
 const decisionRepository=createPostgresBusinessDecisionEvidenceRepository({postgresClient:client});Object.assign(office,await decisionRepository.loadState());office.users=[{userId:'U-MANAGER-A',employeeId:'EMP-LIVE-MANAGER-001'}];
 const variance=await services.fulfillmentActionCommandService.resolveFulfillmentQuantityVariance({workspace:office,fulfillmentId:'F002',body:{expectedRevision:office.fulfillments.find(f=>f.id==='F002').revision,resolutionResult:'按实际数量出库',reason:'合成现场实际1000',directDecisionContent:{summary:'核实实物，按1000个出库'},idempotencyKey:'mixed-approve-quantity'},operatorId:'U-MANAGER-A',actionPermissions:['business_decision.act_directly','fulfillment.quantity_variance.direct']});assert.ok(variance.response,JSON.stringify(variance));assert.equal(variance.response.quantityVarianceResolution.actualQty,1000);
 const currentPrint=await queueLabel('mixed-current-label');assert.equal((await confirmPrint(currentPrint,'mixed-current-label-confirm')).physicalPrintConfirmed,true);
 // Print the real per-line paper, receive the trusted driver result, hand the
 // current paper to warehouse, then execute actual inventory movements. No SQL
 // setting physical_outbound_at substitutes for this chain.
 for(const fid of ['F-MIX-B','F002']){
  let w=await preparePrint();const paper=await services.fulfillmentPrintCommandService.printFulfillment({workspace:w,fulfillmentId:fid,body:{documentType:'delivery_note',printDeviceId:'PRINT-MIX-PAPER',idempotencyKey:`mixed-paper-${fid}`},operatorId:'U-OFFICE-A'});assert.ok(paper.printJob,JSON.stringify(paper));if(fid==='F002'){assert.equal(paper.paperOutboundDocument.instructionQty,1000);assert.ok(paper.paperOutboundDocument.instructionResolutionId);assert.equal(paper.printTemplate.fields.quantity,1000);}
  assert.equal((await confirmPrint(paper,`mixed-paper-confirm-${fid}`)).physicalPrintConfirmed,true);
  w=await preparePrint();let f=w.fulfillments.find(f=>f.id===fid),doc=w.paperOutboundDocuments.find(p=>(p.id??p.paperOutboundDocumentId)===f.paperOutboundDocumentId);
  const handed=await services.fulfillmentActionCommandService.handoffPaperOutboundDocument({workspace:w,fulfillmentId:fid,body:{expectedRevision:f.revision,paperOutboundDocumentId:doc.id??doc.paperOutboundDocumentId,paperDocumentVersion:doc.documentVersion,paperDocumentRevision:doc.revision,idempotencyKey:`mixed-paper-handoff-${fid}`},operatorId:'U-OFFICE-A'});assert.ok(handed.response,JSON.stringify(handed));
  w=await preparePrint();f=w.fulfillments.find(f=>f.id===fid);doc=w.paperOutboundDocuments.find(p=>(p.id??p.paperOutboundDocumentId)===f.paperOutboundDocumentId);
  const execution={expectedRevision:f.revision,paperOutboundDocumentId:doc.id??doc.paperOutboundDocumentId,paperDocumentVersion:doc.documentVersion,paperDocumentRevision:doc.revision,result:'实物已出库',actualQty:fid==='F002'?1000:800,physicalExecutorEmployeeId:'EMP-LIVE-MANAGER-001',feedbackChannel:'当面',executedAt:new Date().toISOString(),idempotencyKey:`mixed-real-warehouse-${fid}`};
  let result;
  if(fid==='F-MIX-B'){
   blocker=await pool.connect();await blocker.query('BEGIN');const pid=(await blocker.query('SELECT pg_backend_pid() pid')).rows[0].pid;await blocker.query("SELECT id FROM fulfillment_records WHERE id='F-MIX-B' FOR UPDATE");
   const pending=services.fulfillmentActionCommandService.recordWarehouseOutboundExecution({workspace:w,fulfillmentId:fid,body:execution,operatorId:'U-WAREHOUSE-A'}).then(value=>({value}),error=>({error}));
   let waited=false;for(let i=0;i<100;i++){if((await pool.query('SELECT 1 FROM pg_stat_activity WHERE $1::int=ANY(pg_blocking_pids(pid))',[pid])).rowCount){waited=true;break;}await new Promise(r=>setTimeout(r,20));}assert.equal(waited,true);
   const voidState=await preparePrint(),voidPending=services.fulfillmentPrintCommandService.voidPrintRecord({workspace:voidState,printRecordId:currentPrint.printRecord.printRecordId,body:{voidReason:'合成并发作废',idempotencyKey:'mixed-concurrent-void'},operatorId:'U-OFFICE-A'}).then(value=>({value}),error=>({error}));
   await new Promise(r=>setTimeout(r,60));await blocker.query('COMMIT');blocker.release();blocker=null;
   const outbound=await pending;assert.ok(outbound.value?.response,JSON.stringify(outbound.error));result=outbound.value;
   const voided=await voidPending;assert.ok(voided.error?.statusCode===409||voided.value?.error,JSON.stringify(voided));assert.equal((await pool.query('SELECT status FROM print_records WHERE id=$1',[currentPrint.printRecord.printRecordId])).rows[0].status,'printed','concurrent void cannot erase child physical-outbound labels');
  }else result=await services.fulfillmentActionCommandService.recordWarehouseOutboundExecution({workspace:w,fulfillmentId:fid,body:execution,operatorId:'U-WAREHOUSE-A'});assert.ok(result.response,JSON.stringify(result));assert.equal(result.response.warehouseOutboundExecution.actualQty,execution.actualQty);
  const retry=await services.fulfillmentActionCommandService.recordWarehouseOutboundExecution({workspace:w,fulfillmentId:fid,body:execution,operatorId:'U-WAREHOUSE-A'});assert.equal(retry.response.replayed,true);
 }
 const labelState=await fresh();assert.ok(labelState.fulfillments.filter(f=>f.packingGroupAnchorId==='F002').every(f=>hasTrustedCurrentFulfillmentLabel(labelState,f)),'current labels stay trusted across legitimate paper/warehouse revisions');
 const voidWorkspace=await preparePrint();const blockedVoid=await services.fulfillmentPrintCommandService.voidPrintRecord({workspace:voidWorkspace,printRecordId:currentPrint.printRecord.printRecordId,body:{voidReason:'不能抹除实出挂牌'},operatorId:'U-OFFICE-A'});assert.equal(blockedVoid.code,'PACKING_GROUP_DOWNSTREAM_LOCKED');
 const stock=(await pool.query("SELECT id,on_hand_qty,reserved_qty FROM inventory_items WHERE id IN('25*32*10-白色-加长提-空白袋-B区-服装','INV-MIX-B') ORDER BY id")).rows;assert.deepEqual(stock.map(i=>[i.on_hand_qty,i.reserved_qty]),[[1100,0],[0,0]]);
 workspace=await fresh();await assert.rejects(()=>replacePackageGroup({workspace,fulfillmentId:'F002',body:{...body(),idempotencyKey:'downstream-reject'},operatorId:'U-OFFICE-A'}),e=>e.code==='PACKING_GROUP_DOWNSTREAM_LOCKED');
 workspace=await fresh();const load=checked=>confirmPackageGroupLoaded({workspace,fulfillmentId:'F002',body:{idempotencyKey:'mixed-load',checkedPackageIds:checked},operatorId:'U-DRIVER-A'});
 for(const bad of [[...corrected.packageIds,corrected.packageIds[0]],corrected.packageIds.slice(0,1),receipt.packageIds,['FOREIGN',corrected.packageIds[1]]])await assert.rejects(()=>load(bad),e=>e.code==='DRIVER_PACKAGE_CHECK_INVALID');
 await pool.query("UPDATE driver_delivery_dispatches SET route_batch_no='OTHER',revision=revision+1 WHERE fulfillment_id='F-MIX-B'");workspace=await fresh();await assert.rejects(()=>load(corrected.packageIds),e=>e.code==='PACKING_GROUP_DISPATCH_MISMATCH');
 await pool.query("UPDATE driver_delivery_dispatches SET route_batch_no=(SELECT route_batch_no FROM driver_delivery_dispatches WHERE fulfillment_id='F002'),revision=revision+1 WHERE fulfillment_id='F-MIX-B'");workspace=await fresh();
 blocker=await pool.connect();await blocker.query('BEGIN');const blockerPid=(await blocker.query('SELECT pg_backend_pid() pid')).rows[0].pid;
 await blocker.query("UPDATE driver_delivery_dispatches SET route_batch_no='CONCURRENT-OTHER',revision=revision+1 WHERE fulfillment_id='F-MIX-B'");
 const pendingLoad=load(corrected.packageIds).then(value=>({value}),error=>({error}));let observed=false;
 for(let i=0;i<100;i++){if((await pool.query('SELECT 1 FROM pg_stat_activity WHERE $1::int=ANY(pg_blocking_pids(pid))',[blockerPid])).rowCount){observed=true;break;}await new Promise(r=>setTimeout(r,20));}
 await blocker.query('COMMIT');blocker.release();blocker=null;const rejectedLoad=await pendingLoad;assert.equal(observed,true);assert.ok(rejectedLoad.error);assert.equal((await pool.query("SELECT count(*)::int AS n FROM fulfillment_records WHERE packing_group_anchor_id='F002' AND loaded_at IS NOT NULL")).rows[0].n,0);assert.equal((await pool.query("SELECT count(*)::int AS n FROM operation_idempotency_keys WHERE idempotency_key='mixed-load'")).rows[0].n,0);
 await pool.query("UPDATE driver_delivery_dispatches SET route_batch_no=(SELECT route_batch_no FROM driver_delivery_dispatches WHERE fulfillment_id='F002'),revision=revision+1 WHERE fulfillment_id='F-MIX-B'");workspace=await fresh();
 const ledgerAfterWarehouse=(await pool.query('SELECT count(*)::int AS n FROM inventory_ledger_entries')).rows[0].n;
 const loaded=await load(corrected.packageIds);assert.equal((await pool.query('SELECT count(*)::int AS n FROM inventory_ledger_entries')).rows[0].n,ledgerAfterWarehouse);assert.equal(loaded.fulfillmentIds.length,2);
 const persisted=(await pool.query("SELECT status,loaded_at::text AS at,loaded_by FROM fulfillment_records WHERE packing_group_anchor_id='F002'")).rows;assert.equal(new Set(persisted.map(f=>f.at)).size,1);assert.ok(persisted.every(f=>f.status==='配送中'&&f.loaded_by==='U-DRIVER-A'));
 assert.deepEqual(await load(corrected.packageIds),loaded);assert.equal((await pool.query("SELECT count(*)::int AS n FROM operation_logs WHERE action='driver_load_package_group'")).rows[0].n,1);
 tasks=await driverRead.listDriverDeliveryTasks({operatorId:'U-DRIVER-A'});assert.equal(tasks.items.find(t=>t.fulfillmentId==='F-MIX-B').packageCount,0);assert.match(tasks.items.find(t=>t.fulfillmentId==='F-MIX-B').packageSummary,/同组已装车/);
 // A legacy ordinary paper still says 1200 after a durable 1000 decision.
 // Requesting 1200 must fail at BOTH service and transaction boundaries.
 await pool.query(`INSERT INTO order_lines SELECT (jsonb_populate_record(NULL::order_lines,to_jsonb(l)||'{"id":"LINE-OLD-PAPER","biz_no":"LINE-OLD-PAPER","original_qty":1200,"line_status":"待出库"}'::jsonb)).* FROM order_lines l WHERE id='ORD-0629-002-01';
 INSERT INTO fulfillment_records(id,biz_no,order_line_id,customer_id,customer_snapshot,method,expected_qty,actual_qty,status,created_by,paper_outbound_document_id,paper_outbound_status) VALUES('F-OLD-PAPER','F-OLD-PAPER','LINE-OLD-PAPER','C002','{}','送货',1200,1000,'差异已确认待重新出库','U-OFFICE-A','PAPER-OLD-1200','已交库房');
 INSERT INTO print_records(id,biz_no,target_type,target_id,print_action,status,printed_by,printed_at,created_at) VALUES('PRINT-OLD-1200','PRINT-OLD-1200','fulfillment','F-OLD-PAPER','first_print','printed','U-OFFICE-A',now()-interval '1 day',now()-interval '1 day');
 INSERT INTO paper_outbound_documents(id,fulfillment_id,print_record_id,document_type,document_version,status,created_at) VALUES('PAPER-OLD-1200','F-OLD-PAPER','PRINT-OLD-1200','delivery_note',1,'已交库房',now()-interval '1 day');
 INSERT INTO business_decision_records(id,business_type,business_id,decision_scope,decision_type,decision_maker_employee_id,decision_maker_employee_no_snapshot,decision_maker_name_snapshot,decision_channel,decided_at,decision_content_json,authorization_basis,entered_by_user_id,entered_at,created_at,updated_at) VALUES('BD-OLD-PAPER','fulfillment','F-OLD-PAPER','fulfillment_quantity_variance','direct','EMP-LIVE-MANAGER-001','031','负责人','self_system',now(),'{}','合成事实：已批准1000','U-MANAGER-A',now(),now(),now());
 INSERT INTO fulfillment_quantity_variance_resolutions(id,fulfillment_id,expected_qty,actual_qty,resolution_result,business_decision_id,recorded_by) VALUES('QV-OLD-PAPER','F-OLD-PAPER',1200,1000,'按实际数量出库','BD-OLD-PAPER','U-MANAGER-A');
 INSERT INTO inventory_items(id,inventory_key,size,standard_color_id,handle_type,style,zone,inventory_state,on_hand_qty,reserved_qty) VALUES('INV-OLD-PAPER','INV-OLD-PAPER','25*32*10','SC-WHITE','加长提','空白袋','OLD-PAPER','仓库已清点',1200,1200);
 INSERT INTO inventory_reservations(id,order_line_id,inventory_item_id,reserved_qty,status,created_by) VALUES('RSV-OLD-PAPER','LINE-OLD-PAPER','INV-OLD-PAPER',1200,'生效','U-OFFICE-A');`);
 const old=await preparePrint(),oldF=old.fulfillments.find(f=>f.id==='F-OLD-PAPER'),at=new Date().toISOString();
 const oldRequest={expectedRevision:oldF.revision,paperOutboundDocumentId:'PAPER-OLD-1200',paperDocumentVersion:1,paperDocumentRevision:1,result:'实物已出库',actualQty:1200,physicalExecutorEmployeeId:'EMP-LIVE-MANAGER-001',feedbackChannel:'当面',executedAt:at,idempotencyKey:'old-paper-service-1200'};
 await assert.rejects(()=>services.fulfillmentActionCommandService.recordWarehouseOutboundExecution({workspace:old,fulfillmentId:oldF.id,body:oldRequest,operatorId:'U-WAREHOUSE-A'}),e=>e.code==='WAREHOUSE_INSTRUCTION_QUANTITY_CONFLICT');
 const oldAfter={...oldF,fulfillmentId:oldF.id,actualQty:1200,status:'待司机装车',physicalOutboundAt:at,physicalExecutorEmployeeId:'EMP-LIVE-MANAGER-001',physicalOutboundDocumentId:'PAPER-OLD-1200',physicalOutboundDocumentVersion:1};
 const oldExecution={warehouseOutboundExecutionId:'WEX-OLD-ESCAPE',fulfillmentId:oldF.id,paperOutboundDocumentId:'PAPER-OLD-1200',paperDocumentVersion:1,paperDocumentRevision:1,result:'实物已出库',expectedQty:1200,actualQty:1200,physicalExecutorEmployeeId:'EMP-LIVE-MANAGER-001',feedbackChannel:'当面',executedAt:at,authenticatedOperatorId:'U-WAREHOUSE-A',recordedAt:at,createdAt:at,updatedAt:at,revision:1};
 await assert.rejects(()=>old.fulfillmentActionTransactionRepository.recordFulfillmentAction({workspace:old,idempotencyKey:'old-paper-database-1200',idempotencyPayload:{fixture:'old-paper-1200'},fulfillment:oldAfter,warehouseOutboundExecution:oldExecution,inventoryReservations:[{...old.inventoryReservations.find(r=>r.id==='RSV-OLD-PAPER'),status:'已出库'}],inventoryAdjustments:[{inventoryItemId:'INV-OLD-PAPER',onHandQtyChange:-1200,reservedQtyChange:-1200}],inventoryLedgerEntries:[{ledgerId:'LEDGER-OLD-PAPER',inventoryItemId:'INV-OLD-PAPER',changeType:'出库扣减',qtyBefore:1200,qtyChange:-1200,qtyAfter:0,sourceType:'warehouse_physical_outbound',sourceId:oldF.id,operatorId:'U-WAREHOUSE-A',confirmedBy:'U-WAREHOUSE-A',occurredAt:at,createdAt:at}],operationLog:{id:'LOG-OLD-PAPER-ESCAPE',targetType:'fulfillment',targetId:oldF.id,action:'record_warehouse_outbound_execution',operatorId:'U-WAREHOUSE-A',before:{fulfillment:oldF},after:{fulfillment:oldAfter},occurredAt:at,createdAt:at}}),e=>e.statusCode===409);
 assert.deepEqual((await pool.query("SELECT on_hand_qty,reserved_qty FROM inventory_items WHERE id='INV-OLD-PAPER'")).rows[0],{on_hand_qty:1200,reserved_qty:1200});assert.equal((await pool.query("SELECT count(*)::int AS n FROM warehouse_outbound_executions WHERE id='WEX-OLD-ESCAPE'")).rows[0].n,0);assert.equal((await pool.query("SELECT count(*)::int AS n FROM operation_idempotency_keys WHERE idempotency_key='old-paper-database-1200'")).rows[0].n,0);
 console.log('PASS mixed physical package PG (1..52 + isolated 0054): real quantity approval, trusted labels/current paper, paper handoff, two real warehouse inventory movements, correction/old codes, commit-read recovery, dispatch lock rollback, one atomic group scan and replay. Root integration must verify full 1..54.');
} finally {if(blocker){await blocker.query('ROLLBACK');blocker.release();}if(pool)await pool.end();spawnSync('docker',['rm','-f',name],{encoding:'utf8'});}
