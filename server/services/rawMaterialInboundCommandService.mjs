import { getRawMaterialLabelMismatchFields } from "../../shared/rawMaterialLabelVerification.js";
import { rawMaterialRecordIdentitySuffix } from "../../shared/rawMaterialRecordIdentity.js";
import { rawMaterialWriteConflict } from "../rawMaterialInboundConcurrency.mjs";
import { applyRawMaterialOcrReparse, applyRawMaterialOcrReview } from "../rawMaterialInboundOcrSupport.mjs";
import { applyConfirmRawMaterialSupplierReturnShipment, applyStageRawMaterialSupplierReturn } from "./rawMaterialSupplierReturnInventoryService.mjs";
import { applyRawMaterialCostMarginAction } from "../rawMaterialCostMarginActionService.mjs";
import { applyRawMaterialTraceabilityAction } from "../rawMaterialTraceabilityActionService.mjs";
import { normalizeRawMaterialInbounds } from "../rawMaterialInboundRecordService.mjs";
import { evaluateRawMaterialOneClickInbound, isPendingStickConfirmRoll } from "../../src/domain/rawMaterialWholeRollPolicy.js";

export function applyRawMaterialInboundAction(input = {}) {
  const workspace = input.workspace ?? {};
  const inbounds = normalizeRawMaterialInbounds(input.inbounds ?? workspace.rawMaterialInbounds);
  const inboundId = cleanText(input.inboundId);
  const index = inbounds.findIndex((item) => item.id === inboundId);
  if (index < 0) return { inbounds, inbound: null, operationLog: null };
  const action = normalizeAction(input.action);
  const before = inbounds[index];
  const expectedRevision = Number(input.body?.expectedRevision);
  if (!Number.isInteger(expectedRevision) || expectedRevision < 1) {
    throw Object.assign(new Error("expectedRevision 必须是当前原材料入库单的正整数版本号。"), {
      statusCode: 422,
      code: "EXPECTED_REVISION_REQUIRED",
    });
  }
  if (expectedRevision !== Number(before.revision ?? 1)) {
    throw rawMaterialWriteConflict(before.revision);
  }
  const now = cleanText(input.serverNow) || new Date().toISOString();
  // Authentication owns the operator identity. Request fields may describe the physical check, never the system operator.
  const operatorId = cleanText(input.operatorId);
  const operatorName = cleanText(input.operatorName ?? operatorId ?? "U-OFFICE-A");
  let after = before;
  if (action === "reparse_ocr") {
    after = applyRawMaterialOcrReparse({ before, reparsedInbound: input.body?.reparsedInbound });
  }
  if (action === "review") {
    after = applyRawMaterialOcrReview({
      before,
      reviewFields: input.body?.reviewFields,
      lineReviews: input.body?.lineReviews,
      operatorName,
      operatorId,
      now,
      standardColors: workspace.standardColors,
    });
  }
  if (action === "void_draft") {
    const reason = cleanText(input.body?.reason);
    if (before.status !== "已识别待复核") {
      throw Object.assign(new Error("只有尚未复核、尚未打印、尚未形成库存的误录草稿可以作废。已正式入库的卷料只能走冲销或退库。"), {
        statusCode: 409,
        code: "RAW_MATERIAL_INBOUND_DRAFT_VOID_NOT_ALLOWED",
      });
    }
    if (!reason) {
      throw Object.assign(new Error("作废误录草稿必须填写原因。"), {
        statusCode: 422,
        code: "RAW_MATERIAL_INBOUND_DRAFT_VOID_REASON_REQUIRED",
      });
    }
    if ((before.rolls ?? []).some((roll) => cleanText(roll.inventoryStatus) === "可用")) {
      throw Object.assign(new Error("该单已经形成可用库存，不能删除或作废草稿；请走冲销或退库流程。"), {
        statusCode: 409,
        code: "RAW_MATERIAL_INBOUND_DRAFT_VOID_AVAILABLE_INVENTORY_FORBIDDEN",
      });
    }
    after = {
      ...before,
      status: "已作废",
      voidReason: reason,
      voidedBy: operatorName,
      voidedByUserId: operatorId,
      voidedAt: now,
      nextStep: "误录草稿已作废；原图和操作记录继续保留用于审计，不形成库存。",
      rolls: (before.rolls ?? []).map((roll) => ({
        ...roll,
        inventoryStatus: "不可用",
        labelStatus: "草稿已作废",
      })),
    };
  }
  if (action === "defer_labels") {
    if (cleanText(before.documentDirection) === "supplier_return") throw Object.assign(new Error("退货单不生成入库卷码或标签。"), {
      statusCode: 409, code: "RAW_MATERIAL_RETURN_LABEL_DEFER_FORBIDDEN",
    });
    if (before.status !== "已复核待打印标签") throw Object.assign(new Error("只有已完成送货单复核的卷料可以保存为待补标。"), {
      statusCode: 409, code: "RAW_MATERIAL_LABEL_DEFER_REQUIRES_REVIEW",
    });
    const rolls = before.rolls ?? [];
    const rollIds = rolls.map((roll) => cleanText(roll.id));
    if (!rolls.length || rollIds.some((rollId) => !rollId) || new Set(rollIds).size !== rollIds.length) {
      throw Object.assign(new Error("每一卷必须先生成唯一卷码，才能暂缓打印。"), {
        statusCode: 422, code: "RAW_MATERIAL_LABEL_DEFER_UNIQUE_ROLL_CODE_REQUIRED",
      });
    }
    const invalidWeights = rolls.filter((roll) => !(Number(roll.weightKg) > 0));
    if (invalidWeights.length) throw Object.assign(new Error("每一卷必须先确认独立重量，才能暂缓打印。"), {
      statusCode: 422, code: "RAW_MATERIAL_LABEL_DEFER_ROLL_WEIGHT_REQUIRED",
    });
    after = {
      ...before,
      status: "已入库待补打标签",
      labelDeferredBy: operatorName,
      labelDeferredByUserId: operatorId,
      labelDeferredAt: now,
      nextStep: "逐卷卷码已生成，实体标签待补打；当前卷料保存在原料待补标区，补打并贴标核对前不计入可用库存。",
      rolls: rolls.map((roll) => ({
        ...roll,
        inventoryStatus: roll.inventoryStatus === "可用" ? roll.inventoryStatus : "待补标",
        labelStatus: roll.inventoryStatus === "可用" ? roll.labelStatus : "标签待补打",
        location: roll.inventoryStatus === "可用" ? roll.location : "原料待补标区",
      })),
    };
  }
  if (action === "print_labels") {
    if (cleanText(before.documentDirection) === "supplier_return") throw Object.assign(new Error("退货单只保存退货复核，不生成入库卷标、不增加库存。"), {
      statusCode: 409, code: "RAW_MATERIAL_RETURN_LABEL_PRINT_FORBIDDEN",
    });
    if (!["已复核待打印标签", "已入库待补打标签"].includes(before.status)) throw Object.assign(new Error("送货单必须先完成办公室人工复核，才能打印一卷一标。"), {
      statusCode: 409, code: "RAW_MATERIAL_LABEL_PRINT_REQUIRES_REVIEW",
    });
    const unprintableRolls = (before.rolls ?? []).filter((roll) => roll.inventoryStatus !== "可用" && !(Number(roll.weightKg) > 0));
    if (!(before.rolls ?? []).length || unprintableRolls.length) throw Object.assign(new Error(`${unprintableRolls.map((roll) => cleanText(roll.id)).filter(Boolean).join("、") || "当前入库单"} 缺少本卷独立重量，不能打印卷标。`), { statusCode: 422, code: "RAW_MATERIAL_LABEL_PRINT_ROLL_WEIGHT_REQUIRED" });
    after = {
      ...before,
      status: "已打印待贴标",
      labelPrintedBy: operatorName,
      labelPrintedByUserId: operatorId,
      labelPrintedAt: now,
      nextStep: "逐卷将标签贴到实物后，人工核对重量、颜色、规格和库位并确认。",
      rolls: (before.rolls ?? []).map((roll) => ({
        ...roll,
        labelStatus: roll.inventoryStatus === "可用" ? roll.labelStatus : "已打印待贴标",
        labelVersion: roll.inventoryStatus === "可用" ? roll.labelVersion : nextRawMaterialLabelVersion(roll),
        labelPrintedAt: roll.inventoryStatus === "可用" ? roll.labelPrintedAt : now,
        labelPrintedBy: roll.inventoryStatus === "可用" ? roll.labelPrintedBy : operatorName,
        labelPrintedByUserId: roll.inventoryStatus === "可用" ? roll.labelPrintedByUserId : operatorId,
        inventoryStatus: roll.inventoryStatus === "待补标" ? "不可用" : roll.inventoryStatus,
        location: roll.inventoryStatus === "待补标" ? "原料待检区" : roll.location,
      })),
    };
  }
  if (action === "attach_confirm") {
    const rollId = cleanText(input.body?.rollId);
    if (!rollId) {
      throw Object.assign(new Error("每次贴标确认必须明确选择一卷或一件原材料。"), {
        statusCode: 422,
        code: "RAW_MATERIAL_ATTACH_ROLL_REQUIRED",
      });
    }
    const targetRoll = (before.rolls ?? []).find((roll) => roll.id === rollId);
    if (!targetRoll) {
      throw Object.assign(new Error(`Raw material roll not found: ${rollId}`), {
        statusCode: 404,
        code: "RAW_MATERIAL_ROLL_NOT_FOUND",
      });
    }
    if (targetRoll.inventoryStatus === "可用") {
      throw Object.assign(new Error("该卷/件已经是可用库存，不能重复确认贴标。"), {
        statusCode: 409,
        code: "RAW_MATERIAL_ROLL_ALREADY_AVAILABLE",
      });
    }
    if (!["不可用", "待贴标"].includes(targetRoll.inventoryStatus)) {
      throw Object.assign(new Error("只有待贴标的卷料可以确认入库，不能恢复机边或退厂卷料。"), {
        statusCode: 409, code: "RAW_MATERIAL_ATTACH_INVENTORY_STATE_BLOCKED",
      });
    }
    if (targetRoll.labelStatus !== "已打印待贴标") {
      throw Object.assign(new Error("该卷/件必须先完成当前标签打印，才能进行贴标核对。"), {
        statusCode: 409,
        code: "RAW_MATERIAL_ATTACH_REQUIRES_CURRENT_LABEL",
      });
    }
    const expectedLabelVersion = Number(input.body?.expectedLabelVersion);
    if (!Number.isInteger(expectedLabelVersion) || expectedLabelVersion < 1) {
      throw Object.assign(new Error("请重新打开当前卷标核对，缺少有效标签版本。"), { statusCode: 422, code: "RAW_MATERIAL_LABEL_VERSION_REQUIRED" });
    }
    if (expectedLabelVersion !== currentRawMaterialLabelVersion(targetRoll)) {
      throw Object.assign(new Error("该卷标签已经重打，请刷新并核对新标签后再提交。"), { statusCode: 409, code: "RAW_MATERIAL_LABEL_VERSION_CONFLICT" });
    }
    const matchResult = normalizeRawMaterialLabelMatchResult(input.body?.matchResult);
    if (!matchResult) {
      throw Object.assign(new Error("请明确选择标签与实物是否匹配。"), {
        statusCode: 422,
        code: "RAW_MATERIAL_LABEL_MATCH_RESULT_REQUIRED",
      });
    }
    const verification = buildRawMaterialLabelVerification({
      inbound: before,
      roll: targetRoll,
      body: input.body,
      matchResult,
      operatorId,
      operatorName,
      now,
    });
    if (matchResult === "matched" && !(verification.checked.weightKg > 0)) {
      throw Object.assign(new Error("该卷/件缺少现场真实重量，不能确认进入可用库存。"), {
        statusCode: 422,
        code: "RAW_MATERIAL_ATTACH_WEIGHT_REQUIRED",
      });
    }
    if (matchResult === "matched") {
      const fields = getRawMaterialLabelMismatchFields(verification.expected, verification.checked);
      if (fields.length) throw Object.assign(new Error(`实物${fields.join("、")}与当前卷标不一致，不能确认匹配。`), { statusCode: 409, code: "RAW_MATERIAL_LABEL_FACTS_MISMATCH", details: { fields } });
    }
    const nextRolls = (before.rolls ?? []).map((roll) => {
      if (roll.id !== rollId) return roll;
      if (matchResult === "matched") {
        return {
          ...roll,
          labelStatus: "已贴标/可用库存",
          inventoryStatus: "可用",
          labelVerification: verification,
          labelVerifiedAt: now,
          labelVerifiedBy: operatorName,
          labelVerifiedByUserId: operatorId,
          location: verification.location,
        };
      }
      return {
        ...roll,
        labelStatus: "标签或实物不符/待确认",
        inventoryStatus: "待确认",
        labelVerification: verification,
        labelVerifiedAt: now,
        labelVerifiedBy: operatorName,
        labelVerifiedByUserId: operatorId,
        location: verification.location || "原料隔离区",
      };
    });
    const availableCount = nextRolls.filter((roll) => roll.inventoryStatus === "可用").length;
    const mismatchCount = nextRolls.filter((roll) => roll.labelStatus === "标签或实物不符/待确认").length;
    const nextStatus = buildRawMaterialInboundLabelStatus({ nextRolls, availableCount, mismatchCount });
    after = {
      ...before,
      status: nextStatus,
      confirmedBy: operatorName,
      confirmedByUserId: operatorId,
      confirmedAt: now,
      labelVerificationSummary: {
        availableRollCount: availableCount,
        mismatchRollCount: mismatchCount,
        lastVerifiedRollId: rollId,
        lastMatchResult: matchResult,
      },
      nextStep:
        mismatchCount > 0
          ? "异常卷已隔离；可单独作废或重打该卷标签后重新核对，不影响已确认可用卷。"
          : availableCount === nextRolls.length
            ? "可领料；后续进入供应商月结对账。"
            : "继续逐卷核对剩余标签和实物。",
      rolls: nextRolls,
    };
  }
  if (action === "one_click_inbound") {
    if (before.documentDirection === "supplier_return" || (before.rolls ?? []).some((roll) => !(Number(roll.weightKg) > 0))) {
      throw Object.assign(new Error("退货单或缺少独立正重量的卷不能一键进入可用库存。"), { statusCode: 409, code: "RAW_MATERIAL_ONE_CLICK_INBOUND_BLOCKED" });
    }
    const gate = evaluateRawMaterialOneClickInbound(before);
    if (!gate.allowed) {
      throw Object.assign(new Error(gate.blocker), {
        statusCode: 409,
        code: "RAW_MATERIAL_ONE_CLICK_INBOUND_BLOCKED",
        details: {
          rollCount: gate.rollCount,
          printedLabelCount: gate.printedLabelCount,
          pendingStickConfirmCount: gate.pendingStickConfirmCount,
          exceptionCount: gate.exceptionCount,
        },
      });
    }
    const nextRolls = (before.rolls ?? []).map((roll) => {
      if (!isPendingStickConfirmRoll(roll)) return roll;
      const verification = buildRawMaterialLabelVerification({
        inbound: before,
        roll,
        body: {
          ...input.body,
          location: cleanText(input.body?.location) || "原料库-可用区",
          verificationNote: cleanText(input.body?.verificationNote ?? input.body?.note) || "办公室确认本单已贴齐，一键入库。",
        },
        matchResult: "matched",
        operatorId,
        operatorName,
        now,
      });
      return {
        ...roll,
        labelStatus: "已贴标/可用库存",
        inventoryStatus: "可用",
        labelVerification: verification,
        labelVerifiedAt: now,
        labelVerifiedBy: operatorName,
        labelVerifiedByUserId: operatorId,
        location: verification.location,
      };
    });
    const availableCount = nextRolls.filter((roll) => roll.inventoryStatus === "可用").length;
    after = {
      ...before,
      status: buildRawMaterialInboundLabelStatus({ nextRolls, availableCount, mismatchCount: 0 }),
      confirmedBy: operatorName,
      confirmedByUserId: operatorId,
      confirmedAt: now,
      labelVerificationSummary: {
        availableRollCount: availableCount,
        mismatchRollCount: 0,
        lastVerifiedRollId: "",
        lastMatchResult: "matched",
        oneClickInbound: true,
      },
      nextStep: "整单已贴齐并进入可用库存。异常卷不在本次入库范围内。",
      rolls: nextRolls,
    };
  }
  if (action === "void_label" || action === "reprint_label") {
    const rollId = cleanText(input.body?.rollId);
    if (!rollId) {
      throw Object.assign(new Error("作废或重打标签必须明确选择一卷或一件原材料。"), {
        statusCode: 422,
        code: "RAW_MATERIAL_LABEL_ROLL_REQUIRED",
      });
    }
    const targetRoll = (before.rolls ?? []).find((roll) => roll.id === rollId);
    if (!targetRoll) {
      throw Object.assign(new Error(`Raw material roll not found: ${rollId}`), {
        statusCode: 404,
        code: "RAW_MATERIAL_ROLL_NOT_FOUND",
      });
    }
    if (targetRoll.inventoryStatus === "可用") {
      throw Object.assign(new Error("已确认可用的卷/件不能通过标签作废或重打直接改变库存状态。"), {
        statusCode: 409,
        code: "RAW_MATERIAL_AVAILABLE_ROLL_LABEL_CHANGE_BLOCKED",
      });
    }
    if (!["不可用", "待贴标", "待确认"].includes(targetRoll.inventoryStatus)) {
      throw Object.assign(new Error("机边、已消耗或退厂中的卷料不能通过标签操作恢复库存。"), {
        statusCode: 409,
        code: "RAW_MATERIAL_ROLL_LABEL_STATE_BLOCKED",
      });
    }
    if (action === "void_label" && targetRoll.labelStatus !== "标签或实物不符/待确认") {
      throw Object.assign(new Error("只有标签或实物不符的异常卷/件可以作废当前标签。"), {
        statusCode: 409,
        code: "RAW_MATERIAL_LABEL_VOID_REQUIRES_MISMATCH",
      });
    }
    if (action === "reprint_label" && targetRoll.labelStatus !== "标签已作废/待重打") {
      throw Object.assign(new Error("请先作废当前异常标签，再重打该卷/件标签。"), {
        statusCode: 409,
        code: "RAW_MATERIAL_LABEL_REPRINT_REQUIRES_VOIDED_LABEL",
      });
    }
    const nextRolls = (before.rolls ?? []).map((roll) => {
      if (roll.id !== rollId) return roll;
      if (action === "void_label") {
        return {
          ...roll,
          labelStatus: "标签已作废/待重打",
          inventoryStatus: "待确认",
          labelVoidedAt: now,
          labelVoidedBy: operatorName,
          labelVoidedByUserId: operatorId,
          labelVoidReason: cleanText(input.body?.reason) || "标签或实物不符",
        };
      }
      return {
        ...roll,
        labelStatus: "已打印待贴标",
        inventoryStatus: "待贴标",
        labelVersion: nextRawMaterialLabelVersion(roll),
        labelPrintedAt: now,
        labelPrintedBy: operatorName,
        labelPrintedByUserId: operatorId,
        labelVerification: null,
      };
    });
    const mismatchCount = nextRolls.filter((roll) => roll.labelStatus === "标签或实物不符/待确认").length;
    const availableCount = nextRolls.filter((roll) => roll.inventoryStatus === "可用").length;
    after = {
      ...before,
      status: buildRawMaterialInboundLabelStatus({ nextRolls, availableCount, mismatchCount }),
      nextStep:
        action === "void_label"
          ? "该异常卷标签已作废；确认后可单独重打并重新核对。"
          : "新标签已生成待贴标；请将其贴到本卷/件并重新人工核对。",
      rolls: nextRolls,
    };
  }
  if (action === "stage_supplier_return") after = applyStageRawMaterialSupplierReturn({ before, inbounds, body: input.body, operatorId, operatorName, now });
  if (action === "confirm_supplier_return_shipment") after = applyConfirmRawMaterialSupplierReturnShipment({ before, body: input.body, operatorId, operatorName, now });
  const traceabilityAfter = applyRawMaterialTraceabilityAction({
    action,
    before,
    workspace,
    body: input.body,
    operatorId,
    operatorName,
    now,
  });
  if (traceabilityAfter) after = traceabilityAfter;
  const costMarginAfter = applyRawMaterialCostMarginAction({
    action,
    before,
    workspace,
    body: input.body,
    operatorId,
    operatorName,
    now,
  });
  if (costMarginAfter) after = costMarginAfter;
  if (action === "exception") {
    const reason = cleanText(input.body?.reason) || "现场标记异常，待补充。";
    after = {
      ...before,
      status: "入库异常/待确认",
      exceptionBy: operatorName,
      exceptionByUserId: operatorId,
      exceptionAt: now,
      nextStep: "补照片 / 补重量 / 供应商确认后重新复核。",
      note: `${before.note || ""} 入库异常：${reason}`.trim(),
    };
  }
  if (after === before) {
    throw Object.assign(new Error(`Unsupported raw material inbound action: ${input.action}`), { statusCode: 400 });
  }
  after = {
    ...after,
    revision: expectedRevision + 1,
    updatedAt: now,
  };
  const operationLog = {
    id: `RMI-LOG-${rawMaterialRecordIdentitySuffix()}`,
    targetType: "raw_material_inbound",
    targetId: inboundId,
    action,
    before: summarizeRawMaterialInbound(before),
    after: summarizeRawMaterialInbound(after),
    reason: cleanText(input.body?.reason) || getRawMaterialActionReason(action),
    operatorId,
    operatorName,
    pageKey: "rawMaterials",
    occurredAt: now,
    createdAt: now,
  };
  const nextInbounds = [...inbounds];
  nextInbounds[index] = after;
  return {
    inbounds: nextInbounds,
    inbound: after,
    expectedRevision,
    operationLog,
  };
}

