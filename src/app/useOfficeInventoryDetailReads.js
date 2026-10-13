import { useCallback } from "react";
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
      loading: true,
      error: "",
    }));
    const result = normalizeReadResultForRuntime(
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
      return withFeedback(result, showToast, `后端拒绝读取库存修正详情：${errorMessage || "未知错误"}。`);
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

    setInventoryLedgerState((current) => ({ ...current, loading: true, error: "" }));
    const result = normalizeReadResultForRuntime(
      await api.listOfficeInventoryLedgerEntries({
        authState,
        operatorId: currentUserId,
        pageSize: 20,
        filters: buildInventoryLedgerApiFilters(safeStockId, filters),
        localLedgerEntries: [],
      }),
      { label: "库存流水", serverRequired },
    );

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
      return withFeedback(result, showToast, `后端拒绝刷新库存流水：${errorMessage || "未知错误"}。`);
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
    setInventoryCorrectionQueueState((current) => ({ ...current, loading: true, error: "" }));
    const result = normalizeReadResultForRuntime(
      await api.listOfficeInventoryCorrectionDrafts({
        authState,
        operatorId: currentUserId,
        pageSize: 20,
        filters,
        localCorrectionDrafts: inventoryCorrectionDraftsRef.current,
      }),
      { label: "库存修正确认队列", serverRequired },
    );

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
      return withFeedback(result, showToast, `后端拒绝刷新库存修正确认队列：${errorMessage || "未知错误"}。`);
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
    setInventoryIntentState((current) => ({ ...current, loading: true, error: "" }));
    const [intentResult, holdResult] = await Promise.all([
      api.listOfficeInventoryIntents({ authState, operatorId: currentUserId }),
      api.listOfficeTemporaryInventoryHolds({ authState, operatorId: currentUserId }),
    ]);
    const blocked = intentResult?.blocked || holdResult?.blocked
      || (serverRequired() && (intentResult?.source !== "api" || holdResult?.source !== "api"));
    const lastSyncedAt = formatSyncTime();
    if (blocked) {
      const errorMessage = getErrorMessage(intentResult?.blocked ? intentResult : holdResult, "库存意图队列 API 返回错误。");
      setInventoryIntentState({
        source: "api_error",
        items: [],
        holds: [],
        loading: false,
        mutatingId: "",
        error: errorMessage,
        lastSyncedAt,
      });
      return withFeedback({ source: "api_error", blocked: true, error: { message: errorMessage } }, showToast, `后端拒绝刷新库存意图队列：${errorMessage}。`);
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
  const actions = createOfficeInventoryDetailReadActions(options);
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
