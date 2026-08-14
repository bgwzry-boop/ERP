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
  normalizeRawMaterialLeftoverReturnRecords,
  normalizeRawMaterialLeftoverReviewRecords,
  normalizeRawMaterialSplitRecords,
} from "./rawMaterialTraceabilityRecordNormalizer.mjs";
import { normalizeRawMaterialOcrMetadata } from "./rawMaterialInboundOcrSupport.mjs";
import { calculateRawMaterialOrderRequirement } from "../shared/rawMaterialInventorySupport.js";

export function resolveRawMaterialProductionTaskMatch(input = {}) {
  const workspace = input.workspace ?? {};
  const inbound = input.inbound ?? {};
  const productionTaskId = cleanText(input.productionTaskId);
  const issueMachineId = cleanText(input.machineId);
  if (!productionTaskId) {
    return {
      status: "首发阶段未关联任务",
      reason: "原材料独立首发阶段按卷扫码出库，只记录机台和原料事实，暂不关联订单或生产任务。",
      orderLineId: "",
      machineId: "",
      goodsSpec: "",
    };
  }

  const productionTask = findRawMaterialProductionTask(workspace, productionTaskId);
  if (!productionTask) {
    throw Object.assign(new Error(`Raw-material issue production task not found: ${productionTaskId}`), {
      statusCode: 422,
      code: "RAW_MATERIAL_PRODUCTION_TASK_NOT_FOUND",
    });
  }

  const taskMachineId = cleanText(productionTask.machineId ?? productionTask.machine_id);
  if (
    issueMachineId &&
    taskMachineId &&
    normalizeRawMaterialMachineId(issueMachineId) !== normalizeRawMaterialMachineId(taskMachineId)
  ) {
    throw Object.assign(
      new Error(`Raw-material issue machine ${issueMachineId} does not match production task machine ${taskMachineId}`),
      { statusCode: 422, code: "RAW_MATERIAL_PRODUCTION_TASK_MACHINE_MISMATCH" },
    );
  }

  const orderLineId = cleanText(productionTask.orderLineId ?? productionTask.order_line_id ?? productionTask.lineId);
  const orderLine = findRawMaterialOrderLine(workspace, orderLineId);
  if (!orderLineId || !orderLine) {
    throw Object.assign(new Error(`Raw-material issue production task has no order line: ${productionTaskId}`), {
      statusCode: 422,
      code: "RAW_MATERIAL_PRODUCTION_TASK_ORDER_LINE_NOT_FOUND",
    });
  }

  const materialType = cleanText(inbound.materialType);
  const productName = cleanText(inbound.productName);
  const factoryColor = cleanText(inbound.factoryColor ?? inbound.supplierColor);
  const taskBagColor = cleanText(orderLine.bagColor ?? orderLine.bag_color ?? orderLine.color);
  const materialColorKey = normalizeRawMaterialColorKey(factoryColor);
  const taskBagColorKey = normalizeRawMaterialColorKey(taskBagColor);
  const goodsSpec = buildRawMaterialProductionTaskGoodsSpec(productionTask, orderLine);
  const materialWidthCm = Number(inbound.widthCm) || 0;
  const orderRequirement = calculateRawMaterialOrderRequirement({
    ...orderLine,
    plannedQty: productionTask.plannedQty ?? productionTask.planned_qty ?? productionTask.qty,
  });

  if (
    isRawMaterialBagBodyMaterial(materialType, productName) &&
    materialWidthCm > 0 &&
    orderRequirement.requiredWidthCm > 0 &&
    materialWidthCm !== orderRequirement.requiredWidthCm
  ) {
    throw Object.assign(
      new Error(`Raw-material width ${materialWidthCm}cm does not match production task required width ${orderRequirement.requiredWidthCm}cm`),
      { statusCode: 422, code: "RAW_MATERIAL_PRODUCTION_TASK_WIDTH_MISMATCH" },
    );
  }

  if (
    isRawMaterialBagBodyMaterial(materialType, productName) &&
    materialColorKey &&
    taskBagColorKey &&
    materialColorKey !== taskBagColorKey
  ) {
    throw Object.assign(
      new Error(`Raw-material color ${factoryColor} does not match production task bag color ${taskBagColor}`),
      { statusCode: 422, code: "RAW_MATERIAL_PRODUCTION_TASK_COLOR_MISMATCH" },
    );
  }

  if (isRawMaterialHandleMaterial(materialType, productName)) {
    return {
      status: "需复核",
      reason: "生产任务已关联；提手颜色和提手类型仍需按现场实物或订单备注人工复核。",
      orderLineId,
      machineId: taskMachineId,
      goodsSpec,
    };
  }

  return {
    status: "已匹配",
    reason: "生产任务存在，机台一致，布料颜色与订单袋色一致；仍不生成成品数量或成本分摊。",
    orderLineId,
    machineId: taskMachineId,
    goodsSpec,
  };
}

