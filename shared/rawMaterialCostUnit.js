export function normalizeRawMaterialCostUnit(value) {
  const unit = String(value ?? '').trim().toLowerCase();
  if (['kg','公斤','千克'].includes(unit)) return 'kg';
  if (['吨','t','ton','tonne'].includes(unit)) return '吨';
  if (['件','个','只'].includes(unit)) return '件';
  if (unit === '卷') return '卷';
  return null;
}
export function resolveRawMaterialCostUnit(inbound = {}, consumption = {}) {
  const rolls = Array.isArray(inbound.rolls) ? inbound.rolls : [];
  const matches = rolls.filter(roll=>roll.id === consumption.rollId);
  if (matches.length > 1 || (rolls.length && !matches.length)) return null;
  const roll = matches[0];
  if (String(roll?.unit ?? '').trim()) return normalizeRawMaterialCostUnit(roll.unit);
  if (roll?.ocrLineId) {
    const lines = (inbound.ocrLines ?? []).filter(line=>line.lineId === roll.ocrLineId);
    return lines.length === 1 ? normalizeRawMaterialCostUnit(lines[0].values?.unit) : null;
  }
  return normalizeRawMaterialCostUnit(inbound.unit);
}
export function formatRawMaterialAllocationBasis(basis, price, unit) {
  if (unit === '吨') return `${basis.allocatedWeightKg}kg ÷ 1000 × ${price}元/吨`;
  if (unit === 'kg') return `${basis.allocatedWeightKg}kg × ${price}元/kg`;
  return `${basis.allocatedQuantity}${unit} × ${price}元/${unit}`;
}
