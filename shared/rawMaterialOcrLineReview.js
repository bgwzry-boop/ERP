import { enrichRawMaterialSpecValues } from "./rawMaterialSpec.js";

export const RAW_MATERIAL_OCR_LINE_REVIEW_KEYS = [
  "productName",
  "materialType",
  "supplierColor",
  "spec",
  "rollCount",
  "totalWeightKg",
  "unit",
  "unitPrice",
  "amount",
  "supplierRollNo",
  "rollWeightsKg",
];

const textKeys = new Set(["productName", "materialType", "supplierColor", "spec", "unit", "supplierRollNo"]);
const numericKeys = new Set(["rollCount", "totalWeightKg", "unitPrice", "amount"]);

export function applyRawMaterialOcrLineReviews({ lines = [], lineReviews, operatorId = "", operatorName = "", now = "" } = {}) {
  const sourceLines = Array.isArray(lines) ? lines : [];
  if (sourceLines.length === 0) {
    throw reviewError(
      "RAW_MATERIAL_OCR_REVIEW_LINES_MISSING",
      "OCR 草稿缺少可复核的明细行，不能只确认单据汇总。",
    );
  }
  const submittedByLineId = normalizeSubmittedLineReviews(lineReviews);
  const expectedLineIds = new Set(sourceLines.map((line) => cleanText(line?.lineId)).filter(Boolean));
  const unknownLineIds = [...submittedByLineId.keys()].filter((lineId) => !expectedLineIds.has(lineId));
  if (unknownLineIds.length) {
    throw reviewError(
      "RAW_MATERIAL_OCR_REVIEW_LINE_NOT_FOUND",
      `OCR 复核提交了不存在的明细行：${unknownLineIds.join("、")}。`,
    );
  }
  const missingLineIds = [...expectedLineIds].filter((lineId) => !submittedByLineId.has(lineId));
  if (missingLineIds.length) {
    throw reviewError(
      "RAW_MATERIAL_OCR_REVIEW_LINE_REQUIRED",
      `OCR 人工复核未确认明细行：${missingLineIds.join("、")}。`,
    );
  }

  return sourceLines.map((line) => {
    const lineId = cleanText(line?.lineId);
    const submitted = submittedByLineId.get(lineId);
    const recognizedValues = normalizeLineValues(resolveRecognizedValues(line), {});
    const values = normalizeLineValues(line?.values ?? {}, submitted.values);
    validateLineValues(values, lineId);
    const reviewedFields = RAW_MATERIAL_OCR_LINE_REVIEW_KEYS.map((key) => ({
      key,
      recognizedValue: recognizedValues[key],
      value: values[key],
      reviewStatus: areValuesEqual(values[key], recognizedValues[key]) ? "人工接受" : "人工修改",
    }));
    return {
      ...line,
      recognizedValues,
      values,
      reviewedFields,
      reviewStatus: reviewedFields.every((field) => field.reviewStatus === "人工接受") ? "人工接受" : "人工修改",
      reviewedBy: cleanText(operatorName),
      reviewedByUserId: cleanText(operatorId),
      reviewedAt: cleanText(now),
    };
  });
}

export function validateRawMaterialOcrLineReviewSummary({ lines = [], reviewValues = {} } = {}) {
  const reviewedLines = Array.isArray(lines) ? lines : [];
  const expectedRollCount = positiveInteger(reviewValues.rollCount, 0);
  const actualRollCount = reviewedLines.reduce((total, line) => total + positiveInteger(line?.values?.rollCount, 0), 0);
  if (!expectedRollCount || actualRollCount !== expectedRollCount) {
    throw reviewError(
      "RAW_MATERIAL_OCR_REVIEW_LINE_ROLL_COUNT_MISMATCH",
      `单据卷/件数与逐行复核不一致：汇总 ${expectedRollCount || 0}，明细 ${actualRollCount}。`,
    );
  }
  const expectedWeightKg = nonNegativeNumber(reviewValues.totalWeightKg, 0);
  const actualWeightKg = roundNumber(reviewedLines.reduce((total, line) => total + nonNegativeNumber(line?.values?.totalWeightKg, 0), 0), 3);
  if (expectedWeightKg > 0 && actualWeightKg > 0 && !approximatelyEqual(expectedWeightKg, actualWeightKg)) {
    throw reviewError(
      "RAW_MATERIAL_OCR_REVIEW_LINE_WEIGHT_MISMATCH",
      `单据总重量与逐行复核不一致：汇总 ${expectedWeightKg}kg，明细 ${actualWeightKg}kg。`,
    );
  }
  const expectedAmount = nonNegativeNumber(reviewValues.amount, 0);
  const actualAmount = roundNumber(reviewedLines.reduce((total, line) => total + nonNegativeNumber(line?.values?.amount, 0), 0), 2);
  if (expectedAmount > 0 && actualAmount > 0 && !approximatelyEqual(expectedAmount, actualAmount)) {
    throw reviewError(
      "RAW_MATERIAL_OCR_REVIEW_LINE_AMOUNT_MISMATCH",
      `单据金额与逐行复核不一致：汇总 ${expectedAmount}，明细 ${actualAmount}。`,
    );
  }
}

