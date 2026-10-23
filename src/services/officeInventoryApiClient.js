import { normalizeInventoryHoldTimestamp } from "../../shared/inventoryHoldTime.js";
import { isOfficeApiServerRequired } from "./officeAuthService.js";
import {
  buildOfficeServerRequiredWriteError as buildServerRequiredWriteError,
  readOfficeApiJson as readJson,
  requestOfficeApi as requestInventoryApi,
  toOfficeApiError as toApiError,
} from "./officeApiClientCore.js";

import {reasonCodeByLabel,reasonLabelByCode} from "../domain/inventoryCorrectionReasons.js";
export {inventoryCorrectionReasonOptions} from "../domain/inventoryCorrectionReasons.js";

export async function listOfficeInventoryIntents(input = {}, options = {}) {
  const { authState, operatorId, filters = {} } = input;
  try {
    const response = await requestInventoryApi(`/inventory/intents${buildInventoryIntentQuery(filters)}`, {
      ...options,
      authState,
      operatorId,
    });
    const json = await readJson(response);
    if (!response.ok) {
      return { source: "api_error", blocked: true, error: toApiError(json, response.status, "库存意图队列 API 返回错误。"), items: [] };
    }
    if (!Array.isArray(json?.items)) return { source: "api_error", blocked: true, items: [], error: { code: "INVENTORY_INTENT_LIST_INVALID", message: "留货申请列表返回不完整，请刷新重试。" } };
    return { source: "api", items: json.items };
  } catch (error) {
    return {
      source: "api_error",
      blocked: true,
      error: { code: "INVENTORY_INTENT_API_UNAVAILABLE", message: error?.message ?? String(error) },
      items: [],
    };
  }
}

export async function listOfficeTemporaryInventoryHolds(input = {}, options = {}) {
  const { authState, operatorId, filters = {} } = input;
  try {
    const response = await requestInventoryApi(`/inventory/holds${buildInventoryHoldQuery(filters)}`, {
      ...options,
      authState,
      operatorId,
    });
    const json = await readJson(response);
    if (!response.ok) {
      return { source: "api_error", blocked: true, error: toApiError(json, response.status, "临时留货列表 API 返回错误。"), items: [] };
    }
    if (!Array.isArray(json?.items)) {
      return { source: "api_error", blocked: true, items: [], error: {
        code: "TEMPORARY_HOLD_LIST_INVALID",
        message: "留货列表返回不完整，请重新读取。",
      } };
    }
    return { source: "api", items: json.items };
  } catch (error) {
    return {
      source: "api_error",
      blocked: true,
      error: { code: "TEMPORARY_HOLD_API_UNAVAILABLE", message: error?.message ?? String(error) },
      items: [],
    };
  }
}

export function createOfficeTemporaryInventoryHold(input = {}, options = {}) {
  return requestInventoryIntentWrite({
    input,
    options,
    targetId: cleanText(input.intentId),
    path: `/inventory/intents/${encodeURIComponent(cleanText(input.intentId))}/hold`,
    fallbackCode: "TEMPORARY_HOLD_CREATE_API_UNAVAILABLE",
    fallbackMessage: "创建临时留货失败。",
  });
}

export function releaseOfficeTemporaryInventoryHold(input = {}, options = {}) {
  return requestInventoryIntentWrite({
    input,
    options,
    targetId: cleanText(input.holdId ?? input.reservationId),
    path: `/inventory/holds/${encodeURIComponent(cleanText(input.holdId ?? input.reservationId))}/release`,
    fallbackCode: "TEMPORARY_HOLD_RELEASE_API_UNAVAILABLE",
    fallbackMessage: "释放临时留货失败。",
  });
}

export function extendOfficeTemporaryInventoryHold(input = {}, options = {}) {
  return requestInventoryIntentWrite({
    input,
    options,
    targetId: cleanText(input.holdId ?? input.reservationId),
    path: `/inventory/holds/${encodeURIComponent(cleanText(input.holdId ?? input.reservationId))}/extend`,
    fallbackCode: "TEMPORARY_HOLD_EXTEND_API_UNAVAILABLE",
    fallbackMessage: "延长临时留货失败。",
  });
}

export function expireDueOfficeTemporaryInventoryHolds(input = {}, options = {}) {
  return requestInventoryIntentWrite({
    input,
    options,
    path: "/inventory/holds/expire-due",
    fallbackCode: "TEMPORARY_HOLD_EXPIRY_API_UNAVAILABLE",
    fallbackMessage: "处理到期临时留货失败。",
  });
}

