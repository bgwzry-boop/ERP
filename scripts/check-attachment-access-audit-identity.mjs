import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile,mkdir,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createPostgresAttachmentAccessAuditRepository,createLocalAttachmentAccessAuditRepository,buildInsertAttachmentAccessLogQuery,attachmentAccessAuditStoreKey} from '../server/attachmentAccessAuditRepository.mjs';
const directory=await mkdtemp(join(tmpdir(),'erp-access-audit-'));
try {
 const repository=createLocalAttachmentAccessAuditRepository({storageRoot:directory});
 const workspace={attachmentAccessLogs:[]};
 const accessLog={logId:'ALOG-test',attachmentId:'ATT-test',operationLogId:'LOG-test',action:'attachment_content_read',operatorId:'TEST',occurredAt:'2026-09-06T00:00:00Z'};
 repository.recordAccessLog({workspace,accessLog});
 const before=await readFile(join(directory,attachmentAccessAuditStoreKey),'utf8');
 assert.throws(()=>repository.recordAccessLog({workspace,accessLog:{...accessLog,operatorId:'DIFFERENT'}}),/identity already exists/);
 assert.equal(workspace.attachmentAccessLogs.length,1);
 assert.equal(workspace.attachmentAccessLogs[0].operatorId,'TEST');
 assert.equal(await readFile(join(directory,attachmentAccessAuditStoreKey),'utf8'),before);
 // A malformed in-memory history must not be silently filtered out and overwrite disk evidence.
 for (const history of [[workspace.attachmentAccessLogs[0], {}], [workspace.attachmentAccessLogs[0], workspace.attachmentAccessLogs[0]]]) {
   const damagedWorkspace = {attachmentAccessLogs: history};
   assert.throws(()=>repository.recordAccessLog({workspace:damagedWorkspace,accessLog:{...accessLog,logId:'ALOG-new'}}),/invalid or duplicate records/);
   assert.equal(damagedWorkspace.attachmentAccessLogs, history);
   assert.equal(await readFile(join(directory,attachmentAccessAuditStoreKey),'utf8'),before);
 }
 const temporaryPath=join(directory,attachmentAccessAuditStoreKey)+'.tmp';
 await mkdir(temporaryPath);
 assert.throws(()=>repository.recordAccessLog({workspace,accessLog:{...accessLog,logId:'ALOG-retry'}}));
 assert.equal(workspace.attachmentAccessLogs.length,1,'Failed disk write must not publish an in-memory audit');
 assert.equal(await readFile(join(directory,attachmentAccessAuditStoreKey),'utf8'),before);
 await rm(temporaryPath,{recursive:true});
 repository.recordAccessLog({workspace,accessLog:{...accessLog,logId:'ALOG-retry'}});
 assert.equal(workspace.attachmentAccessLogs.length,2);
 assert.equal(repository.loadState().attachmentAccessLogs.length,2);
 const snapshotPath=join(directory,attachmentAccessAuditStoreKey);
 for(const payload of ['broken JSON',JSON.stringify({version:99,attachmentAccessLogs:[]}),JSON.stringify({version:1}),JSON.stringify({version:1,attachmentAccessLogs:[{}]}),JSON.stringify({version:1,attachmentAccessLogs:[accessLog,accessLog]})]) {
   await writeFile(snapshotPath,payload);
   assert.throws(()=>repository.loadState(),'Corrupt audit evidence cannot silently become empty history');
   assert.equal(await readFile(snapshotPath,'utf8'),payload);
 }
 await writeFile(snapshotPath,before);
 assert.equal(repository.loadState().attachmentAccessLogs.length,1);
 for (const response of [null, {}, {items:[]}, {items:[{}],total:1},
   {items:[accessLog,accessLog],total:2}, {items:[accessLog],total:0},
   {items:[],total:-1}, {items:[],total:1.5}, {items:[],total:"1"},
   {items:[{...accessLog,attachmentId:'OTHER'}],total:1}]) {
   const pg=createPostgresAttachmentAccessAuditRepository({queryJson:async()=>response});
   await assert.rejects(()=>pg.listAccessLogs({attachmentId:accessLog.attachmentId}),/audit list/);
 }
 for (const response of [{items:[],total:0},{items:[accessLog],total:4}]) {
   const pg=createPostgresAttachmentAccessAuditRepository({queryJson:async()=>response});
   const result=await pg.listAccessLogs({attachmentId:accessLog.attachmentId});
   assert.equal(result.items.length,response.items.length);
   assert.equal(result.total,response.total);
 }
 const orderedHistory = [
   {...accessLog, logId:'ALOG-A', occurredAt:'2026-09-06T08:00:00+08:00'},
   {...accessLog, logId:'ALOG-C', occurredAt:'2026-09-06T00:00:00Z'},
   {...accessLog, logId:'ALOG-B', occurredAt:'2026-09-06T00:01:00Z'},
 ];
 const originalOrder = JSON.stringify(orderedHistory);
 const readWorkspace = {attachmentAccessLogs:orderedHistory};
 assert.deepEqual(repository.listAccessLogs({workspace:readWorkspace,attachmentId:accessLog.attachmentId}).items.map(item=>item.logId),['ALOG-B','ALOG-C','ALOG-A']);
 assert.equal(JSON.stringify(orderedHistory),originalOrder,'Read sorting must not mutate persisted history order');
 for (const limit of [0,-5,1.9]) {
   const result=repository.listAccessLogs({workspace:readWorkspace,attachmentId:accessLog.attachmentId,limit});
   assert.equal(result.items.length,1);assert.equal(result.total,3);
 }
 const many={attachmentAccessLogs:Array.from({length:120},(_,index)=>({...accessLog,logId:`ALOG-${index}`}))};
 assert.equal(repository.listAccessLogs({workspace:many,limit:1000}).items.length,100);
 assert.equal(repository.listAccessLogs({workspace:many,limit:NaN}).items.length,50);
 assert.throws(()=>repository.listAccessLogs({workspace:{attachmentAccessLogs:[{...accessLog,occurredAt:''}]}}),/invalid occurrence time/);
 const query=buildInsertAttachmentAccessLogQuery(accessLog);
 assert.doesNotMatch(query.text,/ON CONFLICT|DO UPDATE/i);
 assert.match(query.text,/INSERT INTO attachment_access_logs/);
 console.log('PASS local duplicate audit rejected without mutation; PostgreSQL insert has no overwrite clause (SQL contract only).');
}finally{await rm(directory,{recursive:true,force:true});}
