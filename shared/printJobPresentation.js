export function getPrintJobStatusLabel(status) {
  return ({ queued: "待派发", sent: "已派发", printed: "已打印", failed: "失败", canceled: "已取消", preview_only: "仅预览" })[String(status ?? "").trim()] || "状态待确认";
}
export function getPrintJobDocumentLabel(type) {
  return ({ express_ltl_label: "包裹标签", package_label: "包裹标签", pickup_note: "自提单", delivery_note: "送货单", outbound_note: "出库单", raw_material_roll_label: "原料卷标", roll_label: "卷标" })[String(type ?? "").trim()] || "单据类型待确认";
}
