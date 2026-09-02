export const OCR_LINE_REVIEW_FIELDS = Object.freeze([
  ["productName", "品名"],
  ["materialType", "材料"],
  ["supplierColor", "供应商颜色"],
  ["factoryColor", "厂内标准色 *"],
  ["spec", "规格 *"],
  ["rollCount", "卷/件数 *"],
  ["totalWeightKg", "行总重 kg"],
  ["unit", "单位 *"],
  ["unitPrice", "单价"],
  ["amount", "金额"],
  ["supplierRollNo", "供应商卷号"],
  ["rollWeightsKg", "分卷重量 kg"],
]);

export function isNumericOcrField(key) {
  return ["rollCount", "totalWeightKg", "unitPrice", "amount"].includes(key);
}

export function isNumericOcrLineField(key) {
  return ["rollCount", "totalWeightKg", "unitPrice", "amount"].includes(key);
}

export function buildOcrLineReviewDraft(line = {}) {
  const values = line.values ?? {};
  return Object.fromEntries(OCR_LINE_REVIEW_FIELDS.map(([key]) => [
    key,
    key === "rollWeightsKg" && Array.isArray(values[key]) ? values[key].join(", ") : values[key] ?? "",
  ]));
}

export function formatOcrLineRecognizedValue(value) {
  if (Array.isArray(value)) return value.length ? value.join(", ") : "未识别";
  return String(value ?? "").trim() || "未识别";
}