async function requestInventoryIntentWrite({ input, options, path, targetId, fallbackCode, fallbackMessage }) {
  if (path !== "/inventory/holds/expire-due" && !targetId) {
    return { source: "client_validation", blocked: true, error: { code: "INVENTORY_INTENT_ID_REQUIRED", message: "缺少库存意图或留货 ID。" } };
  }
  try {
    const response = await requestInventoryApi(path, {
      ...options,
      authState: input.authState,
      method: "POST",
      operatorId: input.operatorId,
      idempotencyKey: input.idempotencyKey ?? options.idempotencyKey,
      body: omitTransportFields(input),
    });
    const json = await readJson(response);
    if (!response.ok) {
      return { source: "api_error", blocked: true, error: toApiError(json, response.status, fallbackMessage) };
    }
    if (!path.endsWith("/expire-due")) {
      const receiptHoldId = cleanText(json?.hold?.reservationId ?? json?.hold?.id);
      const receiptIntentId = cleanText(json?.intent?.intentId ?? json?.intent?.id);
      const expectedHoldId = cleanText(input.holdId ?? input.reservationId);
      const expectedIntentId = cleanText(input.intentId);
      const releasing = path.endsWith("/release");
      const expectedRevision = Number(input.expectedRevision);
      const quantity = json?.hold?.reservedQty;
      const creating = path.endsWith("/hold");
      const extending = path.endsWith("/extend");
      const requestedExpiry = Date.parse(normalizeInventoryHoldTimestamp(input.expiresAt));
      const receivedExpiry = Date.parse(json?.hold?.expiresAt);
      const requestMismatch = (creating && input.qty != null && quantity !== Number(input.qty)) ||
        (creating && cleanText(input.inventoryItemId) && cleanText(json?.hold?.inventoryItemId) !== cleanText(input.inventoryItemId)) ||
        (extending && (!Number.isFinite(requestedExpiry) || receivedExpiry !== requestedExpiry));
      const invalidBusinessReceipt = requestMismatch || json?.hold?.status !== (releasing ? "已取消" : "生效") ||
        json?.intent?.intentStatus !== (releasing ? "已取消" : "临时留货-生效") ||
        !Number.isSafeInteger(quantity) || (releasing ? quantity !== 0 : quantity <= 0) ||
        !Number.isSafeInteger(expectedRevision) || json?.intent?.revision !== expectedRevision + 1 ||
        cleanText(json?.hold?.sourceIntentId) !== receiptIntentId;
      if (invalidBusinessReceipt || !receiptHoldId || !receiptIntentId || !cleanText(json?.operationLogId) ||
        (expectedHoldId && receiptHoldId !== expectedHoldId) ||
        (expectedIntentId && receiptIntentId !== expectedIntentId)) {
        return { source: "api_error", blocked: true, error: {
          code: "TEMPORARY_HOLD_SAVE_UNCONFIRMED",
          message: "留货操作返回的记录不完整或与当前对象不一致，请刷新核对后再操作。",
        } };
      }
    }
    return { ...json, source: "api", response: json };
  } catch (error) {
    if (isOfficeApiServerRequired()) return buildServerRequiredWriteError(fallbackCode, error);
    return { source: "api_error", blocked: true, error: { code: fallbackCode, message: error?.message ?? String(error) } };
  }
}

function omitTransportFields(input) {
  const { idempotencyKey: _idempotencyKey, authState: _authState, operatorId: _operatorId, intentId: _intentId, holdId: _holdId, reservationId: _reservationId, ...body } = input;
  return body;
}

function buildInventoryIntentQuery(filters = {}) {
  return buildSimpleQuery(filters, ["status", "intentType", "customerId", "sourceDraftId"]);
}

function buildInventoryHoldQuery(filters = {}) {
  return buildSimpleQuery(filters, ["status", "customerId", "inventoryItemId"]);
}

function buildSimpleQuery(filters, keys) {
  const query = new URLSearchParams();
  for (const key of keys) {
    const value = cleanText(filters[key]);
    if (value) query.set(key, value);
  }
  const text = query.toString();
  return text ? `?${text}` : "";
}

export async function listOfficeInventoryLedgerEntries(input = {}, options = {}) {
  const { authState, operatorId, localLedgerEntries = [], page = 1, pageSize = 50, filters = {} } = input;

  try {
    const response = await requestInventoryApi(
      `/inventory/ledger-entries${buildInventoryLedgerQuery({ page, pageSize, filters })}`,
      {
        ...options,
        authState,
        operatorId,
      },
    );
    const json = await readJson(response);

    if (!response.ok) {
      return {
        source: "api_error",
        blocked: true,
        error: toApiError(json, response.status, "库存流水 API 返回错误。"),
        items: [],
        page,
        pageSize,
        total: 0,
      };
    }

    const items = Array.isArray(json?.items) ? json.items.map(mapApiInventoryLedgerEntryToLocal) : null;
    const inventoryItemId = cleanText(filters.inventoryItemId);
    if (!items || items.some(item => !item || (inventoryItemId && item.inventoryItemId !== inventoryItemId))) {
      return {
        source: "api_error",
        blocked: true,
        error: { code: "INVENTORY_LEDGER_RESPONSE_MISMATCH", message: "库存流水返回不完整或与当前库存不一致，请刷新核对。" },
        items: [], page, pageSize, total: 0,
      };
    }
    return {
      source: "api",
      items,
      page: toNumber(json?.page, page),
      pageSize: toNumber(json?.pageSize, pageSize),
      total: toNumber(json?.total, items.length),
      filters: json?.filters ?? filters,
    };
  } catch (error) {
    const allItems = localLedgerEntries.map(mapApiInventoryLedgerEntryToLocal).filter(Boolean);
    const filteredItems = filterLocalInventoryLedgerEntries(allItems, filters);
    const size = Math.max(1, Number(pageSize) || 50);
    const start = Math.max(0, (Math.max(1, Number(page) || 1) - 1) * size);
    return {
      source: "local_fallback",
      error: {
        code: "INVENTORY_LEDGER_API_UNAVAILABLE",
        message: error?.message ?? String(error),
      },
      items: filteredItems.slice(start, start + size),
      page,
      pageSize,
      total: filteredItems.length,
      filters,
    };
  }
}

