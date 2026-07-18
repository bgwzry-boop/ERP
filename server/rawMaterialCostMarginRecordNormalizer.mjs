export function normalizeRawMaterialCostAllocationDrafts(records = []) {
  return (Array.isArray(records) ? records : [])
    .map((record) => ({
      ...record,
      costAllocationDraftId: cleanText(record.costAllocationDraftId ?? record.id),
      inboundId: cleanText(record.inboundId),
      consumptionRecordId: cleanText(record.consumptionRecordId),
      issueRecordId: cleanText(record.issueRecordId),
      rollId: cleanText(record.rollId),
      sourceRollId: cleanText(record.sourceRollId),
      splitRecordId: cleanText(record.splitRecordId),
      supplierName: cleanText(record.supplierName),
      deliveryNoteNo: cleanText(record.deliveryNoteNo),
      materialType: cleanText(record.materialType),
      productName: cleanText(record.productName),
      spec: cleanText(record.spec),
      factoryColor: cleanText(record.factoryColor),
      unit: cleanText(record.unit),
      unitPrice: Number(record.unitPrice) || 0,
      allocatedWeightKg: Number(record.allocatedWeightKg) || 0,
      allocatedQuantity: Number(record.allocatedQuantity) || 0,
      allocatedCostAmount: Number(record.allocatedCostAmount) || 0,
      productionTaskId: cleanText(record.productionTaskId),
      orderLineId: cleanText(record.orderLineId),
      productionTaskMachineId: cleanText(record.productionTaskMachineId),
      productionTaskGoodsSpec: cleanText(record.productionTaskGoodsSpec),
      allocationBasis: cleanText(record.allocationBasis),
      allocationStatus: cleanText(record.allocationStatus) || "草稿/待成本复核",
      costEffect: cleanText(record.costEffect) || "draft_only",
      marginEffect: cleanText(record.marginEffect) || "none",
      lossCalibrationStatus: cleanText(record.lossCalibrationStatus) || "待损耗校准",
      generatedBy: cleanText(record.generatedBy),
      generatedByUserId: cleanText(record.generatedByUserId),
      generatedAt: cleanText(record.generatedAt),
      confirmedCostAmount: Number(record.confirmedCostAmount) || 0,
      confirmedBy: cleanText(record.confirmedBy),
      confirmedByUserId: cleanText(record.confirmedByUserId),
      confirmedAt: cleanText(record.confirmedAt),
      costConfirmationId: cleanText(record.costConfirmationId),
      reviewNote: cleanText(record.reviewNote),
      lossCalibrationId: cleanText(record.lossCalibrationId),
      lossRatePercent: Number(record.lossRatePercent) || 0,
      calibratedCostAmount: Number(record.calibratedCostAmount) || 0,
      calibratedBy: cleanText(record.calibratedBy),
      calibratedByUserId: cleanText(record.calibratedByUserId),
      calibratedAt: cleanText(record.calibratedAt),
      marginSnapshotId: cleanText(record.marginSnapshotId),
      marginSnapshotStatus: cleanText(record.marginSnapshotStatus),
      marginSnapshotGeneratedBy: cleanText(record.marginSnapshotGeneratedBy),
      marginSnapshotGeneratedByUserId: cleanText(record.marginSnapshotGeneratedByUserId),
      marginSnapshotGeneratedAt: cleanText(record.marginSnapshotGeneratedAt),
      marginReportId: cleanText(record.marginReportId),
      marginReviewStatus: cleanText(record.marginReviewStatus),
      marginReviewedBy: cleanText(record.marginReviewedBy),
      marginReviewedByUserId: cleanText(record.marginReviewedByUserId),
      marginReviewedAt: cleanText(record.marginReviewedAt),
      note: cleanText(record.note),
    }))
    .filter((record) => record.costAllocationDraftId && record.consumptionRecordId && record.issueRecordId);
}

