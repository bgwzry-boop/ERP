import {useEffect,useRef,useState} from 'react';
import {confirmOfficeInventoryCorrectionDraft} from '../../../../src/services/officeInventoryApiClient.js';
import {createOfficeIdempotencyKey} from '../../../../src/services/officeApiClientCore.js';
export function CorrectionConfirm({draft,authState,onConfirmed}) {
 const [open,setOpen]=useState(false),[reason,setReason]=useState(''),[busy,setBusy]=useState(false),[notice,setNotice]=useState(''),[uncertain,setUncertain]=useState(false);
 const [completed,setCompleted]=useState(false);
 const live=useRef(false),pending=useRef(false),frozen=useRef(null);
 useEffect(()=>{live.current=true;return()=>{live.current=false;};},[]);
 const allowed=authState?.permissions?.actionPermissions?.includes('inventory.correction.confirm');
 async function confirm(event){event.preventDefault();if(completed||!allowed||pending.current||!draft.attachmentIds.length)return;if(!frozen.current&&!reason.trim())return;
 frozen.current ||= {authState,correctionDraftId:draft.id,approvalReason:reason.trim(),idempotencyKey:createOfficeIdempotencyKey()};pending.current=true;setBusy(true);setNotice('');
 let result;try{result=await confirmOfficeInventoryCorrectionDraft(frozen.current,{serverRequired:true});}catch{result={};}if(!live.current)return;
 if(result.source==='api'&&!result.blocked&&result.confirmation?.inventoryItemId===draft.inventoryItemId&&result.confirmation.actualQty===draft.actualQty){setCompleted(true);frozen.current=null;setOpen(false);setUncertain(false);setNotice('修正已生效，正在刷新库存。');try{await onConfirmed?.();if(live.current)setNotice('修正已生效。');}catch{if(live.current)setNotice('修正已生效，刷新失败，请手动刷新库存和流水。');}}
 else{const code=result.error?.code||'';const unknown=!code||/UNAVAILABLE|UNCONFIRMED/.test(code)||result.source==='api'||Number(result.error?.status)>=500;setUncertain(unknown);if(!unknown)frozen.current=null;setNotice(unknown?'确认结果未明确，请按原内容重试，勿重新发起修正。':result.error?.message||'确认失败，请刷新核对。');}
 pending.current=false;if(live.current)setBusy(false);
 }
 if(completed)return <p role="status">{notice || '修正已生效，请刷新核对库存。'}</p>;
 if(!allowed||draft.status!=='待确认生效')return null;
 return <div>{notice?<p role="status">{notice}</p>:null}{!open?<><button className="secondary-button" disabled={!draft.attachmentIds.length} onClick={()=>setOpen(true)}>确认库存修正</button>{!draft.attachmentIds.length?<p>请先上传并关联盘点凭证。</p>:null}</>:<form className="finished-hold-release-form" aria-label="确认库存修正生效" onSubmit={confirm}>
 <strong>在库数量将从 {draft.systemQty} 改为 {draft.actualQty} 个</strong><p>请核对上方凭证与实盘差异。确认后写入库存流水并完成修正待办。</p>
 <label>确认依据<textarea required maxLength={500} disabled={busy||uncertain} value={reason} onChange={e=>setReason(e.target.value)}/></label>
 <button className="primary" disabled={busy} type="submit">{busy?'正在确认…':uncertain?'按原内容重试确认':'确认生效'}</button><button className="secondary-button" type="button" disabled={busy||uncertain} onClick={()=>setOpen(false)}>取消确认</button></form>}</div>;
}