export function findRawMaterialInbound(workspace, inboundId) {
  const safeInboundId = cleanText(inboundId);
  return normalizeRawMaterialInbounds(workspace?.rawMaterialInbounds).find((item) => item.id === safeInboundId) ?? null;
}

function normalizeRawMaterialLabelMatchResult(value) {
  const normalized = cleanText(value).toLowerCase();
  if (["matched", "match", "一致", "匹配"].includes(normalized)) return "matched";
  if (["mismatched", "mismatch", "不一致", "不匹配"].includes(normalized)) return "mismatched";
  return "";
}

function buildRawMaterialLabelVerification({ inbound, roll, body, matchResult, operatorId, operatorName, now }) {
  const expectedWeightKg = finiteRawMaterialNumber(roll.weightKg);
  const checkedWeightKg = finiteRawMaterialNumber(body?.checkedWeightKg ?? body?.actualWeightKg ?? expectedWeightKg);
  const expectedColor = cleanText(roll.factoryColor) || cleanText(roll.supplierColor) || cleanText(inbound.factoryColor) || cleanText(inbound.supplierColor);
  const expectedSpec = cleanText(roll.spec) || cleanText(inbound.spec);
  const location = cleanText(body?.location) || (matchResult === "matched" ? "原料库-可用区" : "原料隔离区");
  return {
    result: matchResult === "matched" ? "匹配" : "不匹配",
    resultCode: matchResult,
    labelVersion: currentRawMaterialLabelVersion(roll),
    expected: {
      weightKg: expectedWeightKg,
      color: expectedColor,
      spec: expectedSpec,
    },
    checked: {
      weightKg: checkedWeightKg,
      color: cleanText(body?.checkedColor ?? body?.actualColor ?? expectedColor),
      spec: cleanText(body?.checkedSpec ?? body?.actualSpec ?? expectedSpec),
    },
    location,
    note: cleanText(body?.verificationNote ?? body?.note),
    verifiedBy: operatorName,
    verifiedByUserId: operatorId,
    verifiedAt: now,
  };
}

