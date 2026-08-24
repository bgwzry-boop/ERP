import { enrichRawMaterialSpecValues } from "./rawMaterialSpec.js";
import { isRawMaterialFactoryColor } from "./rawMaterialFactoryColors.js";
import { isRawMaterialSupplierReturnFabric } from "./rawMaterialSupplierReturn.js";

export const RAW_MATERIAL_OCR_LINE_REVIEW_KEYS = [
  "productName",
  "materialType",
  "supplierColor",
  "returnMaterialCategory",
  "factoryColor",
  "spec",
  "rollCount",
  "totalWeightKg",
  "unit",
  "unitPrice",
  "amount",
  "supplierRollNo",
  "rollWeightsKg",
];

export function hasReviewableRawMaterialSpec(value) {
  return (cleanText(value).match(/\d+(?:\.\d+)?/gu) ?? []).length >= 2;
}

export function projectRawMaterialOcrPhysicalRollReviewRows({ lines = [], lineDrafts = {}, documentDirection = "supplier_delivery" } = {}) {
  let physicalRollIndex = 0;
  return (Array.isArray(lines) ? lines : []).flatMap((line, sourceLineIndex) => {
    const lineId = cleanText(line?.lineId) || `source-line-${sourceLineIndex + 1}`;
    const lineDraft = enrichRawMaterialSpecValues(lineDrafts?.[lineId] ?? line?.values ?? {});
    const parsedCount = Number(lineDraft.rollCount);
    const lineRollCount = Number.isInteger(parsedCount) && parsedCount > 0 ? parsedCount : 1;
    const rollWeights = normalizeRollWeightDraft(lineDraft.rollWeightsKg, lineRollCount);
    const singleRollWeight = lineRollCount === 1 ? directionalNumber(lineDraft.totalWeightKg, documentDirection, 0) : 0;
    return Array.from({ length: lineRollCount }, (_, lineRollIndex) => {
      physicalRollIndex += 1;
      const exactWeight = directionalNumber(rollWeights[lineRollIndex], documentDirection, 0);
      return {
        reviewId: `${lineId}:${lineRollIndex}`,
        physicalRollIndex,
        line,
        lineId,
        lineDraft,
        sourceLineIndex,
        lineRollIndex,
        lineRollCount,
        supplierColor: cleanText(lineDraft.supplierColor),
        factoryColor: cleanText(lineDraft.factoryColor),
        spec: cleanText(lineDraft.spec),
        weightKg: exactWeight || singleRollWeight || "",
        weightStatus: Math.abs(exactWeight) > 0 ? "逐卷重量" : Math.abs(singleRollWeight) > 0 ? "单卷行重量" : "本卷重量待补",
      };
    });
  });
}

const textKeys = new Set(["productName", "materialType", "supplierColor", "returnMaterialCategory", "factoryColor", "spec", "unit", "supplierRollNo"]);
const numericKeys = new Set(["rollCount", "totalWeightKg", "unitPrice", "amount"]);

export function applyRawMaterialOcrLineReviews({
  lines = [],
  lineReviews,
  operatorId = "",
  operatorName = "",
  now = "",
  documentDirection = "supplier_delivery",
  standardColors = [],
} = {}) {
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
    const recognizedValues = normalizeLineValues(resolveRecognizedValues(line), {}, { documentDirection });
    const values = normalizeLineValues(line?.values ?? {}, submitted.values, { documentDirection });
    const projectedRollCount = positiveInteger(values.rollCount, 0) || 1;
    const excludedRollIndices = normalizeExcludedRollIndices(submitted.excludedRollIndices, projectedRollCount, lineId);
    const exclusionReason = cleanText(submitted.exclusionReason);
    if (excludedRollIndices.length && !exclusionReason) {
      throw reviewError(
        "RAW_MATERIAL_OCR_REVIEW_EXCLUSION_REASON_REQUIRED",
        `OCR 明细行 ${lineId || "待确认"} 排除误识别卷时必须填写原因。`,
      );
    }
    validateLineValues(values, lineId, { excludedRollIndices, projectedRollCount, documentDirection, standardColors });
    const reviewedFields = RAW_MATERIAL_OCR_LINE_REVIEW_KEYS.map((key) => ({
      key,
      recognizedValue: recognizedValues[key],
      value: values[key],
      reviewStatus: areValuesEqual(values[key], recognizedValues[key]) ? "人工接受" : "人工修改",
    }));
    const activeRollCount = projectedRollCount - excludedRollIndices.length;
    const fieldStatus = reviewedFields.every((field) => field.reviewStatus === "人工接受") ? "人工接受" : "人工修改";
    return {
      ...line,
      recognizedValues,
      values,
      reviewedFields,
      reviewStatus: activeRollCount === 0 ? "人工排除" : excludedRollIndices.length ? "人工修改并排除" : fieldStatus,
      reviewDisposition: activeRollCount === 0 ? "excluded_not_material" : "included",
      reviewProjectedRollCount: projectedRollCount,
      excludedRollIndices,
      exclusionReason,
      excludedBy: excludedRollIndices.length ? cleanText(operatorName) : "",
      excludedByUserId: excludedRollIndices.length ? cleanText(operatorId) : "",
      excludedAt: excludedRollIndices.length ? cleanText(now) : "",
      reviewedBy: cleanText(operatorName),
      reviewedByUserId: cleanText(operatorId),
      reviewedAt: cleanText(now),
    };
  });
}