export async function listOfficeInventoryItems(input = {}, options = {}) {
  const { authState, operatorId, localInventoryRecords = [], page = 1, pageSize = 200, filters = {} } = input;

  try {
    const response = await requestInventoryApi(
      `/inventory/items${buildInventoryItemsQuery({ page, pageSize, filters })}`,
      {
        ...options,
        authState,
        operatorId,
      },
    );
    const json = await readJson(response);

    if (!response.ok) {
      return {
        source: "api_error",
        blocked: true,
        error: toApiError(json, response.status, "库存列表 API 返回错误。"),
        items: [],
        page,
        pageSize,
        total: 0,
      };
    }

    const items = Array.isArray(json?.items) ? json.items.map(mapApiInventoryItemToLocal).filter(Boolean) : [];
    return {
      source: "api",
      items,
      page: toNumber(json?.page, page),
      pageSize: toNumber(json?.pageSize, pageSize),
      total: toNumber(json?.total, items.length),
      filters: json?.filters ?? filters,
    };
  } catch (error) {
    const allItems = localInventoryRecords.map(mapApiInventoryItemToLocal).filter(Boolean);
    const filteredItems = filterLocalInventoryItems(allItems, filters);
    const start = Math.max(0, (Math.max(1, Number(page) || 1) - 1) * Math.max(1, Number(pageSize) || 200));
    const size = Math.max(1, Number(pageSize) || 200);
    return {
      source: "local_fallback",
      error: {
        code: "INVENTORY_ITEMS_API_UNAVAILABLE",
        message: error?.message ?? String(error),
      },
      items: filteredItems.slice(start, start + size),
      page,
      pageSize,
      total: filteredItems.length,
      filters,
    };
  }
}

export async function listOfficeInventoryCorrectionDrafts(input = {}, options = {}) {
  const { authState, operatorId, localCorrectionDrafts = [], page = 1, pageSize = 20, filters = { status: "待确认生效" } } = input;
  const queryFilters = { status: "待确认生效", ...filters };

  try {
    const response = await requestInventoryApi(
      `/inventory/correction-drafts${buildInventoryCorrectionDraftsQuery({ page, pageSize, filters: queryFilters })}`,
      {
        ...options,
        authState,
        operatorId,
      },
    );
    const json = await readJson(response);

    if (!response.ok) {
      return {
        source: "api_error",
        blocked: true,
        error: toApiError(json, response.status, "库存修正确认队列 API 返回错误。"),
        items: [],
        page,
        pageSize,
        total: 0,
      };
    }

    const validQuantity = value => typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
    const seen = new Set();
    const invalid = !Array.isArray(json?.items) || json.page !== Number(page) || json.pageSize !== Number(pageSize)
      || !Number.isSafeInteger(json.total) || json.total < 0 || json.items.length > Number(pageSize) || json.total < json.items.length
      || json.items.some(item => {
        const id = cleanText(item?.correctionDraftId ?? item?.id);
        const inventoryId = cleanText(item?.inventoryItemId ?? item?.inventory_item_id);
        const before = item?.qtyBefore?.onHand ?? item?.qtyBefore?.on_hand ?? item?.systemQty ?? item?.system_qty;
        const after = item?.requestedQtyAfter?.onHand ?? item?.requestedQtyAfter?.on_hand ?? item?.actualQty ?? item?.actual_qty;
        const bad = !id || seen.has(id) || !inventoryId || (queryFilters.inventoryItemId && inventoryId !== queryFilters.inventoryItemId)
          || !validQuantity(before) || !validQuantity(after) || !cleanText(item?.status);
        seen.add(id); return bad;
      });
    if (invalid) {
      return {source:"api_error",blocked:true,error:{code:"INVENTORY_CORRECTION_LIST_INVALID",message:"库存修正记录不完整，请刷新重试。"},items:[],page,pageSize,total:0};
    }
    const items = json.items.map(mapApiInventoryCorrectionDraftSummaryToLocal);
    return {
      source: "api",
      items,
      page: toNumber(json?.page, page),
      pageSize: toNumber(json?.pageSize, pageSize),
      total: toNumber(json?.total, items.length),
      filters: json?.filters ?? queryFilters,
    };
  } catch (error) {
    const allItems = localCorrectionDrafts.map(mapApiInventoryCorrectionDraftSummaryToLocal).filter(Boolean);
    const filteredItems = filterLocalInventoryCorrectionDrafts(allItems, queryFilters);
    const size = Math.max(1, Number(pageSize) || 20);
    const start = Math.max(0, (Math.max(1, Number(page) || 1) - 1) * size);
    return {
      source: "local_fallback",
      error: {
        code: "INVENTORY_CORRECTION_QUEUE_API_UNAVAILABLE",
        message: error?.message ?? String(error),
      },
      items: filteredItems.slice(start, start + size),
      page,
      pageSize,
      total: filteredItems.length,
      filters: queryFilters,
    };
  }
}

export async function getOfficeInventoryCorrectionDetail(input = {}, options = {}) {
  const { authState, operatorId, correctionDraftId, sourceEntry, localCorrectionDrafts = [], localLedgerEntries = [] } = input;
  const safeCorrectionDraftId = cleanText(correctionDraftId);

  if (!safeCorrectionDraftId) {
    return {
      source: "api_error",
      blocked: true,
      error: {
        code: "INVENTORY_CORRECTION_DRAFT_ID_REQUIRED",
        message: "缺少库存修正草稿 ID。",
      },
      detail: null,
    };
  }

  try {
    const response = await requestInventoryApi(`/inventory/correction-drafts/${encodeURIComponent(safeCorrectionDraftId)}`, {
      ...options,
      authState,
      operatorId,
    });
    const json = await readJson(response);

    if (!response.ok) {
      return {
        source: "api_error",
        blocked: true,
        error: toApiError(json, response.status, "库存修正详情 API 返回错误。"),
        detail: null,
      };
    }

    return {
      source: "api",
      detail: mapApiInventoryCorrectionDetailToLocal(json),
    };
  } catch (error) {
    return {
      source: "local_fallback",
      error: {
        code: "INVENTORY_CORRECTION_DETAIL_API_UNAVAILABLE",
        message: error?.message ?? String(error),
      },
      detail: createLocalInventoryCorrectionDetail({
        correctionDraftId: safeCorrectionDraftId,
        sourceEntry,
        localCorrectionDrafts,
        localLedgerEntries,
      }),
    };
  }
}

