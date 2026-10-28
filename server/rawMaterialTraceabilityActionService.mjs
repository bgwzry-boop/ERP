import { readRawMaterialConsumptionMeasurement } from "../shared/rawMaterialConsumptionMeasurement.js";
import { assertRawMaterialConsumptionMeasurement } from "../shared/rawMaterialMeasurements.js";
import { requireRawMaterialCurrentRecord } from "../shared/rawMaterialCurrentRecord.js";
import { requireRawMaterialIssueAssignment } from "../shared/rawMaterialIssueAssignment.js";
import { rawMaterialRecordIdentitySuffix } from "../shared/rawMaterialRecordIdentity.js";
import { rawMaterialRollFacts } from "../shared/rawMaterialRollFacts.js";
import { resolveRawMaterialProductionTaskMatch } from "./rawMaterialInboundRecordService.mjs";
import { assertWholeRollIssue } from "../src/domain/rawMaterialWholeRollPolicy.js";
import {
  normalizeRawMaterialConsumptionRecords,
  normalizeRawMaterialIssueRecords,
  normalizeRawMaterialSplitRecords,
} from "./rawMaterialTraceabilityRecordNormalizer.mjs";

const RAW_MATERIAL_TRACEABILITY_ACTIONS = new Set([
  "issue_to_machine",
  "confirm_consumption",
  "return_leftover",
  "review_leftover",
]);

