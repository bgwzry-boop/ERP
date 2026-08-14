import { suppliersAreEquivalent } from "./rawMaterialSupplierReturnReconciliationService.mjs";

export function applyStageRawMaterialSupplierReturn(input = {}) {
  const before = input.before ?? {};
  const inbounds = Array.isArray(input.inbounds) ? input.inbounds : [];
  const body = input.body ?? {};
  const operatorId = cleanText(input.operatorId);
  const operatorName = cleanText(input.operatorName);
  const now = cleanText(input.now) || new Date().toISOString();
  if (cleanText(before.documentDirection) === "supplier_return") {
    throw businessError(409, "RAW_MATERIAL_SUPPLIER_RETURN_REQUIRES_STOCK_ROLL", "退货单原件只作为退货和对账证据；请选择已有库存卷码办理实物退厂。");
  }
  const rollId = cleanText(body.rollId);
  const sourceReturnInboundId = cleanText(body.sourceReturnInboundId);
  if (!rollId || !sourceReturnInboundId) {
    throw businessError(422, "RAW_MATERIAL_SUPPLIER_RETURN_LINK_REQUIRED", "供应商退货暂存必须同时扫描库存卷码并关联已复核退货单。");
  }
  const targetRoll = (before.rolls ?? []).find((roll) => cleanText(roll.id) === rollId);
  if (!targetRoll) throw businessError(404, "RAW_MATERIAL_ROLL_NOT_FOUND", `Raw material roll not found: ${rollId}`);
  if (cleanText(targetRoll.inventoryStatus) !== "可用") {
    throw businessError(409, "RAW_MATERIAL_SUPPLIER_RETURN_REQUIRES_AVAILABLE_ROLL", "只有已贴标并确认可用的库存卷/件才能转入供应商退货暂存区。");
  }
  const sourceReturn = inbounds.find((item) => cleanText(item.id) === sourceReturnInboundId);
  if (!sourceReturn || cleanText(sourceReturn.documentDirection) !== "supplier_return" || cleanText(sourceReturn.status) !== "退货单已复核") {
    throw businessError(409, "RAW_MATERIAL_SUPPLIER_RETURN_SOURCE_NOT_REVIEWED", "关联的供应商退货单不存在或尚未完成人工复核。");
  }
  if (!suppliersAreEquivalent(before.supplierName, sourceReturn.supplierName)) {
    throw businessError(409, "RAW_MATERIAL_SUPPLIER_RETURN_SUPPLIER_MISMATCH", "库存卷供应商与退货单供应商不一致，不能办理退厂。");
  }
  const existingRecords = normalizeRawMaterialSupplierReturnRecords(before.rawMaterialSupplierReturnRecords);
  if (existingRecords.some((record) => record.rollId === rollId && record.status !== "已取消")) {
    throw businessError(409, "RAW_MATERIAL_SUPPLIER_RETURN_ALREADY_STAGED", "该库存卷已经进入供应商退货流程，不能重复暂存。");
  }
  validateSupplierReturnPhysicalScope({
    existingRecords: inbounds.flatMap((item) => normalizeRawMaterialSupplierReturnRecords(item.rawMaterialSupplierReturnRecords)),
    sourceReturn,
    targetRoll,
  });
  const supplierReturnRecordId = `RMSRET-${now.slice(0, 10).replaceAll("-", "")}-${Date.now().toString(36).toUpperCase()}`;
  const holdingLocation = cleanText(body.location) || "供应商退货暂存区";
  const supplierReturnRecord = normalizeRawMaterialSupplierReturnRecords([{
    supplierReturnRecordId,
    sourceReturnInboundId,
    sourceAttachmentId: sourceReturn.sourceAttachmentId,
    sourceDocumentNo: sourceReturn.deliveryNoteNo,
    sourceDocumentDate: sourceReturn.receivedAt,
    stockInboundId: before.id,
    rollId,
    supplierName: before.supplierName,
    weightKg: Math.abs(Number(targetRoll.weightKg) || 0),
    status: "供应商退货暂存",
    location: holdingLocation,
    stagedBy: operatorName,
    stagedByUserId: operatorId,
    stagedAt: now,
    note: cleanText(body.note),
  }])[0];
  const rolls = (before.rolls ?? []).map((roll) => cleanText(roll.id) === rollId ? {
    ...roll,
    inventoryStatus: "供应商退货暂存",
    location: holdingLocation,
    supplierReturnStatus: "供应商退货暂存",
    supplierReturnRecordId,
    sourceReturnInboundId,
    supplierReturnStagedAt: now,
    supplierReturnStagedBy: operatorName,
    supplierReturnStagedByUserId: operatorId,
  } : roll);
  const pendingCount = rolls.filter((roll) => roll.inventoryStatus === "供应商退货暂存").length;
  return {
    ...before,
    status: pendingCount === rolls.length ? "供应商退货暂存" : "部分供应商退货暂存",
    supplierReturnStatus: "待确认退厂",
    nextStep: "实物已与可用库存隔离并放入供应商退货暂存区；确认供应商收回后再标记已退厂。",
    rolls,
    rawMaterialSupplierReturnRecords: [...existingRecords, supplierReturnRecord],
  };
}