export async function confirmOfficeInventoryCorrectionDraft(input = {}, options = {}) {
  const { authState, operatorId, correctionDraftId, approvalReason = "确认库存修正生效" } = input;
  const safeCorrectionDraftId = cleanText(correctionDraftId);

  if (!safeCorrectionDraftId) {
    return {
      source: "api_error",
      blocked: true,
      error: {
        code: "INVENTORY_CORRECTION_DRAFT_ID_REQUIRED",
        message: "缺少库存修正草稿 ID。",
      },
      confirmation: null,
    };
  }

  try {
    const response = await requestInventoryApi(
      `/inventory/correction-drafts/${encodeURIComponent(safeCorrectionDraftId)}/confirm`,
      {
        ...options,
        idempotencyKey: input.idempotencyKey ?? options.idempotencyKey,
        authState,
        method: "POST",
        operatorId,
        body: {
          correctionDraftId: safeCorrectionDraftId,
          approvalReason,
          operatorId,
          attachmentIds: [],
        },
      },
    );
    const json = await readJson(response);

    if (!response.ok) {
      return {
        source: "api_error",
        blocked: true,
        error: toApiError(json, response.status, "库存修正确认 API 返回错误。"),
        confirmation: null,
      };
    }

    const validQty = value => typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
    const ledger = json?.ledger;
    if (json?.correctionDraftId !== safeCorrectionDraftId || !cleanText(json.inventoryItemId)
      || !validQty(json.qtyBefore?.onHand) || !validQty(json.qtyAfter?.onHand)
      || !cleanText(ledger?.ledgerId) || ledger.sourceId !== safeCorrectionDraftId
      || !validQty(ledger.qtyBefore) || !validQty(ledger.qtyAfter)
      || ledger.qtyAfter !== json.qtyAfter.onHand || ledger.qtyChange !== ledger.qtyAfter - ledger.qtyBefore
      || !cleanText(json.operationLogId)) {
      return {source:"api_error",blocked:true,error:{code:"INVENTORY_CORRECTION_CONFIRM_UNCONFIRMED",message:"库存修正确认结果不完整，请按原请求重试并核对库存流水。"},confirmation:null};
    }
    return {
      source: "api",
      confirmation: mapApiInventoryCorrectionConfirmToLocal(json),
      response: json,
    };
  } catch (error) {
    return {
      source: "api_error",
      blocked: true,
      error: {
        code: "INVENTORY_CORRECTION_CONFIRM_API_UNAVAILABLE",
        message: error?.message ?? String(error),
      },
      confirmation: null,
    };
  }
}

export async function linkOfficeInventoryCorrectionAttachments(input = {}, options = {}) {
  const { authState, operatorId, correctionDraftId, attachmentIds = [], remark = "" } = input;
  const safeCorrectionDraftId = cleanText(correctionDraftId);
  const safeAttachmentIds = [...new Set((Array.isArray(attachmentIds) ? attachmentIds : []).map(cleanText).filter(Boolean))];
  if (!safeCorrectionDraftId || !safeAttachmentIds.length) {
    return {
      source: "client_validation",
      blocked: true,
      error: {
        code: !safeCorrectionDraftId
          ? "INVENTORY_CORRECTION_DRAFT_ID_REQUIRED"
          : "INVENTORY_CORRECTION_ATTACHMENT_REQUIRED",
        message: !safeCorrectionDraftId ? "缺少库存修正草稿 ID。" : "请先上传库存修正凭证。",
      },
      linkage: null,
    };
  }

  try {
    const response = await requestInventoryApi(
      `/inventory/correction-drafts/${encodeURIComponent(safeCorrectionDraftId)}/attachments`,
      {
        ...options,
        idempotencyKey: input.idempotencyKey ?? options.idempotencyKey,
        authState,
        method: "POST",
        operatorId,
        body: {
          correctionDraftId: safeCorrectionDraftId,
          attachmentIds: safeAttachmentIds,
          remark,
          operatorId,
        },
      },
    );
    const json = await readJson(response);
    if (!response.ok) {
      return {
        source: "api_error",
        blocked: true,
        error: toApiError(json, response.status, "库存修正凭证关联 API 返回错误。"),
        linkage: null,
      };
    }
    if (json?.correctionDraftId !== safeCorrectionDraftId || !Array.isArray(json.attachmentIds)
      || json.attachmentIds.some(id => typeof id !== "string" || !id.trim())
      || new Set(json.attachmentIds).size !== json.attachmentIds.length
      || safeAttachmentIds.some(id => !json.attachmentIds.includes(id))
      || !Number.isSafeInteger(json.revision) || json.revision < 1) {
      return {source:"api_error",blocked:true,error:{code:"INVENTORY_CORRECTION_ATTACHMENT_LINK_UNCONFIRMED",message:"凭证关联结果不完整，请保留原凭证并重试核对。"},linkage:null};
    }
    return {
      source: "api",
      linkage: {
        correctionDraftId: cleanText(json.correctionDraftId) || safeCorrectionDraftId,
        attachmentIds: Array.isArray(json.attachmentIds) ? json.attachmentIds.map(cleanText).filter(Boolean) : safeAttachmentIds,
        revision: toNumber(json.revision, 1),
        unchanged: Boolean(json.unchanged),
        operationLogId: cleanText(json.operationLogId),
      },
      response: json,
    };
  } catch (error) {
    return buildServerRequiredWriteError("INVENTORY_CORRECTION_ATTACHMENT_LINK_API_UNAVAILABLE", error, {
      linkage: null,
    });
  }
}

