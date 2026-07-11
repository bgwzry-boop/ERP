import { useCallback } from "react";
import { getOfficePrintDriverConfig, getOfficePrintDriverCupsDiagnostics, getOfficePrintDriverV1Readiness } from "../services/officePrintDriverConfigApiClient.js";
import { listOfficePrintJobs } from "../services/officePrintJobApiClient.js";
import { listOfficePrintDevices, listOfficePrinterDeviceFieldTests } from "../services/officePrinterDeviceApiClient.js";
import { isOfficeApiServerRequired } from "../services/officeAuthService.js";
import {
  createPrinterDeviceFieldTestChecks,
  createPrinterDeviceFieldTestEvidence,
  normalizePrinterDeviceFieldTestChecks,
  normalizePrinterDeviceFieldTestEvidence,
} from "../services/printerDeviceFieldTestClient.js";
import {
  getPrinterDeviceDriverMode,
  getPrinterDeviceQaDriverLabel,
  getPrinterDeviceQaPaperLabel,
} from "../state/officePrintState.js";

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
      code: safeResult.error?.code ?? "PRINT_READ_SERVER_REQUIRED",
      message: safeResult.error?.message ?? `生产模式要求从后端读取${label}。`,
      ...(safeResult.error?.requiredPermission
        ? { requiredPermission: safeResult.error.requiredPermission }
        : {}),
    },
  };
}

function getReadErrorMessage(result, fallbackMessage = "") {
  if (result?.error?.requiredPermission) return `缺少权限 ${result.error.requiredPermission}`;
  return result?.error?.message ?? fallbackMessage;
}

const defaultApi = {
  getOfficePrintDriverConfig,
  getOfficePrintDriverCupsDiagnostics,
  getOfficePrintDriverV1Readiness,
  listOfficePrintDevices,
  listOfficePrinterDeviceFieldTests,
  listOfficePrintJobs,
};

