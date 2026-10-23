import assert from 'node:assert/strict';
import {loadSeedWorkspace} from '../../server/seedData.mjs';
import {postJson,getJson} from './apiIntegrationTestHarness.mjs';

// Synthetic upstream task only. Packages are created by the actual packing HTTP command.
// This fixture does not claim production-reporting or physical-packing acceptance.
export function createPrintPackingTestFixture() {
  const seed=loadSeedWorkspace({source:'synthetic'});
  const fulfillment=seed.fulfillments.find(row=>row.id==='F003');
  assert.ok(fulfillment,'Printing fixture requires the synthetic F003 fulfillment');
  const orderLine=seed.orderLines.find(row=>row.id===(fulfillment.orderLineId ?? fulfillment.lineId));
  assert.ok(orderLine);
  const quantity=Number(fulfillment.qty ?? orderLine.qty);
  assert.ok(Number.isSafeInteger(quantity)&&quantity>0);
  const packingTaskId=`PKT-PRINT-CHECK-${fulfillment.id}`;
  return {
    repository:{kind:'local_memory',loadState(){return {
      orderLines:seed.orderLines.map(row=>row.id===orderLine.id?{...row,status:'待打包',lineStatus:'待打包'}:row),
      packingTasks:[{id:packingTaskId,packingTaskId,orderLineId:orderLine.id,plannedQty:quantity,actualPackedQty:0,status:'待打包',createdBy:'U-OFFICE-A'}],
    };}},
    async assertLabels(baseUrl,printed,printRecordId='') {
      const detail=await getJson(baseUrl,`/api/fulfillments/${fulfillment.id}`);
      assert.equal(detail.labelsPrinted,printed,'Only completed current print evidence may confirm fulfillment labels');
      if(printed) assert.equal(detail.labelPrintRecordId,printRecordId,'Fulfillment must link the exact completed print record');
    },
    async complete(baseUrl,fulfillmentId){
      assert.equal(fulfillmentId,fulfillment.id,'Packing and printing must target the same fulfillment');
      const result=await postJson(baseUrl,`/api/packing-tasks/${packingTaskId}/complete`,{
        orderLineId:orderLine.id,actualPackedQty:quantity,packageCount:2,
        packages:[{packedQty:Math.ceil(quantity/2)},{packedQty:Math.floor(quantity/2)}],
        remark:'隔离打印回归：经正式打包接口建立当前包裹',
      },{headers:{'x-erp-user-id':'U-WAREHOUSE-A'}});
      assert.equal(result.fulfillmentId,fulfillment.id);
      assert.equal(result.actualPackedQty,quantity);
      assert.equal(result.packageIds.length,2);
      assert.equal(result.orderLineStatus,'待打印标签');
      const detail=await getJson(baseUrl,`/api/fulfillments/${fulfillmentId}`);
      assert.equal(detail.labelsPrinted,false,'Packing must not fabricate printed labels');
      return result;
    },
  };
}
