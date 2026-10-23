import {readFiniteRawMaterialNumber} from './rawMaterialNumbers.js';
import {assertRawMaterialConsumptionMeasurement} from './rawMaterialMeasurements.js';
import {normalizeRawMaterialCostUnit} from './rawMaterialCostUnit.js';

export function readRawMaterialConsumptionMeasurement(roll = {}, body = {}, unit = roll.unit) {
  assertRawMaterialConsumptionMeasurement(body);
  const current = readFiniteRawMaterialNumber(roll.weightKg);
  const requestedWeight = body.consumedWeightKg ?? body.weightKg;
  const requestedQuantity = body.consumedQuantity ?? body.quantity;
  const quantity = requestedQuantity === undefined ? 1 : Number(requestedQuantity);
  if (requestedQuantity !== undefined && quantity !== 1) throw Object.assign(new Error('当前消耗只支持整件；不能把部分件数当作整件。'), {statusCode:422,code:'RAW_MATERIAL_PARTIAL_QUANTITY_CONSUMPTION_NOT_SUPPORTED'});
  if (current === 0 && normalizeRawMaterialCostUnit(roll.unit || unit) === '件' && requestedWeight === undefined) {
    return {machineSideWeightKg:0,consumedWeightKg:0,consumedQuantity:quantity,remainingMachineSideWeightKg:0,partialConsumption:false};
  }
  const availableGrams = current === null ? NaN : Math.round(current * 1000);
  if (!(current > 0) || !Number.isSafeInteger(availableGrams) || availableGrams <= 0) throw Object.assign(new Error('当前机边卷缺少有效重量，请核对库存记录；不能用原卷余重或旧领料重量计算消耗。'), {statusCode:422,code:'RAW_MATERIAL_CONSUMPTION_MACHINE_WEIGHT_REQUIRED'});
  if (requestedQuantity !== undefined) throw Object.assign(new Error('当前卷按公斤消耗，不能用件数代替重量。'), {statusCode:422,code:'RAW_MATERIAL_CONSUMPTION_MEASUREMENT_INVALID'});
  const consumedGrams = requestedWeight === undefined ? availableGrams : Math.round(Number(requestedWeight) * 1000);
  if (!Number.isSafeInteger(consumedGrams) || consumedGrams <= 0) throw Object.assign(new Error('请填写有效的实测消耗重量。'), {statusCode:422,code:'RAW_MATERIAL_CONSUMPTION_MEASUREMENT_INVALID'});
  if (consumedGrams > availableGrams) throw Object.assign(new Error('消耗重量超过当前机边重量，请核对后重试。'), {statusCode:422,code:'RAW_MATERIAL_CONSUMPTION_WEIGHT_EXCEEDS_MACHINE_SIDE'});
  return {machineSideWeightKg:availableGrams/1000,consumedWeightKg:consumedGrams/1000,consumedQuantity:0,remainingMachineSideWeightKg:(availableGrams-consumedGrams)/1000,partialConsumption:consumedGrams<availableGrams};
}
