import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile,stat} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createApiServer} from '../server/apiServer.mjs';
import {withLocalRepositoryFixture} from './helpers/localRepositoryFixture.mjs';
import {listenTestServer,closeTestServer,getTestServerBaseUrl,requestJson} from './helpers/apiIntegrationTestHarness.mjs';
const root=await mkdtemp(join(tmpdir(),'erp-colour-partition-'));
const previous=process.env.ERP_LOCAL_STORAGE_DIR;
process.env.ERP_LOCAL_STORAGE_DIR=join(root,'global-must-not-be-used');
const headers={'x-erp-user-id':'U-MANAGER-A','content-type':'application/json'};
const servers=[];
async function start(partition){const server=createApiServer(withLocalRepositoryFixture({runtimeMode:'test',runtimeStorageRoot:join(root,partition),applyProductionEnvFile:false}));await listenTestServer(server);servers.push(server);return getTestServerBaseUrl(server);}
async function save(base,factoryColor){const result=await requestJson(base,'/api/master-data/raw-material-supplier-colors',{method:'POST',headers,body:JSON.stringify({supplierName:'分区回归合成厂家',supplierColor:'184',factoryColor,enabled:true,reason:'独立数据目录测试'}),expectedStatus:200});assert.ok(result.body.operationLogId);return result.body.mapping;}
async function list(base){return (await requestJson(base,'/api/master-data/raw-material-supplier-colors',{headers,expectedStatus:200})).body.items;}
try{
 const baseA=await start('partition-a');const mappingA=await save(baseA,'白色');
 const baseB=await start('partition-b');assert.equal((await list(baseB)).some(row=>row.supplierColor==='184'&&row.supplierSourceId===mappingA.supplierSourceId),false,'A second runtime root must not hydrate the first partition');
 const mappingB=await save(baseB,'黑色');assert.equal(mappingA.id,mappingB.id,'same supplier rule identity may exist independently in two isolated roots');
 assert.equal((await list(baseA)).find(row=>row.id===mappingA.id).factoryColor,'白色');
 assert.equal((await list(baseB)).find(row=>row.id===mappingB.id).factoryColor,'黑色');
 for(const [partition,color] of [['partition-a','白色'],['partition-b','黑色']]){const state=JSON.parse(await readFile(join(root,partition,'metadata/supplier-colour-mappings.json'),'utf8'));assert.equal(state.colorAliases.filter(row=>row.id===mappingA.id).length,1);assert.ok(state.standardColors.some(row=>row.name===color));assert.equal(state.operationLogs.length,1);}
 await assert.rejects(stat(join(root,'global-must-not-be-used','metadata/supplier-colour-mappings.json')),{code:'ENOENT'});
 for(const server of servers.splice(0))await closeTestServer(server);
 const coldA=await start('partition-a'),coldB=await start('partition-b');
 assert.equal((await list(coldA)).find(row=>row.id===mappingA.id).factoryColor,'白色');assert.equal((await list(coldB)).find(row=>row.id===mappingB.id).factoryColor,'黑色');
 console.log('PASS actual API supplier-color local storage partition: injected runtimeStorageRoot wins over global fallback; same rule differs safely by root; independent audit and restart hydration remain isolated.');
}finally{for(const server of servers)await closeTestServer(server);if(previous===undefined)delete process.env.ERP_LOCAL_STORAGE_DIR;else process.env.ERP_LOCAL_STORAGE_DIR=previous;await rm(root,{recursive:true,force:true});}
