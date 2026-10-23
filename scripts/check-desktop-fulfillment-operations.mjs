import assert from 'node:assert/strict';
import { completeOfficePackingTask } from '../src/services/officeProductionPackingApiClient.js';
import { build } from 'esbuild';
import { createRequire } from 'node:module';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { toMasterDataEmployeeAccountReview } from '../server/services/masterDataEmployeeAccountCommandService.mjs';
const result = await build({entryPoints:['docs/prototypes/raw-material-roll-inventory-review/src/DesktopFulfillmentOperations.jsx'],bundle:true,write:false,platform:'node',format:'cjs',jsx:'automatic',define:{'import.meta.env':'{}'},external:['react','react/jsx-runtime'],loader:{'.css':'empty'}});
const module={exports:{}};new Function('require','module','exports',result.outputFiles[0].text)(createRequire(import.meta.url),module,module.exports);
const {DesktopFulfillmentOperations,parseActualPackageQuantities}=module.exports;
assert.deepEqual(parseActualPackageQuantities('1000\n1000，500'),[1000,1000,500]);
for (const value of ['', '0', '-1', '1.5', 'Infinity']) assert.equal(parseActualPackageQuantities(value),null);
const driver=toMasterDataEmployeeAccountReview({id:'EMP-DRIVER',name:'实际司机',userId:'USER-DRIVER',roleName:'司机'},[{userId:'USER-DRIVER',roles:['driver'],enabled:true,loginEnabled:true}]);
const recommendedOnly=toMasterDataEmployeeAccountReview({id:'EMP-OTHER',name:'仅档案司机',userId:'USER-OTHER',roleName:'司机'},[{userId:'USER-OTHER',roles:['office'],enabled:true,loginEnabled:true}]);
assert.deepEqual(driver.accountRoleKeys,['driver']);assert.deepEqual(recommendedOnly.accountRoleKeys,['office']);
const fulfillment={id:'F-DESKTOP',lineId:'OL-DESKTOP',method:'送货',qty:5000,status:'待出库',revision:1};
const formal={data:{orderLines:[{id:'OL-DESKTOP',orderType:'现货通货'}],packingTasks:[],employeeAccountReviews:[driver,recommendedOnly]},permissionContext:{actionPermissions:['packing.complete','fulfillment.dispatch.update']},actions:{refreshAll:async()=>{}}};
const render=(f=fulfillment,ctx=formal)=>renderToStaticMarkup(createElement(DesktopFulfillmentOperations,{fulfillment:f,formal:ctx}));
const html=render();assert.match(html,/登记实际包裹/);assert.match(html,/混装登记暂未接入/);assert.match(html,/正在读取可派单司机/);assert.doesNotMatch(html,/仅档案司机/);
assert.doesNotMatch(render({...fulfillment,finalDeliveryAt:'2026-10-23T00:00:00Z'}),/<button/);
assert.doesNotMatch(render(fulfillment,{...formal,permissionContext:{actionPermissions:[]}}),/<button/);
console.log('Desktop fulfillment checks passed: actual quantities, authoritative driver role projection, dedicated candidate loading, permission and terminal gates, explicit mixed-package boundary.');

for (const body of [{operationLogId:'LOG-FAKE'},{operationLogId:'LOG-FAKE',packingTaskId:'PKT-TEST',orderLineId:'OL-TEST',packageIds:['PKG-A'],fulfillmentId:'F-FOREIGN'}]) {
 const response=await completeOfficePackingTask({packingTaskId:'PKT-TEST',orderLineId:'OL-TEST',fulfillmentId:'F-TEST',actualPackedQty:10,packageCount:1,idempotencyKey:'receipt-test'}, {serverRequired:true,fetchImpl:async()=>new Response(JSON.stringify(body),{status:200,headers:{'content-type':'application/json'}})});
 assert.equal(response.blocked,true);assert.equal(response.error.code,'PACKING_COMPLETION_RECEIPT_INCOMPLETE');assert.equal(response.packageIds,undefined);
}
const {hasCompleteFulfillmentReceipt}=module.exports;
const attempt={execute:()=>{},payload:{fulfillment:{id:'F-TEST'}}};
assert.equal(hasCompleteFulfillmentReceipt(attempt,{operationLogId:'LOG-1',fulfillmentId:'F-OTHER',status:'已完成'}),false);
assert.equal(hasCompleteFulfillmentReceipt(attempt,{fulfillmentId:'F-TEST',status:'已完成'}),false);
assert.equal(hasCompleteFulfillmentReceipt(attempt,{operationLogId:'LOG-1',fulfillmentId:'F-TEST',status:'已完成'}),true);
console.log('Receipt checks passed: missing package IDs, missing audit IDs, and wrong fulfillment receipts fail closed.');