export function buildRawMaterialOcrReviewedRolls({ inboundId = "", existingRolls = [], lines = [] } = {}) {
  const existingByLineId = new Map();
  for (const roll of Array.isArray(existingRolls) ? existingRolls : []) {
    const lineId = cleanText(roll?.ocrLineId);
    if (!lineId) continue;
    const queue = existingByLineId.get(lineId) ?? [];
    queue.push(roll);
    existingByLineId.set(lineId, queue);
  }
  const inputs = (Array.isArray(lines) ? lines : []).flatMap((line) => {
    const values = line?.values ?? {};
    const rollCount = positiveInteger(values.rollCount, 0);
    const exactWeights = Array.isArray(values.rollWeightsKg) && values.rollWeightsKg.length === rollCount
      ? values.rollWeightsKg.map((weight) => nonNegativeNumber(weight, 0))
      : [];
    const fallbackWeight = rollCount > 0
      ? roundNumber(nonNegativeNumber(values.totalWeightKg, 0) / rollCount, 3)
      : 0;
    return Array.from({ length: rollCount }, (_, index) => ({
      line,
      lineRollIndex: index,
      weightKg: exactWeights[index] ?? fallbackWeight,
    }));
  });
  return inputs.map(({ line, lineRollIndex, weightKg }, index) => {
    const lineId = cleanText(line?.lineId);
    const existing = existingByLineId.get(lineId)?.shift() ?? {};
    const suppliedRollNo = cleanText(line?.values?.supplierRollNo);
    const supplierRollNo = suppliedRollNo
      ? (lineRollIndex === 0 ? suppliedRollNo : `${suppliedRollNo}-${lineRollIndex + 1}`)
      : cleanText(existing.supplierRollNo) || `待核对-${String(index + 1).padStart(2, "0")}`;
    return {
      ...existing,
      id: cleanText(existing.id) || `RM-${cleanText(inboundId).replace(/^RMI-/, "")}-${String(index + 1).padStart(2, "0")}`,
      supplierRollNo,
      weightKg,
      originalWeightKg: weightKg,
      labelStatus: "待打印标签",
      inventoryStatus: "不可用",
      location: cleanText(existing.location) || "原料待检区",
      signedNoteStatus: cleanText(existing.signedNoteStatus) || "入库无需逐卷扫码或签单",
      ocrLineId: lineId,
      productName: cleanText(line?.values?.productName),
      materialType: cleanText(line?.values?.materialType),
      supplierColor: cleanText(line?.values?.supplierColor),
      spec: cleanText(line?.values?.spec),
      specRaw: cleanText(line?.values?.specRaw || line?.values?.spec),
      specDisplay: cleanText(line?.values?.specDisplay || line?.values?.spec),
      gramWeightGsm: nonNegativeNumber(line?.values?.gramWeightGsm, 0),
      widthCm: nonNegativeNumber(line?.values?.widthCm, 0),
      lengthM: nonNegativeNumber(line?.values?.lengthM, 0),
      unitPrice: nonNegativeNumber(line?.values?.unitPrice, 0),
      materialCategory: cleanText(line?.values?.materialCategory),
      specNeedsReview: line?.values?.specNeedsReview === true,
      specReviewReason: cleanText(line?.values?.specReviewReason),
    };
  });
}

function normalizeSubmittedLineReviews(lineReviews) {
  if (!Array.isArray(lineReviews)) {
    throw reviewError("RAW_MATERIAL_OCR_REVIEW_LINE_REQUIRED", "OCR 人工复核必须逐行提交确认值。");
  }
  const submittedByLineId = new Map();
  for (const entry of lineReviews) {
    const lineId = cleanText(entry?.lineId);
    if (!lineId || submittedByLineId.has(lineId) || !entry?.values || typeof entry.values !== "object" || Array.isArray(entry.values)) {
      throw reviewError("RAW_MATERIAL_OCR_REVIEW_LINE_INVALID", "OCR 明细行复核格式无效。");
    }
    submittedByLineId.set(lineId, entry);
  }
  return submittedByLineId;
}

function resolveRecognizedValues(line = {}) {
  const recognizedValues = line?.recognizedValues;
  if (recognizedValues && typeof recognizedValues === "object" && !Array.isArray(recognizedValues) && Object.keys(recognizedValues).length) {
    return recognizedValues;
  }
  return line?.values ?? {};
}

