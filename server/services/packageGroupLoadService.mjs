import { randomUUID } from 'node:crypto';
import { fulfillmentIdOf, packageAnchorId, packageContents, isActivePackage, packageIdOf } from '../../shared/packageContents.js';
import { findActiveDriverDeliveryDispatch } from './driverDeliveryTaskProjectionService.mjs';
const fail=(code,message,statusCode=409)=>{throw Object.assign(new Error(message),{code,statusCode});};
const sort=(a,b)=>a.id<b.id?-1:a.id>b.id?1:0;
export function packageGroupLoadSnapshot(workspace,anchorId) {
 const members=workspace.fulfillments.filter(f=>packageAnchorId(f)===anchorId);
 return {fulfillments:members.map(f=>({id:fulfillmentIdOf(f),revision:Number(f.revision??1),status:f.status,physicalOutboundAt:f.physicalOutboundAt||null,loadedAt:f.loadedAt||null,packingGroupRevision:Number(f.packingGroupRevision)})).sort(sort),
 dispatches:members.map(f=>findActiveDriverDeliveryDispatch(workspace,fulfillmentIdOf(f))).map(d=>({id:d.id??d.dispatchId,revision:Number(d.revision??1),fulfillmentId:d.fulfillmentId,driverId:d.driverId,routeDate:d.routeDate,routeNo:d.routeNo??d.routeBatchNo??'',status:d.dispatchStatus})).sort(sort),
 packages:workspace.packages.filter(p=>isActivePackage(p)&&p.fulfillmentId===anchorId).map(p=>({id:packageIdOf(p),revision:Number(p.revision??1),status:p.status,labelPrintRecordId:p.labelPrintRecordId||''})).sort(sort)};
}
export async function confirmPackageGroupLoaded({workspace,fulfillmentId,body,operatorId}) {
 const repository=workspace.productionPackingTransactionRepository,payload={fulfillmentId,body,operatorId};
 await repository.refreshPackageGroupWorkspace?.({workspace});
 const replay=await repository.findPackageGroupReplay({action:'load',payload,idempotencyKey:body.idempotencyKey});if(replay)return replay;
 const selected=workspace.fulfillments.find(f=>fulfillmentIdOf(f)===fulfillmentId),anchorId=packageAnchorId(selected);
 if(anchorId!==fulfillmentId)fail('PACKING_GROUP_USE_ANCHOR',`本包组只需在主任务 ${anchorId} 扫码装车一次。`);
 const members=workspace.fulfillments.filter(f=>packageAnchorId(f)===anchorId);
 if(!members.length||members.some(f=>f.method!=='送货'||!f.physicalOutboundAt||f.loadedAt||f.deliveredAt||f.finalDeliveryAt||['已交付','已作废','已取消','送货异常','数量差异待处理'].includes(f.status))) fail('PACKING_GROUP_WAREHOUSE_REQUIRED','包组各明细必须先完成当前纸单的实物出库，且没有已装车或交付记录。');
 const dispatches=members.map(f=>findActiveDriverDeliveryDispatch(workspace,fulfillmentIdOf(f)));
 const route=d=>`${d.routeDate}|${d.routeNo??d.routeBatchNo??''}`;
 if(dispatches.some(d=>!d.id&&!d.dispatchId||d.driverId!==operatorId||!d.routeDate||!(d.routeNo??d.routeBatchNo))||new Set(dispatches.map(route)).size!==1) fail('PACKING_GROUP_DISPATCH_MISMATCH','同一个实物包组须安排同一司机、同一送货日期和车次，请办公室统一调度。');
 const packages=workspace.packages.filter(p=>isActivePackage(p)&&p.fulfillmentId===anchorId),expected=packages.map(packageIdOf),checked=body.checkedPackageIds;
 if(!expected.length||!Array.isArray(checked)||new Set(checked).size!==checked.length||checked.length!==expected.length||checked.some(id=>!expected.includes(id))) fail('DRIVER_PACKAGE_CHECK_INVALID','请逐包扫描本次有效包码，不能漏扫、重复或使用旧码及其他订单包码。',422);
 if(packages.some(p=>p.status!=='已打印标签'||!p.labelPrintRecordId||!(workspace.printRecords??[]).some(r=>(r.printRecordId??r.id)===p.labelPrintRecordId&&['printed','reprinted'].includes(r.status)))) fail('PACKING_GROUP_LABEL_PRINT_REQUIRED','本包组挂牌尚未取得可信打印成功回执，请先完成打印。');
 const ids=new Set(members.map(fulfillmentIdOf));
 if(packages.some(p=>packageContents(p).some(i=>!ids.has(i.fulfillmentId))))fail('PACKING_GROUP_CONTENTS_INVALID','包裹关联明细与包组不符，请办公室核对。');
 for(const member of members){const packed=packages.flatMap(packageContents).filter(i=>i.fulfillmentId===fulfillmentIdOf(member)).reduce((sum,i)=>sum+Number(i.packedQty),0);if(packed!==Number(member.actualQty))fail('PACKING_GROUP_QUANTITY_CHANGED','交付数量与已确认实物包裹不一致，请办公室核对。');}
 const loadedAt=new Date().toISOString(),operationLogId=`LOG-PKG-LOAD-${randomUUID()}`;
 return repository.writePackageGroupLoad({workspace,action:'load',payload,idempotencyKey:body.idempotencyKey,anchorId,operatorId,loadedAt,operationLogId,snapshot:packageGroupLoadSnapshot(workspace,anchorId),checkedPackageIds:checked,reason:String(body.remark??'')});
}
