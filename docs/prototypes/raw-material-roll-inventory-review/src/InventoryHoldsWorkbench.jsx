import {useEffect,useRef,useState} from "react";
import {listOfficeInventoryIntents,listOfficeTemporaryInventoryHolds,createOfficeTemporaryInventoryHold,extendOfficeTemporaryInventoryHold,releaseOfficeTemporaryInventoryHold} from "../../../../src/services/officeInventoryApiClient.js";
import {recognizeOfficeDraft} from "../../../../src/services/officeOrderApiClient.js";
import {createOfficeIdempotencyKey} from "../../../../src/services/officeApiClientCore.js";
import {resolveTemporaryHoldCandidate,toShanghaiExpiryIso,formatInventoryLedgerTime} from "../../../../src/domain/inventoryHoldPresentation.js";
import {ReviewDialog} from "./ReviewDialog.jsx";
import {financeSessionKey,hasFinancePermission} from "./finance-dialog-model.js";
import "./finance-dialogs.css";
import "./inventory-holds.css";
const opts={serverRequired:true};
const matches=(item,candidate)=>item.size===candidate.size&&(item.color??item.bagColor)===(candidate.color??candidate.bagColor)&&(!candidate.handle&&!candidate.handleType||(item.handle??item.handleType)===(candidate.handle??candidate.handleType))&&(!candidate.style||item.style===candidate.style);
export function InventoryHoldsWorkbench(props){return <HoldsForm key={financeSessionKey(props.item.id,props.formal.authState)} {...props}/>;}
function HoldsForm({item,formal,onNavigate}) {
  const authState=formal.authState;
  const [rows,setRows]=useState([]),[intents,setIntents]=useState([]),[loading,setLoading]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(""),[notice,setNotice]=useState("");
  const [selected,setSelected]=useState(null),[expiry,setExpiry]=useState(""),[reason,setReason]=useState(""),[review,setReview]=useState(null),[uncertain,setUncertain]=useState(false);
  const live=useRef(false),pending=useRef(false),attempt=useRef(null),version=useRef(0),uncertainRef=useRef(false);
  const createAllowed=hasFinancePermission(authState,"inventory.reservation.create"),releaseAllowed=hasFinancePermission(authState,"inventory.reservation.release"),convertAllowed=hasFinancePermission(authState,"order.draft.recognize");
  async function refresh(){
    const generation=++version.current;setLoading(true);setError("");
    const [a,b]=await Promise.all([listOfficeTemporaryInventoryHolds({authState,filters:{inventoryItemId:item.id}},opts),listOfficeInventoryIntents({authState,filters:{intentType:"temporary_hold"}},opts)]);
    if(!live.current||generation!==version.current)return;
    if(a.source==="api"&&b.source==="api") {
      setRows(a.items);
      setIntents(b.items.flatMap(intent=>(intent.candidate?.parsedCandidates||[]).map((candidate,candidateIndex)=>({intent,candidate,candidateIndex}))).filter(row=>!row.intent.relatedReservationId&&matches(item,row.candidate)));
    } else setError(a.error?.message||b.error?.message||"留货记录未读取完整，请重试。");
    setLoading(false);
  }
  useEffect(()=>{live.current=true;void refresh();return()=>{live.current=false;version.current++;};},[]);
  function choose(kind,value){setSelected({kind,...value});setExpiry("");setReason("");setError("");setNotice("");}
  function prepare(event){
    event.preventDefault();if(!selected||pending.current)return;
    const {kind,hold,intent,candidate,candidateIndex}=selected;
    if(kind!=="convert"&&!reason.trim()){setError("请填写实际原因。");return;}
    const expiresAt=toShanghaiExpiryIso(expiry);
    if(["create","extend"].includes(kind)&&(!expiresAt||Date.parse(expiresAt)<=Date.now()||(kind==="extend"&&Date.parse(expiresAt)<=Date.parse(hold.expiresAt)))){setError("请选择有效的工厂时间；续期须晚于原到期时间。");return;}
    const qty=Number(hold?.reservedQty??candidate?.qty);
    if(!Number.isSafeInteger(qty)||qty<=0){setError("留货数量不完整，请重新读取申请。");return;}
    const currentIntent=intent||hold.intent;
    if(!Number.isSafeInteger(currentIntent?.revision)){setError("来源申请版本缺失，请重新读取。");return;}
    const payload={authState,expectedRevision:currentIntent.revision,reason:reason.trim(),idempotencyKey:createOfficeIdempotencyKey()};
    if(kind==="create")Object.assign(payload,{intentId:currentIntent.id??currentIntent.intentId,candidateIndex,inventoryItemId:item.id,qty,expiresAt});
    else Object.assign(payload,{holdId:hold.reservationId??hold.id,expiresAt});
    if(kind==="convert") {
      if(!currentIntent.customerId||!candidate){setError("留货客户或货品资料缺失，请核对原申请。");return;}
      const sourceText=["我要",candidate.product||candidate.productName||"空白袋",candidate.size,candidate.color||candidate.bagColor,candidate.handle||candidate.handleType,candidate.style,`${qty}个`].filter(Boolean).join(" ");
      Object.assign(payload,{sourceText,customerId:currentIntent.customerId,sourceHoldId:hold.reservationId??hold.id,sourceIntentId:currentIntent.id??currentIntent.intentId,sourceMessages:[],inventories:[item]});
    }
    attempt.current={kind,payload};
    setReview({kind,qty,customer:currentIntent.customerName||hold?.customerName||currentIntent.customerId,expiresAt,oldExpiry:hold?.expiresAt,reason:reason.trim()});
  }
  async function submit(){
    if(!attempt.current||pending.current)return;
    pending.current=true;setBusy(true);setError("");
    const {kind,payload}=attempt.current;let value;
    try{const method={create:createOfficeTemporaryInventoryHold,extend:extendOfficeTemporaryInventoryHold,release:releaseOfficeTemporaryInventoryHold,convert:recognizeOfficeDraft}[kind];value=await method(payload,opts);}catch{value=null;}
    if(!live.current)return;
    const draftId=value?.draft?.draftId??value?.draft?.id;
    const valid=value?.source==="api"&&!value.blocked&&value.operationLogId&&(kind!=="convert"||draftId&&value.rows?.length===1&&value.rows[0].sourceHoldId===payload.sourceHoldId&&value.rows[0].sourceIntentId===payload.sourceIntentId);
    if(valid){
      setReview(null);attempt.current=null;uncertainRef.current=false;setUncertain(false);setSelected(null);setNotice(kind==="convert"?"已建立关联订单草稿，确认正式订单后才转换原占用，不会重复留货。":"服务器已保存留货操作。");
      try{
        await refresh();
        if(!live.current)return;
        await formal.actions.refreshAll();
        if(!live.current)return;
        if(kind==="convert"){formal.actions.focusOrderDraft(draftId);onNavigate("order-entry");}
      }catch{if(live.current)setError("操作已保存，列表刷新未完成，请核对服务器记录后继续。");}
      finally{if(live.current){pending.current=false;setBusy(false);}}
    }else{
      pending.current=false;setBusy(false);
      const code=value?.error?.code||"";const unknown=!code||value?.source==="api"||/UNAVAILABLE|UNCONFIRMED|TIMEOUT/.test(code)||Number(value?.error?.status)>=500;
      uncertainRef.current ||= unknown;setUncertain(uncertainRef.current);setError(uncertainRef.current?"结果未确认，原请求已保留，请按原内容重试；不要另建同一留货。":value.error?.message||"留货操作未保存，输入已保留，请重新读取后核对。");
      if(!uncertainRef.current){setReview(null);attempt.current=null;}
    }
  }
  const labels={create:"创建留货",extend:"延长留货",release:"释放留货",convert:"转入订单草稿"};
  return <section className="inventory-holds-workbench" aria-label="留货与转单">
    <header className="finished-inventory-section-heading"><h3>留货与转单</h3><button className="secondary-button" type="button" onClick={()=>void refresh()} disabled={loading||busy||Boolean(review)}>刷新留货</button></header>
    {loading?<p role="status">正在读取留货申请与占用…</p>:null}
    {intents.length?<><h4>待处理留货申请</h4>{intents.map(row=><div className="hold-record" key={`${row.intent.id}:${row.candidateIndex}`}><strong>{row.intent.customerName||row.intent.customerId} · {row.candidate.qty} 个</strong><p>{row.intent.sourceText}</p><button className="secondary-button" disabled={!createAllowed||busy||Boolean(review)} onClick={()=>choose("create",row)}>核对并留货</button></div>)}</>:null}
    <h4>本库存的留货记录</h4>
    {rows.length?rows.map(hold=><div className="hold-record" key={hold.reservationId??hold.id}><strong>{hold.customerName||hold.customerId} · {hold.reservedQty} 个 · {hold.status}</strong><p>到期：{formatInventoryLedgerTime(hold.expiresAt)}</p>{hold.status==="生效"?<div className="hold-record-actions"><button disabled={!createAllowed||busy||Boolean(review)} onClick={()=>choose("extend",{hold})}>续期</button><button disabled={!releaseAllowed||busy||Boolean(review)} onClick={()=>choose("release",{hold})}>释放</button><button disabled={!convertAllowed||busy||Boolean(review)} onClick={()=>choose("convert",{hold,candidate:resolveTemporaryHoldCandidate(hold)})}>转订单草稿</button></div>:null}</div>):!loading?<p>本库存暂无留货。客户询价不占库存；明确留货申请经办公室核对后才建立占用。</p>:null}
    {selected?<form className="hold-edit-form" onSubmit={prepare}><h4>{labels[selected.kind]}</h4>{["create","extend"].includes(selected.kind)?<label>到期时间（中国工厂时间）<input aria-label="留货到期时间" type="datetime-local" value={expiry} required onChange={e=>setExpiry(e.target.value)} disabled={Boolean(review)||busy}/></label>:null}{selected.kind!=="convert"?<label>实际原因<textarea aria-label="留货操作原因" maxLength={500} value={reason} required onChange={e=>setReason(e.target.value)} disabled={Boolean(review)||busy}/></label>:<p>只建立关联草稿；仍须在订单录入核对价格、保存并确认正式订单。</p>}<div className="hold-record-actions"><button type="button" disabled={Boolean(review)||busy} onClick={()=>setSelected(null)}>取消</button><button className="primary" type="submit" disabled={Boolean(review)||busy}>核对{labels[selected.kind]}</button></div></form>:null}
    {notice?<p role="status">{notice}</p>:null}{error?<p role="alert" className="finance-error">{error}</p>:null}
    {review?<ReviewDialog className="finance-dialog" labelledBy="hold-review-title" onClose={()=>{if(!busy&&!uncertain){setReview(null);attempt.current=null;}}}><header><h2 id="hold-review-title">确认{labels[review.kind]}</h2></header><div className="finance-dialog-content"><p>{review.customer} · {item.size} · {item.color} · {item.handle??item.handleType}</p><dl className="finance-summary"><div><dt>数量</dt><dd>{review.qty} 个</dd></div>{review.oldExpiry?<div><dt>原到期</dt><dd>{formatInventoryLedgerTime(review.oldExpiry)}</dd></div>:null}{review.expiresAt?<div><dt>新到期</dt><dd>{formatInventoryLedgerTime(review.expiresAt)}</dd></div>:null}</dl>{review.reason?<p>{review.reason}</p>:null}<p>{review.kind==="create"?"保存后占用本库存的对应数量，在库总数不变，可用数量减少。":review.kind==="release"?"释放本笔仍有效的占用，恢复可用数量；不影响其他客户的留货。":review.kind==="extend"?"仅延长本笔留货期限，不增加占用数量。":"仅建立订单草稿；确认正式订单时转换原占用，不重复扣库存。"} 操作保留人员、时间与依据。</p>{error?<p className="finance-error" role="alert">{error}</p>:null}</div><footer><button disabled={busy||uncertain} onClick={()=>{setReview(null);attempt.current=null;}}>返回修改</button><button className="primary" disabled={busy} onClick={submit}>{busy?"正在保存…":uncertain?"按原内容重试":"确认操作"}</button></footer></ReviewDialog>:null}
  </section>;
}
