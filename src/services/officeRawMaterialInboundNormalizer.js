export function normalizeRawMaterialInbound(input = {}) {
  const item = { ...(input ?? {}) };
  normalizeRawMaterialInboundSummary(item);
  item.rolls = normalizeRawMaterialRolls(item.rolls);
  normalizeRawMaterialTraceabilityHistory(item);
  normalizeRawMaterialCostHistory(item);
  normalizeRawMaterialMarginHistory(item);
  return item;
}

function normalizeRawMaterialInboundSummary(item) {
  item.id = cleanText(item.id);
  item.supplierName = cleanText(item.supplierName);
  item.deliveryNoteNo = cleanText(item.deliveryNoteNo);
  item.status = cleanText(item.status);
  item.source = cleanText(item.source);
  item.ocrProvider = cleanText(item.ocrProvider);
  item.ocrAction = cleanText(item.ocrAction);
  item.ocrRequestId = cleanText(item.ocrRequestId);
  item.ocrStatus = cleanText(item.ocrStatus);
  item.ocrAngle = Number(item.ocrAngle) || 0;
  item.ocrImageWidth = Math.max(0, Number(item.ocrImageWidth) || 0);
  item.ocrImageHeight = Math.max(0, Number(item.ocrImageHeight) || 0);
  item.ocrPageCount = Math.max(1, toNumber(item.ocrPageCount, 1));
  item.ocrPages = normalizeOcrPages(item.ocrPages, item.ocrPageCount, item.ocrImageWidth, item.ocrImageHeight, item.ocrAngle);
  item.ocrSourceDigest = cleanText(item.ocrSourceDigest);
  item.ocrRecognizedAt = cleanText(item.ocrRecognizedAt);
  item.ocrRawText = cleanText(item.ocrRawText);
  item.sourceAttachmentId = cleanText(item.sourceAttachmentId);
  item.sourceAttachmentIds = normalizeTextList(item.sourceAttachmentIds, item.sourceAttachmentId);
  item.sourceFileName = cleanText(item.sourceFileName);
  item.sourceFileNames = normalizeTextList(item.sourceFileNames, item.sourceFileName);
  item.sourceMimeType = cleanText(item.sourceMimeType);
  item.sourceMimeTypes = normalizeTextList(item.sourceMimeTypes, item.sourceMimeType);
  item.ocrReviewFields = (Array.isArray(item.ocrReviewFields) ? item.ocrReviewFields : []).map((field) => ({
    ...field,
    key: cleanText(field?.key),
    label: cleanText(field?.label),
    recognizedValue: field?.recognizedValue ?? "",
    value: field?.value ?? "",
    confidence: toNumber(field?.confidence, 0),
    reviewStatus: cleanText(field?.reviewStatus),
    required: field?.required === true,
  })).filter((field) => field.key);
  item.ocrLines = (Array.isArray(item.ocrLines) ? item.ocrLines : []).map((line) => {
    const values = line?.values && typeof line.values === "object" ? { ...line.values } : {};
    const recognizedValues = line?.recognizedValues && typeof line.recognizedValues === "object" ? { ...line.recognizedValues } : {};
    return {
      ...line,
      lineId: cleanText(line?.lineId),
      sourcePageIndex: Math.max(0, toNumber(line?.sourcePageIndex, 0)),
      sourceText: cleanText(line?.sourceText),
      reviewStatus: cleanText(line?.reviewStatus),
      values,
      recognizedValues: Object.keys(recognizedValues).length ? recognizedValues : { ...values },
      confidences: line?.confidences && typeof line.confidences === "object" ? { ...line.confidences } : {},
      reviewedFields: (Array.isArray(line?.reviewedFields) ? line.reviewedFields : []).map((field) => ({
        ...field,
        key: cleanText(field?.key),
        recognizedValue: field?.recognizedValue ?? "",
        value: field?.value ?? "",
        reviewStatus: cleanText(field?.reviewStatus),
      })).filter((field) => field.key),
      reviewedBy: cleanText(line?.reviewedBy),
      reviewedByUserId: cleanText(line?.reviewedByUserId),
      reviewedAt: cleanText(line?.reviewedAt),
      reviewDisposition: cleanText(line?.reviewDisposition) || "included",
      reviewProjectedRollCount: Math.max(0, Math.trunc(Number(line?.reviewProjectedRollCount) || 0)),
      excludedRollIndices: (Array.isArray(line?.excludedRollIndices) ? line.excludedRollIndices : [])
        .map(Number)
        .filter((value) => Number.isInteger(value) && value >= 0),
      exclusionReason: cleanText(line?.exclusionReason),
      excludedBy: cleanText(line?.excludedBy),
      excludedByUserId: cleanText(line?.excludedByUserId),
      excludedAt: cleanText(line?.excludedAt),
    };
  }).filter((line) => line.lineId);
  item.issueStatus = cleanText(item.issueStatus);
  item.machineId = cleanText(item.machineId);
  item.productionTaskId = cleanText(item.productionTaskId);
  item.productionTaskMatchStatus = cleanText(item.productionTaskMatchStatus);
  item.productionTaskMatchReason = cleanText(item.productionTaskMatchReason);
  item.productionTaskOrderLineId = cleanText(item.productionTaskOrderLineId);
  item.productionTaskMachineId = cleanText(item.productionTaskMachineId);
  item.productionTaskGoodsSpec = cleanText(item.productionTaskGoodsSpec);
  item.costAllocationStatus = cleanText(item.costAllocationStatus);
  item.costAllocationDraftedBy = cleanText(item.costAllocationDraftedBy);
  item.costAllocationDraftedByUserId = cleanText(item.costAllocationDraftedByUserId);
  item.costAllocationDraftedAt = cleanText(item.costAllocationDraftedAt);
  item.costAllocationDraftCount = toNumber(item.costAllocationDraftCount, 0);
  item.costAllocationDraftAmount = toNumber(item.costAllocationDraftAmount, 0);
  item.costAllocationReviewStatus = cleanText(item.costAllocationReviewStatus);
  item.costAllocationConfirmedBy = cleanText(item.costAllocationConfirmedBy);
  item.costAllocationConfirmedByUserId = cleanText(item.costAllocationConfirmedByUserId);
  item.costAllocationConfirmedAt = cleanText(item.costAllocationConfirmedAt);
  item.costAllocationConfirmedCount = toNumber(item.costAllocationConfirmedCount, 0);
  item.costAllocationConfirmedAmount = toNumber(item.costAllocationConfirmedAmount, 0);
  item.costAllocationConfirmationId = cleanText(item.costAllocationConfirmationId);
  item.lossCalibrationStatus = cleanText(item.lossCalibrationStatus);
  item.lossCalibratedBy = cleanText(item.lossCalibratedBy);
  item.lossCalibratedByUserId = cleanText(item.lossCalibratedByUserId);
  item.lossCalibratedAt = cleanText(item.lossCalibratedAt);
  item.lossCalibrationCount = toNumber(item.lossCalibrationCount, 0);
  item.lossCalibrationId = cleanText(item.lossCalibrationId);
  item.lossCalibrationRatePercent = toNumber(item.lossCalibrationRatePercent, 0);
  item.lossCalibrationActualOutputQuantity = toNumber(item.lossCalibrationActualOutputQuantity, 0);
  item.lossCalibrationExpectedOutputQuantity = toNumber(item.lossCalibrationExpectedOutputQuantity, 0);
  item.lossCalibrationAmount = toNumber(item.lossCalibrationAmount, 0);
  item.rawMaterialCostAllocationWarnings = Array.isArray(item.rawMaterialCostAllocationWarnings)
    ? item.rawMaterialCostAllocationWarnings.map(cleanText).filter(Boolean)
    : [];
  item.marginSnapshotStatus = cleanText(item.marginSnapshotStatus);
  item.marginSnapshotCount = toNumber(item.marginSnapshotCount, 0);
  item.marginSnapshotId = cleanText(item.marginSnapshotId);
  item.marginSnapshotTotalSalesAmount = toNumber(item.marginSnapshotTotalSalesAmount, 0);
  item.marginSnapshotMaterialCostAmount = toNumber(item.marginSnapshotMaterialCostAmount, 0);
  item.marginSnapshotGrossProfitAmount = toNumber(item.marginSnapshotGrossProfitAmount, 0);
  item.marginSnapshotGrossMarginRatePercent = toNumber(item.marginSnapshotGrossMarginRatePercent, 0);
  item.marginSnapshotGeneratedBy = cleanText(item.marginSnapshotGeneratedBy);
  item.marginSnapshotGeneratedAt = cleanText(item.marginSnapshotGeneratedAt);
  item.marginReportStatus = cleanText(item.marginReportStatus);
  item.marginReportCount = toNumber(item.marginReportCount, 0);
  item.marginReportId = cleanText(item.marginReportId);
  item.marginReportTotalSalesAmount = toNumber(item.marginReportTotalSalesAmount, 0);
  item.marginReportMaterialCostAmount = toNumber(item.marginReportMaterialCostAmount, 0);
  item.marginReportGrossProfitAmount = toNumber(item.marginReportGrossProfitAmount, 0);
  item.marginReportGrossMarginRatePercent = toNumber(item.marginReportGrossMarginRatePercent, 0);
  item.marginReviewedBy = cleanText(item.marginReviewedBy);
  item.marginReviewedAt = cleanText(item.marginReviewedAt);
}

