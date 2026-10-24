const id=row=>String(row?.fulfillmentId??row?.id??'');
const positive=value=>Number.isSafeInteger(Number(value))&&Number(value)>0;
export function captureWarehouseInstruction(workspace,fulfillment) {
 const expectedQty=Number(fulfillment.expectedQty??fulfillment.qty),actualQty=Number(fulfillment.actualQty);
 const base={instructionQty:positive(expectedQty)?expectedQty:null,instructionResolutionId:'',instructionDecisionId:''};
 if(!positive(actualQty)||actualQty===expectedQty)return base;
 const latest=[...(workspace.fulfillmentQuantityVarianceResolutions??[])].filter(r=>r.fulfillmentId===id(fulfillment)).sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt))||String(b.id).localeCompare(String(a.id)))[0];
 if(!latest||!latest.businessDecisionId||Number(latest.expectedQty)!==expectedQty||Number(latest.actualQty)!==actualQty||!['按实际数量出库','赠送数量'].includes(latest.resolutionResult))return base;
 if((workspace.fulfillmentExceptions??[]).some(e=>e.fulfillmentId===id(fulfillment)&&e.exceptionType==='quantity_mismatch'&&!['已解决','已作废'].includes(e.status)))return base;
 if(workspace.fulfillmentActionTransactionRepository?.kind!=='postgres'&&!(workspace.businessDecisionRecords??[]).some(d=>d.id===latest.businessDecisionId&&d.businessId===id(fulfillment)&&d.decisionScope==='fulfillment_quantity_variance'&&d.status==='active'))return base;
 return {instructionQty:actualQty,instructionResolutionId:latest.id??latest.quantityVarianceResolutionId,instructionDecisionId:latest.businessDecisionId};
}
export function resolveWarehouseInstructionQuantity(workspace,fulfillment,paper) {
 const expected=Number(fulfillment.expectedQty??fulfillment.qty),instruction=paper.instructionQty==null?expected:Number(paper.instructionQty);
 const conflict=()=>{throw Object.assign(new Error('实际出库数量须有当前有效的数量差异决定，并重新打印匹配该决定的新纸单。'),{statusCode:409,code:'WAREHOUSE_INSTRUCTION_QUANTITY_CONFLICT'});};
 if(!positive(instruction))throw Object.assign(new Error('当前纸单缺少有效出库指令数量，请办公室核对。'),{statusCode:409,code:'WAREHOUSE_INSTRUCTION_QUANTITY_REQUIRED'});
 if(['数量差异待处理','待补货','无法出库','送货异常'].includes(fulfillment.status)||(workspace.fulfillmentExceptions??[]).some(e=>e.fulfillmentId===id(fulfillment)&&e.exceptionType==='quantity_mismatch'&&!['已解决','已作废'].includes(e.status)))conflict();
 const current=captureWarehouseInstruction(workspace,fulfillment);
 const hasActual=fulfillment.actualQty!==null&&fulfillment.actualQty!==undefined&&fulfillment.actualQty!=='';
 if(!current.instructionResolutionId&&(!hasActual||Number(fulfillment.actualQty)===expected)&&instruction===expected&&!paper.instructionResolutionId&&!paper.instructionDecisionId)return instruction;
 const resolution=(workspace.fulfillmentQuantityVarianceResolutions??[]).find(r=>(r.id??r.quantityVarianceResolutionId)===paper.instructionResolutionId);
 if(instruction!==current.instructionQty||!current.instructionResolutionId||current.instructionResolutionId!==paper.instructionResolutionId||current.instructionDecisionId!==paper.instructionDecisionId||!resolution||!Number.isFinite(Date.parse(paper.createdAt))||!Number.isFinite(Date.parse(resolution.createdAt))||Date.parse(resolution.createdAt)>Date.parse(paper.createdAt))conflict();
 return instruction;
}
