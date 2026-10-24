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
 const correction={...body(),idempotencyKey:'mixed-correction',reason:'原挂牌贴错，全部重印'};
 const corrected=await replacePackageGroup({workspace,fulfillmentId:'F002',body:correction,operatorId:'U-OFFICE-A'});assert.ok(corrected.packageIds.every(id=>!receipt.packageIds.includes(id)));
 assert.equal((await pool.query('SELECT count(*)::int AS n FROM packages WHERE id=ANY($1) AND status=\'已失效\'',[receipt.packageIds])).rows[0].n,2);
 const late=await confirmPrint(oldPrint,'mixed-obsolete-print-callback');assert.equal(late.handled,false);
 assert.equal((await pool.query("SELECT status FROM print_records WHERE id=$1",[oldPrint.printRecord.printRecordId])).rows[0].status,'voided');
 // A stale writer waiting behind a real persisted downstream change must fully roll back.
 workspace=await fresh();const stale={...body(),idempotencyKey:'mixed-stale'};
 blocker=await pool.connect();await blocker.query('BEGIN');await blocker.query("UPDATE fulfillment_records SET physical_outbound_at='2026-09-04T00:00:00Z',revision=revision+1 WHERE id='F-MIX-B'");
 const pending=replacePackageGroup({workspace,fulfillmentId:'F002',body:stale,operatorId:'U-OFFICE-A'}).then(value=>({value}),error=>({error}));
 await new Promise(r=>setTimeout(r,120));await blocker.query('COMMIT');blocker.release();blocker=null;assert.ok((await pending).error);
 assert.equal((await pool.query("SELECT count(*)::int AS n FROM operation_idempotency_keys WHERE idempotency_key='mixed-stale'")).rows[0].n,0);
 workspace=await fresh();await assert.rejects(()=>replacePackageGroup({workspace,fulfillmentId:'F002',body:{...body(),idempotencyKey:'downstream-reject'},operatorId:'U-OFFICE-A'}),e=>e.code==='PACKING_GROUP_DOWNSTREAM_LOCKED');
 const currentPrint=await queueLabel('mixed-current-label');assert.equal((await confirmPrint(currentPrint,'mixed-current-label-confirm')).physicalPrintConfirmed,true);
 await pool.query(`UPDATE fulfillment_records SET physical_outbound_at='2026-09-04T00:00:00Z',revision=revision+1 WHERE packing_group_anchor_id='F002';`);
 workspace=await fresh();const load=checked=>confirmPackageGroupLoaded({workspace,fulfillmentId:'F002',body:{idempotencyKey:'mixed-load',checkedPackageIds:checked},operatorId:'U-DRIVER-A'});
 for(const bad of [[...corrected.packageIds,corrected.packageIds[0]],corrected.packageIds.slice(0,1),receipt.packageIds,['FOREIGN',corrected.packageIds[1]]])await assert.rejects(()=>load(bad),e=>e.code==='DRIVER_PACKAGE_CHECK_INVALID');
 await pool.query("UPDATE driver_delivery_dispatches SET route_batch_no='OTHER',revision=revision+1 WHERE fulfillment_id='F-MIX-B'");workspace=await fresh();await assert.rejects(()=>load(corrected.packageIds),e=>e.code==='PACKING_GROUP_DISPATCH_MISMATCH');
 await pool.query("UPDATE driver_delivery_dispatches SET route_batch_no=(SELECT route_batch_no FROM driver_delivery_dispatches WHERE fulfillment_id='F002'),revision=revision+1 WHERE fulfillment_id='F-MIX-B'");workspace=await fresh();
 const loaded=await load(corrected.packageIds);assert.equal(loaded.fulfillmentIds.length,2);
 const persisted=(await pool.query("SELECT status,loaded_at::text AS at,loaded_by FROM fulfillment_records WHERE packing_group_anchor_id='F002'")).rows;assert.equal(new Set(persisted.map(f=>f.at)).size,1);assert.ok(persisted.every(f=>f.status==='配送中'&&f.loaded_by==='U-DRIVER-A'));
 assert.deepEqual(await load(corrected.packageIds),loaded);assert.equal((await pool.query("SELECT count(*)::int AS n FROM operation_logs WHERE action='driver_load_package_group'")).rows[0].n,1);
 tasks=await driverRead.listDriverDeliveryTasks({operatorId:'U-DRIVER-A'});assert.equal(tasks.items.find(t=>t.fulfillmentId==='F-MIX-B').packageCount,0);assert.match(tasks.items.find(t=>t.fulfillmentId==='F-MIX-B').packageSummary,/同组已装车/);
 console.log('PASS mixed physical package PG: contents, conservation, correction, old codes, dispatch, one atomic scan, rollback and replay');
} finally {if(blocker){await blocker.query('ROLLBACK');blocker.release();}if(pool)await pool.end();spawnSync('docker',['rm','-f',name],{encoding:'utf8'});}