export function createOfficePrintReadActions({
  api = defaultApi,
  authState,
  currentUserId,
  printerDeviceQaSelectedIdRef,
  printJobQueueItemsRef,
  serverRequired = isOfficeApiServerRequired,
  setPrintDriverConfig,
  setPrintDriverCupsDiagnostics,
  setPrintDriverReadiness,
  setPrinterDeviceQa,
  setPrintJobQueue,
}) {
  const canReadPrinterDeviceFieldTests = authState?.permissions?.actionPermissions?.includes("print.device_qa.record") === true;

  async function refreshPrintDriverConfig({ showToast = false } = {}) {
    setPrintDriverConfig((current) => ({ ...current, loading: true, error: "" }));
    const result = normalizeReadResultForRuntime(
      await api.getOfficePrintDriverConfig({ authState, operatorId: currentUserId }),
      { label: "打印驱动配置", serverRequired },
    );
    const errorMessage = getReadErrorMessage(result, "打印驱动配置 API 返回错误。");
    setPrintDriverConfig({
      source: result.source,
      config: result.blocked ? null : result.config,
      loading: false,
      error: result.blocked ? errorMessage : result.error?.message ?? "",
      lastSyncedAt: formatSyncTime(),
    });
    if (result.blocked) {
      return withFeedback(result, showToast, `后端拒绝刷新打印驱动诊断：${errorMessage || "未知错误"}。`);
    }
    const sourceLabel = result.source === "api" ? "后端 API" : "本地规则降级";
    return withFeedback(result, showToast, `打印驱动诊断已通过${sourceLabel}刷新。`);
  }

  async function refreshPrintDriverReadiness({ showToast = false } = {}) {
    setPrintDriverReadiness((current) => ({ ...current, loading: true, error: "" }));
    const result = normalizeReadResultForRuntime(
      await api.getOfficePrintDriverV1Readiness({ authState, operatorId: currentUserId }),
      { label: "打印 V1 上线门禁", serverRequired },
    );
    const errorMessage = getReadErrorMessage(result, "打印 V1 上线门禁 API 返回错误。");
    setPrintDriverReadiness({
      source: result.source,
      readiness: result.blocked ? null : result.readiness,
      loading: false,
      error: result.blocked ? errorMessage : result.error?.message ?? "",
      lastSyncedAt: formatSyncTime(),
    });
    if (result.blocked) {
      return withFeedback(result, showToast, `后端拒绝刷新打印上线门禁：${errorMessage || "未知错误"}。`);
    }
    const sourceLabel = result.source === "api" ? "后端 API" : "本地规则降级";
    const readyLabel = result.readiness?.ready
      ? "已满足 V1 门禁"
      : `仍有 ${result.readiness?.summary?.blockingCount ?? 0} 项阻塞`;
    return withFeedback(result, showToast, `打印上线门禁已通过${sourceLabel}刷新：${readyLabel}。`);
  }

  async function refreshPrintDriverCupsDiagnostics({ showToast = false } = {}) {
    setPrintDriverCupsDiagnostics((current) => ({ ...current, loading: true, error: "" }));
    const result = normalizeReadResultForRuntime(
      await api.getOfficePrintDriverCupsDiagnostics({ authState, operatorId: currentUserId }),
      { label: "CUPS 队列预检", serverRequired },
    );
    const errorMessage = getReadErrorMessage(result, "CUPS 队列预检 API 返回错误。");
    setPrintDriverCupsDiagnostics({
      source: result.source,
      diagnostics: result.blocked ? null : result.diagnostics,
      loading: false,
      error: result.blocked ? errorMessage : result.error?.message ?? "",
      lastSyncedAt: formatSyncTime(),
    });
    if (result.blocked) {
      return withFeedback(result, showToast, `后端拒绝刷新 CUPS 队列预检：${errorMessage || "未知错误"}。`);
    }
    const sourceLabel = result.source === "api" ? "后端 API" : "本地规则降级";
    const readyLabel = result.diagnostics?.ready ? "队列可访问" : "队列未通过";
    return withFeedback(result, showToast, `CUPS 队列预检已通过${sourceLabel}刷新：${readyLabel}。`);
  }

  async function refreshPrinterDeviceQa({ showToast = false, selectedDeviceId = "" } = {}) {
    setPrinterDeviceQa((current) => ({ ...current, loading: true, error: "" }));
    const deviceResult = normalizeReadResultForRuntime(
      await api.listOfficePrintDevices({
        authState,
        operatorId: currentUserId,
        query: { status: "active", pageSize: 50 },
      }),
      { label: "打印设备", serverRequired },
    );

    if (deviceResult.blocked) {
      const errorMessage = getReadErrorMessage(deviceResult, "打印设备列表 API 返回错误。");
      setPrinterDeviceQa((current) => ({
        ...current,
        source: deviceResult.source,
        recordSource: "api_error",
        devices: [],
        fieldTests: [],
        latestRecord: null,
        loading: false,
        error: errorMessage,
      }));
      return withFeedback(
        { devices: deviceResult, fieldTests: null, blocked: true },
        showToast,
        `后端拒绝刷新打印设备：${errorMessage || "未知错误"}。`,
      );
    }

    const devices = Array.isArray(deviceResult.items) ? deviceResult.items : [];
    const requestedDeviceId = String(selectedDeviceId || printerDeviceQaSelectedIdRef.current || "").trim();
    const selectedDevice = devices.find((item) => item.printDeviceId === requestedDeviceId) ?? devices[0] ?? null;
    const nextSelectedDeviceId = selectedDevice?.printDeviceId ?? "";
    let fieldTestResult = null;
    if (nextSelectedDeviceId && canReadPrinterDeviceFieldTests) {
      fieldTestResult = normalizeReadResultForRuntime(
        await api.listOfficePrinterDeviceFieldTests({
          authState,
          printDeviceId: nextSelectedDeviceId,
          operatorId: currentUserId,
          query: { pageSize: 10 },
        }),
        { label: "打印设备现场验收记录", serverRequired },
      );
    }

    const latestRecord = fieldTestResult?.blocked
      ? selectedDevice?.latestFieldTestRecord ?? null
      : fieldTestResult?.latestRecord ?? selectedDevice?.latestFieldTestRecord ?? null;
    const latestChecks = latestRecord?.checks?.length
      ? normalizePrinterDeviceFieldTestChecks(latestRecord.checks)
      : createPrinterDeviceFieldTestChecks();
    const latestEvidence = latestRecord
      ? normalizePrinterDeviceFieldTestEvidence(latestRecord.evidence ?? latestRecord.summary?.evidence)
      : createPrinterDeviceFieldTestEvidence();
    const errorMessages = [deviceResult, fieldTestResult].map((result) => getReadErrorMessage(result)).filter(Boolean);

    setPrinterDeviceQa((current) => ({
      ...current,
      source: deviceResult.source,
      recordSource: fieldTestResult?.source ?? "idle",
      devices,
      selectedDeviceId: nextSelectedDeviceId,
      fieldTests: fieldTestResult?.blocked ? [] : fieldTestResult?.items ?? [],
      latestRecord,
      checks: latestChecks,
      deviceLabel: selectedDevice?.name ?? current.deviceLabel,
      driverLabel: getPrinterDeviceQaDriverLabel(selectedDevice) || current.driverLabel,
      driverModeDraft: selectedDevice ? getPrinterDeviceDriverMode(selectedDevice) : current.driverModeDraft,
      paperLabel: getPrinterDeviceQaPaperLabel(selectedDevice) || current.paperLabel,
      evidence: latestEvidence,
      loading: false,
      error: errorMessages.join("；"),
      lastSyncedAt: formatSyncTime(),
    }));

    const result = { devices: deviceResult, fieldTests: fieldTestResult, blocked: fieldTestResult?.blocked === true };
    if (result.blocked) {
      return withFeedback(
        result,
        showToast,
        `打印设备验收记录刷新失败：${errorMessages.join("；") || "后端记录不可用"}。`,
      );
    }
    const sourceLabel = deviceResult.source === "api" || fieldTestResult?.source === "api" ? "后端 API" : "本地规则降级";
    return withFeedback(result, showToast, `打印设备验收已通过${sourceLabel}刷新，共 ${devices.length} 台设备。`);
  }

  async function refreshOfficePrintJobQueue({ showToast = false } = {}) {
    setPrintJobQueue((current) => ({ ...current, loading: true, error: "" }));
    const result = normalizeReadResultForRuntime(
      await api.listOfficePrintJobs({
        authState,
        operatorId: currentUserId,
        query: { pageSize: 8 },
        localPrintJobs: printJobQueueItemsRef.current,
      }),
      { label: "打印作业池", serverRequired },
    );
    const lastSyncedAt = formatSyncTime();
    if (result.blocked) {
      const errorMessage = getReadErrorMessage(result, "打印作业列表 API 返回错误。");
      setPrintJobQueue((current) => ({
        ...current,
        source: result.source,
        loading: false,
        error: errorMessage,
        lastSyncedAt,
      }));
      return withFeedback(result, showToast, `后端拒绝刷新打印作业池：${errorMessage || "未知错误"}。`);
    }

    setPrintJobQueue((current) => ({
      ...current,
      source: result.source,
      items: result.items ?? [],
      total: result.total ?? result.items?.length ?? 0,
      loading: false,
      error: result.error?.message ?? "",
      lastSyncedAt,
    }));
    const sourceLabel = result.source === "api" ? "后端 API" : "本地规则降级";
    return withFeedback(
      result,
      showToast,
      `打印作业池已通过${sourceLabel}刷新，共 ${result.total ?? result.items?.length ?? 0} 条。`,
    );
  }

  return {
    refreshOfficePrintJobQueue,
    refreshPrintDriverConfig,
    refreshPrintDriverCupsDiagnostics,
    refreshPrintDriverReadiness,
    refreshPrinterDeviceQa,
  };
}

export function useOfficePrintReads(options) {
  const actions = createOfficePrintReadActions(options);
  const { authState, currentUserId, printerDeviceQaSelectedIdRef, printJobQueueItemsRef, serverRequired } = options;
  const dependencies = [authState, currentUserId, printerDeviceQaSelectedIdRef, printJobQueueItemsRef, serverRequired];
  return {
    refreshOfficePrintJobQueue: useCallback(actions.refreshOfficePrintJobQueue, dependencies),
    refreshPrintDriverConfig: useCallback(actions.refreshPrintDriverConfig, dependencies),
    refreshPrintDriverCupsDiagnostics: useCallback(actions.refreshPrintDriverCupsDiagnostics, dependencies),
    refreshPrintDriverReadiness: useCallback(actions.refreshPrintDriverReadiness, dependencies),
    refreshPrinterDeviceQa: useCallback(actions.refreshPrinterDeviceQa, dependencies),
  };
}
