import {requestOfficeApi,readOfficeApiJson,createOfficeIdempotencyKey} from '../../services/officeApiClientCore.js';
export {createOfficeIdempotencyKey};
export async function packageGroupRequest(path,options={}) {
 const response=await requestOfficeApi(path,options),data=await readOfficeApiJson(response);
 if(!response.ok)throw Object.assign(new Error(data?.error?.message??data?.message??'包裹操作失败，请刷新核对。'),{code:data?.error?.code??data?.code,status:response.status});
 return data;
}
export function hasCompletePackageGroupReceipt(result,request) {
 if(!result?.operationLogId||result.anchorFulfillmentId!==request.anchorFulfillmentId||!Number.isInteger(result.packingRevision)||result.packingRevision<1||!Array.isArray(result.packages)||!Array.isArray(result.packageIds)||result.packages.length!==request.body.packages.length||new Set(result.packageIds).size!==result.packageIds.length||result.packageIds.length!==result.packages.length)return false;
 if(JSON.stringify([...result.fulfillmentIds??[]].sort())!==JSON.stringify([...request.body.fulfillmentIds].sort()))return false;
 return result.packages.every((p,index)=>p.packageId===result.packageIds[index]&&p.fulfillmentId===request.anchorFulfillmentId&&p.packageSeq===index+1&&p.packageCount===result.packages.length&&JSON.stringify((p.contents??[]).map(i=>({fulfillmentId:i.fulfillmentId,orderLineId:i.orderLineId,packedQty:i.packedQty})))===JSON.stringify(request.body.packages[index].items));
}