export async function createOfficeInventoryCorrectionDraft(input, options = {}) {
  const {
    authState,
    stock,
    expectedQty = stock?.onHandQty ?? stock?.inStock,
    actualQty,
    reason,
    operatorId,
    remark,
  } = input;
  const normalizedActualQty = parseCorrectionQuantity(actualQty);
  const normalizedExpectedQty = parseCorrectionQuantity(expectedQty);
  if (normalizedActualQty === null || normalizedExpectedQty === null) {
    return {
      source: "api_error",
      blocked: true,
      error: { code: "VALIDATION_ERROR", message: "系统数量和实盘数量必须是明确填写的非负整数。" },
      draft: null,
    };
  }

  try {
    const response = await requestInventoryApi("/inventory/correction-drafts", {
      ...options,
      idempotencyKey: input.idempotencyKey ?? options.idempotencyKey,
      authState,
      method: "POST",
      operatorId,
      body: {
        inventoryItemId: stock?.id,
        expectedQty: normalizedExpectedQty,
        actualQty: normalizedActualQty,
        reason: mapInventoryCorrectionReason(reason),
        remark: remark ?? reason ?? "",
        attachmentIds: [],
        operatorId,
      },
    });
    const json = await readJson(response);

    if (!response.ok) {
      return {
        source: "api_error",
        blocked: true,
        error: toApiError(json, response.status, "库存修正草稿 API 返回错误。"),
        draft: null,
      };
    }

    return {
      source: "api",
      draft: mapApiCorrectionDraftToLocalDraft(json, { stock, reason }),
      response: json,
      operationLogId: json.operationLogId,
      todoId: json.todoId,
    };
  } catch (error) {
    if (isOfficeApiServerRequired(options)) {
      return buildServerRequiredWriteError("INVENTORY_CORRECTION_API_UNAVAILABLE", error, { draft: null });
    }
    return {
      source: "local_fallback",
      error: {
        code: "INVENTORY_CORRECTION_API_UNAVAILABLE",
        message: error?.message ?? String(error),
      },
      draft: createLocalCorrectionDraft({ stock, actualQty: normalizedActualQty, reason }),
    };
  }
}

function parseCorrectionQuantity(value) {
  if (typeof value !== "number" && typeof value !== "string") return null;
  if (typeof value === "string" && !value.trim()) return null;
  const quantity = Number(value);
  return Number.isSafeInteger(quantity) && quantity >= 0 ? quantity : null;
}

export function mapInventoryCorrectionReason(reason) {
  const value = cleanText(reason);
  if (Object.hasOwn(reasonCodeByLabel, value)) return reasonCodeByLabel[value];
  return Object.hasOwn(reasonLabelByCode, value) ? value : "manual_review";
}

function mapInventoryCorrectionReasonLabel(reason) {
  const text = cleanText(reason);
  return Object.hasOwn(reasonLabelByCode, text) ? reasonLabelByCode[text] : text;
}

export function mapApiInventoryLedgerEntryToLocal(entry) {
  if (!entry || typeof entry !== "object") return null;
  const ledgerId = cleanText(entry.ledgerId ?? entry.id);
  const inventoryItemId = cleanText(entry.inventoryItemId ?? entry.inventory_item_id);
  if (!ledgerId || !inventoryItemId) return null;
  return {
    ledgerId,
    id: ledgerId,
    inventoryItemId,
    inventoryKey: cleanText(entry.inventoryKey ?? entry.inventory_key),
    size: cleanText(entry.size),
    color: cleanText(entry.color ?? entry.colorName ?? entry.color_name),
    colorName: cleanText(entry.colorName ?? entry.color_name ?? entry.color),
    handleType: cleanText(entry.handleType ?? entry.handle_type),
    handle: cleanText(entry.handle ?? entry.handleType ?? entry.handle_type),
    style: cleanText(entry.style),
    zone: cleanText(entry.zone),
    inventoryState: cleanText(entry.inventoryState ?? entry.inventory_state),
    trustLevel: cleanText(entry.trustLevel ?? entry.trust_level),
    changeType: cleanText(entry.changeType ?? entry.change_type),
    qtyBefore: toNumber(entry.qtyBefore ?? entry.qty_before, 0),
    qtyChange: toNumber(entry.qtyChange ?? entry.qty_change, 0),
    qtyAfter: toNumber(entry.qtyAfter ?? entry.qty_after, 0),
    sourceType: cleanText(entry.sourceType ?? entry.source_type),
    sourceId: cleanText(entry.sourceId ?? entry.source_id),
    operatorId: cleanText(entry.operatorId ?? entry.operator_id),
    operatorName: cleanText(entry.operatorName ?? entry.operator_name),
    confirmedBy: cleanText(entry.confirmedBy ?? entry.confirmed_by),
    confirmedByName: cleanText(entry.confirmedByName ?? entry.confirmed_by_name),
    occurredAt: cleanText(entry.occurredAt ?? entry.occurred_at),
    createdAt: cleanText(entry.createdAt ?? entry.created_at),
    reason: cleanText(entry.reason),
    remark: cleanText(entry.remark),
  };
}

