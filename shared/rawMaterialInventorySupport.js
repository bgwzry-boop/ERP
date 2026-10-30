import {normalizeFactoryStandardColor} from "./factoryStandardColors.js";
import {resolveRawMaterialCostPrice} from "./rawMaterialCostPrice.js";
import {resolveRawMaterialCostUnit} from "./rawMaterialCostUnit.js";
import {
  RAW_MATERIAL_STANDARD_FABRIC_GSM,
  classifyRawMaterialCategory,
  parseRawMaterialSpec,
} from "./rawMaterialSpec.js";

export function buildRawMaterialStockLookup(inbounds = [], filters = {}) {
  const color = cleanText(filters.color);
  const colorKey = normalizeColorKey(color);
  const widthCm = positiveNumber(filters.widthCm);
  const gramWeightGsm = positiveNumber(filters.gramWeightGsm) || RAW_MATERIAL_STANDARD_FABRIC_GSM;
  const rolls = (Array.isArray(inbounds) ? inbounds : []).flatMap((inbound) => (inbound.rolls ?? []).map((roll) => ({
    ...roll,
    inbound,
    color: cleanText(roll.factoryColor || roll.supplierColor || inbound.factoryColor || inbound.supplierColor),
    widthCm: positiveNumber(roll.widthCm) || resolveSpec(inbound).widthCm,
    gramWeightGsm: positiveNumber(roll.gramWeightGsm) || resolveSpec(inbound).gramWeightGsm,
    kgReferencePrice: resolveKgReferencePrice(inbound, roll),
  }))).filter((roll) =>
    (!colorKey || normalizeColorKey(roll.color) === colorKey) &&
    (!widthCm || roll.widthCm === widthCm) &&
    (!gramWeightGsm || roll.gramWeightGsm === gramWeightGsm),
  );
  const availableRolls = rolls.filter((roll) => roll.inventoryStatus === "可用");
  const machineSideRolls = rolls.filter((roll) => roll.inventoryStatus === "机边领用");
  const latestPricedRoll = [...rolls]
    .filter((roll) => roll.kgReferencePrice !== null && ["可用", "机边领用", "已消耗", "余料待复核"].includes(roll.inventoryStatus))
    .sort((left, right) => String(right.inbound?.receivedAt || "").localeCompare(String(left.inbound?.receivedAt || "")))[0];
  return {
    color,
    widthCm,
    gramWeightGsm,
    materialCategory: classifyRawMaterialCategory({
      widthCm,
      texts: [filters.materialCategory, filters.productName, filters.materialType, color],
    }),
    availableWeightKg: roundWeight(sumWeight(availableRolls)),
    availableRollCount: availableRolls.length,
    machineSideWeightKg: roundWeight(sumWeight(machineSideRolls)),
    machineSideRollCount: machineSideRolls.length,
    latestUnitPrice: latestPricedRoll?.kgReferencePrice ?? null,
    priceUnit: "元/kg",
    matchingInboundCount: new Set(rolls.map((roll) => roll.inbound?.id).filter(Boolean)).size,
  };
}

export function calculateRawMaterialOrderRequirement(order = {}) {
  const size = cleanText(order.size ?? order.orderLine?.size);
  const dimensions = (size.match(/\d+(?:\.\d+)?/gu) ?? []).map(Number);
  const qty = positiveNumber(order.plannedQty ?? order.qty ?? order.originalQty ?? order.orderLine?.qty ?? order.orderLine?.originalQty);
  if (dimensions.length < 3 || !qty) {
    return { status: "需复核", reason: "订单缺少可计算的宽*高*侧尺寸或数量。", requiredWidthCm: 0, requiredWeightKg: 0 };
  }
  const [bagWidthCm, bagHeightCm, gussetCm] = dimensions;
  const requiredWidthCm = roundWeight(bagHeightCm * 2 + gussetCm + 6);
  const materialLengthCm = roundWeight(bagWidthCm + gussetCm + 2);
  const requiredWeightKg = roundWeight(
    (requiredWidthCm / 100) * (materialLengthCm / 100) * (RAW_MATERIAL_STANDARD_FABRIC_GSM / 1000) * qty,
  );
  return {
    status: "已计算",
    reason: "按袋高*2+侧宽+6计算所需布料宽幅，按袋宽+侧宽+2估算单袋用料长度。",
    requiredWidthCm,
    materialLengthCm,
    gramWeightGsm: RAW_MATERIAL_STANDARD_FABRIC_GSM,
    requiredWeightKg,
    qty,
  };
}

export function evaluateRawMaterialOrderSupport({ inbounds = [], order = {} } = {}) {
  const requirement = calculateRawMaterialOrderRequirement(order);
  const color = cleanText(order.bagColor ?? order.color ?? order.orderLine?.bagColor ?? order.orderLine?.color);
  if (requirement.status !== "已计算" || !color) {
    return { ...requirement, color, supportStatus: "需复核", availableWeightKg: 0, shortageWeightKg: 0 };
  }
  // Supplier-only names are not confirmed matches to an order's factory colour.
  const matchedColourInbounds = inbounds.map(inbound => ({
    ...inbound, rolls: (inbound.rolls ?? []).filter(roll => roll.factoryColorMappingStatus !== "supplier_provisional"),
  }));
  const stock = buildRawMaterialStockLookup(matchedColourInbounds, {
    color,
    widthCm: requirement.requiredWidthCm,
    gramWeightGsm: RAW_MATERIAL_STANDARD_FABRIC_GSM,
  });
  const shortageWeightKg = roundWeight(Math.max(0, requirement.requiredWeightKg - stock.availableWeightKg));
  return {
    ...requirement,
    ...stock,
    supportStatus: shortageWeightKg > 0 ? "库存不足" : "支持订单",
    shortageWeightKg,
  };
}

function resolveSpec(value = {}) {
  const parsed = parseRawMaterialSpec(value.specRaw || value.spec);
  return {
    widthCm: positiveNumber(value.widthCm) || parsed.widthCm,
    gramWeightGsm: positiveNumber(value.gramWeightGsm) || parsed.gramWeightGsm,
  };
}

function normalizeColorKey(value) {
  return normalizeFactoryStandardColor(value) || cleanText(value).replace(/\s+/gu, "");
}

function resolveKgReferencePrice(inbound, roll) {
  const price = resolveRawMaterialCostPrice(inbound, {rollId: roll.id});
  const unit = resolveRawMaterialCostUnit(inbound, {rollId: roll.id});
  if (price === null || !["kg", "吨"].includes(unit)) return null;
  return unit === "吨" ? price / 1000 : price;
}

function sumWeight(rolls) {
  return rolls.reduce((total, roll) => total + positiveNumber(roll.weightKg ?? roll.remainingMachineSideWeightKg), 0);
}

function positiveNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : 0;
}

function roundWeight(value) {
  return Math.round((Number(value) || 0) * 1000) / 1000;
}

function cleanText(value) {
  return String(value ?? "").trim();
}
