import {readFiniteRawMaterialNumber} from './rawMaterialNumbers.js';
export function resolveRawMaterialCostPrice(inbound = {}, consumption = {}) {
  const rolls = Array.isArray(inbound.rolls) ? inbound.rolls : [];
  const matches = rolls.filter(roll=>roll.id === consumption.rollId);
  if (matches.length > 1 || (rolls.length && !matches.length)) return null;
  const roll = matches[0];
  const price = readFiniteRawMaterialNumber(roll?.unitPrice);
  if (price !== null && price > 0) return price;
  // OCR owns line-specific prices; its missing/invalid price must not borrow the header.
  if (roll?.ocrLineId || (price !== null && price < 0)) return null;
  const distinctPrices = new Set(rolls.map(row=>readFiniteRawMaterialNumber(row.unitPrice)).filter(value=>value !== null && value > 0));
  if (distinctPrices.size > 0 || rolls.some((row) => row.ocrLineId)) return null;
  // Historical manual rolls normalize absent price to zero. Their receipt price remains the fallback.
  const legacy = readFiniteRawMaterialNumber(inbound.unitPrice ?? inbound.unit_price);
  return legacy !== null && legacy > 0 ? legacy : null;
}