export function findRawMaterialProductionTask(workspace = {}, productionTaskId = "") {
  const id = cleanText(productionTaskId);
  if (!id) return null;
  return (workspace.productionTasks ?? []).find((task) => cleanText(task?.productionTaskId ?? task?.production_task_id ?? task?.id) === id) ?? null;
}

export function findRawMaterialOrderLine(workspace = {}, orderLineId = "") {
  const id = cleanText(orderLineId);
  if (!id) return null;
  return (workspace.orderLines ?? []).find((line) => cleanText(line?.orderLineId ?? line?.order_line_id ?? line?.id) === id) ?? null;
}

export function findRawMaterialCustomer(workspace = {}, customerId = "") {
  const id = cleanText(customerId);
  if (!id) return null;
  return (workspace.customers ?? []).find((customer) => cleanText(customer?.id ?? customer?.customerId ?? customer?.customer_id) === id) ?? null;
}

export function normalizeRawMaterialMachineId(value) {
  const text = cleanText(value).toUpperCase();
  if (!text) return "";
  if (text === "制袋机-01" || text === "制袋-01" || text === "1号制袋机") return "BAG-01";
  if (text === "丝印机-01" || text === "丝印-01" || text === "1号丝印机") return "PRINT-01";
  return text;
}

export function normalizeRawMaterialColorKey(value) {
  const text = cleanText(value)
    .replace(/本白/g, "白")
    .replace(/大红/g, "红")
    .replace(/浅黄/g, "黄")
    .replace(/深黄/g, "黄")
    .replace(/色/g, "")
    .replace(/\s+/g, "");
  if (!text) return "";
  const colorMap = [["白", "白"], ["黑", "黑"], ["红", "红"], ["黄", "黄"], ["蓝", "蓝"], ["绿", "绿"], ["灰", "灰"], ["粉", "粉"], ["紫", "紫"], ["橙", "橙"]];
  return colorMap.find(([token]) => text.includes(token))?.[1] ?? text;
}

export function buildRawMaterialProductionTaskGoodsSpec(productionTask = {}, orderLine = {}) {
  const productName = cleanText(orderLine.productName ?? orderLine.product_name ?? orderLine.product) || "生产任务";
  const size = cleanText(orderLine.size);
  const color = cleanText(orderLine.bagColor ?? orderLine.bag_color ?? orderLine.color);
  const qty = Number(productionTask.plannedQty ?? productionTask.planned_qty ?? productionTask.qty ?? orderLine.qty ?? orderLine.originalQty ?? 0) || 0;
  return [productName, size, color, qty ? `${qty}个` : ""].filter(Boolean).join(" ");
}

export function normalizeRawMaterialInbounds(inbounds = []) {
  return (Array.isArray(inbounds) ? inbounds : []).map(normalizeRawMaterialInbound).filter((item) => item?.id);
}