export function normalizeRawMaterialCostAllocationConfirmations(records = []) {
  return (Array.isArray(records) ? records : [])
    .map((record) => ({
      ...record,
      costConfirmationId: cleanText(record.costConfirmationId ?? record.id),
      inboundId: cleanText(record.inboundId),
      supplierName: cleanText(record.supplierName),
      deliveryNoteNo: cleanText(record.deliveryNoteNo),
      costAllocationDraftIds: normalizeTextArray(record.costAllocationDraftIds),
      consumptionRecordIds: normalizeTextArray(record.consumptionRecordIds),
      issueRecordIds: normalizeTextArray(record.issueRecordIds),
      productionTaskIds: normalizeTextArray(record.productionTaskIds),
      orderLineIds: normalizeTextArray(record.orderLineIds),
      confirmedCount: Number(record.confirmedCount) || 0,
      confirmedWeightKg: Number(record.confirmedWeightKg) || 0,
      confirmedQuantity: Number(record.confirmedQuantity) || 0,
      confirmedCostAmount: Number(record.confirmedCostAmount) || 0,
      reviewStatus: cleanText(record.reviewStatus) || "已复核/待损耗校准",
      costEffect: cleanText(record.costEffect) || "confirmed_material_cost_snapshot",
      marginEffect: cleanText(record.marginEffect) || "none",
      lossCalibrationStatus: cleanText(record.lossCalibrationStatus) || "待损耗校准",
      lossCalibrationId: cleanText(record.lossCalibrationId),
      lossRatePercent: Number(record.lossRatePercent) || 0,
      calibratedBy: cleanText(record.calibratedBy),
      calibratedByUserId: cleanText(record.calibratedByUserId),
      calibratedAt: cleanText(record.calibratedAt),
      marginSnapshotId: cleanText(record.marginSnapshotId),
      marginSnapshotStatus: cleanText(record.marginSnapshotStatus),
      marginSnapshotGeneratedBy: cleanText(record.marginSnapshotGeneratedBy),
      marginSnapshotGeneratedByUserId: cleanText(record.marginSnapshotGeneratedByUserId),
      marginSnapshotGeneratedAt: cleanText(record.marginSnapshotGeneratedAt),
      marginReportId: cleanText(record.marginReportId),
      marginReviewStatus: cleanText(record.marginReviewStatus),
      marginReviewedBy: cleanText(record.marginReviewedBy),
      marginReviewedByUserId: cleanText(record.marginReviewedByUserId),
      marginReviewedAt: cleanText(record.marginReviewedAt),
      confirmedBy: cleanText(record.confirmedBy),
      confirmedByUserId: cleanText(record.confirmedByUserId),
      confirmedAt: cleanText(record.confirmedAt),
      note: cleanText(record.note),
    }))
    .filter((record) => record.costConfirmationId);
}

export function normalizeRawMaterialCostLossCalibrations(records = []) {
  return (Array.isArray(records) ? records : [])
    .map((record) => ({
      ...record,
      lossCalibrationId: cleanText(record.lossCalibrationId ?? record.id),
      inboundId: cleanText(record.inboundId),
      supplierName: cleanText(record.supplierName),
      deliveryNoteNo: cleanText(record.deliveryNoteNo),
      costConfirmationId: cleanText(record.costConfirmationId),
      costConfirmationIds: normalizeTextArray(record.costConfirmationIds),
      costAllocationDraftIds: normalizeTextArray(record.costAllocationDraftIds),
      consumptionRecordIds: normalizeTextArray(record.consumptionRecordIds),
      issueRecordIds: normalizeTextArray(record.issueRecordIds),
      productionTaskIds: normalizeTextArray(record.productionTaskIds),
      orderLineIds: normalizeTextArray(record.orderLineIds),
      confirmedCount: Number(record.confirmedCount) || 0,
      confirmedWeightKg: Number(record.confirmedWeightKg) || 0,
      confirmedQuantity: Number(record.confirmedQuantity) || 0,
      confirmedCostAmount: Number(record.confirmedCostAmount) || 0,
      expectedOutputQuantity: Number(record.expectedOutputQuantity) || 0,
      actualQualifiedOutputQuantity: Number(record.actualQualifiedOutputQuantity) || 0,
      lossQuantity: Number(record.lossQuantity) || 0,
      lossRatePercent: Number(record.lossRatePercent) || 0,
      calibrationBasis: cleanText(record.calibrationBasis),
      calibrationStatus: cleanText(record.calibrationStatus) || "已校准/待毛利确认",
      costEffect: cleanText(record.costEffect) || "loss_calibrated_material_cost_snapshot",
      marginEffect: cleanText(record.marginEffect) || "pending_margin_snapshot",
      marginSnapshotId: cleanText(record.marginSnapshotId),
      marginSnapshotStatus: cleanText(record.marginSnapshotStatus),
      marginSnapshotGeneratedBy: cleanText(record.marginSnapshotGeneratedBy),
      marginSnapshotGeneratedByUserId: cleanText(record.marginSnapshotGeneratedByUserId),
      marginSnapshotGeneratedAt: cleanText(record.marginSnapshotGeneratedAt),
      marginReportId: cleanText(record.marginReportId),
      marginReviewStatus: cleanText(record.marginReviewStatus),
      marginReviewedBy: cleanText(record.marginReviewedBy),
      marginReviewedByUserId: cleanText(record.marginReviewedByUserId),
      marginReviewedAt: cleanText(record.marginReviewedAt),
      calibratedBy: cleanText(record.calibratedBy),
      calibratedByUserId: cleanText(record.calibratedByUserId),
      calibratedAt: cleanText(record.calibratedAt),
      note: cleanText(record.note),
    }))
    .filter((record) => record.lossCalibrationId);
}

