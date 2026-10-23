import { useCallback, useEffect, useRef } from "react";
import {
  getOfficeInventoryCorrectionDetail,
  listOfficeInventoryCorrectionDrafts,
  listOfficeInventoryLedgerEntries,
  listOfficeInventoryIntents,
  listOfficeTemporaryInventoryHolds,
} from "../services/officeInventoryLazyApi.js";
import { isOfficeApiServerRequired } from "../services/officeAuthService.js";

function formatSyncTime() {
  return new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
}

function withFeedback(result, showToast, feedback) {
  return showToast ? { ...result, feedback } : result;
}

function normalizeReadResultForRuntime(result, { label, serverRequired }) {
  const safeResult = result ?? {};
  if (!serverRequired() || safeResult.source === "api") return safeResult;
  return {
    ...safeResult,
    blocked: true,
    upstreamSource: safeResult.source,
    source: "api_error",
    error: {
      code: safeResult.error?.code ?? "INVENTORY_READ_SERVER_REQUIRED",
      message: safeResult.error?.message ?? `生产模式要求从后端读取${label}。`,
      ...(safeResult.error?.requiredPermission
        ? { requiredPermission: safeResult.error.requiredPermission }
        : {}),
    },
  };
}

function getErrorMessage(result, fallbackMessage) {
  if (result?.error?.requiredPermission) return `缺少权限 ${result.error.requiredPermission}`;
  return result?.error?.message ?? fallbackMessage;
}

export function buildInventoryLedgerApiFilters(stockId, filters = {}) {
  const next = { inventoryItemId: String(stockId ?? "").trim() };
  const keyword = String(filters.keyword ?? "").trim();
  const changeType = String(filters.changeType ?? "").trim();
  const sourceType = String(filters.sourceType ?? "").trim();
  const dateFrom = String(filters.dateFrom ?? "").trim();
  const dateTo = String(filters.dateTo ?? "").trim();
  if (keyword) next.keyword = keyword;
  if (changeType && changeType !== "全部") next.changeType = changeType;
  if (sourceType && sourceType !== "全部") next.sourceType = sourceType;
  if (dateFrom) next.dateFrom = dateFrom;
  if (dateTo) next.dateTo = dateTo;
  return next;
}

const defaultApi = {
  getOfficeInventoryCorrectionDetail,
  listOfficeInventoryCorrectionDrafts,
  listOfficeInventoryLedgerEntries,
  listOfficeInventoryIntents,
  listOfficeTemporaryInventoryHolds,
};

