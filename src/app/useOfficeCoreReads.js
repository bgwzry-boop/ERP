import { useCallback } from "react";
import { listOfficeOrderLines } from "../services/officeOrderPoolLazyApi.js";
import { listOfficeTodos } from "../services/officeTodoLazyApi.js";
import { listOfficeInventoryItems } from "../services/officeInventoryLazyApi.js";
import { listOfficeFulfillments } from "../services/officeFulfillmentLazyApi.js";
import { isOfficeApiServerRequired } from "../services/officeAuthService.js";
import { sortTodos } from "../domain/officeRules.js";

function formatSyncTime() {
  return new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
}

function withFeedback(result, showToast, feedback) {
  return showToast ? { ...result, feedback } : result;
}

const defaultApi = {
  listOfficeFulfillments,
  listOfficeInventoryItems,
  listOfficeOrderLines,
  listOfficeTodos,
};

function normalizeReadResultForRuntime(result, { label, serverRequired }) {
  const safeResult = result ?? {};
  if (!serverRequired() || safeResult.source === "api") return safeResult;
  return {
    ...safeResult,
    blocked: true,
    upstreamSource: safeResult.source,
    source: "api_error",
    error: {
      code: safeResult.error?.code ?? "CORE_READ_SERVER_REQUIRED",
      message: safeResult.error?.message ?? `生产模式要求从后端读取${label}。`,
      ...(safeResult.error?.requiredPermission
        ? { requiredPermission: safeResult.error.requiredPermission }
        : {}),
    },
  };
}