export function normalizeRawMaterialInbound(input = {}) {
  if (!input || typeof input !== "object") return null;
  const item = { ...input };
  item.id = cleanText(item.id);
  item.revision = Math.max(1, Number(item.revision) || 1);
  item.supplierName = cleanText(item.supplierName);
  item.deliveryNoteNo = cleanText(item.deliveryNoteNo);
  item.spec = cleanText(item.spec);
  item.specRaw = cleanText(item.specRaw || item.spec);
  item.specDisplay = cleanText(item.specDisplay || item.spec);
  item.gramWeightGsm = Number(item.gramWeightGsm) || 0;
  item.widthCm = Number(item.widthCm) || 0;
  item.lengthM = Number(item.lengthM) || 0;
  item.materialCategory = cleanText(item.materialCategory);
  item.specNeedsReview = item.specNeedsReview === true;
  item.specReviewReason = cleanText(item.specReviewReason);
  item.status = cleanText(item.status) || "已识别待复核";
  item.nextStep = normalizeRawMaterialNextStep(item.nextStep, item.status);
  if (["待上传签单信息", "待扫码/签单", "待贴标扫码上传"].includes(cleanText(item.signedNoteStatus))) {
    item.signedNoteStatus = "单据附件可选，未作为入库门禁";
  }
  normalizeRawMaterialOcrMetadata(item);
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
  item.costAllocationDraftCount = Number(item.costAllocationDraftCount) || 0;
  item.costAllocationDraftAmount = Number(item.costAllocationDraftAmount) || 0;
  item.costAllocationReviewStatus = cleanText(item.costAllocationReviewStatus);
  item.costAllocationConfirmedBy = cleanText(item.costAllocationConfirmedBy);
  item.costAllocationConfirmedByUserId = cleanText(item.costAllocationConfirmedByUserId);
  item.costAllocationConfirmedAt = cleanText(item.costAllocationConfirmedAt);
  item.costAllocationConfirmedCount = Number(item.costAllocationConfirmedCount) || 0;
  item.costAllocationConfirmedAmount = Number(item.costAllocationConfirmedAmount) || 0;
  item.costAllocationConfirmationId = cleanText(item.costAllocationConfirmationId);
  item.lossCalibrationStatus = cleanText(item.lossCalibrationStatus);
  item.lossCalibratedBy = cleanText(item.lossCalibratedBy);
  item.lossCalibratedByUserId = cleanText(item.lossCalibratedByUserId);
  item.lossCalibratedAt = cleanText(item.lossCalibratedAt);
  item.lossCalibrationCount = Number(item.lossCalibrationCount) || 0;
  item.lossCalibrationId = cleanText(item.lossCalibrationId);
  item.lossCalibrationRatePercent = Number(item.lossCalibrationRatePercent) || 0;
  item.lossCalibrationActualOutputQuantity = Number(item.lossCalibrationActualOutputQuantity) || 0;
  item.lossCalibrationExpectedOutputQuantity = Number(item.lossCalibrationExpectedOutputQuantity) || 0;
  item.lossCalibrationAmount = Number(item.lossCalibrationAmount) || 0;
  item.marginSnapshotStatus = cleanText(item.marginSnapshotStatus);
  item.marginSnapshotCount = Number(item.marginSnapshotCount) || 0;
  item.marginSnapshotId = cleanText(item.marginSnapshotId);
  item.marginSnapshotTotalSalesAmount = Number(item.marginSnapshotTotalSalesAmount) || 0;
  item.marginSnapshotMaterialCostAmount = Number(item.marginSnapshotMaterialCostAmount) || 0;
  item.marginSnapshotGrossProfitAmount = Number(item.marginSnapshotGrossProfitAmount) || 0;
  item.marginSnapshotGrossMarginRatePercent = Number(item.marginSnapshotGrossMarginRatePercent) || 0;
  item.marginSnapshotGeneratedBy = cleanText(item.marginSnapshotGeneratedBy);
  item.marginSnapshotGeneratedByUserId = cleanText(item.marginSnapshotGeneratedByUserId);
  item.marginSnapshotGeneratedAt = cleanText(item.marginSnapshotGeneratedAt);
  item.marginReportStatus = cleanText(item.marginReportStatus);
  item.marginReportCount = Number(item.marginReportCount) || 0;
  item.marginReportId = cleanText(item.marginReportId);
  item.marginReportTotalSalesAmount = Number(item.marginReportTotalSalesAmount) || 0;
  item.marginReportMaterialCostAmount = Number(item.marginReportMaterialCostAmount) || 0;
  item.marginReportGrossProfitAmount = Number(item.marginReportGrossProfitAmount) || 0;
  item.marginReportGrossMarginRatePercent = Number(item.marginReportGrossMarginRatePercent) || 0;
  item.marginReviewedBy = cleanText(item.marginReviewedBy);
  item.marginReviewedByUserId = cleanText(item.marginReviewedByUserId);
  item.marginReviewedAt = cleanText(item.marginReviewedAt);
  item.rawMaterialCostAllocationWarnings = normalizeRawMaterialCostAllocationWarnings(item.rawMaterialCostAllocationWarnings);
  item.rolls = (Array.isArray(item.rolls) ? item.rolls : []).map((roll) => ({
    ...roll,
    productName: cleanText(roll.productName), materialType: cleanText(roll.materialType), supplierColor: cleanText(roll.supplierColor),
    spec: cleanText(roll.spec), specRaw: cleanText(roll.specRaw || roll.spec), specDisplay: cleanText(roll.specDisplay || roll.spec),
    gramWeightGsm: Number(roll.gramWeightGsm) || 0, widthCm: Number(roll.widthCm) || 0, lengthM: Number(roll.lengthM) || 0,
    unitPrice: Number(roll.unitPrice) || 0,
    materialCategory: cleanText(roll.materialCategory), specNeedsReview: roll.specNeedsReview === true,
    specReviewReason: cleanText(roll.specReviewReason),
    id: cleanText(roll.id), supplierRollNo: cleanText(roll.supplierRollNo), weightKg: Number(roll.weightKg) || 0,
    originalWeightKg: Number(roll.originalWeightKg) || 0, labelStatus: cleanText(roll.labelStatus) || "待生成标签",
    labelVersion: Math.max(0, Number(roll.labelVersion) || 0), labelPrintedAt: cleanText(roll.labelPrintedAt),
    labelPrintedBy: cleanText(roll.labelPrintedBy), labelPrintedByUserId: cleanText(roll.labelPrintedByUserId),
    labelVerifiedAt: cleanText(roll.labelVerifiedAt), labelVerifiedBy: cleanText(roll.labelVerifiedBy),
    labelVerifiedByUserId: cleanText(roll.labelVerifiedByUserId), labelVerification: normalizeRawMaterialLabelVerification(roll.labelVerification),
    labelVoidedAt: cleanText(roll.labelVoidedAt), labelVoidedBy: cleanText(roll.labelVoidedBy),
    labelVoidedByUserId: cleanText(roll.labelVoidedByUserId), labelVoidReason: cleanText(roll.labelVoidReason),
    inventoryStatus: cleanText(roll.inventoryStatus) || "不可用", location: cleanText(roll.location), scannedAt: cleanText(roll.scannedAt),
    signedNoteStatus: ["待上传签单信息", "待扫码/签单"].includes(cleanText(roll.signedNoteStatus))
      ? "入库无需逐卷扫码或签单" : cleanText(roll.signedNoteStatus), parentRollId: cleanText(roll.parentRollId),
    sourceRollId: cleanText(roll.sourceRollId), splitRecordId: cleanText(roll.splitRecordId), splitStatus: cleanText(roll.splitStatus),
    splitAt: cleanText(roll.splitAt), splitBy: cleanText(roll.splitBy), splitByUserId: cleanText(roll.splitByUserId),
    splitIssuedWeightKg: Number(roll.splitIssuedWeightKg) || 0, splitRemainingWeightKg: Number(roll.splitRemainingWeightKg) || 0,
    issueRecordId: cleanText(roll.issueRecordId), issuedAt: cleanText(roll.issuedAt), issuedBy: cleanText(roll.issuedBy),
    issuedByUserId: cleanText(roll.issuedByUserId), machineId: cleanText(roll.machineId), productionTaskId: cleanText(roll.productionTaskId),
    productionTaskMatchStatus: cleanText(roll.productionTaskMatchStatus), productionTaskMatchReason: cleanText(roll.productionTaskMatchReason),
    productionTaskOrderLineId: cleanText(roll.productionTaskOrderLineId), productionTaskMachineId: cleanText(roll.productionTaskMachineId),
    productionTaskGoodsSpec: cleanText(roll.productionTaskGoodsSpec), issuePurpose: cleanText(roll.issuePurpose),
    consumptionStatus: cleanText(roll.consumptionStatus), consumptionRecordId: cleanText(roll.consumptionRecordId),
    consumedAt: cleanText(roll.consumedAt), consumedBy: cleanText(roll.consumedBy), consumedByUserId: cleanText(roll.consumedByUserId),
    lastConsumedWeightKg: Number(roll.lastConsumedWeightKg) || 0, remainingMachineSideWeightKg: Number(roll.remainingMachineSideWeightKg) || 0,
    leftoverReturnRecordId: cleanText(roll.leftoverReturnRecordId), leftoverWeightKg: Number(roll.leftoverWeightKg) || 0,
    leftoverQuantity: Number(roll.leftoverQuantity) || 0, returnedAt: cleanText(roll.returnedAt), returnedBy: cleanText(roll.returnedBy),
    returnedByUserId: cleanText(roll.returnedByUserId), leftoverReviewRecordId: cleanText(roll.leftoverReviewRecordId),
    leftoverReviewedWeightKg: Number(roll.leftoverReviewedWeightKg) || 0, leftoverReviewedQuantity: Number(roll.leftoverReviewedQuantity) || 0,
    leftoverReviewedAt: cleanText(roll.leftoverReviewedAt), leftoverReviewedBy: cleanText(roll.leftoverReviewedBy),
    leftoverReviewedByUserId: cleanText(roll.leftoverReviewedByUserId),
    supplierReturnStatus: cleanText(roll.supplierReturnStatus), supplierReturnRecordId: cleanText(roll.supplierReturnRecordId),
    sourceReturnInboundId: cleanText(roll.sourceReturnInboundId), supplierReturnStagedAt: cleanText(roll.supplierReturnStagedAt),
    supplierReturnStagedBy: cleanText(roll.supplierReturnStagedBy), supplierReturnStagedByUserId: cleanText(roll.supplierReturnStagedByUserId),
    supplierReturnShippedAt: cleanText(roll.supplierReturnShippedAt), supplierReturnShippedBy: cleanText(roll.supplierReturnShippedBy),
    supplierReturnShippedByUserId: cleanText(roll.supplierReturnShippedByUserId),
  }));
  item.supplierReturnStatus = cleanText(item.supplierReturnStatus);
  item.rawMaterialSupplierReturnRecords = normalizeRawMaterialSupplierReturnRecords(item.rawMaterialSupplierReturnRecords);
  item.rawMaterialIssueRecords = normalizeRawMaterialIssueRecords(item.rawMaterialIssueRecords);
  item.rawMaterialConsumptionRecords = normalizeRawMaterialConsumptionRecords(item.rawMaterialConsumptionRecords);
  item.rawMaterialLeftoverReturnRecords = normalizeRawMaterialLeftoverReturnRecords(item.rawMaterialLeftoverReturnRecords);
  item.rawMaterialLeftoverReviewRecords = normalizeRawMaterialLeftoverReviewRecords(item.rawMaterialLeftoverReviewRecords);
  item.rawMaterialSplitRecords = normalizeRawMaterialSplitRecords(item.rawMaterialSplitRecords);
  item.rawMaterialCostAllocationDrafts = normalizeRawMaterialCostAllocationDrafts(item.rawMaterialCostAllocationDrafts);
  item.rawMaterialCostAllocationConfirmations = normalizeRawMaterialCostAllocationConfirmations(item.rawMaterialCostAllocationConfirmations);
  item.rawMaterialCostLossCalibrations = normalizeRawMaterialCostLossCalibrations(item.rawMaterialCostLossCalibrations);
  item.rawMaterialOrderMarginSnapshots = normalizeRawMaterialOrderMarginSnapshots(item.rawMaterialOrderMarginSnapshots);
  item.rawMaterialOrderMarginReports = normalizeRawMaterialOrderMarginReports(item.rawMaterialOrderMarginReports);
  return item;
}

