import { normalizeRawMaterialInbounds } from "../rawMaterialInboundRecordService.mjs";

export function buildRawMaterialInboundListResponse(inbounds = [], query = new URLSearchParams()) {
  const filters = normalizeRawMaterialInboundListQuery(query);
  let items = normalizeRawMaterialInbounds(inbounds);
  if (filters.status && filters.status !== "全部") {
    items = items.filter((item) => item.status === filters.status);
  }
  if (filters.keyword) {
    const keyword = filters.keyword.toLowerCase();
    items = items.filter((item) => buildSearchText(item).includes(keyword));
  }
  items = items.sort((left, right) => compareDateDesc(left.receivedAt, right.receivedAt) || String(right.id).localeCompare(String(left.id)));
  const total = items.length;
  const page = Math.max(1, Number(filters.page) || 1);
  const pageSize = Math.max(1, Math.min(200, Number(filters.pageSize) || 50));
  const start = (page - 1) * pageSize;
  return {
    items: items.slice(start, start + pageSize),
    page,
    pageSize,
    total,
    metrics: buildRawMaterialInboundMetrics(inbounds),
  };
}

export function normalizeRawMaterialInboundListQuery(query) {
  return {
    keyword: cleanText(getQueryValue(query, "keyword")),
    status: cleanText(getQueryValue(query, "status")),
    page: Number(getQueryValue(query, "page") || 1),
    pageSize: Number(getQueryValue(query, "pageSize") || 50),
  };
}

export function buildRawMaterialInboundMetrics(inbounds = []) {
  const items = normalizeRawMaterialInbounds(inbounds);
  return {
    totalCount: items.length,
    pendingReviewCount: items.filter((item) => item.status.includes("待复核")).length,
    pendingLabelCount: items.filter((item) => item.status.includes("待打印") || item.status.includes("待贴标")).length,
    partiallyLabeledCount: items.filter((item) => item.status === "部分贴标").length,
    availableCount: items.filter((item) => item.status === "已贴标入库/可用").length,
    issuedCount: items.filter((item) => item.status.includes("领料/机边")).length,
    consumptionConfirmedCount: items.filter((item) => item.status.includes("消耗确认")).length,
    leftoverPendingCount: items.filter((item) => item.status.includes("余料")).length,
    leftoverReviewedCount: items.filter((item) => item.status.includes("余料已复核")).length,
    splitRollCount: items.reduce((sum, item) => sum + (item.rawMaterialSplitRecords ?? []).length, 0),
    costAllocationDraftCount: items.reduce((sum, item) => sum + (item.rawMaterialCostAllocationDrafts ?? []).length, 0),
    costAllocationConfirmedCount: items.reduce((sum, item) => sum + (item.rawMaterialCostAllocationConfirmations ?? []).length, 0),
    lossCalibrationCount: items.reduce((sum, item) => sum + (item.rawMaterialCostLossCalibrations ?? []).length, 0),
    marginSnapshotCount: items.reduce((sum, item) => sum + (item.rawMaterialOrderMarginSnapshots ?? []).length, 0),
    marginReportCount: items.reduce((sum, item) => sum + (item.rawMaterialOrderMarginReports ?? []).length, 0),
    exceptionCount: items.filter((item) => item.status.includes("异常")).length,
    availableRollCount: countRolls(items, (roll) => roll.inventoryStatus === "可用"),
    machineSideRollCount: countRolls(items, (roll) => roll.inventoryStatus === "机边领用"),
    consumedRollCount: countRolls(items, (roll) => roll.inventoryStatus === "已消耗"),
    leftoverPendingRollCount: countRolls(items, (roll) => roll.inventoryStatus === "余料待复核"),
    leftoverReviewedRollCount: countRolls(items, (roll) => roll.leftoverReviewRecordId),
    unavailableRollCount: countRolls(items, (roll) => roll.inventoryStatus !== "可用"),
  };
}

function buildSearchText(item) {
  return [
    item.id,
    item.supplierName,
    item.deliveryNoteNo,
    item.materialType,
    item.productName,
    item.supplierColor,
    item.factoryColor,
    item.spec,
    item.status,
    item.location,
    item.statementStatus,
    ...(item.rolls ?? []).flatMap((roll) => [roll.id, roll.supplierRollNo, roll.labelStatus, roll.inventoryStatus]),
  ]
    .join(" ")
    .toLowerCase();
}

function countRolls(items, predicate) {
  return items.reduce((sum, item) => sum + (item.rolls ?? []).filter(predicate).length, 0);
}

function getQueryValue(query, key) {
  if (!query) return "";
  if (typeof query.get === "function") return query.get(key) ?? "";
  return query[key] ?? "";
}

function compareDateDesc(left, right) {
  return (Date.parse(right) || 0) - (Date.parse(left) || 0);
}

function cleanText(value) {
  return String(value ?? "").trim();
}
