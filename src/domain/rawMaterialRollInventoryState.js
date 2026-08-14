import { formatRawMaterialMobileSpec, parseRawMaterialSpec } from "../../shared/rawMaterialSpec.js";

export const RAW_MATERIAL_ROLL_LEDGER_STATUSES = Object.freeze([
  "可用",
  "机边领用",
  "余料待复核",
  "已消耗",
]);

export function buildRawMaterialRollLedger(inbounds = []) {
  return (Array.isArray(inbounds) ? inbounds : []).flatMap((inbound) =>
    (Array.isArray(inbound?.rolls) ? inbound.rolls : [])
      .map((roll) => buildRollRecord(inbound, roll))
      .filter((roll) => RAW_MATERIAL_ROLL_LEDGER_STATUSES.includes(roll.status)),
  );
}

export function summarizeRawMaterialRollLedger(rolls = []) {
  return {
    available: summarizeStatus(rolls, (roll) => roll.status === "可用"),
    machineSide: summarizeStatus(rolls, (roll) => roll.status === "机边领用"),
    review: summarizeStatus(rolls, (roll) => roll.status === "余料待复核"),
  };
}

export function filterRawMaterialRollLedger(rolls = [], filters = {}) {
  const keyword = cleanText(filters.keyword).toLowerCase();
  return (Array.isArray(rolls) ? rolls : []).filter((roll) => {
    if (keyword && ![
      roll.id,
      roll.color,
      roll.specDisplay,
      roll.widthLabel,
      roll.supplierName,
      roll.inboundId,
      roll.deliveryNoteNo,
      roll.location,
      roll.supplierRollNo,
    ].some((value) => cleanText(value).toLowerCase().includes(keyword))) return false;
    if (filters.status && filters.status !== "全部状态" && roll.status !== filters.status) return false;
    if (filters.width && filters.width !== "全部宽幅" && roll.widthLabel !== filters.width) return false;
    if (filters.color && filters.color !== "全部颜色" && roll.color !== filters.color) return false;
    if (filters.location && filters.location !== "全部库位" && roll.location !== filters.location) return false;
    return true;
  });
}

export function buildRawMaterialAvailableDistribution(rolls = []) {
  const groups = new Map();
  (Array.isArray(rolls) ? rolls : []).filter((roll) => roll.status === "可用").forEach((roll) => {
    const widthKey = roll.widthLabel || "宽幅待补";
    if (!groups.has(widthKey)) groups.set(widthKey, new Map());
    const colors = groups.get(widthKey);
    const colorKey = roll.color || "颜色待补";
    const current = colors.get(colorKey) || {
      color: colorKey,
      count: 0,
      weightKg: 0,
      unitLabel: roll.unitLabel,
    };
    current.count += 1;
    current.weightKg = roundWeight(current.weightKg + positiveNumber(roll.currentWeightKg));
    colors.set(colorKey, current);
  });

  return Array.from(groups.entries())
    .sort(([left], [right]) => compareWidthLabels(left, right))
    .map(([widthLabel, colorMap]) => {
      const items = Array.from(colorMap.values());
      const count = items.reduce((total, item) => total + item.count, 0);
      const weightKg = roundWeight(items.reduce((total, item) => total + item.weightKg, 0));
      const maxWeight = Math.max(0, ...items.map((item) => item.weightKg));
      const maxCount = Math.max(1, ...items.map((item) => item.count));
      return {
        widthLabel,
        count,
        weightKg,
        unitLabel: items[0]?.unitLabel || "卷",
        items: items
          .sort((left, right) => right.weightKg - left.weightKg || right.count - left.count || left.color.localeCompare(right.color, "zh-CN"))
          .map((item) => ({
            ...item,
            percent: Math.max(18, Math.round(((maxWeight > 0 ? item.weightKg / maxWeight : item.count / maxCount) || 0) * 100)),
          })),
      };
    });
}

