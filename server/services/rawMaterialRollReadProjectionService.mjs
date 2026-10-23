import { normalizeRawMaterialInbounds } from "../rawMaterialInboundRecordService.mjs";
import { normalizeFactoryStandardColor } from "../../shared/factoryStandardColors.js";
import {
  resolveRollSpecification, resolveInventoryRollStatus, resolveInventoryRollWeight,
  sortInventoryRollsByWidth, buildInventoryWidthOptions,
} from "../../shared/rawMaterialRollInventory.js";

export function buildRawMaterialRollListResponse(inbounds = [], query = new URLSearchParams()) {
  const allRolls = sortInventoryRollsByWidth(normalizeRawMaterialInbounds(inbounds).flatMap((inbound) =>
    (inbound.rolls ?? []).flatMap((roll) => {
      const status = resolveInventoryRollStatus(inbound, roll);
      if (!roll.id || !status) return [];
      const spec = resolveRollSpecification(inbound, roll);
      const rawColor = roll.factoryColor || roll.supplierColor || inbound.factoryColor || inbound.supplierColor || "";
      return [{
        ...roll,
        sourceInbound: inbound,
        source: inbound.id,
        color: normalizeFactoryStandardColor(rawColor) || rawColor || "颜色待确认",
        width: spec.widthLabel, widthCm: spec.widthCm,
        materialCategory: spec.materialCategory, materialUsage: spec.materialUsage,
        gramWeight: spec.gramWeightLabel, spec: spec.fullLabel,
        weight: resolveInventoryRollWeight(roll),
        unitLabel: (roll.unit || inbound.unit) === "件" ? "件" : "卷",
        status, supplier: inbound.supplierName,
        date: String(inbound.receivedAt || "").slice(0, 10),
        location: roll.location || (roll.machineId ? `${roll.machineId}机边` : inbound.location || "库位待确认"),
      }];
    }),
  ));
  const keyword = get(query, "keyword").toLowerCase();
  const status = filterValue(query, "status");
  const width = filterValue(query, "width");
  const color = filterValue(query, "color");
  const location = filterValue(query, "location");
  const items = allRolls.filter((roll) => {
    if (status && roll.status !== status) return false;
    if (width && roll.width !== width && !(Number(width) > 0 && roll.widthCm === Number(width))) return false;
    if (color && roll.color !== (normalizeFactoryStandardColor(color) || color)) return false;
    if (location && roll.location !== location) return false;
    return !keyword || [roll.id, roll.color, roll.spec, roll.width, roll.supplier, roll.source,
      roll.sourceInbound.deliveryNoteNo, roll.supplierRollNo, roll.supplierColor, roll.location]
      .some((value) => String(value ?? "").toLowerCase().includes(keyword));
  });
  const page = boundedInteger(get(query, "page"), 1, Number.MAX_SAFE_INTEGER);
  const pageSize = boundedInteger(get(query, "pageSize"), 50, 200);
  return {
    items: items.slice((page - 1) * pageSize, page * pageSize), page, pageSize, total: items.length,
    summary: Object.fromEntries([["available", "可用"], ["machineSide", "机边领用"], ["review", "余料待复核"]].map(([key, state]) => {
      const rows = allRolls.filter((roll) => roll.status === state);
      return [key, { count: rows.length, weight: roundWeight(rows.reduce((sum, roll) => sum + roll.weight, 0)) }];
    })),
    widthOptions: buildInventoryWidthOptions(allRolls),
    colorOptions: [...new Set(allRolls.map((roll) => roll.color))].sort((a, b) => a.localeCompare(b, "zh-CN")),
    locationOptions: [...new Set(allRolls.map((roll) => roll.location))].sort((a, b) => a.localeCompare(b, "zh-CN")),
    distribution: buildDistribution(allRolls),
    aggregateScope: "all_inventory",
  };
}

function buildDistribution(rolls) {
  const widths = new Map();
  for (const roll of rolls.filter((item) => item.status === "可用")) {
    if (!widths.has(roll.width)) widths.set(roll.width, { width: roll.width, widthCm: roll.widthCm, countValue: 0, weightValue: 0, colors: new Map() });
    const group = widths.get(roll.width);
    if (!group.colors.has(roll.color)) group.colors.set(roll.color, { color: roll.color, countValue: 0, weightValue: 0 });
    const color = group.colors.get(roll.color);
    color.countValue += 1;
    color.weightValue = roundWeight(color.weightValue + roll.weight);
    group.countValue += 1;
    group.weightValue = roundWeight(group.weightValue + roll.weight);
  }
  return [...widths.values()].map(({ colors, ...group }) => ({ ...group, items: [...colors.values()] }));
}
function get(query, key) { return String(typeof query?.get === "function" ? query.get(key) ?? "" : query?.[key] ?? "").trim(); }
function filterValue(query, key) { const value = get(query, key); return !value || value === "all" || value.startsWith("全部") ? "" : value; }
function boundedInteger(value, fallback, max) { const number = Number(value); return Number.isFinite(number) && number > 0 ? Math.max(1, Math.min(max, Math.floor(number))) : fallback; }
function roundWeight(value) { return Math.round(value * 1000) / 1000; }
