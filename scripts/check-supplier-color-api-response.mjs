import assert from 'node:assert/strict';
import { listOfficeRawMaterialSupplierColorMappings as list, saveOfficeRawMaterialSupplierColorMapping as save } from '../src/features/raw-materials/rawMaterialSupplierColorMappingApiClient.js';
const options = payload => ({ fetchImpl: async () => new Response(typeof payload === 'string' ? payload : JSON.stringify(payload), {status:200,headers:{'content-type':'application/json'}}) });
for (const payload of ['not json',null,{}, {items:[]}]) {
  assert.equal((await list({},options(payload))).blocked,true);
}
assert.equal((await list({},options({items:[],options:{suppliers:[],factoryColors:[]}}))).source,'api');
for (const payload of ['not json',null,{}, {mapping:{id:'A',enabled:true}}, {mapping:{id:'A'},operationLogId:'LOG'}]) {
  const result=await save({},options(payload));
  assert.equal(result.blocked,true);
  assert.equal(result.error.code,'RAW_MATERIAL_SUPPLIER_COLOR_SAVE_UNCONFIRMED');
}
const input={supplierName:'A 厂',supplierColor:'颜色：184',factoryColor:' 本白 ',enabled:false,mappingId:'A'};
const mapping={id:'A',supplierSourceId:'A厂',supplierColor:'184',factoryColor:'本白',enabled:false};
for (const changed of [{id:'B'},{supplierSourceId:'OTHER'},{supplierColor:'185'},{factoryColor:'黑色'},{enabled:true}]) {
 const rejected=await save(input,options({mapping:{...mapping,...changed},operationLogId:'LOG'}));
 assert.equal(rejected.blocked,true);assert.equal(rejected.error.code,'RAW_MATERIAL_SUPPLIER_COLOR_SAVE_UNCONFIRMED');
}
const saved=await save(input,options({mapping,operationLogId:'LOG'}));
assert.equal(saved.source,'api');assert.deepEqual(saved.mapping,mapping);
console.log('PASS supplier colour client rejects malformed successful responses and preserves verified disabled save results.');
