import {
  RAW_MATERIAL_HANDLE_WIDTH_CM,
  hasExplicitRawMaterialStripMarker,
  parseRawMaterialSpec,
} from "../../../../shared/rawMaterialSpec.js";

const textCollator = new Intl.Collator("zh-CN", { numeric: true, sensitivity: "base" });

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

export function resolveRollWidth(inbound = {}, roll = {}) {
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
  const isHandleStrip = evidence.some((value) => value === "提手条" || hasExplicitRawMaterialStripMarker(value));
  const explicitWidthCm = positiveNumber(roll.widthCm)
    || positiveNumber(inbound.widthCm)
    || widthNumberFromLabel(roll.width);
  const isRenyiOneMeterCloth = !isHandleStrip
    && /(?:人意|仁意)/u.test(cleanText(inbound.supplierName || roll.supplierName))
    && explicitWidthCm === 1
    && positiveNumber(roll.lengthM || inbound.lengthM) > 0;
  const parsedSpec = parseRawMaterialSpec(
    cleanText(roll.specDisplay || roll.spec || inbound.specDisplay || inbound.spec),
  );
  const widthCm = isHandleStrip
    ? RAW_MATERIAL_HANDLE_WIDTH_CM
    : isRenyiOneMeterCloth
      ? 100
      : explicitWidthCm || positiveNumber(parsedSpec.widthCm);
  const handleStrip = isHandleStrip || widthCm === RAW_MATERIAL_HANDLE_WIDTH_CM;

  return {
    widthCm,
    label: widthCm
      ? `${formatWidthNumber(widthCm)}cm${handleStrip ? " 提手条" : ""}`
      : "宽幅待确认",
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