function normalizeLineValues(baseValues = {}, submittedValues = {}) {
  const submittedKeys = Object.keys(submittedValues ?? {});
  const unknownKeys = submittedKeys.filter((key) => !RAW_MATERIAL_OCR_LINE_REVIEW_KEYS.includes(key));
  if (unknownKeys.length) {
    throw reviewError(
      "RAW_MATERIAL_OCR_REVIEW_LINE_FIELD_INVALID",
      `OCR 明细行包含不允许修改的字段：${unknownKeys.join("、")}。`,
    );
  }
  const values = {};
  for (const key of RAW_MATERIAL_OCR_LINE_REVIEW_KEYS) {
    const rawValue = Object.hasOwn(submittedValues ?? {}, key) ? submittedValues[key] : baseValues?.[key];
    if (textKeys.has(key)) values[key] = cleanText(rawValue);
    if (numericKeys.has(key)) values[key] = reviewedNonNegativeNumber(rawValue, key);
    if (key === "rollWeightsKg") values[key] = normalizeRollWeights(rawValue);
  }
  return enrichRawMaterialSpecValues(values);
}

function validateLineValues(values, lineId) {
  const missing = [];
  if (!cleanText(values.productName) && !cleanText(values.materialType)) missing.push("材料/品名");
  if (!cleanText(values.spec)) missing.push("规格");
  if (!cleanText(values.unit)) missing.push("单位");
  if (!positiveInteger(values.rollCount, 0) || positiveInteger(values.rollCount, 0) > 500) missing.push("卷/件数（1-500）");
  if (missing.length) {
    throw reviewError(
      "RAW_MATERIAL_OCR_REVIEW_LINE_REQUIRED_FIELDS_MISSING",
      `OCR 明细行 ${lineId || "待确认"} 缺少：${missing.join("、")}。`,
    );
  }
  if (values.rollWeightsKg.length) {
    if (values.rollWeightsKg.length !== values.rollCount) {
      throw reviewError(
        "RAW_MATERIAL_OCR_REVIEW_LINE_WEIGHT_COUNT_MISMATCH",
        `OCR 明细行 ${lineId || "待确认"} 的分卷重量数量与卷数不一致。`,
      );
    }
    const weightTotal = roundNumber(values.rollWeightsKg.reduce((total, weight) => total + weight, 0), 3);
    if (values.totalWeightKg > 0 && !approximatelyEqual(values.totalWeightKg, weightTotal)) {
      throw reviewError(
        "RAW_MATERIAL_OCR_REVIEW_LINE_WEIGHT_TOTAL_MISMATCH",
        `OCR 明细行 ${lineId || "待确认"} 的分卷重量与行总重不一致。`,
      );
    }
  }
}

function normalizeRollWeights(value) {
  const entries = Array.isArray(value)
    ? value
    : cleanText(value)
      ? cleanText(value).split(/[,，\s]+/u)
      : [];
  const weights = entries.map((entry) => Number(entry));
  if (weights.some((weight) => !Number.isFinite(weight) || weight <= 0)) {
    throw reviewError("RAW_MATERIAL_OCR_REVIEW_LINE_WEIGHT_INVALID", "分卷重量必须是大于 0 的数字。");
  }
  return weights.map((weight) => roundNumber(weight, 3));
}

function positiveInteger(value, fallback) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : fallback;
}

function nonNegativeNumber(value, fallback) {
  const text = cleanText(value);
  if (!text) return fallback;
  const number = Number(text);
  return Number.isFinite(number) && number >= 0 ? number : fallback;
}

function reviewedNonNegativeNumber(value, key) {
  const text = cleanText(value);
  if (!text) return 0;
  const number = Number(text);
  if (!Number.isFinite(number) || number < 0) {
    throw reviewError("RAW_MATERIAL_OCR_REVIEW_LINE_NUMBER_INVALID", `OCR 明细行的${key}必须是非负数字。`);
  }
  return number;
}

function approximatelyEqual(left, right) {
  const a = Number(left);
  const b = Number(right);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return false;
  return Math.abs(a - b) <= Math.max(0.05, Math.abs(b) * 0.02);
}

function areValuesEqual(left, right) {
  if (Array.isArray(left) || Array.isArray(right)) {
    const leftValues = Array.isArray(left) ? left : [];
    const rightValues = Array.isArray(right) ? right : [];
    return leftValues.length === rightValues.length && leftValues.every((value, index) => Number(value) === Number(rightValues[index]));
  }
  return typeof left === "number" || typeof right === "number" ? Number(left) === Number(right) : cleanText(left) === cleanText(right);
}

function reviewError(code, message) {
  return Object.assign(new Error(message), { statusCode: 422, code });
}

function roundNumber(value, precision) {
  const factor = 10 ** precision;
  return Math.round((Number(value) || 0) * factor) / factor;
}

function cleanText(value) {
  return String(value ?? "").trim();
}
