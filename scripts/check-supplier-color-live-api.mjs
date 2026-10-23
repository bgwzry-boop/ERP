import { withLocalRepositoryFixture } from './helpers/localRepositoryFixture.mjs';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile,writeFile,mkdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
const previous=process.env.ERP_LOCAL_STORAGE_DIR;
const directory=await mkdtemp(join(tmpdir(),'erp-colour-http-'));
process.env.ERP_LOCAL_STORAGE_DIR=directory;
const {createApiServer}=await import('../server/apiServer.mjs');
const {createRuntimeSession}=await import('../server/authSeed.mjs');
const {listOfficeRawMaterialSupplierColorMappings:list,saveOfficeRawMaterialSupplierColorMapping:save}=await import('../src/features/raw-materials/rawMaterialSupplierColorMappingApiClient.js');
const authSecret='isolated-supplier-colour-http-test';
const users=['management','driver'].map(role=>({userId:`TEST-${role}`,loginName:`test-${role}`,displayName:role,roles:[role],defaultRole:role,enabled:true,loginEnabled:true,passwordHash:'fixture',passwordStatus:'active',sessionVersion:1}));
const auth=role=>({session:{accessToken:createRuntimeSession(`TEST-${role}`,{authSecret,sessionVersion:1}).accessToken}});
const {createLocalRuntimeIdentityRepository}=await import('../server/runtimeIdentityRepository.mjs');
const identityRepository=createLocalRuntimeIdentityRepository({storageRoot:directory});
identityRepository.saveState({workspace:{users,revokedSeedSessions:[]}});
let server=createApiServer(withLocalRepositoryFixture({authSecret,runtimeIdentityRepository:identityRepository,runtimeMode:'test',allowLocalFixture:true,applyProductionEnvFile:false}));
try {
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 let base=`http://127.0.0.1:${server.address().port}`;
 const options={baseUrl:`${base}/api`,fetchImpl:(url,init)=>fetch(`${base}/api/master-data/raw-material-supplier-colors`,init)};
 const input={authState:auth('management'),supplierName:'HTTP测试厂家',supplierSourceId:'TEST-HTTP-SUPPLIER',supplierColor:'184',factoryColor:'本白',reason:'HTTP contract verification',enabled:true};
 const denied=await save({...input,authState:auth('driver')},options);
 assert.equal(denied.blocked,true);assert.equal(denied.error.status,403);
 const created=await save(input,options);
 assert.equal(created.source,'api',JSON.stringify(created));assert.ok(created.operationLogId);assert.equal(created.mapping.enabled,true);
 const listed=await list({authState:auth('management')},options);
 assert.equal(listed.source,'api');assert.ok(listed.items.some(item=>item.id===created.mapping.id));
 const conflict=await save({...input,mappingId:created.mapping.id,supplierSourceId:'OTHER-SUPPLIER'},options);
 assert.equal(conflict.error.code,'RAW_MATERIAL_COLOR_MAPPING_IDENTITY_CONFLICT');
 const disabled=await save({...input,mappingId:created.mapping.id,expectedMapping:created.mapping,enabled:false},options);
 assert.equal(disabled.source,'api',JSON.stringify(disabled));assert.equal(disabled.mapping.id,created.mapping.id);assert.equal(disabled.mapping.enabled,false);
 const final=await list({authState:auth('management')},options);
 assert.equal(final.items.find(item=>item.id===created.mapping.id).enabled,false);
 const persisted=JSON.parse(await readFile(join(directory,'metadata/supplier-colour-mappings.json'),'utf8'));
 const audit=persisted.operationLogs.filter(row=>row.targetId===created.mapping.id);
 assert.equal(audit.length,2);assert.ok(audit.every(row=>row.operatorId==='TEST-management'));
 assert.deepEqual(new Set(audit.map(row=>row.id)),new Set([created.operationLogId,disabled.operationLogId]));
 const readDenied=await list({authState:auth('driver')},options);assert.equal(readDenied.error.status,403);

 await new Promise(resolve=>server.close(resolve));
 server=createApiServer(withLocalRepositoryFixture({authSecret,runtimeIdentityRepository:createLocalRuntimeIdentityRepository({storageRoot:directory}),runtimeMode:'test',allowLocalFixture:true,applyProductionEnvFile:false}));
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 base=`http://127.0.0.1:${server.address().port}`;
 const restarted=await list({authState:auth('management')},options);
 assert.equal(restarted.source,'api',JSON.stringify(restarted));
 assert.deepEqual(restarted.items.find(item=>item.id===created.mapping.id),disabled.mapping,'Restart must preserve the disabled mapping and its identity');
 const snapshotPath=join(directory,'metadata/supplier-colour-mappings.json');
 const beforeFailedWrite=await readFile(snapshotPath,'utf8');
 await mkdir(`${snapshotPath}.tmp`);
 const failedWrite=await save({...input,mappingId:created.mapping.id,expectedMapping:disabled.mapping,enabled:true,reason:'Injected disk write failure'},options);
 assert.equal(failedWrite.blocked,true);
 assert.equal(failedWrite.error.code,'RAW_MATERIAL_COLOR_MAPPING_WRITE_FAILED');
 assert.equal(await readFile(snapshotPath,'utf8'),beforeFailedWrite,'Failed save must preserve persisted data and audit');
 const afterFailedWrite=await list({authState:auth('management')},options);
 assert.deepEqual(afterFailedWrite.items.find(item=>item.id===created.mapping.id),disabled.mapping,'Failed save must roll back in-memory mapping');
 await rm(`${snapshotPath}.tmp`,{recursive:true});
 const recovered=await save({...input,mappingId:created.mapping.id,expectedMapping:disabled.mapping,enabled:true,reason:'Retry after storage recovery'},options);
 assert.equal(recovered.source,'api',JSON.stringify(recovered));
 assert.equal(recovered.mapping.enabled,true);
 const recoveredState=JSON.parse(await readFile(snapshotPath,'utf8'));
 assert.equal(recoveredState.operationLogs.filter(row=>row.targetId===created.mapping.id).length,3,'Failed write cannot leave an audit event');
 if (process.argv.includes('--stale-edit')) {
   // Both editors captured this same server response before either saved.
   const originalView=recovered.mapping;
   const firstEdit=await save({...input,mappingId:originalView.id,expectedMapping:originalView,factoryColor:'大红',reason:'First editor'},options);
   assert.equal(firstEdit.source,'api');
   const staleEdit=await save({...input,mappingId:originalView.id,expectedMapping:originalView,factoryColor:'宝兰',reason:'Second editor with stale view'},options);
   assert.equal(staleEdit.blocked,true,'A stale editor must not silently overwrite the first committed change');
   const current=await list({authState:auth('management')},options);
   assert.equal(current.items.find(row=>row.id===originalView.id).factoryColor,'大红');
 }
 const {createLocalMasterDataImportTransactionRepository}=await import('../server/masterDataImportTransactionRepository.mjs');
 const colourRepository=createLocalMasterDataImportTransactionRepository();
 for (const invalid of ['broken JSON', JSON.stringify({version:99,standardColors:[],colorAliases:[],operationLogs:[]})]) {
   await writeFile(join(directory,'metadata/supplier-colour-mappings.json'),invalid);
   assert.throws(()=>colourRepository.loadSupplierColourState(),'Corrupt state must fail rather than return seed defaults');
 }
 console.log('PASS signed real HTTP and actual colour API client: manager save/list/disable, mismatched identity conflict, driver read/write denied, restart preserves disabled mapping. Isolated local storage; not PostgreSQL concurrency.');
} finally {
 await new Promise(resolve=>server.close(resolve));await rm(directory,{recursive:true,force:true});
 if(previous===undefined)delete process.env.ERP_LOCAL_STORAGE_DIR;else process.env.ERP_LOCAL_STORAGE_DIR=previous;
}
