const invalid = message => Object.assign(new Error(message), { code: 'FULFILLMENT_BILLING_HISTORY_CONFLICT', statusCode: 409 });
function cents(value) {
  if (value === null || value === undefined || value === '' || !Number.isFinite(Number(value)) || Number(value) < 0) throw invalid('计费金额不完整，请核实价格快照与历史入账。');
  const result = Math.round((Number(value) + Number.EPSILON) * 100);
  if (!Number.isSafeInteger(result)) throw invalid('计费金额超出支持范围。');
  return result;
}
function quantity(value) {
  if (value === null || value === undefined || value === '' || !Number.isSafeInteger(Number(value)) || Number(value) < 0) throw invalid('计费数量不完整，请核实历史明细。');
  return Number(value);
}
// Prepare an allocation; the caller MUST compare this history and price
// snapshot inside the write transaction before persisting the returned amount.
export function allocateFulfillmentAmount({ totalAmount, totalChargeableQty, chargeableQty, priorLines = [] }) {
  const totalCents = cents(totalAmount);
  const totalQty = quantity(totalChargeableQty);
  const currentQty = quantity(chargeableQty);
  if (totalQty <= 0) throw invalid('价格快照计费数量必须大于零。');
  const seen = new Set();
  let priorQty = 0, priorCents = 0;
  for (const line of priorLines) {
    const id = String(line.fulfillmentId ?? line.fulfillment_id ?? '').trim();
    if (!id || seen.has(id)) throw invalid('历史交付关联缺失或重复，请先核对。');
    seen.add(id);
    priorQty += quantity(line.chargeableQty ?? line.chargeable_qty);
    priorCents += cents(line.finalAmount ?? line.final_amount);
  }
  if (!Number.isSafeInteger(priorQty) || !Number.isSafeInteger(priorCents) || priorQty + currentQty > totalQty) throw invalid('累计计费数量超过价格快照数量，请核实补发或改量依据。');
  // BigInt avoids precision loss when multiplying cents by large quantities.
  const roundedTarget = qty => Number((BigInt(totalCents) * BigInt(qty) * 2n + BigInt(totalQty)) / (2n * BigInt(totalQty)));
  if (priorCents !== roundedTarget(priorQty)) throw invalid('历史入账金额与当前价格快照不一致，请核实调整依据。');
  const targetCents = roundedTarget(priorQty + currentQty);
  return { amount: (targetCents - priorCents) / 100, priorChargeableQty: priorQty, priorAmount: priorCents / 100, cumulativeChargeableQty: priorQty + currentQty, cumulativeAmount: targetCents / 100 };
}
