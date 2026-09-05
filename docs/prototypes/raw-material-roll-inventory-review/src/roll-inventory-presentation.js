import {
  RAW_MATERIAL_HANDLE_WIDTH_CM,
  RAW_MATERIAL_STANDARD_FABRIC_GSM,
  RAW_MATERIAL_STANDARD_HANDLE_GSM,
  parseRawMaterialSpec,
  resolveRawMaterialUsage,
} from "../../../../shared/rawMaterialSpec.js";

const textCollator = new Intl.Collator("zh-CN", { numeric: true, sensitivity: "base" });

const SUPPLIER_LIST_ALIASES = new Map([
  ["宁晋县腾胜无纺布有限公司", "腾胜无纺布"],
  ["宁晋县达翔塑料制品有限公司", "北陈无纺布"],
  ["河北北陈无纺布有限公司", "北陈无纺布"],
  ["北陈辅料", "北陈无纺布"],
  ["河北宏尚无纺布有限公司", "宏尚无纺布"],
  ["人意无纺布销售单", "人意无纺布"],
  ["人意无纺布有限公司", "人意无纺布"],
  ["新乐市鑫隆宏无纺布有限公司", "鑫隆宏无纺布"],
]);

function cleanText(value) {
  return String(value ?? "").trim();
}

function positiveNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : 0;
}

function widthNumberFromLabel(value) {
  const match = cleanText(value).match(/\d+(?:\.\d+)?/u);
  return match ? positiveNumber(match[0]) : 0;
}

function formatWidthNumber(value) {
  return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(2)));
}

export function compactSupplierName(value) {
  const supplierName = cleanText(value);
  if (!supplierName) return "供应商待确认";
  if (SUPPLIER_LIST_ALIASES.has(supplierName)) return SUPPLIER_LIST_ALIASES.get(supplierName);

  const withoutDocumentType = supplierName.replace(/(?:销货单|销售单|送货单)$/u, "");
  const withoutLegalSuffix = withoutDocumentType.replace(/(?:有限责任公司|股份有限公司|有限公司|公司)$/u, "");
  const withoutRegion = withoutLegalSuffix.replace(/^(?:河北省?|宁晋县|新乐市)/u, "");
  return withoutRegion || supplierName;
}

export function resolveRollWidth(inbound = {}, roll = {}) {
  const specification = resolveRollSpecification(inbound, roll);
  return { widthCm: specification.widthCm, label: specification.widthLabel, materialCategory: specification.materialCategory, materialUsage: specification.materialUsage };
}

export function resolveRollSpecification(inbound = {}, roll = {}) {
  const evidence = [
    roll.materialCategory,
    roll.productName,
    roll.materialType,
    roll.specDisplay,
    roll.spec,
    inbound.materialCategory,
    inbound.productName,
    inbound.materialType,
    inbound.specDisplay,
    inbound.spec,
  ].map(cleanText).filter(Boolean);
  const explicitWidthCm = positiveNumber(roll.widthCm)
    || positiveNumber(inbound.widthCm)
    || widthNumberFromLabel(roll.width);
  const parsedSpec = parseRawMaterialSpec(
    cleanText(roll.specDisplay || roll.spec || inbound.specDisplay || inbound.spec),
  );
  const confirmedWidthCm = explicitWidthCm || positiveNumber(parsedSpec.widthCm);
  const resolvedUsage = resolveRawMaterialUsage({ widthCm: confirmedWidthCm, texts: evidence });
  const widthCm = confirmedWidthCm || (resolvedUsage.materialCategory === "提手条" ? RAW_MATERIAL_HANDLE_WIDTH_CM : 0);
  const materialUsage = resolveRawMaterialUsage({ widthCm, texts: evidence });
  const handleStrip = materialUsage.materialCategory === "提手条";

  const isKnownFabric = !handleStrip && (
    widthCm > 0
    || evidence.some((value) => value === "布料" || value.includes("无纺布"))
  );
  const gramWeightGsm = positiveNumber(roll.gramWeightGsm)
    || positiveNumber(inbound.gramWeightGsm)
    || positiveNumber(parsedSpec.gramWeightGsm)
    || (handleStrip ? RAW_MATERIAL_STANDARD_HANDLE_GSM : isKnownFabric ? RAW_MATERIAL_STANDARD_FABRIC_GSM : 0);
  const widthLabel = widthCm
    ? `${formatWidthNumber(widthCm)}cm${handleStrip ? " 把条" : ""}`
    : "宽幅待确认";
  const gramWeightLabel = gramWeightGsm ? `${formatWidthNumber(gramWeightGsm)}克` : "克重待确认";
  const parsedFullLabel = parsedSpec.specNeedsReview ? "" : cleanText(parsedSpec.specDisplay);

  return {
    widthCm,
    widthLabel,
    materialCategory: materialUsage.materialCategory,
    materialUsage: materialUsage.materialUsage,
    gramWeightGsm,
    gramWeightLabel,
    fullLabel: parsedFullLabel || (widthCm && gramWeightGsm
      ? `${gramWeightLabel} × ${formatWidthNumber(widthCm)}cm`
      : cleanText(roll.specDisplay || roll.spec || inbound.specDisplay || inbound.spec) || "规格待确认"),
    isHandleStrip: handleStrip,
  };
}

export function compareInventoryRollsByWidth(left = {}, right = {}) {
  const leftWidth = positiveNumber(left.widthCm) || Number.POSITIVE_INFINITY;
  const rightWidth = positiveNumber(right.widthCm) || Number.POSITIVE_INFINITY;
  if (leftWidth !== rightWidth) return leftWidth - rightWidth;

  for (const key of ["color", "spec", "date", "id"]) {
    const comparison = textCollator.compare(cleanText(left[key]), cleanText(right[key]));
    if (comparison) return comparison;
  }
  return 0;
}

export function sortInventoryRollsByWidth(rolls = []) {
  return [...rolls].sort(compareInventoryRollsByWidth);
}

export function buildInventoryWidthOptions(rolls = []) {
  const unique = new Map();
  for (const roll of rolls) {
    const label = cleanText(roll.width) || "宽幅待确认";
    if (!unique.has(label)) unique.set(label, roll);
  }
  const ordered = [...unique.entries()]
    .sort(([, left], [, right]) => compareInventoryRollsByWidth(left, right))
    .map(([label]) => label);
  return ["全部宽幅", ...ordered];
}

export function compactRollCode(value, maxLength = 18) {
  const code = cleanText(value);
  if (code.length <= maxLength) return code;
  const suffixLength = Math.max(10, maxLength - 4);
  return `RM-…${code.slice(-suffixLength)}`;
}

export function resolveInventoryRollStatus(inbound = {}, roll = {}) {
  const currentWeightKg = positiveNumber(roll.remainingMachineSideWeightKg)
    || positiveNumber(roll.leftoverReviewedWeightKg)
    || positiveNumber(roll.weightKg);
  if (cleanText(roll.inventoryStatus) === "可用") return currentWeightKg > 0 ? "可用" : "";
  if (
    roll.machineId
    || /机边|领用|消耗中/u.test(`${cleanText(roll.inventoryStatus)} ${cleanText(roll.labelStatus)}`)
  ) return "机边领用";
  if (cleanText(roll.inventoryStatus) === "余料待复核") return "余料待复核";
  return "";
}
