import { applyRawMaterialOcrLineReviews, validateRawMaterialOcrLineReviewSummary } from "../../../../shared/rawMaterialOcrLineReview.js";
import { getReceiptSourcePages } from "./receipt-source.js";

export const RECEIPT_HEADER_FIELDS = [
  ["supplierName", "供应商"], ["deliveryNoteNo", "厂家单号"], ["productName", "品名"],
  ["materialType", "材料"], ["spec", "汇总规格"], ["supplierColor", "票面颜色"],
  ["factoryColor", "汇总标准色"], ["rollCount", "全单卷/件数"], ["totalWeightKg", "全单重量 kg"],
  ["unit", "单位"], ["unitPrice", "汇总单价"], ["amount", "全单声明金额"],
];
export function buildReceiptHeaderDraft(inbound) {
  const fields = Object.fromEntries((inbound.ocrReviewFields || []).map((field) => [field.key, field.value ?? field.recognizedValue ?? ""]));
  return Object.fromEntries(RECEIPT_HEADER_FIELDS.map(([key]) => [key, fields[key] ?? inbound[key] ?? ""]));
}
export function validateDesktopReceiptReview({ inbound, reviewFields, lineReviews, standardColors, seenPages, confirmedRolls, reason }) {
  const pages = getReceiptSourcePages(inbound);
  if (!pages.length || pages.some((page) => !page.attachmentId || !seenPages[page.index])) throw new Error("请查看全部原始票据；缺失或未成功加载的原图不能完成复核。");
  if (!String(reason || "").trim()) throw new Error("请填写复核依据或修改说明。");
  if (!String(reviewFields.supplierName || "").trim() || (!String(reviewFields.productName || "").trim() && !String(reviewFields.materialType || "").trim()) || !String(reviewFields.unit || "").trim()) throw new Error("请补齐供应商、材料/品名和单位。");
  if (inbound.documentDirection !== "supplier_return" && !String(reviewFields.spec || "").trim()) throw new Error("请核对汇总规格。");
  for (const key of ["rollCount", "totalWeightKg", "amount"]) {
    if (!Number.isFinite(Number(reviewFields[key])) || !(Math.abs(Number(reviewFields[key])) > 0)) throw new Error("请填写有效的全单数量、重量和声明金额，不能用分页小计代替。");
  }
  const lines = applyRawMaterialOcrLineReviews({ lines: inbound.ocrLines, lineReviews, standardColors, documentDirection: inbound.documentDirection });
  for (const line of lines) {
    if (!Number.isInteger(line.sourcePageIndex) || !pages[line.sourcePageIndex]?.attachmentId) throw new Error(`明细 ${line.lineId} 缺少真实来源页，不能完成复核。`);
    for (let index = 0; index < line.reviewProjectedRollCount; index += 1) {
      if (!confirmedRolls[`${line.lineId}:${index}`]) throw new Error("请逐卷核对颜色、规格和独立重量；排除误识别卷也需要明确确认。");
    }
  }
  validateRawMaterialOcrLineReviewSummary({ lines, reviewValues: reviewFields, documentDirection: inbound.documentDirection, amountReferenceOnly: inbound.documentPriceReferenceOnly === true });
  return { reviewFields, lineReviews, reason: String(reason).trim(), expectedRevision: Number(inbound.revision ?? 0) };
}
