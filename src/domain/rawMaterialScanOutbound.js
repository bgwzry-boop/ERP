import { RAW_MATERIAL_WHOLE_ROLL_MACHINE_LABELS } from "./rawMaterialWholeRollPolicy.js";

export const RAW_MATERIAL_MACHINE_OPTIONS = RAW_MATERIAL_WHOLE_ROLL_MACHINE_LABELS;

export function normalizeRawMaterialScanCode(value) {
  return String(value ?? "")
    .trim()
    .replace(/^\*|\*$/g, "")
    .replace(/^RAW-MATERIAL:/i, "")
    .trim()
    .toUpperCase();
}

export function findRawMaterialRollByScan(inbounds = [], scanCode = "") {
  const normalizedCode = normalizeRawMaterialScanCode(scanCode);
  if (!normalizedCode) return null;
  for (const inbound of Array.isArray(inbounds) ? inbounds : []) {
    const roll = (inbound.rolls ?? []).find((candidate) => (
      normalizeRawMaterialScanCode(candidate.id) === normalizedCode ||
      normalizeRawMaterialScanCode(candidate.supplierRollNo) === normalizedCode
    ));
    if (roll) return { inbound, roll, scanCode: normalizedCode };
  }
  return null;
}

export function getRawMaterialScanOutboundBlocker(match) {
  if (!match?.roll) return "没有找到这个卷码，请检查标签后重新扫描。";
  if (match.roll.inventoryStatus !== "可用") {
    if (match.roll.inventoryStatus === "机边领用") return `这卷已出库到 ${match.roll.machineId || match.roll.location || "机边"}，不能重复出库。`;
    return `这卷当前为“${match.roll.inventoryStatus || "不可用"}”，必须完成贴标核对并进入可用库存后才能出库。`;
  }
  if (!String(match.roll.labelStatus || "").includes("已贴标")) return "这卷尚未完成贴标核对，不能扫码出库。";
  if (!(Number(match.roll.weightKg) > 0)) return "这卷缺少真实重量，不能扫码出库。";
  return "";
}