export function mapApiInventoryItemToLocal(item) {
  if (!item || typeof item !== "object") return null;
  const id = cleanText(item.id ?? item.inventoryItemId ?? item.inventory_item_id);
  if (!id) return null;
  const quantities = item.quantities ?? {};
  const trustLevel = cleanText(item.trustLevel ?? item.trust_level);
  const state = mapInventoryItemState(item.state, item.sourceSummary ?? item.source_summary);
  const estimated =
    item.estimated === true ||
    trustLevel === "estimated" ||
    trustLevel === "pending_review" ||
    state.includes("估算") ||
    state.includes("待复核");
  return {
    id,
    category: cleanText(item.category),
    goodsType: cleanText(item.goodsType),
    pattern: cleanText(item.pattern),
    inventoryKey: cleanText(item.inventoryKey ?? item.inventory_key) || id,
    size: cleanText(item.size),
    color: cleanText(item.color ?? item.colorName ?? item.color_name),
    handle: cleanText(item.handle ?? item.handleType ?? item.handle_type),
    handleType: cleanText(item.handleType ?? item.handle_type ?? item.handle),
    style: cleanText(item.style),
    zone: cleanText(item.zone),
    state,
    inStock: toNumber(item.inStock ?? item.onHand ?? item.on_hand ?? quantities.onHand ?? quantities.on_hand, 0),
    reserved: toNumber(item.reserved ?? item.reservedQty ?? item.reserved_qty ?? quantities.reserved ?? quantities.reservedQty ?? quantities.reserved_qty, 0),
    locked: toNumber(item.locked ?? item.waitingPickupLocked ?? item.waiting_pickup_locked ?? quantities.waitingPickupLocked ?? quantities.waiting_pickup_locked, 0),
    pending: toNumber(item.pending ?? item.pendingHandling ?? item.pending_handling ?? quantities.pendingHandling ?? quantities.pending_handling, 0),
    estimated,
    trustLevel,
    sourceSummary: cleanText(item.sourceSummary ?? item.source_summary),
    updatedAt: cleanText(item.updatedAt ?? item.updated_at),
  };
}

export function mapApiInventoryCorrectionDetailToLocal(detail) {
  if (!detail || typeof detail !== "object") return null;
  const correctionDraftId = cleanText(detail.correctionDraftId ?? detail.id);
  if (!correctionDraftId) return null;
  const inventoryItem = detail.inventoryItem ?? {};
  const qtyBefore = detail.qtyBefore ?? {};
  const requestedQtyAfter = detail.requestedQtyAfter ?? detail.qtyAfter ?? {};
  const systemQty = toNumber(qtyBefore.onHand ?? qtyBefore.on_hand ?? detail.systemQty ?? detail.system_qty, 0);
  const actualQty = toNumber(requestedQtyAfter.onHand ?? requestedQtyAfter.on_hand ?? detail.actualQty ?? detail.actual_qty, systemQty);
  const ledger = mapApiInventoryLedgerEntryToLocal(detail.ledger);
  return {
    id: correctionDraftId,
    correctionDraftId,
    inventoryItemId: cleanText(detail.inventoryItemId ?? detail.inventory_item_id),
    stockKey: cleanText(detail.stockKey ?? detail.stock_key) || formatStockKey({
      size: inventoryItem.size ?? detail.size,
      color: inventoryItem.color ?? detail.color ?? detail.colorName,
      handle: inventoryItem.handle ?? inventoryItem.handleType ?? detail.handle ?? detail.handleType,
      style: inventoryItem.style ?? detail.style,
    }),
    zone: cleanText(inventoryItem.zone ?? detail.zone),
    status: cleanText(detail.status) || "状态待确认",
    systemQty,
    actualQty,
    diff: actualQty - systemQty,
    reason: mapInventoryCorrectionReasonLabel(detail.reason),
    remark: cleanText(detail.remark),
    operatorId: cleanText(detail.operatorId ?? detail.operator_id),
    operatorName: cleanText(detail.operatorName ?? detail.operator_name),
    confirmedBy: cleanText(detail.confirmedBy ?? detail.confirmed_by),
    confirmedByName: cleanText(detail.confirmedByName ?? detail.confirmed_by_name),
    todoId: cleanText(detail.todoId ?? detail.todo_id),
    attachmentIds: Array.isArray(detail.attachmentIds) ? detail.attachmentIds : [],
    createdAt: cleanText(detail.createdAt ?? detail.created_at),
    updatedAt: cleanText(detail.updatedAt ?? detail.updated_at),
    confirmedAt: cleanText(detail.confirmedAt ?? detail.confirmed_at),
    ledger,
    operationLogs: Array.isArray(detail.operationLogs)
      ? detail.operationLogs.map(mapApiOperationLogToLocal).filter(Boolean)
      : [],
  };
}

export function mapApiInventoryCorrectionDraftSummaryToLocal(draft) {
  return mapApiInventoryCorrectionDetailToLocal({
    ...draft,
    operationLogs: Array.isArray(draft?.operationLogs) ? draft.operationLogs : [],
  });
}

