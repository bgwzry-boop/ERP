import {
  findProductionInventoryItem,
  getOfficePackingTaskDetail as getOfficePackingTaskDetailDefault,
  getOfficeProductionTaskDetail as getOfficeProductionTaskDetailDefault,
} from "../services/officeProductionPackingApiClient.js";

const defaultApi = {
  getOfficePackingTaskDetail: getOfficePackingTaskDetailDefault,
  getOfficeProductionTaskDetail: getOfficeProductionTaskDetailDefault,
};

function formatSyncTime() {
  return new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
}

export function createOfficeProductionPackingActions({
  allowLocalFallback,
  api = defaultApi,
  authState,
  currentUserId,
  executeProductionPackingAction,
  guardUiAction,
  inventoryRecords,
  orderLines,
  productionPacking,
  refreshOfficePrintJobQueue,
  refreshPrintDriverConfig,
  refreshPrintDriverCupsDiagnostics,
  setProductionPackingDetailState,
  setToast,
}) {
  const detailApi = { ...defaultApi, ...api };
  const apiOptions = { serverRequired: !allowLocalFallback };

  function normalizeFormalResult(result, label) {
    if (!result) {
      return {
        source: "api_error",
        blocked: true,
        error: { code: "PRODUCTION_PACKING_RESULT_MISSING", message: `${label}未返回结果。` },
        feedback: `${label}未返回结果，未修改业务状态。`,
      };
    }
    if (result.blocked || allowLocalFallback || result.source === "api") return result;
    return {
      ...result,
      blocked: true,
      upstreamSource: result.source,
      source: "api_error",
      detail: null,
      error: {
        code: result.error?.code ?? "PRODUCTION_PACKING_SERVER_REQUIRED",
        message: result.error?.message ?? `生产模式要求通过后端完成${label}。`,
      },
      feedback: `后端未确认${label}，production 不接受本地替代结果。`,
    };
  }

  async function loadProductionPackingSourceDetail(focusTarget) {
    const requestedType = String(focusTarget?.mode ?? "").trim();
    const requestedId = String(
      focusTarget?.taskId ?? focusTarget?.productionTaskId ?? focusTarget?.packingTaskId ?? "",
    ).trim();
    if (!requestedType || !requestedId) {
      setProductionPackingDetailState({
        source: "ui_error",
        detail: null,
        requestedType,
        requestedId,
        loading: false,
        error: "未找到可读取的生产/打包来源任务 ID。",
        lastSyncedAt: formatSyncTime(),
      });
      return null;
    }

    setProductionPackingDetailState({
      source: "api",
      detail: null,
      requestedType,
      requestedId,
      loading: true,
      error: "",
      lastSyncedAt: "",
    });

    const orderLineId = String(focusTarget?.orderLineId ?? "").trim();
    const orderLine =
      orderLines.find((item) => item.id === orderLineId || item.orderLineId === orderLineId) ??
      productionPacking.productionTasks?.find((item) => item.id === orderLineId || item.orderLineId === orderLineId) ??
      productionPacking.packingTasks?.find((item) => item.orderLineId === orderLineId)?.orderLine;
    const inventoryItem = orderLine ? findProductionInventoryItem(orderLine, inventoryRecords) : null;
    const reportResult =
      (orderLineId ? productionPacking.reportResultsByLineId?.[orderLineId] : null) ??
      productionPacking.productionTasks?.find(
        (item) => item.productionTaskId === requestedId || item.orderLineId === orderLineId,
      )?.latestReport ??
      Object.values(productionPacking.reportResultsByLineId ?? {}).find(
        (item) => item?.reportId === focusTarget?.sourceId || item?.productionTaskId === requestedId,
      );

    const rawResult = requestedType === "packing"
      ? await detailApi.getOfficePackingTaskDetail({
          authState,
          packingTaskId: requestedId,
          packingTask: productionPacking.packingTasks.find((item) => item.packingTaskId === requestedId),
          orderLine,
          inventoryItem,
          operatorId: currentUserId,
        }, apiOptions)
      : await detailApi.getOfficeProductionTaskDetail({
          authState,
          productionTaskId: requestedId,
          orderLine,
          reportResult,
          inventoryItem,
          operatorId: currentUserId,
        }, apiOptions);
    const result = normalizeFormalResult(rawResult, "生产/打包来源详情读取");
    const lastSyncedAt = formatSyncTime();

    if (!result || result.blocked) {
      const message = result?.error?.requiredPermission
        ? `后端拒绝读取生产/打包来源详情：缺少权限 ${result.error.requiredPermission}。`
        : `后端拒绝读取生产/打包来源详情：${result?.error?.message ?? "未知错误"}`;
      setProductionPackingDetailState({
        source: result?.source ?? "api_error",
        detail: null,
        requestedType,
        requestedId,
        loading: false,
        error: message,
        lastSyncedAt,
      });
      setToast(message);
      return null;
    }

    setProductionPackingDetailState({
      source: result.source,
      detail: result.detail,
      requestedType,
      requestedId,
      loading: false,
      error: result.error?.message ?? "",
      lastSyncedAt,
    });
    return result.detail;
  }

  async function handleProductionPackingAction(action, payload = {}) {
    if (!guardUiAction("productionPacking", action)) return null;
    const result = normalizeFormalResult(
      await executeProductionPackingAction({ action, payload }),
      `生产/打包动作“${action || "未指定"}”`,
    );
    if (result?.feedback) setToast(result.feedback);
    return result;
  }

  async function refreshPrintDriverDiagnostics() {
    const results = await Promise.all([
      refreshPrintDriverConfig({ showToast: false }),
      refreshPrintDriverCupsDiagnostics({ showToast: false }),
    ]);
    const blocked = results.find((result) => !result || result.blocked || (!allowLocalFallback && result.source !== "api"));
    if (blocked) {
      setToast(`打印驱动诊断刷新未完成：${blocked.error?.message ?? "后端诊断不可用"}。`);
      return { source: "api_error", blocked: true, results };
    }
    setToast("打印驱动诊断和 CUPS 队列预检已刷新。");
    return { source: results.every((result) => result.source === "api") ? "api" : "local_fallback", results };
  }

  async function refreshPrintJobs() {
    const result = normalizeFormalResult(
      await refreshOfficePrintJobQueue({ showToast: true }),
      "打印作业池刷新",
    );
    if (result?.feedback) setToast(result.feedback);
    return result;
  }

  return {
    handleProductionPackingAction,
    loadProductionPackingSourceDetail,
    refreshPrintDriverDiagnostics,
    refreshPrintJobs,
  };
}
