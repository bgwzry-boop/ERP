import {readFiniteRawMaterialNumber} from "./rawMaterialNumbers.js";

export function readRawMaterialLeftoverReviewWeight(body = {}, returnedWeightKg = 0) {
  const raw = body.reviewedWeightKg ?? body.leftoverWeightKg ?? body.weightKg;
  const value = readFiniteRawMaterialNumber(raw);
  if (value === null || value <= 0 || !Number.isSafeInteger(Math.round(value * 1000)) || Math.round(value * 1000) <= 0) {
    throw Object.assign(new Error("请填写本次重新称得的余料重量，不能用退回记录代替实称。"), {statusCode: 422, code: "RAW_MATERIAL_LEFTOVER_REVIEW_WEIGHT_REQUIRED"});
  }
  const weight = Math.round(value * 1000) / 1000;
  if (returnedWeightKg > 0 && weight - returnedWeightKg > 0.001) {
    throw Object.assign(new Error("复核重量超过原退回重量，请核对卷号和称重记录。"), {statusCode: 422, code: "RAW_MATERIAL_LEFTOVER_REVIEW_WEIGHT_EXCEEDS_RETURNED"});
  }
  return weight;
}
