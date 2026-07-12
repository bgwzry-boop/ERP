import { useCallback } from "react";
import { listDriverDeliveryTasks } from "../services/driverMobileApiClient.js";
import {
  listOfficeRawMaterialInbounds,
  listOfficeRawMaterialSupplierStatementReviews,
} from "../services/officeRawMaterialApiClient.js";
import { isOfficeApiServerRequired } from "../services/officeAuthService.js";

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

function normalizeReadResultForRuntime(result, { label, serverRequired }) {
  const safeResult = result ?? {};
  if (!serverRequired() || safeResult.source === "api") return safeResult;
  return {
    ...safeResult,
    blocked: true,
    upstreamSource: safeResult.source,
    source: "api_error",
    error: {
      code: safeResult.error?.code ?? "ROLE_TOOL_READ_SERVER_REQUIRED",
      message: safeResult.error?.message ?? `生产模式要求从后端读取${label}。`,
      ...(safeResult.error?.requiredPermission
        ? { requiredPermission: safeResult.error.requiredPermission }
        : {}),
    },
  };
}

export function createOfficeRoleToolReadActions({
  api = defaultApi,
  authState,
  currentUserId,
  customers,
  fulfillmentsRef,
  orderLinesRef,
  rawMaterialInboundsRef,
  selectedRawMaterialInboundIdRef,
  serverRequired = isOfficeApiServerRequired,
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
    const result = normalizeReadResultForRuntime(
      await api.listDriverDeliveryTasks({
        authState,
        driverId: currentUserId,
        operatorId: currentUserId,
        localFulfillments: fulfillmentsRef.current,
        orderLines: orderLinesRef.current,
        customers,
      }, { serverRequired: serverRequired() }),
      { label: "司机送货任务", serverRequired },
    );

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
      items.some((item) => item.fulfillmentId === current) ? current : items[0]?.fulfillmentId ?? "",
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
    const result = normalizeReadResultForRuntime(
      await api.listOfficeRawMaterialInbounds({
        authState,
        operatorId: currentUserId,
        pageSize: 200,
        localInbounds: rawMaterialInboundsRef.current,
      }, { serverRequired: serverRequired() }),
      { label: "原材料入库单", serverRequired },
    );

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

    const nextItems = result.items ?? [];
    const currentSelectedId =
      selectedRawMaterialInboundIdRef.current || rawMaterialInboundsRef.current[0]?.id || "";
    const nextSelectedId = nextItems.some((item) => item.id === currentSelectedId)
      ? currentSelectedId
      : nextItems[0]?.id ?? "";
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
    const result = normalizeReadResultForRuntime(
      await api.listOfficeRawMaterialSupplierStatementReviews({
        authState,
        operatorId: currentUserId,
        pageSize: 20,
      }, { serverRequired: serverRequired() }),
      { label: "供应商月结复核草稿", serverRequired },
    );
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
    serverRequired,
  } = options;

  return {
    refreshDriverDeliveryTasks: useCallback(
      actions.refreshDriverDeliveryTasks,
      [authState, currentUserId, customers, fulfillmentsRef, orderLinesRef, serverRequired],
    ),
    refreshRawMaterialInbounds: useCallback(
      actions.refreshRawMaterialInbounds,
      [authState, currentUserId, rawMaterialInboundsRef, selectedRawMaterialInboundIdRef, serverRequired],
    ),
    refreshRawMaterialSupplierStatementReviews: useCallback(
      actions.refreshRawMaterialSupplierStatementReviews,
      [authState, currentUserId, serverRequired],
    ),
  };
}
