import {useEffect,useState} from "react";
import {downloadOfficeAttachmentContent} from "../../../../src/services/officeAttachmentApiClient.js";
export function CorrectionEvidencePreview({authState,attachmentIds,label="盘点凭证"}) {
 const [selected,setSelected]=useState('');
 return <div>{attachmentIds.map((id,index)=><button type="button" className="secondary-button" key={id} onClick={()=>setSelected(id)}>{label === "盘点凭证" ? "查看凭证" : `查看${label}`} {index+1}</button>)}
 {selected && attachmentIds.includes(selected)?<Preview key={`${selected}:${authState?.session?.accessToken||''}`} authState={authState} label={label} attachmentId={selected} onClose={()=>setSelected('')}/>:null}</div>;
}
function Preview({authState,attachmentId,onClose,label}) {
 const [result,setResult]=useState(null),[retry,setRetry]=useState(0);
 useEffect(()=>{const controller=new AbortController();let url='';setResult(null);
 downloadOfficeAttachmentContent({authState,attachmentId},{serverRequired:true,signal:controller.signal}).then(value=>{
  if(controller.signal.aborted)return;
  const type=String(value.contentType||'').split(';')[0];
  if(value.source!=='api'||value.blocked||!value.contentBlob?.size||!/^image\/(png|jpeg|jpg|webp|gif|bmp)$|^application\/pdf$/.test(type)) {setResult({error:'凭证读取失败或格式不支持，请重试。'});return;}
  url=URL.createObjectURL(value.contentBlob);setResult({url,type});
 }).catch(()=>{if(!controller.signal.aborted)setResult({error:'凭证读取失败，请重试。'});});
 return()=>{controller.abort();if(url)URL.revokeObjectURL(url);};},[attachmentId,authState,retry]);
 return <section className="receipt-source-preview" aria-label={label === "盘点凭证" ? "库存修正凭证预览" : `${label}预览`}><header><strong>{label}</strong><button type="button" onClick={onClose}>关闭凭证</button></header>
 {!result?<p role="status">正在读取凭证…</p>:result.error?<p role="alert">{result.error}<button type="button" onClick={()=>setRetry(n=>n+1)}>重试读取凭证</button></p>:<><div className="receipt-source-image">{result.type==='application/pdf'?<object aria-label={`${label} PDF`} data={result.url} type="application/pdf"><a href={result.url} target="_blank" rel="noreferrer">打开 PDF</a></object>:<img alt={`${label}原图`} src={result.url} onError={()=>setResult({error:'凭证图片无法解码，请重试。'})}/>}</div><a href={result.url} target="_blank" rel="noreferrer">单独打开凭证原件</a></>}
 </section>;
}