function normalizeRawMaterialSupplierReturnRecords(records = []) {
  return (Array.isArray(records) ? records : []).map((record) => ({
    ...record,
    supplierReturnRecordId: cleanText(record.supplierReturnRecordId),
    sourceReturnInboundId: cleanText(record.sourceReturnInboundId),
    sourceAttachmentId: cleanText(record.sourceAttachmentId),
    sourceDocumentNo: cleanText(record.sourceDocumentNo),
    sourceDocumentDate: cleanText(record.sourceDocumentDate),
    stockInboundId: cleanText(record.stockInboundId),
    rollId: cleanText(record.rollId),
    supplierName: cleanText(record.supplierName),
    weightKg: Math.abs(Number(record.weightKg) || 0),
    status: cleanText(record.status),
    location: cleanText(record.location),
    stagedBy: cleanText(record.stagedBy),
    stagedByUserId: cleanText(record.stagedByUserId),
    stagedAt: cleanText(record.stagedAt),
    shippedBy: cleanText(record.shippedBy),
    shippedByUserId: cleanText(record.shippedByUserId),
    shippedAt: cleanText(record.shippedAt),
    shipmentReferenceNo: cleanText(record.shipmentReferenceNo),
    note: cleanText(record.note),
  })).filter((record) => record.supplierReturnRecordId && record.sourceReturnInboundId && record.rollId);
}

