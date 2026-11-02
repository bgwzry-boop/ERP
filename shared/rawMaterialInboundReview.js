import { enrichRawMaterialSpecValues, parseRawMaterialSpec } from "./rawMaterialSpec.js";
import { isRawMaterialFactoryColor } from "./rawMaterialFactoryColors.js";
import { hasStrongRawMaterialSupplierReturnEvidence, hasAmbiguousRawMaterialSupplierReturnEvidence, RAW_MATERIAL_MIXED_DIRECTION_MESSAGE } from "./rawMaterialSupplierReturn.js";
import { applyRawMaterialOcrLineReviews, buildRawMaterialOcrReviewedRolls, validateRawMaterialOcrLineReviewSummary } from "./rawMaterialOcrLineReview.js";

export function applyRawMaterialInboundReview({ before = {}, reviewFields, lineReviews, operatorName, operatorId, now, standardColors = [] }) {
  // The evidence shape owns the checks; changing a provider name is not an
  // alternate review path. Hand-entered rolls do not need fabricated OCR rows.
  const isOcrDraft = cleanText(before.ocrProvider) === "tencent_cloud_table_v3" || (before.ocrLines ?? []).length > 0;
  const documentDirection = cleanText(before.documentDirection) || "supplier_delivery";
  const isSupplierReturn = documentDirection === "supplier_return";
  const reviewableStatuses = isOcrDraft ? ["已识别待复核"] : ["已拍照待识别", "已识别待复核", "待补充/待确认"];
  if (!reviewableStatuses.includes(cleanText(before.status)) || (before.rolls ?? []).some((roll) => ["可用", "机边领用", "已消耗"].includes(cleanText(roll.inventoryStatus)))) {
    throw Object.assign(new Error("只有尚未复核、未形成库存的原材料草稿可以复核。"), {
      statusCode: 409,
      code: "RAW_MATERIAL_OCR_REVIEW_NOT_ALLOWED",
    });
  }
  if (hasAmbiguousRawMaterialSupplierReturnEvidence(before)) {
    throw Object.assign(new Error(RAW_MATERIAL_MIXED_DIRECTION_MESSAGE), { statusCode: 409, code: "RAW_MATERIAL_DOCUMENT_DIRECTION_AMBIGUOUS" });
  }
  if (hasStrongRawMaterialSupplierReturnEvidence(before)) {
    throw Object.assign(new Error("原单含退货明细，与当前收货方向不一致。请对照原图，先点“改为退货单核对”；不能按正数收货入库。"), {
      statusCode: 409,
      code: "RAW_MATERIAL_DOCUMENT_DIRECTION_CONFLICT",
    });
  }
  const reviewedValues = resolveReviewedOcrValues(before, reviewFields, { documentDirection });
  if (isOcrDraft) Object.assign(reviewedValues, enrichRawMaterialSpecValues(reviewedValues));
  if (isOcrDraft) validateReviewedOcrValues(reviewedValues, { documentDirection });
  const reviewedLines = isOcrDraft
    ? applyRawMaterialOcrLineReviews({
        lines: before.ocrLines,
        lineReviews,
        operatorName,
        operatorId,
        now,
        documentDirection, standardColors,
      })
    : before.ocrLines;
  if (isOcrDraft) validateRawMaterialOcrLineReviewSummary({
    lines: reviewedLines,
    reviewValues: reviewedValues,
    documentDirection,
    amountReferenceOnly: before.documentPriceReferenceOnly === true,
  });
  if (!isOcrDraft) validateManualRollReview(before, reviewedValues, { documentDirection, standardColors });
  return {
    ...before,
    ...reviewedValues,
    status: isSupplierReturn ? "退货单已复核" : "已复核待打印标签",
    ocrStatus: isSupplierReturn ? "退货明细人工复核已通过；不生成入库卷标、不增加库存，进入厂家负数对账依据" : "人工复核已通过",
    ocrReviewFields: isOcrDraft
      ? (before.ocrReviewFields ?? []).map((field) => {
          const value = Object.hasOwn(reviewedValues, field.key) ? reviewedValues[field.key] : field.value;
          return {
            ...field,
            value,
            reviewStatus: areValuesEqual(value, field.recognizedValue) ? "人工接受" : "人工修改",
            reviewedBy: operatorName,
            reviewedByUserId: operatorId,
            reviewedAt: now,
          };
        })
      : before.ocrReviewFields,
    ocrLines: reviewedLines,
    reviewedBy: operatorName,
    reviewedByUserId: operatorId,
    reviewedAt: now,
    nextStep: isSupplierReturn
      ? "退货复核已留档并作为负数厂家对账依据；不进入入库打印和可用库存。实物退厂使用独立退货出库流程。"
      : "打印系统卷标；标签打印后仍需逐卷与实物人工核对，确认一致才算可用原料。",
    note: isSupplierReturn
      ? "该单据为供应商退货方向，保存带符号的退货复核和原单证据，供厂家月结抵扣；不生成入库卷标、不增加库存。"
      : before.note,
    rolls: isSupplierReturn
      ? []
      : isOcrDraft
      ? buildRawMaterialOcrReviewedRolls({
          inboundId: before.id,
          existingRolls: before.rolls,
          lines: reviewedLines,
          documentDirection,
        })
      : (before.rolls ?? []).map((roll) => ({
          ...roll,
          factoryColorMappingStatus: cleanText(roll.factoryColor) ? (roll.factoryColorMappingStatus || "human_confirmed") : "supplier_provisional",
          labelStatus: "待打印标签",
        })),
  };
}

