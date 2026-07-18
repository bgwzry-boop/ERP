import {
  applyRawMaterialCostMarginLocalAction,
  buildRawMaterialCostMarginToastText,
} from "./rawMaterialCostMarginLocalActions.js";
import { roundLocalRawMaterialWeight } from "./rawMaterialLocalActionMath.js";
import {
  applyRawMaterialOcrLineReviews,
  buildRawMaterialOcrReviewedRolls,
  validateRawMaterialOcrLineReviewSummary,
} from "../../shared/rawMaterialOcrLineReview.js";
import { applyLocalRawMaterialInboundLabelAction } from "./rawMaterialInboundLocalLabelActions.js";

export function buildRawMaterialInboundToastText(action, target, options = {}) {
  const reference = formatRawMaterialInboundReference(target);
  if (action === "复核送货单") {
    return `已复核 ${reference}，下一步打印一卷一标；OCR 仍只作为预填证据。`;
  }
  if (action === "打印卷标") {
    return `已打印 ${reference} 的卷标；打印只是待贴标状态，不能直接作为可用库存。`;
  }
  if (action === "作废卷标") {
    return options.rollId
      ? `已作废异常卷 ${options.rollId} 的旧标签；其他卷/件状态不变。`
      : "作废标签必须指定一卷/一件原材料。";
  }
  if (action === "重打卷标") {
    return options.rollId
      ? `已重打异常卷 ${options.rollId} 的标签；仍需逐卷人工核对。`
      : "重打标签必须指定一卷/一件原材料。";
  }
  if (action === "确认贴标入库") {
    return options.rollId
      ? `已记录 ${options.rollId} 的标签与实物人工核对结果。`
      : `贴标确认必须逐卷/逐件进行，不能批量将整单原材料变为可用。`;
  }
  if (action === "机边领料" || action === "扫码出库") {
    const machine = options.machineId || "机边待分配";
    if (!options.rollId || !options.machineId) {
      return "扫码出库必须选择一卷/一件已确认可用原料和领用机台。";
    }
    if (options.partialIssue) {
      return `已记录 ${options.rollId} 拆卷领料 ${options.issuedWeightKg}kg 到 ${machine}；剩余重量保留可用，仍不做成本分摊。`;
    }
    return `已记录 ${options.rollId} 整卷/整件机边领料到 ${machine}；等待生产报工确认消耗。`;
  }
  if (action === "确认消耗") {
    if (options.partialConsumption) {
      return `已确认 ${options.rollId} 部分消耗 ${options.consumedWeightKg}kg；剩余重量仍在机边，不生成成品或成本分摊。`;
    }
    return options.rollId
      ? `已确认 ${options.rollId} 整卷/整件原材料消耗；不按机台计数生成成品或成本分摊。`
      : `已确认 ${reference} 的机边原材料消耗；后续成本分摊和损耗校准仍需单独流程。`;
  }
  if (action === "余料退回") {
    const location = options.returnLocation || "余料区";
    return options.rollId
      ? `已记录 ${options.rollId} 余料退回到 ${location}，先进入待复核，不自动变可用库存。`
      : `已记录 ${reference} 机边余料退回到 ${location}，等待重新称重和复核。`;
  }
  if (action === "复核余料可用") {
    const location = options.reviewLocation || "原料库-余料可用区";
    return options.rollId
      ? `已复核 ${options.rollId} 余料并转回 ${location} 可用库存；成本分摊仍需单独流程。`
      : `已复核 ${reference} 的余料并转回可用库存；不自动生成成本或毛利。`;
  }
  const costMarginText = buildRawMaterialCostMarginToastText(action, reference, options);
  if (costMarginText) return costMarginText;
  if (action === "标记异常") {
    return `已把 ${reference} 标记为入库异常，需补照片、补重量或找供应商确认。`;
  }
  return `原材料入库单 ${reference} 已更新。`;
}

export function formatRawMaterialInboundReference(target = {}) {
  return target.deliveryNoteNo || `${target.id}（供应商未提供单号）`;
}

export function buildLocalRawMaterialSplitRollId(rolls = [], sourceRollId = "") {
  const existingIds = new Set((Array.isArray(rolls) ? rolls : []).map((roll) => String(roll.id ?? "").trim()));
  for (let index = 1; index < 100; index += 1) {
    const candidate = `${sourceRollId}-S${String(index).padStart(2, "0")}`;
    if (!existingIds.has(candidate)) return candidate;
  }
  return `${sourceRollId}-S${Date.now().toString(36).toUpperCase()}`;
}

