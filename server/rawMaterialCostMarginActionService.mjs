import { createRawMaterialCostMarginBuilder } from "./rawMaterialCostMarginBuilderService.mjs";
import {
  buildRawMaterialProductionTaskGoodsSpec,
  findRawMaterialCustomer,
  findRawMaterialOrderLine,
  findRawMaterialProductionTask,
} from "./rawMaterialInboundRecordService.mjs";
import {
  normalizeRawMaterialCostAllocationConfirmations,
  normalizeRawMaterialCostAllocationDrafts,
  normalizeRawMaterialCostAllocationWarnings,
  normalizeRawMaterialCostLossCalibrations,
  normalizeRawMaterialOrderMarginReports,
  normalizeRawMaterialOrderMarginSnapshots,
} from "./rawMaterialCostMarginRecordNormalizer.mjs";
import {
  normalizeRawMaterialConsumptionRecords,
  normalizeRawMaterialIssueRecords,
} from "./rawMaterialTraceabilityRecordNormalizer.mjs";

const RAW_MATERIAL_COST_MARGIN_ACTIONS = new Set([
  "generate_cost_draft",
  "confirm_cost_draft",
  "calibrate_loss",
  "generate_margin_snapshot",
  "review_margin_snapshot",
]);

const rawMaterialCostMarginBuilder = createRawMaterialCostMarginBuilder({
  findProductionTask: findRawMaterialProductionTask,
  findOrderLine: findRawMaterialOrderLine,
  findCustomer: findRawMaterialCustomer,
  buildGoodsSpec: buildRawMaterialProductionTaskGoodsSpec,
});

