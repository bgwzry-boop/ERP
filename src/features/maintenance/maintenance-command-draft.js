const keyFor = owner => `erp.maintenance-command.v1:${encodeURIComponent(owner)}`;
function valid(owner, record) {
  const request=record?.request;
  return Boolean(owner && record?.owner===owner && record.task?.id===request?.taskId
    && /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/.test(request?.idempotencyKey || '')
    && Number.isSafeInteger(request.expectedRevision) && request.expectedRevision>0
    && typeof request.finding==='string' && typeof request.actionTaken==='string'
    && ['处理中','已恢复','等待配件','需要停机','转办公室协调'].includes(request.status)
    && Array.isArray(request.photoAttachmentIds) && request.photoAttachmentIds.every(id=>typeof id==='string'&&id)
    && typeof request.completionConfirmed==='boolean');
}
export function readMaintenanceCommandDraft(owner) {
  try {
    if(!owner)throw new Error('owner missing');
    const raw=globalThis.sessionStorage.getItem(keyFor(owner));
    if(raw===null)return {request:null,task:null,error:''};
    const record=JSON.parse(raw);
    if(!valid(owner,record))throw new Error('invalid draft');
    return {...record,error:''};
  }catch{return {request:null,task:null,error:'无法读取待核实机修请求，请恢复浏览器存储后重新打开，避免重复提交。'};}
}
export function saveMaintenanceCommandDraft(owner, input, task) {
  try {
    const {taskId,idempotencyKey,expectedRevision,finding,actionTaken,status,photoAttachmentIds,completionConfirmed}=input;
    const record={owner,request:{taskId,idempotencyKey,expectedRevision,finding,actionTaken,status,photoAttachmentIds,completionConfirmed},
      task:{id:task.id,machineId:task.machineId,machineName:task.machineName,type:task.type,status:task.status,revision:expectedRevision,photoAttachmentIds}};
    if(!valid(owner,record))throw new Error('invalid request');
    const raw=JSON.stringify(record);globalThis.sessionStorage.setItem(keyFor(owner),raw);
    if(globalThis.sessionStorage.getItem(keyFor(owner))!==raw)throw new Error('not retained');
    return '';
  }catch{return '浏览器未能保存待核实请求，本次尚未发送。请恢复存储后按原请求重试。';}
}
export function clearMaintenanceCommandDraft(owner, request) {
  if(readMaintenanceCommandDraft(owner).request?.idempotencyKey!==request?.idempotencyKey)return;
  try{globalThis.sessionStorage.removeItem(keyFor(owner));}catch{/* Original receipt remains safely retryable. */}
}