function normalizeRawMaterialRolls(rolls) {
  return (Array.isArray(rolls) ? rolls : []).map((roll) => ({
    ...roll,
    id: cleanText(roll.id),
    supplierRollNo: cleanText(roll.supplierRollNo),
    weightKg: Number(roll.weightKg) || 0,
    originalWeightKg: toNumber(roll.originalWeightKg, 0),
    labelStatus: cleanText(roll.labelStatus),
    inventoryStatus: cleanText(roll.inventoryStatus),
    signedNoteStatus: cleanText(roll.signedNoteStatus),
    parentRollId: cleanText(roll.parentRollId),
    sourceRollId: cleanText(roll.sourceRollId),
    splitRecordId: cleanText(roll.splitRecordId),
    splitStatus: cleanText(roll.splitStatus),
    splitAt: cleanText(roll.splitAt),
    splitBy: cleanText(roll.splitBy),
    splitIssuedWeightKg: toNumber(roll.splitIssuedWeightKg, 0),
    splitRemainingWeightKg: toNumber(roll.splitRemainingWeightKg, 0),
    issueRecordId: cleanText(roll.issueRecordId),
    issuedAt: cleanText(roll.issuedAt),
    issuedBy: cleanText(roll.issuedBy),
    issuedByUserId: cleanText(roll.issuedByUserId),
    machineId: cleanText(roll.machineId),
    productionTaskId: cleanText(roll.productionTaskId),
    productionTaskMatchStatus: cleanText(roll.productionTaskMatchStatus),
    productionTaskMatchReason: cleanText(roll.productionTaskMatchReason),
    productionTaskOrderLineId: cleanText(roll.productionTaskOrderLineId),
    productionTaskMachineId: cleanText(roll.productionTaskMachineId),
    productionTaskGoodsSpec: cleanText(roll.productionTaskGoodsSpec),
    issuePurpose: cleanText(roll.issuePurpose),
    consumptionStatus: cleanText(roll.consumptionStatus),
    consumptionRecordId: cleanText(roll.consumptionRecordId),
    consumedAt: cleanText(roll.consumedAt),
    consumedBy: cleanText(roll.consumedBy),
    lastConsumedWeightKg: toNumber(roll.lastConsumedWeightKg, 0),
    remainingMachineSideWeightKg: toNumber(roll.remainingMachineSideWeightKg, 0),
    leftoverReturnRecordId: cleanText(roll.leftoverReturnRecordId),
    leftoverWeightKg: toNumber(roll.leftoverWeightKg, 0),
    leftoverQuantity: toNumber(roll.leftoverQuantity, 0),
    returnedAt: cleanText(roll.returnedAt),
    returnedBy: cleanText(roll.returnedBy),
    leftoverReviewRecordId: cleanText(roll.leftoverReviewRecordId),
    leftoverReviewedWeightKg: toNumber(roll.leftoverReviewedWeightKg, 0),
    leftoverReviewedQuantity: toNumber(roll.leftoverReviewedQuantity, 0),
    leftoverReviewedAt: cleanText(roll.leftoverReviewedAt),
    leftoverReviewedBy: cleanText(roll.leftoverReviewedBy),
  }));
}