export function createOfficeInventoryDetailReadActions({
  api = defaultApi,
  intentReadRevisionRef = { current: 0 },
  correctionDetailRevisionRef = { current: 0 },
  ledgerReadRevisionRef = { current: 0 },
  correctionQueueRevisionRef = { current: 0 },
  isInventoryReadOwnerCurrent = () => true,
  authState,
  currentUserId,
  inventoryCorrectionDraftsRef,
  inventoryLedgerEntriesRef,
  inventoryLedgerFiltersRef,
  selectedStockIdRef,
  serverRequired = isOfficeApiServerRequired,
  setInventoryCorrectionDrafts,
  setInventoryCorrectionDetailState,
  setInventoryCorrectionQueueState,
  setInventoryLedgerState,
  setInventoryIntentState,
}) {
  async function loadInventoryCorrectionDetail(correctionDraftId, sourceEntry = null, { showToast = false } = {}) {
    if (!isInventoryReadOwnerCurrent()) return { stale: true, feedback: "" };
    const revision = ++correctionDetailRevisionRef.current;
    const safeCorrectionDraftId = String(correctionDraftId ?? "").trim();
    if (!safeCorrectionDraftId) {
      const feedback = "库存流水缺少修正草稿 ID，无法查看修正详情。";
      setInventoryCorrectionDetailState((current) => ({
        ...current,
        detail: null,
        requestedId: "",
        loading: false,
        error: feedback,
      }));
      return withFeedback(
        { source: "ui_error", blocked: true, detail: null, error: { code: "INVENTORY_CORRECTION_DRAFT_ID_REQUIRED", message: feedback } },
        showToast,
        feedback,
      );
    }

    setInventoryCorrectionDetailState((current) => ({
      ...current,
      requestedId: safeCorrectionDraftId,
      detail: null,
      loading: true,
      error: "",
    }));
    let result;
    try {
      result = normalizeReadResultForRuntime(
      await api.getOfficeInventoryCorrectionDetail({
        authState,
        operatorId: currentUserId,
        correctionDraftId: safeCorrectionDraftId,
        sourceEntry,
        localCorrectionDrafts: inventoryCorrectionDraftsRef.current,
        localLedgerEntries: inventoryLedgerEntriesRef.current,
      }),
      { label: "库存修正详情", serverRequired },
    );
    } catch {
      result = { source: "api_error", blocked: true, error: { code: "INVENTORY_CORRECTION_READ_FAILED", message: "库存修正详情读取失败，请重新打开该单据。" } };
    }
    if (result.detail && String(result.detail.correctionDraftId ?? result.detail.id ?? "") !== safeCorrectionDraftId) {
      result = { source: "api_error", blocked: true, error: { code: "INVENTORY_CORRECTION_DETAIL_MISMATCH", message: "返回的库存修正单与当前请求不一致，请刷新核对。" } };
    }
    if (!isInventoryReadOwnerCurrent() || revision !== correctionDetailRevisionRef.current) return { stale: true, feedback: "" };
    const lastSyncedAt = formatSyncTime();
    if (result.blocked || !result.detail) {
      const errorMessage = getErrorMessage(result, "库存修正详情 API 返回错误。");
      setInventoryCorrectionDetailState({
        source: result.source,
        detail: null,
        requestedId: safeCorrectionDraftId,
        loading: false,
        error: errorMessage,
        lastSyncedAt,
      });
      return withFeedback({ ...result, blocked: true }, showToast, `库存修正详情读取失败：${errorMessage || "未知错误"}。`);
    }

    setInventoryCorrectionDetailState({
      source: result.source,
      detail: result.detail,
      requestedId: safeCorrectionDraftId,
      loading: false,
      error: result.error?.message ?? "",
      lastSyncedAt,
    });
    const sourceLabel = result.source === "api" ? "后端 API" : "本地降级";
    return withFeedback(result, showToast, `已通过${sourceLabel}打开库存修正 ${safeCorrectionDraftId}。`);
  }

  async function refreshInventoryLedgerEntries({
    stockId = selectedStockIdRef.current,
    filters = inventoryLedgerFiltersRef.current,
    showToast = false,
  } = {}) {
    if (!isInventoryReadOwnerCurrent()) return { stale: true, feedback: "" };
    const revision = ++ledgerReadRevisionRef.current;
    const safeStockId = String(stockId ?? "").trim();
    if (!safeStockId) {
      setInventoryLedgerState((current) => ({
        ...current,
        items: [],
        total: 0,
        loading: false,
        error: "未选择库存键。",
      }));
      return null;
    }

    setInventoryLedgerState((current) => ({ ...current, items: [], total: 0, loading: true, error: "" }));
    let result;
    try {
      result = normalizeReadResultForRuntime(
      await api.listOfficeInventoryLedgerEntries({
        authState,
        operatorId: currentUserId,
        pageSize: 20,
        filters: buildInventoryLedgerApiFilters(safeStockId, filters),
        localLedgerEntries: [],
      }),
      { label: "库存流水", serverRequired },
    );

    } catch {
      result = { source: "api_error", blocked: true, error: { code: "INVENTORY_LEDGER_READ_FAILED", message: "库存流水读取失败，请重新刷新。" } };
    }
    if (!result.blocked && (!Array.isArray(result.items) || result.items.some(item => !item || item.inventoryItemId !== safeStockId))) {
      result = { source: "api_error", blocked: true, error: { code: "INVENTORY_LEDGER_RESPONSE_MISMATCH", message: "库存流水返回不完整或与当前库存不一致，请刷新核对。" } };
    }
    if (!isInventoryReadOwnerCurrent() || revision !== ledgerReadRevisionRef.current) return { stale: true, feedback: "" };
    if (result.blocked) {
      const errorMessage = getErrorMessage(result, "库存流水 API 返回错误。");
      setInventoryLedgerState((current) => ({
        ...current,
        source: result.source,
        items: [],
        total: 0,
        loading: false,
        error: errorMessage,
        filters,
      }));
      return withFeedback(result, showToast, `库存流水刷新失败：${errorMessage || "未知错误"}。`);
    }

    setInventoryLedgerState({
      source: result.source,
      items: result.items ?? [],
      total: result.total ?? result.items?.length ?? 0,
      loading: false,
      error: result.error?.message ?? "",
      lastSyncedAt: formatSyncTime(),
      filters,
    });
    const sourceLabel = result.source === "api" ? "后端 API" : "本地规则降级";
    return withFeedback(
      result,
      showToast,
      `库存流水已通过${sourceLabel}刷新，共 ${result.total ?? result.items?.length ?? 0} 条。`,
    );
  }

  async function refreshInventoryCorrectionQueue({ filters = { status: "待确认生效" }, showToast = false } = {}) {
    if (!isInventoryReadOwnerCurrent()) return { stale: true, feedback: "" };
    const revision = ++correctionQueueRevisionRef.current;
    setInventoryCorrectionQueueState((current) => ({ ...current, loading: true, error: "" }));
    let result;
    try {
      result = normalizeReadResultForRuntime(
      await api.listOfficeInventoryCorrectionDrafts({
        authState,
        operatorId: currentUserId,
        pageSize: 20,
        filters,
        localCorrectionDrafts: inventoryCorrectionDraftsRef.current,
      }),
      { label: "库存修正确认队列", serverRequired },
    );

    } catch {
      result = { source: "api_error", blocked: true, error: { code: "INVENTORY_CORRECTION_QUEUE_READ_FAILED", message: "库存修正队列读取失败，请重新刷新。" } };
    }
    if (!isInventoryReadOwnerCurrent() || revision !== correctionQueueRevisionRef.current) return { stale: true, feedback: "" };
    if (!result.blocked && !Array.isArray(result.items)) result = { source: "api_error", blocked: true, error: { code: "INVENTORY_CORRECTION_QUEUE_INVALID", message: "库存修正队列返回不完整，请重新刷新。" } };
    if (result.blocked) {
      const errorMessage = getErrorMessage(result, "库存修正确认队列 API 返回错误。");
      setInventoryCorrectionQueueState((current) => ({
        ...current,
        source: result.source,
        items: [],
        total: 0,
        loading: false,
        error: errorMessage,
        filters,
      }));
      return withFeedback(result, showToast, `库存修正确认队列刷新失败：${errorMessage || "未知错误"}。`);
    }

    const items = result.items ?? [];
    setInventoryCorrectionQueueState((current) => ({
      ...current,
      source: result.source,
      items,
      total: result.total ?? items.length,
      loading: false,
      error: result.error?.message ?? "",
      lastSyncedAt: formatSyncTime(),
      filters,
    }));
    if (result.source === "api") setInventoryCorrectionDrafts(items);
    const sourceLabel = result.source === "api" ? "后端 API" : "本地规则降级";
    return withFeedback(
      result,
      showToast,
      `库存修正确认队列已通过${sourceLabel}刷新，共 ${result.total ?? items.length} 条。`,
    );
  }

  async function refreshInventoryIntents({ showToast = false } = {}) {
    if (!isInventoryReadOwnerCurrent()) return { stale: true, feedback: "" };
    const revision = ++intentReadRevisionRef.current;
    setInventoryIntentState((current) => ({ ...current, loading: true, error: "" }));
    const results = await Promise.allSettled([
      Promise.resolve().then(() => api.listOfficeInventoryIntents({ authState, operatorId: currentUserId })),
      Promise.resolve().then(() => api.listOfficeTemporaryInventoryHolds({ authState, operatorId: currentUserId })),
    ]);
    const [intentResult, holdResult] = results.map(result => result.status === "fulfilled" ? result.value : {
      source: "api_error", blocked: true, error: { code: "INVENTORY_INTENT_READ_FAILED", message: "库存意图或留货读取失败，请重新刷新。" },
    });
    if (!isInventoryReadOwnerCurrent() || revision !== intentReadRevisionRef.current) return { source: "api", stale: true, feedback: "" };
    const blocked = !Array.isArray(intentResult?.items) || !Array.isArray(holdResult?.items)
      || intentResult?.blocked || holdResult?.blocked
      || (serverRequired() && (intentResult?.source !== "api" || holdResult?.source !== "api"));
    const lastSyncedAt = formatSyncTime();
    if (blocked) {
      const errorMessage = getErrorMessage(intentResult?.blocked ? intentResult : holdResult, "库存意图队列 API 返回错误。");
      setInventoryIntentState((current) => ({
        ...current,
        source: "api_error",
        items: [],
        holds: [],
        loading: false,
        error: errorMessage,
        lastSyncedAt,
      }));
      return withFeedback({ source: "api_error", blocked: true, error: { message: errorMessage } }, showToast, `库存意图队列刷新失败：${errorMessage}。`);
    }
    const items = intentResult.items ?? [];
    const holds = holdResult.items ?? [];
    setInventoryIntentState((current) => ({
      ...current,
      source: "api",
      items,
      holds,
      loading: false,
      error: "",
      lastSyncedAt,
    }));
    return withFeedback({ source: "api", items, holds }, showToast, `库存意图和临时留货已刷新，共 ${items.length} 条意图、${holds.length} 条留货。`);
  }

  return { loadInventoryCorrectionDetail, refreshInventoryCorrectionQueue, refreshInventoryIntents, refreshInventoryLedgerEntries };
}

