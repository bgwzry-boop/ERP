import assert from 'node:assert/strict';
import pg from 'pg';
import {startLivePostgres,stopLivePostgres} from './postgres-live/runtime.mjs';
import {createPostgresPoolClient} from '../server/postgresPoolClient.mjs';
import {createPostgresMasterDataImportTransactionRepository} from '../server/masterDataImportTransactionRepository.mjs';
import {createPostgresCoreWorkspaceReadRepository} from '../server/coreWorkspaceReadRepository.mjs';
const runtime=await startLivePostgres();
const attachmentPool=new pg.Pool({connectionString:runtime.resolveLiveDatabaseUrl(),max:8});
const runPsql=runtime.runPsql;
const coreWorkspaceReadRepository=createPostgresCoreWorkspaceReadRepository({postgresClient:createPostgresPoolClient({pool:attachmentPool})});
const masterDataImportTransactionRepository=createPostgresMasterDataImportTransactionRepository({postgresClient:createPostgresPoolClient({pool:attachmentPool})});
try {
  runPsql("INSERT INTO standard_colors (id,color_key,name) VALUES ('SC-CAS-TEST','cas-test','CAS test'); INSERT INTO color_aliases (id,alias,standard_color_id,source_type,source_id,enabled,updated_at) VALUES ('CA-CAS-TEST','184','SC-CAS-TEST','supplier','SUP-CAS',true,'2026-09-06T00:00:00Z');");
  const colourExpected={id:'CA-CAS-TEST',alias:'184',standardColorId:'SC-CAS-TEST',sourceType:'supplier',sourceId:'SUP-CAS',enabled:true,updatedAt:'2026-09-06T00:00:00Z'};
  const colourInput={workspace:{colorAliases:[colourExpected],standardColors:[{id:'SC-CAS-TEST',colorKey:'cas-test',name:'CAS test'}],operationLogs:[]},supplierColourExpected:colourExpected,importExecution:{executionId:'CAS-TEST',status:'ready_for_transaction_writer',officialImportEnabled:true,importPayload:{targetRecords:{colorAliases:[{...colourExpected,enabled:false}]}}},operationLog:{id:'LOG-CAS-ONE',targetType:'raw_material_supplier_color_mapping',targetId:'CA-CAS-TEST',action:'update',operatorId:'U-MANAGER-A',occurredAt:'2026-09-06T01:00:00Z'}};
  await masterDataImportTransactionRepository.applyImportExecution(colourInput);
  await assert.rejects(masterDataImportTransactionRepository.applyImportExecution({...colourInput,operationLog:{...colourInput.operationLog,id:'LOG-CAS-TWO'}}),/supplier_colour_snapshot_conflict/);
  assert.equal(runPsql("SELECT enabled FROM color_aliases WHERE id='CA-CAS-TEST';",{capture:true}).trim(),'f');
  assert.equal(runPsql("SELECT count(*) FROM operation_logs WHERE id='LOG-CAS-TWO';",{capture:true}).trim(),'0');

  const colourBlocker=await attachmentPool.connect();
  let colourPending;
  try {
    await colourBlocker.query("BEGIN");
    const blockerPid=(await colourBlocker.query("SELECT pg_backend_pid() AS pid")).rows[0].pid;
    await colourBlocker.query("LOCK TABLE color_aliases IN SHARE ROW EXCLUSIVE MODE");
    await colourBlocker.query("UPDATE color_aliases SET enabled=true,updated_at='2026-09-06T03:00:00Z' WHERE id='CA-CAS-TEST'");
    const concurrentColourRepository=createPostgresMasterDataImportTransactionRepository({postgresClient:createPostgresPoolClient({pool:attachmentPool})});
    let earlyColourError;
    colourPending=concurrentColourRepository.applyImportExecution({...colourInput,operationLog:{...colourInput.operationLog,id:'LOG-CAS-BLOCKED'}}).then(value=>({value}),error=>{earlyColourError=error;return {error};});
    let observed=false;
    for(let attempt=0;attempt<50;attempt++) {
      const waiting=await attachmentPool.query("SELECT pid FROM pg_stat_activity WHERE $1::integer = ANY(pg_blocking_pids(pid))",[blockerPid]);
      if(waiting.rows.length){observed=true;break;}
      await new Promise(resolve=>setTimeout(resolve,100));
    }
    assert.equal(observed,true,earlyColourError?.message || 'A separate colour writer connection must actually wait for the first transaction');
    await colourBlocker.query("COMMIT");
    const outcome=await colourPending;
    assert.match(outcome.error?.message ?? '',/supplier_colour_snapshot_conflict/);
    const retained=await attachmentPool.query("SELECT enabled FROM color_aliases WHERE id='CA-CAS-TEST'");
    assert.equal(retained.rows[0].enabled,true);
    const rejectedAudit=await attachmentPool.query("SELECT count(*)::integer AS count FROM operation_logs WHERE id='LOG-CAS-BLOCKED'");
    assert.equal(rejectedAudit.rows[0].count,0);
  } finally {
    await colourBlocker.query("ROLLBACK");
    colourBlocker.release();
    if(colourPending) await colourPending;
  }

  const {createRawMaterialSupplierColorMappingService}=await import('../server/services/rawMaterialSupplierColorMappingService.mjs');
  const {createWorkspaceRecordService}=await import('../server/services/workspaceRecordService.mjs');
  const colourService=createRawMaterialSupplierColorMappingService(createWorkspaceRecordService());
  const colourServiceWorkspace={...(await coreWorkspaceReadRepository.loadState()),masterDataImportTransactionRepository:createPostgresMasterDataImportTransactionRepository({postgresClient:createPostgresPoolClient({pool:attachmentPool})})};
  for(const enabled of [false,true]) {
    const current=colourService.listMappings(colourServiceWorkspace).find(row=>row.id==='CA-CAS-TEST');
    assert.ok(current);
    const saved=await colourService.saveMapping({workspace:colourServiceWorkspace,operatorId:'U-MANAGER-A',body:{supplierName:'SUP-CAS',supplierSourceId:'SUP-CAS',supplierColor:'184',factoryColor:'CAS test',mappingId:current.id,expectedMapping:current,enabled,reason:'Repeated save after database read'}});
    assert.equal(saved.statusCode,200,JSON.stringify(saved));
  }

  await attachmentPool.query("UPDATE color_aliases SET updated_at='2026-09-06T04:00:00.123456Z' WHERE id='CA-CAS-TEST'");
  const coldColourReader=createPostgresCoreWorkspaceReadRepository({postgresClient:createPostgresPoolClient({pool:attachmentPool})});
  const coldColourWorkspace={...(await coldColourReader.loadState()),masterDataImportTransactionRepository:createPostgresMasterDataImportTransactionRepository({postgresClient:createPostgresPoolClient({pool:attachmentPool})})};
  const coldColourService=createRawMaterialSupplierColorMappingService(createWorkspaceRecordService());
  const coldMapping=coldColourService.listMappings(coldColourWorkspace).find(row=>row.id==='CA-CAS-TEST');
  assert.match(coldMapping.updatedAt,/\.123456/,'Cold hydration must preserve PostgreSQL microseconds');
  const coldSave=await coldColourService.saveMapping({workspace:coldColourWorkspace,operatorId:'U-MANAGER-A',body:{supplierName:'SUP-CAS',supplierSourceId:'SUP-CAS',supplierColor:'184',factoryColor:'CAS test',mappingId:coldMapping.id,expectedMapping:coldMapping,enabled:false,reason:'Cold microsecond snapshot save'}});
  assert.equal(coldSave.statusCode,200,JSON.stringify(coldSave));
  const rereadColour=(await coldColourReader.loadState()).colorAliases.find(row=>row.id==='CA-CAS-TEST');
  assert.equal(coldSave.response.mapping.updatedAt,rereadColour.updatedAt);
  assert.equal(rereadColour.enabled,false);


 console.log('PASS supplier color PostgreSQL: pooled import, post-lock stale edit rollback, returned persisted precision, cold microsecond round trip.');
}finally{await attachmentPool.end();await stopLivePostgres(runtime);}