export function normalizeRawMaterialOrderMarginSnapshots(records = []) {
  return (Array.isArray(records) ? records : [])
    .map((record) => ({
      ...record,
      marginSnapshotId: cleanText(record.marginSnapshotId ?? record.id),
      inboundId: cleanText(record.inboundId),
      supplierName: cleanText(record.supplierName),
      deliveryNoteNo: cleanText(record.deliveryNoteNo),
      lossCalibrationIds: normalizeTextArray(record.lossCalibrationIds),
      costConfirmationIds: normalizeTextArray(record.costConfirmationIds),
      costAllocationDraftIds: normalizeTextArray(record.costAllocationDraftIds),
      consumptionRecordIds: normalizeTextArray(record.consumptionRecordIds),
      issueRecordIds: normalizeTextArray(record.issueRecordIds),
      productionTaskIds: normalizeTextArray(record.productionTaskIds),
      orderLineIds: normalizeTextArray(record.orderLineIds),
      lineItems: normalizeMarginSnapshotLines(record.lineItems),
      totalSalesAmount: Number(record.totalSalesAmount) || 0,
      totalMaterialCostAmount: Number(record.totalMaterialCostAmount) || 0,
      grossProfitAmount: Number(record.grossProfitAmount) || 0,
      grossMarginRatePercent: Number(record.grossMarginRatePercent) || 0,
      reviewStatus: cleanText(record.reviewStatus) || "已生成/待财务复核",
      reportStatus: cleanText(record.reportStatus),
      costEffect: cleanText(record.costEffect) || "loss_calibrated_material_cost_snapshot",
      marginEffect: cleanText(record.marginEffect) || "margin_snapshot_pending_review",
      marginReportId: cleanText(record.marginReportId),
      generatedBy: cleanText(record.generatedBy),
      generatedByUserId: cleanText(record.generatedByUserId),
      generatedAt: cleanText(record.generatedAt),
      reviewedBy: cleanText(record.reviewedBy),
      reviewedByUserId: cleanText(record.reviewedByUserId),
      reviewedAt: cleanText(record.reviewedAt),
      note: cleanText(record.note),
      warnings: normalizeRawMaterialCostAllocationWarnings(record.warnings),
    }))
    .filter((record) => record.marginSnapshotId);
}

