import test from 'node:test';
import assert from 'node:assert/strict';
import { readCompleteCollection, createReadGenerationGuard } from '../src/read-complete-collection.js';

test('desktop search receives records after the first 200, including a short last page', async () => {
  const source = Array.from({length: 451}, (_, index) => ({id: `row-${index}`, name: index === 450 ? '最后一条特殊订单' : '订单'}));
  const pages = [];
  const result = await readCompleteCollection(async ({page, pageSize}) => {
    pages.push(page);
    return {source: 'api', page, pageSize, total: source.length, items: source.slice((page-1)*pageSize, page*pageSize)};
  });
  assert.deepEqual(pages, [1,2,3]);
  assert.equal(result.items.length,451);
  assert.equal(result.items.filter(row=>row.name.includes('特殊')).length,1);
  assert.equal(result.complete,true);
});

test('server page-size cap is respected without dropping records', async () => {
  const result = await readCompleteCollection(async ({page}) => ({source:'api',page,pageSize:2,total:5,
    items: Array.from({length: Math.min(2, 5-(page-1)*2)}, (_,index)=>({id:(page-1)*2+index}))}));
  assert.deepEqual(result.items.map(row=>row.id),[0,1,2,3,4]);
});

for (const problem of ['failed-page','repeated-page','changed-total','early-end','over-limit']) {
  test(`${problem} cannot masquerade as a complete empty or partial list`, async () => {
    const result = await readCompleteCollection(async ({page,pageSize}) => {
      if(page===2 && problem==='failed-page') return {source:'api_error',error:{message:'network'}};
      const total=page===2&&problem==='changed-total'?5:4;
      const items=page===2&&problem==='early-end'?[]:[{id:problem==='repeated-page'?1:page}];
      return {source:'api',page,pageSize,total,items};
    }, {pageSize:1,maxPages:problem==='over-limit'?2:5});
    assert.equal(result.source,'api_error'); assert.equal(result.blocked,true); assert.deepEqual(result.items,[]);
  });
}

test('a newer refresh or mutation supersedes older reads per collection', () => {
  const guard=createReadGenerationGuard();
  const first=guard.begin('inbounds'); const other=guard.begin('orders');
  const second=guard.begin('inbounds');
  assert.equal(guard.current('inbounds',first),false);
  assert.equal(guard.current('inbounds',second),true);
  assert.equal(guard.current('orders',other),true);
});

const inventoryClient = await import('../../../../src/services/officeInventoryApiClient.js');
for (const [method, input] of [
  ['createOfficeInventoryCorrectionDraft', {stock:{id:'INV-TEST',inStock:10},actualQty:9,reason:'盘点差异'}],
  ['linkOfficeInventoryCorrectionAttachments', {correctionDraftId:'CORR-TEST',attachmentIds:['ATT-TEST']}],
  ['confirmOfficeInventoryCorrectionDraft', {correctionDraftId:'CORR-TEST',approvalReason:'实盘与凭证已核对'}],
]) {
  test(`${method} retains one request identity across an uncertain retry`, async () => {
    const sent=[];
    const options={serverRequired:true,apiBaseUrl:'http://review-test.invalid/api',fetchImpl:async(url,init)=>{
      sent.push({key:init.headers['idempotency-key'],body:init.body});
      if(sent.length===1)throw new Error('response lost');
      return new Response(JSON.stringify({correctionDraftId:'CORR-TEST'}),{status:200});
    }};
    const frozen={...input,idempotencyKey:'review-frozen-key',authState:{session:{accessToken:'local-test'}}};
    await inventoryClient[method](frozen,options);await inventoryClient[method](frozen,options);
    assert.equal(sent.length,2);assert.equal(sent[0].key,'review-frozen-key');assert.deepEqual(sent[1],sent[0]);
  });
}
