export function formatFileSize(size) {
  const bytes = Number(size || 0);
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function formatAttachmentAccessTime(value) {
  if (!value) return "时间未记录";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function getAttachmentAccessActionLabel(action) {
  const labels = {
    attachment_access_url_created: "生成访问地址",
    attachment_content_read: "读取内容",
  };
  return labels[action] ?? action ?? "访问";
}

export function getAttachmentAccessModeLabel(record) {
  if (record?.accessMode === "signed_url") return "签名链接";
  if (record?.accessMode === "permission") return "权限读取";
  if (record?.deliveryMode === "object_storage_signed_url") return "对象存储直连";
  return record?.deliveryMode || "访问方式未记录";
}

export function isInlineImageAttachment(attachment = {}) {
  const contentType = String(attachment.contentType || attachment.mimeType || "").toLowerCase();
  const dataUrl = String(attachment.previewDataUrl || "").toLowerCase();
  return contentType.startsWith("image/") || dataUrl.startsWith("data:image/");
}