export function validateRawMaterialOcrLineReviewSummary({
  lines = [],
  reviewValues = {},
  documentDirection = "supplier_delivery",
  amountReferenceOnly = false,
} = {}) {
  const reviewedLines = Array.isArray(lines) ? lines : [];
  const expectedRollCount = positiveInteger(reviewValues.rollCount, 0);
  const actualRollCount = reviewedLines.reduce((total, line) => total + getActiveReviewedRollCount(line), 0);
  if (!expectedRollCount || actualRollCount !== expectedRollCount) {
    throw reviewError(
      "RAW_MATERIAL_OCR_REVIEW_LINE_ROLL_COUNT_MISMATCH",
      `单据卷/件数与逐行复核不一致：汇总 ${expectedRollCount || 0}，明细 ${actualRollCount}。`,
    );
  }
  const expectedWeightKg = directionalNumber(reviewValues.totalWeightKg, documentDirection, 0);
  const activeLines = reviewedLines.filter((line) => getActiveReviewedRollCount(line) > 0);
  const actualWeightKg = roundNumber(activeLines.reduce((total, line) => total + directionalNumber(line?.values?.totalWeightKg, documentDirection, 0), 0), 3);
  if (Math.abs(expectedWeightKg) > 0 && Math.abs(actualWeightKg) > 0 && !approximatelyEqual(expectedWeightKg, actualWeightKg)) {
    throw reviewError(
      "RAW_MATERIAL_OCR_REVIEW_LINE_WEIGHT_MISMATCH",
      `单据总重量与逐行复核不一致：汇总 ${expectedWeightKg}kg，明细 ${actualWeightKg}kg。`,
    );
  }
  const expectedAmount = directionalNumber(reviewValues.amount, documentDirection, 0);
  const actualAmount = roundNumber(activeLines.reduce((total, line) => total + directionalNumber(line?.values?.amount, documentDirection, 0), 0), 2);
  if (!amountReferenceOnly && Math.abs(expectedAmount) > 0 && Math.abs(actualAmount) > 0 && !approximatelyEqual(expectedAmount, actualAmount)) {
    throw reviewError(
      "RAW_MATERIAL_OCR_REVIEW_LINE_AMOUNT_MISMATCH",
      `单据金额与逐行复核不一致：汇总 ${expectedAmount}，明细 ${actualAmount}。`,
    );
  }
}

