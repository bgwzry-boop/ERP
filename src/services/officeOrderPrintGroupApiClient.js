import { requestOfficeApi, readOfficeApiJson, toOfficeApiError, toOfficeApiTransportError } from "./officeApiClientCore.js";

const BASIS = "frozen_original_unit_price";
const text = value => typeof value === "string" && value.trim().length > 0;
const number = value => typeof value === "number" && Number.isFinite(value);
const amount = value => number(value) && value >= 0;
const positiveInteger = value => Number.isSafeInteger(value) && value > 0;
const round = value => Math.round((value + Number.EPSILON) * 100) / 100;
const sameIds = (left, right) => left.length === right.length && new Set(left).size === left.length &&
  [...left].sort().every((id, index) => id === [...right].sort()[index]);

const knownRejections = new Set([
  "PRINT_GROUP_NOT_FOUND", "PRINT_GROUP_INCOMPLETE", "PRINT_GROUP_REVISION_CONFLICT",
  "PRINT_GROUP_PREVIEW_CHANGED", "PRINT_GROUP_PRICE_LOCKED", "ORDER_LINE_HAS_STATEMENT",
  "PRINT_GROUP_PRICE_INVALID", "ORDER_LINE_PRICE_SOURCE_AMBIGUOUS", "ORDER_PRODUCTION_ALLOCATION_REQUIRED",
  "ORDER_LINE_SPLIT_ALLOCATION_REQUIRED",
  "ERP_INVENTORY_CONCURRENCY_CONFLICT", "ERP_ORDER_LINE_CONCURRENCY_CONFLICT", "ERP_ORDER_GROUP_CONCURRENCY_CONFLICT",
  "ERP_RESERVATION_CONCURRENCY_CONFLICT", "ERP_ORDER_PRICE_SOURCE_CONFLICT", "ERP_PRINT_GROUP_MEMBERS_CONFLICT",
  "ERP_ORDER_LINE_HAS_STATEMENT", "ERP_PRINT_GROUP_PRICE_LOCKED",
  "ERP_ORDER_PRODUCTION_ALREADY_EXECUTED", "ERP_ORDER_DELIVERY_ALREADY_EXECUTED",
  "ORDER_DOCUMENTS_MUST_BE_VOIDED", "ERP_ORDER_DOCUMENTS_ACTIVE_CONFLICT", "PRINT_GROUP_BILLING_ALLOCATION_REQUIRED",
  "PRINT_GROUP_VALIDATION_INVALID", "ACTION_FORBIDDEN", "IDEMPOTENCY_KEY_REUSED",
  "IDEMPOTENCY_PAYLOAD_CONFLICT", "PERMISSION_DENIED", "AUTH_REQUIRED", "UNAUTHORIZED",
  "BUSINESS_WRITE_CONFLICT",
]);

function failure(code, message, extra = {}) {
  return { source: "api_error", blocked: true, error: { code, message, ...extra } };
}
function receiptFailure() {
  return failure("PRINT_GROUP_RECEIPT_INVALID", "没有取得完整且对应本次更正的服务器回执，请按原请求重试。", { definitive: false });
}
function path(id, suffix) {
  return `/order-lines/${encodeURIComponent(id)}/${suffix}`;
}

export function isCompleteOfficeOrderPrintGroup(group, orderLineId) {
  if (!group || !text(group.groupId) || !text(group.groupRevision) || group.pricingBasis !== BASIS ||
      !Array.isArray(group.members) || !group.members.length || !Array.isArray(group.blockers) ||
      typeof group.canCorrect !== "boolean" || group.members.some(row => !row || typeof row !== "object") ||
      group.blockers.some(row => !row || typeof row !== "object")) return false;
  const ids = group.members.map(row => row.orderLineId);
  if (!sameIds(ids, ids) || !ids.includes(orderLineId)) return false;
  for (const row of group.members) {
    if (!text(row.orderLineId) || !positiveInteger(row.revision) || !positiveInteger(row.qty) ||
        ![row.amount, row.bagPrice, row.printPrice, row.otherFee].every(amount) || !number(row.adjustmentAmount) ||
        !Number.isSafeInteger(row.chargeableQty) || row.chargeableQty < 0 || row.chargeableQty > row.qty ||
        !text(row.priceSnapshotId) || !text(row.customerName) || !text(row.product) || !text(row.size) || !text(row.status) ||
        round((row.bagPrice + row.printPrice) * row.chargeableQty + row.otherFee + row.adjustmentAmount) !== row.amount) return false;
  }
  return group.blockers.every(blocker => text(blocker.code) && text(blocker.message) &&
    (!blocker.orderLineId || ids.includes(blocker.orderLineId))) && (!group.canCorrect || group.blockers.length === 0);
}

