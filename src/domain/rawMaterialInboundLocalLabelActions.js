export function applyLocalRawMaterialInboundLabelAction(item = {}, input = {}) {
  const { action, now, operatorName, options = {} } = input;
  if (action === "打印卷标") {
    const printableRolls = (item.rolls ?? []).filter((roll) => roll.inventoryStatus !== "可用");
    if (!printableRolls.length || printableRolls.some((roll) => !(Number(roll.weightKg) > 0))) return item;
    return {
      ...item,
      status: "已打印待贴标",
      labelPrintedBy: operatorName,
      labelPrintedAt: now,
      nextStep: "把标签贴到对应卷料，逐卷人工核对重量、颜色、规格和库位后再入库可用。",
      rolls: (item.rolls ?? []).map((roll) => ({
        ...roll,
        labelStatus: roll.inventoryStatus === "可用" ? roll.labelStatus : "已打印待贴标",
        labelVersion: roll.inventoryStatus === "可用" ? roll.labelVersion : nextLocalLabelVersion(roll),
      })),
    };
  }

  if (action === "确认贴标入库") {
    const rollId = options.rollId ?? "";
    const matchResult = normalizeLocalLabelMatchResult(options.matchResult);
    if (!rollId || !matchResult) return item;
    const nextRolls = (item.rolls ?? []).map((roll) => {
      if (roll.id !== rollId || roll.inventoryStatus === "可用" || roll.labelStatus !== "已打印待贴标") return roll;
      const verification = buildLocalLabelVerification(item, roll, options, matchResult, operatorName, now);
      if (matchResult === "mismatched") {
        return {
          ...roll,
          labelStatus: "标签或实物不符/待确认",
          inventoryStatus: "待确认",
          labelVerification: verification,
          location: verification.location || "原料隔离区",
        };
      }
      return {
        ...roll,
        labelStatus: "已贴标/可用库存",
        inventoryStatus: "可用",
        labelVerification: verification,
        labelVerifiedAt: now,
        labelVerifiedBy: operatorName,
        location: verification.location,
      };
    });
    const availableCount = nextRolls.filter((roll) => roll.inventoryStatus === "可用").length;
    const mismatchCount = nextRolls.filter((roll) => roll.labelStatus === "标签或实物不符/待确认").length;
    const status = buildLocalInboundLabelStatus(nextRolls, availableCount, mismatchCount);
    return {
      ...item,
      status,
      confirmedBy: operatorName,
      confirmedAt: now,
      nextStep: mismatchCount
        ? "异常卷已隔离，需单独作废或重打标签后重新核对。"
        : status === "已贴标/可用库存"
          ? "可领料；后续进入供应商月结对账。"
          : "继续逐卷核对剩余卷/件。",
      rolls: nextRolls,
    };
  }

  if (action === "作废卷标" || action === "重打卷标") {
    const rollId = options.rollId ?? "";
    if (!rollId) return item;
    const targetRoll = (item.rolls ?? []).find((roll) => roll.id === rollId);
    if (!targetRoll || targetRoll.inventoryStatus === "可用") return item;
    if (action === "作废卷标" && targetRoll.labelStatus !== "标签或实物不符/待确认") return item;
    if (action === "重打卷标" && targetRoll.labelStatus !== "标签已作废/待重打") return item;
    const nextRolls = (item.rolls ?? []).map((roll) => {
      if (roll.id !== rollId) return roll;
      if (action === "作废卷标") {
        return {
          ...roll,
          labelStatus: "标签已作废/待重打",
          labelVoidedAt: now,
          labelVoidedBy: operatorName,
        };
      }
      return {
        ...roll,
        labelStatus: "已打印待贴标",
        labelVersion: nextLocalLabelVersion(roll),
        labelPrintedAt: now,
        labelPrintedBy: operatorName,
      };
    });
    const mismatchCount = nextRolls.filter((roll) => roll.labelStatus === "标签或实物不符/待确认").length;
    const availableCount = nextRolls.filter((roll) => roll.inventoryStatus === "可用").length;
    return {
      ...item,
      status: buildLocalInboundLabelStatus(nextRolls, availableCount, mismatchCount),
      nextStep: action === "作废卷标" ? "旧标签已作废；请只重打该异常卷并重新核对。" : "新标签已打印；请重新核对该异常卷。",
      rolls: nextRolls,
    };
  }

  return null;
}

function normalizeLocalLabelMatchResult(value) {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (["matched", "match", "一致", "匹配"].includes(normalized)) return "matched";
  if (["mismatched", "mismatch", "不一致", "不匹配"].includes(normalized)) return "mismatched";
  return "";
}

function buildLocalLabelVerification(item, roll, options, matchResult, operatorName, now) {
  const expectedColor = String(roll.factoryColor ?? item.factoryColor ?? item.supplierColor ?? "").trim();
  const expectedSpec = String(roll.spec ?? item.spec ?? "").trim();
  const expectedWeightKg = Number(roll.weightKg) || 0;
  return {
    result: matchResult === "matched" ? "匹配" : "不匹配",
    resultCode: matchResult,
    labelVersion: Math.max(1, Number(roll.labelVersion) || 1),
    expected: { weightKg: expectedWeightKg, color: expectedColor, spec: expectedSpec },
    checked: {
      weightKg: Number(options.checkedWeightKg ?? expectedWeightKg) || 0,
      color: String(options.checkedColor ?? expectedColor).trim(),
      spec: String(options.checkedSpec ?? expectedSpec).trim(),
    },
    location: String(options.location ?? (matchResult === "matched" ? "原料库-可用区" : "原料隔离区")).trim(),
    note: String(options.verificationNote ?? options.note ?? "").trim(),
    verifiedBy: operatorName,
    verifiedAt: now,
  };
}

function buildLocalInboundLabelStatus(rolls, availableCount, mismatchCount) {
  if (mismatchCount > 0) return `部分入库，${mismatchCount}卷异常`;
  if (availableCount === rolls.length) return "已贴标/可用库存";
  return "部分贴标";
}

function nextLocalLabelVersion(roll = {}) {
  return Math.max(0, Math.trunc(Number(roll.labelVersion) || 0)) + 1;
}
