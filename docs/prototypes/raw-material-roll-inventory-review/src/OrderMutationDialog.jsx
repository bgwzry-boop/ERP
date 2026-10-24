import { useEffect, useRef, useState } from "react";
import { getOfficeOrderLineDetail, previewOfficeOrderQuantity, adjustOfficeOrderLineQuantity, voidOfficeOrderLine } from "../../../../src/services/officeOrderPoolApiClient.js";
import { createOfficeIdempotencyKey } from "../../../../src/services/officeApiClientCore.js";
import { ReviewDialog } from "./ReviewDialog.jsx";
import { financeSessionKey, hasFinancePermission, money } from "./finance-dialog-model.js";
import "./finance-dialogs.css";

export function OrderMutationDialog(props) {
  return <MutationForm key={financeSessionKey(props.orderLineId, props.authState)} {...props} />;
}
function MutationForm({orderLineId,authState,onClose,onSaved}) {
  const [detail,setDetail]=useState(null),[mode,setMode]=useState("quantity"),[qty,setQty]=useState(""),[reason,setReason]=useState("");
  const [error,setError]=useState(""),[busy,setBusy]=useState(false),[review,setReview]=useState(null),[uncertain,setUncertain]=useState(false),[done,setDone]=useState("");
  const live=useRef(false),pending=useRef(false),attempt=useRef(null),generation=useRef(0),uncertainRef=useRef(false);
  async function load() {
    const token=++generation.current;
    setBusy(true);setError("");
    const value=await getOfficeOrderLineDetail({authState,orderLineId},{serverRequired:true});
    if (!live.current || token!==generation.current)return;
    if(value.source==="api" && value.detail?.orderLine?.id===orderLineId) setDetail(value.detail);
    else setError(value.error?.message || "订单详情未读取完整，请重试。");
    setBusy(false);
  }
  useEffect(()=>{live.current=true;void load();return()=>{live.current=false;generation.current++;};},[]);
  const line=detail?.orderLine;
  const allowed=hasFinancePermission(authState,mode==="quantity"?"order.quantity.adjust":"order.void");
  const locked=busy||Boolean(review)||uncertain;
  async function prepare(event) {
    event.preventDefault();if(pending.current||!allowed||!line)return;
    if(!reason.trim() || !Number.isSafeInteger(line.revision)) {setError("请填写原因，并重新读取有效订单版本。");return;}
    if(mode==="quantity" && (!/^\d+$/.test(qty)||!Number.isSafeInteger(Number(qty))||Number(qty)<=0||Number(qty)===line.qty)) {setError("请填写与原数量不同的正整数。");return;}
    pending.current=true;setBusy(true);setError("");
    let quote;
    if(mode==="quantity") {
      quote=await previewOfficeOrderQuantity({authState,orderLineId,newQty:Number(qty),expectedRevision:line.revision},{serverRequired:true});
      if(!live.current)return;
      if(quote.source!=="api"||quote.blocked||quote.previousQty!==line.qty){setError(quote.error?.message||"无法核对改量金额。");pending.current=false;setBusy(false);return;}
    }
    attempt.current={authState,orderLineId,expectedRevision:line.revision,newQty:Number(qty),expectedFinalAmount:quote?.finalAmount,reason:"other",reasonText:reason.trim(),idempotencyKey:createOfficeIdempotencyKey()};
    setReview({mode,line:{...structuredClone(line),amount:quote?.previousAmount??line.amount},finalAmount:quote?.finalAmount,newQty:Number(qty),reason:reason.trim()});
    pending.current=false;setBusy(false);
  }
  async function submit() {
    if(pending.current||!review||!attempt.current||!allowed)return;
    pending.current=true;setBusy(true);setError("");
    let result;
    try{result=await (review.mode==="quantity"?adjustOfficeOrderLineQuantity:voidOfficeOrderLine)(attempt.current,{serverRequired:true});}catch{result=null;}
    if(!live.current)return;
    pending.current=false;setBusy(false);
    if(result?.source==="api"&&!result.blocked&&result.orderLineId===orderLineId&&result.operationLogId) {
      uncertainRef.current=false;setUncertain(false);attempt.current=null;setReview(null);setDone(review.mode==="quantity"?`已改为 ${review.newQty} 个；服务器金额 ${money(result.finalAmount)}。`:"本条订单明细已作废；原记录和变更依据保留。");
      try{const refreshed=await onSaved?.();if(refreshed?.source==="api_partial")setError("操作已保存，但部分列表未刷新，请重新读取服务器数据核对。");}catch{setError("操作已保存，但列表刷新失败，请刷新服务器数据核对。");}
    } else {
      const code=result?.error?.code || "";
      const unknown=!code||result?.source==="api"||/UNAVAILABLE|UNCONFIRMED|TIMEOUT/.test(code)||Number(result?.error?.status)>=500;
      uncertainRef.current ||= unknown;
      setUncertain(uncertainRef.current);
      setError(uncertainRef.current?"结果尚未确认，内容已锁定，请按原请求重试。离开后先核对订单与变更记录。":result.error?.message||"操作被拒绝，输入已保留，请重新读取订单核对。");
      if(!uncertainRef.current) {attempt.current=null;setReview(null);}
    }
  }
  function close(){if(!busy&&!uncertain)onClose?.();}
  function dismiss(){if(busy||uncertain)return;if(review){setReview(null);attempt.current=null;setError("");return;}close();}
  return <ReviewDialog className="finance-dialog" labelledBy="order-mutation-title" onClose={dismiss}>
    <header><div><span>{line?.customerName || "订单明细"} · {orderLineId}</span><h2 id="order-mutation-title">订单变更</h2></div><button aria-label="关闭订单变更" disabled={busy||uncertain} onClick={close}>×</button></header>
    <div className="finance-dialog-content">
      {line?<dl className="finance-summary"><div><dt>货品 / 规格</dt><dd>{line.product} · {line.size} · {line.color || line.bagColor} · {line.handle || line.handleType}</dd></div><div><dt>原数量</dt><dd>{line.qty} 个</dd></div><div><dt>原金额</dt><dd>{money(line.amount)}</dd></div><div><dt>状态</dt><dd>{line.status}</dd></div></dl>:<p role="status">正在读取订单事实…</p>}
      {done?<p className="finance-notice" role="status">{done}</p>:<form onSubmit={prepare}>
        <fieldset disabled={locked||!line}><div className="finance-form-grid"><label>变更动作<select value={mode} onChange={e=>setMode(e.target.value)}><option value="quantity">修改数量</option><option value="void">作废本条明细</option></select></label>{mode==="quantity"?<label>新数量（个）<input aria-label="订单新数量" inputMode="numeric" value={qty} onChange={e=>setQty(e.target.value)} required/></label>:null}<label className="finance-span">变更原因<textarea value={reason} onChange={e=>setReason(e.target.value)} maxLength={500} required/></label></div></fieldset>
        {!allowed?<p>当前账号没有{mode==="quantity"?"改量":"作废"}权限。</p>:null}
        {review?<section className="finance-confirm" aria-label="订单变更最终核对"><h3>确认{review.mode==="quantity"?"改量":"作废本条明细"}</h3><p>{review.line.customerName} · {review.line.product} · {review.line.size} · {review.line.color || review.line.bagColor} · {review.line.handle || review.line.handleType}</p><dl><div><dt>原数量</dt><dd>{review.line.qty} 个</dd></div><div><dt>变更后</dt><dd>{review.mode==="quantity"?`${review.newQty} 个`:"本条已关闭"}</dd></div><div><dt>原金额</dt><dd>{money(review.line.amount)}</dd></div>{review.mode==="quantity"?<div><dt>服务器预览金额</dt><dd>{money(review.finalAmount)}</dd></div>:null}</dl><p>{review.reason}</p><p>同步处理相关占用、交付任务和未结账金额；未开工任务同步改量，原排产退回待排产重新确认；作废时关闭未执行任务。保留变更与审计记录。已实际生产或出库的记录由服务器阻止直接修改。旧纸单须核对作废并重新打印。</p><div className="finance-actions"><button type="button" disabled={busy||uncertain} onClick={()=>{setReview(null);attempt.current=null;setError("");}}>返回修改</button><button type="button" className="primary" disabled={busy||!allowed} onClick={submit}>{busy?"正在保存…":uncertain?"按原请求重试":"确认变更"}</button></div></section>:<div className="finance-actions"><button type="button" disabled={busy} onClick={()=>void load()}>重新读取订单</button><button type="submit" disabled={busy||!allowed||!line} className="primary">核对变更</button></div>}
      </form>}
      {error?<p className="finance-error" role="alert">{error}</p>:null}
      {done?<details><summary>订单变更回查</summary><button onClick={()=>void load()} disabled={busy}>读取当前订单</button><p>{line?.status} · {line?.qty} 个 · {money(line?.amount)}</p></details>:null}
    </div><footer><button disabled={busy||uncertain} onClick={close}>关闭</button></footer>
  </ReviewDialog>;
}