function buildRawMaterialInboundLabelStatus({ nextRolls, availableCount, mismatchCount }) {
  if (mismatchCount > 0) return `部分入库，${mismatchCount}卷异常`;
  if (nextRolls.length > 0 && availableCount === nextRolls.length) return "已贴标/可用库存";
  if (availableCount > 0) return "部分贴标";
  return "已打印待贴标";
}

function nextRawMaterialLabelVersion(roll = {}) {
  return Math.max(0, Math.trunc(Number(roll.labelVersion) || 0)) + 1;
}

function currentRawMaterialLabelVersion(roll = {}) { return Math.max(1, Math.trunc(Number(roll.labelVersion) || 1)); }

function finiteRawMaterialNumber(value) { const number = Number(value); return Number.isFinite(number) ? number : 0; }

function normalizeAction(action) {
  const value = cleanText(action);
  const actionMap = new Map([
    ["reparse_ocr", "reparse_ocr"],
    ["作废误录草稿", "void_draft"], ["void_draft", "void_draft"], ["void-draft", "void_draft"],
    ["复核送货单", "review"],
    ["review", "review"],
    ["打印卷标", "print_labels"],
    ["print_labels", "print_labels"],
    ["print-labels", "print_labels"],
    ["暂缓打印卷标", "defer_labels"],
    ["defer_labels", "defer_labels"],
    ["defer-labels", "defer_labels"],
    ["确认贴标入库", "attach_confirm"],
    ["attach_confirm", "attach_confirm"],
    ["attach-confirm", "attach_confirm"],
    ["本单已贴齐/一键入库", "one_click_inbound"],
    ["one_click_inbound", "one_click_inbound"],
    ["one-click-inbound", "one_click_inbound"],
    ["作废卷标", "void_label"],
    ["void_label", "void_label"],
    ["void-label", "void_label"],
    ["重打卷标", "reprint_label"], ["reprint_label", "reprint_label"], ["reprint-label", "reprint_label"],
    ["供应商退货暂存", "stage_supplier_return"], ["stage_supplier_return", "stage_supplier_return"], ["stage-supplier-return", "stage_supplier_return"],
    ["确认退厂", "confirm_supplier_return_shipment"], ["confirm_supplier_return_shipment", "confirm_supplier_return_shipment"], ["confirm-supplier-return-shipment", "confirm_supplier_return_shipment"],
    ["机边领料", "issue_to_machine"], ["扫码出库", "issue_to_machine"], ["issue_to_machine", "issue_to_machine"], ["issue-to-machine", "issue_to_machine"],
    ["确认消耗", "confirm_consumption"],
    ["confirm_consumption", "confirm_consumption"],
    ["confirm-consumption", "confirm_consumption"],
    ["余料退回", "return_leftover"],
    ["return_leftover", "return_leftover"],
    ["return-leftover", "return_leftover"],
    ["复核余料可用", "review_leftover"],
    ["review_leftover", "review_leftover"],
    ["review-leftover", "review_leftover"],
    ["生成成本草稿", "generate_cost_draft"],
    ["generate_cost_draft", "generate_cost_draft"],
    ["generate-cost-draft", "generate_cost_draft"],
    ["确认成本草稿", "confirm_cost_draft"],
    ["confirm_cost_draft", "confirm_cost_draft"],
    ["confirm-cost-draft", "confirm_cost_draft"],
    ["校准损耗", "calibrate_loss"],
    ["损耗校准", "calibrate_loss"],
    ["calibrate_loss", "calibrate_loss"],
    ["calibrate-loss", "calibrate_loss"],
    ["生成毛利快照", "generate_margin_snapshot"],
    ["毛利快照", "generate_margin_snapshot"],
    ["generate_margin_snapshot", "generate_margin_snapshot"],
    ["generate-margin-snapshot", "generate_margin_snapshot"],
    ["复核毛利快照", "review_margin_snapshot"],
    ["确认毛利快照", "review_margin_snapshot"],
    ["毛利报表", "review_margin_snapshot"],
    ["review_margin_snapshot", "review_margin_snapshot"],
    ["review-margin-snapshot", "review_margin_snapshot"],
    ["标记异常", "exception"],
    ["exception", "exception"],
  ]);
  return actionMap.get(value) ?? value;
}

