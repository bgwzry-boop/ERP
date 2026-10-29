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
  return resolveRawMaterialRollScan(inbounds, scanCode).match;
}

export function resolveRawMaterialRollScan(inbounds = [], scanCode = "") {
  const normalizedCode = normalizeRawMaterialScanCode(scanCode);
  if (!normalizedCode) return { match: null, ambiguous: false };
  const candidates = (Array.isArray(inbounds) ? inbounds : []).flatMap(inbound =>
    (inbound.rolls ?? []).map(roll => ({ inbound, roll, scanCode: normalizeRawMaterialScanCode(roll.id) })),
  );
  const canonical = candidates.filter(item => item.scanCode === normalizedCode);
  const matches = canonical.length ? canonical
    : candidates.filter(item => normalizeRawMaterialScanCode(item.roll.supplierRollNo) === normalizedCode);
  return { match: matches.length === 1 ? matches[0] : null, ambiguous: matches.length > 1 };
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

// 2026-10-29 owner decision: workers take rolls for two purposes, by scanning
// the roll QR on their own phones. Linking the roll to an order (through its
// production task) is optional during the trial and required later.
export const RAW_MATERIAL_ISSUE_PURPOSES = Object.freeze([
  Object.freeze({ key: "bag_making", label: "制袋（空白通货）" }),
  Object.freeze({ key: "printing", label: "印刷（先印后制袋）" }),
]);

export function buildRawMaterialIssuePurpose(purposeKey, productionTaskId = "") {
  const purpose = RAW_MATERIAL_ISSUE_PURPOSES.find((item) => item.key === purposeKey);
  if (!purpose) return "";
  return productionTaskId ? `${purpose.label}` : `${purpose.label}·暂不关联订单`;
}

const closedTaskStatuses = new Set(["已完成", "已取消", "已作废", "completed", "cancelled", "voided"]);

export function listRawMaterialIssueTaskOptions(productionTasks = [], machineId = "") {
  const machine = String(machineId ?? "").replace(/\s+/g, "");
  return (Array.isArray(productionTasks) ? productionTasks : [])
    .filter((task) => task && !closedTaskStatuses.has(String(task.status ?? "").trim()))
    .filter((task) => {
      const taskMachine = String(task.machineId ?? task.machine_id ?? "").replace(/\s+/g, "");
      return !machine || !taskMachine || taskMachine === machine;
    })
    .map((task) => {
      const id = String(task.productionTaskId ?? task.production_task_id ?? task.id ?? "").trim();
      const line = task.orderLine ?? {};
      const parts = [
        id,
        task.customerName || line.customerName,
        task.goodsSpec || task.spec || line.size,
        task.orderLineId || line.orderLineId ? `订单行 ${task.orderLineId || line.orderLineId}` : "",
      ].filter(Boolean);
      return { id, label: parts.join(" · ") };
    })
    .filter((option) => option.id);
}
