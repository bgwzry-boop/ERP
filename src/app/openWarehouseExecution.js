export function openWarehouseExecution({ action, selected, targetFulfillmentId, setToast, openModal }) {
  const prepareOnly = action === "登记库房备货";
  if (prepareOnly ? !selected.warehouseTaskVisible || !selected.paperOutboundDocument || selected.physicalOutboundAt
    : !selected.paperOutboundDocument || selected.paperOutboundStatus !== "已交库房") {
    setToast(prepareOnly ? "请等待当前出库单真实打印成功，再登记备货；本次未修改库存。" : "当前纸单尚未交库房，不能回录库房实物执行结果。");
    return;
  }
  openModal({ type: "warehouseExecution", fulfillmentId: targetFulfillmentId, action,
    ...(prepareOnly ? { prepareOnly: true, initialWarehouseResult: "已备货" } : {}) });
}
