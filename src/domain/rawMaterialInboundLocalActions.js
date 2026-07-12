export function buildRawMaterialInboundToastText(action, target, options = {}) {
  const reference = formatRawMaterialInboundReference(target);
  if (action === "复核送货单") {
    return `已复核 ${reference}，下一步打印一卷一标；OCR 仍只作为预填证据。`;
  }
  if (action === "打印卷标") {
    return `已打印 ${reference} 的卷标；打印只是待贴标状态，不能直接作为可用库存。`;
  }
  if (action === "确认贴标入库") {
    return options.rollId
      ? `已确认 ${options.rollId} 贴标扫码并上传签单信息，可作为原材料可用库存。`
      : `已确认 ${reference} 全部贴标扫码，可作为原材料可用库存。`;
  }
  if (action === "机边领料") {
    const machine = options.machineId || "机边待分配";
    if (options.partialIssue) {
      return `已记录 ${options.rollId} 拆卷领料 ${options.issuedWeightKg}kg 到 ${machine}；剩余重量保留可用，仍不做成本分摊。`;
    }
    return options.rollId
      ? `已记录 ${options.rollId} 整卷/整件机边领料到 ${machine}；等待生产报工确认消耗。`
      : `已记录 ${reference} 可用卷/件机边领料到 ${machine}；不生成成品数量或成本分摊。`;
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
  if (action === "生成成本草稿") {
    return `已为 ${reference} 生成原材料成本分摊草稿；仍需成本/管理复核、损耗校准和毛利报表确认。`;
  }
  if (action === "确认成本草稿") {
    return `已确认 ${reference} 的原材料成本草稿为成本快照；仍需损耗校准和订单毛利报表确认。`;
  }
  if (action === "校准损耗") {
    const rate = Number(options.lossRatePercent);
    const rateText = Number.isFinite(rate) && rate > 0 ? `，损耗率 ${rate}%` : "";
    return `已校准 ${reference} 的原材料损耗${rateText}；仍需订单毛利报表确认。`;
  }
  if (action === "生成毛利快照") {
    return `已为 ${reference} 生成订单毛利快照；等待财务复核，不自动写客户对账或最终结算。`;
  }
  if (action === "复核毛利快照") {
    return `已复核 ${reference} 的订单毛利快照，并生成内部毛利报表；客户对账和收款结算仍走独立流程。`;
  }
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

export function roundLocalRawMaterialWeight(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.round(number * 1000) / 1000;
}

export function roundLocalRawMaterialMoney(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.round(number * 100) / 100;
}

export function applyRawMaterialInboundLocalAction(items, input = {}) {
  const { action, customers = [], inboundId, options = {}, now, operatorName, orderLines = [] } = input;
  let updatedItem = null;
  const nextItems = items.map((item) => {
    if (item.id !== inboundId) return item;
    if (action === "复核送货单") {
      updatedItem = {
        ...item,
        status: "已复核待打印标签",
        ocrStatus: "人工复核已通过",
        reviewedBy: operatorName,
        reviewedAt: now,
        nextStep: "打印系统卷标；标签打印后仍需贴标扫码才算可用原料。",
        rolls: (item.rolls ?? []).map((roll) => ({
          ...roll,
          labelStatus: roll.inventoryStatus === "可用" ? roll.labelStatus : "待打印标签",
        })),
      };
      return updatedItem;
    }
    if (action === "打印卷标") {
      updatedItem = {
        ...item,
        status: "已打印待贴标",
        labelPrintedBy: operatorName,
        labelPrintedAt: now,
        nextStep: "把标签贴到对应卷料，手机扫码并上传签单信息后再入库可用。",
        rolls: (item.rolls ?? []).map((roll) => ({
          ...roll,
          labelStatus: roll.inventoryStatus === "可用" ? roll.labelStatus : "已打印待贴标",
        })),
      };
      return updatedItem;
    }
    if (action === "确认贴标入库") {
      const rollId = options.rollId ?? "";
      const nextRolls = (item.rolls ?? []).map((roll) => {
        if (rollId && roll.id !== rollId) return roll;
        if (roll.inventoryStatus === "可用") return roll;
        return {
          ...roll,
          labelStatus: "已贴标入库/可用",
          inventoryStatus: "可用",
          signedNoteStatus: "已扫码/签单",
          scannedAt: now,
          scannedBy: operatorName,
          location: roll.location?.includes("待") ? "原料库-可用区" : roll.location,
        };
      });
      const availableCount = nextRolls.filter((roll) => roll.inventoryStatus === "可用").length;
      const nextStatus = availableCount === nextRolls.length ? "已贴标入库/可用" : "部分贴标";
      updatedItem = {
        ...item,
        status: nextStatus,
        signedNoteStatus: nextStatus === "已贴标入库/可用" ? "已扫码/签单" : "部分签单已上传",
        confirmedBy: operatorName,
        confirmedAt: now,
        nextStep: nextStatus === "已贴标入库/可用" ? "可领料；后续进入供应商月结对账。" : "继续贴标扫码剩余卷/件。",
        rolls: nextRolls,
      };
      return updatedItem;
    }
    if (action === "机边领料") {
      const rollId = options.rollId ?? "";
      const machineId = options.machineId || "BAG-01";
      const productionTaskId = options.productionTaskId || "";
      const issuePurpose = options.issuePurpose || "生产领料";
      const targetRolls = (item.rolls ?? []).filter((roll) => roll.inventoryStatus === "可用" && (!rollId || roll.id === rollId));
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
        nextStep: "等待生产报工时确认原材料消耗；机台计数仍只作凭证，不直接生成成品或成本分摊。",
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
          labelStatus: "已贴标入库/可用",
          inventoryStatus: "可用",
          location: reviewLocation,
          signedNoteStatus: "余料复核已扫码/签单",
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
    if (action === "生成成本草稿") {
      const unitPrice = Number(item.unitPrice || 0);
      const existingDrafts = item.rawMaterialCostAllocationDrafts ?? [];
      const existingConsumptionIds = new Set(existingDrafts.map((record) => record.consumptionRecordId).filter(Boolean));
      const draftPrefix = `RMCA-LOCAL-${Date.now().toString(36).toUpperCase()}`;
      const warnings = [];
      let localDraftIndex = existingDrafts.length;
      const drafts = (item.rawMaterialConsumptionRecords ?? []).flatMap((record) => {
        if (existingConsumptionIds.has(record.consumptionRecordId)) return [];
        const issueRecord = (item.rawMaterialIssueRecords ?? []).find((issue) => issue.issueRecordId === record.issueRecordId)
          || (item.rawMaterialIssueRecords ?? []).find((issue) => issue.rollId === record.rollId);
        if (!issueRecord || issueRecord.productionTaskMatchStatus !== "已匹配" || !issueRecord.productionTaskId || !unitPrice) {
          warnings.push(`${record.consumptionRecordId || "消耗记录"}：未匹配生产任务或缺少单价，未生成成本草稿`);
          return [];
        }
        const allocatedWeightKg = roundLocalRawMaterialWeight(record.consumedWeightKg || 0);
        const allocatedQuantity = allocatedWeightKg > 0 ? 0 : Number(record.consumedQuantity || 0) || 1;
        const unit = record.unit || item.unit || (allocatedWeightKg > 0 ? "kg" : "件");
        const amount = roundLocalRawMaterialMoney((allocatedWeightKg > 0 ? allocatedWeightKg : allocatedQuantity) * unitPrice);
        localDraftIndex += 1;
        return [{
          costAllocationDraftId: `${draftPrefix}-${String(localDraftIndex).padStart(2, "0")}`,
          inboundId: item.id,
          consumptionRecordId: record.consumptionRecordId,
          issueRecordId: issueRecord.issueRecordId,
          rollId: record.rollId,
          sourceRollId: issueRecord.sourceRollId || "",
          splitRecordId: issueRecord.splitRecordId || "",
          supplierName: item.supplierName,
          deliveryNoteNo: item.deliveryNoteNo,
          materialType: item.materialType,
          productName: item.productName,
          spec: item.spec,
          factoryColor: item.factoryColor,
          unit,
          unitPrice,
          allocatedWeightKg,
          allocatedQuantity,
          allocatedCostAmount: amount,
          productionTaskId: issueRecord.productionTaskId,
          orderLineId: issueRecord.productionTaskOrderLineId || "",
          productionTaskMachineId: issueRecord.productionTaskMachineId || issueRecord.machineId || "",
          productionTaskGoodsSpec: issueRecord.productionTaskGoodsSpec || "",
          allocationBasis: allocatedWeightKg > 0 ? `${allocatedWeightKg}kg * ${unitPrice}元/kg` : `${allocatedQuantity}${unit} * ${unitPrice}元/${unit}`,
          allocationStatus: "草稿/待成本复核",
          costEffect: "draft_only",
          marginEffect: "none",
          lossCalibrationStatus: "待损耗校准",
          generatedBy: operatorName,
          generatedAt: now,
          note: options.note || "V1 原材料成本分摊草稿；不直接确认订单毛利，需成本/管理复核。",
        }];
      });
      if (!drafts.length) return item;
      const nextIssueRecords = (item.rawMaterialIssueRecords ?? []).map((record) => {
        const draft = drafts.find((entry) => entry.issueRecordId === record.issueRecordId);
        return draft
          ? {
              ...record,
              costAllocationStatus: "成本草稿待复核",
              costAllocationDraftId: draft.costAllocationDraftId,
              allocatedCostAmount: draft.allocatedCostAmount,
              allocatedWeightKg: draft.allocatedWeightKg,
              allocatedQuantity: draft.allocatedQuantity,
            }
          : record;
      });
      const nextConsumptionRecords = (item.rawMaterialConsumptionRecords ?? []).map((record) => {
        const draft = drafts.find((entry) => entry.consumptionRecordId === record.consumptionRecordId);
        return draft
          ? {
              ...record,
              costAllocationStatus: "成本草稿待复核",
              costAllocationDraftId: draft.costAllocationDraftId,
              allocatedCostAmount: draft.allocatedCostAmount,
              allocatedWeightKg: draft.allocatedWeightKg,
              allocatedQuantity: draft.allocatedQuantity,
            }
          : record;
      });
      const nextDrafts = [...existingDrafts, ...drafts];
      updatedItem = {
        ...item,
        costAllocationStatus: "成本草稿待复核",
        costAllocationDraftedBy: operatorName,
        costAllocationDraftedAt: now,
        costAllocationDraftCount: nextDrafts.length,
        costAllocationDraftAmount: roundLocalRawMaterialMoney(nextDrafts.reduce((sum, record) => sum + Number(record.allocatedCostAmount || 0), 0)),
        costAllocationReviewStatus: "待成本复核",
        nextStep: "已生成原材料成本分摊草稿；仍需成本/管理复核、损耗校准和订单毛利报表确认。",
        rawMaterialIssueRecords: nextIssueRecords,
        rawMaterialConsumptionRecords: nextConsumptionRecords,
        rawMaterialCostAllocationDrafts: nextDrafts,
        rawMaterialCostAllocationWarnings: warnings,
      };
      return updatedItem;
    }
    if (action === "确认成本草稿") {
      const existingDrafts = item.rawMaterialCostAllocationDrafts ?? [];
      const confirmableDrafts = existingDrafts.filter((record) => !record.costConfirmationId && record.allocationStatus !== "已复核/待损耗校准");
      if (!confirmableDrafts.length) return item;
      const confirmation = {
        costConfirmationId: `RMCC-LOCAL-${Date.now().toString(36).toUpperCase()}`,
        inboundId: item.id,
        supplierName: item.supplierName,
        deliveryNoteNo: item.deliveryNoteNo,
        costAllocationDraftIds: confirmableDrafts.map((record) => record.costAllocationDraftId).filter(Boolean),
        consumptionRecordIds: confirmableDrafts.map((record) => record.consumptionRecordId).filter(Boolean),
        issueRecordIds: confirmableDrafts.map((record) => record.issueRecordId).filter(Boolean),
        productionTaskIds: [...new Set(confirmableDrafts.map((record) => record.productionTaskId).filter(Boolean))],
        orderLineIds: [...new Set(confirmableDrafts.map((record) => record.orderLineId).filter(Boolean))],
        confirmedCount: confirmableDrafts.length,
        confirmedWeightKg: roundLocalRawMaterialWeight(confirmableDrafts.reduce((sum, record) => sum + Number(record.allocatedWeightKg || 0), 0)),
        confirmedQuantity: confirmableDrafts.reduce((sum, record) => sum + Number(record.allocatedQuantity || 0), 0),
        confirmedCostAmount: roundLocalRawMaterialMoney(confirmableDrafts.reduce((sum, record) => sum + Number(record.allocatedCostAmount || 0), 0)),
        reviewStatus: "已复核/待损耗校准",
        costEffect: "confirmed_material_cost_snapshot",
        marginEffect: "none",
        lossCalibrationStatus: "待损耗校准",
        confirmedBy: operatorName,
        confirmedAt: now,
        note: options.note || "V1 成本草稿复核确认；只形成原材料成本快照，不自动更新订单毛利。",
      };
      const confirmedDraftIds = new Set(confirmation.costAllocationDraftIds);
      const confirmedIssueRecordIds = new Set(confirmation.issueRecordIds);
      const confirmedConsumptionRecordIds = new Set(confirmation.consumptionRecordIds);
      const nextDrafts = existingDrafts.map((record) =>
        confirmedDraftIds.has(record.costAllocationDraftId)
          ? {
              ...record,
              allocationStatus: "已复核/待损耗校准",
              costEffect: "confirmed_material_cost_snapshot",
              marginEffect: "none",
              lossCalibrationStatus: "待损耗校准",
              confirmedCostAmount: record.allocatedCostAmount,
              confirmedBy: operatorName,
              confirmedAt: now,
              costConfirmationId: confirmation.costConfirmationId,
              reviewNote: options.note || "V1 成本草稿复核确认；损耗校准和毛利报表仍需独立流程。",
            }
          : record,
      );
      const nextIssueRecords = (item.rawMaterialIssueRecords ?? []).map((record) =>
        confirmedIssueRecordIds.has(record.issueRecordId)
          ? {
              ...record,
              costAllocationStatus: "成本已复核待损耗校准",
              costConfirmationId: confirmation.costConfirmationId,
              confirmedCostAmount: Number(record.allocatedCostAmount) || 0,
              costConfirmedAt: now,
              costConfirmedBy: operatorName,
            }
          : record,
      );
      const nextConsumptionRecords = (item.rawMaterialConsumptionRecords ?? []).map((record) =>
        confirmedConsumptionRecordIds.has(record.consumptionRecordId)
          ? {
              ...record,
              costAllocationStatus: "成本已复核待损耗校准",
              costConfirmationId: confirmation.costConfirmationId,
              confirmedCostAmount: Number(record.allocatedCostAmount) || 0,
              costConfirmedAt: now,
              costConfirmedBy: operatorName,
            }
          : record,
      );
      const allConfirmedDrafts = nextDrafts.filter((record) => record.allocationStatus === "已复核/待损耗校准");
      updatedItem = {
        ...item,
        costAllocationStatus: "成本已复核待损耗校准",
        costAllocationReviewStatus: "已复核/待损耗校准",
        costAllocationConfirmedBy: operatorName,
        costAllocationConfirmedAt: now,
        costAllocationConfirmedCount: allConfirmedDrafts.length,
        costAllocationConfirmedAmount: roundLocalRawMaterialMoney(
          allConfirmedDrafts.reduce((sum, record) => sum + Number(record.confirmedCostAmount || record.allocatedCostAmount || 0), 0),
        ),
        costAllocationConfirmationId: confirmation.costConfirmationId,
        nextStep: "成本草稿已复核为原材料成本快照；仍需损耗校准和订单毛利报表确认。",
        rawMaterialIssueRecords: nextIssueRecords,
        rawMaterialConsumptionRecords: nextConsumptionRecords,
        rawMaterialCostAllocationDrafts: nextDrafts,
        rawMaterialCostAllocationConfirmations: [...(item.rawMaterialCostAllocationConfirmations ?? []), confirmation],
      };
      return updatedItem;
    }
    if (action === "校准损耗") {
      const existingConfirmations = item.rawMaterialCostAllocationConfirmations ?? [];
      if (!existingConfirmations.length) return item;
      const existingCalibrations = item.rawMaterialCostLossCalibrations ?? [];
      const calibratedConfirmationIds = new Set(
        existingCalibrations
          .flatMap((record) => [record.costConfirmationId, ...(record.costConfirmationIds ?? [])])
          .filter(Boolean),
      );
      const calibratableConfirmations = existingConfirmations.filter(
        (record) => !calibratedConfirmationIds.has(record.costConfirmationId) && record.lossCalibrationStatus !== "已校准/待毛利确认",
      );
      if (!calibratableConfirmations.length) return item;
      const relatedDraftIds = new Set(calibratableConfirmations.flatMap((record) => record.costAllocationDraftIds ?? []).filter(Boolean));
      const relatedDrafts = (item.rawMaterialCostAllocationDrafts ?? []).filter((record) => relatedDraftIds.has(record.costAllocationDraftId));
      const expectedOutputQuantity = Number(options.expectedOutputQuantity ?? options.plannedOutputQuantity ?? options.estimatedOutputQuantity ?? 0) || 0;
      const actualQualifiedOutputQuantity =
        Number(options.actualQualifiedOutputQuantity ?? options.actualOutputQuantity ?? options.qualifiedOutputQuantity ?? 0) || 0;
      const explicitLossQuantity = Number(options.lossQuantity ?? options.lossOutputQuantity ?? 0) || 0;
      const lossQuantity = explicitLossQuantity > 0
        ? explicitLossQuantity
        : expectedOutputQuantity > 0
          ? Math.max(0, expectedOutputQuantity - actualQualifiedOutputQuantity)
          : 0;
      const lossRatePercent = expectedOutputQuantity > 0 ? Math.round((lossQuantity / expectedOutputQuantity) * 10000) / 100 : 0;
      const confirmedCostAmount = roundLocalRawMaterialMoney(
        calibratableConfirmations.reduce((sum, record) => sum + Number(record.confirmedCostAmount || 0), 0)
          || relatedDrafts.reduce((sum, record) => sum + Number(record.confirmedCostAmount || record.allocatedCostAmount || 0), 0),
      );
      const calibration = {
        lossCalibrationId: `RMCL-LOCAL-${Date.now().toString(36).toUpperCase()}`,
        inboundId: item.id,
        supplierName: item.supplierName,
        deliveryNoteNo: item.deliveryNoteNo,
        costConfirmationId: calibratableConfirmations[0]?.costConfirmationId || "",
        costConfirmationIds: calibratableConfirmations.map((record) => record.costConfirmationId).filter(Boolean),
        costAllocationDraftIds: [...relatedDraftIds],
        consumptionRecordIds: calibratableConfirmations.flatMap((record) => record.consumptionRecordIds ?? []).filter(Boolean),
        issueRecordIds: calibratableConfirmations.flatMap((record) => record.issueRecordIds ?? []).filter(Boolean),
        productionTaskIds: [...new Set(calibratableConfirmations.flatMap((record) => record.productionTaskIds ?? []).filter(Boolean))],
        orderLineIds: [...new Set(calibratableConfirmations.flatMap((record) => record.orderLineIds ?? []).filter(Boolean))],
        confirmedCount: calibratableConfirmations.reduce((sum, record) => sum + Number(record.confirmedCount || 0), 0),
        confirmedWeightKg: roundLocalRawMaterialWeight(calibratableConfirmations.reduce((sum, record) => sum + Number(record.confirmedWeightKg || 0), 0)),
        confirmedQuantity: calibratableConfirmations.reduce((sum, record) => sum + Number(record.confirmedQuantity || 0), 0),
        confirmedCostAmount,
        expectedOutputQuantity,
        actualQualifiedOutputQuantity,
        lossQuantity,
        lossRatePercent,
        calibrationBasis: expectedOutputQuantity > 0
          ? `${actualQualifiedOutputQuantity}/${expectedOutputQuantity} 合格产量，损耗 ${lossQuantity}，损耗率 ${lossRatePercent}%`
          : "V1 手工损耗校准；现场尚未提供预计合格产量，先记录成本快照待毛利确认。",
        calibrationStatus: "已校准/待毛利确认",
        costEffect: "loss_calibrated_material_cost_snapshot",
        marginEffect: "pending_margin_snapshot",
        calibratedBy: operatorName,
        calibratedAt: now,
        note: options.note || "V1 损耗校准第一版；只形成待毛利确认的成本校准快照。",
      };
      const calibratedConfirmationIdSet = new Set(calibration.costConfirmationIds);
      const calibratedDraftIdSet = new Set(calibration.costAllocationDraftIds);
      const calibratedIssueRecordIds = new Set(calibration.issueRecordIds);
      const calibratedConsumptionRecordIds = new Set(calibration.consumptionRecordIds);
      const nextDrafts = (item.rawMaterialCostAllocationDrafts ?? []).map((record) =>
        calibratedDraftIdSet.has(record.costAllocationDraftId)
          ? {
              ...record,
              allocationStatus: "已校准/待毛利确认",
              costEffect: "loss_calibrated_material_cost_snapshot",
              marginEffect: "pending_margin_snapshot",
              lossCalibrationStatus: "已校准/待毛利确认",
              lossCalibrationId: calibration.lossCalibrationId,
              lossRatePercent,
              calibratedCostAmount: record.confirmedCostAmount || record.allocatedCostAmount,
              calibratedBy: operatorName,
              calibratedAt: now,
            }
          : record,
      );
      const nextConfirmations = existingConfirmations.map((record) =>
        calibratedConfirmationIdSet.has(record.costConfirmationId)
          ? {
              ...record,
              reviewStatus: "已校准/待毛利确认",
              costEffect: "loss_calibrated_material_cost_snapshot",
              marginEffect: "pending_margin_snapshot",
              lossCalibrationStatus: "已校准/待毛利确认",
              lossCalibrationId: calibration.lossCalibrationId,
              lossRatePercent,
              calibratedBy: operatorName,
              calibratedAt: now,
            }
          : record,
      );
      const nextIssueRecords = (item.rawMaterialIssueRecords ?? []).map((record) =>
        calibratedIssueRecordIds.has(record.issueRecordId)
          ? {
              ...record,
              costAllocationStatus: "损耗已校准待毛利确认",
              lossCalibrationId: calibration.lossCalibrationId,
              lossRatePercent,
              lossCalibratedAt: now,
              lossCalibratedBy: operatorName,
            }
          : record,
      );
      const nextConsumptionRecords = (item.rawMaterialConsumptionRecords ?? []).map((record) =>
        calibratedConsumptionRecordIds.has(record.consumptionRecordId)
          ? {
              ...record,
              costAllocationStatus: "损耗已校准待毛利确认",
              lossCalibrationId: calibration.lossCalibrationId,
              lossRatePercent,
              lossCalibratedAt: now,
              lossCalibratedBy: operatorName,
            }
          : record,
      );
      const nextCalibrations = [...existingCalibrations, calibration];
      updatedItem = {
        ...item,
        costAllocationStatus: "损耗已校准待毛利确认",
        costAllocationReviewStatus: "已校准/待毛利确认",
        lossCalibrationStatus: "已校准/待毛利确认",
        lossCalibratedBy: operatorName,
        lossCalibratedAt: now,
        lossCalibrationCount: nextCalibrations.length,
        lossCalibrationId: calibration.lossCalibrationId,
        lossCalibrationRatePercent: lossRatePercent,
        lossCalibrationActualOutputQuantity: actualQualifiedOutputQuantity,
        lossCalibrationExpectedOutputQuantity: expectedOutputQuantity,
        lossCalibrationAmount: confirmedCostAmount,
        nextStep: "损耗已校准为原材料成本校准快照；仍需订单毛利报表确认。",
        rawMaterialIssueRecords: nextIssueRecords,
        rawMaterialConsumptionRecords: nextConsumptionRecords,
        rawMaterialCostAllocationDrafts: nextDrafts,
        rawMaterialCostAllocationConfirmations: nextConfirmations,
        rawMaterialCostLossCalibrations: nextCalibrations,
      };
      return updatedItem;
    }
    if (action === "生成毛利快照") {
      const existingCalibrations = item.rawMaterialCostLossCalibrations ?? [];
      if (!existingCalibrations.length) return item;
      const existingSnapshots = item.rawMaterialOrderMarginSnapshots ?? [];
      const snapshottedCalibrationIds = new Set(
        existingSnapshots.flatMap((record) => record.lossCalibrationIds ?? []).filter(Boolean),
      );
      const eligibleCalibrations = existingCalibrations.filter(
        (record) => !snapshottedCalibrationIds.has(record.lossCalibrationId) && record.marginEffect !== "margin_snapshot_pending_review",
      );
      if (!eligibleCalibrations.length) return item;
      const relatedDraftIds = new Set(eligibleCalibrations.flatMap((record) => record.costAllocationDraftIds ?? []).filter(Boolean));
      const relatedDrafts = (item.rawMaterialCostAllocationDrafts ?? []).filter((record) => relatedDraftIds.has(record.costAllocationDraftId));
      const orderLineIds = [
        ...new Set([
          ...eligibleCalibrations.flatMap((record) => record.orderLineIds ?? []),
          ...relatedDrafts.map((record) => record.orderLineId),
        ].filter(Boolean)),
      ];
      if (!orderLineIds.length) return item;
      const totalCalibratedCostAmount = roundLocalRawMaterialMoney(
        eligibleCalibrations.reduce((sum, record) => sum + Number(record.confirmedCostAmount || 0), 0)
          || relatedDrafts.reduce((sum, record) => sum + Number(record.calibratedCostAmount || record.confirmedCostAmount || record.allocatedCostAmount || 0), 0),
      );
      const warnings = [];
      const lineItems = orderLineIds.map((orderLineId) => {
        const orderLine = orderLines.find((line) => line.id === orderLineId || line.orderLineId === orderLineId) ?? {};
        const customer = customers.find((record) => record.id === orderLine.customerId) ?? {};
        const lineDrafts = relatedDrafts.filter((record) => record.orderLineId === orderLineId);
        const materialCostAmount = roundLocalRawMaterialMoney(
          lineDrafts.reduce((sum, record) => sum + Number(record.calibratedCostAmount || record.confirmedCostAmount || record.allocatedCostAmount || 0), 0)
            || (orderLineIds.length ? totalCalibratedCostAmount / orderLineIds.length : totalCalibratedCostAmount),
        );
        const salesAmount = roundLocalRawMaterialMoney(Number(orderLine.amount || orderLine.finalAmount || orderLine.totalAmount || 0) || 0);
        const grossProfitAmount = salesAmount > 0 ? roundLocalRawMaterialMoney(salesAmount - materialCostAmount) : 0;
        const grossMarginRatePercent = salesAmount > 0 ? Math.round((grossProfitAmount / salesAmount) * 10000) / 100 : 0;
        if (!salesAmount) warnings.push(`${orderLineId}：缺少订单销售金额，毛利率待补订单收入后复核`);
        return {
          orderLineId,
          orderNo: orderLine.orderNo || "",
          customerId: orderLine.customerId || "",
          customerName: customer.name || orderLine.customerName || "",
          productName: orderLine.productName || orderLine.product || "",
          goodsSpec: [orderLine.productName || orderLine.product, orderLine.size, orderLine.color, orderLine.qty ? `${orderLine.qty}个` : ""].filter(Boolean).join(" "),
          quantity: Number(orderLine.qty || orderLine.quantity || 0) || 0,
          salesAmount,
          materialCostAmount,
          grossProfitAmount,
          grossMarginRatePercent,
          marginStatus: salesAmount > 0 ? "已生成/待财务复核" : "需补订单收入",
          costAllocationDraftIds: lineDrafts.map((record) => record.costAllocationDraftId).filter(Boolean),
          productionTaskIds: [...new Set(lineDrafts.map((record) => record.productionTaskId).filter(Boolean))],
        };
      });
      const totalSalesAmount = roundLocalRawMaterialMoney(lineItems.reduce((sum, record) => sum + Number(record.salesAmount || 0), 0));
      const totalMaterialCostAmount = roundLocalRawMaterialMoney(lineItems.reduce((sum, record) => sum + Number(record.materialCostAmount || 0), 0));
      const grossProfitAmount = totalSalesAmount > 0 ? roundLocalRawMaterialMoney(totalSalesAmount - totalMaterialCostAmount) : 0;
      const grossMarginRatePercent = totalSalesAmount > 0 ? Math.round((grossProfitAmount / totalSalesAmount) * 10000) / 100 : 0;
      const snapshot = {
        marginSnapshotId: `RMMG-LOCAL-${Date.now().toString(36).toUpperCase()}`,
        inboundId: item.id,
        supplierName: item.supplierName,
        deliveryNoteNo: item.deliveryNoteNo,
        lossCalibrationIds: eligibleCalibrations.map((record) => record.lossCalibrationId).filter(Boolean),
        costConfirmationIds: [...new Set(eligibleCalibrations.flatMap((record) => record.costConfirmationIds ?? []).filter(Boolean))],
        costAllocationDraftIds: [...relatedDraftIds],
        consumptionRecordIds: [...new Set(eligibleCalibrations.flatMap((record) => record.consumptionRecordIds ?? []).filter(Boolean))],
        issueRecordIds: [...new Set(eligibleCalibrations.flatMap((record) => record.issueRecordIds ?? []).filter(Boolean))],
        productionTaskIds: [...new Set(eligibleCalibrations.flatMap((record) => record.productionTaskIds ?? []).filter(Boolean))],
        orderLineIds,
        lineItems,
        totalSalesAmount,
        totalMaterialCostAmount,
        grossProfitAmount,
        grossMarginRatePercent,
        reviewStatus: "已生成/待财务复核",
        costEffect: "loss_calibrated_material_cost_snapshot",
        marginEffect: "margin_snapshot_pending_review",
        generatedBy: operatorName,
        generatedAt: now,
        note: options.note || "V1 订单毛利快照第一版；只供财务复核，不自动写客户对账或最终结算。",
        warnings,
      };
      const snapshotCalibrationIds = new Set(snapshot.lossCalibrationIds);
      const snapshotDraftIds = new Set(snapshot.costAllocationDraftIds);
      const snapshotConfirmationIds = new Set(snapshot.costConfirmationIds);
      const snapshotIssueRecordIds = new Set(snapshot.issueRecordIds);
      const snapshotConsumptionRecordIds = new Set(snapshot.consumptionRecordIds);
      const nextDrafts = (item.rawMaterialCostAllocationDrafts ?? []).map((record) =>
        snapshotDraftIds.has(record.costAllocationDraftId)
          ? {
              ...record,
              allocationStatus: "毛利快照待复核",
              marginEffect: "margin_snapshot_pending_review",
              marginSnapshotId: snapshot.marginSnapshotId,
              marginSnapshotStatus: "已生成/待财务复核",
              marginSnapshotGeneratedBy: operatorName,
              marginSnapshotGeneratedAt: now,
            }
          : record,
      );
      const nextConfirmations = (item.rawMaterialCostAllocationConfirmations ?? []).map((record) =>
        snapshotConfirmationIds.has(record.costConfirmationId)
          ? {
              ...record,
              reviewStatus: "毛利快照待复核",
              marginEffect: "margin_snapshot_pending_review",
              marginSnapshotId: snapshot.marginSnapshotId,
              marginSnapshotStatus: "已生成/待财务复核",
              marginSnapshotGeneratedBy: operatorName,
              marginSnapshotGeneratedAt: now,
            }
          : record,
      );
      const nextCalibrations = existingCalibrations.map((record) =>
        snapshotCalibrationIds.has(record.lossCalibrationId)
          ? {
              ...record,
              calibrationStatus: "已生成毛利快照/待复核",
              marginEffect: "margin_snapshot_pending_review",
              marginSnapshotId: snapshot.marginSnapshotId,
              marginSnapshotStatus: "已生成/待财务复核",
              marginSnapshotGeneratedBy: operatorName,
              marginSnapshotGeneratedAt: now,
            }
          : record,
      );
      const nextIssueRecords = (item.rawMaterialIssueRecords ?? []).map((record) =>
        snapshotIssueRecordIds.has(record.issueRecordId)
          ? {
              ...record,
              costAllocationStatus: "毛利快照待复核",
              marginSnapshotId: snapshot.marginSnapshotId,
              marginSnapshotGeneratedAt: now,
              marginSnapshotGeneratedBy: operatorName,
            }
          : record,
      );
      const nextConsumptionRecords = (item.rawMaterialConsumptionRecords ?? []).map((record) =>
        snapshotConsumptionRecordIds.has(record.consumptionRecordId)
          ? {
              ...record,
              costAllocationStatus: "毛利快照待复核",
              marginSnapshotId: snapshot.marginSnapshotId,
              marginSnapshotGeneratedAt: now,
              marginSnapshotGeneratedBy: operatorName,
            }
          : record,
      );
      const nextSnapshots = [...existingSnapshots, snapshot];
      updatedItem = {
        ...item,
        costAllocationStatus: "毛利快照待复核",
        costAllocationReviewStatus: "毛利快照待复核",
        marginSnapshotStatus: "已生成/待财务复核",
        marginSnapshotCount: nextSnapshots.length,
        marginSnapshotId: snapshot.marginSnapshotId,
        marginSnapshotTotalSalesAmount: totalSalesAmount,
        marginSnapshotMaterialCostAmount: totalMaterialCostAmount,
        marginSnapshotGrossProfitAmount: grossProfitAmount,
        marginSnapshotGrossMarginRatePercent: grossMarginRatePercent,
        marginSnapshotGeneratedBy: operatorName,
        marginSnapshotGeneratedAt: now,
        nextStep: "已生成订单毛利快照，等待财务复核；不自动写客户对账或最终财务结算。",
        rawMaterialIssueRecords: nextIssueRecords,
        rawMaterialConsumptionRecords: nextConsumptionRecords,
        rawMaterialCostAllocationDrafts: nextDrafts,
        rawMaterialCostAllocationConfirmations: nextConfirmations,
        rawMaterialCostLossCalibrations: nextCalibrations,
        rawMaterialOrderMarginSnapshots: nextSnapshots,
        rawMaterialCostAllocationWarnings: [...(item.rawMaterialCostAllocationWarnings ?? []), ...warnings],
      };
      return updatedItem;
    }
    if (action === "复核毛利快照") {
      const existingSnapshots = item.rawMaterialOrderMarginSnapshots ?? [];
      if (!existingSnapshots.length) return item;
      const existingReports = item.rawMaterialOrderMarginReports ?? [];
      const reportedSnapshotIds = new Set(existingReports.flatMap((record) => record.marginSnapshotIds ?? []).filter(Boolean));
      const reviewableSnapshots = existingSnapshots.filter(
        (record) =>
          !reportedSnapshotIds.has(record.marginSnapshotId) &&
          record.marginEffect !== "reviewed_margin_report_snapshot" &&
          record.reviewStatus !== "已财务复核/报表可用",
      );
      if (!reviewableSnapshots.length) return item;
      const missingRevenue = reviewableSnapshots.some(
        (record) =>
          (record.lineItems ?? []).some((line) => Number(line.salesAmount || 0) <= 0 || line.marginStatus === "需补订单收入") ||
          (record.warnings ?? []).some((warning) => String(warning).includes("缺少订单销售金额")),
      );
      if (missingRevenue) return item;
      const lineItems = reviewableSnapshots.flatMap((snapshot) =>
        (snapshot.lineItems ?? []).map((line) => ({
          ...line,
          marginSnapshotId: snapshot.marginSnapshotId,
          marginStatus: "已财务复核/报表可用",
        })),
      );
      const totalSalesAmount = roundLocalRawMaterialMoney(lineItems.reduce((sum, record) => sum + Number(record.salesAmount || 0), 0));
      const totalMaterialCostAmount = roundLocalRawMaterialMoney(lineItems.reduce((sum, record) => sum + Number(record.materialCostAmount || 0), 0));
      const grossProfitAmount = roundLocalRawMaterialMoney(totalSalesAmount - totalMaterialCostAmount);
      const grossMarginRatePercent = totalSalesAmount > 0 ? Math.round((grossProfitAmount / totalSalesAmount) * 10000) / 100 : 0;
      const report = {
        marginReportId: `RMMR-LOCAL-${Date.now().toString(36).toUpperCase()}`,
        inboundId: item.id,
        supplierName: item.supplierName,
        deliveryNoteNo: item.deliveryNoteNo,
        marginSnapshotIds: reviewableSnapshots.map((record) => record.marginSnapshotId).filter(Boolean),
        lossCalibrationIds: [...new Set(reviewableSnapshots.flatMap((record) => record.lossCalibrationIds ?? []).filter(Boolean))],
        costConfirmationIds: [...new Set(reviewableSnapshots.flatMap((record) => record.costConfirmationIds ?? []).filter(Boolean))],
        costAllocationDraftIds: [...new Set(reviewableSnapshots.flatMap((record) => record.costAllocationDraftIds ?? []).filter(Boolean))],
        consumptionRecordIds: [...new Set(reviewableSnapshots.flatMap((record) => record.consumptionRecordIds ?? []).filter(Boolean))],
        issueRecordIds: [...new Set(reviewableSnapshots.flatMap((record) => record.issueRecordIds ?? []).filter(Boolean))],
        productionTaskIds: [...new Set(reviewableSnapshots.flatMap((record) => record.productionTaskIds ?? []).filter(Boolean))],
        orderLineIds: [...new Set(reviewableSnapshots.flatMap((record) => record.orderLineIds ?? []).filter(Boolean))],
        lineItems,
        totalSalesAmount,
        totalMaterialCostAmount,
        grossProfitAmount,
        grossMarginRatePercent,
        reviewStatus: "已财务复核/报表可用",
        reportStatus: "已生成内部毛利报表",
        costEffect: "loss_calibrated_material_cost_snapshot",
        marginEffect: "reviewed_margin_report_snapshot",
        reviewedBy: operatorName,
        reviewedAt: now,
        note: options.note || "V1 毛利快照财务复核第一版；生成内部毛利报表，不自动写客户对账或收款结算。",
        warnings: [],
      };
      const reportSnapshotIds = new Set(report.marginSnapshotIds);
      const reportDraftIds = new Set(report.costAllocationDraftIds);
      const reportConfirmationIds = new Set(report.costConfirmationIds);
      const reportCalibrationIds = new Set(report.lossCalibrationIds);
      const reportIssueRecordIds = new Set(report.issueRecordIds);
      const reportConsumptionRecordIds = new Set(report.consumptionRecordIds);
      const nextDrafts = (item.rawMaterialCostAllocationDrafts ?? []).map((record) =>
        reportDraftIds.has(record.costAllocationDraftId)
          ? {
              ...record,
              allocationStatus: "毛利已复核/报表可用",
              marginEffect: "reviewed_margin_report_snapshot",
              marginReportId: report.marginReportId,
              marginReviewStatus: "已财务复核/报表可用",
              marginReviewedBy: operatorName,
              marginReviewedAt: now,
            }
          : record,
      );
      const nextConfirmations = (item.rawMaterialCostAllocationConfirmations ?? []).map((record) =>
        reportConfirmationIds.has(record.costConfirmationId)
          ? {
              ...record,
              reviewStatus: "毛利已复核/报表可用",
              marginEffect: "reviewed_margin_report_snapshot",
              marginReportId: report.marginReportId,
              marginReviewStatus: "已财务复核/报表可用",
              marginReviewedBy: operatorName,
              marginReviewedAt: now,
            }
          : record,
      );
      const nextCalibrations = (item.rawMaterialCostLossCalibrations ?? []).map((record) =>
        reportCalibrationIds.has(record.lossCalibrationId)
          ? {
              ...record,
              calibrationStatus: "毛利已复核/报表可用",
              marginEffect: "reviewed_margin_report_snapshot",
              marginReportId: report.marginReportId,
              marginReviewStatus: "已财务复核/报表可用",
              marginReviewedBy: operatorName,
              marginReviewedAt: now,
            }
          : record,
      );
      const nextIssueRecords = (item.rawMaterialIssueRecords ?? []).map((record) =>
        reportIssueRecordIds.has(record.issueRecordId)
          ? {
              ...record,
              costAllocationStatus: "毛利已复核/报表可用",
              marginReportId: report.marginReportId,
              marginReviewedAt: now,
              marginReviewedBy: operatorName,
            }
          : record,
      );
      const nextConsumptionRecords = (item.rawMaterialConsumptionRecords ?? []).map((record) =>
        reportConsumptionRecordIds.has(record.consumptionRecordId)
          ? {
              ...record,
              costAllocationStatus: "毛利已复核/报表可用",
              marginReportId: report.marginReportId,
              marginReviewedAt: now,
              marginReviewedBy: operatorName,
            }
          : record,
      );
      const nextSnapshots = existingSnapshots.map((record) =>
        reportSnapshotIds.has(record.marginSnapshotId)
          ? {
              ...record,
              reviewStatus: "已财务复核/报表可用",
              reportStatus: "已生成内部毛利报表",
              marginEffect: "reviewed_margin_report_snapshot",
              marginReportId: report.marginReportId,
              reviewedBy: operatorName,
              reviewedAt: now,
              lineItems: (record.lineItems ?? []).map((line) => ({
                ...line,
                marginStatus: "已财务复核/报表可用",
              })),
            }
          : record,
      );
      const nextReports = [...existingReports, report];
      updatedItem = {
        ...item,
        costAllocationStatus: "毛利已复核/报表可用",
        costAllocationReviewStatus: "毛利已复核/报表可用",
        marginSnapshotStatus: "已财务复核/报表可用",
        marginReportStatus: "已生成内部毛利报表",
        marginReportCount: nextReports.length,
        marginReportId: report.marginReportId,
        marginReportTotalSalesAmount: totalSalesAmount,
        marginReportMaterialCostAmount: totalMaterialCostAmount,
        marginReportGrossProfitAmount: grossProfitAmount,
        marginReportGrossMarginRatePercent: grossMarginRatePercent,
        marginReviewedBy: operatorName,
        marginReviewedAt: now,
        nextStep: "毛利快照已财务复核，已形成内部毛利报表；客户对账和最终收款结算仍走独立流程。",
        rawMaterialIssueRecords: nextIssueRecords,
        rawMaterialConsumptionRecords: nextConsumptionRecords,
        rawMaterialCostAllocationDrafts: nextDrafts,
        rawMaterialCostAllocationConfirmations: nextConfirmations,
        rawMaterialCostLossCalibrations: nextCalibrations,
        rawMaterialOrderMarginSnapshots: nextSnapshots,
        rawMaterialOrderMarginReports: nextReports,
      };
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