function getRawMaterialActionReason(action) {
  if (action === "reparse_ocr") return "使用已保存的 OCR 表格升级解析结果，未再次请求云端 OCR";
  if (action === "void_draft") return "作废尚未形成库存的误录原材料草稿，保留原图和操作审计";
  if (action === "review") return "人工复核原材料送货单、OCR 字段和实物原标签";
  if (action === "print_labels") return "打印一卷一标，等待逐卷贴标和人工核对";
  if (action === "defer_labels") return "逐卷卷码已生成；现场暂缓打印，卷料保存为待补标且不计入可用库存";
  if (action === "attach_confirm") return "逐卷人工核对标签、实物重量、颜色、规格和库位";
  if (action === "one_click_inbound") return "打印标签数、卷数和待贴标卷数一致后，整单贴齐并进入可用库存；异常卷不入库";
  if (action === "void_label") return "单独作废异常卷/件的旧标签，不影响其他已确认卷/件";
  if (action === "reprint_label") return "单独重打异常卷/件标签，等待重新贴标和人工核对";
  if (action === "stage_supplier_return") return "扫描已有库存卷码并关联已复核退货单，转入供应商退货暂存区";
  if (action === "confirm_supplier_return_shipment") return "确认暂存卷/件已经交还供应商，完成一次实物库存退厂";
  if (action === "issue_to_machine") return "按卷码扫码出库并记录机台；生产任务可在后续阶段关联";
  if (action === "confirm_consumption") return "确认整卷/整件或部分原材料已被生产消耗，不生成成品数量或成本分摊";
  if (action === "return_leftover" || action === "review_leftover") return "整卷进整卷出：机边余料不能退回或复核为可用库存";
  if (action === "generate_cost_draft") return "按已确认消耗和已匹配生产任务生成原材料成本分摊草稿";
  if (action === "confirm_cost_draft") return "复核确认原材料成本草稿为成本快照，损耗和毛利仍需独立流程";
  if (action === "calibrate_loss") return "校准已确认原材料成本快照的损耗，毛利报表仍需独立确认";
  if (action === "generate_margin_snapshot") return "生成待财务复核的订单毛利快照，不写最终结算";
  if (action === "review_margin_snapshot") return "财务复核订单毛利快照并生成内部毛利报表，不写客户对账";
  if (action === "exception") return "原材料入库异常，等待补充证据或供应商确认";
  return "原材料入库动作";
}

