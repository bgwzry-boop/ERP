import { useEffect, useMemo, useRef, useState } from "react";
import { CameraOutlined, CloseOutlined, FileImageOutlined } from "@ant-design/icons";
import { listRawMaterialCaptureSupplierOptions } from "../../../shared/rawMaterialSupplierProfiles.js";
import { prepareRawMaterialDeliveryNotePages } from "../../services/rawMaterialDeliveryNoteImageClient.js";
import { DeliveryNoteCameraCapture } from "./DeliveryNoteCameraCapture.jsx";
import { prepareRawMaterialCapturePages, RAW_MATERIAL_DELIVERY_NOTE_MAX_PAGES } from "./rawMaterialInboundPageActions.js";
import "./raw-material-receive-dialog.css";

export function RawMaterialReceiveDialog({ busy = false, error = "", inbounds = [], onClose, onRecognize }) {
  const fileRef = useRef(null);
  const dialogRef = useRef(null);
  const operationRef = useRef(false);
  const mountedRef = useRef(false);
  const [pages, setPages] = useState([]);
  const [preparing, setPreparing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [localError, setLocalError] = useState("");
  const [progress, setProgress] = useState("");
  const [direction, setDirection] = useState("supplier_delivery");
  const [supplier, setSupplier] = useState("");
  const [cameraOpen, setCameraOpen] = useState(false);
  const [previewIndex, setPreviewIndex] = useState(null);
  const locked = busy || preparing || submitting;
  const isReturn = direction === "supplier_return";
  const supplierRequired = isReturn && !supplier;
  const full = pages.length >= RAW_MATERIAL_DELIVERY_NOTE_MAX_PAGES;
  const supplierOptions = useMemo(() => [...new Set([
    ...listRawMaterialCaptureSupplierOptions(),
    ...inbounds.map(item => String(item?.supplierName || "").trim()).filter(Boolean),
  ])].sort((a, b) => a.localeCompare(b, "zh-CN")), [inbounds]);

  useEffect(() => {
    mountedRef.current = true;
    const previous = document.activeElement;
    dialogRef.current?.querySelector("button")?.focus();
    return () => {
      mountedRef.current = false;
      if (previous?.isConnected) previous.focus();
    };
  }, []);

  function close() {
    if (!operationRef.current && !locked) onClose?.();
  }

  function handleKeyDown(event) {
    if (cameraOpen) return; // The camera owns its close/keyboard lifecycle.
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      if (previewIndex !== null) setPreviewIndex(null); else close();
    }
    if (event.key !== "Tab") return;
    const surface = previewIndex !== null ? dialogRef.current?.querySelector(".raw-material-receive-preview") : dialogRef.current;
    const controls = [...(surface?.querySelectorAll('button:not(:disabled), select:not(:disabled), input:not(:disabled), [tabindex="0"]') || [])]
      .filter(element => element.getClientRects().length);
    if (!controls.length) { event.preventDefault(); return; }
    const first = controls[0], last = controls.at(-1);
    if (event.shiftKey && (document.activeElement === first || !surface.contains(document.activeElement))) {
      event.preventDefault(); last.focus();
    } else if (!event.shiftKey && (document.activeElement === last || !surface.contains(document.activeElement))) {
      event.preventDefault(); first.focus();
    }
  }

  async function addFiles(files) {
    if (!files.length || operationRef.current || locked || supplierRequired) return;
    operationRef.current = true;
    setPreparing(true);
    setLocalError("");
    try {
      const prepared = await prepareRawMaterialCapturePages({
        files,
        existingPages: pages,
        prepareFilePages: prepareRawMaterialDeliveryNotePages,
        onProgress: message => { if (mountedRef.current) setProgress(message); },
      });
      if (mountedRef.current) setPages(current => [...current, ...prepared]);
    } catch (failure) {
      if (mountedRef.current) setLocalError(failure?.message || "文件读取失败，请重新选择。");
    } finally {
      operationRef.current = false;
      if (mountedRef.current) { setPreparing(false); setProgress(""); }
    }
  }

  async function recognize() {
    if (!pages.length || supplierRequired || operationRef.current || locked) return;
    operationRef.current = true;
    setSubmitting(true);
    setLocalError("");
    setProgress("正在保存原图…");
    try {
      await onRecognize?.({
        pages,
        documentDirectionHint: direction,
        supplierNameHint: supplier,
        onProgress: value => { if (mountedRef.current) setProgress(value?.message || "正在识别…"); },
      });
    } catch (failure) {
      if (mountedRef.current) setLocalError(failure?.message || "识别失败，页面已保留，请重试。");
    } finally {
      operationRef.current = false;
      if (mountedRef.current) { setSubmitting(false); setProgress(""); }
    }
  }

  function removePage(index) {
    if (operationRef.current || locked) return;
    setPages(current => current.filter((_, pageIndex) => pageIndex !== index));
    setLocalError("");
  }

  return <div className="raw-material-receive-backdrop" onKeyDown={handleKeyDown} onMouseDown={event => { if (event.target === event.currentTarget) close(); }} role="presentation">
    <section aria-busy={locked} aria-labelledby="raw-material-receive-title" aria-modal="true" className="raw-material-receive-dialog" ref={dialogRef} role="dialog">
      <header>
        <h2 id="raw-material-receive-title">录入送货 / 原料退货单</h2>
        <button aria-label="关闭录单" className="raw-material-receive-close" disabled={locked} onClick={close} type="button"><CloseOutlined aria-hidden="true" /></button>
      </header>
      <div className="raw-material-receive-body">
        <div aria-label="单据方向" className="raw-material-receive-direction" role="group">
          <button aria-pressed={!isReturn} disabled={locked || pages.length > 0} onClick={() => setDirection("supplier_delivery")} type="button">送货单</button>
          <button aria-pressed={isReturn} disabled={locked || pages.length > 0} onClick={() => setDirection("supplier_return")} type="button">原料退货单</button>
        </div>
        {isReturn ? <label className="raw-material-receive-supplier"><span>退给哪家供应商</span><select aria-label="退货供应商" disabled={locked || pages.length > 0} onChange={event => setSupplier(event.target.value)} required value={supplier}><option value="">请选择供应商</option>{supplierOptions.map(name => <option key={name} value={name}>{name}</option>)}</select></label> : null}
        <div className="raw-material-receive-sources">
          <button disabled={locked || full || supplierRequired} onClick={() => setCameraOpen(true)} type="button"><CameraOutlined aria-hidden="true" />摄像头 / 高拍仪</button>
          <button disabled={locked || full || supplierRequired} onClick={() => fileRef.current?.click()} type="button"><FileImageOutlined aria-hidden="true" />上传照片 / PDF</button>
        </div>
        <input accept="image/png,image/jpeg,image/bmp,application/pdf" aria-label="添加单据照片或PDF" disabled={locked || full || supplierRequired} hidden multiple onChange={event => { const files = Array.from(event.target.files || []); event.target.value = ""; void addFiles(files); }} ref={fileRef} type="file" />
        <div className="raw-material-receive-page-heading"><strong>{pages.length ? `已添加 ${pages.length} 页` : "添加单据页面"}</strong><span>同一张单最多 4 页，全部添加后识别</span></div>
        {pages.length ? <ol aria-label="单据逐页预览" className="raw-material-receive-pages">{pages.map((page, index) => <li key={`${page.captureId}-${index}-${page.fileName}`}>
          <button aria-label={`查看第 ${index + 1} 页大图`} className="raw-material-receive-thumbnail" disabled={locked} onClick={() => setPreviewIndex(index)} type="button"><img alt={`单据第 ${index + 1} 页`} src={page.contentDataUrl} /><strong>第 {index + 1} 页</strong></button>
          <button aria-label={`删除第 ${index + 1} 页`} className="raw-material-receive-remove" disabled={locked} onClick={() => removePage(index)} type="button">删除</button>
        </li>)}</ol> : <div className="raw-material-receive-empty">拍摄或上传后，在这里核对页面</div>}
        {progress ? <p aria-live="polite" className="raw-material-receive-progress" role="status">{progress}</p> : null}
        {localError || error ? <p className="raw-material-receive-error" role="alert">{localError || error}</p> : null}
      </div>
      <footer><span>{isReturn ? "原料退货不增加库存" : "识别后逐卷核对，未确认不入库"}</span><button disabled={locked} onClick={close} type="button">取消</button><button className="raw-material-receive-primary" disabled={locked || !pages.length || supplierRequired} onClick={() => void recognize()} type="button">{busy || submitting ? "正在识别…" : "开始识别"}</button></footer>
      {previewIndex !== null && pages[previewIndex] ? <div className="raw-material-receive-preview" role="dialog" aria-modal="true" aria-label={`单据第 ${previewIndex + 1} 页大图`}><header><strong>第 {previewIndex + 1} 页</strong><button onClick={() => setPreviewIndex(null)} type="button">关闭大图</button></header><img alt={`单据第 ${previewIndex + 1} 页原内容`} src={pages[previewIndex].contentDataUrl} /></div> : null}
    </section>
    {cameraOpen ? <DeliveryNoteCameraCapture completeLabel="拍好了，核对页面" maxPages={RAW_MATERIAL_DELIVERY_NOTE_MAX_PAGES - pages.length} onCapture={files => { setCameraOpen(false); void addFiles(files); }} onClose={() => setCameraOpen(false)} /> : null}
  </div>;
}
