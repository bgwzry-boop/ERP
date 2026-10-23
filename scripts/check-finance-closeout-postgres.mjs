import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import pg from 'pg';
import {loadMigrationFiles,validateMigrationSet} from './dbMigrationUtils.mjs';
import {postgresLiveBusinessSeedSql} from './helpers/postgresLiveBusinessSeed.mjs';
import {createPostgresPoolClient} from '../server/postgresPoolClient.mjs';
import {createPostgresCoreWorkspaceReadRepository} from '../server/coreWorkspaceReadRepository.mjs';
import {createPostgresFulfillmentActionTransactionRepository} from '../server/fulfillmentActionTransactionRepository.mjs';
import {createFulfillmentPrintCommandService} from '../server/services/fulfillmentPrintCommandService.mjs';
import {buildFulfillmentPrintTemplate,getDocumentType,getTemplateId} from '../src/domain/printTemplates.js';
import { createPostgresStatementPaymentTransactionRepository } from '../server/statementPaymentTransactionRepository.mjs';
import { createPostgresPaymentRecordRepository } from '../server/paymentRecordRepository.mjs';
import { createPostgresStatementSendTransactionRepository } from '../server/statementSendTransactionRepository.mjs';

const name=`erp-finance-closeout-${process.pid}-${Date.now()}`;
const docker=args=>{const r=spawnSync('docker',args,{encoding:'utf8'});if(r.status!==0)throw Error(r.stderr||r.stdout);return r.stdout.trim();};
let pool;
try {
  docker(['run','--rm','-d','--name',name,'-p','127.0.0.1::5432','-e','POSTGRES_DB=erp','-e','POSTGRES_USER=erp','-e','POSTGRES_PASSWORD=erp','postgres:16-alpine']);
  for(let i=0;i<60;i++){if(spawnSync('docker',['exec',name,'pg_isready','-h','127.0.0.1','-U','erp']).status===0)break;if(i===59)throw Error('PostgreSQL startup timeout');await new Promise(r=>setTimeout(r,250));}
  pool=new pg.Pool({host:'127.0.0.1',port:Number(docker(['port',name,'5432/tcp']).split(':').at(-1)),database:'erp',user:'erp',password:'erp',statement_timeout:15000});
  const migrations=loadMigrationFiles();validateMigrationSet(migrations);for(const m of migrations)await pool.query(m.sql);await pool.query(postgresLiveBusinessSeedSql);
  await checkPaymentPersistence(pool);
  const lineId='ORD-0629-002-01';
  await pool.query("UPDATE fulfillment_records SET expected_qty=400,actual_qty=400,status='待出库' WHERE id='F002'");
  const addPrice=(version,amount)=>pool.query("INSERT INTO price_snapshots(id,order_line_id,version_no,snapshot_type,chargeable_qty,final_amount,created_by,created_at) VALUES($1,$2,$3,'quantity_adjustment',1200,$4,'U-OFFICE-A',$5)",[`PS-PRINT-${version}`,lineId,version,amount,`2026-09-0${version}T00:00:00Z`]);
  await addPrice(1,432);
  const device={printDeviceId:'PD-PRINT-PRICE',name:'Synthetic paper device',status:'active',supportedDocumentTypes:['delivery_note'],defaultDocumentTypes:['delivery_note'],settings:{driverMode:'system_printer'}};
  await pool.query("INSERT INTO printer_devices(id,biz_no,name,device_type,supported_document_types,default_document_types,settings_json) VALUES($1,$1,$2,'dot_matrix',ARRAY['delivery_note'],ARRAY['delivery_note'],$3)",[device.printDeviceId,device.name,JSON.stringify(device.settings)]);
  const client=createPostgresPoolClient({pool});
  const repo=createPostgresFulfillmentActionTransactionRepository({postgresClient:client});
  const reader=createPostgresCoreWorkspaceReadRepository({postgresClient:client});
  const workspace=async()=>({...await reader.loadState(),fulfillmentActionTransactionRepository:repo,printDeviceRepository:{getDefaultPrintDevice:async()=>device,listPrintDevices:async()=>[device]}});
  const service=createFulfillmentPrintCommandService({
    now:()=>new Date('2026-09-06T00:00:00Z'),buildFulfillmentPrintTemplate,getDocumentType,getTemplateId,
    buildFulfillmentActionRecord:(_w,f)=>({...f,fulfillmentId:f.fulfillmentId??f.id}),
    buildOperationLog:(_w,input)=>({id:`LOG-${randomUUID()}`,...input,occurredAt:'2026-09-06T00:00:00Z',createdAt:'2026-09-06T00:00:00Z'}),
    buildPrintDeviceSnapshot:d=>d,
  });
  const request=(w,key,action='first_print')=>({workspace:w,fulfillmentId:'F002',operatorId:'U-OFFICE-A',body:{idempotencyKey:key,printAction:action,documentType:'delivery_note'}});
  const [firstWorkspace,secondWorkspace]=await Promise.all([workspace(),workspace()]);
  const results=await Promise.all([service.printFulfillment(request(firstWorkspace,'pg-print-price-once')),service.printFulfillment(request(secondWorkspace,'pg-print-price-once'))]);
  assert.equal(results[0].printJobId,results[1].printJobId);
  const first=results[0];
  const persisted=(await pool.query('SELECT payload_json FROM print_jobs WHERE id=$1',[first.printJobId])).rows[0].payload_json.printTemplate;
  assert.equal(persisted.fields.totalAmountText,'¥144');assert.equal(persisted.fields.lineItems[0].unitPriceText,'¥0.36');assert.equal(persisted.fields.pricingEvidence.priceSnapshotId,'PS-PRINT-1');
  const count=async()=>(await pool.query("SELECT (SELECT count(*)::int FROM print_jobs WHERE target_id='F002') jobs,(SELECT count(*)::int FROM print_records WHERE target_id='F002') records,(SELECT count(*)::int FROM operation_logs WHERE target_id='F002' AND action='print_fulfillment') logs")).rows[0];
  assert.deepEqual(await count(),{jobs:1,records:1,logs:1});
  await addPrice(2,864);
  const replay=await service.printFulfillment(request(await workspace(),'pg-print-price-once'));
  assert.equal(replay.printTemplate.fields.totalAmountText,'¥144');assert.equal(replay.printJobId,first.printJobId);assert.deepEqual(await count(),{jobs:1,records:1,logs:1});
  const stale=await workspace();stale.fulfillmentActionTransactionRepository={...repo,recordFulfillmentPrint:async input=>{await addPrice(3,1296);return repo.recordFulfillmentPrint(input);}};
  await assert.rejects(service.printFulfillment(request(stale,'pg-print-price-stale','preview')),{code:'BUSINESS_WRITE_CONFLICT'});
  assert.deepEqual(await count(),{jobs:1,records:1,logs:1});
  const staleHistory=await workspace();staleHistory.fulfillmentActionTransactionRepository={...repo,recordFulfillmentPrint:async input=>{
    await pool.query("INSERT INTO statements(id,biz_no,customer_id,period_start,period_end) VALUES('ST-PRINT-PRICE','ST-PRINT-PRICE','C002','2026-09-01','2026-09-30')");
    await pool.query("INSERT INTO statement_lines(id,statement_id,order_line_id,fulfillment_id,delivered_qty,chargeable_qty,final_amount) VALUES('STL-PRINT-PRICE','ST-PRINT-PRICE',$1,'F002',400,400,432)",[lineId]);
    return repo.recordFulfillmentPrint(input);
  }};
  await assert.rejects(service.printFulfillment(request(staleHistory,'pg-print-history-stale','preview')),{code:'BUSINESS_WRITE_CONFLICT'});
  assert.deepEqual(await count(),{jobs:1,records:1,logs:1});
  const historical=await service.printFulfillment(request(await workspace(),'pg-print-history-current','preview'));
  assert.equal(historical.printTemplate.fields.totalAmountText,'¥432');assert.equal(historical.printTemplate.fields.pricingEvidence.source,'recorded_statement');
  assert.equal(historical.printTemplate.fields.lineItems[0].unitPriceText,'待核价');
  assert.deepEqual((await pool.query('SELECT payload_json FROM print_jobs WHERE id=$1',[first.printJobId])).rows[0].payload_json.printTemplate, persisted, 'later prices, accounting and previews never rewrite the original paper snapshot');
  console.log(`PASS print pricing PostgreSQL: ${migrations.length} migrations, real service/template/atomic persistence, same-key concurrent single commit, 144/0.36 saved evidence, cold original replay, changed price/history rollback, recorded amount preview. No OS print or business environment writes.`);
} finally {await pool?.end();docker(['rm','-f',name]);}