export function applyRawMaterialTraceabilityAction(input = {}) {
  const action = cleanText(input.action);
  if (!RAW_MATERIAL_TRACEABILITY_ACTIONS.has(action)) return null;
  const before = input.before ?? {};
  if (action === "return_leftover" || action === "review_leftover") {
    throw Object.assign(new Error("机边余料不能退回可用库存，剩余重量继续保留在机边。"), {
      statusCode: 409,
      code: "RAW_MATERIAL_LEFTOVER_RETURN_TO_AVAILABLE_DISABLED",
    });
  }
  const workspace = input.workspace ?? {};
  const operatorId = cleanText(input.operatorId);
  const operatorName = cleanText(input.operatorName ?? operatorId);
  const now = cleanText(input.now) || new Date().toISOString();
  let after = before;
  if (action === "issue_to_machine") {
    const rollId = cleanText(input.body?.rollId);
    let machineId = cleanText(input.body?.machineId);
    const productionTaskId = cleanText(input.body?.productionTaskId);
    if (!rollId) {
      throw Object.assign(new Error("机边领料必须选择已确认可用的单卷/件。"), {
        statusCode: 422,
        code: "RAW_MATERIAL_ISSUE_ROLL_REQUIRED",
      });
    }
    if (!machineId) {
      throw Object.assign(new Error("扫码出库必须填写领用机台或区域。"), {
        statusCode: 422, code: "RAW_MATERIAL_ISSUE_MACHINE_REQUIRED",
      });
    }
    const selectedRoll = (before.rolls ?? []).find((roll) => roll.id === rollId);
    const wholeRoll = assertWholeRollIssue({
      machineId,
      requestedWeightKg: input.body?.issuedWeightKg ?? input.body?.weightKg,
      fullWeightKg: selectedRoll?.weightKg,
    });
    if (!wholeRoll.ok) throw Object.assign(new Error(wholeRoll.message), { statusCode: wholeRoll.statusCode, code: wholeRoll.code });
    machineId = wholeRoll.machineLabel;
    if (selectedRoll?.inventoryStatus === "可用"
      && String(selectedRoll.labelStatus || "").includes("已贴标")
      && !(Number(selectedRoll.weightKg) > 0)) {
      throw Object.assign(new Error("该卷/件缺少真实重量，不能作为可用原料领到机边。"), {
        statusCode: 409, code: "RAW_MATERIAL_ISSUE_WEIGHT_REQUIRED",
      });
    }
    const productionTaskMatch = resolveRawMaterialProductionTaskMatch({
      workspace,
      inbound: {
        ...before,
        ...rawMaterialRollFacts(before, selectedRoll),
        materialCategory: selectedRoll?.materialCategory || (selectedRoll?.ocrLineId ? "" : before.materialCategory),
        widthCm: Number(selectedRoll?.widthCm) > 0 ? Number(selectedRoll.widthCm) : selectedRoll?.ocrLineId ? 0 : before.widthCm,
      },
      machineId,
      productionTaskId,
    });
    const issuePurpose = cleanText(input.body?.issuePurpose) || "生产领料";
    const requestedWeightKg = Number(input.body?.issuedWeightKg ?? input.body?.weightKg);
    const requestedQuantity = Number(input.body?.issuedQuantity ?? input.body?.quantity);
    const availableRolls = (before.rolls ?? []).filter((roll) =>
      roll.inventoryStatus === "可用" && String(roll.labelStatus || "").includes("已贴标") && Number(roll.weightKg) > 0);
    const targetAvailableRolls = rollId ? availableRolls.filter((roll) => roll.id === rollId) : availableRolls;
    if (rollId && !(before.rolls ?? []).some((roll) => roll.id === rollId)) {
      throw Object.assign(new Error(`Raw material roll not found: ${rollId}`), { statusCode: 404 });
    }
    if (!targetAvailableRolls.length) {
      throw Object.assign(new Error("Only available labeled raw-material rolls/pieces can be issued to machine side"), {
        statusCode: 409,
        code: "RAW_MATERIAL_ISSUE_REQUIRES_AVAILABLE_ROLL",
      });
    }
    if (!rollId && (Number.isFinite(requestedWeightKg) || Number.isFinite(requestedQuantity))) {
      throw Object.assign(new Error("Measured raw-material issue requires a single rollId"), {
        statusCode: 422,
        code: "RAW_MATERIAL_ISSUE_MEASURE_REQUIRES_ROLL",
      });
    }
    if (rollId && Number.isFinite(requestedWeightKg) && requestedWeightKg > 0 && targetAvailableRolls[0]?.weightKg > 0) {
      const fullWeight = Number(targetAvailableRolls[0].weightKg) || 0;
      if (requestedWeightKg - fullWeight > 0.001) {
        throw Object.assign(new Error("Issued raw-material weight cannot exceed available roll weight"), {
          statusCode: 422,
          code: "RAW_MATERIAL_ISSUE_WEIGHT_EXCEEDS_AVAILABLE",
        });
      }
    }
    if (rollId && Number.isFinite(requestedQuantity) && requestedQuantity > 0 && requestedQuantity !== 1) {
      throw Object.assign(new Error("V1 only supports full-piece raw-material issue; partial quantity issue requires a later workflow"), {
        statusCode: 422,
        code: "RAW_MATERIAL_PARTIAL_QUANTITY_ISSUE_NOT_SUPPORTED",
      });
    }
    const issueRecordId = `RMI-ISS-${now.slice(0, 10).replaceAll("-", "")}-${rawMaterialRecordIdentitySuffix()}`;
    const splitRecordId = `RMI-SPLIT-${now.slice(0, 10).replaceAll("-", "")}-${rawMaterialRecordIdentitySuffix()}`;
    const issuedSourceRollIds = new Set(targetAvailableRolls.map((roll) => roll.id));
    const splitRecords = [];
    const issueRecords = targetAvailableRolls.map((roll, rollIndex) => {
      const fullWeightKg = Number(roll.weightKg) || 0;
      const isPartialWeightIssue =
        rollId === roll.id &&
        fullWeightKg > 0 &&
        Number.isFinite(requestedWeightKg) &&
        requestedWeightKg > 0 &&
        fullWeightKg - requestedWeightKg > 0.001;
      const issuedRollId = isPartialWeightIssue ? buildRawMaterialSplitRollId(before.rolls, roll.id) : roll.id;
      const issuedWeightKg = isPartialWeightIssue ? roundWeight(requestedWeightKg) : fullWeightKg;
      const remainingWeightKg = isPartialWeightIssue ? roundWeight(fullWeightKg - requestedWeightKg) : 0;
      const currentSplitRecordId = isPartialWeightIssue ? `${splitRecordId}-${String(splitRecords.length + 1).padStart(2, "0")}` : "";
      if (isPartialWeightIssue) {
        splitRecords.push({
          splitRecordId: currentSplitRecordId,
          inboundId: before.id,
          sourceRollId: roll.id,
          issuedRollId,
          supplierRollNo: roll.supplierRollNo,
          ...rawMaterialRollFacts(before, roll),
          sourceWeightKg: fullWeightKg,
          issuedWeightKg,
          remainingWeightKg,
          unit: before.unit || "kg",
          splitMode: "部分领料/拆卷",
          machineId,
          productionTaskId,
          productionTaskMatchStatus: productionTaskMatch.status,
          productionTaskMatchReason: productionTaskMatch.reason,
          productionTaskOrderLineId: productionTaskMatch.orderLineId,
          productionTaskMachineId: productionTaskMatch.machineId,
          productionTaskGoodsSpec: productionTaskMatch.goodsSpec,
          splitBy: operatorName,
          splitByUserId: operatorId,
          splitAt: now,
          note: cleanText(input.body?.note) || "V1 记录拆卷领料和剩余可用重量；仍不做成本分摊或损耗校准。",
        });
      }
      return {
        issueRecordId: `${issueRecordId}-${String(rollIndex + 1).padStart(2, "0")}`,
        inboundId: before.id,
        rollId: issuedRollId,
        sourceRollId: isPartialWeightIssue ? roll.id : "",
        splitRecordId: currentSplitRecordId,
        supplierRollNo: roll.supplierRollNo,
        ...rawMaterialRollFacts(before, roll),
        issuedWeightKg,
        issuedQuantity: fullWeightKg > 0 ? 0 : 1,
        sourceWeightKg: fullWeightKg,
        remainingWeightKg,
        unit: before.unit || (fullWeightKg > 0 ? "kg" : "件"),
        machineId,
        productionTaskId,
        productionTaskMatchStatus: productionTaskMatch.status,
        productionTaskMatchReason: productionTaskMatch.reason,
        productionTaskOrderLineId: productionTaskMatch.orderLineId,
        productionTaskMachineId: productionTaskMatch.machineId,
        productionTaskGoodsSpec: productionTaskMatch.goodsSpec,
        issuePurpose,
        issueMode: isPartialWeightIssue ? "部分领料/拆卷" : "整卷/整件领料",
        consumptionStatus: "待生产消耗确认",
        issuedBy: operatorName,
        issuedByUserId: operatorId,
        issuedAt: now,
        note: cleanText(input.body?.note) || (isPartialWeightIssue
          ? "V1 记录拆卷机边领料，剩余重量保留可用；不生成成品数量或成本分摊。"
          : "V1 记录整卷/整件机边领料，不生成成品数量，不做成本分摊。"),
      };
    });
    const nextRolls = (before.rolls ?? []).flatMap((roll) => {
      if (!issuedSourceRollIds.has(roll.id)) return [roll];
      const splitRecord = splitRecords.find((item) => item.sourceRollId === roll.id);
      if (splitRecord) {
        const issueRecord = issueRecords.find((item) => item.rollId === splitRecord.issuedRollId);
        const sourceRoll = {
          ...roll,
          weightKg: splitRecord.remainingWeightKg,
          inventoryStatus: "可用",
          location: roll.location || "原料库-可用区",
          splitRecordId: splitRecord.splitRecordId,
          splitStatus: "已拆卷/部分领料",
          splitAt: now,
          splitBy: operatorName,
          splitByUserId: operatorId,
          originalWeightKg: splitRecord.sourceWeightKg,
          splitIssuedWeightKg: splitRecord.issuedWeightKg,
          splitRemainingWeightKg: splitRecord.remainingWeightKg,
        };
        const issuedRoll = {
          ...roll,
          id: splitRecord.issuedRollId,
          supplierRollNo: roll.supplierRollNo ? `${roll.supplierRollNo}/拆1` : `${roll.id}/拆1`,
          weightKg: splitRecord.issuedWeightKg,
          parentRollId: roll.id,
          sourceRollId: roll.id,
          splitRecordId: splitRecord.splitRecordId,
          splitStatus: "拆出机边领料",
          inventoryStatus: "机边领用",
          location: machineId === "机边待分配" ? "机边待消耗区" : `机边-${machineId}`,
          issueRecordId: issueRecord.issueRecordId,
          issuedAt: now,
          issuedBy: operatorName,
          issuedByUserId: operatorId,
          machineId,
          productionTaskId,
          productionTaskMatchStatus: productionTaskMatch.status,
          productionTaskMatchReason: productionTaskMatch.reason,
          productionTaskOrderLineId: productionTaskMatch.orderLineId,
          productionTaskMachineId: productionTaskMatch.machineId,
          productionTaskGoodsSpec: productionTaskMatch.goodsSpec,
          issuePurpose,
          consumptionStatus: "待生产消耗确认",
        };
        return [sourceRoll, issuedRoll];
      }
      const record = issueRecords.find((item) => item.rollId === roll.id);
      return [{
        ...roll,
        inventoryStatus: "机边领用",
        location: machineId === "机边待分配" ? "机边待消耗区" : `机边-${machineId}`,
        issueRecordId: record.issueRecordId,
        issuedAt: now,
        issuedBy: operatorName,
        issuedByUserId: operatorId,
        machineId,
        productionTaskId,
        productionTaskMatchStatus: productionTaskMatch.status,
        productionTaskMatchReason: productionTaskMatch.reason,
        productionTaskOrderLineId: productionTaskMatch.orderLineId,
        productionTaskMachineId: productionTaskMatch.machineId,
        productionTaskGoodsSpec: productionTaskMatch.goodsSpec,
        issuePurpose,
        consumptionStatus: "待生产消耗确认",
      }];
    });
    const issuedCount = nextRolls.filter((roll) => roll.inventoryStatus === "机边领用").length;
    const nextStatus = nextRolls.length > 0 && issuedCount === nextRolls.length ? "已领料/机边" : "部分领料/机边";
    after = {
      ...before,
      status: nextStatus,
      issueStatus: nextStatus,
      issuedBy: operatorName,
      issuedByUserId: operatorId,
      issuedAt: now,
      machineId,
      productionTaskId,
      productionTaskMatchStatus: productionTaskMatch.status,
      productionTaskMatchReason: productionTaskMatch.reason,
      productionTaskOrderLineId: productionTaskMatch.orderLineId,
      productionTaskMachineId: productionTaskMatch.machineId,
      productionTaskGoodsSpec: productionTaskMatch.goodsSpec,
      nextStep: productionTaskId ? "等待生产报工时确认原材料消耗；机台计数仍只作凭证，不直接生成成品或成本分摊。"
        : "已扫码出库并记录机台、颜色、规格、宽幅和重量；首发阶段暂不关联订单或生产任务。",
      rawMaterialIssueRecords: [
        ...normalizeRawMaterialIssueRecords(before.rawMaterialIssueRecords),
        ...issueRecords,
      ],
      rawMaterialSplitRecords: [
        ...normalizeRawMaterialSplitRecords(before.rawMaterialSplitRecords),
        ...splitRecords,
      ],
      rolls: nextRolls,
    };
  }
  if (action === "confirm_consumption") {
    assertRawMaterialConsumptionMeasurement(input.body);
    const rollId = cleanText(input.body?.rollId);
    const requestedWeightKg = Number(input.body?.consumedWeightKg ?? input.body?.weightKg);
    const requestedQuantity = Number(input.body?.consumedQuantity ?? input.body?.quantity);
    const machineSideRolls = (before.rolls ?? []).filter((roll) => roll.inventoryStatus === "机边领用");
    const targetMachineSideRolls = rollId ? machineSideRolls.filter((roll) => roll.id === rollId) : machineSideRolls;
    if (rollId && !(before.rolls ?? []).some((roll) => roll.id === rollId)) {
      throw Object.assign(new Error(`Raw material roll not found: ${rollId}`), { statusCode: 404 });
    }
    if (!targetMachineSideRolls.length) {
      throw Object.assign(new Error("Only machine-side raw-material rolls/pieces can be confirmed as consumed"), {
        statusCode: 409,
        code: "RAW_MATERIAL_CONSUMPTION_REQUIRES_MACHINE_SIDE_ROLL",
      });
    }
    if (targetMachineSideRolls.length > 1 && (Number.isFinite(requestedWeightKg) || Number.isFinite(requestedQuantity))) {
      throw Object.assign(new Error("Measured raw-material consumption requires a single rollId in V1"), {
        statusCode: 422,
        code: "RAW_MATERIAL_CONSUMPTION_MEASURE_REQUIRES_ROLL",
      });
    }
    const existingIssueRecords = normalizeRawMaterialIssueRecords(before.rawMaterialIssueRecords);
    const consumptionRecordId = `RMI-CONS-${now.slice(0, 10).replaceAll("-", "")}-${rawMaterialRecordIdentitySuffix()}`;
    const consumedRollIds = new Set(targetMachineSideRolls.map((roll) => roll.id));
    const consumptionRecords = targetMachineSideRolls.map((roll, rollIndex) => {
      const issueRecord = requireRawMaterialCurrentRecord(roll, existingIssueRecords, "issueRecordId");
      const {machineSideWeightKg, consumedWeightKg, consumedQuantity, remainingMachineSideWeightKg, partialConsumption:isPartialWeightConsumption} = readRawMaterialConsumptionMeasurement(roll, input.body, before.unit);
      return {
        consumptionRecordId: `${consumptionRecordId}-${String(rollIndex + 1).padStart(2, "0")}`,
        inboundId: before.id,
        issueRecordId: roll.issueRecordId || issueRecord?.issueRecordId || "",
        rollId: roll.id,
        supplierRollNo: roll.supplierRollNo,
        ...rawMaterialRollFacts(before, roll),
        consumedWeightKg,
        consumedQuantity,
        consumedFromWeightKg: machineSideWeightKg,
        remainingMachineSideWeightKg,
        partialConsumption: isPartialWeightConsumption,
        unit: before.unit || (consumedWeightKg > 0 ? "kg" : "件"),
        ...requireRawMaterialIssueAssignment(roll, issueRecord, input.body),
        machineCount: cleanText(input.body?.machineCount),
        qualifiedOutputQuantity: Number(input.body?.qualifiedOutputQuantity) || 0,
        consumptionStatus: isPartialWeightConsumption ? "部分消耗/机边" : "已确认消耗",
        confirmedBy: operatorName,
        confirmedByUserId: operatorId,
        confirmedAt: now,
        note: cleanText(input.body?.note) || (isPartialWeightConsumption
          ? "V1 记录机边部分消耗，剩余重量仍在机边；机台计数不等于合格成品数量，不做成本分摊。"
          : "V1 仅确认整卷/整件已消耗；机台计数不等于合格成品数量，不做成本分摊。"),
      };
    });
    const nextRolls = (before.rolls ?? []).map((roll) => {
      if (!consumedRollIds.has(roll.id)) return roll;
      const record = consumptionRecords.find((item) => item.rollId === roll.id);
      if (record?.partialConsumption) {
        return {
          ...roll,
          weightKg: record.remainingMachineSideWeightKg,
          inventoryStatus: "机边领用",
          location: roll.location || (record.machineId === "机边待分配" ? "机边待消耗区" : `机边-${record.machineId}`),
          consumptionStatus: "部分消耗/机边",
          consumptionRecordId: record.consumptionRecordId,
          consumedAt: now,
          consumedBy: operatorName,
          consumedByUserId: operatorId,
          lastConsumedWeightKg: record.consumedWeightKg,
          lastConsumedQuantity: record.consumedQuantity,
          remainingMachineSideWeightKg: record.remainingMachineSideWeightKg,
        };
      }
      return {
        ...roll,
        inventoryStatus: "已消耗",
        lastConsumedWeightKg: record.consumedWeightKg,
        lastConsumedQuantity: record.consumedQuantity,
        remainingMachineSideWeightKg: 0,
        location: "已消耗归档",
        consumptionStatus: "已确认消耗",
        consumptionRecordId: record.consumptionRecordId,
        consumedAt: now,
        consumedBy: operatorName,
        consumedByUserId: operatorId,
      };
    });
    const nextIssueRecords = existingIssueRecords.map((record) =>
      consumptionRecords.some(entry => entry.issueRecordId === record.issueRecordId)
        ? (() => {
            const consumptionRecord = consumptionRecords.find((item) => item.issueRecordId === record.issueRecordId);
            const previousConsumedWeightKg = Number(record.consumedWeightKg) || 0;
            return {
              ...record,
              consumptionStatus: consumptionRecord?.partialConsumption ? "部分消耗/机边" : "已确认消耗",
              consumptionRecordId: consumptionRecord?.consumptionRecordId || "",
              consumedWeightKg: roundWeight(previousConsumedWeightKg + (Number(consumptionRecord?.consumedWeightKg) || 0)),
              remainingMachineSideWeightKg: Number(consumptionRecord?.remainingMachineSideWeightKg) || 0,
              consumedAt: now,
              consumedBy: operatorName,
              consumedByUserId: operatorId,
            };
          })()
        : record,
    );
    const consumedCount = nextRolls.filter((roll) => roll.inventoryStatus === "已消耗").length;
    const machineSideCount = nextRolls.filter((roll) => roll.inventoryStatus === "机边领用").length;
    const nextStatus = machineSideCount ? "部分消耗确认" : consumedCount === nextRolls.length ? "已消耗确认" : "部分消耗确认";
    after = {
      ...before,
      status: nextStatus,
      issueStatus: nextStatus,
      consumptionStatus: nextStatus,
      consumedBy: operatorName,
      consumedByUserId: operatorId,
      consumedAt: now,
      nextStep: "已形成原材料消耗留痕；后续成本分摊、损耗校准和毛利报表仍需独立流程。",
      rawMaterialIssueRecords: nextIssueRecords,
      rawMaterialConsumptionRecords: [
        ...normalizeRawMaterialConsumptionRecords(before.rawMaterialConsumptionRecords),
        ...consumptionRecords,
      ],
      rolls: nextRolls,
    };
  }
  return after;
}

function buildRawMaterialSplitRollId(rolls = [], sourceRollId = "") {
  const safeSourceRollId = cleanText(sourceRollId);
  const existingIds = new Set((Array.isArray(rolls) ? rolls : []).map((roll) => cleanText(roll.id)));
  for (let index = 1; index < 100; index += 1) {
    const candidate = `${safeSourceRollId}-S${String(index).padStart(2, "0")}`;
    if (!existingIds.has(candidate)) return candidate;
  }
  return `${safeSourceRollId}-S${rawMaterialRecordIdentitySuffix()}`;
}

function roundWeight(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.round(number * 1000) / 1000;
}

function cleanText(value) {
  return String(value ?? "").trim();
}