function resolveReviewedOcrValues(inbound, reviewFields, { documentDirection = "supplier_delivery" } = {}) {
  const allowedKeys = new Set([
    "supplierName", "deliveryNoteNo", "materialType", "productName", "spec", "supplierColor",
    "factoryColor", "rollCount", "totalWeightKg", "unit", "unitPrice", "amount",
  ]);
  const submitted = Array.isArray(reviewFields)
    ? Object.fromEntries(reviewFields.map((field) => [cleanText(field?.key), field?.value]))
    : reviewFields && typeof reviewFields === "object" ? reviewFields : {};
  const values = Object.fromEntries([...allowedKeys].map((key) => [key, inbound[key]]));
  for (const field of inbound.ocrReviewFields ?? []) {
    if (allowedKeys.has(field.key)) values[field.key] = Object.hasOwn(submitted, field.key) ? submitted[field.key] : field.value;
  }
  for (const [key, value] of Object.entries(submitted)) if (allowedKeys.has(key)) values[key] = value;
  for (const key of ["rollCount", "totalWeightKg", "unitPrice", "amount"]) values[key] = Number(values[key]) || 0;
  if (documentDirection === "supplier_return") {
    values.totalWeightKg = values.totalWeightKg ? -Math.abs(values.totalWeightKg) : 0;
    values.amount = values.amount ? -Math.abs(values.amount) : 0;
  }
  for (const key of allowedKeys) {
    if (!["rollCount", "totalWeightKg", "unitPrice", "amount"].includes(key)) values[key] = cleanText(values[key]);
  }
  return values;
}

function validateManualRollReview(before, values, { documentDirection, standardColors }) {
  if (!cleanText(values.supplierName)) throw reviewError("RAW_MATERIAL_INBOUND_REVIEW_SUPPLIER_REQUIRED", "供应商还没确认，请补齐后再复核。");
  const rollCount = Number(values.rollCount);
  if (!Number.isInteger(rollCount) || rollCount < 1 || rollCount > 500) throw reviewError("RAW_MATERIAL_INBOUND_REVIEW_ROLL_COUNT_REQUIRED", "请确认本单卷/件数（1–500）。");
  const totalWeightKg = Number(values.totalWeightKg);
  if (!Number.isFinite(totalWeightKg) || (documentDirection === "supplier_return" ? totalWeightKg >= 0 : totalWeightKg <= 0)) {
    throw reviewError("RAW_MATERIAL_INBOUND_REVIEW_WEIGHT_REQUIRED", "请确认本单总重量，不能以空白或零重量完成复核。");
  }
  if (documentDirection === "supplier_return") {
    if (!(Number(values.amount) < 0)) throw reviewError("RAW_MATERIAL_INBOUND_REVIEW_RETURN_AMOUNT_REQUIRED", "请确认退货金额，退货复核必须保留负数对账金额。");
    return;
  }
  const rolls = before.rolls ?? [];
  if (rolls.length !== rollCount) throw reviewError("RAW_MATERIAL_INBOUND_REVIEW_ROLL_COUNT_MISMATCH", `单据卷/件数与逐卷明细不一致：汇总 ${rollCount}，明细 ${rolls.length}。`);
  for (const [index, roll] of rolls.entries()) {
    const missing = [];
    const factoryColor = cleanText(roll.factoryColor), supplierColor = cleanText(roll.supplierColor);
    if (!factoryColor && !supplierColor) missing.push("厂家票面颜色或厂内标准色");
    if (factoryColor && !isRawMaterialFactoryColor(factoryColor, standardColors)) missing.push("有效的厂内标准色");
    const width = Number(roll.widthCm) || parseRawMaterialSpec(roll.spec || values.spec).widthCm || Number(before.widthCm);
    if (!(width > 0)) missing.push("宽幅");
    if (!Number.isFinite(Number(roll.weightKg)) || !(Number(roll.weightKg) > 0)) missing.push("本卷独立重量");
    if (missing.length) throw reviewError("RAW_MATERIAL_INBOUND_REVIEW_ROLL_REQUIRED_FIELDS_MISSING", `第 ${index + 1} 卷还需确认：${missing.join("、")}。`);
  }
  const actualWeight = rolls.reduce((total, roll) => total + Number(roll.weightKg), 0);
  if (Math.abs(totalWeightKg - actualWeight) > Math.max(0.05, Math.abs(actualWeight) * 0.02)) {
    throw reviewError("RAW_MATERIAL_INBOUND_REVIEW_WEIGHT_MISMATCH", `单据总重量与逐卷重量不一致：汇总 ${totalWeightKg}kg，明细 ${Math.round(actualWeight * 1000) / 1000}kg。`);
  }
}

function reviewError(code, message) {
  return Object.assign(new Error(message), { statusCode: 422, code });
}

function validateReviewedOcrValues(values, { documentDirection = "supplier_delivery" } = {}) {
  const missing = [];
  if (!cleanText(values.supplierName)) missing.push("供应商");
  if (!cleanText(values.materialType) && !cleanText(values.productName)) missing.push("材料/品名");
  if (documentDirection !== "supplier_return" && !cleanText(values.spec)) missing.push("规格");
  if (!cleanText(values.unit)) missing.push("单位");
  if (!Number.isInteger(Number(values.rollCount)) || Number(values.rollCount) <= 0 || Number(values.rollCount) > 500) missing.push("卷/件数（1-500）");
  if (missing.length) {
    throw Object.assign(new Error(`OCR 人工复核未完成：${missing.join("、")}`), {
      statusCode: 422,
      code: "RAW_MATERIAL_OCR_REVIEW_REQUIRED_FIELDS_MISSING",
    });
  }
}

function areValuesEqual(left, right) {
  return typeof left === "number" || typeof right === "number" ? Number(left) === Number(right) : cleanText(left) === cleanText(right);
}

function cleanText(value) {
  return String(value ?? "").trim();
}
