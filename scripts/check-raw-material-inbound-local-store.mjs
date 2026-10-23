import { createRawMaterialInboundOrchestrator } from "../server/services/rawMaterialInboundOrchestrator.mjs";
import {updateOfficeRawMaterialInboundAction} from "../src/services/officeRawMaterialApiClient.js";
import {readHttpIdempotencyKey} from "../server/idempotency.mjs";
import {createLocalRawMaterialInboundRepository} from "../server/rawMaterialInboundRepository.mjs";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, rmSync, writeFileSync, readdirSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createRawMaterialInboundLocalStore,
  rawMaterialInboundStoreKey,
} from "../server/rawMaterialInboundLocalStore.mjs";

const storageRoot = mkdtempSync(join(tmpdir(), "erp-raw-material-inbound-store-"));
try {
  const store = createRawMaterialInboundLocalStore({ storageRoot });
  const seed = [{ id: "RMI-LOCAL-001", supplierName: "供应商A", rolls: [{ id: "ROLL-001", weightKg: 10 }] }];
  const loadedSeed = store.load({ seedInbounds: seed });
  const filePath = join(storageRoot, rawMaterialInboundStoreKey);
  assert.equal(loadedSeed.rawMaterialInbounds[0].id, "RMI-LOCAL-001");
  assert.equal(existsSync(filePath), true, "first local load should persist the seeded state");

  store.save([{ id: "RMI-LOCAL-002", supplierName: "供应商B", rolls: [{ id: "ROLL-002", weightKg: 12 }] }]);
  assert.equal(store.load().rawMaterialInbounds[0].id, "RMI-LOCAL-002");
  assert.match(await readFile(filePath, "utf8"), /"updatedAt"/);

  writeFileSync(filePath, "{not-json", "utf8");
  assert.throws(()=>store.load({seedInbounds:seed}),e=>e.code==='RAW_MATERIAL_LOCAL_STORE_INVALID');
  assert.equal(await readFile(filePath,'utf8'),'{not-json','Corrupt evidence must not be replaced with seed data');
  for(const bad of [{}, {rawMaterialInbounds:[{}]}, {rawMaterialInbounds:[{id:'A'},{id:' A '}]}, {rawMaterialInbounds:[],rawMaterialInboundActionReceipts:{}}]) {
    const original=JSON.stringify(bad);writeFileSync(filePath,original,'utf8');
    assert.throws(()=>store.load({seedInbounds:seed}),e=>e.code==='RAW_MATERIAL_LOCAL_STORE_INVALID');
    assert.equal(await readFile(filePath,'utf8'),original);
  }
  const repositoryRoot=join(storageRoot,'repository');
  const initial={id:'RETRY-1',revision:1,unit:'kg',materialType:'无纺布',rolls:[{id:'ROLL-RETRY',weightKg:20,inventoryStatus:'可用',labelStatus:'已贴标/可用库存'}]};
  const repo=createLocalRawMaterialInboundRepository({storageRoot:repositoryRoot});
  const workspace=repo.loadState({seedInbounds:[initial]});
  const firstInput={workspace,inboundId:'RETRY-1',action:'issue_to_machine',body:{expectedRevision:1,rollId:'ROLL-RETRY',machineId:'BAG-01'},idempotencyKey:'local-retry-0001',operatorId:'U-WAREHOUSE-A',operatorName:'库房',serverNow:'2026-09-06T01:00:00.000Z'};
  const first=createRawMaterialInboundOrchestrator(repo).applyAction(firstInput);
  createRawMaterialInboundOrchestrator(repo).applyAction({...firstInput,action:'confirm_consumption',body:{expectedRevision:2,rollId:'ROLL-RETRY',consumedWeightKg:5},idempotencyKey:'local-retry-0002'});
  const restarted=createLocalRawMaterialInboundRepository({storageRoot:repositoryRoot});const cold=restarted.loadState();
  const replay=createRawMaterialInboundOrchestrator(restarted).applyAction({...firstInput,workspace:cold});
  assert.equal(replay.replayed,true);assert.equal(replay.inbound.revision,2);assert.equal(replay.operationLogId,first.operationLog.id);
  assert.equal(cold.rawMaterialInbounds[0].revision,3);assert.equal(cold.rawMaterialInbounds[0].rolls[0].weightKg,15);
  assert.equal(cold.rawMaterialInbounds[0].rawMaterialIssueRecords.length,1);assert.equal(cold.rawMaterialInboundActionReceipts.length,2);
  assert.equal(readdirSync(join(repositoryRoot,'metadata')).some(name=>name.endsWith('.tmp')),false,'Atomic save leaves no temporary files');
  assert.throws(()=>createRawMaterialInboundOrchestrator(restarted).applyAction({...firstInput,workspace:cold,body:{...firstInput.body,machineId:'OTHER'}}),e=>e.code==='IDEMPOTENCY_KEY_REUSED');
  const before=structuredClone(cold);const failing=createLocalRawMaterialInboundRepository({store:{save(){throw new Error('disk full');}}});
  assert.throws(()=>createRawMaterialInboundOrchestrator(failing).applyAction({...firstInput,workspace:cold,action:'confirm_consumption',body:{expectedRevision:3,rollId:'ROLL-RETRY',consumedWeightKg:5},idempotencyKey:'local-retry-0003'}),/disk full/);
  assert.deepEqual(cold,before,'Disk failure must not advance in-memory business or idempotency state');
  assert.throws(()=>failing.createRawMaterialInboundDraft({workspace:cold,inbound:{id:'FAILED-DRAFT'}}),/disk full/);assert.deepEqual(cold,before);
  // Real browser client serialization + HTTP boundary key parsing + durable
  // repository. Transport is synthetic so no external business data is written.
  let transportRepo=restarted, transportWorkspace=cold, loseResponse=true;
  const sent=[];
  const clientInput={inboundId:'RETRY-1',action:'确认消耗',expectedRevision:3,rollId:'ROLL-RETRY',consumedWeightKg:4,operatorId:'U-WAREHOUSE-A',operatorName:'库房',idempotencyKey:'erp-raw-client-cold-retry'};
  const clientOptions={fetchImpl:async (url,init)=>{
    sent.push(init);
    const body=JSON.parse(init.body);
    body.idempotencyKey=readHttpIdempotencyKey({headers:init.headers},body);
    try {
      const result=createRawMaterialInboundOrchestrator(transportRepo).applyAction({workspace:transportWorkspace,inboundId:clientInput.inboundId,action:'confirm_consumption',body,idempotencyKey:body.idempotencyKey,operatorId:clientInput.operatorId,operatorName:clientInput.operatorName,serverNow:'2026-09-06T02:00:00.000Z'});
      if(loseResponse){loseResponse=false;throw new Error('response lost after durable save');}
      return Response.json({inbound:result.inbound,operationLogId:result.operationLogId||result.operationLog?.id});
    } catch(error) {
      if(!error.statusCode)throw error;
      return Response.json({code:error.code,message:error.message},{status:error.statusCode});
    }
  }};
  assert.equal((await updateOfficeRawMaterialInboundAction(clientInput,clientOptions)).blocked,true);
  transportRepo=createLocalRawMaterialInboundRepository({storageRoot:repositoryRoot});transportWorkspace=transportRepo.loadState();
  const retried=await updateOfficeRawMaterialInboundAction({...clientInput},clientOptions);
  assert.equal(retried.source,'api');assert.equal(retried.inbound.revision,4);assert.ok(retried.operationLogId);
  assert.equal(transportWorkspace.rawMaterialInbounds[0].rolls[0].weightKg,11);
  assert.equal(transportWorkspace.rawMaterialInbounds[0].rawMaterialConsumptionRecords.length,2);
  assert.equal(sent[0].headers['idempotency-key'],sent[1].headers['idempotency-key']);assert.equal(sent[0].body,sent[1].body);
  const changed=await updateOfficeRawMaterialInboundAction({...clientInput,consumedWeightKg:3},clientOptions);
  assert.equal(changed.error.code,'IDEMPOTENCY_KEY_REUSED');assert.equal(changed.error.status,409);
  assert.equal(transportWorkspace.rawMaterialInbounds[0].rolls[0].weightKg,11);
  console.log('PASS local cold replay: exact old receipt, latest state unchanged, changed payload rejected, failed writes leave memory and receipt state unchanged.');
} finally {
  rmSync(storageRoot, { recursive: true, force: true });
}

console.log("Raw-material inbound local store checks passed: seed persistence, normalized reload, and corrupt-state rejection are isolated.");
