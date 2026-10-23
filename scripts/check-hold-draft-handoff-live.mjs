import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {recognizeOfficeDraft,saveOfficeDraft,getOfficeDraft,confirmOfficeDraftViaApi} from '../src/services/officeOrderApiClient.js';
const previous=process.env.ERP_LOCAL_STORAGE_DIR;
const directory=await mkdtemp(join(tmpdir(),'erp-hold-draft-'));process.env.ERP_LOCAL_STORAGE_DIR=directory;
const {createApiServer}=await import('../server/apiServer.mjs');
const {withLocalRepositoryFixture}=await import('./helpers/localRepositoryFixture.mjs');
const server=createApiServer(withLocalRepositoryFixture({runtimeMode:'test',allowLocalFixture:true,applyProductionEnvFile:false,authSecret:'isolated-hold-draft-secret'}));
try {
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const base=`http://127.0.0.1:${server.address().port}`;
 const options={apiBaseUrl:base+'/api',fetchImpl:(url,init)=>fetch(url,{...init,headers:{...init.headers,'x-erp-user-id':'U-MANAGER-A'}})};
 async function request(path,body){const response=await fetch(base+'/api'+path,{method:body?'POST':'GET',headers:{'content-type':'application/json','x-erp-user-id':'U-MANAGER-A'},body:body?JSON.stringify(body):undefined});const value=await response.json();assert.equal(response.status,200,JSON.stringify(value));return value;}
 const inventoryId='30*38*10-红色-普通提-空白袋-A区-30*38';
 const before=(await request('/inventory/items?pageSize=50')).items.find(row=>row.id===inventoryId);
 const reserved=row=>row.reserved ?? row.reservedQty ?? row.quantities?.reserved;
 assert.ok(Number.isSafeInteger(reserved(before)));
 const source=await request('/order-drafts/recognize',{customerId:'C002',sourceMessages:[{id:'HOLD-HANDOFF-MESSAGE',conversationId:'HOLD-HANDOFF-GROUP',customerId:'C002',sender:'测试客户',senderRole:'customer',sentAt:'2099-07-12 10:00',text:'30*38红色有的话给我留5个'}]});
 const intent=source.inventoryIntents[0];assert.ok(intent);
 const held=await request(`/inventory/intents/${intent.intentId}/hold`,{expectedRevision:intent.revision,inventoryItemId:inventoryId,candidateIndex:0,qty:5,expiresAt:'2099-07-13T19:30:00+08:00',reason:'隔离测试',idempotencyKey:'hold-handoff-create'});
 const sourceText='我要空白袋30*38*10红色普通提5个明天自提';
 for(const source of [{sourceHoldId:held.hold.reservationId},{sourceHoldId:held.hold.reservationId,sourceIntentId:'WRONG'}]) {
  const rejected=await recognizeOfficeDraft({customerId:'C002',sourceText,...source,operatorId:'U-MANAGER-A'},options);
  assert.equal(rejected.blocked,true);assert.deepEqual(rejected.rows,[]);
 }
 const recognized=await recognizeOfficeDraft({idempotencyKey:'hold-initial-recognition-retry',customerId:'C002',sourceText,sourceHoldId:held.hold.reservationId,sourceIntentId:intent.intentId,operatorId:'U-MANAGER-A'},options);
 assert.equal(recognized.source,'api');assert.equal(recognized.rows.length,1);assert.equal(recognized.rows[0].customerId,'C002');
 // Cold read before any later save: the first persisted draft must own its source.
 const firstPersisted=await getOfficeDraft({draftId:recognized.draft.draftId,operatorId:'U-MANAGER-A'},options);
 assert.equal(firstPersisted.source,'api');
 assert.equal(firstPersisted.item.rows.length,1);
 assert.equal(firstPersisted.item.rows[0].sourceHoldId,held.hold.reservationId);
 assert.equal(firstPersisted.item.rows[0].sourceIntentId,intent.intentId);
 const rows=recognized.rows.map(row=>({...row,sourceHoldId:held.hold.reservationId,sourceIntentId:intent.intentId}));
 const saved=await saveOfficeDraft({draftId:recognized.draft.draftId,clientRevision:recognized.draft.clientRevision,draftRows:rows,sourceText,operatorId:'U-MANAGER-A'},options);
 assert.equal(saved.source,'api',JSON.stringify(saved));assert.equal(saved.blocked,undefined);
 const reread=await getOfficeDraft({draftId:saved.draftId,operatorId:'U-MANAGER-A'},options);
 assert.equal(reread.source,'api');assert.ok(reread.item);
 const loaded=reread.item.rows;
 assert.equal(loaded.length,1,JSON.stringify(reread.item));
 assert.equal(loaded[0].sourceHoldId,held.hold.reservationId);assert.equal(loaded[0].sourceIntentId,intent.intentId);assert.equal(loaded[0].customerId,'C002');assert.equal(loaded[0].qty,5);
 const confirmed=await confirmOfficeDraftViaApi({draftId:saved.draftId,clientRevision:reread.item.draft.clientRevision,draftRows:loaded,sourceText,operatorId:'U-MANAGER-A'},options);
 assert.equal(confirmed.source,'api',JSON.stringify(confirmed));assert.equal(confirmed.blocked,undefined,JSON.stringify(confirmed));
 const after=(await request('/inventory/items?pageSize=50')).items.find(row=>row.id===inventoryId);
 assert.equal(reserved(after),reserved(before)+5,'Confirm must convert the hold without reserving the same quantity twice');
 const finalIntent=(await request('/inventory/intents')).items.find(row=>(row.intentId||row.id)===intent.intentId);
 assert.equal(finalIntent.intentStatus,'已转订单');
 assert.ok(confirmed.confirmation.reservations.some(row=>row.reservationId===held.hold.reservationId),'Confirmation must reuse the original reservation identity');
 const replay=await recognizeOfficeDraft({idempotencyKey:'hold-initial-recognition-retry',customerId:'C002',sourceText,sourceHoldId:held.hold.reservationId,sourceIntentId:intent.intentId,operatorId:'U-MANAGER-A'},options);
 assert.equal(replay.source,'api',JSON.stringify(replay));
 assert.equal(replay.draft.draftId,recognized.draft.draftId);assert.equal(replay.draft.clientRevision,recognized.draft.clientRevision);
 assert.equal(replay.operationLogId,recognized.operationLogId);
 const current=await getOfficeDraft({draftId:recognized.draft.draftId,operatorId:'U-MANAGER-A'},options);
 assert.ok(current.item.draft.clientRevision>replay.draft.clientRevision,'historical receipt must not overwrite later draft state');
 const changed=await recognizeOfficeDraft({idempotencyKey:'hold-initial-recognition-retry',customerId:'C002',sourceText:sourceText+' changed',sourceHoldId:held.hold.reservationId,sourceIntentId:intent.intentId,operatorId:'U-MANAGER-A'},options);
 assert.equal(changed.error.code,'IDEMPOTENCY_KEY_REUSED');
 console.log('PASS real local HTTP + order API client: C002 recognition, hold-link save/read, confirmation and unchanged occupied quantity. Test identity, local memory; not canonical conversion UI, PostgreSQL or published customer-price acceptance.');
}finally{await new Promise(resolve=>server.close(resolve));await rm(directory,{recursive:true,force:true});if(previous===undefined)delete process.env.ERP_LOCAL_STORAGE_DIR;else process.env.ERP_LOCAL_STORAGE_DIR=previous;}
