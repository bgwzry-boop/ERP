import {
  formatAttachmentAccessTime,
  formatFileSize,
  getAttachmentAccessActionLabel,
  getAttachmentAccessModeLabel,
  isInlineImageAttachment,
} from "./attachmentViewUtils.js";

export function AttachmentViewerModal({ attachment, onClose, onDownload }) {
  const viewerTitle = attachment.viewerTitle || (attachment.statementId ? "付款凭证预览" : "附件预览");
  const title = attachment.fileName || attachment.attachmentId || viewerTitle;
  const typeLabel = attachment.mimeType || attachment.contentType || "类型未记录";
  const sizeLabel = Number.isFinite(Number(attachment.fileSize)) ? formatFileSize(attachment.fileSize) : "大小未记录";
  const timeLabel = attachment.uploadedAt || attachment.createdAt || "时间未记录";
  const canDownload = Boolean(attachment.previewDataUrl);
  const canInlinePreview = Boolean(attachment.previewDataUrl && isInlineImageAttachment(attachment));
  const accessAudit = attachment.accessAudit ?? { items: [], total: 0, status: "访问记录未加载" };
  const accessItems = Array.isArray(accessAudit.items) ? accessAudit.items : [];

  return (
    <div className="modal-backdrop" role="presentation">
      <section className="modal attachment-viewer-modal" role="dialog" aria-modal="true" aria-label={viewerTitle}>
        <div className="modal-title">
          <div>
            <span>{viewerTitle}</span>
            <h2>{title}</h2>
          </div>
          <button className="icon-button" onClick={onClose}>×</button>
        </div>
        <div className="attachment-viewer-body">
          {canInlinePreview ? (
            <img src={attachment.previewDataUrl} alt={title} />
          ) : attachment.previewDataUrl ? (
            <div className="attachment-viewer-file-card">
              <strong>{title}</strong>
              <span>{typeLabel}</span>
              <small>当前附件已读取，可下载原文件查看。</small>
            </div>
          ) : (
            <div className="attachment-viewer-empty">当前附件还没有可读取内容</div>
          )}
        </div>
        <div className="attachment-viewer-meta">
          <span>{typeLabel}</span>
          <span>{sizeLabel}</span>
          <span>{timeLabel}</span>
          {attachment.previewStatus && <span>{attachment.previewStatus}</span>}
        </div>
        <section className="attachment-viewer-audit" aria-label="附件访问记录">
          <div className="attachment-viewer-audit-head">
            <strong>访问记录</strong>
            <span>{accessAudit.status}</span>
          </div>
          {accessItems.length ? (
            <div className="attachment-viewer-audit-list">
              {accessItems.map((record) => (
                <div className="attachment-viewer-audit-row" key={record.logId || record.operationLogId}>
                  <span>{getAttachmentAccessActionLabel(record.action)}</span>
                  <strong>{record.operatorId || "未知账号"}</strong>
                  <small>{getAttachmentAccessModeLabel(record)} · {formatAttachmentAccessTime(record.occurredAt)}</small>
                </div>
              ))}
            </div>
          ) : (
            <div className="attachment-viewer-audit-empty">{accessAudit.status || "暂无访问记录"}</div>
          )}
        </section>
        <div className="modal-actions">
          <button disabled={!canDownload} onClick={() => onDownload(attachment)}>下载附件</button>
          <button className="primary-action" onClick={onClose}>关闭</button>
        </div>
      </section>
    </div>
  );
}