export function buildRawMaterialOcrReviewedRolls({
  inboundId = "",
  existingRolls = [],
  lines = [],
  documentDirection = "supplier_delivery",
} = {}) {
  if (documentDirection === "supplier_return") return [];
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
    const rollCount = positiveInteger(line?.reviewProjectedRollCount, 0) || positiveInteger(values.rollCount, 0);
    const excludedRollIndices = new Set(normalizePersistedExcludedRollIndices(line?.excludedRollIndices, rollCount));
    const submittedWeights = Array.isArray(values.rollWeightsKg)
      ? values.rollWeightsKg.map((weight) => nonNegativeNumber(weight, 0))
      : [];
    const activeRollIndices = Array.from({ length: rollCount }, (_, index) => index).filter((index) => !excludedRollIndices.has(index));
    if (rollCount > 1 && activeRollIndices.some((index) => !(submittedWeights[index] > 0))) {
      throw reviewError(
        "RAW_MATERIAL_OCR_REVIEW_LINE_WEIGHT_COUNT_MISMATCH",
        `OCR 明细行 ${cleanText(line?.lineId) || "待确认"} 必须逐卷填写 ${rollCount} 个分卷重量，不能用行总重平均代替。`,
      );
    }
    return activeRollIndices.map((index) => ({
      line,
      lineRollIndex: index,
      weightKg: rollCount === 1
        ? nonNegativeNumber(submittedWeights[0], nonNegativeNumber(values.totalWeightKg, 0))
        : nonNegativeNumber(submittedWeights[index], 0),
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
      weightReviewStatus: "单卷重量已人工确认",
      sourceLineRollIndex: lineRollIndex,
      labelStatus: "待打印标签",
      inventoryStatus: "不可用",
      location: cleanText(existing.location) || "原料待检区",
      signedNoteStatus: cleanText(existing.signedNoteStatus) || "入库无需逐卷扫码或签单",
      ocrLineId: lineId,
      productName: cleanText(line?.values?.productName),
      materialType: cleanText(line?.values?.materialType),
      supplierColor: cleanText(line?.values?.supplierColor),
      factoryColor: cleanText(line?.values?.factoryColor),
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

function normalizeLineValues(baseValues = {}, submittedValues = {}, { documentDirection = "supplier_delivery" } = {}) {
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
    if (numericKeys.has(key)) values[key] = reviewedDirectionalNumber(rawValue, key, documentDirection);
    if (key === "rollWeightsKg") values[key] = normalizeRollWeights(rawValue, documentDirection);
  }
  return enrichRawMaterialSpecValues(values);
}

function validateLineValues(values, lineId, {
  excludedRollIndices = [],
  projectedRollCount = 0,
  documentDirection = "supplier_delivery",
  standardColors = [],
} = {}) {
  const excluded = new Set(excludedRollIndices);
  const activeRollIndices = Array.from({ length: projectedRollCount }, (_, index) => index).filter((index) => !excluded.has(index));
  if (activeRollIndices.length === 0) return;
  const missing = [];
  if (!cleanText(values.productName) && !cleanText(values.materialType)) missing.push("材料/品名");
  if (documentDirection !== "supplier_return" && !isRawMaterialFactoryColor(values.factoryColor, standardColors)) missing.push("厂内标准色（需人工确认）");
  if (documentDirection !== "supplier_return" && !hasReviewableRawMaterialSpec(values.spec)) missing.push("规格");
  if (documentDirection === "supplier_return" && isRawMaterialSupplierReturnFabric(values) && !cleanText(values.returnMaterialCategory)) missing.push("退货布料类别（黑白布/彩布）");
  if (!cleanText(values.unit)) missing.push("单位");
  if (!positiveInteger(values.rollCount, 0) || positiveInteger(values.rollCount, 0) > 500) missing.push("卷/件数（1-500）");
  if (missing.length) {
    throw reviewError(
      "RAW_MATERIAL_OCR_REVIEW_LINE_REQUIRED_FIELDS_MISSING",
      `OCR 明细行 ${lineId || "待确认"} 缺少：${missing.join("、")}。`,
    );
  }
  const unitPrice = Math.abs(Number(values.unitPrice) || 0);
  const amount = Math.abs(Number(values.amount) || 0);
  const totalWeightKg = Math.abs(Number(values.totalWeightKg) || 0);
  if (!(unitPrice > 0)) {
    throw reviewError(
      "RAW_MATERIAL_OCR_REVIEW_LINE_UNIT_PRICE_REQUIRED",
      `OCR 明细行 ${lineId || "待确认"} 的单价必须大于 0。`,
    );
  }
  if (!(amount > 0)) {
    throw reviewError(
      "RAW_MATERIAL_OCR_REVIEW_LINE_AMOUNT_REQUIRED",
      `OCR 明细行 ${lineId || "待确认"} 的金额必须大于 0。`,
    );
  }
  const rollCount = positiveInteger(values.rollCount, 0);
  if (projectedRollCount === 1 && !(Math.abs(directionalNumber(values.rollWeightsKg[0], documentDirection, 0)) > 0 || Math.abs(directionalNumber(values.totalWeightKg, documentDirection, 0)) > 0)) {
    throw reviewError(
      "RAW_MATERIAL_OCR_REVIEW_ROLL_WEIGHT_REQUIRED",
      `OCR 明细行 ${lineId || "待确认"} 缺少本卷独立重量，不能用整单汇总代替。`,
    );
  }
  if (projectedRollCount > 1 && activeRollIndices.some((index) => !(Math.abs(directionalNumber(values.rollWeightsKg[index], documentDirection, 0)) > 0))) {
    throw reviewError(
      "RAW_MATERIAL_OCR_REVIEW_LINE_WEIGHT_COUNT_MISMATCH",
      `OCR 明细行 ${lineId || "待确认"} 必须逐卷填写 ${rollCount} 个分卷重量，不能用行总重平均代替。`,
    );
  }
  if (!(totalWeightKg > 0)) {
    throw reviewError(
      "RAW_MATERIAL_OCR_REVIEW_LINE_TOTAL_WEIGHT_REQUIRED",
      `OCR 明细行 ${lineId || "待确认"} 的重量必须大于 0。`,
    );
  }
  if (!approximatelyEqualMoney(amount, roundNumber(totalWeightKg * unitPrice, 2))) {
    throw reviewError(
      "RAW_MATERIAL_OCR_REVIEW_LINE_AMOUNT_CALCULATION_MISMATCH",
      `OCR 明细行 ${lineId || "待确认"} 的重量 × 单价与行金额不一致。`,
    );
  }
  if (values.rollWeightsKg.length && activeRollIndices.length) {
    const weightTotal = roundNumber(activeRollIndices.reduce((total, index) => total + directionalNumber(values.rollWeightsKg[index], documentDirection, 0), 0), 3);
    if (Math.abs(values.totalWeightKg) > 0 && !approximatelyEqual(values.totalWeightKg, weightTotal)) {
      throw reviewError(
        "RAW_MATERIAL_OCR_REVIEW_LINE_WEIGHT_TOTAL_MISMATCH",
        `OCR 明细行 ${lineId || "待确认"} 的分卷重量与行总重不一致。`,
      );
    }
  }
}

function normalizeRollWeights(value, documentDirection = "supplier_delivery") {
  const entries = Array.isArray(value)
    ? value
    : cleanText(value)
      ? cleanText(value).split(/[,，\s]+/u)
      : [];
  const weights = entries.map((entry) => cleanText(entry) ? Number(entry) : 0);
  if (weights.some((weight) => !Number.isFinite(weight))) {
    throw reviewError("RAW_MATERIAL_OCR_REVIEW_LINE_WEIGHT_INVALID", "分卷重量必须是数字。");
  }
  return weights.map((weight) => roundNumber(
    documentDirection === "supplier_return" ? -Math.abs(weight) : Math.abs(weight),
    3,
  ));
}

function normalizeExcludedRollIndices(value, projectedRollCount, lineId) {
  if (value == null) return [];
  if (!Array.isArray(value)) {
    throw reviewError("RAW_MATERIAL_OCR_REVIEW_EXCLUSION_INVALID", `OCR 明细行 ${lineId || "待确认"} 的误识别卷排除格式无效。`);
  }
  const normalized = [...new Set(value.map(Number))].sort((left, right) => left - right);
  if (normalized.some((index) => !Number.isInteger(index) || index < 0 || index >= projectedRollCount)) {
    throw reviewError("RAW_MATERIAL_OCR_REVIEW_EXCLUSION_INVALID", `OCR 明细行 ${lineId || "待确认"} 的误识别卷序号无效。`);
  }
  return normalized;
}

function normalizePersistedExcludedRollIndices(value, projectedRollCount) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map(Number))].filter(
    (index) => Number.isInteger(index) && index >= 0 && index < projectedRollCount,
  );
}