export function applyConfirmRawMaterialSupplierReturnShipment(input = {}) {
  const before = input.before ?? {};
  const body = input.body ?? {};
  const operatorId = cleanText(input.operatorId);
  const operatorName = cleanText(input.operatorName);
  const now = cleanText(input.now) || new Date().toISOString();
  const rollId = cleanText(body.rollId);
  if (!rollId || (body.physicalReturnConfirmed !== true && cleanText(body.confirmation) !== "已退厂")) {
    throw businessError(422, "RAW_MATERIAL_SUPPLIER_RETURN_PHYSICAL_CONFIRMATION_REQUIRED", "确认退厂必须扫描暂存卷码，并明确确认实物已经交还供应商。");
  }
  const targetRoll = (before.rolls ?? []).find((roll) => cleanText(roll.id) === rollId);
  if (!targetRoll) throw businessError(404, "RAW_MATERIAL_ROLL_NOT_FOUND", `Raw material roll not found: ${rollId}`);
  if (cleanText(targetRoll.inventoryStatus) !== "供应商退货暂存" || !cleanText(targetRoll.supplierReturnRecordId)) {
    throw businessError(409, "RAW_MATERIAL_SUPPLIER_RETURN_REQUIRES_STAGED_ROLL", "只有供应商退货暂存区内、已关联退货单的卷/件才能确认退厂。");
  }
  const existingRecords = normalizeRawMaterialSupplierReturnRecords(before.rawMaterialSupplierReturnRecords);
  const record = existingRecords.find((item) => item.supplierReturnRecordId === cleanText(targetRoll.supplierReturnRecordId));
  if (!record || record.status !== "供应商退货暂存") {
    throw businessError(409, "RAW_MATERIAL_SUPPLIER_RETURN_RECORD_NOT_PENDING", "供应商退货暂存记录不存在或已经确认退厂。");
  }
  const shippedLocation = cleanText(body.location) || "已退厂/供应商已收回";
  const rolls = (before.rolls ?? []).map((roll) => cleanText(roll.id) === rollId ? {
    ...roll,
    inventoryStatus: "已退厂",
    location: shippedLocation,
    supplierReturnStatus: "已退厂",
    supplierReturnShippedAt: now,
    supplierReturnShippedBy: operatorName,
    supplierReturnShippedByUserId: operatorId,
  } : roll);
  const records = existingRecords.map((item) => item.supplierReturnRecordId === record.supplierReturnRecordId ? {
    ...item,
    status: "已退厂",
    location: shippedLocation,
    shippedBy: operatorName,
    shippedByUserId: operatorId,
    shippedAt: now,
    shipmentReferenceNo: cleanText(body.shipmentReferenceNo),
    note: cleanText(body.note) || item.note,
  } : item);
  const stagedCount = rolls.filter((roll) => roll.inventoryStatus === "供应商退货暂存").length;
  const shippedCount = rolls.filter((roll) => roll.inventoryStatus === "已退厂").length;
  return {
    ...before,
    status: stagedCount ? "部分供应商退货暂存" : shippedCount === rolls.length ? "已退厂" : "部分已退厂",
    supplierReturnStatus: stagedCount ? "待确认退厂" : "已退厂",
    nextStep: stagedCount ? "继续核对暂存区内其余退货卷/件。" : "实物已退厂；厂家负数对账仍以已复核退货单为依据，不重复扣减。",
    rolls,
    rawMaterialSupplierReturnRecords: records,
  };
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
  })).filter((record) => record.supplierReturnRecordId && record.rollId && record.sourceReturnInboundId);
}

function validateSupplierReturnPhysicalScope({ existingRecords = [], sourceReturn = {}, targetRoll = {} }) {
  const linkedRecords = normalizeRawMaterialSupplierReturnRecords(existingRecords)
    .filter((record) => record.sourceReturnInboundId === cleanText(sourceReturn.id) && record.status !== "已取消");
  const sourceRollCount = Math.abs(Number(sourceReturn.rollCount) || 0);
  if (sourceRollCount > 0 && linkedRecords.length + 1 > sourceRollCount) {
    throw businessError(409, "RAW_MATERIAL_SUPPLIER_RETURN_ROLL_COUNT_EXCEEDED", "关联退货单的实物卷/件数已达到复核数量，不能继续增加。");
  }
  const sourceWeightKg = Math.abs(Number(sourceReturn.totalWeightKg) || 0);
  const nextWeightKg = linkedRecords.reduce((sum, record) => sum + (Number(record.weightKg) || 0), 0)
    + Math.abs(Number(targetRoll.weightKg) || 0);
  const toleranceKg = Math.max(0.5, sourceWeightKg * 0.01);
  if (sourceWeightKg > 0 && nextWeightKg - sourceWeightKg > toleranceKg) {
    throw businessError(409, "RAW_MATERIAL_SUPPLIER_RETURN_WEIGHT_EXCEEDED", "关联退货单的已暂存实物重量将超过复核退货重量，请核对卷码或退货单。");
  }
}

function businessError(statusCode, code, message) {
  return Object.assign(new Error(message), { statusCode, code });
}

function cleanText(value) {
  return String(value ?? "").trim();
}