export function orderPrintGroupCorrectionBody(input) {
  return {
    expectedGroupRevision: input.expectedGroupRevision,
    members: (input.members ?? []).map(row => ({
      orderLineId: row.orderLineId, expectedRevision: row.expectedRevision, newQty: row.newQty, void: row.void === true,
    })),
    mode: input.mode,
    reason: input.reason,
    ...(input.previewHash !== undefined ? { previewHash: input.previewHash } : {}),
    ...(input.idempotencyKey !== undefined ? { idempotencyKey: input.idempotencyKey } : {}),
  };
}

function validInput(input) {
  const group = input.group;
  if (!isCompleteOfficeOrderPrintGroup(group, input.orderLineId) || !group.canCorrect ||
      input.expectedGroupRevision !== group.groupRevision || !["amend", "void_all"].includes(input.mode) ||
      !text(input.reason) || !Array.isArray(input.members) || input.members.some(row => !row || typeof row !== "object") ||
      !sameIds(input.members.map(row => row.orderLineId), group.members.map(row => row.orderLineId))) return false;
  let changed = false;
  for (const row of input.members) {
    const prior = group.members.find(member => member.orderLineId === row.orderLineId);
    if (row.expectedRevision !== prior.revision || typeof row.void !== "boolean" ||
        !positiveInteger(row.newQty) || row.newQty > prior.qty || (input.mode === "void_all" && !row.void)) return false;
    changed ||= row.void || row.newQty !== prior.qty;
  }
  return changed;
}

function validTotals(totals, members) {
  if (!totals || ![totals.previousQty, totals.newQty].every(value => Number.isSafeInteger(value) && value >= 0) ||
      ![totals.previousAmount, totals.finalAmount].every(amount) || !number(totals.difference)) return false;
  return totals.previousQty === members.reduce((sum, row) => sum + row.previousQty, 0) &&
    totals.newQty === members.reduce((sum, row) => sum + row.newQty, 0) &&
    totals.previousAmount === round(members.reduce((sum, row) => sum + row.previousAmount, 0)) &&
    totals.finalAmount === round(members.reduce((sum, row) => sum + row.finalAmount, 0)) &&
    totals.difference === round(totals.finalAmount - totals.previousAmount);
}

export function isCompleteOfficePrintGroupCorrectionPreview(preview, input) {
  if (!validInput(input) || !preview || preview.groupId !== input.group.groupId ||
      preview.groupRevision !== input.expectedGroupRevision || !text(preview.previewHash) ||
      preview.mode !== input.mode || preview.pricingBasis !== BASIS || preview.reason !== input.reason ||
      !Array.isArray(preview.members) || preview.members.some(row => !row || typeof row !== "object") ||
      !sameIds(preview.members.map(row => row.orderLineId), input.members.map(row => row.orderLineId))) return false;
  for (const row of preview.members) {
    const prior = input.group.members.find(member => member.orderLineId === row.orderLineId);
    const edit = input.members.find(member => member.orderLineId === row.orderLineId);
    const nextQty = edit.void ? 0 : edit.newQty;
    const action = edit.void ? "void" : nextQty === prior.qty ? "keep" : "reduce";
    if (row.previousQty !== prior.qty || row.newQty !== nextQty || row.action !== action ||
        row.previousAmount !== prior.amount || !amount(row.finalAmount) ||
        row.bagPrice !== prior.bagPrice || row.printPrice !== prior.printPrice ||
        row.finalAmount !== (edit.void ? 0 : action === "keep" ? prior.amount : round((prior.bagPrice + prior.printPrice) * nextQty + prior.otherFee + prior.adjustmentAmount))) return false;
  }
  return validTotals(preview.totals, preview.members);
}

