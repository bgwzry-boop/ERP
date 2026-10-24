import { readPrintGroup, previewPrintGroupCorrection, buildPrintGroupCorrectionPlan } from "../orderPrintGroupCorrection.mjs";

const business=(error)=>{if(error.statusCode&&error.code)return {error:true,statusCode:error.statusCode,code:error.code,message:error.message};throw error;};
export function createOrderPrintGroupCorrectionService(){
  return {
    async getPrintGroup({workspace,orderLineId}){
      try{return {response:readPrintGroup(await freshGroupWorkspace(workspace),orderLineId).view};}catch(error){return business(error);}
    },
    async previewCorrection({workspace,orderLineId,body={},actionPermissions=[]}){
      try{return {response:previewPrintGroupCorrection(await freshGroupWorkspace(workspace),orderLineId,body,actionPermissions).preview};}catch(error){return business(error);}
    },
    async correctPrintGroup({workspace,orderLineId,body={},operatorId,actionPermissions=[]}){
      const payload={...body,orderLineId,operatorId};
      try{
        if(!String(operatorId??"").trim()||typeof body.idempotencyKey!=="string"||!body.idempotencyKey.trim())throw Object.assign(new Error("缺少操作人或原请求凭据，尚未保存。"),{statusCode:422,code:"PRINT_GROUP_VALIDATION_INVALID"});
        // A successful receipt remains replayable after all members are voided.
        const replay=await workspace.orderLineQuantityAdjustmentTransactionRepository.findPrintGroupCorrectionReplay({workspace,idempotencyKey:body.idempotencyKey,idempotencyPayload:payload});
        if(replay)return {response:replay};
        const current=await freshGroupWorkspace(workspace);
        const resolved=previewPrintGroupCorrection(current,orderLineId,body,actionPermissions);
        if(body.previewHash!==resolved.preview.previewHash)throw Object.assign(new Error("核对金额或整组成员已变化，请重新预览完整影响。"),{statusCode:409,code:"PRINT_GROUP_PREVIEW_CHANGED"});
        const latestTime=Math.max(0,...resolved.facts.map(({price})=>Date.parse(price.createdAt??price.created_at)||0));
        const at=new Date(Math.max(Date.now(),latestTime+1)).toISOString();
        const plan=buildPrintGroupCorrectionPlan(current,resolved,operatorId,at);
        const response=await workspace.orderLineQuantityAdjustmentTransactionRepository.correctPrintGroup({...plan,workspace,idempotencyKey:body.idempotencyKey,idempotencyPayload:payload});
        return {response};
      }catch(error){
        // Another identical request can commit between the first receipt read
        // and fresh-state validation. Resolve its exact receipt before exposing
        // a stale-version rejection for a write that already succeeded.
        if(body.idempotencyKey&&["PRINT_GROUP_NOT_FOUND","PRINT_GROUP_REVISION_CONFLICT","BUSINESS_WRITE_CONFLICT"].includes(error.code)){
          const replay=await workspace.orderLineQuantityAdjustmentTransactionRepository.findPrintGroupCorrectionReplay({workspace,idempotencyKey:body.idempotencyKey,idempotencyPayload:payload});
          if(replay)return {response:replay};
        }
        return business(error);
      }
    },
  };
}
async function freshGroupWorkspace(workspace){
  if(workspace.coreWorkspaceReadRepository?.kind!=="postgres")return workspace;
  const state=await workspace.coreWorkspaceReadRepository.loadState();
  const keys=["orderLines","priceSnapshots","fulfillments","inventories","inventoryReservations","productionTasks","workshopReports","packingTasks","packages","statementLines","paperOutboundDocuments","printRecords"];
  if(keys.some(key=>!Array.isArray(state?.[key])))throw Object.assign(new Error("正式订单事实读取不完整，不能使用缓存推算整组更正。"),{statusCode:503,code:"PRINT_GROUP_STATE_UNAVAILABLE"});
  const aux=await workspace.orderLineQuantityAdjustmentTransactionRepository.loadPrintGroupAuxiliaryFacts();
  if(!Array.isArray(aux?.rawMaterialInbounds)||!Array.isArray(aux?.printJobs))throw Object.assign(new Error("实际耗料或打印事实读取失败，尚未修改订单。"),{statusCode:503,code:"PRINT_GROUP_STATE_UNAVAILABLE"});
  return {...workspace,...state,...aux};
}
