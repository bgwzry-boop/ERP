export function toRawMaterialInboundActionSlug(action) {
  const value = String(action ?? "").trim();
  if (value === "复核送货单" || value === "review") return "review";
  if (value === "纠正为供应商退货" || value === "reparse_ocr" || value === "reparse-ocr") return "reparse-ocr";
  if (value === "作废误录草稿" || value === "void_draft" || value === "void-draft") return "void-draft";
  if (value === "打印卷标" || value === "print_labels" || value === "print-labels") return "print-labels";
  if (value === "暂缓打印卷标" || value === "defer_labels" || value === "defer-labels") return "defer-labels";
  if (value === "确认贴标入库" || value === "attach_confirm" || value === "attach-confirm") return "attach-confirm";
  if (value === "作废卷标" || value === "void_label" || value === "void-label") return "void-label";
  if (value === "重打卷标" || value === "reprint_label" || value === "reprint-label") return "reprint-label";
  if (value === "供应商退货暂存" || value === "stage_supplier_return" || value === "stage-supplier-return") return "stage-supplier-return";
  if (value === "确认退厂" || value === "confirm_supplier_return_shipment" || value === "confirm-supplier-return-shipment") return "confirm-supplier-return-shipment";
  if (value === "机边领料" || value === "扫码出库" || value === "issue_to_machine" || value === "issue-to-machine") return "issue-to-machine";
  if (value === "确认消耗" || value === "confirm_consumption" || value === "confirm-consumption") return "confirm-consumption";
  if (value === "余料退回" || value === "return_leftover" || value === "return-leftover") return "return-leftover";
  if (value === "复核余料可用" || value === "review_leftover" || value === "review-leftover") return "review-leftover";
  if (value === "生成成本草稿" || value === "generate_cost_draft" || value === "generate-cost-draft") return "generate-cost-draft";
  if (value === "确认成本草稿" || value === "confirm_cost_draft" || value === "confirm-cost-draft") return "confirm-cost-draft";
  if (value === "校准损耗" || value === "损耗校准" || value === "calibrate_loss" || value === "calibrate-loss") return "calibrate-loss";
  if (value === "生成毛利快照" || value === "毛利快照" || value === "generate_margin_snapshot" || value === "generate-margin-snapshot") return "generate-margin-snapshot";
  if (value === "复核毛利快照" || value === "确认毛利快照" || value === "毛利报表" || value === "review_margin_snapshot" || value === "review-margin-snapshot") return "review-margin-snapshot";
  if (value === "标记异常" || value === "exception") return "exception";
  return "";
}