export function normalizeRawMaterialInboundActionResult(value) {
  if (!value || typeof value !== "object") return { inbound: null, operationLogId: "" };
  return { inbound: normalizeRawMaterialInbound(value.inbound), operationLogId: cleanText(value.operationLogId) };
}

function normalizeRawMaterialLabelVerification(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return {
    result: cleanText(value.result),
    resultCode: cleanText(value.resultCode),
    labelVersion: Math.max(0, Number(value.labelVersion) || 0),
    expected: value.expected && typeof value.expected === "object" ? { ...value.expected } : {},
    checked: value.checked && typeof value.checked === "object" ? { ...value.checked } : {},
    location: cleanText(value.location),
    note: cleanText(value.note),
    verifiedBy: cleanText(value.verifiedBy),
    verifiedByUserId: cleanText(value.verifiedByUserId),
    verifiedAt: cleanText(value.verifiedAt),
  };
}

export function normalizeOperationLog(value) {
  if (!value || typeof value !== "object") return null;
  const id = cleanText(value.id);
  if (!id) return null;
  return { id, targetType: cleanText(value.targetType), targetId: cleanText(value.targetId), action: cleanText(value.action), before: value.before ?? {}, after: value.after ?? {}, reason: cleanText(value.reason), operatorId: cleanText(value.operatorId), pageKey: cleanText(value.pageKey) || "rawMaterials", occurredAt: cleanText(value.occurredAt), createdAt: cleanText(value.createdAt) };
}

function isRawMaterialBagBodyMaterial(materialType, productName) {
  const text = `${cleanText(materialType)} ${cleanText(productName)}`;
  return text.includes("布") || text.includes("无纺") || text.includes("卷料");
}

function isRawMaterialHandleMaterial(materialType, productName) {
  return `${cleanText(materialType)} ${cleanText(productName)}`.includes("提手");
}

function cleanText(value) {
  return String(value ?? "").trim();
}

function normalizeRawMaterialNextStep(value, status) {
  const text = cleanText(value);
  if (status === "已打印待贴标" && text.includes("手机扫码") && text.includes("签单")) {
    return "把系统标签贴到对应卷料，逐卷人工核对重量、颜色、规格和库位后才可用。";
  }
  return text
    .replace("贴标扫码后才可用", "逐卷人工贴标核对后才可用")
    .replace("剩余件数继续贴标扫码，未贴标部分不能作为可用原料。", "剩余件数继续逐卷贴标人工核对，未确认部分不能作为可用原料。");
}
