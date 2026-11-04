import { RAW_MATERIAL_RECEIPT_STAGES } from "../../../../shared/rawMaterialReceiptStage.js";

// These are business dependencies, not every collection the shell can render.
// Receiving has its own server-paged reader and must never populate a complete ledger.
export const workspaceReadDependencies = Object.freeze({
  "shared-todos": ["todos"],
  "order-entry": ["orderDrafts", "inventoryItems", "orderLines"],
  "order-pool": ["orderLines", "machines"],
  "material-receiving": [],
  "roll-inventory": ["rawMaterialInbounds", "productionTasks"],
  "production-tasks": ["productionTasks", "orderLines", "machines"],
  "packing-labels": ["packingTasks", "orderLines"],
  "print-devices": ["printJobs", "printDevices"],
  "outbound-delivery": ["fulfillments", "orderLines", "statements"],
  "inventory-query": ["inventoryItems"],
  "laminated-inventory": ["inventoryItems"],
  "customer-statements": ["statements"],
  "supplier-month-end": ["supplierStatementReviews", "rawMaterialInbounds"],
  "raw-material-cost": ["rawMaterialInbounds", "productionTasks"],
  "mold-changes": ["machines"],
  "customer-records": ["orderLines", "statements"],
  "people-machines": ["employeeAccountReviews", "machines"],
  "general-prices": [],
  "spec-inventory": [],
  "payroll-attendance": [],
  "launch-status": [],
});

export const UNLOADED_READ = Object.freeze({ status: "unloaded", hasLoaded: false, loading: false, stale: false, error: "", lastSyncedAt: "" });

export function beginRead(previous = UNLOADED_READ) {
  return { ...previous, status: "loading", loading: true, error: "" };
}

export function finishRead(previous = UNLOADED_READ, result, timestamp = new Date().toISOString()) {
  if (result?.source !== "api" || result.blocked) {
    return { ...previous, status: previous.hasLoaded ? "stale" : "error", loading: false, stale: previous.hasLoaded,
      error: result?.error?.message || "读取失败，请重试。" };
  }
  return { status: result.items?.length === 0 ? "empty" : "ready", loading: false, hasLoaded: true, stale: false,
    error: "", lastSyncedAt: timestamp };
}

export function invalidateRead(previous = UNLOADED_READ) {
  return { ...previous, loading: false, status: previous.hasLoaded ? "stale" : "unloaded", stale: previous.hasLoaded };
}

export function normalizeReceiptQuery(query = {}) {
  return { keyword: String(query.keyword || "").trim(), receiptStage: String(query.receiptStage || "全部"),
    page: Math.max(1, Math.trunc(Number(query.page) || 1)), pageSize: Math.max(1, Math.min(100, Math.trunc(Number(query.pageSize) || 20))) };
}

export function validateReceiptPage(result, query) {
  if (result?.source !== "api" || result.blocked) return result;
  const countValues = RAW_MATERIAL_RECEIPT_STAGES.map(stage => result.receiptStageCounts?.[stage]);
  const valid = Array.isArray(result.items) && Number.isSafeInteger(result.total) && result.total >= 0
    && result.page === query.page && result.pageSize === query.pageSize && result.items.length <= query.pageSize
    && result.items.length <= result.total
    && countValues.every(count => Number.isSafeInteger(count) && count >= 0);
  return valid ? result : { source: "api_error", blocked: true,
    error: { code: "RECEIPT_PAGE_INCOMPLETE", message: "收货分页或完整统计未返回，请重试。" } };
}