export function isCompleteOfficePrintGroupCorrectionReceipt(receipt, input) {
  if (!isCompleteOfficePrintGroupCorrectionPreview(input.preview, input) || !receipt ||
      receipt.groupId !== input.group.groupId || !text(receipt.correctionId) || !text(receipt.operationLogId) ||
      !Array.isArray(receipt.members) || receipt.members.some(row => !row || typeof row !== "object") ||
      !sameIds(receipt.members.map(row => row.orderLineId), input.members.map(row => row.orderLineId)) ||
      !Array.isArray(receipt.priceSnapshotIds) || !receipt.priceSnapshotIds.every(text) ||
      new Set(receipt.priceSnapshotIds).size !== receipt.priceSnapshotIds.length) return false;
  for (const row of receipt.members) {
    const expected = input.preview.members.find(member => member.orderLineId === row.orderLineId);
    const prior = input.group.members.find(member => member.orderLineId === row.orderLineId);
    if (row.newQty !== expected.newQty || row.finalAmount !== expected.finalAmount ||
        row.revision !== prior.revision + 1 || !text(row.status) || !text(row.priceSnapshotId) ||
        row.priceSnapshotId === prior.priceSnapshotId || !receipt.priceSnapshotIds.includes(row.priceSnapshotId) ||
        (expected.action === "void" && row.status !== "已关闭") ||
        (expected.action !== "void" && /已关闭|已取消|已作废/u.test(row.status))) return false;
  }
  return sameIds(receipt.priceSnapshotIds, receipt.members.map(row => row.priceSnapshotId)) &&
    validTotals(receipt.totals, input.preview.members) &&
    ["previousQty", "newQty", "previousAmount", "finalAmount", "difference"].every(key => receipt.totals[key] === input.preview.totals[key]);
}

async function invoke(input, suffix, method, options, validate) {
  try {
    const response = await requestOfficeApi(path(input.orderLineId, suffix), {
      ...options, serverRequired: true, authState: input.authState, method,
      ...(method === "POST" ? { idempotencyKey: input.idempotencyKey, body: orderPrintGroupCorrectionBody(input) } : {}),
    });
    const json = await readOfficeApiJson(response);
    if (!response.ok) {
      const error = toOfficeApiError(json, response.status, "服务器未接受本次更正，请核对后重试。");
      error.definitive = response.status >= 400 && response.status < 500 && knownRejections.has(error.code);
      return { source: "api_error", blocked: true, error };
    }
    return validate(json) ? { ...json, source: "api" } : receiptFailure();
  } catch (cause) {
    return { source: "api_error", blocked: true, error: { ...toOfficeApiTransportError(cause, "未收到服务器回执，请按原请求重试。"), definitive: false } };
  }
}

export function getOfficeOrderPrintGroup(input, options = {}) {
  return invoke(input, "print-group", "GET", options, json => isCompleteOfficeOrderPrintGroup(json, input.orderLineId));
}
export function previewOfficeOrderPrintGroupCorrection(input, options = {}) {
  if (!validInput(input)) return Promise.resolve(failure("PRINT_GROUP_VALIDATION_INVALID", "完整组、版本、原因或数量无效；新数量只能减少，作废请明确勾选。", { definitive: true }));
  return invoke(input, "print-group-correction-preview", "POST", options, json => isCompleteOfficePrintGroupCorrectionPreview(json, input));
}
export function correctOfficeOrderPrintGroup(input, options = {}) {
  if (!validInput(input) || !text(input.idempotencyKey) || input.previewHash !== input.preview?.previewHash ||
      !isCompleteOfficePrintGroupCorrectionPreview(input.preview, input)) return Promise.resolve(failure("PRINT_GROUP_VALIDATION_INVALID", "本次完整组预览与提交内容不一致，请重新核对。", { definitive: true }));
  return invoke(input, "print-group-corrections", "POST", options, json => isCompleteOfficePrintGroupCorrectionReceipt(json, input));
}