export function mapApiInventoryCorrectionConfirmToLocal(response) {
  if (!response || typeof response !== "object") return null;
  const correctionDraftId = cleanText(response.correctionDraftId ?? response.id);
  if (!correctionDraftId) return null;
  const qtyBefore = response.qtyBefore ?? {};
  const qtyAfter = response.qtyAfter ?? {};
  const systemQty = toNumber(qtyBefore.onHand ?? qtyBefore.on_hand, 0);
  const actualQty = toNumber(qtyAfter.onHand ?? qtyAfter.on_hand, systemQty);
  return {
    id: correctionDraftId,
    correctionDraftId,
    inventoryItemId: cleanText(response.inventoryItemId ?? response.inventory_item_id),
    status: "已确认生效",
    systemQty,
    actualQty,
    diff: actualQty - systemQty,
    ledger: mapApiInventoryLedgerEntryToLocal(response.ledger),
    todo: response.todo ?? null,
    operationLogId: cleanText(response.operationLogId ?? response.operation_log_id),
  };
}

export function mapApiCorrectionDraftToLocalDraft(response, { stock, reason } = {}) {
  const systemQty = Number(response?.qtyBefore?.onHand ?? stock?.inStock ?? 0);
  const actualQty = Number(response?.requestedQtyAfter?.onHand ?? systemQty);
  return {
    id: response?.correctionDraftId,
    correctionDraftId: response?.correctionDraftId,
    inventoryItemId: response?.inventoryItemId ?? stock?.id ?? "",
    stockKey: formatStockKey(stock),
    zone: stock?.zone ?? "",
    systemQty,
    actualQty,
    diff: actualQty - systemQty,
    reason: reason ?? response?.reason ?? "",
    remark: response?.remark ?? "",
    status: response?.status ?? "待确认生效",
    revision: toNumber(response?.revision, 1),
    attachmentIds: Array.isArray(response?.attachmentIds) ? response.attachmentIds.map(cleanText).filter(Boolean) : [],
    source: "api",
    todoId: response?.todoId,
    operationLogId: response?.operationLogId,
    createdAt: response?.createdAt ?? "",
    updatedAt: response?.updatedAt ?? "",
  };
}

function mapApiOperationLogToLocal(log) {
  if (!log || typeof log !== "object") return null;
  const id = cleanText(log.operationLogId ?? log.id);
  if (!id) return null;
  return {
    id,
    operationLogId: id,
    targetType: cleanText(log.targetType ?? log.target_type),
    targetId: cleanText(log.targetId ?? log.target_id),
    action: cleanText(log.action),
    reason: mapInventoryCorrectionReasonLabel(log.reason),
    operatorId: cleanText(log.operatorId ?? log.operator_id),
    createdAt: cleanText(log.createdAt ?? log.created_at ?? log.occurredAt ?? log.occurred_at),
  };
}

function createLocalCorrectionDraft({ stock, actualQty, reason }) {
  const systemQty = Number(stock?.inStock ?? 0);
  const correctionDraftId = `ADJ-FE-${Date.now().toString(36).toUpperCase()}-${Math.floor(Math.random() * 1000)}`;
  return {
    id: correctionDraftId,
    correctionDraftId,
    inventoryItemId: stock?.id ?? "",
    stockKey: formatStockKey(stock),
    zone: stock?.zone ?? "",
    systemQty,
    actualQty: Number(actualQty ?? systemQty),
    diff: Number(actualQty ?? systemQty) - systemQty,
    reason,
    status: "待确认生效",
    source: "local_fallback",
  };
}

function createLocalInventoryCorrectionDetail({
  correctionDraftId,
  sourceEntry,
  localCorrectionDrafts = [],
  localLedgerEntries = [],
}) {
  const draft = localCorrectionDrafts.find((item) => item.id === correctionDraftId || item.correctionDraftId === correctionDraftId);
  const ledger =
    mapApiInventoryLedgerEntryToLocal(sourceEntry) ??
    localLedgerEntries
      .map(mapApiInventoryLedgerEntryToLocal)
      .find((entry) => entry?.sourceId === correctionDraftId || entry?.correctionDraftId === correctionDraftId);
  const systemQty = toNumber(draft?.systemQty ?? ledger?.qtyBefore, 0);
  const actualQty = toNumber(draft?.actualQty ?? ledger?.qtyAfter, systemQty);
  return {
    id: correctionDraftId,
    correctionDraftId,
    inventoryItemId: cleanText(draft?.inventoryItemId ?? ledger?.inventoryItemId),
    stockKey: cleanText(draft?.stockKey) || formatStockKey(ledger),
    zone: cleanText(draft?.zone ?? ledger?.zone),
    status: cleanText(draft?.status) || (ledger ? "已确认生效" : "详情待同步"),
    systemQty,
    actualQty,
    diff: actualQty - systemQty,
    reason: mapInventoryCorrectionReasonLabel(draft?.reason ?? ledger?.reason),
    remark: cleanText(draft?.remark ?? ledger?.remark),
    operatorId: cleanText(draft?.operatorId ?? ledger?.operatorId),
    operatorName: cleanText(draft?.operatorName ?? ledger?.operatorName),
    confirmedBy: cleanText(draft?.confirmedBy ?? ledger?.confirmedBy),
    confirmedByName: cleanText(draft?.confirmedByName ?? ledger?.confirmedByName),
    todoId: cleanText(draft?.todoId),
    attachmentIds: Array.isArray(draft?.attachmentIds) ? draft.attachmentIds : [],
    createdAt: cleanText(draft?.createdAt ?? ledger?.createdAt),
    updatedAt: cleanText(draft?.updatedAt),
    confirmedAt: cleanText(draft?.confirmedAt ?? ledger?.occurredAt),
    ledger,
    operationLogs: [],
  };
}

function buildInventoryLedgerQuery({ page, pageSize, filters = {} }) {
  const params = new URLSearchParams();
  params.set("page", String(page));
  params.set("pageSize", String(pageSize));
  for (const [key, value] of Object.entries(filters ?? {})) {
    const text = cleanText(value);
    if (text) params.set(key, text);
  }
  const query = params.toString();
  return query ? `?${query}` : "";
}