function getActiveReviewedRollCount(line = {}) {
  const projectedRollCount = positiveInteger(line.reviewProjectedRollCount, 0) || positiveInteger(line?.values?.rollCount, 0);
  return Math.max(0, projectedRollCount - normalizePersistedExcludedRollIndices(line.excludedRollIndices, projectedRollCount).length);
}

function normalizeRollWeightDraft(value, count) {
  const entries = Array.isArray(value)
    ? value
    : cleanText(value)
      ? cleanText(value).split(/[,，\s]+/u)
      : [];
  return Array.from({ length: Math.max(1, count) }, (_, index) => entries[index] ?? "");
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

function directionalNumber(value, documentDirection, fallback) {
  const text = cleanText(value);
  if (!text) return fallback;
  const number = Number(text);
  if (!Number.isFinite(number)) return fallback;
  return documentDirection === "supplier_return" ? -Math.abs(number) : Math.abs(number);
}

function reviewedDirectionalNumber(value, key, documentDirection) {
  const text = cleanText(value);
  if (!text) return 0;
  const number = Number(text);
  if (!Number.isFinite(number)) {
    throw reviewError("RAW_MATERIAL_OCR_REVIEW_LINE_NUMBER_INVALID", `OCR 明细行的${key}必须是数字。`);
  }
  if (["totalWeightKg", "amount"].includes(key) && documentDirection === "supplier_return") return -Math.abs(number);
  if (number < 0) {
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

function approximatelyEqualMoney(left, right) {
  const a = Number(left);
  const b = Number(right);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return false;
  return Math.abs(a - b) <= 0.05;
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
