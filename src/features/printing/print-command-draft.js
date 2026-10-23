const prefix = "erp.print-command.v2:";
const keyFor = modal => `${prefix}${[modal.sessionOwner, modal.type, modal.fulfillmentId, modal.action, modal.printRecordId].map(value => encodeURIComponent(value || "")).join(":")}`;
function storageOrThrow() {
  const storage = globalThis.sessionStorage;
  if (!storage) throw new Error("storage unavailable");
  return storage;
}
function valid(modal, request) {
  return Boolean(modal.sessionOwner && request?.fulfillment?.id === modal.fulfillmentId
    && /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/.test(request.idempotencyKey || "")
    && typeof request.reason === "string"
    && (modal.type !== "printVoid" || typeof request.printRecordId === "string" && request.printRecordId)
    && (!request.preview || request.preview.fields && Array.isArray(request.preview.safeguards)));
}
export function readPrintCommandDraft(modal) {
  try {
    if (!modal.sessionOwner) throw new Error("missing owner");
    const raw = storageOrThrow().getItem(keyFor(modal));
    if (raw === null) return { request: null, error: "" };
    const record = JSON.parse(raw);
    if (record.scope !== keyFor(modal) || !valid(modal, record.request)) throw new Error("invalid draft");
    return { request: record.request, error: "" };
  } catch {
    return { request: null, error: "无法读取本次打印草稿。请恢复浏览器存储后重新打开，避免重复提交。" };
  }
}
export function savePrintCommandDraft(modal, request) {
  try {
    if (!valid(modal, request)) throw new Error("invalid draft");
    const storage = storageOrThrow();
    const raw = JSON.stringify({ scope: keyFor(modal), request });
    storage.setItem(keyFor(modal), raw);
    if (storage.getItem(keyFor(modal)) !== raw) throw new Error("write not retained");
    return "";
  } catch {
    return "浏览器未能保存本次打印请求，尚未发送。请恢复存储后重试。";
  }
}
export function clearPrintCommandDraft(modal, request) {
  const current = readPrintCommandDraft(modal);
  if (current.request?.idempotencyKey !== request?.idempotencyKey) return;
  try { storageOrThrow().removeItem(keyFor(modal)); } catch { /* Kept receipt can safely be retried. */ }
}
