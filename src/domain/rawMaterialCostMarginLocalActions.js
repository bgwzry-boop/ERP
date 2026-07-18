import { roundLocalRawMaterialMoney, roundLocalRawMaterialWeight } from "./rawMaterialLocalActionMath.js";

export function buildRawMaterialCostMarginToastText(action, reference, options = {}) {
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
  return "";
}

export function applyRawMaterialCostMarginLocalAction(item, input = {}) {
  const { action, customers = [], options = {}, now, operatorName, orderLines = [] } = input;
  let updatedItem = null;
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
    if (!drafts.length) return null;
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
    if (!confirmableDrafts.length) return null;
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
    if (!existingConfirmations.length) return null;
    const existingCalibrations = item.rawMaterialCostLossCalibrations ?? [];
    const calibratedConfirmationIds = new Set(
      existingCalibrations
        .flatMap((record) => [record.costConfirmationId, ...(record.costConfirmationIds ?? [])])
        .filter(Boolean),
    );
    const calibratableConfirmations = existingConfirmations.filter(
      (record) => !calibratedConfirmationIds.has(record.costConfirmationId) && record.lossCalibrationStatus !== "已校准/待毛利确认",
    );
    if (!calibratableConfirmations.length) return null;
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
    if (!existingCalibrations.length) return null;
    const existingSnapshots = item.rawMaterialOrderMarginSnapshots ?? [];
    const snapshottedCalibrationIds = new Set(
      existingSnapshots.flatMap((record) => record.lossCalibrationIds ?? []).filter(Boolean),
    );
    const eligibleCalibrations = existingCalibrations.filter(
      (record) => !snapshottedCalibrationIds.has(record.lossCalibrationId) && record.marginEffect !== "margin_snapshot_pending_review",
    );
    if (!eligibleCalibrations.length) return null;
    const relatedDraftIds = new Set(eligibleCalibrations.flatMap((record) => record.costAllocationDraftIds ?? []).filter(Boolean));
    const relatedDrafts = (item.rawMaterialCostAllocationDrafts ?? []).filter((record) => relatedDraftIds.has(record.costAllocationDraftId));
    const orderLineIds = [
      ...new Set([
        ...eligibleCalibrations.flatMap((record) => record.orderLineIds ?? []),
        ...relatedDrafts.map((record) => record.orderLineId),
      ].filter(Boolean)),
    ];
    if (!orderLineIds.length) return null;
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
    if (!existingSnapshots.length) return null;
    const existingReports = item.rawMaterialOrderMarginReports ?? [];
    const reportedSnapshotIds = new Set(existingReports.flatMap((record) => record.marginSnapshotIds ?? []).filter(Boolean));
    const reviewableSnapshots = existingSnapshots.filter(
      (record) =>
        !reportedSnapshotIds.has(record.marginSnapshotId) &&
        record.marginEffect !== "reviewed_margin_report_snapshot" &&
        record.reviewStatus !== "已财务复核/报表可用",
    );
    if (!reviewableSnapshots.length) return null;
    const missingRevenue = reviewableSnapshots.some(
      (record) =>
        (record.lineItems ?? []).some((line) => Number(line.salesAmount || 0) <= 0 || line.marginStatus === "需补订单收入") ||
        (record.warnings ?? []).some((warning) => String(warning).includes("缺少订单销售金额")),
    );
    if (missingRevenue) return null;
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

  return updatedItem;
}