export function applyRawMaterialCostMarginAction(input = {}) {
  const action = cleanText(input.action);
  if (!RAW_MATERIAL_COST_MARGIN_ACTIONS.has(action)) return null;
  const before = input.before ?? {};
  const workspace = input.workspace ?? {};
  const operatorId = cleanText(input.operatorId);
  const operatorName = cleanText(input.operatorName ?? operatorId);
  const now = cleanText(input.now) || new Date().toISOString();
  let after = before;
  if (action === "generate_cost_draft") {
    const existingIssueRecords = normalizeRawMaterialIssueRecords(before.rawMaterialIssueRecords);
    const existingConsumptionRecords = normalizeRawMaterialConsumptionRecords(before.rawMaterialConsumptionRecords);
    const existingCostDrafts = normalizeRawMaterialCostAllocationDrafts(before.rawMaterialCostAllocationDrafts);
    const result = rawMaterialCostMarginBuilder.buildCostAllocationDrafts({
      workspace,
      inbound: before,
      issueRecords: existingIssueRecords,
      consumptionRecords: existingConsumptionRecords,
      existingCostDrafts,
      operatorId,
      operatorName,
      now,
      note: input.body?.note,
    });
    if (!result.drafts.length) {
      throw Object.assign(
        new Error(result.blockedReason || "No eligible raw-material consumption records can generate cost allocation draft"),
        {
          statusCode: 422,
          code: result.blockedCode || "RAW_MATERIAL_COST_DRAFT_NO_ELIGIBLE_CONSUMPTION",
        },
      );
    }
    const nextIssueRecords = existingIssueRecords.map((record) => {
      const draft = result.drafts.find((item) => item.issueRecordId === record.issueRecordId);
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
    const nextConsumptionRecords = existingConsumptionRecords.map((record) => {
      const draft = result.drafts.find((item) => item.consumptionRecordId === record.consumptionRecordId);
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
    after = {
      ...before,
      costAllocationStatus: "成本草稿待复核",
      costAllocationDraftedBy: operatorName,
      costAllocationDraftedByUserId: operatorId,
      costAllocationDraftedAt: now,
      costAllocationDraftCount: existingCostDrafts.length + result.drafts.length,
      costAllocationDraftAmount: roundMoney(
        existingCostDrafts.reduce((sum, item) => sum + Number(item.allocatedCostAmount || 0), 0) +
          result.drafts.reduce((sum, item) => sum + Number(item.allocatedCostAmount || 0), 0),
      ),
      costAllocationReviewStatus: "待成本复核",
      nextStep: "已生成原材料成本分摊草稿；仍需成本/管理复核、损耗校准和订单毛利报表确认。",
      rawMaterialIssueRecords: nextIssueRecords,
      rawMaterialConsumptionRecords: nextConsumptionRecords,
      rawMaterialCostAllocationDrafts: [...existingCostDrafts, ...result.drafts],
      rawMaterialCostAllocationWarnings: result.warnings,
    };
  }
  if (action === "confirm_cost_draft") {
    const existingIssueRecords = normalizeRawMaterialIssueRecords(before.rawMaterialIssueRecords);
    const existingConsumptionRecords = normalizeRawMaterialConsumptionRecords(before.rawMaterialConsumptionRecords);
    const existingCostDrafts = normalizeRawMaterialCostAllocationDrafts(before.rawMaterialCostAllocationDrafts);
    if (!existingCostDrafts.length) {
      throw Object.assign(new Error("Cost allocation draft is required before confirmation"), {
        statusCode: 422,
        code: "RAW_MATERIAL_COST_CONFIRM_REQUIRES_DRAFT",
      });
    }
    const confirmableDrafts = existingCostDrafts.filter((record) => !record.costConfirmationId && record.allocationStatus !== "已复核/待损耗校准");
    if (!confirmableDrafts.length) {
      throw Object.assign(new Error("Raw-material cost allocation drafts are already confirmed"), {
        statusCode: 409,
        code: "RAW_MATERIAL_COST_CONFIRM_ALREADY_CONFIRMED",
      });
    }
    const confirmation = rawMaterialCostMarginBuilder.buildCostAllocationConfirmation({
      inbound: before,
      drafts: confirmableDrafts,
      operatorId,
      operatorName,
      now,
      note: input.body?.note,
    });
    const confirmedDraftIds = new Set(confirmableDrafts.map((record) => record.costAllocationDraftId));
    const confirmedIssueRecordIds = new Set(confirmableDrafts.map((record) => record.issueRecordId).filter(Boolean));
    const confirmedConsumptionRecordIds = new Set(confirmableDrafts.map((record) => record.consumptionRecordId).filter(Boolean));
    const nextCostDrafts = existingCostDrafts.map((record) =>
      confirmedDraftIds.has(record.costAllocationDraftId)
        ? {
            ...record,
            allocationStatus: "已复核/待损耗校准",
            costEffect: "confirmed_material_cost_snapshot",
            marginEffect: "none",
            lossCalibrationStatus: "待损耗校准",
            confirmedCostAmount: record.allocatedCostAmount,
            confirmedBy: operatorName,
            confirmedByUserId: operatorId,
            confirmedAt: now,
            costConfirmationId: confirmation.costConfirmationId,
            reviewNote: cleanText(input.body?.note) || "V1 成本草稿复核确认；损耗校准和毛利报表仍需独立流程。",
          }
        : record,
    );
    const nextIssueRecords = existingIssueRecords.map((record) =>
      confirmedIssueRecordIds.has(record.issueRecordId)
        ? {
            ...record,
            costAllocationStatus: "成本已复核待损耗校准",
            costConfirmationId: confirmation.costConfirmationId,
            confirmedCostAmount: Number(record.allocatedCostAmount) || 0,
            costConfirmedAt: now,
            costConfirmedBy: operatorName,
            costConfirmedByUserId: operatorId,
          }
        : record,
    );
    const nextConsumptionRecords = existingConsumptionRecords.map((record) =>
      confirmedConsumptionRecordIds.has(record.consumptionRecordId)
        ? {
            ...record,
            costAllocationStatus: "成本已复核待损耗校准",
            costConfirmationId: confirmation.costConfirmationId,
            confirmedCostAmount: Number(record.allocatedCostAmount) || 0,
            costConfirmedAt: now,
            costConfirmedBy: operatorName,
            costConfirmedByUserId: operatorId,
          }
        : record,
    );
    const allConfirmedCostDrafts = nextCostDrafts.filter((record) => record.allocationStatus === "已复核/待损耗校准");
    after = {
      ...before,
      costAllocationStatus: "成本已复核待损耗校准",
      costAllocationReviewStatus: "已复核/待损耗校准",
      costAllocationConfirmedBy: operatorName,
      costAllocationConfirmedByUserId: operatorId,
      costAllocationConfirmedAt: now,
      costAllocationConfirmedCount: allConfirmedCostDrafts.length,
      costAllocationConfirmedAmount: roundMoney(allConfirmedCostDrafts.reduce((sum, item) => sum + Number(item.confirmedCostAmount || item.allocatedCostAmount || 0), 0)),
      costAllocationConfirmationId: confirmation.costConfirmationId,
      nextStep: "成本草稿已复核为原材料成本快照；仍需损耗校准和订单毛利报表确认。",
      rawMaterialIssueRecords: nextIssueRecords,
      rawMaterialConsumptionRecords: nextConsumptionRecords,
      rawMaterialCostAllocationDrafts: nextCostDrafts,
      rawMaterialCostAllocationConfirmations: [
        ...normalizeRawMaterialCostAllocationConfirmations(before.rawMaterialCostAllocationConfirmations),
        confirmation,
      ],
    };
  }
  if (action === "calibrate_loss") {
    const existingIssueRecords = normalizeRawMaterialIssueRecords(before.rawMaterialIssueRecords);
    const existingConsumptionRecords = normalizeRawMaterialConsumptionRecords(before.rawMaterialConsumptionRecords);
    const existingCostDrafts = normalizeRawMaterialCostAllocationDrafts(before.rawMaterialCostAllocationDrafts);
    const existingConfirmations = normalizeRawMaterialCostAllocationConfirmations(before.rawMaterialCostAllocationConfirmations);
    const existingCalibrations = normalizeRawMaterialCostLossCalibrations(before.rawMaterialCostLossCalibrations);
    if (!existingConfirmations.length) {
      throw Object.assign(new Error("Cost confirmation is required before loss calibration"), {
        statusCode: 422,
        code: "RAW_MATERIAL_LOSS_CALIBRATION_REQUIRES_COST_CONFIRMATION",
      });
    }
    const calibratedConfirmationIds = new Set(
      existingCalibrations
        .flatMap((record) => [record.costConfirmationId, ...(record.costConfirmationIds ?? [])])
        .filter(Boolean),
    );
    const calibratableConfirmations = existingConfirmations.filter(
      (record) => !calibratedConfirmationIds.has(record.costConfirmationId) && record.lossCalibrationStatus !== "已校准/待毛利确认",
    );
    if (!calibratableConfirmations.length) {
      throw Object.assign(new Error("Raw-material cost confirmations are already loss-calibrated"), {
        statusCode: 409,
        code: "RAW_MATERIAL_LOSS_CALIBRATION_ALREADY_DONE",
      });
    }
    const calibration = rawMaterialCostMarginBuilder.buildCostLossCalibration({
      inbound: before,
      confirmations: calibratableConfirmations,
      drafts: existingCostDrafts,
      body: input.body,
      operatorId,
      operatorName,
      now,
    });
    const calibratedConfirmationIdSet = new Set(calibratableConfirmations.map((record) => record.costConfirmationId));
    const calibratedDraftIds = new Set(calibration.costAllocationDraftIds);
    const calibratedIssueRecordIds = new Set(calibration.issueRecordIds);
    const calibratedConsumptionRecordIds = new Set(calibration.consumptionRecordIds);
    const nextCostDrafts = existingCostDrafts.map((record) =>
      calibratedDraftIds.has(record.costAllocationDraftId)
        ? {
            ...record,
            allocationStatus: "已校准/待毛利确认",
            costEffect: "loss_calibrated_material_cost_snapshot",
            marginEffect: "pending_margin_snapshot",
            lossCalibrationStatus: "已校准/待毛利确认",
            lossCalibrationId: calibration.lossCalibrationId,
            lossRatePercent: calibration.lossRatePercent,
            calibratedCostAmount: record.confirmedCostAmount || record.allocatedCostAmount,
            calibratedBy: operatorName,
            calibratedByUserId: operatorId,
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
            lossRatePercent: calibration.lossRatePercent,
            calibratedBy: operatorName,
            calibratedByUserId: operatorId,
            calibratedAt: now,
          }
        : record,
    );
    const nextIssueRecords = existingIssueRecords.map((record) =>
      calibratedIssueRecordIds.has(record.issueRecordId)
        ? {
            ...record,
            costAllocationStatus: "损耗已校准待毛利确认",
            lossCalibrationId: calibration.lossCalibrationId,
            lossRatePercent: calibration.lossRatePercent,
            lossCalibratedAt: now,
            lossCalibratedBy: operatorName,
            lossCalibratedByUserId: operatorId,
          }
        : record,
    );
    const nextConsumptionRecords = existingConsumptionRecords.map((record) =>
      calibratedConsumptionRecordIds.has(record.consumptionRecordId)
        ? {
            ...record,
            costAllocationStatus: "损耗已校准待毛利确认",
            lossCalibrationId: calibration.lossCalibrationId,
            lossRatePercent: calibration.lossRatePercent,
            lossCalibratedAt: now,
            lossCalibratedBy: operatorName,
            lossCalibratedByUserId: operatorId,
          }
        : record,
    );
    const nextCalibrations = [...existingCalibrations, calibration];
    after = {
      ...before,
      costAllocationStatus: "损耗已校准待毛利确认",
      costAllocationReviewStatus: "已校准/待毛利确认",
      lossCalibrationStatus: "已校准/待毛利确认",
      lossCalibratedBy: operatorName,
      lossCalibratedByUserId: operatorId,
      lossCalibratedAt: now,
      lossCalibrationCount: nextCalibrations.length,
      lossCalibrationId: calibration.lossCalibrationId,
      lossCalibrationRatePercent: calibration.lossRatePercent,
      lossCalibrationActualOutputQuantity: calibration.actualQualifiedOutputQuantity,
      lossCalibrationExpectedOutputQuantity: calibration.expectedOutputQuantity,
      lossCalibrationAmount: calibration.confirmedCostAmount,
      nextStep: "损耗已校准为原材料成本校准快照；仍需订单毛利报表确认。",
      rawMaterialIssueRecords: nextIssueRecords,
      rawMaterialConsumptionRecords: nextConsumptionRecords,
      rawMaterialCostAllocationDrafts: nextCostDrafts,
      rawMaterialCostAllocationConfirmations: nextConfirmations,
      rawMaterialCostLossCalibrations: nextCalibrations,
    };
  }
  if (action === "generate_margin_snapshot") {
    const existingIssueRecords = normalizeRawMaterialIssueRecords(before.rawMaterialIssueRecords);
    const existingConsumptionRecords = normalizeRawMaterialConsumptionRecords(before.rawMaterialConsumptionRecords);
    const existingCostDrafts = normalizeRawMaterialCostAllocationDrafts(before.rawMaterialCostAllocationDrafts);
    const existingConfirmations = normalizeRawMaterialCostAllocationConfirmations(before.rawMaterialCostAllocationConfirmations);
    const existingCalibrations = normalizeRawMaterialCostLossCalibrations(before.rawMaterialCostLossCalibrations);
    const existingMarginSnapshots = normalizeRawMaterialOrderMarginSnapshots(before.rawMaterialOrderMarginSnapshots);
    if (!existingCalibrations.length) {
      throw Object.assign(new Error("Loss calibration is required before generating margin snapshot"), {
        statusCode: 422,
        code: "RAW_MATERIAL_MARGIN_SNAPSHOT_REQUIRES_LOSS_CALIBRATION",
      });
    }
    const snapshottedCalibrationIds = new Set(
      existingMarginSnapshots.flatMap((record) => record.lossCalibrationIds ?? []).filter(Boolean),
    );
    const eligibleCalibrations = existingCalibrations.filter(
      (record) => !snapshottedCalibrationIds.has(record.lossCalibrationId) && record.marginEffect !== "margin_snapshot_pending_review",
    );
    if (!eligibleCalibrations.length) {
      throw Object.assign(new Error("Raw-material margin snapshot is already generated"), {
        statusCode: 409,
        code: "RAW_MATERIAL_MARGIN_SNAPSHOT_ALREADY_GENERATED",
      });
    }
    const snapshot = rawMaterialCostMarginBuilder.buildOrderMarginSnapshot({
      workspace,
      inbound: before,
      calibrations: eligibleCalibrations,
      drafts: existingCostDrafts,
      confirmations: existingConfirmations,
      operatorId,
      operatorName,
      now,
      note: input.body?.note,
    });
    if (!snapshot.lineItems.length) {
      throw Object.assign(new Error("Order line is required before generating margin snapshot"), {
        statusCode: 422,
        code: "RAW_MATERIAL_MARGIN_SNAPSHOT_REQUIRES_ORDER_LINE",
      });
    }
    const snapshotCalibrationIds = new Set(snapshot.lossCalibrationIds);
    const snapshotDraftIds = new Set(snapshot.costAllocationDraftIds);
    const snapshotConfirmationIds = new Set(snapshot.costConfirmationIds);
    const snapshotIssueRecordIds = new Set(snapshot.issueRecordIds);
    const snapshotConsumptionRecordIds = new Set(snapshot.consumptionRecordIds);
    const nextCostDrafts = existingCostDrafts.map((record) =>
      snapshotDraftIds.has(record.costAllocationDraftId)
        ? {
            ...record,
            allocationStatus: "毛利快照待复核",
            marginEffect: "margin_snapshot_pending_review",
            marginSnapshotId: snapshot.marginSnapshotId,
            marginSnapshotStatus: "已生成/待财务复核",
            marginSnapshotGeneratedBy: operatorName,
            marginSnapshotGeneratedByUserId: operatorId,
            marginSnapshotGeneratedAt: now,
          }
        : record,
    );
    const nextConfirmations = existingConfirmations.map((record) =>
      snapshotConfirmationIds.has(record.costConfirmationId)
        ? {
            ...record,
            reviewStatus: "毛利快照待复核",
            marginEffect: "margin_snapshot_pending_review",
            marginSnapshotId: snapshot.marginSnapshotId,
            marginSnapshotStatus: "已生成/待财务复核",
            marginSnapshotGeneratedBy: operatorName,
            marginSnapshotGeneratedByUserId: operatorId,
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
            marginSnapshotGeneratedByUserId: operatorId,
            marginSnapshotGeneratedAt: now,
          }
        : record,
    );
    const nextIssueRecords = existingIssueRecords.map((record) =>
      snapshotIssueRecordIds.has(record.issueRecordId)
        ? {
            ...record,
            costAllocationStatus: "毛利快照待复核",
            marginSnapshotId: snapshot.marginSnapshotId,
            marginSnapshotGeneratedAt: now,
            marginSnapshotGeneratedBy: operatorName,
            marginSnapshotGeneratedByUserId: operatorId,
          }
        : record,
    );
    const nextConsumptionRecords = existingConsumptionRecords.map((record) =>
      snapshotConsumptionRecordIds.has(record.consumptionRecordId)
        ? {
            ...record,
            costAllocationStatus: "毛利快照待复核",
            marginSnapshotId: snapshot.marginSnapshotId,
            marginSnapshotGeneratedAt: now,
            marginSnapshotGeneratedBy: operatorName,
            marginSnapshotGeneratedByUserId: operatorId,
          }
        : record,
    );
    const nextMarginSnapshots = [...existingMarginSnapshots, snapshot];
    after = {
      ...before,
      costAllocationStatus: "毛利快照待复核",
      costAllocationReviewStatus: "毛利快照待复核",
      marginSnapshotStatus: "已生成/待财务复核",
      marginSnapshotCount: nextMarginSnapshots.length,
      marginSnapshotId: snapshot.marginSnapshotId,
      marginSnapshotTotalSalesAmount: snapshot.totalSalesAmount,
      marginSnapshotMaterialCostAmount: snapshot.totalMaterialCostAmount,
      marginSnapshotGrossProfitAmount: snapshot.grossProfitAmount,
      marginSnapshotGrossMarginRatePercent: snapshot.grossMarginRatePercent,
      marginSnapshotGeneratedBy: operatorName,
      marginSnapshotGeneratedByUserId: operatorId,
      marginSnapshotGeneratedAt: now,
      nextStep: "已生成订单毛利快照，等待财务复核；不自动写客户对账或最终财务结算。",
      rawMaterialIssueRecords: nextIssueRecords,
      rawMaterialConsumptionRecords: nextConsumptionRecords,
      rawMaterialCostAllocationDrafts: nextCostDrafts,
      rawMaterialCostAllocationConfirmations: nextConfirmations,
      rawMaterialCostLossCalibrations: nextCalibrations,
      rawMaterialOrderMarginSnapshots: nextMarginSnapshots,
      rawMaterialCostAllocationWarnings: [
        ...normalizeRawMaterialCostAllocationWarnings(before.rawMaterialCostAllocationWarnings),
        ...snapshot.warnings,
      ],
    };
  }
  if (action === "review_margin_snapshot") {
    const existingIssueRecords = normalizeRawMaterialIssueRecords(before.rawMaterialIssueRecords);
    const existingConsumptionRecords = normalizeRawMaterialConsumptionRecords(before.rawMaterialConsumptionRecords);
    const existingCostDrafts = normalizeRawMaterialCostAllocationDrafts(before.rawMaterialCostAllocationDrafts);
    const existingConfirmations = normalizeRawMaterialCostAllocationConfirmations(before.rawMaterialCostAllocationConfirmations);
    const existingCalibrations = normalizeRawMaterialCostLossCalibrations(before.rawMaterialCostLossCalibrations);
    const existingMarginSnapshots = normalizeRawMaterialOrderMarginSnapshots(before.rawMaterialOrderMarginSnapshots);
    const existingMarginReports = normalizeRawMaterialOrderMarginReports(before.rawMaterialOrderMarginReports);
    if (!existingMarginSnapshots.length) {
      throw Object.assign(new Error("Margin snapshot is required before finance review"), {
        statusCode: 422,
        code: "RAW_MATERIAL_MARGIN_REVIEW_REQUIRES_SNAPSHOT",
      });
    }
    const reportedSnapshotIds = new Set(
      existingMarginReports.flatMap((record) => record.marginSnapshotIds ?? []).filter(Boolean),
    );
    const reviewableSnapshots = existingMarginSnapshots.filter(
      (record) =>
        !reportedSnapshotIds.has(record.marginSnapshotId) &&
        record.marginEffect !== "reviewed_margin_report_snapshot" &&
        record.reviewStatus !== "已财务复核/报表可用",
    );
    if (!reviewableSnapshots.length) {
      throw Object.assign(new Error("Raw-material margin snapshot is already reviewed"), {
        statusCode: 409,
        code: "RAW_MATERIAL_MARGIN_REVIEW_ALREADY_DONE",
      });
    }
    const missingRevenue = reviewableSnapshots.some(
      (record) =>
        (record.lineItems ?? []).some((line) => Number(line.salesAmount || 0) <= 0 || line.marginStatus === "需补订单收入") ||
        (record.warnings ?? []).some((warning) => String(warning).includes("缺少订单销售金额")),
    );
    if (missingRevenue) {
      throw Object.assign(new Error("Order revenue is required before reviewing margin snapshot"), {
        statusCode: 422,
        code: "RAW_MATERIAL_MARGIN_REVIEW_REQUIRES_ORDER_REVENUE",
      });
    }
    const report = rawMaterialCostMarginBuilder.buildOrderMarginReport({
      inbound: before,
      snapshots: reviewableSnapshots,
      operatorId,
      operatorName,
      now,
      note: input.body?.note,
    });
    const reportSnapshotIds = new Set(report.marginSnapshotIds);
    const reportDraftIds = new Set(report.costAllocationDraftIds);
    const reportConfirmationIds = new Set(report.costConfirmationIds);
    const reportCalibrationIds = new Set(report.lossCalibrationIds);
    const reportIssueRecordIds = new Set(report.issueRecordIds);
    const reportConsumptionRecordIds = new Set(report.consumptionRecordIds);
    const nextCostDrafts = existingCostDrafts.map((record) =>
      reportDraftIds.has(record.costAllocationDraftId)
        ? {
            ...record,
            allocationStatus: "毛利已复核/报表可用",
            marginEffect: "reviewed_margin_report_snapshot",
            marginReportId: report.marginReportId,
            marginReviewStatus: "已财务复核/报表可用",
            marginReviewedBy: operatorName,
            marginReviewedByUserId: operatorId,
            marginReviewedAt: now,
          }
        : record,
    );
    const nextConfirmations = existingConfirmations.map((record) =>
      reportConfirmationIds.has(record.costConfirmationId)
        ? {
            ...record,
            reviewStatus: "毛利已复核/报表可用",
            marginEffect: "reviewed_margin_report_snapshot",
            marginReportId: report.marginReportId,
            marginReviewStatus: "已财务复核/报表可用",
            marginReviewedBy: operatorName,
            marginReviewedByUserId: operatorId,
            marginReviewedAt: now,
          }
        : record,
    );
    const nextCalibrations = existingCalibrations.map((record) =>
      reportCalibrationIds.has(record.lossCalibrationId)
        ? {
            ...record,
            calibrationStatus: "毛利已复核/报表可用",
            marginEffect: "reviewed_margin_report_snapshot",
            marginReportId: report.marginReportId,
            marginReviewStatus: "已财务复核/报表可用",
            marginReviewedBy: operatorName,
            marginReviewedByUserId: operatorId,
            marginReviewedAt: now,
          }
        : record,
    );
    const nextIssueRecords = existingIssueRecords.map((record) =>
      reportIssueRecordIds.has(record.issueRecordId)
        ? {
            ...record,
            costAllocationStatus: "毛利已复核/报表可用",
            marginReportId: report.marginReportId,
            marginReviewedAt: now,
            marginReviewedBy: operatorName,
            marginReviewedByUserId: operatorId,
          }
        : record,
    );
    const nextConsumptionRecords = existingConsumptionRecords.map((record) =>
      reportConsumptionRecordIds.has(record.consumptionRecordId)
        ? {
            ...record,
            costAllocationStatus: "毛利已复核/报表可用",
            marginReportId: report.marginReportId,
            marginReviewedAt: now,
            marginReviewedBy: operatorName,
            marginReviewedByUserId: operatorId,
          }
        : record,
    );
    const nextMarginSnapshots = existingMarginSnapshots.map((record) =>
      reportSnapshotIds.has(record.marginSnapshotId)
        ? {
            ...record,
            reviewStatus: "已财务复核/报表可用",
            reportStatus: "已生成内部毛利报表",
            marginEffect: "reviewed_margin_report_snapshot",
            marginReportId: report.marginReportId,
            reviewedBy: operatorName,
            reviewedByUserId: operatorId,
            reviewedAt: now,
            lineItems: (record.lineItems ?? []).map((line) => ({
              ...line,
              marginStatus: "已财务复核/报表可用",
            })),
          }
        : record,
    );
    const nextMarginReports = [...existingMarginReports, report];
    after = {
      ...before,
      costAllocationStatus: "毛利已复核/报表可用",
      costAllocationReviewStatus: "毛利已复核/报表可用",
      marginSnapshotStatus: "已财务复核/报表可用",
      marginReportStatus: "已生成内部毛利报表",
      marginReportCount: nextMarginReports.length,
      marginReportId: report.marginReportId,
      marginReportTotalSalesAmount: report.totalSalesAmount,
      marginReportMaterialCostAmount: report.totalMaterialCostAmount,
      marginReportGrossProfitAmount: report.grossProfitAmount,
      marginReportGrossMarginRatePercent: report.grossMarginRatePercent,
      marginReviewedBy: operatorName,
      marginReviewedByUserId: operatorId,
      marginReviewedAt: now,
      nextStep: "毛利快照已财务复核，已形成内部毛利报表；客户对账和最终收款结算仍走独立流程。",
      rawMaterialIssueRecords: nextIssueRecords,
      rawMaterialConsumptionRecords: nextConsumptionRecords,
      rawMaterialCostAllocationDrafts: nextCostDrafts,
      rawMaterialCostAllocationConfirmations: nextConfirmations,
      rawMaterialCostLossCalibrations: nextCalibrations,
      rawMaterialOrderMarginSnapshots: nextMarginSnapshots,
      rawMaterialOrderMarginReports: nextMarginReports,
    };
  }
  return after;
}

function roundMoney(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

function cleanText(value) {
  return String(value ?? "").trim();
}
