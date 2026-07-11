import { useCallback } from "react";
import { listDriverDeliveryTasks } from "../services/driverMobileApiClient.js";
import {
  listOfficeRawMaterialInbounds,
  listOfficeRawMaterialSupplierStatementReviews,
} from "../services/officeRawMaterialApiClient.js";

function formatSyncTime() {
  return new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
}

function withFeedback(result, showToast, feedback) {
  return showToast ? { ...result, feedback } : result;
}

const defaultApi = {
  listDriverDeliveryTasks,
  listOfficeRawMaterialInbounds,
  listOfficeRawMaterialSupplierStatementReviews,
};

export function createOfficeRoleToolReadActions({
  api = defaultApi,
  authState,
  currentUserId,
  customers,
  fulfillmentsRef,
  orderLinesRef,
  rawMaterialInboundsRef,
  selectedRawMaterialInboundIdRef,
  setDriverDeliveryTasks,
  setSelectedDriverTaskId,
  setDriverDeliveryMeta,
  setRawMaterialInbounds,
  setSelectedRawMaterialInboundId,
  setRawMaterialInboundMeta,
  setRawMaterialSupplierStatementReviews,
  setRawMaterialSupplierStatementReviewMeta,
}) {
  async function refreshDriverDeliveryTasks({ showToast = false } = {}) {
    setDriverDeliveryMeta((current) => ({ ...current, loading: true, error: "" }));
    const result = await api.listDriverDeliveryTasks({
      authState,
      driverId: currentUserId,
      operatorId: currentUserId,
      localFulfillments: fulfillmentsRef.current,
      orderLines: orderLinesRef.current,
      customers,
    });

    if (result.blocked) {
      setDriverDeliveryMeta((current) => ({
        ...current,
        source: result.source,
        loading: false,
        error: result.error?.message ?? "司机送货任务 API 返回错误。",
      }));
      const feedback = result.error?.requiredPermission
        ? `后端拒绝刷新司机任务：缺少权限 ${result.error.requiredPermission}。`
        : `后端拒绝刷新司机任务：${result.error?.message ?? "未知错误"}`;
      return withFeedback(result, showToast, feedback);
    }

    const items = result.items ?? [];
    setDriverDeliveryTasks(items);
    setSelectedDriverTaskId((current) =>
      items.some((item) => item.fulfillmentId === current) ? current : items[0]?.fulfillmentId ?? current,
    );
    setDriverDeliveryMeta({
      source: result.source,
      total: result.total ?? items.length,
      loading: false,
      error: result.error?.message ?? "",
      lastSyncedAt: formatSyncTime(),
      metrics: result.metrics,
    });
    const sourceLabel = result.source === "api" ? "后端 API" : "本地规则降级";
    return withFeedback(
      result,
      showToast,
      `司机送货任务已通过${sourceLabel}刷新，共 ${result.total ?? items.length} 条。`,
    );
  }

  async function refreshRawMaterialInbounds({ showToast = false } = {}) {
    setRawMaterialInboundMeta((current) => ({ ...current, loading: true, error: "" }));
    const result = await api.listOfficeRawMaterialInbounds({
      authState,
      operatorId: currentUserId,
      pageSize: 200,
      localInbounds: rawMaterialInboundsRef.current,
    });

    if (result.blocked) {
      setRawMaterialInboundMeta((current) => ({
        ...current,
        source: result.source,
        loading: false,
        error: result.error?.message ?? "原材料入库列表 API 返回错误。",
      }));
      const feedback = result.error?.requiredPermission
        ? `后端拒绝刷新原材料入库单：缺少权限 ${result.error.requiredPermission}。`
        : `后端拒绝刷新原材料入库单：${result.error?.message ?? "未知错误"}`;
      return withFeedback(result, showToast, feedback);
    }

    const nextItems = result.items?.length ? result.items : rawMaterialInboundsRef.current;
    const currentSelectedId =
      selectedRawMaterialInboundIdRef.current || rawMaterialInboundsRef.current[0]?.id || "";
    const nextSelectedId = nextItems.some((item) => item.id === currentSelectedId)
      ? currentSelectedId
      : nextItems[0]?.id ?? currentSelectedId;
    setRawMaterialInbounds(nextItems);
    setSelectedRawMaterialInboundId(nextSelectedId);
    setRawMaterialInboundMeta({
      source: result.source,
      total: result.total ?? nextItems.length,
      loading: false,
      error: result.error?.message ?? "",
      lastSyncedAt: formatSyncTime(),
    });
    const sourceLabel = result.source === "api" ? "后端 API" : "本地规则降级";
    return withFeedback(
      { ...result, selectedRawMaterialInboundId: nextSelectedId },
      showToast,
      `原材料入库单已通过${sourceLabel}刷新，共 ${result.total ?? nextItems.length} 条；打印标签仍不会直接入可用库存。`,
    );
  }

  async function refreshRawMaterialSupplierStatementReviews({ showToast = false } = {}) {
    setRawMaterialSupplierStatementReviewMeta((current) => ({ ...current, loading: true, error: "" }));
    const result = await api.listOfficeRawMaterialSupplierStatementReviews({
      authState,
      operatorId: currentUserId,
      pageSize: 20,
    });
    if (result.blocked) {
      setRawMaterialSupplierStatementReviewMeta((current) => ({
        ...current,
        source: result.source,
        loading: false,
        error: result.error?.message ?? "供应商月结复核草稿 API 返回错误。",
      }));
      const feedback = result.error?.requiredPermission
        ? `后端拒绝刷新月结复核草稿：缺少权限 ${result.error.requiredPermission}。`
        : `后端拒绝刷新月结复核草稿：${result.error?.message ?? "未知错误"}`;
      return withFeedback(result, showToast, feedback);
    }

    const items = result.items ?? [];
    setRawMaterialSupplierStatementReviews(items);
    setRawMaterialSupplierStatementReviewMeta({
      source: result.source,
      total: result.total ?? items.length,
      loading: false,
      error: result.error?.message ?? "",
      lastSyncedAt: formatSyncTime(),
    });
    return withFeedback(
      result,
      showToast,
      `供应商月结复核草稿已刷新，共 ${result.total ?? items.length} 条；草稿不写库存、不生成应付、不确认付款。`,
    );
  }

  return {
    refreshDriverDeliveryTasks,
    refreshRawMaterialInbounds,
    refreshRawMaterialSupplierStatementReviews,
  };
}

export function useOfficeRoleToolReads(options) {
  const actions = createOfficeRoleToolReadActions(options);
  const {
    authState,
    currentUserId,
    customers,
    fulfillmentsRef,
    orderLinesRef,
    rawMaterialInboundsRef,
    selectedRawMaterialInboundIdRef,
  } = options;

  return {
    refreshDriverDeliveryTasks: useCallback(
      actions.refreshDriverDeliveryTasks,
      [authState, currentUserId, customers, fulfillmentsRef, orderLinesRef],
    ),
    refreshRawMaterialInbounds: useCallback(
      actions.refreshRawMaterialInbounds,
      [authState, currentUserId, rawMaterialInboundsRef, selectedRawMaterialInboundIdRef],
    ),
    refreshRawMaterialSupplierStatementReviews: useCallback(
      actions.refreshRawMaterialSupplierStatementReviews,
      [authState, currentUserId],
    ),
  };
}
