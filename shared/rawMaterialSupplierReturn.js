import { inspectRawMaterialDocumentDirectionEvidence } from "./rawMaterialDocumentDirectionEvidence.js";

export const RAW_MATERIAL_SUPPLIER_RETURN_CATEGORIES = ["黑白布", "彩布", "废布"];
export const RAW_MATERIAL_MIXED_DIRECTION_MESSAGE = "原单同时包含送货和退货明细，请分别核实，不能整单按同一方向确认。";

export function hasAmbiguousRawMaterialSupplierReturnEvidence(input = {}) {
  return inspectSupplierReturnEvidence(input).ambiguous;
}

export function classifyRawMaterialSupplierReturnCategory(input = {}) {
  const supplierColor = cleanText(input.supplierColor).replace(/\s+/gu, "");
  if (/^(?:黑|白|黑色|白色|本白)$/u.test(supplierColor)) return "黑白布";
  if (/^(?:彩|彩色|彩布)$/u.test(supplierColor)) return "彩布";
  const text = [
    input.productName,
    input.materialType,
    input.supplierColor,
    input.sourceText,
  ].map(cleanText).filter(Boolean).join(" ");
  const compact = text.replace(/\s+/gu, "");
  if (!compact) return "";
  if (/(?:提手条|把条|布条|条料|退带色条)/u.test(compact)) return "提手条";
  if (/废布/u.test(compact)) return "废布";
  if (/(?:黑白布|黑白|黑布|白布|黑色|白色|本白|(?:^|[^\p{Script=Han}])黑(?:$|[^\p{Script=Han}])|(?:^|[^\p{Script=Han}])白(?:$|[^\p{Script=Han}]))/u.test(compact)) return "黑白布";
  if (/(?:彩布|彩色|带色布|退带色布|大红|酒红|枣红|宝兰|天兰|浅紫|桔红|翠绿)/u.test(compact)) return "彩布";
  return "";
}

export function isRawMaterialSupplierReturnFabric(input = {}) {
  const text = [input.productName, input.materialType, input.sourceText].map(cleanText).join(" ");
  return /布/u.test(text) && !/(?:提手条|把条|布条|条料|退带色条)/u.test(text);
}

export function hasStrongRawMaterialSupplierReturnEvidence(input = {}) {
  if (cleanText(input.documentDirection) === "supplier_return") return false;
  const evidence = inspectSupplierReturnEvidence(input);
  if (evidence.hasReturnEvidence) return !evidence.ambiguous;
  // Compatibility for old records which retained only signed recognized values.
  if (!input.ocrRawText && !input.ocrTableRows?.length && !input.ocrLines?.some(line => line.sourceText)) {
    return (Array.isArray(input.ocrLines) ? input.ocrLines : []).some((line) => (
      Number(line?.values?.totalWeightKg) < 0 || Number(line?.values?.amount) < 0
    ));
  }
  return false;
}

function inspectSupplierReturnEvidence(input) {
  const hasText = row => Array.isArray(row) && row.some(cell => cleanText(cell));
  const rows = (Array.isArray(input.ocrTableRows) ? input.ocrTableRows.flat() : []).filter(hasText);
  const lineRows = (input.ocrLines ?? []).map(line => cleanText(line?.sourceText).split(/[|\n]/u)).filter(hasText);
  return inspectRawMaterialDocumentDirectionEvidence({
    rows: rows.length ? rows : lineRows,
    rawText: input.ocrRawText,
  });
}

function cleanText(value) {
  return String(value ?? "").trim();
}
