import { hasWarehouseExecutionReceipt } from "../../shared/warehouseExecutionReceipt.js";

export async function confirmWarehouseExecution({ payload, activeModal, permissionContext, fulfillments, recordWarehouseExecution, getModal, closeModal }) {
  if (!permissionContext?.actionPermissions?.includes("fulfillment.warehouse.execute")) return { blocked: true, feedback: "当前账号没有库房执行权限。" };
  const selected = payload.fulfillmentSnapshot ?? fulfillments.find(item => item.id === activeModal.fulfillmentId);
  if (selected?.id !== activeModal.fulfillmentId || !selected?.paperOutboundDocument) return { blocked: true, feedback: "未找到当前任务与纸单，请重新打开。" };
  const result = await recordWarehouseExecution({ fulfillment: selected,
    paperOutboundDocument: payload.paperDocumentSnapshot ?? selected.paperOutboundDocument, payload });
  if (getModal() !== activeModal) return { blocked: true, stale: true };
  if (result?.source === "api" && !result.blocked) {
    if (!hasWarehouseExecutionReceipt(result, { ...payload, fulfillment: selected, paperOutboundDocument: payload.paperDocumentSnapshot ?? selected.paperOutboundDocument })) return {
      source: "api_error", blocked: true, error: { code: "WAREHOUSE_EXECUTION_UNCONFIRMED", message: "尚未收到本任务与当前纸单的完整库房回执，请用原内容重试。" } };
    closeModal();
  }
  return result;
}
