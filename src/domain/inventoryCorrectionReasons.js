export const reasonCodeByLabel = {
  盘点差异: "cycle_count",
  找不到货: "outbound_found_mismatch",
  "包装/标签问题": "outbound_found_mismatch",
  车间报数需复核: "workshop_report_check",
  待处理转报废: "damaged_or_scrap",
  其他: "other",
};

export const inventoryCorrectionReasonOptions = Object.freeze(Object.keys(reasonCodeByLabel));

export const reasonLabelByCode = {
  cycle_count: "盘点差异",
  outbound_found_mismatch: "找不到货/出库差异",
  workshop_report_check: "车间报数需复核",
  damaged_or_scrap: "待处理转报废",
  manual_review: "人工复核",
  other: "其他",
};

