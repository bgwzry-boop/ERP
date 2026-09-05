import { useEffect, useRef, useState } from "react";
import { CameraOutlined, FileImageOutlined } from "@ant-design/icons";
import { prepareRawMaterialDeliveryNotePages } from "../../../../src/services/rawMaterialDeliveryNoteImageClient.js";
import { prepareRawMaterialCapturePages } from "../../../../src/features/raw-materials/rawMaterialInboundPageActions.js";
import { ReviewDialog } from "./ReviewDialog.jsx";

export function ReceiveDialog({ busy, error, onClose, onPages }) {
  const cameraRef = useRef(null);
  const fileRef = useRef(null);
  const mounted = useRef(true);
  const preparingRef = useRef(false);
  const [pages, setPages] = useState([]);
  const [documentDirectionHint, setDocumentDirectionHint] = useState("supplier_delivery");
  const [preparing, setPreparing] = useState(false);
  const [prepareError, setPrepareError] = useState("");
  const [progress, setProgress] = useState("");
  const [expandedPage, setExpandedPage] = useState(null);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const locked = busy || preparing;
  async function addFiles(event) {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (!files.length || busy || preparingRef.current) return;
    preparingRef.current = true;
    setPreparing(true);
    setPrepareError("");
    try {
      const incoming = await prepareRawMaterialCapturePages({
        files, existingPages: pages, prepareFilePages: prepareRawMaterialDeliveryNotePages,
        onProgress: (message) => { if (mounted.current) setProgress(message); },
      });
      if (mounted.current) setPages((current) => [...current, ...incoming]);
    } catch (failure) {
      if (mounted.current) setPrepareError(failure?.message || "页面读取失败，请重新选择。");
    } finally {
      preparingRef.current = false;
      if (mounted.current) { setPreparing(false); setProgress(""); }
    }
  }
  return <ReviewDialog labelledBy="receive-title" className="receive-dialog capture-dialog" onClose={() => { if (!locked) onClose(); }}>
    <header><div><span>收货录入</span><h2 id="receive-title">选择送货单来源</h2></div><button aria-label="关闭" disabled={locked} onClick={onClose} type="button">×</button></header>
    <p>同一张送货单最多 4 页，请按票面顺序全部添加后再识别。多页会形成一张入库草稿，每页原件分别留档。</p>
    <fieldset className="capture-direction" disabled={locked || pages.length > 0}><legend>单据方向（添加页面后固定）</legend><label><input type="radio" name="capture-direction" checked={documentDirectionHint === "supplier_delivery"} onChange={() => setDocumentDirectionHint("supplier_delivery")} />收货入库</label><label><input type="radio" name="capture-direction" checked={documentDirectionHint === "supplier_return"} onChange={() => setDocumentDirectionHint("supplier_return")} />供应商退货</label></fieldset>
    <div className="source-actions">
      <button disabled={locked || pages.length >= 4} onClick={() => cameraRef.current?.click()} type="button"><CameraOutlined /><span><strong>{pages.length === 1 ? "还有第二页，继续拍" : pages.length ? `继续拍第 ${pages.length + 1} 页` : "直接拍照"}</strong><small>拍完可查看或删除</small></span></button>
      <button disabled={locked || pages.length >= 4} onClick={() => fileRef.current?.click()} type="button"><FileImageOutlined /><span><strong>相册 / PDF</strong><small>支持一次选择多张照片</small></span></button>
    </div>
    <input accept="image/*" aria-label="拍摄送货单页面" capture="environment" hidden onChange={addFiles} ref={cameraRef} type="file" />
    <input accept="image/*,application/pdf" aria-label="选择送货单页面" hidden multiple onChange={addFiles} ref={fileRef} type="file" />
    {pages.length ? <ol className="capture-ready-pages" aria-label="按顺序核对送货单页面">{pages.map((page, index) => <li key={`${page.captureId}:${index}`}>
      <button aria-label={`查看第 ${index + 1} 页`} onClick={() => setExpandedPage(index)} title={page.fileName} type="button"><img alt={`送货单第 ${index + 1} 页缩略图`} src={page.contentDataUrl} /><strong>第 {index + 1} 页</strong></button>
      <button aria-label={`删除第 ${index + 1} 页`} disabled={locked} onClick={() => { setPages((current) => current.filter((_, pageIndex) => pageIndex !== index)); setExpandedPage(null); setPrepareError(""); }} type="button">删除此页</button>
    </li>)}</ol> : null}
    {expandedPage !== null && pages[expandedPage] ? <section className="capture-expanded-page" aria-label={`第 ${expandedPage + 1} 页大图`}><button onClick={() => setExpandedPage(null)} type="button">收起大图</button><img alt={`送货单第 ${expandedPage + 1} 页预览`} src={pages[expandedPage].contentDataUrl} /></section> : null}
    {progress || busy ? <p role="status">{busy ? "正在上传全部页面并识别，请勿重复提交。" : progress}</p> : null}
    {prepareError || error ? <p className="danger-text" role="alert">{prepareError || error}</p> : null}
    <footer className="receipt-dialog-actions"><button disabled={locked} onClick={onClose} type="button">取消</button><button className="primary" disabled={locked || !pages.length} onClick={() => onPages(pages, { documentDirectionHint })} type="button">{busy ? "识别中…" : pages.length > 1 ? `全部 ${pages.length} 页已添加，开始识别` : "没有第二页，开始识别"}</button></footer>
  </ReviewDialog>;
}
