// Task-driven raw-material picking (owner decision 2026-10-29).
//
// Each bag-making workshop (1/2/3号车间, three machines each) has its own 杂工.
// The 杂工 sees the next tasks for that workshop and the material each one
// needs, picks the roll in the warehouse and scans it; the roll is bound to the
// task and its order. 丝印 tasks share one pool (丝印车间). Rolls picked for a
// 丝印 task flow on to bag-making for the same order line without a second scan.

import { calculateRawMaterialOrderRequirement } from "../../shared/rawMaterialInventorySupport.js";
import { normalizeFactoryStandardColor } from "../../shared/factoryStandardColors.js";

export const PRINT_WORKSHOP = "丝印车间";
export const RAW_MATERIAL_PICK_WORKSHOPS = Object.freeze(["1号车间", "2号车间", "3号车间", PRINT_WORKSHOP]);

const closedStatuses = new Set(["已完成", "已取消", "已作废", "completed", "cancelled", "voided"]);
const clean = (value) => String(value ?? "").trim();
const colorKey = (value) => normalizeFactoryStandardColor(value) || clean(value).normalize("NFKC").replace(/\s+/gu, "");

export function resolvePickWorkshop(task = {}) {
  if (/丝印|印刷/u.test(clean(task.taskType))) return PRINT_WORKSHOP;
  const machine = clean(task.machineId).toUpperCase();
  const bag = machine.match(/^BAG-0?([1-9])$/) || clean(task.machineLabel || task.machineId).match(/^([1-9])号(?:制袋)?机$/);
  if (bag) return `${Math.ceil(Number(bag[1]) / 3)}号车间`;
  return "";
}

export function resolvePickTarget(task = {}) {
  if (resolvePickWorkshop(task) === PRINT_WORKSHOP) return PRINT_WORKSHOP;
  const machine = clean(task.machineId).toUpperCase();
  const bag = machine.match(/^BAG-0?([1-9])$/);
  if (bag) return `${bag[1]}号机`;
  return clean(task.machineLabel || task.machineId);
}

// What has already been picked for each task: rolls and weight. A task needs
// as many rolls as its material weight requires; any roll that matches the
// task's width and colour will do.
function pickedByTask(inbounds = []) {
  const byTask = new Map();
  for (const inbound of Array.isArray(inbounds) ? inbounds : []) {
    for (const record of inbound?.rawMaterialIssueRecords ?? []) {
      const id = clean(record?.productionTaskId);
      if (!id) continue;
      const current = byTask.get(id) || { rollCount: 0, weightKg: 0 };
      current.rollCount += 1;
      current.weightKg = Math.round((current.weightKg + (Number(record.issuedWeightKg) || 0)) * 100) / 100;
      byTask.set(id, current);
    }
  }
  return byTask;
}

export function buildRawMaterialPickList({ queueItems = [], inbounds = [], workshop = "" } = {}) {
  const items = (Array.isArray(queueItems) ? queueItems : []).filter((item) => clean(item?.productionTaskId));
  const picked = pickedByTask(inbounds);
  const printedLines = new Set(items
    .filter((item) => resolvePickWorkshop(item) === PRINT_WORKSHOP && picked.has(clean(item.productionTaskId)))
    .map((item) => clean(item.orderLineId))
    .filter(Boolean));
  return items
    .filter((item) => !closedStatuses.has(clean(item.status || item.taskStatus)))
    // Printed material moves on to bag-making for the same order line; no second scan.
    .filter((item) => !(resolvePickWorkshop(item) !== PRINT_WORKSHOP && printedLines.has(clean(item.orderLineId))))
    .filter((item) => !workshop || resolvePickWorkshop(item) === workshop)
    .sort((a, b) => (Number(a.queueSeq) || 0) - (Number(b.queueSeq) || 0))
    .map((item) => {
      const requirement = calculateRawMaterialOrderRequirement({ size: item.size, plannedQty: item.plannedQty });
      const done = picked.get(clean(item.productionTaskId)) || { rollCount: 0, weightKg: 0 };
      const requiredWeightKg = requirement.status === "已计算" ? requirement.requiredWeightKg : 0;
      return {
        productionTaskId: clean(item.productionTaskId),
        orderLineId: clean(item.orderLineId),
        workshop: resolvePickWorkshop(item),
        target: resolvePickTarget(item),
        taskType: clean(item.taskType) || "制袋",
        customerName: clean(item.customerName),
        size: clean(item.size),
        plannedQty: Number(item.plannedQty) || 0,
        requiredColor: clean(item.bagColor),
        requiredWidthCm: requirement.status === "已计算" ? requirement.requiredWidthCm : 0,
        requiredWeightKg,
        pickedRollCount: done.rollCount,
        pickedWeightKg: done.weightKg,
        remainingWeightKg: requiredWeightKg ? Math.max(0, Math.round((requiredWeightKg - done.weightKg) * 100) / 100) : 0,
      };
    })
    // A task leaves the list once enough material has been picked. Without a
    // computable weight it stays (showing rolls picked so far) until the task closes.
    .filter((task) => !(task.requiredWeightKg && task.pickedWeightKg >= task.requiredWeightKg));
}

// Compares the scanned roll with what the task needs. Any mismatch blocks the
// outbound and is shown to the 杂工 as a pop-up.
export function checkRollAgainstPickTask(task = {}, roll = {}, inbound = {}) {
  const problems = [];
  const rollWidth = Number(roll.widthCm) || Number(inbound.widthCm) || 0;
  if (task.requiredWidthCm && rollWidth && rollWidth !== task.requiredWidthCm) {
    problems.push(`宽幅不对：任务要 ${task.requiredWidthCm}cm，这卷是 ${rollWidth}cm`);
  }
  const rollColor = clean(roll.factoryColor || roll.supplierColor || inbound.factoryColor || inbound.supplierColor);
  if (task.requiredColor && rollColor && colorKey(task.requiredColor) !== colorKey(rollColor)) {
    problems.push(`颜色不对：任务要「${task.requiredColor}」，这卷是「${rollColor}」`);
  }
  return { ok: problems.length === 0, problems };
}