function normalizeRawMaterialTraceabilityHistory(item) {
  item.rawMaterialIssueRecords = Array.isArray(item.rawMaterialIssueRecords)
    ? item.rawMaterialIssueRecords.map((record) => ({
        ...record,
        issueRecordId: cleanText(record.issueRecordId ?? record.id),
        rollId: cleanText(record.rollId),
        sourceRollId: cleanText(record.sourceRollId),
        splitRecordId: cleanText(record.splitRecordId),
        machineId: cleanText(record.machineId),
        productionTaskId: cleanText(record.productionTaskId),
        productionTaskMatchStatus: cleanText(record.productionTaskMatchStatus),
        productionTaskMatchReason: cleanText(record.productionTaskMatchReason),
        productionTaskOrderLineId: cleanText(record.productionTaskOrderLineId),
        productionTaskMachineId: cleanText(record.productionTaskMachineId),
        productionTaskGoodsSpec: cleanText(record.productionTaskGoodsSpec),
        issuePurpose: cleanText(record.issuePurpose),
        consumptionStatus: cleanText(record.consumptionStatus),
        issuedAt: cleanText(record.issuedAt),
        issuedBy: cleanText(record.issuedBy),
        issuedWeightKg: toNumber(record.issuedWeightKg, 0),
        issuedQuantity: toNumber(record.issuedQuantity, 0),
        sourceWeightKg: toNumber(record.sourceWeightKg, 0),
        remainingWeightKg: toNumber(record.remainingWeightKg, 0),
        remainingMachineSideWeightKg: toNumber(record.remainingMachineSideWeightKg, 0),
        issueMode: cleanText(record.issueMode),
        consumptionRecordId: cleanText(record.consumptionRecordId),
        consumedWeightKg: toNumber(record.consumedWeightKg, 0),
        leftoverReturnRecordId: cleanText(record.leftoverReturnRecordId),
        leftoverReviewRecordId: cleanText(record.leftoverReviewRecordId),
        consumedAt: cleanText(record.consumedAt),
        returnedAt: cleanText(record.returnedAt),
        leftoverReviewedAt: cleanText(record.leftoverReviewedAt),
        costAllocationStatus: cleanText(record.costAllocationStatus),
        costAllocationDraftId: cleanText(record.costAllocationDraftId),
        allocatedCostAmount: toNumber(record.allocatedCostAmount, 0),
        allocatedWeightKg: toNumber(record.allocatedWeightKg, 0),
        allocatedQuantity: toNumber(record.allocatedQuantity, 0),
        costConfirmationId: cleanText(record.costConfirmationId),
        confirmedCostAmount: toNumber(record.confirmedCostAmount, 0),
        costConfirmedAt: cleanText(record.costConfirmedAt),
        costConfirmedBy: cleanText(record.costConfirmedBy),
        lossCalibrationId: cleanText(record.lossCalibrationId),
        lossRatePercent: toNumber(record.lossRatePercent, 0),
        lossCalibratedAt: cleanText(record.lossCalibratedAt),
        lossCalibratedBy: cleanText(record.lossCalibratedBy),
        marginSnapshotId: cleanText(record.marginSnapshotId),
        marginReportId: cleanText(record.marginReportId),
        marginReviewedAt: cleanText(record.marginReviewedAt),
        marginReviewedBy: cleanText(record.marginReviewedBy),
      })).filter((record) => record.issueRecordId)
    : [];
  item.rawMaterialConsumptionRecords = Array.isArray(item.rawMaterialConsumptionRecords)
    ? item.rawMaterialConsumptionRecords.map((record) => ({
        ...record,
        consumptionRecordId: cleanText(record.consumptionRecordId ?? record.id),
        issueRecordId: cleanText(record.issueRecordId),
        rollId: cleanText(record.rollId),
        machineId: cleanText(record.machineId),
        productionTaskId: cleanText(record.productionTaskId),
        consumptionStatus: cleanText(record.consumptionStatus),
        consumedWeightKg: toNumber(record.consumedWeightKg, 0),
        consumedQuantity: toNumber(record.consumedQuantity, 0),
        consumedFromWeightKg: toNumber(record.consumedFromWeightKg, 0),
        remainingMachineSideWeightKg: toNumber(record.remainingMachineSideWeightKg, 0),
        partialConsumption: Boolean(record.partialConsumption),
        unit: cleanText(record.unit),
        confirmedAt: cleanText(record.confirmedAt),
        confirmedBy: cleanText(record.confirmedBy),
        costAllocationStatus: cleanText(record.costAllocationStatus),
        costAllocationDraftId: cleanText(record.costAllocationDraftId),
        allocatedCostAmount: toNumber(record.allocatedCostAmount, 0),
        allocatedWeightKg: toNumber(record.allocatedWeightKg, 0),
        allocatedQuantity: toNumber(record.allocatedQuantity, 0),
        costConfirmationId: cleanText(record.costConfirmationId),
        confirmedCostAmount: toNumber(record.confirmedCostAmount, 0),
        costConfirmedAt: cleanText(record.costConfirmedAt),
        costConfirmedBy: cleanText(record.costConfirmedBy),
        lossCalibrationId: cleanText(record.lossCalibrationId),
        lossRatePercent: toNumber(record.lossRatePercent, 0),
        lossCalibratedAt: cleanText(record.lossCalibratedAt),
        lossCalibratedBy: cleanText(record.lossCalibratedBy),
        marginSnapshotId: cleanText(record.marginSnapshotId),
        marginReportId: cleanText(record.marginReportId),
        marginReviewedAt: cleanText(record.marginReviewedAt),
        marginReviewedBy: cleanText(record.marginReviewedBy),
      })).filter((record) => record.consumptionRecordId)
    : [];
  item.rawMaterialLeftoverReturnRecords = Array.isArray(item.rawMaterialLeftoverReturnRecords)
    ? item.rawMaterialLeftoverReturnRecords.map((record) => ({
        ...record,
        leftoverReturnRecordId: cleanText(record.leftoverReturnRecordId ?? record.id),
        issueRecordId: cleanText(record.issueRecordId),
        rollId: cleanText(record.rollId),
        machineId: cleanText(record.machineId),
        productionTaskId: cleanText(record.productionTaskId),
        consumptionStatus: cleanText(record.consumptionStatus),
        issuedWeightKg: toNumber(record.issuedWeightKg, 0),
        machineSideWeightKg: toNumber(record.machineSideWeightKg, 0),
        leftoverWeightKg: toNumber(record.leftoverWeightKg, 0),
        leftoverQuantity: toNumber(record.leftoverQuantity, 0),
        unit: cleanText(record.unit),
        returnLocation: cleanText(record.returnLocation),
        returnedAt: cleanText(record.returnedAt),
        returnedBy: cleanText(record.returnedBy),
        leftoverReviewRecordId: cleanText(record.leftoverReviewRecordId),
        reviewStatus: cleanText(record.reviewStatus),
        reviewedAt: cleanText(record.reviewedAt),
        reviewedBy: cleanText(record.reviewedBy),
      })).filter((record) => record.leftoverReturnRecordId)
    : [];
  item.rawMaterialLeftoverReviewRecords = Array.isArray(item.rawMaterialLeftoverReviewRecords)
    ? item.rawMaterialLeftoverReviewRecords.map((record) => ({
        ...record,
        leftoverReviewRecordId: cleanText(record.leftoverReviewRecordId ?? record.id),
        leftoverReturnRecordId: cleanText(record.leftoverReturnRecordId),
        issueRecordId: cleanText(record.issueRecordId),
        rollId: cleanText(record.rollId),
        reviewStatus: cleanText(record.reviewStatus),
        returnedWeightKg: toNumber(record.returnedWeightKg, 0),
        returnedQuantity: toNumber(record.returnedQuantity, 0),
        reviewedWeightKg: toNumber(record.reviewedWeightKg, 0),
        reviewedQuantity: toNumber(record.reviewedQuantity, 0),
        unit: cleanText(record.unit),
        reviewLocation: cleanText(record.reviewLocation),
        reviewedAt: cleanText(record.reviewedAt),
        reviewedBy: cleanText(record.reviewedBy),
      })).filter((record) => record.leftoverReviewRecordId)
    : [];
  item.rawMaterialSplitRecords = Array.isArray(item.rawMaterialSplitRecords)
    ? item.rawMaterialSplitRecords.map((record) => ({
        ...record,
        splitRecordId: cleanText(record.splitRecordId ?? record.id),
        sourceRollId: cleanText(record.sourceRollId),
        issuedRollId: cleanText(record.issuedRollId),
        splitMode: cleanText(record.splitMode),
        sourceWeightKg: toNumber(record.sourceWeightKg, 0),
        issuedWeightKg: toNumber(record.issuedWeightKg, 0),
        remainingWeightKg: toNumber(record.remainingWeightKg, 0),
        unit: cleanText(record.unit),
        machineId: cleanText(record.machineId),
        productionTaskId: cleanText(record.productionTaskId),
        productionTaskMatchStatus: cleanText(record.productionTaskMatchStatus),
        productionTaskMatchReason: cleanText(record.productionTaskMatchReason),
        productionTaskOrderLineId: cleanText(record.productionTaskOrderLineId),
        productionTaskMachineId: cleanText(record.productionTaskMachineId),
        productionTaskGoodsSpec: cleanText(record.productionTaskGoodsSpec),
        splitAt: cleanText(record.splitAt),
        splitBy: cleanText(record.splitBy),
      })).filter((record) => record.splitRecordId)
    : [];
}