export function getRawMaterialRollFilterOptions(rolls = []) {
  return {
    statuses: orderValues(rolls.map((roll) => roll.status), RAW_MATERIAL_ROLL_LEDGER_STATUSES),
    widths: uniqueValues(rolls.map((roll) => roll.widthLabel)).sort(compareWidthLabels),
    colors: uniqueValues(rolls.map((roll) => roll.color)).sort((left, right) => left.localeCompare(right, "zh-CN")),
    locations: uniqueValues(rolls.map((roll) => roll.location)).sort((left, right) => left.localeCompare(right, "zh-CN")),
  };
}

function buildRollRecord(inbound = {}, roll = {}) {
  const specRaw = cleanText(roll.spec || inbound.specRaw || inbound.spec);
  const parsedSpec = parseRawMaterialSpec(specRaw);
  const widthCm = positiveNumber(roll.widthCm) || positiveNumber(inbound.widthCm) || positiveNumber(parsedSpec.widthCm);
  const isPiece = cleanText(roll.unit || inbound.unit) === "件";
  const materialType = cleanText(roll.materialType || inbound.materialType);
  const isHandle = materialType.includes("提手") || parsedSpec.materialCategory === "提手条";
  const currentWeightKg = positiveNumber(roll.remainingMachineSideWeightKg) || positiveNumber(roll.weightKg);
  return {
    id: cleanText(roll.id),
    inboundId: cleanText(inbound.id),
    supplierName: cleanText(inbound.supplierName) || "供应商待补",
    deliveryNoteNo: cleanText(inbound.deliveryNoteNo),
    supplierRollNo: cleanText(roll.supplierRollNo),
    receivedAt: cleanText(roll.labelVerifiedAt || inbound.reviewedAt || inbound.receivedAt),
    receivedDate: formatDate(roll.labelVerifiedAt || inbound.reviewedAt || inbound.receivedAt),
    color: cleanText(roll.factoryColor || roll.supplierColor || inbound.factoryColor || inbound.supplierColor) || "颜色待补",
    specRaw,
    specDisplay: formatRawMaterialMobileSpec(specRaw) || "规格待补",
    widthCm,
    widthLabel: widthCm > 0 ? `${formatNumber(widthCm)}cm${isHandle ? " 提手条" : ""}` : isHandle ? "提手" : "宽幅待补",
    currentWeightKg,
    location: cleanText(roll.location || inbound.location) || "库位待确认",
    status: cleanText(roll.inventoryStatus),
    labelStatus: cleanText(roll.labelStatus),
    unitLabel: isPiece ? "件" : "卷",
    ocrLineId: cleanText(roll.ocrLineId),
  };
}

function summarizeStatus(rolls, predicate) {
  const records = (Array.isArray(rolls) ? rolls : []).filter(predicate);
  return {
    count: records.length,
    weightKg: roundWeight(records.reduce((total, roll) => total + positiveNumber(roll.currentWeightKg), 0)),
  };
}

function uniqueValues(values) {
  return Array.from(new Set(values.map(cleanText).filter(Boolean)));
}

function orderValues(values, order) {
  const unique = uniqueValues(values);
  return unique.sort((left, right) => {
    const leftIndex = order.indexOf(left);
    const rightIndex = order.indexOf(right);
    if (leftIndex === -1 && rightIndex === -1) return left.localeCompare(right, "zh-CN");
    if (leftIndex === -1) return 1;
    if (rightIndex === -1) return -1;
    return leftIndex - rightIndex;
  });
}

function compareWidthLabels(left, right) {
  const leftNumber = Number.parseFloat(left);
  const rightNumber = Number.parseFloat(right);
  const leftKnown = Number.isFinite(leftNumber);
  const rightKnown = Number.isFinite(rightNumber);
  if (leftKnown && rightKnown) return rightNumber - leftNumber;
  if (leftKnown) return -1;
  if (rightKnown) return 1;
  return left.localeCompare(right, "zh-CN");
}

function formatDate(value) {
  const text = cleanText(value);
  const matched = text.match(/\d{4}-\d{2}-\d{2}/u);
  return matched?.[0] || text || "日期待补";
}

function positiveNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : 0;
}

function roundWeight(value) {
  return Math.round((Number(value) || 0) * 1000) / 1000;
}

function formatNumber(value) {
  return Number.isInteger(Number(value)) ? String(Number(value)) : String(Number(value));
}

function cleanText(value) {
  return String(value ?? "").trim();
}
