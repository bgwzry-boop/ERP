export const RAW_MATERIAL_FIRST_RELEASE_ENABLED =
  String(import.meta.env?.VITE_RAW_MATERIAL_FIRST_RELEASE ?? "false").trim().toLowerCase() === "true";

export const RAW_MATERIAL_FIRST_RELEASE_SCOPE = Object.freeze({
  inbound: "送货单拍照 OCR、逐项核对、一卷一标和贴标确认入库",
  outbound: "杂工按卷码扫码出库并记录机台，不关联订单或生产任务",
  statement: "月底上传供应商 Excel，对照已核对入库记录自动匹配",
});