function normalizeRawMaterialCostHistory(item) {
  item.rawMaterialCostAllocationDrafts = Array.isArray(item.rawMaterialCostAllocationDrafts)
    ? item.rawMaterialCostAllocationDrafts.map((record) => ({
        ...record,
        costAllocationDraftId: cleanText(record.costAllocationDraftId ?? record.id),
        inboundId: cleanText(record.inboundId),
        consumptionRecordId: cleanText(record.consumptionRecordId),
        issueRecordId: cleanText(record.issueRecordId),
        rollId: cleanText(record.rollId),
        sourceRollId: cleanText(record.sourceRollId),
        splitRecordId: cleanText(record.splitRecordId),
        materialType: cleanText(record.materialType),
        productName: cleanText(record.productName),
        spec: cleanText(record.spec),
        factoryColor: cleanText(record.factoryColor),
        unit: cleanText(record.unit),
        unitPrice: toNumber(record.unitPrice, 0),
        allocatedWeightKg: toNumber(record.allocatedWeightKg, 0),
        allocatedQuantity: toNumber(record.allocatedQuantity, 0),
        allocatedCostAmount: toNumber(record.allocatedCostAmount, 0),
        productionTaskId: cleanText(record.productionTaskId),
        orderLineId: cleanText(record.orderLineId),
        productionTaskMachineId: cleanText(record.productionTaskMachineId),
        productionTaskGoodsSpec: cleanText(record.productionTaskGoodsSpec),
        allocationBasis: cleanText(record.allocationBasis),
        allocationStatus: cleanText(record.allocationStatus),
        costEffect: cleanText(record.costEffect),
        marginEffect: cleanText(record.marginEffect),
        lossCalibrationStatus: cleanText(record.lossCalibrationStatus),
        generatedBy: cleanText(record.generatedBy),
        generatedByUserId: cleanText(record.generatedByUserId),
        generatedAt: cleanText(record.generatedAt),
        confirmedCostAmount: toNumber(record.confirmedCostAmount, 0),
        confirmedBy: cleanText(record.confirmedBy),
        confirmedByUserId: cleanText(record.confirmedByUserId),
        confirmedAt: cleanText(record.confirmedAt),
        costConfirmationId: cleanText(record.costConfirmationId),
        reviewNote: cleanText(record.reviewNote),
        lossCalibrationId: cleanText(record.lossCalibrationId),
        lossRatePercent: toNumber(record.lossRatePercent, 0),
        calibratedCostAmount: toNumber(record.calibratedCostAmount, 0),
        calibratedBy: cleanText(record.calibratedBy),
        calibratedAt: cleanText(record.calibratedAt),
        marginSnapshotId: cleanText(record.marginSnapshotId),
        marginSnapshotStatus: cleanText(record.marginSnapshotStatus),
        marginSnapshotGeneratedBy: cleanText(record.marginSnapshotGeneratedBy),
        marginSnapshotGeneratedAt: cleanText(record.marginSnapshotGeneratedAt),
        marginReportId: cleanText(record.marginReportId),
        marginReviewStatus: cleanText(record.marginReviewStatus),
        marginReviewedBy: cleanText(record.marginReviewedBy),
        marginReviewedAt: cleanText(record.marginReviewedAt),
        note: cleanText(record.note),
      })).filter((record) => record.costAllocationDraftId)
    : [];
  item.rawMaterialCostAllocationConfirmations = Array.isArray(item.rawMaterialCostAllocationConfirmations)
    ? item.rawMaterialCostAllocationConfirmations.map((record) => ({
        ...record,
        costConfirmationId: cleanText(record.costConfirmationId ?? record.id),
        inboundId: cleanText(record.inboundId),
        supplierName: cleanText(record.supplierName),
        deliveryNoteNo: cleanText(record.deliveryNoteNo),
        costAllocationDraftIds: Array.isArray(record.costAllocationDraftIds) ? record.costAllocationDraftIds.map(cleanText).filter(Boolean) : [],
        consumptionRecordIds: Array.isArray(record.consumptionRecordIds) ? record.consumptionRecordIds.map(cleanText).filter(Boolean) : [],
        issueRecordIds: Array.isArray(record.issueRecordIds) ? record.issueRecordIds.map(cleanText).filter(Boolean) : [],
        productionTaskIds: Array.isArray(record.productionTaskIds) ? record.productionTaskIds.map(cleanText).filter(Boolean) : [],
        orderLineIds: Array.isArray(record.orderLineIds) ? record.orderLineIds.map(cleanText).filter(Boolean) : [],
        confirmedCount: toNumber(record.confirmedCount, 0),
        confirmedWeightKg: toNumber(record.confirmedWeightKg, 0),
        confirmedQuantity: toNumber(record.confirmedQuantity, 0),
        confirmedCostAmount: toNumber(record.confirmedCostAmount, 0),
        reviewStatus: cleanText(record.reviewStatus),
        costEffect: cleanText(record.costEffect),
        marginEffect: cleanText(record.marginEffect),
        lossCalibrationStatus: cleanText(record.lossCalibrationStatus),
        lossCalibrationId: cleanText(record.lossCalibrationId),
        lossRatePercent: toNumber(record.lossRatePercent, 0),
        calibratedBy: cleanText(record.calibratedBy),
        calibratedAt: cleanText(record.calibratedAt),
        marginSnapshotId: cleanText(record.marginSnapshotId),
        marginSnapshotStatus: cleanText(record.marginSnapshotStatus),
        marginSnapshotGeneratedBy: cleanText(record.marginSnapshotGeneratedBy),
        marginSnapshotGeneratedAt: cleanText(record.marginSnapshotGeneratedAt),
        marginReportId: cleanText(record.marginReportId),
        marginReviewStatus: cleanText(record.marginReviewStatus),
        marginReviewedBy: cleanText(record.marginReviewedBy),
        marginReviewedAt: cleanText(record.marginReviewedAt),
        confirmedBy: cleanText(record.confirmedBy),
        confirmedByUserId: cleanText(record.confirmedByUserId),
        confirmedAt: cleanText(record.confirmedAt),
        note: cleanText(record.note),
      })).filter((record) => record.costConfirmationId)
    : [];
  item.rawMaterialCostLossCalibrations = Array.isArray(item.rawMaterialCostLossCalibrations)
    ? item.rawMaterialCostLossCalibrations.map((record) => ({
        ...record,
        lossCalibrationId: cleanText(record.lossCalibrationId ?? record.id),
        inboundId: cleanText(record.inboundId),
        supplierName: cleanText(record.supplierName),
        deliveryNoteNo: cleanText(record.deliveryNoteNo),
        costConfirmationId: cleanText(record.costConfirmationId),
        costConfirmationIds: Array.isArray(record.costConfirmationIds) ? record.costConfirmationIds.map(cleanText).filter(Boolean) : [],
        costAllocationDraftIds: Array.isArray(record.costAllocationDraftIds) ? record.costAllocationDraftIds.map(cleanText).filter(Boolean) : [],
        consumptionRecordIds: Array.isArray(record.consumptionRecordIds) ? record.consumptionRecordIds.map(cleanText).filter(Boolean) : [],
        issueRecordIds: Array.isArray(record.issueRecordIds) ? record.issueRecordIds.map(cleanText).filter(Boolean) : [],
        productionTaskIds: Array.isArray(record.productionTaskIds) ? record.productionTaskIds.map(cleanText).filter(Boolean) : [],
        orderLineIds: Array.isArray(record.orderLineIds) ? record.orderLineIds.map(cleanText).filter(Boolean) : [],
        confirmedCount: toNumber(record.confirmedCount, 0),
        confirmedWeightKg: toNumber(record.confirmedWeightKg, 0),
        confirmedQuantity: toNumber(record.confirmedQuantity, 0),
        confirmedCostAmount: toNumber(record.confirmedCostAmount, 0),
        expectedOutputQuantity: toNumber(record.expectedOutputQuantity, 0),
        actualQualifiedOutputQuantity: toNumber(record.actualQualifiedOutputQuantity, 0),
        lossQuantity: toNumber(record.lossQuantity, 0),
        lossRatePercent: toNumber(record.lossRatePercent, 0),
        calibrationBasis: cleanText(record.calibrationBasis),
        calibrationStatus: cleanText(record.calibrationStatus),
        costEffect: cleanText(record.costEffect),
        marginEffect: cleanText(record.marginEffect),
        marginSnapshotId: cleanText(record.marginSnapshotId),
        marginSnapshotStatus: cleanText(record.marginSnapshotStatus),
        marginSnapshotGeneratedBy: cleanText(record.marginSnapshotGeneratedBy),
        marginSnapshotGeneratedAt: cleanText(record.marginSnapshotGeneratedAt),
        marginReportId: cleanText(record.marginReportId),
        marginReviewStatus: cleanText(record.marginReviewStatus),
        marginReviewedBy: cleanText(record.marginReviewedBy),
        marginReviewedAt: cleanText(record.marginReviewedAt),
        calibratedBy: cleanText(record.calibratedBy),
        calibratedAt: cleanText(record.calibratedAt),
        note: cleanText(record.note),
      })).filter((record) => record.lossCalibrationId)
    : [];
}

