import {useEffect,useRef,useState} from "react";
import {createOfficeAttachment,createInventoryCorrectionEvidenceAttachmentInput,validateAttachmentUploadInput} from "../../../../src/services/officeAttachmentApiClient.js";
import {linkOfficeInventoryCorrectionAttachments} from "../../../../src/services/officeInventoryApiClient.js";
import {createOfficeIdempotencyKey} from "../../../../src/services/officeApiClientCore.js";
import {DocumentCameraCapture} from "../../../../src/components/DocumentCameraCapture.jsx";
export function FinishedInventoryCorrectionEvidence({draft,authState,onUpdated}) {
 const [file,setFile]=useState(null),[busy,setBusy]=useState(false),[notice,setNotice]=useState(""),[locked,setLocked]=useState(false);
 const pending=useRef(false),live=useRef(false),attempt=useRef(null);
 useEffect(()=>{live.current=true;return()=>{live.current=false;};},[]);
 const permissions=authState?.permissions?.actionPermissions || [];
 const allowed=permissions.includes('inventory.correction.create') && (permissions.includes('attachment.inventory_correction.create') || permissions.includes('attachment.create'));
 async function save(event,capturedFile){event?.preventDefault?.();const chosen=capturedFile||file;if(!allowed||pending.current||(!chosen&&!attempt.current))return;if(capturedFile)setFile(capturedFile);pending.current=true;setBusy(true);setNotice("");
 try {
  if(!attempt.current){
   const input=createInventoryCorrectionEvidenceAttachmentInput({correctionDraftId:draft.id,file:{name:chosen.name,type:chosen.type,size:chosen.size}});
   const error=validateAttachmentUploadInput(input);if(error)throw new Error(error.message);
   const contentDataUrl=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(new Error('文件读取失败，请重新选择。'));reader.readAsDataURL(chosen);});
   if(!live.current)return;
   attempt.current={input:{...input,contentDataUrl,authState},uploadKey:createOfficeIdempotencyKey(),linkKey:createOfficeIdempotencyKey(),attachmentId:null};setLocked(true);
  }
  const current=attempt.current;
  if(!current.attachmentId){const result=await createOfficeAttachment(current.input,{serverRequired:true,idempotencyKey:current.uploadKey});if(!live.current)return;const a=result.attachment;
   if(result.source!=='api'||result.blocked||!a?.attachmentId||a.ownerId!==draft.id||a.ownerType!=='inventory_correction'||a.purpose!=='inventory_correction_evidence'||!a.hasContent)throw new Error(result.error?.message || '上传结果未确认，请按原文件重试。');current.attachmentId=a.attachmentId;
  }
  const linked=await linkOfficeInventoryCorrectionAttachments({authState,correctionDraftId:draft.id,attachmentIds:[current.attachmentId],idempotencyKey:current.linkKey},{serverRequired:true});if(!live.current)return;
  if(linked.source!=='api'||linked.blocked)throw new Error('文件已上传，关联尚未确认。重试将继续关联同一凭证。');
  attempt.current=null;setLocked(false);setFile(null);setNotice('凭证已关联，库存尚未改变。');onUpdated?.();
 }catch(error){if(live.current)setNotice(error.message || '上传未完成，请重试。');}
 finally{pending.current=false;if(live.current)setBusy(false);}
 }
 if(!allowed||draft.status!=='待确认生效')return null;
 return <details><summary>{busy?"凭证处理中":locked?"凭证处理未完成，展开重试":"添加盘点凭证"}</summary><form className="finished-hold-release-form" aria-label={`修正凭证 ${draft.id}`} onSubmit={save}>
 <label>盘点凭证（图片或 PDF）<input type="file" accept="image/*,application/pdf" disabled={busy||locked} onChange={e=>setFile(e.target.files?.[0] || null)}/></label>
 <DocumentCameraCapture disabled={busy||locked} fileNamePrefix="inventory-correction" onCapture={captured=>save(null,captured)}/>
 {file?<p>{file.name}</p>:null}{notice?<p role="status">{notice}</p>:null}
 <button className="secondary-button" disabled={busy||(!file&&!locked)} type="submit">{busy?'正在处理凭证…':locked?'重试当前凭证':'上传并关联凭证'}</button>
 </form></details>;
}