async function checkPaymentPersistence(pool) {
  const client = createPostgresPoolClient({ pool });
  const repository = createPostgresStatementPaymentTransactionRepository({ postgresClient: client });
  const statement = { id: 'ST-LIVE-REPO-001', customerId: 'C-LIVE-REPO', status: '收款待确认', receivable: 273, received: 273, variance: 0, revision: 1 };
  await pool.query("INSERT INTO attachments(id,file_name,file_type,purpose,mime_type,has_content,uploaded_by) VALUES('ATT-CLOSE-1','one.png','image','payment_screenshot','image/png',true,'U-FINANCE-A'),('ATT-CLOSE-2','two.png','image','payment_screenshot','image/png',true,'U-FINANCE-A')");
  await pool.query("INSERT INTO attachment_links(id,attachment_id,owner_type,owner_id,purpose) VALUES('LINK-CLOSE-1','ATT-CLOSE-1','statement','ST-LIVE-REPO-001','payment_screenshot'),('LINK-CLOSE-2','ATT-CLOSE-2','statement','ST-LIVE-REPO-001','payment_screenshot')");
  const workspace = () => ({ statements: [{ ...statement }], paymentRecords: [], operationLogs: [], todos: [] });
  const input = (key = 'close-receipt') => ({ workspace: workspace(), idempotencyKey: key, idempotencyPayload: { statementId: statement.id, amount: 273, key }, statement: { ...statement }, statements: [{ ...statement }], paymentRecord: { paymentRecordId: 'PAY-CLOSE-1', statementId: statement.id, customerId: statement.customerId, amount: 273, paidAt: '2026-10-23T00:00:00Z', operatorId: 'U-FINANCE-A', attachmentIds: ['ATT-CLOSE-1', 'ATT-CLOSE-2'] }, operationLog: { id: 'LOG-CLOSE-1', targetType: 'statement', targetId: statement.id, action: 'record_statement_payment', operatorId: 'U-FINANCE-A' } });
  const saved = await repository.recordStatementPayment(input());
  assert.deepEqual(saved.payment.attachmentIds, ['ATT-CLOSE-1', 'ATT-CLOSE-2']);
  const cold = await createPostgresPaymentRecordRepository({ postgresClient: client }).loadState();
  assert.deepEqual(cold.paymentRecords.find(row => row.paymentRecordId === 'PAY-CLOSE-1').attachmentIds, saved.payment.attachmentIds, 'both evidence links survive a cold database load');
  const replay = await createPostgresStatementPaymentTransactionRepository({ postgresClient: client }).recordStatementPayment(input());
  assert.deepEqual(replay.payment, saved.payment);
  const collision = input('collision'); collision.statement.revision = 2; collision.statement.received = 250; collision.paymentRecord.amount = 250;
  await assert.rejects(repository.recordStatementPayment(collision), { code: 'BUSINESS_WRITE_CONFLICT' });
  assert.equal(Number((await pool.query("SELECT amount FROM payment_records WHERE id='PAY-CLOSE-1'")).rows[0].amount), 273, 'conflicting payment id never overwrites original amount or evidence');
  await pool.query("UPDATE statements SET status='已核销' WHERE id=$1", [statement.id]);
  const closed = input('closed-new-receipt'); closed.statement.revision = 2; closed.paymentRecord.paymentRecordId = 'PAY-CLOSE-BLOCKED'; closed.operationLog.id = 'LOG-CLOSE-BLOCKED';
  await assert.rejects(repository.recordStatementPayment(closed), { code: 'BUSINESS_WRITE_CONFLICT' });
  const sendRepo = createPostgresStatementSendTransactionRepository({ postgresClient: client });
  const send = { workspace: { statements: [{ ...statement, status: '已核销', revision: 2 }], statementSendRecords: [], operationLogs: [] }, idempotencyKey: 'closed-send', idempotencyPayload: { key: 'closed-send' }, statement: { ...statement, status: '已核销', revision: 2 }, sendRecord: { sendRecordId: 'SEND-CLOSE-1', statementId: statement.id, channel: 'wechat', sentTo: '合成客户', sentBy: 'U-FINANCE-A', sentAt: '2026-10-23T00:00:00Z', revision: 1 }, operationLog: { id: 'LOG-SEND-CLOSE-1', targetType: 'statement', targetId: statement.id, action: 'mark_statement_sent', operatorId: 'U-FINANCE-A' } };
  assert.equal((await sendRepo.markStatementSent(send)).statement.status, '已核销');
  await assert.rejects(sendRepo.markStatementSent({ ...send, idempotencyKey: 'closed-send-reopen', idempotencyPayload: { key: 'closed-send-reopen' }, statement: { ...statement, status: '已发送待回款', revision: 3 } }), { code: 'BUSINESS_WRITE_CONFLICT' });
  assert.equal((await pool.query('SELECT status FROM statements WHERE id=$1', [statement.id])).rows[0].status, '已核销');
  console.log('PASS finance PostgreSQL: two evidence attachments retained after cold read; immutable payment identity; replay after save; closed receipt and communication cannot reopen accounting.');
}
