import { useEffect, useId, useRef, useState } from "react";
import { downloadOfficeAttachmentContent } from "../../services/officeAttachmentApiClient.js";
import "../../styles/features/raw-material-source-evidence.css";

export function RawMaterialSourceEvidence({ authState, operatorId, selected, sourcePreviewDataUrls = [] }) {
  const [open, setOpen] = useState(false);
  const [pageIndex, setPageIndex] = useState(0);
  const [preview, setPreview] = useState({ loading: false, url: "", type: "", error: "" });
  const dialogRef = useRef(null);
  const triggerRef = useRef(null);
  const titleId = useId();
  const attachmentIds = (Array.isArray(selected.sourceAttachmentIds) && selected.sourceAttachmentIds.length
    ? selected.sourceAttachmentIds : [selected.sourceAttachmentId]).map((id) => String(id || "").trim()).filter(Boolean);
  const inlinePages = Array.isArray(sourcePreviewDataUrls) ? sourcePreviewDataUrls : [sourcePreviewDataUrls];
  const pageCount = attachmentIds.length || inlinePages.filter(Boolean).length;
  const attachmentId = attachmentIds[pageIndex] || "";
  const inlineUrl = String(inlinePages[pageIndex] || "");

  useEffect(() => {
    setOpen(false);
    setPageIndex(0);
  }, [selected.id]);

  useEffect(() => {
    if (!open) return;
    const dialog = dialogRef.current;
    dialog?.showModal();
    return () => {
      dialog?.close();
      queueMicrotask(() => {
        if (triggerRef.current?.isConnected) triggerRef.current.focus();
      });
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    let objectUrl = "";
    setPreview({ loading: true, url: "", type: "", error: "" });
    async function load() {
      if (!attachmentId) {
        setPreview({ loading: false, url: inlineUrl, type: "image/*", error: inlineUrl ? "" : "本页没有原单照片。" });
        return;
      }
      const result = await downloadOfficeAttachmentContent({ attachmentId, authState, operatorId }, { serverRequired: true });
      if (cancelled) return;
      if (result.source !== "api" || !result.contentBlob?.size) {
        setPreview({ loading: false, url: "", type: "", error: result.error?.message || "原单照片读取失败，请重试。" });
        return;
      }
      objectUrl = URL.createObjectURL(result.contentBlob);
      setPreview({ loading: false, url: objectUrl, type: result.contentType || result.contentBlob.type, error: "" });
    }
    void load();
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [open, attachmentId, inlineUrl, authState, operatorId]);

  return <div className="raw-material-source-evidence">
    <button disabled={!pageCount} onClick={() => { setPageIndex(0); setOpen(true); }} ref={triggerRef} type="button">
      {pageCount ? `查看原单（${pageCount}页）` : "暂无原单照片"}
    </button>
    {open ? <dialog aria-labelledby={titleId} className="raw-material-source-dialog" onCancel={() => setOpen(false)} ref={dialogRef}>
      <header><h2 id={titleId}>原单照片</h2><button onClick={() => setOpen(false)} type="button">关闭</button></header>
      {pageCount > 1 ? <nav aria-label="原单页码">
        {Array.from({ length: pageCount }, (_, index) => <button aria-current={pageIndex === index ? "page" : undefined} key={index} onClick={() => setPageIndex(index)} type="button">第 {index + 1} 页</button>)}
      </nav> : null}
      {preview.loading ? <p role="status">正在读取原单…</p> : preview.error ? <p role="alert">{preview.error}</p> : preview.url ? (
        preview.type.includes("pdf") ? <object aria-label={`原单第 ${pageIndex + 1} 页 PDF`} data={preview.url} type="application/pdf"><a href={preview.url} download>下载原单 PDF</a></object>
          : <img alt={`原单照片，第 ${pageIndex + 1} 页`} src={preview.url} />
      ) : null}
    </dialog> : null}
  </div>;
}