export function useOfficeInventoryDetailReads(options) {
  const intentReadRevisionRef = useRef(0);
  const correctionDetailRevisionRef = useRef(0);
  const ledgerReadRevisionRef = useRef(0);
  const correctionQueueRevisionRef = useRef(0);
  const mountedRef = useRef(true);
  useEffect(() => { mountedRef.current = true; return () => { mountedRef.current = false; }; }, []);
  const ownerKey = JSON.stringify([options.currentUserId, options.authState?.session?.accessToken]);
  const ownerRef = useRef({ key: ownerKey });
  if (ownerRef.current.key !== ownerKey) ownerRef.current = { key: ownerKey };
  const owner = ownerRef.current;
  const actions = createOfficeInventoryDetailReadActions({ ...options, intentReadRevisionRef, correctionDetailRevisionRef, ledgerReadRevisionRef, correctionQueueRevisionRef,
    isInventoryReadOwnerCurrent: () => mountedRef.current && ownerRef.current === owner,
  });
  const {
    authState,
    currentUserId,
    inventoryCorrectionDraftsRef,
    inventoryLedgerEntriesRef,
    inventoryLedgerFiltersRef,
    selectedStockIdRef,
    serverRequired,
  } = options;
  return {
    loadInventoryCorrectionDetail: useCallback(actions.loadInventoryCorrectionDetail, [
      authState,
      currentUserId,
      inventoryCorrectionDraftsRef,
      inventoryLedgerEntriesRef,
      serverRequired,
    ]),
    refreshInventoryLedgerEntries: useCallback(actions.refreshInventoryLedgerEntries, [
      authState,
      currentUserId,
      inventoryLedgerFiltersRef,
      selectedStockIdRef,
      serverRequired,
    ]),
    refreshInventoryCorrectionQueue: useCallback(actions.refreshInventoryCorrectionQueue, [
      authState,
      currentUserId,
      inventoryCorrectionDraftsRef,
      serverRequired,
    ]),
    refreshInventoryIntents: useCallback(actions.refreshInventoryIntents, [
      authState,
      currentUserId,
      serverRequired,
    ]),
  };
}
