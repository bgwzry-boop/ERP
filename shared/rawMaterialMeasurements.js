export function readRawMaterialLossMeasurement(body = {}) {
  const expected = body.expectedOutputQuantity ?? body.plannedOutputQuantity ?? body.estimatedOutputQuantity;
  const actual = body.actualQualifiedOutputQuantity ?? body.actualOutputQuantity ?? body.qualifiedOutputQuantity;
  const explicitLoss = body.lossQuantity ?? body.lossOutputQuantity;
  const validNumber = (value) => (typeof value === 'number' || typeof value === 'string' && value.trim() !== '') && Number.isFinite(Number(value)) && Math.abs(Number(value)) <= Number.MAX_SAFE_INTEGER;
  if (!validNumber(expected) || Number(expected) <= 0 || !validNumber(actual) || Number(actual) < 0 || (explicitLoss !== undefined && (!validNumber(explicitLoss) || Number(explicitLoss) < 0))) {
    throw Object.assign(new Error('请填写有效的预计产量和实际合格产量；预计产量须大于零，实际产量及损耗不能为负数。'), {statusCode: 422, code: 'RAW_MATERIAL_LOSS_MEASUREMENT_REQUIRED'});
  }
  const expectedOutputQuantity = Number(expected);
  const actualQualifiedOutputQuantity = Number(actual);
  const lossQuantity = Number(explicitLoss) > 0 ? Number(explicitLoss) : Math.max(0, expectedOutputQuantity - actualQualifiedOutputQuantity);
  return {expectedOutputQuantity, actualQualifiedOutputQuantity, lossQuantity, lossRatePercent: Math.round(lossQuantity / expectedOutputQuantity * 10000) / 100};
}


export function assertRawMaterialConsumptionMeasurement(body = {}) {
  for (const field of ['consumedWeightKg', 'weightKg', 'consumedQuantity', 'quantity']) {
    const value = body[field];
    if (value === undefined) continue;
    const weight = field.toLowerCase().includes('weight');
    if (!((typeof value === 'number' || typeof value === 'string' && value.trim() !== '') && Number.isFinite(Number(value)) && Number(value) > 0) || (weight && Math.round(Number(value) * 1000) <= 0)) {
      throw Object.assign(new Error('实测消耗必须是有效的正数；无效输入不能按整卷消耗处理。'), {statusCode: 422, code: 'RAW_MATERIAL_CONSUMPTION_MEASUREMENT_INVALID'});
    }
  }
}
