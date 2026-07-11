import { useCallback } from "react";
import { listOfficeOrderLines } from "../services/officeOrderPoolApiClient.js";
import { listOfficeTodos } from "../services/officeTodoApiClient.js";
import { listOfficeInventoryItems } from "../services/officeInventoryApiClient.js";
import { listOfficeFulfillments } from "../services/officeFulfillmentApiClient.js";
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
  setSelectedFulfillmentId,
}) {
  async function refreshTodos({ showToast = false } = {}) {
    setTodoMeta((current) => ({ ...current, loading: true, error: "" }));
    const result = await api.listOfficeTodos({
      authState,
      operatorId: currentUserId,
      status: "all",
      pageSize: 200,
      localTodos: todosRef.current,
    });

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
      items.some((item) => item.id === current) ? current : sortTodos(items)[0]?.id ?? current,
    );
    setTodoMeta({
      source: result.source,
      total: result.total ?? items.length,
      loading: false,
      error: result.error?.message ?? "",
      lastSyncedAt: formatSyncTime(),
    });
    const sourceLabel = result.source === "api" ? "后端公共待办" : "本地公共待办";
    return withFeedback(result, showToast, `已刷新${sourceLabel}：${result.total ?? items.length} 条。`);
  }

  async function refreshOrderPool({ showToast = false } = {}) {
    setOrderPoolMeta((current) => ({ ...current, loading: true, error: "" }));
    const result = await api.listOfficeOrderLines({
      authState,
      operatorId: currentUserId,
      localOrderLines: orderLinesRef.current,
      pageSize: 200,
      includeHistory: false,
    });

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
    setSelectedOrderId((current) => (items.some((item) => item.id === current) ? current : items[0]?.id ?? current));
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
    const result = await api.listOfficeInventoryItems({
      authState,
      operatorId: currentUserId,
      pageSize: 200,
      localInventoryRecords: inventoryRecordsRef.current,
    });

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

    const nextItems = result.items?.length ? result.items : inventoryRecordsRef.current;
    const currentSelectedId = selectedStockIdRef.current;
    const nextSelectedStockId = nextItems.some((item) => item.id === currentSelectedId)
      ? currentSelectedId
      : nextItems[0]?.id ?? currentSelectedId;
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
    const result = await api.listOfficeFulfillments({
      authState,
      operatorId: currentUserId,
      pageSize: 200,
      localFulfillments: fulfillmentsRef.current,
    });
    if (result.blocked || (serverRequired() && result.source !== "api")) {
      return withFeedback(
        result,
        showToast,
        `刷新出库交付失败：${result.error?.message ?? "生产模式要求后端交付投影。"}`,
      );
    }

    const nextItems = result.items ?? [];
    setFulfillments(nextItems);
    setSelectedFulfillmentId((current) =>
      nextItems.some((item) => item.id === current) ? current : nextItems[0]?.id ?? current,
    );
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
  } = options;

  return {
    refreshTodos: useCallback(actions.refreshTodos, [authState, currentUserId, todosRef]),
    refreshOrderPool: useCallback(actions.refreshOrderPool, [authState, currentUserId, orderLinesRef]),
    refreshInventoryRecords: useCallback(
      actions.refreshInventoryRecords,
      [authState, currentUserId, inventoryRecordsRef, selectedStockIdRef],
    ),
    refreshFulfillments: useCallback(
      actions.refreshFulfillments,
      [authState, currentUserId, fulfillmentsRef],
    ),
  };
}
