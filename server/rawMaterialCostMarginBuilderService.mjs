import {rawMaterialRecordIdentitySuffix} from "../shared/rawMaterialRecordIdentity.js";
import {rawMaterialRollFacts} from "../shared/rawMaterialRollFacts.js";
import {resolveRawMaterialCostUnit, formatRawMaterialAllocationBasis} from "../shared/rawMaterialCostUnit.js";
import { resolveRawMaterialCostPrice } from "../shared/rawMaterialCostPrice.js";
import { resolveRawMaterialConsumptionIssue } from "../shared/rawMaterialConsumptionIssue.js";
import { assertRawMaterialCostDraftScope } from "../shared/rawMaterialCostDraftScope.js";
import { assertRawMaterialConfirmationSources } from "../shared/rawMaterialConfirmationSources.js";
import { sumRawMaterialCostAmounts } from "../shared/rawMaterialCostAmounts.js";
import { buildRawMaterialMarginReportLines } from "../shared/rawMaterialMarginReportLines.js";
import { rawMaterialConsumptionCostBasis } from "../shared/rawMaterialConsumptionCostBasis.js";
import { assertRawMaterialMarginCostCoverage, rawMaterialDraftCostAmount } from "../shared/rawMaterialMarginCostCoverage.js";
import { readRawMaterialLossMeasurement } from "../shared/rawMaterialMeasurements.js";
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
      const warnings = [];
      const skipped = [];
      const baseId = `RMCA-${input.now.slice(0, 10).replaceAll("-", "")}-${rawMaterialRecordIdentitySuffix()}`;
      const drafts = [];
      for (const record of consumptionRecords) {
        if (existingConsumptionIds.has(record.consumptionRecordId)) {
          skipped.push({ consumptionRecordId: record.consumptionRecordId, reason: "已生成成本草稿" });
          continue;
        }
        const issueRecord = resolveRawMaterialConsumptionIssue(record, issueRecords, inbound.id, consumptionRecords);
        if (!issueRecord) {
          skipped.push({ consumptionRecordId: record.consumptionRecordId, reason: "领料来源缺失、重复或与消耗归属不符" });
          continue;
        }
        const productionTaskId = cleanText(issueRecord.productionTaskId);
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
        const unitPrice = resolveRawMaterialCostPrice(inbound, record);
        if (unitPrice === null) {
          skipped.push({consumptionRecordId: record.consumptionRecordId, code: "RAW_MATERIAL_COST_DRAFT_REQUIRES_UNIT_PRICE", reason: "缺少该卷可用单价，请核对原始明细价格"});
          continue;
        }
        const unit = resolveRawMaterialCostUnit(inbound, record);
        const basis = rawMaterialConsumptionCostBasis(record, unitPrice, unit);
        if (!basis) {
          skipped.push({ consumptionRecordId: record.consumptionRecordId, reason: "计价单位与消耗计量不符，或缺少有效重量/件数及金额" });
          continue;
        }
        const {allocatedWeightKg, allocatedQuantity, allocatedCostAmount} = basis;
        const goodsSpec = cleanText(issueRecord.productionTaskGoodsSpec) || buildGoodsSpec(productionTask ?? {}, orderLine ?? {});
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
          ...rawMaterialRollFacts(inbound, (inbound.rolls ?? []).find(roll => roll.id === record.rollId)),
          unit,
          unitPrice,
          allocatedWeightKg,
          allocatedQuantity,
          allocatedCostAmount,
          productionTaskId,
          orderLineId,
          productionTaskMachineId: cleanText(issueRecord.productionTaskMachineId || issueRecord.machineId),
          productionTaskGoodsSpec: goodsSpec,
          allocationBasis: formatRawMaterialAllocationBasis(basis, unitPrice, unit),
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
        blockedCode: skipped.length && skipped.every(row => row.code === "RAW_MATERIAL_COST_DRAFT_REQUIRES_UNIT_PRICE")
          ? "RAW_MATERIAL_COST_DRAFT_REQUIRES_UNIT_PRICE"
          : consumptionRecords.length
          ? "RAW_MATERIAL_COST_DRAFT_NO_ELIGIBLE_CONSUMPTION"
          : "RAW_MATERIAL_COST_DRAFT_REQUIRES_CONSUMPTION",
        blockedReason: skipped.length
          ? skipped.slice(0, 3).map(row => `${row.consumptionRecordId}：${row.reason}`).join("；")
          : consumptionRecords.length
          ? "没有可生成成本的已匹配消耗记录"
          : "Raw-material consumption confirmation is required before generating a cost allocation draft",
      };
    },

    buildCostAllocationConfirmation(input = {}) {
      const inbound = input.inbound ?? {};
      const drafts = normalizeRawMaterialCostAllocationDrafts(input.drafts);
      const confirmedAmount = sumRawMaterialCostAmounts(drafts, "allocatedCostAmount");
      assertRawMaterialCostDraftScope({inboundId: inbound.id, drafts, priorDrafts: inbound.rawMaterialCostAllocationDrafts ?? []});
      const confirmedWeightKg = roundWeight(drafts.reduce((sum, record) => sum + Number(record.allocatedWeightKg || 0), 0));
      const confirmedQuantity = drafts.reduce((sum, record) => sum + Number(record.allocatedQuantity || 0), 0);
      return {
        costConfirmationId: `RMCC-${input.now.slice(0, 10).replaceAll("-", "")}-${rawMaterialRecordIdentitySuffix()}`,
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
      const confirmedAmount = sumRawMaterialCostAmounts(confirmations, "confirmedCostAmount");
      const confirmedWeightKg = roundWeight(confirmations.reduce((sum, record) => sum + Number(record.confirmedWeightKg || 0), 0));
      const confirmedQuantity = confirmations.reduce((sum, record) => sum + Number(record.confirmedQuantity || 0), 0);
      const body = input.body ?? {};
      const {expectedOutputQuantity, actualQualifiedOutputQuantity, lossQuantity, lossRatePercent} = readRawMaterialLossMeasurement(body);
      assertRawMaterialConfirmationSources({inboundId: inbound.id, confirmations, drafts: normalizeRawMaterialCostAllocationDrafts(input.drafts)});
      return {
        lossCalibrationId: `RMCL-${input.now.slice(0, 10).replaceAll("-", "")}-${rawMaterialRecordIdentitySuffix()}`,
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
        confirmedCostAmount: confirmedAmount,
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
      assertRawMaterialMarginCostCoverage({calibrations, drafts, orderLineIds});
      const warnings = [];
      const lineItems = orderLineIds.map((orderLineId) => {
        const orderLine = findOrderLine(input.workspace, orderLineId) ?? {};
        const customer = findCustomer(input.workspace, orderLine.customerId ?? orderLine.customer_id);
        const lineDrafts = drafts.filter((record) => record.orderLineId === orderLineId);
        const lineMaterialCostAmount = roundMoney(lineDrafts.reduce((sum, record) => sum + rawMaterialDraftCostAmount(record), 0));
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
        marginSnapshotId: `RMMG-${input.now.slice(0, 10).replaceAll("-", "")}-${rawMaterialRecordIdentitySuffix()}`,
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
      const lineItems = buildRawMaterialMarginReportLines(snapshots);
      const totalSalesAmount = roundMoney(lineItems.reduce((sum, record) => sum + Number(record.salesAmount || 0), 0));
      const totalMaterialCostAmount = roundMoney(lineItems.reduce((sum, record) => sum + Number(record.materialCostAmount || 0), 0));
      const grossProfitAmount = roundMoney(totalSalesAmount - totalMaterialCostAmount);
      const grossMarginRatePercent = totalSalesAmount > 0 ? Math.round((grossProfitAmount / totalSalesAmount) * 10000) / 100 : 0;
      return {
        marginReportId: `RMMR-${input.now.slice(0, 10).replaceAll("-", "")}-${rawMaterialRecordIdentitySuffix()}`,
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