function buildInventoryItemsQuery({ page, pageSize, filters = {} }) {
  const params = new URLSearchParams();
  params.set("page", String(page));
  params.set("pageSize", String(pageSize));
  for (const [key, value] of Object.entries(filters ?? {})) {
    const text = cleanText(value);
    if (text) params.set(key, text);
  }
  const query = params.toString();
  return query ? `?${query}` : "";
}

function buildInventoryCorrectionDraftsQuery({ page, pageSize, filters = {} }) {
  const params = new URLSearchParams();
  params.set("page", String(page));
  params.set("pageSize", String(pageSize));
  for (const [key, value] of Object.entries(filters ?? {})) {
    const text = cleanText(value);
    if (text) params.set(key, text);
  }
  const query = params.toString();
  return query ? `?${query}` : "";
}

function filterLocalInventoryLedgerEntries(items, filters = {}) {
  return items.filter((entry) => {
    const inventoryItemId = cleanText(filters.inventoryItemId);
    if (inventoryItemId && entry.inventoryItemId !== inventoryItemId) return false;
    const sourceType = cleanText(filters.sourceType);
    if (sourceType && sourceType !== "全部" && entry.sourceType !== sourceType) return false;
    const sourceId = cleanText(filters.sourceId);
    if (sourceId && entry.sourceId !== sourceId) return false;
    const changeType = cleanText(filters.changeType);
    if (changeType && changeType !== "全部" && entry.changeType !== changeType) return false;
    const keyword = cleanText(filters.keyword).toLowerCase();
    if (keyword) {
      const haystack = [
        entry.ledgerId,
        entry.inventoryItemId,
        entry.inventoryKey,
        entry.size,
        entry.color,
        entry.colorName,
        entry.handle,
        entry.handleType,
        entry.style,
        entry.zone,
        entry.inventoryState,
        entry.changeType,
        entry.sourceType,
        entry.sourceId,
        entry.operatorId,
        entry.operatorName,
        entry.reason,
        entry.remark,
      ]
        .join(" ")
        .toLowerCase();
      if (!haystack.includes(keyword)) return false;
    }
    return matchesInventoryLedgerDateRange(entry, filters);
  });
}

function filterLocalInventoryCorrectionDrafts(items, filters = {}) {
  return items.filter((item) => {
    const status = cleanText(filters.status);
    if (status && status !== "全部" && item.status !== status) return false;
    const inventoryItemId = cleanText(filters.inventoryItemId);
    if (inventoryItemId && item.inventoryItemId !== inventoryItemId) return false;
    const keyword = cleanText(filters.keyword).toLowerCase();
    if (keyword) {
      const haystack = [
        item.id,
        item.correctionDraftId,
        item.inventoryItemId,
        item.stockKey,
        item.zone,
        item.status,
        item.reason,
        item.remark,
        item.operatorId,
        item.operatorName,
        item.confirmedBy,
        item.confirmedByName,
        item.todoId,
      ]
        .join(" ")
        .toLowerCase();
      if (!haystack.includes(keyword)) return false;
    }
    return true;
  });
}

function matchesInventoryLedgerDateRange(entry, filters = {}) {
  const occurred = new Date(entry.occurredAt || entry.createdAt);
  if (Number.isNaN(occurred.getTime())) return true;
  const dateFrom = cleanText(filters.dateFrom);
  if (dateFrom) {
    const from = new Date(`${dateFrom}T00:00:00`);
    if (!Number.isNaN(from.getTime()) && occurred < from) return false;
  }
  const dateTo = cleanText(filters.dateTo);
  if (dateTo) {
    const to = new Date(`${dateTo}T23:59:59.999`);
    if (!Number.isNaN(to.getTime()) && occurred > to) return false;
  }
  return true;
}

function filterLocalInventoryItems(items, filters = {}) {
  return items.filter((item) => {
    const keyword = cleanText(filters.keyword).toLowerCase();
    if (keyword) {
      const haystack = [
        item.id,
        item.inventoryKey,
        item.size,
        item.color,
        item.handle,
        item.handleType,
        item.style,
        item.zone,
        item.state,
        item.sourceSummary,
      ]
        .join(" ")
        .toLowerCase();
      if (!haystack.includes(keyword)) return false;
    }
    if (cleanText(filters.size) && item.size !== cleanText(filters.size)) return false;
    if (cleanText(filters.color) && item.color !== cleanText(filters.color)) return false;
    if (cleanText(filters.handleType) && item.handle !== cleanText(filters.handleType)) return false;
    if (cleanText(filters.style) && item.style !== cleanText(filters.style)) return false;
    return true;
  });
}

function mapInventoryItemState(value, sourceSummary = "") {
  const state = cleanText(value);
  if (!state) return cleanText(sourceSummary) || "仓库已清点";
  const labels = {
    available: "仓库已清点",
    reserved: "已占用",
    waiting_pickup_locked: "待提货锁定",
    pending_handling: "待处理/报废",
    pending_scrap: "待处理/报废",
    counted: "仓库已清点",
    workshop_reported: "车间报数/散装",
    estimated: "估算/待复核",
    pending_review: "估算/待复核",
  };
  return labels[state] || state;
}

function formatStockKey(stock) {
  if (!stock) return "";
  return `${stock.size} / ${stock.color} / ${stock.handle} / ${stock.style}`;
}

function cleanText(value) {
  return String(value ?? "").trim();
}

function toNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}