export { roundLocalRawMaterialMoney, roundLocalRawMaterialWeight } from "./rawMaterialLocalActionMath.js";

export function applyRawMaterialInboundLocalAction(items, input = {}) {
  const { action, customers = [], inboundId, options = {}, now, operatorName, orderLines = [] } = input;
  let updatedItem = null;
  const nextItems = items.map((item) => {
    if (item.id !== inboundId) return item;
    if (action === "复核送货单") {
      if (item.ocrProvider === "tencent_cloud_table_v3") {
        const reviewValues = buildLocalOcrReviewValues(item, options.reviewFields);
        const reviewedLines = applyRawMaterialOcrLineReviews({
          lines: item.ocrLines,
          lineReviews: options.lineReviews,
          operatorName,
          now,
        });
        validateRawMaterialOcrLineReviewSummary({ lines: reviewedLines, reviewValues });
        updatedItem = {
          ...item,
          ...reviewValues,
          status: "已复核待打印标签",
          ocrStatus: `人工复核已通过，${reviewedLines.length} 行明细已确认`,
          ocrReviewFields: (item.ocrReviewFields ?? []).map((field) => {
            const value = Object.hasOwn(reviewValues, field.key) ? reviewValues[field.key] : field.value;
            return {
              ...field,
              value,
              reviewStatus: String(value) === String(field.recognizedValue ?? "") ? "人工接受" : "人工修改",
              reviewedBy: operatorName,
              reviewedAt: now,
            };
          }),
          ocrLines: reviewedLines,
          reviewedBy: operatorName,
          reviewedAt: now,
          nextStep: "打印系统卷标；标签贴到实物后仍需逐卷人工核对才算可用原料。",
          rolls: buildRawMaterialOcrReviewedRolls({
            inboundId: item.id,
            existingRolls: item.rolls,
            lines: reviewedLines,
          }),
        };
        return updatedItem;
      }
      updatedItem = {
        ...item,
        status: "已复核待打印标签",
        ocrStatus: "人工复核已通过",
        reviewedBy: operatorName,
        reviewedAt: now,
        nextStep: "打印系统卷标；标签贴到实物后仍需逐卷人工核对才算可用原料。",
        rolls: (item.rolls ?? []).map((roll) => ({
          ...roll,
          labelStatus: roll.inventoryStatus === "可用" ? roll.labelStatus : "待打印标签",
        })),
      };
      return updatedItem;
    }
    const labelActionItem = applyLocalRawMaterialInboundLabelAction(item, {
      action,
      now,
      operatorName,
      options,
    });
    if (labelActionItem) {
      updatedItem = labelActionItem;
      return updatedItem;
    }
    if (action === "机边领料" || action === "扫码出库") {
      const rollId = options.rollId ?? "";
      const machineId = options.machineId || "";
      const productionTaskId = options.productionTaskId || "";
      const issuePurpose = options.issuePurpose || "生产领料";
      if (!rollId || !machineId) return item;
      const targetRolls = (item.rolls ?? []).filter((roll) => roll.inventoryStatus === "可用" && roll.id === rollId);
      if (!targetRolls.length) return item;
      const issueRecordPrefix = `RMI-ISS-${now.slice(0, 10).replaceAll("-", "")}-${Date.now().toString(36).toUpperCase()}`;
      const splitRecordPrefix = `RMI-SPLIT-LOCAL-${Date.now().toString(36).toUpperCase()}`;
      const issuedSourceRollIds = new Set(targetRolls.map((roll) => roll.id));
      const splitRecords = [];
      const issueRecords = targetRolls.map((roll, index) => {
        const fullWeightKg = Number(roll.weightKg) || 0;
        const requestedWeightKg = Number(options.issuedWeightKg);
        const isPartialIssue = rollId === roll.id && fullWeightKg > 0 && requestedWeightKg > 0 && fullWeightKg - requestedWeightKg > 0.001;
        const issuedRollId = isPartialIssue ? buildLocalRawMaterialSplitRollId(item.rolls, roll.id) : roll.id;
        const issuedWeightKg = isPartialIssue ? roundLocalRawMaterialWeight(requestedWeightKg) : fullWeightKg;
        const remainingWeightKg = isPartialIssue ? roundLocalRawMaterialWeight(fullWeightKg - requestedWeightKg) : 0;
        const splitRecordId = isPartialIssue ? `${splitRecordPrefix}-${String(splitRecords.length + 1).padStart(2, "0")}` : "";
        if (isPartialIssue) {
          splitRecords.push({
            splitRecordId,
            inboundId: item.id,
            sourceRollId: roll.id,
            issuedRollId,
            supplierRollNo: roll.supplierRollNo,
            materialType: item.materialType,
            productName: item.productName,
            spec: item.spec,
            factoryColor: item.factoryColor,
            sourceWeightKg: fullWeightKg,
            issuedWeightKg,
            remainingWeightKg,
            unit: item.unit || "kg",
            splitMode: "部分领料/拆卷",
            machineId,
            productionTaskId,
            splitBy: operatorName,
            splitAt: now,
            note: options.note || "V1 记录拆卷领料和剩余可用重量；仍不做成本分摊或损耗校准。",
          });
        }
        return {
          issueRecordId: `${issueRecordPrefix}-${String(index + 1).padStart(2, "0")}`,
          inboundId: item.id,
          rollId: issuedRollId,
          sourceRollId: isPartialIssue ? roll.id : "",
          splitRecordId,
          supplierRollNo: roll.supplierRollNo,
          materialType: item.materialType,
          productName: item.productName,
          spec: item.spec,
          factoryColor: item.factoryColor,
          issuedWeightKg,
          issuedQuantity: fullWeightKg > 0 ? 0 : 1,
          sourceWeightKg: fullWeightKg,
          remainingWeightKg,
          unit: item.unit || (fullWeightKg > 0 ? "kg" : "件"),
          machineId,
          productionTaskId,
          issuePurpose,
          issueMode: isPartialIssue ? "部分领料/拆卷" : "整卷/整件领料",
          consumptionStatus: "待生产消耗确认",
          issuedBy: operatorName,
          issuedAt: now,
          note: options.note || (isPartialIssue
            ? "V1 记录拆卷机边领料，剩余重量保留可用；不生成成品数量或成本分摊。"
            : "V1 记录整卷/整件机边领料，不生成成品数量，不做成本分摊。"),
        };
      });
      const nextRolls = (item.rolls ?? []).flatMap((roll) => {
        if (!issuedSourceRollIds.has(roll.id)) return [roll];
        const splitRecord = splitRecords.find((entry) => entry.sourceRollId === roll.id);
        if (splitRecord) {
          const record = issueRecords.find((entry) => entry.rollId === splitRecord.issuedRollId);
          return [
            {
              ...roll,
              weightKg: splitRecord.remainingWeightKg,
              inventoryStatus: "可用",
              splitRecordId: splitRecord.splitRecordId,
              splitStatus: "已拆卷/部分领料",
              splitAt: now,
              splitBy: operatorName,
              originalWeightKg: splitRecord.sourceWeightKg,
              splitIssuedWeightKg: splitRecord.issuedWeightKg,
              splitRemainingWeightKg: splitRecord.remainingWeightKg,
            },
            {
              ...roll,
              id: splitRecord.issuedRollId,
              supplierRollNo: roll.supplierRollNo ? `${roll.supplierRollNo}/拆1` : `${roll.id}/拆1`,
              weightKg: splitRecord.issuedWeightKg,
              parentRollId: roll.id,
              sourceRollId: roll.id,
              splitRecordId: splitRecord.splitRecordId,
              splitStatus: "拆出机边领料",
              inventoryStatus: "机边领用",
              location: `机边-${machineId}`,
              issueRecordId: record?.issueRecordId || "",
              issuedAt: now,
              issuedBy: operatorName,
              machineId,
              productionTaskId,
              issuePurpose,
              consumptionStatus: "待生产消耗确认",
            },
          ];
        }
        const record = issueRecords.find((entry) => entry.rollId === roll.id);
        return [{
          ...roll,
          inventoryStatus: "机边领用",
          location: `机边-${machineId}`,
          issueRecordId: record?.issueRecordId || "",
          issuedAt: now,
          issuedBy: operatorName,
          machineId,
          productionTaskId,
          issuePurpose,
          consumptionStatus: "待生产消耗确认",
        }];
      });
      const issuedCount = nextRolls.filter((roll) => roll.inventoryStatus === "机边领用").length;
      const nextStatus = nextRolls.length > 0 && issuedCount === nextRolls.length ? "已领料/机边" : "部分领料/机边";
      updatedItem = {
        ...item,
        status: nextStatus,
        issueStatus: nextStatus,
        issuedBy: operatorName,
        issuedAt: now,
        machineId,
        productionTaskId,
        nextStep: productionTaskId
          ? "等待生产报工时确认原材料消耗；机台计数仍只作凭证，不直接生成成品或成本分摊。"
          : "已扫码出库并记录机台、颜色、规格、宽幅和重量；首发阶段暂不关联订单或生产任务。",
        rawMaterialIssueRecords: [...(item.rawMaterialIssueRecords ?? []), ...issueRecords],
        rawMaterialSplitRecords: [...(item.rawMaterialSplitRecords ?? []), ...splitRecords],
        rolls: nextRolls,
      };
      return updatedItem;
    }
    if (action === "确认消耗") {
      const rollId = options.rollId ?? "";
      const targetRolls = (item.rolls ?? []).filter((roll) => roll.inventoryStatus === "机边领用" && (!rollId || roll.id === rollId));
      if (!targetRolls.length) return item;
      const consumptionRecordPrefix = `RMI-CONS-LOCAL-${Date.now().toString(36).toUpperCase()}`;
      const consumedRollIds = new Set(targetRolls.map((roll) => roll.id));
      const consumptionRecords = targetRolls.map((roll, index) => {
        const issueRecord = (item.rawMaterialIssueRecords ?? []).find((record) => record.rollId === roll.id);
        const machineSideWeightKg = Number(roll.weightKg) || Number(issueRecord?.remainingWeightKg) || Number(issueRecord?.issuedWeightKg) || 0;
        const requestedWeightKg = Number(options.consumedWeightKg);
        const isPartialConsumption = machineSideWeightKg > 0 && requestedWeightKg > 0 && machineSideWeightKg - requestedWeightKg > 0.001;
        const consumedWeightKg = isPartialConsumption ? roundLocalRawMaterialWeight(requestedWeightKg) : machineSideWeightKg;
        const remainingMachineSideWeightKg = isPartialConsumption ? roundLocalRawMaterialWeight(machineSideWeightKg - requestedWeightKg) : 0;
        return {
          consumptionRecordId: `${consumptionRecordPrefix}-${String(index + 1).padStart(2, "0")}`,
          inboundId: item.id,
          issueRecordId: roll.issueRecordId || issueRecord?.issueRecordId || "",
          rollId: roll.id,
          supplierRollNo: roll.supplierRollNo,
          materialType: item.materialType,
          productName: item.productName,
          spec: item.spec,
          factoryColor: item.factoryColor,
          consumedWeightKg,
          consumedQuantity: consumedWeightKg > 0 ? 0 : 1,
          consumedFromWeightKg: machineSideWeightKg,
          remainingMachineSideWeightKg,
          partialConsumption: isPartialConsumption,
          unit: item.unit || (consumedWeightKg > 0 ? "kg" : "件"),
          machineId: options.machineId || roll.machineId || issueRecord?.machineId || "机边待分配",
          productionTaskId: options.productionTaskId || roll.productionTaskId || issueRecord?.productionTaskId || "",
          consumptionStatus: isPartialConsumption ? "部分消耗/机边" : "已确认消耗",
          confirmedBy: operatorName,
          confirmedAt: now,
          note: options.note || (isPartialConsumption
            ? "V1 记录机边部分消耗，剩余重量仍在机边；不生成成品数量，不做成本分摊。"
            : "V1 仅确认整卷/整件已消耗；不生成成品数量，不做成本分摊。"),
        };
      });
      const nextRolls = (item.rolls ?? []).map((roll) => {
        if (!consumedRollIds.has(roll.id)) return roll;
        const record = consumptionRecords.find((entry) => entry.rollId === roll.id);
        if (record?.partialConsumption) {
          return {
            ...roll,
            weightKg: record.remainingMachineSideWeightKg,
            inventoryStatus: "机边领用",
            consumptionStatus: "部分消耗/机边",
            consumptionRecordId: record?.consumptionRecordId || "",
            consumedAt: now,
            consumedBy: operatorName,
            lastConsumedWeightKg: record.consumedWeightKg,
            remainingMachineSideWeightKg: record.remainingMachineSideWeightKg,
          };
        }
        return {
          ...roll,
          inventoryStatus: "已消耗",
          location: "已消耗归档",
          consumptionStatus: "已确认消耗",
          consumptionRecordId: record?.consumptionRecordId || "",
          consumedAt: now,
          consumedBy: operatorName,
        };
      });
      const nextIssueRecords = (item.rawMaterialIssueRecords ?? []).map((record) =>
        consumedRollIds.has(record.rollId)
          ? (() => {
              const consumptionRecord = consumptionRecords.find((entry) => entry.rollId === record.rollId);
              return {
                ...record,
                consumptionStatus: consumptionRecord?.partialConsumption ? "部分消耗/机边" : "已确认消耗",
                consumptionRecordId: consumptionRecord?.consumptionRecordId || "",
                consumedWeightKg: roundLocalRawMaterialWeight(Number(record.consumedWeightKg || 0) + Number(consumptionRecord?.consumedWeightKg || 0)),
                remainingWeightKg: Number(consumptionRecord?.remainingMachineSideWeightKg) || 0,
                consumedAt: now,
              };
            })()
          : record,
      );
      const machineSideCount = nextRolls.filter((roll) => roll.inventoryStatus === "机边领用").length;
      const consumedCount = nextRolls.filter((roll) => roll.inventoryStatus === "已消耗").length;
      const nextStatus = machineSideCount ? "部分消耗确认" : consumedCount === nextRolls.length ? "已消耗确认" : "部分消耗确认";
      updatedItem = {
        ...item,
        status: nextStatus,
        issueStatus: nextStatus,
        consumptionStatus: nextStatus,
        consumedBy: operatorName,
        consumedAt: now,
        nextStep: "已形成原材料消耗留痕；后续成本分摊、损耗校准和毛利报表仍需独立流程。",
        rawMaterialIssueRecords: nextIssueRecords,
        rawMaterialConsumptionRecords: [...(item.rawMaterialConsumptionRecords ?? []), ...consumptionRecords],
        rolls: nextRolls,
      };
      return updatedItem;
    }
    if (action === "余料退回") {
      const rollId = options.rollId ?? "";
      const returnLocation = options.returnLocation || "余料区";
      const targetRolls = (item.rolls ?? []).filter((roll) => roll.inventoryStatus === "机边领用" && (!rollId || roll.id === rollId));
      if (!targetRolls.length) return item;
      const returnRecordPrefix = `RMI-RET-LOCAL-${Date.now().toString(36).toUpperCase()}`;
      const returnedRollIds = new Set(targetRolls.map((roll) => roll.id));
      const returnRecords = targetRolls.map((roll, index) => {
        const issueRecord = (item.rawMaterialIssueRecords ?? []).find((record) => record.rollId === roll.id);
        const issuedWeightKg = Number(issueRecord?.issuedWeightKg) || Number(roll.weightKg) || 0;
        const machineSideWeightKg = Number(roll.weightKg) || Number(issueRecord?.remainingWeightKg) || issuedWeightKg;
        return {
          leftoverReturnRecordId: `${returnRecordPrefix}-${String(index + 1).padStart(2, "0")}`,
          inboundId: item.id,
          issueRecordId: roll.issueRecordId || issueRecord?.issueRecordId || "",
          rollId: roll.id,
          supplierRollNo: roll.supplierRollNo,
          materialType: item.materialType,
          productName: item.productName,
          spec: item.spec,
          factoryColor: item.factoryColor,
          issuedWeightKg,
          machineSideWeightKg,
          leftoverWeightKg: machineSideWeightKg > 0 ? Math.min(Number(options.leftoverWeightKg || machineSideWeightKg), machineSideWeightKg) : 0,
          leftoverQuantity: machineSideWeightKg > 0 ? 0 : Number(options.leftoverQuantity || 1),
          unit: item.unit || (issuedWeightKg > 0 ? "kg" : "件"),
          machineId: options.machineId || roll.machineId || issueRecord?.machineId || "机边待分配",
          productionTaskId: options.productionTaskId || roll.productionTaskId || issueRecord?.productionTaskId || "",
          returnLocation,
          returnReason: options.reason || "机边余料退回",
          consumptionStatus: "已退回余料/待复核",
          returnedBy: operatorName,
          returnedAt: now,
          note: options.note || "V1 余料退回先进入待复核，不自动变可用库存，不做成本分摊。",
        };
      });
      const nextRolls = (item.rolls ?? []).map((roll) => {
        if (!returnedRollIds.has(roll.id)) return roll;
        const record = returnRecords.find((entry) => entry.rollId === roll.id);
        return {
          ...roll,
          inventoryStatus: "余料待复核",
          location: returnLocation,
          consumptionStatus: "已退回余料/待复核",
          leftoverReturnRecordId: record?.leftoverReturnRecordId || "",
          leftoverWeightKg: record?.leftoverWeightKg || 0,
          leftoverQuantity: record?.leftoverQuantity || 0,
          returnedAt: now,
          returnedBy: operatorName,
        };
      });
      const nextIssueRecords = (item.rawMaterialIssueRecords ?? []).map((record) =>
        returnedRollIds.has(record.rollId)
          ? {
              ...record,
              consumptionStatus: "已退回余料/待复核",
              leftoverReturnRecordId: returnRecords.find((entry) => entry.rollId === record.rollId)?.leftoverReturnRecordId || "",
              returnedAt: now,
            }
          : record,
      );
      const machineSideCount = nextRolls.filter((roll) => roll.inventoryStatus === "机边领用").length;
      const nextStatus = machineSideCount ? "部分余料退回" : "余料待复核";
      updatedItem = {
        ...item,
        status: nextStatus,
        issueStatus: nextStatus,
        consumptionStatus: nextStatus,
        leftoverReturnedBy: operatorName,
        leftoverReturnedAt: now,
        nextStep: "余料已退回待复核；需重新称重 / 贴标确认后，后续版本才能再次转可用或参与成本分摊。",
        rawMaterialIssueRecords: nextIssueRecords,
        rawMaterialLeftoverReturnRecords: [...(item.rawMaterialLeftoverReturnRecords ?? []), ...returnRecords],
        rolls: nextRolls,
      };
      return updatedItem;
    }
    if (action === "复核余料可用") {
      const rollId = options.rollId ?? "";
      const reviewLocation = options.reviewLocation || "原料库-余料可用区";
      const targetRolls = (item.rolls ?? []).filter((roll) => roll.inventoryStatus === "余料待复核" && (!rollId || roll.id === rollId));
      if (!targetRolls.length) return item;
      const reviewRecordPrefix = `RMI-LREV-LOCAL-${Date.now().toString(36).toUpperCase()}`;
      const reviewedRollIds = new Set(targetRolls.map((roll) => roll.id));
      const reviewRecords = targetRolls.map((roll, index) => {
        const returnRecord = (item.rawMaterialLeftoverReturnRecords ?? []).find((record) => record.rollId === roll.id && !record.leftoverReviewRecordId)
          || (item.rawMaterialLeftoverReturnRecords ?? []).find((record) => record.rollId === roll.id);
        const returnedWeightKg = Number(roll.leftoverWeightKg) || Number(returnRecord?.leftoverWeightKg) || 0;
        const returnedQuantity = Number(roll.leftoverQuantity) || Number(returnRecord?.leftoverQuantity) || (returnedWeightKg > 0 ? 0 : 1);
        const reviewedWeightKg = returnedWeightKg > 0 ? Number(options.reviewedWeightKg || returnedWeightKg) : 0;
        const reviewedQuantity = returnedWeightKg > 0 ? 0 : Number(options.reviewedQuantity || returnedQuantity || 1);
        return {
          leftoverReviewRecordId: `${reviewRecordPrefix}-${String(index + 1).padStart(2, "0")}`,
          inboundId: item.id,
          leftoverReturnRecordId: roll.leftoverReturnRecordId || returnRecord?.leftoverReturnRecordId || "",
          issueRecordId: roll.issueRecordId || returnRecord?.issueRecordId || "",
          rollId: roll.id,
          supplierRollNo: roll.supplierRollNo,
          materialType: item.materialType,
          productName: item.productName,
          spec: item.spec,
          factoryColor: item.factoryColor,
          returnedWeightKg,
          returnedQuantity,
          reviewedWeightKg,
          reviewedQuantity,
          unit: item.unit || (returnedWeightKg > 0 ? "kg" : "件"),
          reviewLocation,
          reviewStatus: "复核通过/可用",
          reviewedBy: operatorName,
          reviewedAt: now,
          note: options.note || "V1 余料复核只转回可用原材料库存，不做成本分摊或毛利计算。",
        };
      });
      const nextRolls = (item.rolls ?? []).map((roll) => {
        if (!reviewedRollIds.has(roll.id)) return roll;
        const record = reviewRecords.find((entry) => entry.rollId === roll.id);
        return {
          ...roll,
          weightKg: record?.reviewedWeightKg > 0 ? record.reviewedWeightKg : roll.weightKg,
          labelStatus: "已贴标/可用库存",
          inventoryStatus: "可用",
          location: reviewLocation,
          consumptionStatus: "余料已复核/可用",
          leftoverReviewRecordId: record?.leftoverReviewRecordId || "",
          leftoverReviewedWeightKg: record?.reviewedWeightKg || 0,
          leftoverReviewedQuantity: record?.reviewedQuantity || 0,
          leftoverReviewedAt: now,
          leftoverReviewedBy: operatorName,
        };
      });
      const nextIssueRecords = (item.rawMaterialIssueRecords ?? []).map((record) =>
        reviewedRollIds.has(record.rollId)
          ? {
              ...record,
              consumptionStatus: "余料已复核/可用",
              leftoverReviewRecordId: reviewRecords.find((entry) => entry.rollId === record.rollId)?.leftoverReviewRecordId || "",
              leftoverReviewedAt: now,
            }
          : record,
      );
      const nextReturnRecords = (item.rawMaterialLeftoverReturnRecords ?? []).map((record) =>
        reviewedRollIds.has(record.rollId)
          ? {
              ...record,
              consumptionStatus: "余料已复核/可用",
              leftoverReviewRecordId: reviewRecords.find((entry) => entry.rollId === record.rollId)?.leftoverReviewRecordId || "",
              reviewStatus: "复核通过/可用",
              reviewedAt: now,
              reviewedBy: operatorName,
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
      updatedItem = {
        ...item,
        status: nextStatus,
        issueStatus: nextStatus,
        consumptionStatus: nextStatus,
        leftoverReviewedBy: operatorName,
        leftoverReviewedAt: now,
        nextStep: "余料复核通过，已回到可用原材料库存；成本分摊、损耗校准和毛利仍需独立流程。",
        rawMaterialIssueRecords: nextIssueRecords,
        rawMaterialLeftoverReturnRecords: nextReturnRecords,
        rawMaterialLeftoverReviewRecords: [...(item.rawMaterialLeftoverReviewRecords ?? []), ...reviewRecords],
        rolls: nextRolls,
      };
      return updatedItem;
    }
    const costMarginItem = applyRawMaterialCostMarginLocalAction(item, {
      action,
      customers,
      options,
      now,
      operatorName,
      orderLines,
    });
    if (costMarginItem) {
      updatedItem = costMarginItem;
      return updatedItem;
    }
    if (action === "标记异常") {
      updatedItem = {
        ...item,
        status: "入库异常/待确认",
        exceptionBy: operatorName,
        exceptionAt: now,
        nextStep: "补照片 / 补重量 / 供应商确认后重新复核。",
        note: `${item.note || ""} 入库异常：${options.reason || "现场标记异常，待补充。"}`.trim(),
      };
      return updatedItem;
    }
    return item;
  });
  return { items: nextItems, updatedItem };
}

function buildLocalOcrReviewValues(item = {}, reviewFields = {}) {
  const numericKeys = new Set(["rollCount", "totalWeightKg", "unitPrice", "amount"]);
  const editableKeys = [
    "supplierName",
    "deliveryNoteNo",
    "materialType",
    "productName",
    "spec",
    "supplierColor",
    "factoryColor",
    "rollCount",
    "totalWeightKg",
    "unit",
    "unitPrice",
    "amount",
  ];
  return Object.fromEntries(editableKeys.map((key) => {
    const rawValue = Object.hasOwn(reviewFields ?? {}, key) ? reviewFields[key] : item[key];
    return [key, numericKeys.has(key) ? Number(rawValue) || 0 : String(rawValue ?? "").trim()];
  }));
}
