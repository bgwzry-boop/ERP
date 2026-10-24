import { createHash, randomUUID } from "node:crypto";
import { hasOrderProductionExecution } from "./orderMutationProductionGuard.mjs";
import { hasExecutedDelivery } from "./orderMutationDeliveryGuard.mjs";
import { hasOrderActiveDocuments } from "./orderMutationDocumentGuard.mjs";
import { createInventoryReservationPolicyService } from "./services/inventoryReservationPolicyService.mjs";

export const frozenGroupPricingBasis = "frozen_original_unit_price";
export const groupLineId = row => row?.orderLineId ?? row?.lineId ?? row?.order_line_id ?? row?.id;
const idOf = row => row?.id ?? row?.priceSnapshotId ?? row?.reservationId;
const closed = row => /已关闭|已作废|已取消|已交付|已完成/.test(row.status ?? row.lineStatus ?? "") || row.voidedAt || row.voided_at;
const fail = (code, message, statusCode = 409) => { throw Object.assign(new Error(message), { code, statusCode }); };
const number = value => typeof value === "number" || (typeof value === "string" && value.trim()) ? Number(value) : NaN;
const money = value => Math.round((value + Number.EPSILON) * 100) / 100;
const {isReleasableInventoryReservation}=createInventoryReservationPolicyService();
export const hashGroupFact = value => createHash("sha256").update(JSON.stringify(value)).digest("hex");
export function latestGroupPrice(workspace, id) {
  const prices = (workspace.priceSnapshots ?? []).filter(row => groupLineId(row) === id).sort((a,b) =>
    (Date.parse(b.createdAt ?? b.created_at) || 0) - (Date.parse(a.createdAt ?? a.created_at) || 0) || Number(b.versionNo ?? b.version_no) - Number(a.versionNo ?? a.version_no));
  if (!prices.length) return null;
  const sameTime = prices.filter(row => (Date.parse(row.createdAt ?? row.created_at) || 0) === (Date.parse(prices[0].createdAt ?? prices[0].created_at) || 0));
  if (sameTime.some(row => (row.snapshotType ?? row.snapshot_type) !== (prices[0].snapshotType ?? prices[0].snapshot_type))) fail("ORDER_LINE_PRICE_SOURCE_AMBIGUOUS", "价格修订先后不明确，请先复核价格依据。");
  return prices[0];
}
export function readPrintGroup(workspace, orderLineId) {
  const anchor = (workspace.orderLines ?? []).find(row => groupLineId(row) === orderLineId);
  const anchorPrice = latestGroupPrice(workspace, orderLineId);
  const group = anchorPrice?.sourceEvidence?.officePricingGroup;
  if (!anchor || !group?.groupId || closed(anchor)) fail("PRINT_GROUP_NOT_FOUND", "没有可更正的有效印刷合组。", 404);
  const candidateIds=new Set((workspace.priceSnapshots??[]).filter(price=>price.sourceEvidence?.officePricingGroup?.groupId===group.groupId).map(groupLineId));
  const facts = (workspace.orderLines ?? []).filter(row => !closed(row)&&candidateIds.has(groupLineId(row))).map(row => ({ line:row, price:latestGroupPrice(workspace, groupLineId(row)) }))
    .filter(({price}) => price?.sourceEvidence?.officePricingGroup?.groupId === group.groupId).sort((a,b) => groupLineId(a.line).localeCompare(groupLineId(b.line)));
  if (facts.length !== Number(group.memberCount) || facts.some(({price}) => Number(price.sourceEvidence.officePricingGroup.memberCount) !== facts.length)) fail("PRINT_GROUP_INCOMPLETE", "整组成员或报价修订不完整，请刷新后核对。不可只改其中一行。");
  const groupIdentity=value=>JSON.stringify([value.groupId,value.customerId,value.size,value.content,value.side,value.scope??null,value.printRuleVersion,value.correctionRevision??0,value.quantity,value.memberCount]);
  if(facts.some(({line,price})=>line.customerId!==group.customerId||groupIdentity(price.sourceEvidence.officePricingGroup)!==groupIdentity(group))||facts.reduce((sum,{line})=>sum+number(line.originalQty??line.qty),0)!==Number(group.quantity))fail("PRINT_GROUP_INCOMPLETE","当前整组的客户、数量或计价修订依据不一致，请先复核原合组证据。");
  if (Array.isArray(group.orderLineIds) && JSON.stringify([...group.orderLineIds].sort()) !== JSON.stringify(facts.map(({line})=>groupLineId(line)).sort())) fail("PRINT_GROUP_INCOMPLETE", "当前成员与合组证据不一致。");
  const blockers=[];
  const members = facts.map(({line,price}) => {
    const id=groupLineId(line), qty=number(line.originalQty ?? line.qty);
    const values={bagPrice:number(price.bagPrice),printPrice:number(price.printPrice),otherFee:number(price.otherFee),adjustmentAmount:number(price.adjustmentAmount),chargeableQty:number(price.chargeableQty),amount:number(price.finalAmount)};
    const block=(code,message)=>blockers.push({code,message,orderLineId:id});
    if (!Number.isSafeInteger(qty)||qty<1 || !Number.isSafeInteger(values.chargeableQty)||values.chargeableQty<0 || values.chargeableQty>qty || Object.values(values).some(n=>!Number.isFinite(n)||Math.abs(n)>=1e12) || values.bagPrice<0||values.printPrice<0||values.otherFee<0||values.amount<0 || money((values.bagPrice+values.printPrice)*values.chargeableQty+values.otherFee+values.adjustmentAmount)!==money(values.amount)) block("PRINT_GROUP_PRICE_INVALID","冻结价格证据不完整或金额不一致，请复核原价。");
    if (price.sourceEvidence?.kind?.includes("miniapp") || price.sourceEvidence?.intakeId || line.intakeId || line.priceLocked || line.price_locked || price.sourceEvidence?.lockedPrice) block("PRINT_GROUP_PRICE_LOCKED","本单含小程序锁价或其他锁价凭据，不能使用办公室合组更正。");
    if ((workspace.statementLines??[]).some(row=>groupLineId(row)===id)) block("ORDER_LINE_HAS_STATEMENT","本单已进账单，请先办理财务更正。");
    if (hasOrderProductionExecution(workspace,id)) block("ERP_ORDER_PRODUCTION_ALREADY_EXECUTED","本单已有生产、实际耗料、报工或实包，不能直接更正。");
    if ((workspace.fulfillments??[]).some(row=>groupLineId(row)===id&&hasExecutedDelivery(row))) block("ERP_ORDER_DELIVERY_ALREADY_EXECUTED","本单已有实际出库或配送，不能直接更正。");
    if (hasOrderActiveDocuments(workspace,id)) block("ERP_ORDER_DOCUMENTS_ACTIVE_CONFLICT","请先作废旧单据再改单；改单后重印。");
    return {orderLineId:id,revision:Number(line.revision??1),qty,...values,customerName:line.customerName??(workspace.customers??[]).find(row=>row.id===line.customerId)?.name??line.customerId??"",product:line.product??line.productName??"",size:line.size??"",color:line.color??"",status:line.status??line.lineStatus??"",priceSnapshotId:price.priceSnapshotId??price.id};
  });
  const ids=new Set(members.map(row=>row.orderLineId));
  const stableRows=rows=>rows.filter(row=>ids.has(groupLineId(row))).sort((a,b)=>String(idOf(a)).localeCompare(String(idOf(b))));
  const groupRevision=hashGroupFact({groupId:group.groupId,members:facts.map(({line,price})=>({id:groupLineId(line),revision:Number(line.revision??1),qty:number(line.originalQty??line.qty),status:line.status??line.lineStatus,price})),fulfillments:stableRows(workspace.fulfillments??[]),reservations:stableRows(workspace.inventoryReservations??[]),tasks:stableRows(workspace.productionTasks??[]),packingTasks:stableRows(workspace.packingTasks??[]),blockers});
  return {view:{groupId:group.groupId,groupRevision,pricingBasis:frozenGroupPricingBasis,members,blockers,canCorrect:blockers.length===0},facts,group};
}
export function previewPrintGroupCorrection(workspace,orderLineId,body,permissions=[]) {
  const resolved=readPrintGroup(workspace,orderLineId),{view}=resolved;
  if(body.expectedGroupRevision!==view.groupRevision) fail("PRINT_GROUP_REVISION_CONFLICT","整组订单或价格已变化，请重新读取完整成员后核对。");
  if(view.blockers.length)fail(view.blockers[0].code,view.blockers[0].message);
  if(!["amend","void_all"].includes(body.mode)||typeof body.reason!=="string"||!body.reason.trim()||body.reason.length>1000)fail("PRINT_GROUP_VALIDATION_INVALID","请选择更正方式并填写不超过1000字的原因。",422);
  if(!Array.isArray(body.members)||body.members.length!==view.members.length||new Set(body.members.map(row=>row.orderLineId)).size!==view.members.length||body.members.some(row=>!view.members.some(current=>current.orderLineId===row.orderLineId)))fail("PRINT_GROUP_INCOMPLETE","必须提交整组全部当前成员，不可遗漏或重复。");
  const members=view.members.map(current=>{
    const request=body.members.find(row=>row.orderLineId===current.orderLineId);
    if(request.expectedRevision!==current.revision)fail("PRINT_GROUP_REVISION_CONFLICT","某条订单版本已变化，请刷新整组。");
    if(typeof request.void!=="boolean"||typeof request.newQty!=="number"||!Number.isSafeInteger(request.newQty)||request.newQty<1||request.newQty>current.qty)fail("PRINT_GROUP_VALIDATION_INVALID","此入口只允许正整数减量或明确作废；补单请使用补单合组入口。",422);
    const action=request.void?"void":request.newQty<current.qty?"reduce":"keep";
    if(body.mode==="void_all"&&!request.void)fail("PRINT_GROUP_VALIDATION_INVALID","全组作废必须逐行明确作废。",422);
    if(action==="reduce"&&!permissions.includes("order.quantity.adjust"))fail("ACTION_FORBIDDEN","没有订单改量权限。",403);
    if(action==="void"&&!permissions.includes("order.void"))fail("ACTION_FORBIDDEN","没有订单作废权限。",403);
    if(action==="reduce"&&current.chargeableQty!==current.qty)fail("PRINT_GROUP_BILLING_ALLOCATION_REQUIRED","原单含赠送或部分计费数量，请先明确分配；此处不能推算赠品怎样减少。");
    const deliveries=(workspace.fulfillments??[]).filter(row=>groupLineId(row)===current.orderLineId&&!["已取消","已作废"].includes(row.status));
    if(action==="reduce"&&(deliveries.length>1||(deliveries.length===1&&number(deliveries[0].expectedQty??deliveries[0].qty)!==current.qty)))fail("ORDER_LINE_SPLIT_ALLOCATION_REQUIRED","本行已有多批或部分交付计划，请先明确各批减量分配，不能将新数量重复写入每批。");
    const finalAmount=action==="void"?0:action==="keep"?current.amount:money((current.bagPrice+current.printPrice)*request.newQty+current.otherFee+current.adjustmentAmount);
    if(!Number.isFinite(finalAmount)||finalAmount<0||finalAmount>=1e12)fail("PRINT_GROUP_PRICE_INVALID","改量后的冻结价金额无效。");
    return {orderLineId:current.orderLineId,previousQty:current.qty,newQty:action==="void"?0:request.newQty,action,previousAmount:current.amount,finalAmount,bagPrice:current.bagPrice,printPrice:current.printPrice};
  });
  if(!members.some(row=>row.action!=="keep"))fail("PRINT_GROUP_VALIDATION_INVALID","请至少减量或作废一条订单。",422);
  if(body.mode!=="void_all"&&members.every(row=>row.action==="void"))fail("PRINT_GROUP_VALIDATION_INVALID","请明确选择全组作废后再逐行确认。",422);
  const totals={previousQty:0,newQty:0,previousAmount:0,finalAmount:0};
  for(const row of members){totals.previousQty+=row.previousQty;totals.newQty+=row.newQty;totals.previousAmount+=row.previousAmount;totals.finalAmount+=row.finalAmount;}
  for(const key of ["previousAmount","finalAmount"])totals[key]=money(totals[key]);
  totals.difference=money(totals.finalAmount-totals.previousAmount);
  const preview={groupId:view.groupId,groupRevision:view.groupRevision,mode:body.mode,pricingBasis:frozenGroupPricingBasis,reason:body.reason.trim(),members,totals};
  preview.previewHash=hashGroupFact(preview);
  return {...resolved,preview};
}
export function buildPrintGroupCorrectionPlan(workspace,resolved,operatorId,createdAt=new Date().toISOString()) {
  const {preview,view,group,facts}=resolved,correctionId=`PGC-${randomUUID()}`;
  const activeIds=preview.members.filter(row=>row.action!=="void").map(row=>row.orderLineId);
  const inventoryAdjustments=new Map(),inventoryLedgerEntries=[],inventoryReservations=[];
  const members=preview.members.map(change=>{
    const {line,price}=facts.find(({line})=>groupLineId(line)===change.orderLineId),id=change.orderLineId;
    const current=view.members.find(row=>row.orderLineId===id),isVoid=change.action==="void";
    const liveTasks=(workspace.productionTasks??[]).filter(row=>groupLineId(row)===id&&!["已取消","已作废"].includes(row.taskStatus??row.status));
    const reservations=(workspace.inventoryReservations??[]).filter(row=>groupLineId(row)===id&&isReleasableInventoryReservation(row)&&number(row.reservedQty??row.qty)>0);
    const reserved=reservations.reduce((sum,row)=>sum+number(row.reservedQty??row.qty),0);
    const packingTasks=(workspace.packingTasks??[]).filter(row=>groupLineId(row)===id&&!["已取消","已作废"].includes(row.status));
    // Full blank-stock reservation plus a full printing task refers to the same
    // physical bags. Other mixed/partial allocations require explicit allocation.
    if(change.action==="reduce"&&((!liveTasks.length&&!reserved)||(liveTasks.length&&liveTasks.some(row=>number(row.plannedQty)!==current.qty))||(reserved&&reserved!==current.qty)||(liveTasks.length&&reserved&&liveTasks.some(row=>!/丝印|印刷/.test(row.taskType??"")))))fail("ORDER_PRODUCTION_ALLOCATION_REQUIRED","本单的库存或分批生产数量不等于整单，需先明确各批分配。");
    if(change.action==="reduce"&&packingTasks.some(row=>number(row.plannedQty)!==current.qty))fail("ORDER_PRODUCTION_ALLOCATION_REQUIRED","本单已有分批打包计划，请先明确各批减量分配。");
    let release=isVoid?reserved:current.qty-change.newQty;
    for(const reservation of reservations){
      if(release<=0)break;
      const oldQty=number(reservation.reservedQty??reservation.qty),delta=Math.min(oldQty,release),item=(workspace.inventories??[]).find(row=>row.id===reservation.inventoryItemId);
      if(!item||!Number.isSafeInteger(number(item.reserved))||number(item.reserved)<oldQty)fail("ERP_INVENTORY_CONCURRENCY_CONFLICT","占用库存证据不完整，请刷新核对。");
      const itemId=item.id,existing=inventoryAdjustments.get(itemId),before=existing?existing.expectedReservedQty+existing.reservedQtyChange:number(item.reserved);
      const adjustment=existing??{inventoryItemId:itemId,expectedRevision:Number(item.revision??1),expectedReservedQty:number(item.reserved),reservedQtyChange:0};
      adjustment.reservedQtyChange-=delta;
      if(adjustment.expectedReservedQty+adjustment.reservedQtyChange<0)fail("ERP_INVENTORY_CONCURRENCY_CONFLICT","整组释放量超过真实占用。");
      inventoryAdjustments.set(itemId,adjustment);
      inventoryReservations.push({...reservation,id:idOf(reservation),reservationId:idOf(reservation),reservedQty:oldQty-delta,qty:oldQty-delta,status:oldQty===delta?"已释放":"生效",expectedRevision:Number(reservation.revision??1),expectedReservedQty:oldQty,expectedStatus:reservation.status,revision:Number(reservation.revision??1)+1});
      inventoryLedgerEntries.push({id:`LEDGER-${randomUUID()}`,inventoryItemId:itemId,changeType:"印刷合组更正释放占用",qtyBefore:before,qtyChange:-delta,qtyAfter:before-delta,sourceType:"order_print_group_correction",sourceId:id,operatorId,reason:preview.reason,createdAt});
      release-=delta;
    }
    const versionNo=Math.max(0,...(workspace.priceSnapshots??[]).filter(row=>groupLineId(row)===id).map(row=>Number(row.versionNo??1)))+1;
    const snapshot={...price,id:`PS-${randomUUID()}`,orderLineId:id,snapshotType:"print_group_correction",versionNo,chargeableQty:isVoid?0:change.action==="keep"?current.chargeableQty:change.newQty,otherFee:isVoid?0:current.otherFee,adjustmentAmount:isVoid?0:current.adjustmentAmount,finalAmount:change.finalAmount,amount:change.finalAmount,overrideReason:`正式改单沿原约定价；${preview.reason}`,createdBy:operatorId,createdAt};
    snapshot.priceSnapshotId=snapshot.id;
    snapshot.sourceEvidence={...price.sourceEvidence,kind:"office_print_group_correction",previousPriceSnapshotId:current.priceSnapshotId,correctionId,pricingBasis:frozenGroupPricingBasis,correctionReason:preview.reason,officePricingGroup:{...group,orderLineIds:activeIds,draftLineIds:[],relatedOrderLineIds:[],memberCount:activeIds.length,quantity:preview.totals.newQty,correctionRevision:Number(group.correctionRevision??0)+1,memberDisposition:isVoid?"voided":"active"}};
    const status=isVoid?"已关闭":liveTasks.length?"待排产":line.lineStatus??line.status;
    const after={...line,id,orderLineId:id,originalQty:isVoid?current.qty:change.newQty,qty:isVoid?current.qty:change.newQty,amount:change.finalAmount,revision:current.revision+1,lineStatus:status,status,...(isVoid?{closedAt:createdAt,voidedAt:createdAt,voidedBy:operatorId,voidReason:preview.reason}:{})};
    const changeRecord={id:`OLCR-${randomUUID()}`,orderLineId:id,changedFields:["original_qty","line_status","price_snapshot","printing_group"],before:{originalQty:current.qty,finalAmount:current.amount,priceSnapshotId:current.priceSnapshotId,revision:current.revision},after:{originalQty:after.originalQty,effectiveQty:change.newQty,finalAmount:change.finalAmount,priceSnapshotId:snapshot.id,revision:after.revision,groupId:view.groupId,correctionId},reason:preview.reason,changedBy:operatorId,createdAt};
    return {change,before:line,expectedRevision:current.revision,expectedPriceSnapshot:price,after,snapshot,changeRecord};
  });
  const operationLog={id:`LOG-${randomUUID()}`,targetType:"printing_price_group",targetId:view.groupId,action:"correct_print_group",before:{groupRevision:view.groupRevision,members:preview.members.map(row=>({orderLineId:row.orderLineId,qty:row.previousQty,amount:row.previousAmount}))},after:{correctionId,pricingBasis:frozenGroupPricingBasis,members:preview.members,totals:preview.totals},reason:preview.reason,operatorId,occurredAt:createdAt,createdAt};
  const response={groupId:view.groupId,correctionId,members:members.map(row=>({orderLineId:row.after.id,newQty:row.change.newQty,finalAmount:row.change.finalAmount,status:row.after.status,revision:row.after.revision,priceSnapshotId:row.snapshot.id})),totals:preview.totals,operationLogId:operationLog.id,priceSnapshotIds:members.map(row=>row.snapshot.id)};
  const ids=new Set(members.map(row=>row.after.id));
  const deliveries=(workspace.fulfillments??[]).filter(row=>ids.has(groupLineId(row)));
  const expectedDeliveries=deliveries.map(row=>({id:row.fulfillmentId??row.id,revision:Number(row.revision??1),qty:number(row.expectedQty??row.qty),status:row.status,anchor:row.packingGroupAnchorId??row.packing_group_anchor_id??null}));
  const packingGroupAnchorIds=[...new Set(deliveries.map(row=>row.packingGroupAnchorId??row.packing_group_anchor_id??row.fulfillmentId??row.id))].filter(Boolean);
  const expectedReservations=(workspace.inventoryReservations??[]).filter(row=>ids.has(groupLineId(row))).map(row=>({id:row.reservationId??row.id,revision:Number(row.revision??1),qty:number(row.reservedQty??row.qty),status:row.status}));
  const expectedTasks=(workspace.productionTasks??[]).filter(row=>ids.has(groupLineId(row))).map(row=>({id:row.productionTaskId??row.id,revision:Number(row.revision??1),qty:number(row.plannedQty),status:row.taskStatus??row.status}));
  const expectedPackingTasks=(workspace.packingTasks??[]).filter(row=>ids.has(groupLineId(row))).map(row=>({id:row.packingTaskId??row.id,revision:Number(row.revision??1),qty:number(row.plannedQty),status:row.status}));
  return {groupId:view.groupId,groupRevision:view.groupRevision,members,packingGroupAnchorIds,expectedDeliveries,expectedReservations,expectedTasks,expectedPackingTasks,inventoryAdjustments:[...inventoryAdjustments.values()],inventoryReservations,inventoryLedgerEntries,operationLog,response,createdAt};
}
