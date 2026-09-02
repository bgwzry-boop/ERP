import { resolveRawMaterialProductionTaskMatch } from "./rawMaterialInboundRecordService.mjs";
import {
  normalizeRawMaterialConsumptionRecords,
  normalizeRawMaterialIssueRecords,
  normalizeRawMaterialLeftoverReturnRecords,
  normalizeRawMaterialLeftoverReviewRecords,
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
  const workspace = input.workspace ?? {};
  const operatorId = cleanText(input.operatorId);
  const operatorName = cleanText(input.operatorName ?? operatorId);
  const now = cleanText(input.now) || new Date().toISOString();
  let after = before;
  if (action === "issue_to_machine") {
    const rollId = cleanText(input.body?.rollId);
    const machineId = cleanText(input.body?.machineId);
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
    const productionTaskMatch = resolveRawMaterialProductionTaskMatch({
      workspace,
      inbound: before,
      machineId,
      productionTaskId,
    });
    const issuePurpose = cleanText(input.body?.issuePurpose) || "生产领料";
    const requestedWeightKg = Number(input.body?.issuedWeightKg ?? input.body?.weightKg);
    const requestedQuantity = Number(input.body?.issuedQuantity ?? input.body?.quantity);
    const availableRolls = (before.rolls ?? []).filter((roll) =>
      roll.inventoryStatus === "可用" && String(roll.labelStatus || "").includes("已贴标"));
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
    const issueRecordId = `RMI-ISS-${now.slice(0, 10).replaceAll("-", "")}-${Date.now().toString(36).toUpperCase()}`;
    const splitRecordId = `RMI-SPLIT-${now.slice(0, 10).replaceAll("-", "")}-${Date.now().toString(36).toUpperCase()}`;
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
          materialType: before.materialType,
          productName: before.productName,
          spec: before.spec,
          factoryColor: before.factoryColor,
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
        materialType: before.materialType,
        productName: before.productName,
        spec: before.spec,
        factoryColor: before.factoryColor,
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
    for (const roll of targetMachineSideRolls) {
      const issueRecord = existingIssueRecords.find((record) => record.rollId === roll.id);
      const fullWeightKg = Number(roll.weightKg) || Number(issueRecord?.issuedWeightKg) || 0;
      if (Number.isFinite(requestedWeightKg) && requestedWeightKg > 0 && fullWeightKg > 0 && Math.abs(requestedWeightKg - fullWeightKg) > 0.001) {
        if (requestedWeightKg - fullWeightKg > 0.001) {
          throw Object.assign(new Error("Consumed raw-material weight cannot exceed machine-side weight"), {
            statusCode: 422,
            code: "RAW_MATERIAL_CONSUMPTION_WEIGHT_EXCEEDS_MACHINE_SIDE",
          });
        }
      }
      if (Number.isFinite(requestedQuantity) && requestedQuantity > 0 && requestedQuantity !== 1) {
        throw Object.assign(new Error("V1 consumption confirmation only supports full-piece consumption; partial quantity requires return-leftover workflow"), {
          statusCode: 422,
          code: "RAW_MATERIAL_PARTIAL_QUANTITY_CONSUMPTION_NOT_SUPPORTED",
        });
      }
    }
    const consumptionRecordId = `RMI-CONS-${now.slice(0, 10).replaceAll("-", "")}-${Date.now().toString(36).toUpperCase()}`;
    const consumedRollIds = new Set(targetMachineSideRolls.map((roll) => roll.id));
    const consumptionRecords = targetMachineSideRolls.map((roll, rollIndex) => {
      const issueRecord = existingIssueRecords.find((record) => record.rollId === roll.id);
      const machineSideWeightKg =
        Number(roll.weightKg) ||
        Number(issueRecord?.remainingMachineSideWeightKg) ||
        Number(issueRecord?.remainingWeightKg) ||
        Number(issueRecord?.issuedWeightKg) ||
        0;
      const isPartialWeightConsumption =
        machineSideWeightKg > 0 &&
        Number.isFinite(requestedWeightKg) &&
        requestedWeightKg > 0 &&
        machineSideWeightKg - requestedWeightKg > 0.001;
      const consumedWeightKg = isPartialWeightConsumption ? roundWeight(requestedWeightKg) : machineSideWeightKg;
      const remainingMachineSideWeightKg = isPartialWeightConsumption ? roundWeight(machineSideWeightKg - requestedWeightKg) : 0;
      const consumedQuantity = consumedWeightKg > 0 ? 0 : 1;
      return {
        consumptionRecordId: `${consumptionRecordId}-${String(rollIndex + 1).padStart(2, "0")}`,
        inboundId: before.id,
        issueRecordId: roll.issueRecordId || issueRecord?.issueRecordId || "",
        rollId: roll.id,
        supplierRollNo: roll.supplierRollNo,
        materialType: before.materialType,
        productName: before.productName,
        spec: before.spec,
        factoryColor: before.factoryColor,
        consumedWeightKg,
        consumedQuantity,
        consumedFromWeightKg: machineSideWeightKg,
        remainingMachineSideWeightKg,
        partialConsumption: isPartialWeightConsumption,
        unit: before.unit || (consumedWeightKg > 0 ? "kg" : "件"),
        machineId: cleanText(input.body?.machineId) || roll.machineId || issueRecord?.machineId || "机边待分配",
        productionTaskId: cleanText(input.body?.productionTaskId) || roll.productionTaskId || issueRecord?.productionTaskId || "",
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
          remainingMachineSideWeightKg: record.remainingMachineSideWeightKg,
        };
      }
      return {
        ...roll,
        inventoryStatus: "已消耗",
        location: "已消耗归档",
        consumptionStatus: "已确认消耗",
        consumptionRecordId: record.consumptionRecordId,
        consumedAt: now,
        consumedBy: operatorName,
        consumedByUserId: operatorId,
      };
    });
    const nextIssueRecords = existingIssueRecords.map((record) =>
      consumedRollIds.has(record.rollId)
        ? (() => {
            const consumptionRecord = consumptionRecords.find((item) => item.rollId === record.rollId);
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
  if (action === "return_leftover") {
    const rollId = cleanText(input.body?.rollId);
    const machineSideRolls = (before.rolls ?? []).filter((roll) => roll.inventoryStatus === "机边领用");
    const targetMachineSideRolls = rollId ? machineSideRolls.filter((roll) => roll.id === rollId) : machineSideRolls;
    if (rollId && !(before.rolls ?? []).some((roll) => roll.id === rollId)) {
      throw Object.assign(new Error(`Raw material roll not found: ${rollId}`), { statusCode: 404 });
    }
    if (!targetMachineSideRolls.length) {
      throw Object.assign(new Error("Only machine-side raw-material rolls/pieces can be returned as leftovers"), {
        statusCode: 409,
        code: "RAW_MATERIAL_LEFTOVER_RETURN_REQUIRES_MACHINE_SIDE_ROLL",
      });
    }
    if (targetMachineSideRolls.length > 1 && (Number.isFinite(Number(input.body?.leftoverWeightKg)) || Number.isFinite(Number(input.body?.leftoverQuantity)))) {
      throw Object.assign(new Error("Measured raw-material leftover return requires a single rollId in V1"), {
        statusCode: 422,
        code: "RAW_MATERIAL_LEFTOVER_MEASURE_REQUIRES_ROLL",
      });
    }
    const existingIssueRecords = normalizeRawMaterialIssueRecords(before.rawMaterialIssueRecords);
    const returnRecordId = `RMI-RET-${now.slice(0, 10).replaceAll("-", "")}-${Date.now().toString(36).toUpperCase()}`;
    const returnedRollIds = new Set(targetMachineSideRolls.map((roll) => roll.id));
    const returnLocation = cleanText(input.body?.returnLocation) || "余料区";
    const returnRecords = targetMachineSideRolls.map((roll, rollIndex) => {
      const issueRecord = existingIssueRecords.find((record) => record.rollId === roll.id);
      const issuedWeightKg = Number(issueRecord?.issuedWeightKg) || Number(roll.weightKg) || 0;
      const machineSideWeightKg =
        Number(roll.weightKg) ||
        Number(issueRecord?.remainingMachineSideWeightKg) ||
        Number(issueRecord?.remainingWeightKg) ||
        issuedWeightKg;
      const requestedLeftoverWeightKg = Number(input.body?.leftoverWeightKg);
      const requestedLeftoverQuantity = Number(input.body?.leftoverQuantity);
      const leftoverWeightKg = machineSideWeightKg > 0
        ? (Number.isFinite(requestedLeftoverWeightKg) && requestedLeftoverWeightKg > 0 ? Math.min(requestedLeftoverWeightKg, machineSideWeightKg) : machineSideWeightKg)
        : 0;
      const leftoverQuantity = machineSideWeightKg > 0
        ? 0
        : (Number.isFinite(requestedLeftoverQuantity) && requestedLeftoverQuantity > 0 ? requestedLeftoverQuantity : 1);
      return {
        leftoverReturnRecordId: `${returnRecordId}-${String(rollIndex + 1).padStart(2, "0")}`,
        inboundId: before.id,
        issueRecordId: roll.issueRecordId || issueRecord?.issueRecordId || "",
        rollId: roll.id,
        supplierRollNo: roll.supplierRollNo,
        materialType: before.materialType,
        productName: before.productName,
        spec: before.spec,
        factoryColor: before.factoryColor,
        issuedWeightKg,
        machineSideWeightKg,
        leftoverWeightKg,
        leftoverQuantity,
        unit: before.unit || (issuedWeightKg > 0 ? "kg" : "件"),
        machineId: cleanText(input.body?.machineId) || roll.machineId || issueRecord?.machineId || "机边待分配",
        productionTaskId: cleanText(input.body?.productionTaskId) || roll.productionTaskId || issueRecord?.productionTaskId || "",
        returnLocation,
        returnReason: cleanText(input.body?.reason) || "机边余料退回",
        consumptionStatus: "已退回余料/待复核",
        returnedBy: operatorName,
        returnedByUserId: operatorId,
        returnedAt: now,
        note: cleanText(input.body?.note) || "V1 余料退回先进入待复核，不自动变可用库存，不做成本分摊。",
      };
    });
    const nextRolls = (before.rolls ?? []).map((roll) => {
      if (!returnedRollIds.has(roll.id)) return roll;
      const record = returnRecords.find((item) => item.rollId === roll.id);
      return {
        ...roll,
        inventoryStatus: "余料待复核",
        location: returnLocation,
        consumptionStatus: "已退回余料/待复核",
        leftoverReturnRecordId: record.leftoverReturnRecordId,
        leftoverWeightKg: record.leftoverWeightKg,
        leftoverQuantity: record.leftoverQuantity,
        returnedAt: now,
        returnedBy: operatorName,
        returnedByUserId: operatorId,
      };
    });
    const nextIssueRecords = existingIssueRecords.map((record) =>
      returnedRollIds.has(record.rollId)
        ? {
            ...record,
            consumptionStatus: "已退回余料/待复核",
            leftoverReturnRecordId: returnRecords.find((item) => item.rollId === record.rollId)?.leftoverReturnRecordId || "",
            returnedAt: now,
            returnedBy: operatorName,
            returnedByUserId: operatorId,
          }
        : record,
    );
    const machineSideCount = nextRolls.filter((roll) => roll.inventoryStatus === "机边领用").length;
    const nextStatus = machineSideCount ? "部分余料退回" : "余料待复核";
    after = {
      ...before,
      status: nextStatus,
      issueStatus: nextStatus,
      consumptionStatus: nextStatus,
      leftoverReturnedBy: operatorName,
      leftoverReturnedByUserId: operatorId,
      leftoverReturnedAt: now,
      nextStep: "余料已退回待复核；需重新称重 / 贴标确认后，后续版本才能再次转可用或参与成本分摊。",
      rawMaterialIssueRecords: nextIssueRecords,
      rawMaterialLeftoverReturnRecords: [
        ...normalizeRawMaterialLeftoverReturnRecords(before.rawMaterialLeftoverReturnRecords),
        ...returnRecords,
      ],
      rolls: nextRolls,
    };
  }
  if (action === "review_leftover") {
    const rollId = cleanText(input.body?.rollId);
    const pendingLeftoverRolls = (before.rolls ?? []).filter((roll) => roll.inventoryStatus === "余料待复核");
    const targetLeftoverRolls = rollId ? pendingLeftoverRolls.filter((roll) => roll.id === rollId) : pendingLeftoverRolls;
    if (rollId && !(before.rolls ?? []).some((roll) => roll.id === rollId)) {
      throw Object.assign(new Error(`Raw material roll not found: ${rollId}`), { statusCode: 404 });
    }
    if (!targetLeftoverRolls.length) {
      throw Object.assign(new Error("Only pending leftover raw-material rolls/pieces can be reviewed back to available inventory"), {
        statusCode: 409,
        code: "RAW_MATERIAL_LEFTOVER_REVIEW_REQUIRES_PENDING_LEFTOVER",
      });
    }
    const requestedReviewedWeightKg = Number(input.body?.reviewedWeightKg ?? input.body?.leftoverWeightKg ?? input.body?.weightKg);
    const requestedReviewedQuantity = Number(input.body?.reviewedQuantity ?? input.body?.leftoverQuantity ?? input.body?.quantity);
    if (targetLeftoverRolls.length > 1 && (Number.isFinite(requestedReviewedWeightKg) || Number.isFinite(requestedReviewedQuantity))) {
      throw Object.assign(new Error("Measured raw-material leftover review requires a single rollId in V1"), {
        statusCode: 422,
        code: "RAW_MATERIAL_LEFTOVER_REVIEW_MEASURE_REQUIRES_ROLL",
      });
    }
    const existingIssueRecords = normalizeRawMaterialIssueRecords(before.rawMaterialIssueRecords);
    const existingReturnRecords = normalizeRawMaterialLeftoverReturnRecords(before.rawMaterialLeftoverReturnRecords);
    const reviewRecordId = `RMI-LREV-${now.slice(0, 10).replaceAll("-", "")}-${Date.now().toString(36).toUpperCase()}`;
    const reviewedRollIds = new Set(targetLeftoverRolls.map((roll) => roll.id));
    const reviewLocation = cleanText(input.body?.reviewLocation ?? input.body?.returnLocation) || "原料库-余料可用区";
    const reviewRecords = targetLeftoverRolls.map((roll, rollIndex) => {
      const issueRecord = existingIssueRecords.find((record) => record.rollId === roll.id);
      const returnRecord = existingReturnRecords.find((record) => record.rollId === roll.id && !record.leftoverReviewRecordId)
        ?? existingReturnRecords.find((record) => record.rollId === roll.id);
      const returnedWeightKg = Number(roll.leftoverWeightKg) || Number(returnRecord?.leftoverWeightKg) || 0;
      const returnedQuantity = Number(roll.leftoverQuantity) || Number(returnRecord?.leftoverQuantity) || (returnedWeightKg > 0 ? 0 : 1);
      const reviewedWeightKg = returnedWeightKg > 0
        ? (Number.isFinite(requestedReviewedWeightKg) && requestedReviewedWeightKg > 0 ? requestedReviewedWeightKg : returnedWeightKg)
        : 0;
      const reviewedQuantity = returnedWeightKg > 0
        ? 0
        : (Number.isFinite(requestedReviewedQuantity) && requestedReviewedQuantity > 0 ? requestedReviewedQuantity : returnedQuantity);
      if (returnedWeightKg > 0 && reviewedWeightKg - returnedWeightKg > 0.001) {
        throw Object.assign(new Error("Reviewed leftover weight cannot exceed returned leftover weight in V1"), {
          statusCode: 422,
          code: "RAW_MATERIAL_LEFTOVER_REVIEW_WEIGHT_EXCEEDS_RETURNED",
        });
      }
      if (returnedQuantity > 0 && reviewedQuantity > returnedQuantity) {
        throw Object.assign(new Error("Reviewed leftover quantity cannot exceed returned leftover quantity in V1"), {
          statusCode: 422,
          code: "RAW_MATERIAL_LEFTOVER_REVIEW_QUANTITY_EXCEEDS_RETURNED",
        });
      }
      return {
        leftoverReviewRecordId: `${reviewRecordId}-${String(rollIndex + 1).padStart(2, "0")}`,
        inboundId: before.id,
        leftoverReturnRecordId: roll.leftoverReturnRecordId || returnRecord?.leftoverReturnRecordId || "",
        issueRecordId: roll.issueRecordId || issueRecord?.issueRecordId || returnRecord?.issueRecordId || "",
        rollId: roll.id,
        supplierRollNo: roll.supplierRollNo,
        materialType: before.materialType,
        productName: before.productName,
        spec: before.spec,
        factoryColor: before.factoryColor,
        returnedWeightKg,
        returnedQuantity,
        reviewedWeightKg,
        reviewedQuantity,
        unit: before.unit || (returnedWeightKg > 0 ? "kg" : "件"),
        reviewLocation,
        reviewStatus: "复核通过/可用",
        reviewedBy: operatorName,
        reviewedByUserId: operatorId,
        reviewedAt: now,
        note: cleanText(input.body?.note) || "V1 余料复核只把已退回余料转回可用原材料库存，不做成本分摊或毛利计算。",
      };
    });
    const nextRolls = (before.rolls ?? []).map((roll) => {
      if (!reviewedRollIds.has(roll.id)) return roll;
      const record = reviewRecords.find((item) => item.rollId === roll.id);
      return {
        ...roll,
        weightKg: record.reviewedWeightKg > 0 ? record.reviewedWeightKg : roll.weightKg,
          labelStatus: "已贴标/可用库存",
        inventoryStatus: "可用",
        location: reviewLocation,
        signedNoteStatus: "余料复核已扫码/签单",
        consumptionStatus: "余料已复核/可用",
        leftoverReviewRecordId: record.leftoverReviewRecordId,
        leftoverReviewedWeightKg: record.reviewedWeightKg,
        leftoverReviewedQuantity: record.reviewedQuantity,
        leftoverReviewedAt: now,
        leftoverReviewedBy: operatorName,
        leftoverReviewedByUserId: operatorId,
      };
    });
    const nextIssueRecords = existingIssueRecords.map((record) =>
      reviewedRollIds.has(record.rollId)
        ? {
            ...record,
            consumptionStatus: "余料已复核/可用",
            leftoverReviewRecordId: reviewRecords.find((item) => item.rollId === record.rollId)?.leftoverReviewRecordId || "",
            leftoverReviewedAt: now,
            leftoverReviewedBy: operatorName,
            leftoverReviewedByUserId: operatorId,
          }
        : record,
    );
    const nextReturnRecords = existingReturnRecords.map((record) =>
      reviewedRollIds.has(record.rollId)
        ? {
            ...record,
            consumptionStatus: "余料已复核/可用",
            leftoverReviewRecordId: reviewRecords.find((item) => item.rollId === record.rollId)?.leftoverReviewRecordId || "",
            reviewStatus: "复核通过/可用",
            reviewedAt: now,
            reviewedBy: operatorName,
            reviewedByUserId: operatorId,
          }
        : record,
    );
    const availableCount = nextRolls.filter((roll) => roll.inventoryStatus === "可用").length;
    const consumedCount = nextRolls.filter((roll) => roll.inventoryStatus === "已消耗").length;
    const machineSideCount = nextRolls.filter((roll) => roll.inventoryStatus === "机边领用").length;
    const leftoverPendingCount = nextRolls.filter((roll) => roll.inventoryStatus === "余料待复核").length;
    const nextStatus = leftoverPendingCount
      ? "部分余料复核"
      : machineSideCount
        ? "部分领料/机边"
        : availableCount === nextRolls.length
          ? "余料已复核/可用"
          : availableCount + consumedCount === nextRolls.length
            ? "部分消耗确认"
            : "部分余料复核";
    after = {
      ...before,
      status: nextStatus,
      issueStatus: nextStatus,
      consumptionStatus: nextStatus,
      leftoverReviewedBy: operatorName,
      leftoverReviewedByUserId: operatorId,
      leftoverReviewedAt: now,
      nextStep: "余料复核通过，已回到可用原材料库存；成本分摊、损耗校准和毛利仍需独立流程。",
      rawMaterialIssueRecords: nextIssueRecords,
      rawMaterialLeftoverReturnRecords: nextReturnRecords,
      rawMaterialLeftoverReviewRecords: [
        ...normalizeRawMaterialLeftoverReviewRecords(before.rawMaterialLeftoverReviewRecords),
        ...reviewRecords,
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
  return `${safeSourceRollId}-S${Date.now().toString(36).toUpperCase()}`;
}

function roundWeight(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.round(number * 1000) / 1000;
}

function cleanText(value) {
  return String(value ?? "").trim();
}
