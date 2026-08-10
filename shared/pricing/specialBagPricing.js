import specialBagPricingRules from "./special-bag-pricing-rules.json" with { type: "json" };
import defaultMaterialPriceSnapshot from "./special-bag-material-price.snapshot.json" with { type: "json" };

export { defaultMaterialPriceSnapshot, specialBagPricingRules };

function round(value, decimals) {
  const factor = 10 ** decimals;
  return Math.round((Number(value) + Number.EPSILON) * factor) / factor;
}

function customizationUnitFee(quantity, rules) {
  return [...rules.specialCustomizationFeeTiers]
    .sort((left, right) => right.minQuantity - left.minQuantity)
    .find((tier) => quantity >= tier.minQuantity)?.unitFee ?? 0;
}

export function calculateSpecialBagPricing(
  input = {},
  rules = specialBagPricingRules,
  materialPriceSnapshot = defaultMaterialPriceSnapshot,
) {
  const widthCm = Number(input.widthCm);
  const heightCm = Number(input.heightCm);
  const gussetCm = Number(input.gussetCm);
  const quantity = Number(input.quantity);
  const handleId = input.handleId === "extended" ? "extended" : "regular";
  const values = { widthCm, heightCm, gussetCm, quantity };
  for (const [key, value] of Object.entries(values)) {
    if (!Number.isFinite(value) || value <= 0) throw new TypeError(`${key} must be a positive number`);
  }

  const defaults = rules.defaults;
  const bodyMaterialPriceYuanPerTon = Number(materialPriceSnapshot?.body?.yuanPerTon);
  const handleMaterialPriceYuanPerTon = Number(materialPriceSnapshot?.handle?.yuanPerTon);
  if (!Number.isFinite(bodyMaterialPriceYuanPerTon) || bodyMaterialPriceYuanPerTon <= 0) {
    throw new TypeError("body material price snapshot must be a positive number");
  }
  if (!Number.isFinite(handleMaterialPriceYuanPerTon) || handleMaterialPriceYuanPerTon <= 0) {
    throw new TypeError("handle material price snapshot must be a positive number");
  }
  const internalDecimals = rules.rounding.internalCostDecimals;
  const customerDecimals = rules.rounding.customerUnitPriceDecimals;
  const bodyWidthMetres = (heightCm * 2 + gussetCm + defaults.foldCm * 2) / 100;
  const bodyLengthMetres = (widthCm + gussetCm + defaults.seamCm) / 100;
  const bodyMaterialUnitCost = bodyWidthMetres
    * bodyLengthMetres
    * (defaults.bodyGsm / 1_000_000)
    * bodyMaterialPriceYuanPerTon;
  const handleCost = (lengthCm) => (defaults.handleWidthCm / 100)
    * (lengthCm / 100)
    * (defaults.handleGsm / 1_000_000)
    * handleMaterialPriceYuanPerTon
    * defaults.handleCount;
  const regularHandleMaterialUnitCost = handleCost(defaults.regularHandleLengthCm);
  const selectedHandleMaterialUnitCost = handleCost(
    handleId === "extended" ? defaults.extendedHandleLengthCm : defaults.regularHandleLengthCm,
  );
  const baseUnitCostWithRegularHandle = round(
    bodyMaterialUnitCost + regularHandleMaterialUnitCost + defaults.laborElectricityUnitCost,
    customerDecimals,
  );
  const handleUnitAddon = round(selectedHandleMaterialUnitCost - regularHandleMaterialUnitCost, customerDecimals);
  const specialCustomizationUnitFee = customizationUnitFee(quantity, rules);
  const bagUnitPrice = round(baseUnitCostWithRegularHandle + specialCustomizationUnitFee, customerDecimals);

  return {
    ruleVersion: rules.version,
    materialPriceVersion: materialPriceSnapshot.version,
    materialPriceSource: materialPriceSnapshot.source,
    bodyWidthMetres: round(bodyWidthMetres, internalDecimals),
    bodyLengthMetres: round(bodyLengthMetres, internalDecimals),
    bodyMaterialUnitCost: round(bodyMaterialUnitCost, internalDecimals),
    regularHandleMaterialUnitCost: round(regularHandleMaterialUnitCost, internalDecimals),
    selectedHandleMaterialUnitCost: round(selectedHandleMaterialUnitCost, internalDecimals),
    laborElectricityUnitCost: round(defaults.laborElectricityUnitCost, internalDecimals),
    baseUnitCostWithRegularHandle,
    handleUnitAddon,
    specialCustomizationUnitFee: round(specialCustomizationUnitFee, customerDecimals),
    bagUnitPrice,
    selectedBagUnitPrice: round(bagUnitPrice + handleUnitAddon, customerDecimals),
  };
}

export function getPublicSpecialQuoteRules(
  rules = specialBagPricingRules,
  materialPriceSnapshot = defaultMaterialPriceSnapshot,
) {
  const tier = (minimum) => rules.specialCustomizationFeeTiers.find((item) => item.minQuantity === minimum)?.unitFee ?? 0;
  const defaults = rules.defaults;
  const handleMaterialCost = (lengthCm) => (defaults.handleWidthCm / 100)
    * (lengthCm / 100)
    * (defaults.handleGsm / 1_000_000)
    * Number(materialPriceSnapshot.handle.yuanPerTon)
    * defaults.handleCount;
  const extendedHandleUnitAddon = round(
    handleMaterialCost(defaults.extendedHandleLengthCm) - handleMaterialCost(defaults.regularHandleLengthCm),
    rules.rounding.customerUnitPriceDecimals,
  );
  return {
    version: rules.version,
    materialPriceVersion: materialPriceSnapshot.version,
    materialPricePolicy: "latest_confirmed_supplier_batch_until_order",
    ...rules.bounds,
    extendedHandlePricing: "material_delta",
    extendedHandlePriceLabel: "按用料计算",
    extendedHandleUnitAddon,
    quantityAddons: { from5000: tier(5_000), from10000: tier(10_000) },
  };
}
