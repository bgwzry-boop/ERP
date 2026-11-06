import assert from 'node:assert/strict';
import { completeOfficePackingTask } from '../src/services/officeProductionPackingApiClient.js';
import { build } from 'esbuild';
import { createRequire } from 'node:module';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createFulfillmentReadProjectionService } from '../server/services/fulfillmentReadProjectionService.mjs';
import { toMasterDataEmployeeAccountReview } from '../server/services/masterDataEmployeeAccountCommandService.mjs';
import { mapApiFulfillmentToLocal } from '../src/services/officeFulfillmentSelectors.js';
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
const html=render();assert.match(html,/按实物登记包裹/);assert.match(html,/通货可混装/);assert.match(html,/同一订单可混装尺寸和颜色/);assert.doesNotMatch(html,/混装登记暂未接入/);assert.match(html,/正在读取可派单司机/);assert.doesNotMatch(html,/仅档案司机/);
assert.match(html,/登记 \/ 更正实物包裹/,"stock mixing stays reachable from the summary action");
assert.match(html,/<div hidden="">/,"the package workbench stays out of the default view");
const customHtml=render({...fulfillment,id:'F-CUSTOM',lineId:'OL-CUSTOM'},{...formal,data:{...formal.data,orderLines:[{id:'OL-CUSTOM',orderType:'定制印刷'}],packingTasks:[{id:'PKT-CUSTOM',orderLineId:'OL-CUSTOM',status:'待打包'}]}});
assert.match(customHtml,/定制单一般不混装/);assert.doesNotMatch(customHtml,/混装登记暂未接入|按实物登记包裹|同一订单可混装/,"the mixed workbench stays closed until the office opens 客户同意混装");
assert.match(customHtml,/客户同意混装（同订单几项装一包）/,"owner 2026-10-29: custom mixing is reachable once the customer agrees");
assert.match(customHtml,/登记本明细包裹/,"custom packing stays available from the summary action");
assert.match(customHtml,/<div hidden="">/,"custom per-package entry stays collapsed until opened");
assert.match(customHtml, /<legend>登记实际包裹<\/legend>/, "forbidding custom mixing must not hide the independent packing form");
assert.match(customHtml, /逐包数量（每行一包，可修改）/);
assert.match(customHtml, /核对并登记包裹/);
assert.doesNotMatch(render({...fulfillment,finalDeliveryAt:'2026-10-23T00:00:00Z'}),/<button/);
assert.doesNotMatch(render(fulfillment,{...formal,permissionContext:{actionPermissions:[]}}),/<button/);
console.log('Desktop fulfillment checks passed: stock mixed-package entry, custom mixing refused but independent packing form retained, driver role projection, permission and terminal gates.');

const { projectFulfillment } = createFulfillmentReadProjectionService();
const handoffContext = { ...formal, permissionContext: { actionPermissions: ['fulfillment.paper.handoff'] } };
const handoffCases = [
  { printStatus: 'printed', expectedStatus: '已打印待交库房', canHandoff: true },
  { printStatus: 'reprinted', expectedStatus: '已打印待交库房', canHandoff: true },
  { printStatus: 'submitted', expectedStatus: '待打印确认', canHandoff: false },
  { printStatus: 'failed', expectedStatus: '待打印确认', canHandoff: false },
  { printStatus: 'voided', expectedStatus: '待打印确认', canHandoff: false },
  { printStatus: 'printed', documentStatus: '已作废', expectedStatus: '已作废待重打', canHandoff: false },
  { printStatus: 'printed', documentStatus: '已交库房', expectedStatus: '已交库房', canHandoff: false },
  { printStatus: 'printed', legacyStateReviewRequired: true, expectedStatus: '已打印待交库房', canHandoff: false },
];
for (const { printStatus, documentStatus = '待打印确认', legacyStateReviewRequired = false, expectedStatus, canHandoff } of handoffCases) {
  const paper = {
    paperOutboundDocumentId: 'POD-DESKTOP',
    fulfillmentId: fulfillment.id,
    printRecordId: 'PR-DESKTOP',
    documentVersion: 1,
    revision: 1,
    status: documentStatus,
  };
  const workspace = {
    paperOutboundDocuments: [paper],
    printRecords: [{ printRecordId: paper.printRecordId, targetId: fulfillment.id, status: printStatus }],
  };
  const projected = projectFulfillment({ workspace, fulfillment: { ...fulfillment, legacyStateReviewRequired } });
  assert.equal(projected.paperOutboundDocument.status, expectedStatus);
  const local = mapApiFulfillmentToLocal(projected);
  assert.equal(/确认纸单已交库房/.test(render(local, handoffContext)), canHandoff, `${printStatus} / ${documentStatus} / legacy=${legacyStateReviewRequired}`);
  assert.doesNotMatch(render(local), /确认纸单已交库房/, 'only authorized staff can confirm paper handoff');
}
console.log('Paper handoff checks passed: server-confirmed print/reprint opens handoff, and invalid or already handed paper stays blocked.');

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
