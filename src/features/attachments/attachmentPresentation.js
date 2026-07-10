export function formatAttachmentSize(size) {
  const bytes = Number(size);
  if (!Number.isFinite(bytes) || bytes <= 0) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function isInlineImageAttachment(file = {}) {
  const contentType = String(file.contentType || file.mimeType || "").toLowerCase();
  const dataUrl = String(file.previewDataUrl || "").toLowerCase();
  return contentType.startsWith("image/") || dataUrl.startsWith("data:image/");
}
