import {normalizeRawMaterialCostUnit} from "./rawMaterialCostUnit.js";
export function rawMaterialConsumptionCostBasis(record = {}, unitPrice, pricingUnit = record.unit || (Number(record.consumedWeightKg) > 0 ? "kg" : "件")) {
  const price = Number(unitPrice);
  const weight = Number(record.consumedWeightKg ?? 0);
  const quantity = Number(record.consumedQuantity ?? 0);
  if (!Number.isFinite(price) || price <= 0 || !Number.isFinite(weight) || weight < 0 || !Number.isFinite(quantity) || quantity < 0) return null;
  const allocatedWeightKg = Math.round(weight * 1000) / 1000;
  const allocatedQuantity = weight > 0 ? 0 : quantity;
  if (weight > 0 ? allocatedWeightKg <= 0 : allocatedQuantity <= 0) return null;
  const unit = normalizeRawMaterialCostUnit(pricingUnit);
  if (!unit || ((unit === "kg" || unit === "吨") ? allocatedWeightKg <= 0 : weight > 0 || allocatedQuantity <= 0)) return null;
  const pricedQuantity = unit === "吨" ? allocatedWeightKg / 1000 : unit === "kg" ? allocatedWeightKg : allocatedQuantity;
  const amountCents = Math.round(pricedQuantity * price * 100);
  if (!Number.isSafeInteger(amountCents) || amountCents < 0) return null;
  return {allocatedWeightKg, allocatedQuantity, allocatedCostAmount: amountCents / 100};
}
