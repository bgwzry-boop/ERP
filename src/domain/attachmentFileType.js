export function isInlineImageAttachment(file = {}) {
  const contentType = String(file.contentType || file.mimeType || "").toLowerCase();
  const dataUrl = String(file.previewDataUrl || "").toLowerCase();
  return contentType.startsWith("image/") || dataUrl.startsWith("data:image/");
}