export function createOfficeCoreReadActions({
  api = defaultApi,
  authState,
  currentUserId,
  serverRequired = isOfficeApiServerRequired,
  todosRef,
  orderLinesRef,
  inventoryRecordsRef,
  selectedStockIdRef,
  fulfillmentsRef,
  setTodos,
  setSelectedTodoId,
  setTodoMeta,
  setOrderLines,
  setSelectedOrderId,
  setOrderPoolMeta,
  setInventoryRecords,
  setSelectedStockId,
  setInventoryMeta,
  setFulfillments,
  setFulfillmentMeta,
  setSelectedFulfillmentId,
}) {
  async function refreshTodos({ showToast = false } = {}) {
    setTodoMeta((current) => ({ ...current, loading: true, error: "" }));
    const result = normalizeReadResultForRuntime(
      await api.listOfficeTodos({
        authState,
        operatorId: currentUserId,
        status: "all",
        pageSize: 200,
        localTodos: todosRef.current,
      }, { serverRequired: serverRequired() }),
      { label: "公共待办", serverRequired },
    );

    if (result.blocked) {
      setTodoMeta((current) => ({
        ...current,
        source: result.source,
        loading: false,
        error: result.error?.message ?? "公共待办 API 返回错误。",
      }));
      return withFeedback(result, showToast, `刷新公共待办失败：${result.error?.message ?? "接口错误"}`);
    }

    const items = result.items ?? [];
    setTodos(items);
    setSelectedTodoId((current) =>
      items.some((item) => item.id === current) ? current : sortTodos(items)[0]?.id ?? "",
    );
    setTodoMeta({
      source: result.source,
      total: result.total ?? items.length,
      reminderPolicy: result.reminderPolicy ?? null,
      loading: false,
      error: result.error?.message ?? "",
      lastSyncedAt: formatSyncTime(),
    });
    const sourceLabel = result.source === "api" ? "后端公共待办" : "本地公共待办";
    return withFeedback(result, showToast, `已刷新${sourceLabel}：${result.total ?? items.length} 条。`);
  }

  async function refreshOrderPool({ showToast = false } = {}) {
    setOrderPoolMeta((current) => ({ ...current, loading: true, error: "" }));
    const result = normalizeReadResultForRuntime(
      await api.listOfficeOrderLines({
        authState,
        operatorId: currentUserId,
        localOrderLines: orderLinesRef.current,
        pageSize: 200,
        includeHistory: false,
      }, { serverRequired: serverRequired() }),
      { label: "订单池", serverRequired },
    );

    if (result.blocked) {
      setOrderPoolMeta((current) => ({
        ...current,
        source: result.source,
        loading: false,
        error: result.error?.message ?? "订单池列表 API 返回错误。",
      }));
      const feedback = result.error?.requiredPermission
        ? `后端拒绝刷新订单池：缺少权限 ${result.error.requiredPermission}。`
        : `后端拒绝刷新订单池：${result.error?.message ?? "未知错误"}`;
      return withFeedback(result, showToast, feedback);
    }

    const items = result.items ?? [];
    setOrderLines(items);
    setSelectedOrderId((current) => (items.some((item) => item.id === current) ? current : items[0]?.id ?? ""));
    setOrderPoolMeta((current) => ({
      ...current,
      source: result.source,
      total: result.total ?? items.length,
      loading: false,
      error: result.error?.message ?? "",
      lastSyncedAt: formatSyncTime(),
    }));
    const sourceLabel = result.source === "api" ? "后端 API" : "本地规则降级";
    return withFeedback(result, showToast, `订单池已通过${sourceLabel}刷新，共 ${result.total ?? items.length} 行。`);
  }

  async function refreshInventoryRecords({ showToast = false } = {}) {
    setInventoryMeta((current) => ({ ...current, loading: true, error: "" }));
    const result = normalizeReadResultForRuntime(
      await api.listOfficeInventoryItems({
        authState,
        operatorId: currentUserId,
        pageSize: 200,
        localInventoryRecords: inventoryRecordsRef.current,
      }, { serverRequired: serverRequired() }),
      { label: "库存列表", serverRequired },
    );

    if (result.blocked) {
      setInventoryMeta((current) => ({
        ...current,
        source: result.source,
        loading: false,
        error: result.error?.message ?? "库存列表 API 返回错误。",
      }));
      const feedback = result.error?.requiredPermission
        ? `后端拒绝刷新库存列表：缺少权限 ${result.error.requiredPermission}。`
        : `后端拒绝刷新库存列表：${result.error?.message ?? "未知错误"}`;
      return withFeedback(result, showToast, feedback);
    }

    const nextItems = result.items ?? [];
    const currentSelectedId = selectedStockIdRef.current;
    const nextSelectedStockId = nextItems.some((item) => item.id === currentSelectedId)
      ? currentSelectedId
      : nextItems[0]?.id ?? "";
    setInventoryRecords(nextItems);
    setSelectedStockId(nextSelectedStockId);
    setInventoryMeta({
      source: result.source,
      total: result.total ?? nextItems.length,
      loading: false,
      error: result.error?.message ?? "",
      lastSyncedAt: formatSyncTime(),
    });
    const sourceLabel = result.source === "api" ? "后端 API" : "本地规则降级";
    return withFeedback(
      { ...result, selectedStockId: nextSelectedStockId },
      showToast,
      `库存列表已通过${sourceLabel}刷新，共 ${result.total ?? nextItems.length} 个库存键。`,
    );
  }

  async function refreshFulfillments({ showToast = false } = {}) {
    setFulfillmentMeta((current) => ({ ...current, loading: true, error: "" }));
    const result = normalizeReadResultForRuntime(
      await api.listOfficeFulfillments({
        authState,
        operatorId: currentUserId,
        pageSize: 200,
        localFulfillments: fulfillmentsRef.current,
      }, { serverRequired: serverRequired() }),
      { label: "出库交付", serverRequired },
    );
    if (result.blocked) {
      setFulfillmentMeta((current) => ({
        ...current,
        source: result.source,
        loading: false,
        error: result.error?.message ?? "生产模式要求后端交付投影。",
      }));
      return withFeedback(
        result,
        showToast,
        `刷新出库交付失败：${result.error?.message ?? "生产模式要求后端交付投影。"}`,
      );
    }

    const nextItems = result.items ?? [];
    setFulfillments(nextItems);
    setSelectedFulfillmentId((current) =>
      nextItems.some((item) => item.id === current) ? current : nextItems[0]?.id ?? "",
    );
    setFulfillmentMeta({
      source: result.source,
      total: result.total ?? nextItems.length,
      loading: false,
      error: result.error?.message ?? "",
      lastSyncedAt: formatSyncTime(),
    });
    const sourceLabel = result.source === "api" ? "后端 API" : "本地规则降级";
    return withFeedback(result, showToast, `出库交付已通过${sourceLabel}刷新，共 ${result.total ?? nextItems.length} 条。`);
  }

  return {
    refreshFulfillments,
    refreshInventoryRecords,
    refreshOrderPool,
    refreshTodos,
  };
}

export function useOfficeCoreReads(options) {
  const actions = createOfficeCoreReadActions(options);
  const {
    authState,
    currentUserId,
    todosRef,
    orderLinesRef,
    inventoryRecordsRef,
    selectedStockIdRef,
    fulfillmentsRef,
    serverRequired,
  } = options;

  return {
    refreshTodos: useCallback(actions.refreshTodos, [authState, currentUserId, serverRequired, todosRef]),
    refreshOrderPool: useCallback(actions.refreshOrderPool, [authState, currentUserId, orderLinesRef, serverRequired]),
    refreshInventoryRecords: useCallback(
      actions.refreshInventoryRecords,
      [authState, currentUserId, inventoryRecordsRef, selectedStockIdRef, serverRequired],
    ),
    refreshFulfillments: useCallback(
      actions.refreshFulfillments,
      [authState, currentUserId, fulfillmentsRef, serverRequired],
    ),
  };
}
