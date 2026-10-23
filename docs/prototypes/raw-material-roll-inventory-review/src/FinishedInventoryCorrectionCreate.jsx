import { FinishedInventoryCorrectionQueue } from "./FinishedInventoryCorrectionQueue.jsx";
import { useEffect, useRef, useState } from "react";
import { createOfficeInventoryCorrectionDraft, inventoryCorrectionReasonOptions } from "../../../../src/services/officeInventoryApiClient.js";
import { createOfficeIdempotencyKey } from "../../../../src/services/officeApiClientCore.js";

export function FinishedInventoryCorrectionCreate(props) {
  return <CorrectionCreate key={`${props.item.id}:${props.authState?.session?.accessToken || ""}`} {...props} />;
}
function CorrectionCreate({item, authState,onConfirmed}) {
  const [open,setOpen]=useState(false), [actual,setActual]=useState(""), [reason,setReason]=useState("");
  const [notice,setNotice]=useState(""), [busy,setBusy]=useState(false), [uncertain,setUncertain]=useState(false);
  const [remark,setRemark]=useState("");
  const [revision,setRevision]=useState(0);
  const pending=useRef(false), frozen=useRef(null), live=useRef(false);
  useEffect(()=>{live.current=true;return()=>{live.current=false;};},[]);
  const allowed=authState?.permissions?.actionPermissions?.includes("inventory.correction.create");
  const expected=item.onHandQty ?? item.inStock;
  const validStock=Number.isSafeInteger(expected) && expected>=0;
  const validActual=/^\d+$/.test(actual) && Number.isSafeInteger(Number(actual));
  async function submit(event) {
    event.preventDefault();
    if(!allowed || pending.current) return;
    if(!frozen.current && (!validStock || !validActual || !inventoryCorrectionReasonOptions.includes(reason))) {setNotice("请填写非负整数实盘数量和修正原因。");return;}
    const payload=frozen.current || {authState,stock:{...item},expectedQty:expected,actualQty:Number(actual),reason:reason.trim(),remark:remark.trim(),idempotencyKey:createOfficeIdempotencyKey()};
    frozen.current=payload;pending.current=true;setBusy(true);setNotice("");
    let result;try{result=await createOfficeInventoryCorrectionDraft(payload,{serverRequired:true});}catch{result={};}
    if(!live.current)return;
    const receipt=result.response;
    const confirmed=result.source==="api" && !result.blocked && receipt?.correctionDraftId && receipt.inventoryItemId===payload.stock.id && receipt.status==="待确认生效" && receipt.qtyBefore?.onHand===payload.expectedQty && receipt.requestedQtyAfter?.onHand===payload.actualQty;
    if(confirmed){setRevision(n=>n+1);setNotice(`已建立修正草稿 ${receipt.correctionDraftId}，库存尚未改变。仍需关联凭证并确认生效。`);setOpen(false);setActual("");setReason("");setRemark("");frozen.current=null;setUncertain(false);}
    else {const code=result.error?.code || "";const unknown=result.source==="api" || !code || /UNAVAILABLE|UNCONFIRMED/.test(code) || Number(result.error?.status)>=500;setUncertain(unknown);if(!unknown)frozen.current=null;setNotice(unknown?"提交结果未确认，请按原内容重试；离开后先核对草稿，勿重复创建。":result.error?.message || "提交失败，输入已保留。");}
    pending.current=false;setBusy(false);
  }
  if(!allowed)return <FinishedInventoryCorrectionQueue authState={authState} onConfirmed={onConfirmed} inventoryItemId={item.id}/>;
  return <><section className="finished-inventory-stock-section" aria-label="发起库存修正">
    <header className="finished-inventory-section-heading"><h3>库存修正</h3>{!open?<button className="secondary-button" disabled={!validStock} onClick={()=>{setOpen(true);setNotice("");}}>发起库存修正</button>:null}</header>
    {!validStock?<p role="alert">系统在库数量不完整，请刷新核对后发起修正。</p>:null}
    {notice?<p role="status">{notice}</p>:null}
    {open?<form className="finished-hold-release-form" onSubmit={submit} aria-label="库存修正草稿">
      <p>系统在库 {expected} 个。提交只建立待确认草稿，不立即改变库存。</p>
      <label>实盘数量（个）<input inputMode="numeric" value={actual} required disabled={busy||uncertain} onChange={e=>setActual(e.target.value)} /></label>
      {validActual?<p>盘点差异：{Number(actual)-expected>0?"+":""}{Number(actual)-expected} 个</p>:null}
      <label>修正原因<select value={reason} required disabled={busy||uncertain} onChange={e=>setReason(e.target.value)}><option value="">请选择原因</option>{inventoryCorrectionReasonOptions.map(value=><option key={value}>{value}</option>)}</select></label><label>补充说明（选填）<textarea value={remark} maxLength={500} disabled={busy||uncertain} onChange={e=>setRemark(e.target.value)}/></label>
      <div className="finished-inventory-section-heading"><button type="submit" className="secondary-button" disabled={busy}>{busy?"正在提交…":uncertain?"按原内容重试":"提交修正草稿"}</button><button type="button" className="secondary-button" disabled={busy||uncertain} onClick={()=>setOpen(false)}>取消</button></div>
    </form>:null}
  </section><FinishedInventoryCorrectionQueue authState={authState} inventoryItemId={item.id} revision={revision} onConfirmed={onConfirmed}/></>;
}
