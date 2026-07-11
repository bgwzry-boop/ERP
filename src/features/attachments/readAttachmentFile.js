export function readAttachmentFileAsDataUrl(file) {
  if (!file) return Promise.resolve("");
  if (typeof file.contentDataUrl === "string") return Promise.resolve(file.contentDataUrl);
  if (typeof FileReader === "undefined") {
    return Promise.reject(new Error("当前环境不支持读取附件内容。"));
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "");
    reader.onerror = () => reject(reader.error ?? new Error("附件读取失败。"));
    reader.readAsDataURL(file);
  });
}