function summarizeRawMaterialInbound(item = {}) {
  return {
    inboundId: item.id,
    deliveryNoteNo: item.deliveryNoteNo,
    status: item.status,
    signedNoteStatus: item.signedNoteStatus,
    availableRollCount: (item.rolls ?? []).filter((roll) => roll.inventoryStatus === "可用").length,
    machineSideRollCount: (item.rolls ?? []).filter((roll) => roll.inventoryStatus === "机边领用").length,
    consumedRollCount: (item.rolls ?? []).filter((roll) => roll.inventoryStatus === "已消耗").length,
    leftoverPendingRollCount: (item.rolls ?? []).filter((roll) => roll.inventoryStatus === "余料待复核").length,
    leftoverReviewedRollCount: (item.rolls ?? []).filter((roll) => roll.leftoverReviewRecordId).length,
    splitRollCount: (item.rawMaterialSplitRecords ?? []).length,
    costAllocationDraftCount: (item.rawMaterialCostAllocationDrafts ?? []).length,
    costAllocationConfirmedCount: (item.rawMaterialCostAllocationConfirmations ?? []).length,
    lossCalibrationCount: (item.rawMaterialCostLossCalibrations ?? []).length,
    marginSnapshotCount: (item.rawMaterialOrderMarginSnapshots ?? []).length,
    marginReportCount: (item.rawMaterialOrderMarginReports ?? []).length,
    rollCount: (item.rolls ?? []).length,
    ocrParserVersion: Number(item.ocrParserVersion) || 0,
    ocrLineCount: (item.ocrLines ?? []).length,
    ocrReviewedLineCount: (item.ocrLines ?? []).filter((line) => line.reviewedAt).length,
    ocrModifiedLineCount: (item.ocrLines ?? []).filter((line) => line.reviewStatus === "人工修改").length,
    ocrExcludedLineCount: (item.ocrLines ?? []).filter((line) => (line.excludedRollIndices ?? []).length > 0).length, ocrExcludedRollCount: (item.ocrLines ?? []).flatMap((line) => Array.isArray(line.excludedRollIndices) ? line.excludedRollIndices : []).length,
  };
}

function cleanText(value) {
  return String(value ?? "").trim();
}
