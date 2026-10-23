export const RAW_MATERIAL_WHOLE_ROLL_MACHINE_LABELS = Object.freeze(
  ["1号机", "2号机", "3号机", "4号机", "5号机", "6号机", "7号机", "8号机", "9号机"],
);

export const RAW_MATERIAL_ONE_CLICK_INBOUND_ACTION = "本单已贴齐/一键入库";

export const DEFAULT_RAW_MATERIAL_ROLL_INVENTORY_STATUS = "可用";

export function resolveRawMaterialWholeRollMachine(machineId) {
  const text = String(machineId ?? "").trim();
  if (!text) return "";
  const direct = text.match(/^([1-9])号机$/);
  if (direct) return `${direct[1]}号机`;
  const upper = text.toUpperCase();
  const bag = upper.match(/^BAG-0([1-9])$/);
  if (bag) return `${Number(bag[1])}号机`;
  const legacy = text.match(/^制袋(?:机)?-0([1-9])$/);
  if (legacy) return `${Number(legacy[1])}号机`;
  if (text === "1号制袋机") return "1号机";
  return "";
}

export function isPendingStickConfirmRoll(roll = {}) {
  return String(roll.labelStatus || "") === "已打印待贴标" && ["不可用", "待贴标"].includes(String(roll.inventoryStatus || ""));
}

export function isPrintedRawMaterialLabel(roll = {}) {
  const status = String(roll.labelStatus || "");
  return status === "已打印待贴标" || status.includes("已贴标");
}

export function isRawMaterialExceptionRoll(roll = {}) {
  const label = String(roll.labelStatus || "");
  const inventory = String(roll.inventoryStatus || "");
  return label.includes("不符") || label.includes("作废") || inventory === "待确认";
}

export function evaluateRawMaterialOneClickInbound(inbound = {}) {
  const rolls = Array.isArray(inbound?.rolls) ? inbound.rolls : [];
  const rollCount = rolls.length;
  const printedLabelCount = rolls.filter(isPrintedRawMaterialLabel).length;
  const pendingStickConfirmCount = rolls.filter(isPendingStickConfirmRoll).length;
  const exceptionCount = rolls.filter(isRawMaterialExceptionRoll).length;
  const allowed = rollCount > 0
    && printedLabelCount === rollCount
    && pendingStickConfirmCount === rollCount
    && exceptionCount === 0;
  return {
    allowed,
    blocker: allowed ? "" : describeRawMaterialOneClickInboundBlocker({
      rollCount,
      printedLabelCount,
      pendingStickConfirmCount,
      exceptionCount,
    }),
    rollCount,
    printedLabelCount,
    pendingStickConfirmCount,
    exceptionCount,
  };
}

export function assertWholeRollIssue({ machineId, requestedWeightKg, fullWeightKg }) {
  if (!String(machineId ?? "").trim()) {
    return {
      ok: false,
      statusCode: 422,
      code: "RAW_MATERIAL_ISSUE_MACHINE_REQUIRED",
      message: "扫码出库必须选择 1号机 到 9号机。",
    };
  }
  const machineLabel = resolveRawMaterialWholeRollMachine(machineId);
  if (!machineLabel) {
    return {
      ok: false,
      statusCode: 422,
      code: "RAW_MATERIAL_ISSUE_MACHINE_NOT_ALLOWED",
      message: "出库只能选择 1号机 到 9号机。出库后整卷转为机边，不计入可用库存。",
    };
  }
  const requested = Number(requestedWeightKg);
  const full = Number(fullWeightKg) || 0;
  if (full > 0 && Number.isFinite(requested) && requested > 0 && Math.abs(full - requested) > 0.001) {
    return {
      ok: false,
      statusCode: 409,
      code: "RAW_MATERIAL_PARTIAL_ISSUE_DISABLED",
      message: "原材料只支持整卷出库，不能拆卷或部分领料。",
    };
  }
  return { ok: true, machineLabel };
}

function describeRawMaterialOneClickInboundBlocker({
  rollCount,
  printedLabelCount,
  pendingStickConfirmCount,
  exceptionCount,
}) {
  if (!rollCount) return "本单还没有卷料，不能一键入库。";
  if (exceptionCount > 0) {
    return `有 ${exceptionCount} 卷异常未处理。异常卷不入库；打印标签数、卷数和待贴标卷数一致后才能一键入库。`;
  }
  if (printedLabelCount !== rollCount) {
    return `已打印标签 ${printedLabelCount} 张，本单 ${rollCount} 卷，数量不一致，不能一键入库。`;
  }
  return `待贴标确认 ${pendingStickConfirmCount} 卷，本单 ${rollCount} 卷，必须整单贴齐后才能一键入库。`;
}
