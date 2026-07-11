import { useCallback } from "react";
import {
  listOfficePackingTasks,
  listOfficeProductionMachineQueue,
  listOfficeProductionTasks,
} from "../services/officeProductionPackingApiClient.js";
import { isOfficeApiServerRequired } from "../services/officeAuthService.js";
import {
  buildProductionTaskListQueryForPage,
  mapPackingTaskListItemToTask,
  mapProductionTaskListItemToLine,
} from "../state/officeProductionPackingState.js";

function formatSyncTime() {
  return new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
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
      code: safeResult.error?.code ?? "PRODUCTION_READ_SERVER_REQUIRED",
      message: safeResult.error?.message ?? `生产模式要求从后端读取${label}。`,
      ...(safeResult.error?.requiredPermission
        ? { requiredPermission: safeResult.error.requiredPermission }
        : {}),
    },
  };
}

function getReadErrorMessage(result) {
  if (!result?.error) return "";
  if (result.error.requiredPermission) return `缺少权限 ${result.error.requiredPermission}`;
  return result.error.message ?? "";
}

function withFeedback(result, showToast, feedback) {
  return showToast ? { ...result, feedback } : result;
}

const defaultApi = {
  listOfficePackingTasks,
  listOfficeProductionMachineQueue,
  listOfficeProductionTasks,
};

export function createOfficeProductionReadActions({
  api = defaultApi,
  activePage,
  authState,
  currentUser,
  currentUserId,
  orderLinesRef,
  serverRequired = isOfficeApiServerRequired,
  setProductionPacking,
}) {
  async function refreshProductionPackingTaskLists({ showToast = false } = {}) {
    setProductionPacking((current) => ({
      ...current,
      taskListLoading: true,
      taskListError: "",
      scheduleQueueError: "",
    }));

    const productionTaskQuery = buildProductionTaskListQueryForPage(activePage, currentUser, currentUserId);
    const scheduleQueueQuery = {
      status: "open",
      pageSize: 200,
      ...(productionTaskQuery.machineId ? { machineId: productionTaskQuery.machineId } : {}),
    };

    const [rawProductionResult, rawPackingResult, rawScheduleQueueResult] = await Promise.all([
      api.listOfficeProductionTasks({
        authState,
        operatorId: currentUserId,
        query: productionTaskQuery,
      }),
      api.listOfficePackingTasks({
        authState,
        operatorId: currentUserId,
        query: { pageSize: 200 },
      }),
      api.listOfficeProductionMachineQueue({
        authState,
        operatorId: currentUserId,
        query: scheduleQueueQuery,
      }),
    ]);

    const productionResult = normalizeReadResultForRuntime(rawProductionResult, {
      label: "生产任务",
      serverRequired,
    });
    const packingResult = normalizeReadResultForRuntime(rawPackingResult, {
      label: "打包任务",
      serverRequired,
    });
    const scheduleQueueResult = normalizeReadResultForRuntime(rawScheduleQueueResult, {
      label: "机台排产队列",
      serverRequired,
    });
    const results = [productionResult, packingResult, scheduleQueueResult];
    const lastSyncedAt = formatSyncTime();
    const errorMessages = results.map(getReadErrorMessage).filter(Boolean);
    const blocked = results.some((result) => result.blocked);
    const taskListSource = blocked
      ? "api_error"
      : productionResult.source === "api" || packingResult.source === "api"
        ? "api"
        : "local_fallback";

    setProductionPacking((current) => ({
      ...current,
      productionTasks:
        productionResult.source === "api"
          ? (productionResult.items ?? [])
              .map((item) => mapProductionTaskListItemToLine(item, orderLinesRef.current))
              .filter((item) => item.id)
          : current.productionTasks ?? [],
      packingTasks:
        packingResult.source === "api"
          ? (packingResult.items ?? [])
              .map((item) => mapPackingTaskListItemToTask(item, orderLinesRef.current))
              .filter((item) => item.packingTaskId)
          : current.packingTasks ?? [],
      taskListSource,
      taskListLoading: false,
      taskListError: errorMessages.join("；"),
      taskListLastSyncedAt: lastSyncedAt,
      productionTaskTotal:
        productionResult.source === "api" ? productionResult.total ?? 0 : current.productionTaskTotal ?? 0,
      packingTaskTotal:
        packingResult.source === "api"
          ? packingResult.total ?? 0
          : current.packingTaskTotal ?? current.packingTasks?.length ?? 0,
      scheduleQueueItems:
        scheduleQueueResult.source === "api" ? scheduleQueueResult.items ?? [] : current.scheduleQueueItems ?? [],
      scheduleQueueMachines:
        scheduleQueueResult.source === "api"
          ? scheduleQueueResult.machines ?? []
          : current.scheduleQueueMachines ?? [],
      scheduleQueueTotal:
        scheduleQueueResult.source === "api" ? scheduleQueueResult.total ?? 0 : current.scheduleQueueTotal ?? 0,
      scheduleQueueSource: scheduleQueueResult.source ?? "local_fallback",
      scheduleQueueError: getReadErrorMessage(scheduleQueueResult),
      scheduleQueueLastSyncedAt:
        scheduleQueueResult.source === "api" ? lastSyncedAt : current.scheduleQueueLastSyncedAt ?? "",
      scheduleQueueNote:
        scheduleQueueResult.source === "api" ? scheduleQueueResult.note ?? "" : current.scheduleQueueNote ?? "",
    }));

    const result = {
      production: productionResult,
      packing: packingResult,
      scheduleQueue: scheduleQueueResult,
      source: taskListSource,
      blocked,
    };
    if (blocked) {
      return withFeedback(
        result,
        showToast,
        `生产 / 打包任务池刷新失败：${errorMessages.join("；") || "后端任务池不可用"}。`,
      );
    }

    const sourceLabel = taskListSource === "api" ? "后端 API" : "本地规则降级";
    const scopeLabel =
      activePage === "workshopMobile" && productionTaskQuery.machineId
        ? `，车间机台 ${productionTaskQuery.machineId}`
        : "";
    return withFeedback(
      result,
      showToast,
      `生产 / 打包任务池已通过${sourceLabel}刷新${scopeLabel}：生产 ${productionResult.total ?? 0} 条，打包 ${packingResult.total ?? 0} 条，排产队列 ${scheduleQueueResult.total ?? 0} 条。`,
    );
  }

  return { refreshProductionPackingTaskLists };
}

export function useOfficeProductionReads(options) {
  const actions = createOfficeProductionReadActions(options);
  const { activePage, authState, currentUser, currentUserId, orderLinesRef, serverRequired } = options;

  return {
    refreshProductionPackingTaskLists: useCallback(actions.refreshProductionPackingTaskLists, [
      activePage,
      authState,
      currentUser,
      currentUserId,
      orderLinesRef,
      serverRequired,
    ]),
  };
}
