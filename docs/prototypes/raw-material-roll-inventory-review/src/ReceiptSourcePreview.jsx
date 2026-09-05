import { useEffect, useState } from "react";
import { downloadOfficeAttachmentContent } from "../../../../src/services/officeAttachmentApiClient.js";
import { getReceiptSourcePages } from "./receipt-source.js";

export function ReceiptSourcePreview({ authState, inbound, pageIndex = 0, onPageChange, onPageReady }) {
  const pages = getReceiptSourcePages(inbound);
  const attachmentId = pages[pageIndex]?.attachmentId || "";
  const [source, setSource] = useState({ url: "", type: "", error: "" });
  const [retry, setRetry] = useState(0);
  const [zoomed, setZoomed] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    let disposed = false;
    let objectUrl = "";
    setSource({ url: "", type: "", error: "" });
    setZoomed(false);
    if (attachmentId) {
      void downloadOfficeAttachmentContent({ attachmentId, authState, operatorId: authState?.permissions?.user?.userId }, {
        serverRequired: true, signal: controller.signal,
      }).then((result) => {
        if (disposed) return;
        const type = String(result.contentType || result.contentBlob?.type || "").split(";")[0];
        if (result.source !== "api" || !result.contentBlob?.size || !/^(image\/(png|jpeg|jpg|bmp)|application\/pdf)$/.test(type)) {
          setSource({ url: "", type: "", error: result.error?.message || "原图未能读取，请重试或补齐原始附件。" });
          return;
        }
        objectUrl = URL.createObjectURL(result.contentBlob);
        setSource({ url: objectUrl, type, error: "" });
      });
    }
    return () => {
      disposed = true;
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [attachmentId, authState, retry]);

  return <section className="receipt-source-preview" aria-label="原始票据附件">
    <header><strong>原始票据</strong><span>{pages.length ? `第 ${pageIndex + 1} / ${pages.length} 页` : "未保存附件"}</span></header>
    {pages.length > 1 ? <nav aria-label="原始票据页码">{pages.map((page) => <button aria-current={page.index === pageIndex ? "page" : undefined} key={page.index} onClick={() => onPageChange?.(page.index)} type="button">第 {page.index + 1} 页</button>)}</nav> : null}
    {!attachmentId ? <p role="alert">该页原始附件未记录，不能用示例图片代替。</p> : source.error ? <div role="alert"><p>{source.error}</p><button onClick={() => setRetry((value) => value + 1)} type="button">重新读取原图</button></div> : !source.url ? <p role="status">正在读取第 {pageIndex + 1} 页原始附件…</p> : <>
      <div className={`receipt-source-image${zoomed ? " is-zoomed" : ""}`}>
        {source.type === "application/pdf" ? <object aria-label={`原始票据第 ${pageIndex + 1} 页 PDF`} data={source.url} onLoad={() => onPageReady?.(pageIndex)} type="application/pdf"><a href={source.url} rel="noreferrer" target="_blank">打开原始 PDF</a></object> : <img alt={`原始票据第 ${pageIndex + 1} 页`} onLoad={() => onPageReady?.(pageIndex)} onError={() => setSource({ url: "", type: "", error: "原图无法解码，请重新读取或补齐附件。" })} src={source.url} />}
      </div>
      <footer>{source.type !== "application/pdf" ? <button aria-pressed={zoomed} onClick={() => setZoomed((value) => !value)} type="button">{zoomed ? "适合窗口" : "放大原图"}</button> : null}<a href={source.url} rel="noreferrer" target="_blank">单独打开原件</a></footer>
    </>}
  </section>;
}
