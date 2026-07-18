import {
  normalizeRawMaterialCostAllocationConfirmations,
  normalizeRawMaterialCostAllocationDrafts,
  normalizeRawMaterialCostLossCalibrations,
  normalizeRawMaterialOrderMarginSnapshots,
} from "./rawMaterialCostMarginRecordNormalizer.mjs";
import {
  normalizeRawMaterialConsumptionRecords,
  normalizeRawMaterialIssueRecords,
} from "./rawMaterialTraceabilityRecordNormalizer.mjs";

export function createRawMaterialCostMarginBuilder(options = {}) {
  const findProductionTask = requireFunction(options.findProductionTask, "findProductionTask");
  const findOrderLine = requireFunction(options.findOrderLine, "findOrderLine");
  const findCustomer = requireFunction(options.findCustomer, "findCustomer");
  const buildGoodsSpec = requireFunction(options.buildGoodsSpec, "buildGoodsSpec");

  return {
    buildCostAllocationDrafts(input = {}) {
      const inbound = input.inbound ?? {};
      const issueRecords = normalizeRawMaterialIssueRecords(input.issueRecords);
      const consumptionRecords = normalizeRawMaterialConsumptionRecords(input.consumptionRecords);
      const existingCostDrafts = normalizeRawMaterialCostAllocationDrafts(input.existingCostDrafts);
      const existingConsumptionIds = new Set(existingCostDrafts.map((record) => record.consumptionRecordId).filter(Boolean));
      const unitPrice = Number(inbound.unitPrice ?? inbound.unit_price ?? 0) || 0;
      const warnings = [];
      const skipped = [];
      if (!unitPrice) {
        return {
          drafts: [],
          warnings,
          blockedCode: "RAW_MATERIAL_COST_DRAFT_REQUIRES_UNIT_PRICE",
          blockedReason: "Raw-material unit price is required before generating a cost allocation draft",
        };
      }
      const baseId = `RMCA-${input.now.slice(0, 10).replaceAll("-", "")}-${Date.now().toString(36).toUpperCase()}`;
      const drafts = [];
      for (const record of consumptionRecords) {
        if (existingConsumptionIds.has(record.consumptionRecordId)) {
          skipped.push({ consumptionRecordId: record.consumptionRecordId, reason: "已生成成本草稿" });
          continue;
        }
        const issueRecord =
          issueRecords.find((item) => item.issueRecordId === record.issueRecordId) ??
          issueRecords.find((item) => item.rollId === record.rollId);
        if (!issueRecord) {
          skipped.push({ consumptionRecordId: record.consumptionRecordId, reason: "缺少领料记录" });
          continue;
        }
        const productionTaskId = cleanText(record.productionTaskId || issueRecord.productionTaskId);
        const matchStatus = cleanText(issueRecord.productionTaskMatchStatus);
        if (!productionTaskId || matchStatus !== "已匹配") {
          skipped.push({
            consumptionRecordId: record.consumptionRecordId,
            reason: productionTaskId ? `生产任务匹配状态为 ${matchStatus || "未确认"}` : "未关联生产任务",
          });
          continue;
        }
        const orderLineId = cleanText(issueRecord.productionTaskOrderLineId);
        const productionTask = findProductionTask(input.workspace, productionTaskId);
        const orderLine = findOrderLine(input.workspace, orderLineId);
        const allocatedWeightKg = roundWeight(record.consumedWeightKg || 0);
        const allocatedQuantity = allocatedWeightKg > 0 ? 0 : Number(record.consumedQuantity || 0) || 1;
        if (allocatedWeightKg <= 0 && allocatedQuantity <= 0) {
          skipped.push({ consumptionRecordId: record.consumptionRecordId, reason: "缺少已消耗重量或件数" });
          continue;
        }
        const allocatedCostAmount = roundMoney((allocatedWeightKg > 0 ? allocatedWeightKg : allocatedQuantity) * unitPrice);
        const goodsSpec = cleanText(issueRecord.productionTaskGoodsSpec) || buildGoodsSpec(productionTask ?? {}, orderLine ?? {});
        const unit = record.unit || inbound.unit || (allocatedWeightKg > 0 ? "kg" : "件");
        const draftIndex = drafts.length + 1;
        drafts.push({
          costAllocationDraftId: `${baseId}-${String(draftIndex).padStart(2, "0")}`,
          inboundId: inbound.id,
          consumptionRecordId: record.consumptionRecordId,
          issueRecordId: issueRecord.issueRecordId,
          rollId: record.rollId,
          sourceRollId: issueRecord.sourceRollId,
          splitRecordId: issueRecord.splitRecordId,
          supplierName: inbound.supplierName,
          deliveryNoteNo: inbound.deliveryNoteNo,
          materialType: inbound.materialType,
          productName: inbound.productName,
          spec: inbound.spec,
          factoryColor: inbound.factoryColor,
          unit,
          unitPrice,
          allocatedWeightKg,
          allocatedQuantity,
          allocatedCostAmount,
          productionTaskId,
          orderLineId,
          productionTaskMachineId: cleanText(issueRecord.productionTaskMachineId || issueRecord.machineId),
          productionTaskGoodsSpec: goodsSpec,
          allocationBasis:
            allocatedWeightKg > 0
              ? `${allocatedWeightKg}kg * ${unitPrice}元/kg`
              : `${allocatedQuantity}${unit} * ${unitPrice}元/${unit}`,
          allocationStatus: "草稿/待成本复核",
          costEffect: "draft_only",
          marginEffect: "none",
          lossCalibrationStatus: "待损耗校准",
          generatedBy: input.operatorName,
          generatedByUserId: input.operatorId,
          generatedAt: input.now,
          note: cleanText(input.note) || "V1 原材料成本分摊草稿；不直接确认订单毛利，需成本/管理复核。",
        });
      }
      if (skipped.length) {
        warnings.push(...skipped.map((item) => `${item.consumptionRecordId || "消耗记录"}：${item.reason}`));
      }
      return {
        drafts,
        warnings,
        blockedCode: consumptionRecords.length
          ? "RAW_MATERIAL_COST_DRAFT_NO_ELIGIBLE_CONSUMPTION"
          : "RAW_MATERIAL_COST_DRAFT_REQUIRES_CONSUMPTION",
        blockedReason: consumptionRecords.length
          ? "No matched raw-material consumption records are eligible for cost allocation draft"
          : "Raw-material consumption confirmation is required before generating a cost allocation draft",
      };
    },

    buildCostAllocationConfirmation(input = {}) {
      const inbound = input.inbound ?? {};
      const drafts = normalizeRawMaterialCostAllocationDrafts(input.drafts);
      const confirmedAmount = roundMoney(drafts.reduce((sum, record) => sum + Number(record.allocatedCostAmount || 0), 0));
      const confirmedWeightKg = roundWeight(drafts.reduce((sum, record) => sum + Number(record.allocatedWeightKg || 0), 0));
      const confirmedQuantity = drafts.reduce((sum, record) => sum + Number(record.allocatedQuantity || 0), 0);
      return {
        costConfirmationId: `RMCC-${input.now.slice(0, 10).replaceAll("-", "")}-${Date.now().toString(36).toUpperCase()}`,
        inboundId: inbound.id,
        supplierName: inbound.supplierName,
        deliveryNoteNo: inbound.deliveryNoteNo,
        costAllocationDraftIds: drafts.map((record) => record.costAllocationDraftId).filter(Boolean),
        consumptionRecordIds: drafts.map((record) => record.consumptionRecordId).filter(Boolean),
        issueRecordIds: drafts.map((record) => record.issueRecordId).filter(Boolean),
        productionTaskIds: [...new Set(drafts.map((record) => record.productionTaskId).filter(Boolean))],
        orderLineIds: [...new Set(drafts.map((record) => record.orderLineId).filter(Boolean))],
        confirmedCount: drafts.length,
        confirmedWeightKg,
        confirmedQuantity,
        confirmedCostAmount: confirmedAmount,
        reviewStatus: "已复核/待损耗校准",
        costEffect: "confirmed_material_cost_snapshot",
        marginEffect: "none",
        lossCalibrationStatus: "待损耗校准",
        confirmedBy: input.operatorName,
        confirmedByUserId: input.operatorId,
        confirmedAt: input.now,
        note: cleanText(input.note) || "V1 成本草稿复核确认；只形成原材料成本快照，不自动更新订单毛利。",
      };
    },

    buildCostLossCalibration(input = {}) {
      const inbound = input.inbound ?? {};
      const confirmations = normalizeRawMaterialCostAllocationConfirmations(input.confirmations);
      const draftIds = new Set(confirmations.flatMap((record) => record.costAllocationDraftIds ?? []));
      const drafts = normalizeRawMaterialCostAllocationDrafts(input.drafts).filter((record) =>
        draftIds.has(record.costAllocationDraftId),
      );
      const confirmedAmount = roundMoney(confirmations.reduce((sum, record) => sum + Number(record.confirmedCostAmount || 0), 0));
      const confirmedWeightKg = roundWeight(confirmations.reduce((sum, record) => sum + Number(record.confirmedWeightKg || 0), 0));
      const confirmedQuantity = confirmations.reduce((sum, record) => sum + Number(record.confirmedQuantity || 0), 0);
      const body = input.body ?? {};
      const actualQualifiedOutputQuantity =
        Number(body.actualQualifiedOutputQuantity ?? body.actualOutputQuantity ?? body.qualifiedOutputQuantity ?? 0) || 0;
      const expectedOutputQuantity =
        Number(body.expectedOutputQuantity ?? body.plannedOutputQuantity ?? body.estimatedOutputQuantity ?? 0) || 0;
      const explicitLossQuantity = Number(body.lossQuantity ?? body.lossOutputQuantity ?? 0) || 0;
      const lossQuantity =
        explicitLossQuantity > 0
          ? explicitLossQuantity
          : expectedOutputQuantity > 0 && actualQualifiedOutputQuantity >= 0
            ? Math.max(0, expectedOutputQuantity - actualQualifiedOutputQuantity)
            : 0;
      const lossRatePercent = expectedOutputQuantity > 0 ? Math.round((lossQuantity / expectedOutputQuantity) * 10000) / 100 : 0;
      return {
        lossCalibrationId: `RMCL-${input.now.slice(0, 10).replaceAll("-", "")}-${Date.now().toString(36).toUpperCase()}`,
        inboundId: inbound.id,
        supplierName: inbound.supplierName,
        deliveryNoteNo: inbound.deliveryNoteNo,
        costConfirmationId: confirmations[0]?.costConfirmationId || "",
        costConfirmationIds: confirmations.map((record) => record.costConfirmationId).filter(Boolean),
        costAllocationDraftIds: confirmations.flatMap((record) => record.costAllocationDraftIds ?? []).filter(Boolean),
        consumptionRecordIds: confirmations.flatMap((record) => record.consumptionRecordIds ?? []).filter(Boolean),
        issueRecordIds: confirmations.flatMap((record) => record.issueRecordIds ?? []).filter(Boolean),
        productionTaskIds: [...new Set(confirmations.flatMap((record) => record.productionTaskIds ?? []).filter(Boolean))],
        orderLineIds: [...new Set(confirmations.flatMap((record) => record.orderLineIds ?? []).filter(Boolean))],
        confirmedCount: confirmations.reduce((sum, record) => sum + Number(record.confirmedCount || 0), 0),
        confirmedWeightKg,
        confirmedQuantity,
        confirmedCostAmount:
          confirmedAmount ||
          roundMoney(drafts.reduce((sum, record) => sum + Number(record.confirmedCostAmount || record.allocatedCostAmount || 0), 0)),
        expectedOutputQuantity,
        actualQualifiedOutputQuantity,
        lossQuantity,
        lossRatePercent,
        calibrationBasis:
          expectedOutputQuantity > 0
            ? `${actualQualifiedOutputQuantity}/${expectedOutputQuantity} 合格产量，损耗 ${lossQuantity}，损耗率 ${lossRatePercent}%`
            : "V1 手工损耗校准；现场尚未提供预计合格产量，先记录成本快照待毛利确认。",
        calibrationStatus: "已校准/待毛利确认",
        costEffect: "loss_calibrated_material_cost_snapshot",
        marginEffect: "pending_margin_snapshot",
        calibratedBy: input.operatorName,
        calibratedByUserId: input.operatorId,
        calibratedAt: input.now,
        note: cleanText(body.note) || "V1 损耗校准第一版；只形成待毛利确认的成本校准快照。",
      };
    },

    buildOrderMarginSnapshot(input = {}) {
      const inbound = input.inbound ?? {};
      const calibrations = normalizeRawMaterialCostLossCalibrations(input.calibrations);
      const calibrationIds = new Set(calibrations.map((record) => record.lossCalibrationId).filter(Boolean));
      const draftIds = new Set(calibrations.flatMap((record) => record.costAllocationDraftIds ?? []).filter(Boolean));
      const drafts = normalizeRawMaterialCostAllocationDrafts(input.drafts).filter((record) =>
        draftIds.has(record.costAllocationDraftId),
      );
      const confirmations = normalizeRawMaterialCostAllocationConfirmations(input.confirmations).filter((record) =>
        calibrations.some((calibration) => (calibration.costConfirmationIds ?? []).includes(record.costConfirmationId)),
      );
      const orderLineIds = [
        ...new Set(
          [...calibrations.flatMap((record) => record.orderLineIds ?? []), ...drafts.map((record) => record.orderLineId)].filter(
            Boolean,
          ),
        ),
      ];
      const totalCalibratedCostAmount = roundMoney(
        calibrations.reduce((sum, record) => sum + Number(record.confirmedCostAmount || 0), 0) ||
          drafts.reduce(
            (sum, record) => sum + Number(record.calibratedCostAmount || record.confirmedCostAmount || record.allocatedCostAmount || 0),
            0,
          ),
      );
      const warnings = [];
      const lineItems = orderLineIds.map((orderLineId) => {
        const orderLine = findOrderLine(input.workspace, orderLineId) ?? {};
        const customer = findCustomer(input.workspace, orderLine.customerId ?? orderLine.customer_id);
        const lineDrafts = drafts.filter((record) => record.orderLineId === orderLineId);
        const lineMaterialCostAmount = roundMoney(
          lineDrafts.reduce(
            (sum, record) =>
              sum + Number(record.calibratedCostAmount || record.confirmedCostAmount || record.allocatedCostAmount || 0),
            0,
          ) || (orderLineIds.length ? totalCalibratedCostAmount / orderLineIds.length : totalCalibratedCostAmount),
        );
        const salesAmount = roundMoney(
          Number(
            orderLine.amount ??
              orderLine.finalAmount ??
              orderLine.totalAmount ??
              orderLine.priceSnapshot?.finalAmount ??
              orderLine.priceSnapshot?.amount ??
              0,
          ) || 0,
        );
        const grossProfitAmount = salesAmount > 0 ? roundMoney(salesAmount - lineMaterialCostAmount) : 0;
        const grossMarginRatePercent = salesAmount > 0 ? Math.round((grossProfitAmount / salesAmount) * 10000) / 100 : 0;
        if (!salesAmount) warnings.push(`${orderLineId}：缺少订单销售金额，毛利率待补订单收入后复核`);
        return {
          orderLineId,
          orderNo: cleanText(orderLine.orderNo ?? orderLine.order_no),
          customerId: cleanText(orderLine.customerId ?? orderLine.customer_id),
          customerName: cleanText(customer?.name ?? customer?.customerName ?? orderLine.customerName),
          productName: cleanText(orderLine.productName ?? orderLine.product_name ?? orderLine.product),
          goodsSpec: buildGoodsSpec({}, orderLine),
          quantity: Number(orderLine.qty ?? orderLine.quantity ?? orderLine.originalQty ?? 0) || 0,
          salesAmount,
          materialCostAmount: lineMaterialCostAmount,
          grossProfitAmount,
          grossMarginRatePercent,
          marginStatus: salesAmount > 0 ? "已生成/待财务复核" : "需补订单收入",
          costAllocationDraftIds: lineDrafts.map((record) => record.costAllocationDraftId).filter(Boolean),
          productionTaskIds: [...new Set(lineDrafts.map((record) => record.productionTaskId).filter(Boolean))],
        };
      });
      const totalSalesAmount = roundMoney(lineItems.reduce((sum, record) => sum + Number(record.salesAmount || 0), 0));
      const totalMaterialCostAmount = roundMoney(lineItems.reduce((sum, record) => sum + Number(record.materialCostAmount || 0), 0));
      const grossProfitAmount = totalSalesAmount > 0 ? roundMoney(totalSalesAmount - totalMaterialCostAmount) : 0;
      const grossMarginRatePercent = totalSalesAmount > 0 ? Math.round((grossProfitAmount / totalSalesAmount) * 10000) / 100 : 0;
      return {
        marginSnapshotId: `RMMG-${input.now.slice(0, 10).replaceAll("-", "")}-${Date.now().toString(36).toUpperCase()}`,
        inboundId: inbound.id,
        supplierName: inbound.supplierName,
        deliveryNoteNo: inbound.deliveryNoteNo,
        lossCalibrationIds: [...calibrationIds],
        costConfirmationIds: confirmations.map((record) => record.costConfirmationId).filter(Boolean),
        costAllocationDraftIds: [...draftIds],
        consumptionRecordIds: [...new Set(calibrations.flatMap((record) => record.consumptionRecordIds ?? []).filter(Boolean))],
        issueRecordIds: [...new Set(calibrations.flatMap((record) => record.issueRecordIds ?? []).filter(Boolean))],
        productionTaskIds: [...new Set(calibrations.flatMap((record) => record.productionTaskIds ?? []).filter(Boolean))],
        orderLineIds,
        lineItems,
        totalSalesAmount,
        totalMaterialCostAmount,
        grossProfitAmount,
        grossMarginRatePercent,
        reviewStatus: "已生成/待财务复核",
        costEffect: "loss_calibrated_material_cost_snapshot",
        marginEffect: "margin_snapshot_pending_review",
        generatedBy: input.operatorName,
        generatedByUserId: input.operatorId,
        generatedAt: input.now,
        note: cleanText(input.note) || "V1 订单毛利快照第一版；只供财务复核，不自动写客户对账或最终结算。",
        warnings,
      };
    },

    buildOrderMarginReport(input = {}) {
      const inbound = input.inbound ?? {};
      const snapshots = normalizeRawMaterialOrderMarginSnapshots(input.snapshots);
      const lineItems = snapshots.flatMap((snapshot) =>
        (snapshot.lineItems ?? []).map((line) => ({
          ...line,
          marginSnapshotId: snapshot.marginSnapshotId,
          marginStatus: "已财务复核/报表可用",
        })),
      );
      const totalSalesAmount = roundMoney(lineItems.reduce((sum, record) => sum + Number(record.salesAmount || 0), 0));
      const totalMaterialCostAmount = roundMoney(lineItems.reduce((sum, record) => sum + Number(record.materialCostAmount || 0), 0));
      const grossProfitAmount = roundMoney(totalSalesAmount - totalMaterialCostAmount);
      const grossMarginRatePercent = totalSalesAmount > 0 ? Math.round((grossProfitAmount / totalSalesAmount) * 10000) / 100 : 0;
      return {
        marginReportId: `RMMR-${input.now.slice(0, 10).replaceAll("-", "")}-${Date.now().toString(36).toUpperCase()}`,
        inboundId: inbound.id,
        supplierName: inbound.supplierName,
        deliveryNoteNo: inbound.deliveryNoteNo,
        marginSnapshotIds: snapshots.map((record) => record.marginSnapshotId).filter(Boolean),
        lossCalibrationIds: [...new Set(snapshots.flatMap((record) => record.lossCalibrationIds ?? []).filter(Boolean))],
        costConfirmationIds: [...new Set(snapshots.flatMap((record) => record.costConfirmationIds ?? []).filter(Boolean))],
        costAllocationDraftIds: [...new Set(snapshots.flatMap((record) => record.costAllocationDraftIds ?? []).filter(Boolean))],
        consumptionRecordIds: [...new Set(snapshots.flatMap((record) => record.consumptionRecordIds ?? []).filter(Boolean))],
        issueRecordIds: [...new Set(snapshots.flatMap((record) => record.issueRecordIds ?? []).filter(Boolean))],
        productionTaskIds: [...new Set(snapshots.flatMap((record) => record.productionTaskIds ?? []).filter(Boolean))],
        orderLineIds: [...new Set(snapshots.flatMap((record) => record.orderLineIds ?? []).filter(Boolean))],
        lineItems,
        totalSalesAmount,
        totalMaterialCostAmount,
        grossProfitAmount,
        grossMarginRatePercent,
        reviewStatus: "已财务复核/报表可用",
        reportStatus: "已生成内部毛利报表",
        costEffect: "loss_calibrated_material_cost_snapshot",
        marginEffect: "reviewed_margin_report_snapshot",
        reviewedBy: input.operatorName,
        reviewedByUserId: input.operatorId,
        reviewedAt: input.now,
        note: cleanText(input.note) || "V1 毛利快照财务复核第一版；生成内部毛利报表，不自动写客户对账或收款结算。",
        warnings: [],
      };
    },
  };
}

function requireFunction(value, name) {
  if (typeof value !== "function") throw new Error(`Raw-material cost/margin builder requires ${name}`);
  return value;
}

function roundWeight(value) {
  return Math.round((Number(value) || 0) * 1000) / 1000;
}

function roundMoney(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

function cleanText(value) {
  return String(value ?? "").trim();
}
