import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import {officePricingWorkspace,makeQuote,confirmQuote} from "./check-office-order-pricing.mjs";
import {createOrderPrintGroupCorrectionService} from "../server/services/orderPrintGroupCorrectionService.mjs";
import {createLocalOrderLineQuantityAdjustmentTransactionRepository} from "../server/orderLineQuantityAdjustmentTransactionRepository.mjs";
import {readPrintGroup,previewPrintGroupCorrection,buildPrintGroupCorrectionPlan} from "../server/orderPrintGroupCorrection.mjs";
import {createLocalOrderPoolReadRepository} from "../server/orderPoolReadRepository.mjs";
import {mapApiOrderLineToLocal} from "../src/services/officeOrderPoolApiClient.js";
export const groupCorrectionService=createOrderPrintGroupCorrectionService();
export const groupCorrectionPermissions=["order.quantity.adjust","order.void"];
export async function groupCorrectionFixture(){
  const w=officePricingWorkspace({print:true});
  w.orderDrafts[0].lines.push({...w.orderDrafts[0].lines[0],id:"D-PRICE-02",draftLineId:"D-PRICE-02",color:"白色"});
  const q=await makeQuote(w,{},"group-correction"),c=await confirmQuote(w,q.response.quote,{},"group-correction");assert.ok(c.response,JSON.stringify(c));
  Object.assign(w,{orderLineQuantityAdjustmentTransactionRepository:createLocalOrderLineQuantityAdjustmentTransactionRepository(),printJobs:[],paperOutboundDocuments:[],printRecords:[],statementLines:[],workshopReports:[],packingTasks:[],packages:[],productionScheduleRecords:[]});
  return w;
}
export function groupCorrectionInput(w,changes={},mode="amend"){
  const id=w.orderLines.find(row=>row.status!=="已关闭").id,view=readPrintGroup(w,id).view;
  return {workspace:w,orderLineId:id,operatorId:"U-PRICE",actionPermissions:groupCorrectionPermissions,body:{expectedGroupRevision:view.groupRevision,mode,reason:"客户明确取消部分数量，正式改单沿原约定价",members:view.members.map(row=>({orderLineId:row.orderLineId,expectedRevision:row.revision,newQty:row.qty,void:false,...changes[row.orderLineId]}))}};
}
export async function saveGroupCorrection(input,key="group-correction-command"){
  const p=await groupCorrectionService.previewCorrection(input);assert.ok(p.response,JSON.stringify(p));
  input.body={...input.body,previewHash:p.response.previewHash,idempotencyKey:key};
  const c=await groupCorrectionService.correctPrintGroup(input);assert.ok(c.response,JSON.stringify(c));return {preview:p.response,receipt:c.response,input};
}
export async function checkPrintGroupCorrection(){
  const w=await groupCorrectionFixture(),ids=w.orderLines.map(row=>row.id),original=structuredClone(w.priceSnapshots),input=groupCorrectionInput(w,{[ids[0]]:{newQty:2000}});
  const saved=await saveGroupCorrection(input);
  const list=createLocalOrderPoolReadRepository().listOrderLines({workspace:w});
  for(const item of list.items){assert.deepEqual(Object.keys(item.printingPriceGroup).sort(),["groupId","memberCount"]);assert.equal(item.printingPriceGroup.memberCount,2);assert.deepEqual(mapApiOrderLineToLocal(item).printingPriceGroup,item.printingPriceGroup);assert.equal(item.sourceEvidence,undefined);}
  assert.equal(saved.preview.totals.finalAmount,6720);assert.equal(saved.preview.members[0].printPrice,.06,"Reduction preserves agreed tier rather than raising it to .08");
  assert.deepEqual(w.priceSnapshots.slice(0,2),original);assert.equal(w.priceSnapshots.length,4);assert.ok(w.orderLines.every(row=>row.revision===2));assert.equal(w.productionTasks[0].plannedQty,2000);
  assert.deepEqual((await groupCorrectionService.correctPrintGroup(saved.input)).response,saved.receipt);assert.equal(w.priceSnapshots.length,4);
  assert.equal((await groupCorrectionService.correctPrintGroup({...saved.input,body:{...saved.input.body,reason:"不同请求"}})).code,"IDEMPOTENCY_KEY_REUSED");
  assert.equal((await groupCorrectionService.previewCorrection(input)).code,"PRINT_GROUP_REVISION_CONFLICT");
  const voided=await saveGroupCorrection(groupCorrectionInput(w,{[ids[0]]:{void:true}}),"group-member-void");
  assert.equal(voided.receipt.members[0].newQty,0);assert.equal(w.orderLines[0].qty,2000,"Original physical quantity remains historical");assert.equal(w.orderLines[0].status,"已关闭");
  assert.equal(readPrintGroup(w,ids[1]).view.members.length,1);assert.equal(w.priceSnapshots.at(-1).sourceEvidence.officePricingGroup.memberCount,1);
  const all=groupCorrectionInput(w,{[ids[1]]:{void:true}},"void_all"),allSaved=await saveGroupCorrection(all,"group-all-void");
  assert.ok(w.orderLines.every(row=>row.status==="已关闭"));assert.equal(allSaved.receipt.totals.finalAmount,0);assert.deepEqual((await groupCorrectionService.correctPrintGroup(allSaved.input)).response,allSaved.receipt);
  for(const [expected,mutate] of [
    ["PRINT_GROUP_INCOMPLETE",(x,b)=>b.members.pop()],
    ["PRINT_GROUP_REVISION_CONFLICT",(x,b)=>b.members[1].expectedRevision++],
    ["ACTION_FORBIDDEN",(x,b,i)=>i.actionPermissions=[]],
    ["PRINT_GROUP_VALIDATION_INVALID",(x,b)=>b.members[0].newQty=6000],
    ["ORDER_LINE_SPLIT_ALLOCATION_REQUIRED",(x)=>{x.fulfillments[0].qty=2500;x.fulfillments.push({...x.fulfillments[0],id:"SECOND-PENDING-BATCH"});}],
    ["ERP_ORDER_PRODUCTION_ALREADY_EXECUTED",(x)=>x.productionTasks[1].taskStatus="丝印中"],
    ["ERP_ORDER_PRODUCTION_ALREADY_EXECUTED",(x)=>x.rawMaterialInbounds=[{rawMaterialConsumptionRecords:[{consumedWeightKg:5,productionTaskId:x.productionTasks[1].id}]}]],
    ["ERP_ORDER_DOCUMENTS_ACTIVE_CONFLICT",(x)=>x.paperOutboundDocuments=[{fulfillmentId:x.fulfillments[0].id,status:"已交库"}]],
    ["ERP_ORDER_DOCUMENTS_ACTIVE_CONFLICT",(x)=>x.printJobs=[{targetType:"fulfillment",targetId:x.fulfillments[0].id,jobStatus:"queued"}]],
    ["ERP_ORDER_DELIVERY_ALREADY_EXECUTED",(x)=>x.fulfillments[1].loadedAt="2026-10-24T00:00:00Z"],
    ["ORDER_LINE_HAS_STATEMENT",(x)=>x.statementLines=[{orderLineId:x.orderLines[1].id}]],
    ["PRINT_GROUP_PRICE_LOCKED",(x)=>x.priceSnapshots[1].sourceEvidence.intakeId="LOCKED"],
  ]){
    const x=await groupCorrectionFixture(),i=groupCorrectionInput(x,{[x.orderLines[0].id]:{newQty:2000}});mutate(x,i.body,i);if(!["PRINT_GROUP_INCOMPLETE","PRINT_GROUP_REVISION_CONFLICT","ACTION_FORBIDDEN","PRINT_GROUP_VALIDATION_INVALID"].includes(expected))i.body.expectedGroupRevision=readPrintGroup(x,i.orderLineId).view.groupRevision;
    assert.equal((await groupCorrectionService.previewCorrection(i)).code,expected,expected);assert.equal(x.priceSnapshots.length,2);assert.ok(x.orderLines.every(row=>row.revision===1));
  }
  // Two members release a shared inventory row once and have running ledger balances.
  const stock=await groupCorrectionFixture();stock.inventories=[{id:"INV-SHARED",reserved:10000,revision:3}];stock.inventoryReservations=stock.orderLines.map((row,i)=>({id:`RES-${i}`,orderLineId:row.id,inventoryItemId:"INV-SHARED",reservedQty:5000,status:"生效",revision:1}));
  const stockInput=groupCorrectionInput(stock,Object.fromEntries(stock.orderLines.map(row=>[row.id,{newQty:2000}])));
  await saveGroupCorrection(stockInput,"shared-stock-release");assert.equal(stock.inventories[0].reserved,4000);assert.equal(stock.inventories[0].revision,4);assert.deepEqual(stock.inventoryLedgers.map(row=>[row.qtyBefore,row.qtyAfter]),[[10000,7000],[7000,4000]]);
  const split=await groupCorrectionFixture(),keepId=split.orderLines[1].id;
  split.productionTasks[1].plannedQty=3000;split.productionTasks.push({...split.productionTasks[1],id:"KEEP-PROD-B",productionTaskId:"KEEP-PROD-B",plannedQty:2000});
  split.packingTasks=[{id:"KEEP-PACK-A",orderLineId:keepId,plannedQty:3000,status:"待打包"},{id:"KEEP-PACK-B",orderLineId:keepId,plannedQty:2000,status:"待打包"}];
  split.fulfillments[1].qty=3000;split.fulfillments.push({...split.fulfillments[1],id:"KEEP-DELIVERY-B",qty:2000});
  await saveGroupCorrection(groupCorrectionInput(split,{[split.orderLines[0].id]:{newQty:2000}}),"keep-split-plans");
  for(const collection of ["productionTasks","packingTasks","fulfillments"]){const rows=split[collection].filter(row=>(row.orderLineId??row.lineId)===keepId);assert.deepEqual(rows.map(row=>row.plannedQty??row.qty),[3000,2000],`${collection}: unchanged member keeps its actual split allocation`);}
  // A late conflict must reject the complete staged write without changing a member.
  const race=await groupCorrectionFixture(),ri=groupCorrectionInput(race,{[race.orderLines[0].id]:{newQty:2000}}),resolved=previewPrintGroupCorrection(race,ri.orderLineId,ri.body,ri.actionPermissions),plan=buildPrintGroupCorrectionPlan(race,resolved,"U-PRICE");
  race.orderLines[1].revision++;const before=JSON.stringify(race.priceSnapshots);await assert.rejects(race.orderLineQuantityAdjustmentTransactionRepository.correctPrintGroup({...plan,workspace:race,idempotencyKey:"late-conflict",idempotencyPayload:{case:"race"}}),{code:"PRINT_GROUP_REVISION_CONFLICT"});assert.equal(JSON.stringify(race.priceSnapshots),before);assert.equal(race.orderLines[0].qty,5000);
  console.log("PASS order printing group correction: frozen units, full members, reduction/member/all void, audits, shared inventory, blockers and exact retries");
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)await checkPrintGroupCorrection();