function normalizeRawMaterialMarginHistory(item) {
  item.rawMaterialOrderMarginSnapshots = Array.isArray(item.rawMaterialOrderMarginSnapshots)
    ? item.rawMaterialOrderMarginSnapshots.map((record) => ({
        ...record,
        marginSnapshotId: cleanText(record.marginSnapshotId ?? record.id),
        inboundId: cleanText(record.inboundId),
        supplierName: cleanText(record.supplierName),
        deliveryNoteNo: cleanText(record.deliveryNoteNo),
        lossCalibrationIds: Array.isArray(record.lossCalibrationIds) ? record.lossCalibrationIds.map(cleanText).filter(Boolean) : [],
        costConfirmationIds: Array.isArray(record.costConfirmationIds) ? record.costConfirmationIds.map(cleanText).filter(Boolean) : [],
        costAllocationDraftIds: Array.isArray(record.costAllocationDraftIds) ? record.costAllocationDraftIds.map(cleanText).filter(Boolean) : [],
        consumptionRecordIds: Array.isArray(record.consumptionRecordIds) ? record.consumptionRecordIds.map(cleanText).filter(Boolean) : [],
        issueRecordIds: Array.isArray(record.issueRecordIds) ? record.issueRecordIds.map(cleanText).filter(Boolean) : [],
        productionTaskIds: Array.isArray(record.productionTaskIds) ? record.productionTaskIds.map(cleanText).filter(Boolean) : [],
        orderLineIds: Array.isArray(record.orderLineIds) ? record.orderLineIds.map(cleanText).filter(Boolean) : [],
        lineItems: Array.isArray(record.lineItems)
          ? record.lineItems.map((line) => ({
              ...line,
              orderLineId: cleanText(line.orderLineId),
              orderNo: cleanText(line.orderNo),
              customerId: cleanText(line.customerId),
              customerName: cleanText(line.customerName),
              productName: cleanText(line.productName),
              goodsSpec: cleanText(line.goodsSpec),
              quantity: toNumber(line.quantity, 0),
              salesAmount: toNumber(line.salesAmount, 0),
              materialCostAmount: toNumber(line.materialCostAmount, 0),
              grossProfitAmount: toNumber(line.grossProfitAmount, 0),
              grossMarginRatePercent: toNumber(line.grossMarginRatePercent, 0),
              marginStatus: cleanText(line.marginStatus),
              marginSnapshotId: cleanText(line.marginSnapshotId),
              costAllocationDraftIds: Array.isArray(line.costAllocationDraftIds) ? line.costAllocationDraftIds.map(cleanText).filter(Boolean) : [],
              productionTaskIds: Array.isArray(line.productionTaskIds) ? line.productionTaskIds.map(cleanText).filter(Boolean) : [],
            })).filter((line) => line.orderLineId)
          : [],
        totalSalesAmount: toNumber(record.totalSalesAmount, 0),
        totalMaterialCostAmount: toNumber(record.totalMaterialCostAmount, 0),
        grossProfitAmount: toNumber(record.grossProfitAmount, 0),
        grossMarginRatePercent: toNumber(record.grossMarginRatePercent, 0),
        reviewStatus: cleanText(record.reviewStatus),
        reportStatus: cleanText(record.reportStatus),
        costEffect: cleanText(record.costEffect),
        marginEffect: cleanText(record.marginEffect),
        marginReportId: cleanText(record.marginReportId),
        generatedBy: cleanText(record.generatedBy),
        generatedAt: cleanText(record.generatedAt),
        reviewedBy: cleanText(record.reviewedBy),
        reviewedAt: cleanText(record.reviewedAt),
        note: cleanText(record.note),
        warnings: Array.isArray(record.warnings) ? record.warnings.map(cleanText).filter(Boolean) : [],
      })).filter((record) => record.marginSnapshotId)
    : [];
  item.rawMaterialOrderMarginReports = Array.isArray(item.rawMaterialOrderMarginReports)
    ? item.rawMaterialOrderMarginReports.map((record) => ({
        ...record,
        marginReportId: cleanText(record.marginReportId ?? record.id),
        inboundId: cleanText(record.inboundId),
        supplierName: cleanText(record.supplierName),
        deliveryNoteNo: cleanText(record.deliveryNoteNo),
        marginSnapshotIds: Array.isArray(record.marginSnapshotIds) ? record.marginSnapshotIds.map(cleanText).filter(Boolean) : [],
        lossCalibrationIds: Array.isArray(record.lossCalibrationIds) ? record.lossCalibrationIds.map(cleanText).filter(Boolean) : [],
        costConfirmationIds: Array.isArray(record.costConfirmationIds) ? record.costConfirmationIds.map(cleanText).filter(Boolean) : [],
        costAllocationDraftIds: Array.isArray(record.costAllocationDraftIds) ? record.costAllocationDraftIds.map(cleanText).filter(Boolean) : [],
        consumptionRecordIds: Array.isArray(record.consumptionRecordIds) ? record.consumptionRecordIds.map(cleanText).filter(Boolean) : [],
        issueRecordIds: Array.isArray(record.issueRecordIds) ? record.issueRecordIds.map(cleanText).filter(Boolean) : [],
        productionTaskIds: Array.isArray(record.productionTaskIds) ? record.productionTaskIds.map(cleanText).filter(Boolean) : [],
        orderLineIds: Array.isArray(record.orderLineIds) ? record.orderLineIds.map(cleanText).filter(Boolean) : [],
        lineItems: Array.isArray(record.lineItems)
          ? record.lineItems.map((line) => ({
              ...line,
              marginSnapshotId: cleanText(line.marginSnapshotId),
              orderLineId: cleanText(line.orderLineId),
              orderNo: cleanText(line.orderNo),
              customerId: cleanText(line.customerId),
              customerName: cleanText(line.customerName),
              productName: cleanText(line.productName),
              goodsSpec: cleanText(line.goodsSpec),
              quantity: toNumber(line.quantity, 0),
              salesAmount: toNumber(line.salesAmount, 0),
              materialCostAmount: toNumber(line.materialCostAmount, 0),
              grossProfitAmount: toNumber(line.grossProfitAmount, 0),
              grossMarginRatePercent: toNumber(line.grossMarginRatePercent, 0),
              marginStatus: cleanText(line.marginStatus),
              costAllocationDraftIds: Array.isArray(line.costAllocationDraftIds) ? line.costAllocationDraftIds.map(cleanText).filter(Boolean) : [],
              productionTaskIds: Array.isArray(line.productionTaskIds) ? line.productionTaskIds.map(cleanText).filter(Boolean) : [],
            })).filter((line) => line.orderLineId)
          : [],
        totalSalesAmount: toNumber(record.totalSalesAmount, 0),
        totalMaterialCostAmount: toNumber(record.totalMaterialCostAmount, 0),
        grossProfitAmount: toNumber(record.grossProfitAmount, 0),
        grossMarginRatePercent: toNumber(record.grossMarginRatePercent, 0),
        reviewStatus: cleanText(record.reviewStatus),
        reportStatus: cleanText(record.reportStatus),
        costEffect: cleanText(record.costEffect),
        marginEffect: cleanText(record.marginEffect),
        reviewedBy: cleanText(record.reviewedBy),
        reviewedAt: cleanText(record.reviewedAt),
        note: cleanText(record.note),
        warnings: Array.isArray(record.warnings) ? record.warnings.map(cleanText).filter(Boolean) : [],
      })).filter((record) => record.marginReportId)
    : [];
}

function normalizeOcrPages(pages, pageCount, imageWidth, imageHeight, angle) {
  const source = Array.isArray(pages) ? pages : [];
  return Array.from({ length: Math.max(pageCount, source.length) }, (_, sourcePageIndex) => ({
    sourcePageIndex,
    pageNumber: sourcePageIndex + 1,
    angle: Number(source[sourcePageIndex]?.angle ?? angle) || 0,
    imageWidth: Math.max(0, Number(source[sourcePageIndex]?.imageWidth ?? imageWidth) || 0),
    imageHeight: Math.max(0, Number(source[sourcePageIndex]?.imageHeight ?? imageHeight) || 0),
    requestId: cleanText(source[sourcePageIndex]?.requestId),
  }));
}

function normalizeTextList(values, fallback) {
  const normalized = (Array.isArray(values) ? values : []).map(cleanText).filter(Boolean);
  if (normalized.length) return normalized;
  const safeFallback = cleanText(fallback);
  return safeFallback ? [safeFallback] : [];
}

function toNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function cleanText(value) {
  return String(value ?? "").trim();
}
