import {normalizeInventoryHoldTimestamp} from "../../../../shared/inventoryHoldTime.js";
import {CorrectionConfirm} from "./CorrectionConfirm.jsx";
import {CorrectionEvidencePreview} from "./CorrectionEvidencePreview.jsx";
import {FinishedInventoryCorrectionEvidence} from "./FinishedInventoryCorrectionEvidence.jsx";
import {useEffect,useState} from "react";
import {listOfficeInventoryCorrectionDrafts} from "../../../../src/services/officeInventoryApiClient.js";

const auditTime = new Intl.DateTimeFormat('zh-CN',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
function formatAuditTime(value){const valid=normalizeInventoryHoldTimestamp(value);return valid?auditTime.format(new Date(valid))+'（北京时间）':'时间未记录';}

export function FinishedInventoryCorrectionQueue({authState,inventoryItemId,revision=0,onConfirmed}) {
  return <Queue key={`${inventoryItemId}:${authState?.session?.accessToken || ""}`} authState={authState} inventoryItemId={inventoryItemId} revision={revision} onConfirmed={onConfirmed}/>;
}
function Queue({authState,inventoryItemId,revision,onConfirmed}) {
  const [page,setPage]=useState(1),[refresh,setRefresh]=useState(0),[result,setResult]=useState(null);
  useEffect(()=>{
    let active=true;setResult(null);
    listOfficeInventoryCorrectionDrafts({authState,page,pageSize:5,filters:{inventoryItemId,status:"全部"}},{serverRequired:true}).then(value=>{
      if(!active)return;
      if(value.source!=="api" || value.blocked || !Array.isArray(value.items) || value.page!==page || value.pageSize!==5 || !Number.isSafeInteger(value.total) || value.total<0 || value.items.length>5 || value.total<value.items.length || new Set(value.items.map(item=>item.id)).size!==value.items.length || value.items.some(item=>!item.id || item.inventoryItemId!==inventoryItemId)) throw new Error();
      setResult(value);
    }).catch(()=>{if(active)setResult({error:true});});
    return()=>{active=false;};
  },[page,refresh,revision,authState,inventoryItemId]);
  return <section className="finished-inventory-stock-section" aria-label="当前库存修正记录">
    <header className="finished-inventory-section-heading"><h3>修正记录</h3><button className="secondary-button" onClick={()=>setRefresh(n=>n+1)}>刷新记录</button></header>
    {!result?<p role="status">正在读取修正记录…</p>:result.error?<p role="alert">修正记录读取失败，请刷新重试。</p>:<>
      {!result.items.length?<p>当前页暂无修正记录</p>:result.items.map(item=><article key={item.id}>
        <h4>{item.id} · {item.status}</h4><p>系统 {item.systemQty} 个 → 实盘 {item.actualQty} 个（差异 {item.diff>0?"+":""}{item.diff} 个）</p>
        <p>原因：{item.reason || "待核对"}{item.remark && item.remark!==item.reason?`；${item.remark}`:""}</p>
        <details><summary>经办与确认记录</summary><p>发起人：{item.operatorName || item.operatorId || "未记录"} · {formatAuditTime(item.createdAt)}</p>{item.status==="已确认生效"?<p>确认人：{item.confirmedByName || item.confirmedBy || "未记录"} · {formatAuditTime(item.confirmedAt)}</p>:<p>尚未确认生效</p>}</details>
        <p>凭证 {item.attachmentIds.length} 份{item.status==="待确认生效"?" · 尚未改变库存":""}</p>
      <CorrectionEvidencePreview authState={authState} attachmentIds={item.attachmentIds}/><FinishedInventoryCorrectionEvidence draft={item} authState={authState} onUpdated={()=>setRefresh(n=>n+1)}/>
      <CorrectionConfirm draft={item} authState={authState} onConfirmed={async()=>{await onConfirmed?.();setRefresh(n=>n+1);}}/>
      </article>)}
      <div className="finished-inventory-section-heading"><button className="secondary-button" disabled={page===1} onClick={()=>setPage(n=>n-1)}>上一页修正</button><span>第 {page} 页 · 共 {result.total} 条</span><button className="secondary-button" disabled={page*5>=result.total} onClick={()=>setPage(n=>n+1)}>下一页修正</button></div>
    </>}
  </section>;
}