export function normalizeRawMaterialOrderMarginReports(records = []) {
  return (Array.isArray(records) ? records : [])
    .map((record) => ({
      ...record,
      marginReportId: cleanText(record.marginReportId ?? record.id),
      inboundId: cleanText(record.inboundId),
      supplierName: cleanText(record.supplierName),
      deliveryNoteNo: cleanText(record.deliveryNoteNo),
      marginSnapshotIds: normalizeTextArray(record.marginSnapshotIds),
      lossCalibrationIds: normalizeTextArray(record.lossCalibrationIds),
      costConfirmationIds: normalizeTextArray(record.costConfirmationIds),
      costAllocationDraftIds: normalizeTextArray(record.costAllocationDraftIds),
      consumptionRecordIds: normalizeTextArray(record.consumptionRecordIds),
      issueRecordIds: normalizeTextArray(record.issueRecordIds),
      productionTaskIds: normalizeTextArray(record.productionTaskIds),
      orderLineIds: normalizeTextArray(record.orderLineIds),
      lineItems: normalizeMarginReportLines(record.lineItems),
      totalSalesAmount: Number(record.totalSalesAmount) || 0,
      totalMaterialCostAmount: Number(record.totalMaterialCostAmount) || 0,
      grossProfitAmount: Number(record.grossProfitAmount) || 0,
      grossMarginRatePercent: Number(record.grossMarginRatePercent) || 0,
      reviewStatus: cleanText(record.reviewStatus) || "已财务复核/报表可用",
      reportStatus: cleanText(record.reportStatus) || "已生成内部毛利报表",
      costEffect: cleanText(record.costEffect) || "loss_calibrated_material_cost_snapshot",
      marginEffect: cleanText(record.marginEffect) || "reviewed_margin_report_snapshot",
      reviewedBy: cleanText(record.reviewedBy),
      reviewedByUserId: cleanText(record.reviewedByUserId),
      reviewedAt: cleanText(record.reviewedAt),
      note: cleanText(record.note),
      warnings: normalizeRawMaterialCostAllocationWarnings(record.warnings),
    }))
    .filter((record) => record.marginReportId);
}

export function normalizeRawMaterialCostAllocationWarnings(warnings = []) {
  return Array.isArray(warnings) ? warnings.map(cleanText).filter(Boolean) : [];
}

function normalizeMarginSnapshotLines(lines) {
  return (Array.isArray(lines) ? lines : [])
    .map((line) => ({
      ...line,
      orderLineId: cleanText(line.orderLineId),
      orderNo: cleanText(line.orderNo),
      customerId: cleanText(line.customerId),
      customerName: cleanText(line.customerName),
      productName: cleanText(line.productName),
      goodsSpec: cleanText(line.goodsSpec),
      quantity: Number(line.quantity) || 0,
      salesAmount: Number(line.salesAmount) || 0,
      materialCostAmount: Number(line.materialCostAmount) || 0,
      grossProfitAmount: Number(line.grossProfitAmount) || 0,
      grossMarginRatePercent: Number(line.grossMarginRatePercent) || 0,
      marginStatus: cleanText(line.marginStatus) || "已生成/待财务复核",
      marginSnapshotId: cleanText(line.marginSnapshotId),
      costAllocationDraftIds: normalizeTextArray(line.costAllocationDraftIds),
      productionTaskIds: normalizeTextArray(line.productionTaskIds),
    }))
    .filter((line) => line.orderLineId);
}

function normalizeMarginReportLines(lines) {
  return (Array.isArray(lines) ? lines : [])
    .map((line) => ({
      ...line,
      marginSnapshotId: cleanText(line.marginSnapshotId),
      orderLineId: cleanText(line.orderLineId),
      orderNo: cleanText(line.orderNo),
      customerId: cleanText(line.customerId),
      customerName: cleanText(line.customerName),
      productName: cleanText(line.productName),
      goodsSpec: cleanText(line.goodsSpec),
      quantity: Number(line.quantity) || 0,
      salesAmount: Number(line.salesAmount) || 0,
      materialCostAmount: Number(line.materialCostAmount) || 0,
      grossProfitAmount: Number(line.grossProfitAmount) || 0,
      grossMarginRatePercent: Number(line.grossMarginRatePercent) || 0,
      marginStatus: cleanText(line.marginStatus) || "已财务复核/报表可用",
      costAllocationDraftIds: normalizeTextArray(line.costAllocationDraftIds),
      productionTaskIds: normalizeTextArray(line.productionTaskIds),
    }))
    .filter((line) => line.orderLineId);
}

function normalizeTextArray(values) {
  return Array.isArray(values) ? values.map(cleanText).filter(Boolean) : [];
}

function cleanText(value) {
  return String(value ?? "").trim();
}
