export const RAW_MATERIAL_RECEIPT_STAGES = Object.freeze(["待核对", "退货单", "待打印", "待贴标", "异常"]);
export function resolveRawMaterialReceiptStage(row = {}) {
  const status = String(row.status || "");
  if (row.documentDirection === "supplier_return") return "退货单";
  if (row.duplicate || status.includes("异常")) return "异常";
  if (["已拍照待识别", "已识别待复核", "待补充/待确认"].includes(status)) return "待核对";
  if (status === "已复核待打印标签") return "待打印";
  if (["已打印待贴标", "部分贴标"].includes(status)) return "待贴标";
  return "";
}
