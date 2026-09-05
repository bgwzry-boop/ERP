import { useCallback } from "react";
import { printOfficeFulfillment, voidOfficePrintRecord } from "../services/officeFulfillmentLazyApi.js";
import { isOfficeApiServerRequired } from "../services/officeAuthService.js";
import { createOfficePrintBatchRecord, dispatchOfficePrintJob, retryOfficePrintJob } from "../services/officePrintLazyApi.js";
import {
  recordOfficePrinterDeviceFieldTest,
  updateOfficePrintDeviceDriverMode,
} from "../services/officePrintLazyApi.js";
import { handleOfficeTodoAction, handleOfficeTodoBatch } from "../services/officeTodoLazyApi.js";
import { getFulfillmentDocumentLabel, isPrintTodo, sortTodos } from "../domain/officeRules.js";
import { applyPrintRecordProjection } from "../state/officeProductionPackingState.js";
import {
  getPrintJobStatusLabel,
  getPrinterDeviceDriverMode,
  getPrinterDeviceQaDriverLabel,
  getPrinterDeviceQaPaperLabel,
  mergeOfficePrintJobQueueItems,
} from "../state/officePrintState.js";
import {
  applyBatchPrintResult,
  createPrintBatchRecord,
  getBatchPrintStats,
  getNextOpenTodoId,
} from "../state/officeTodoActions.js";

const defaultApi = {
  createOfficePrintBatchRecord,
  dispatchOfficePrintJob,
  handleOfficeTodoAction,
  handleOfficeTodoBatch,
  printOfficeFulfillment,
  recordOfficePrinterDeviceFieldTest,
  retryOfficePrintJob,
  updateOfficePrintDeviceDriverMode,
  voidOfficePrintRecord,
};

function formatSyncTime() {
  return new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
}

function withFeedback(result, feedback, extra = {}) {
  return { ...(result ?? {}), ...extra, feedback };
}

function formatBlockedFeedback(prefix, result) {
  return result?.error?.requiredPermission
    ? `${prefix}：缺少权限 ${result.error.requiredPermission}。`
    : `${prefix}：${result?.error?.message ?? "未知错误"}`;
}

function normalizeWriteResultForRuntime(result, { label, serverRequired }) {
  const safeResult = result ?? {};
  if (!serverRequired() || safeResult.source === "api") return safeResult;
  return {
    ...safeResult,
    blocked: true,
    upstreamSource: safeResult.source,
    source: "api_error",
    error: {
      code: safeResult.error?.code ?? "PRINT_WRITE_SERVER_REQUIRED",
      message: safeResult.error?.message ?? `生产模式要求通过后端完成${label}。`,
      ...(safeResult.error?.requiredPermission
        ? { requiredPermission: safeResult.error.requiredPermission }
        : {}),
    },
  };
}

function isProjectionRefreshFailure(result) {
  return !result || result.blocked || result.source !== "api";
}

function getPrintRequestFeedback({ result, fulfillment, action }) {
  const documentLabel = ["打印出库单", "重打出库单"].includes(action)
    ? "纸质出库单"
    : getFulfillmentDocumentLabel(fulfillment);
  const jobStatus = result.printJob?.jobStatus ?? "";
  if (action === "打印预览" || jobStatus === "preview_only" || result.printRecord?.status === "previewed") {
    return `已生成${documentLabel}预览；预览不等于实体打印，不会推进交付状态。`;
  }
  if (result.physicalPrintConfirmed || jobStatus === "printed") {
    return `${documentLabel}已由可信打印状态回读确认为 printed；交付投影已由后端推进。`;
  }
  const statusLabel = getPrintJobStatusLabel(jobStatus || "queued");
  return `${documentLabel}打印作业已创建（${statusLabel}）；需等待 spool / 驱动回读为 printed 后才推进交付。`;
}

export function createOfficePrintWriteActions({
  api = {},
  authState,
  currentUserDisplayName,
  currentUserId,
  fulfillmentsRef,
  printerDeviceQaRef,
  printBatchRecordsRef,
  refreshFulfillments,
  refreshOfficePrintJobQueue,
  refreshPrinterDeviceQa,
  refreshPrintDriverReadiness,
  refreshTodos,
  serverRequired = isOfficeApiServerRequired,
  setFulfillments,
  setPrinterDeviceQa,
  setPrintBatchRecords,
  setPrintJobQueue,
  setSelectedTodoId,
  setTodos,
  todosRef,
}) {
  const printApi = { ...defaultApi, ...api };

  function upsertPrintJobQueueItems(printJobs = []) {
    const safePrintJobs = (Array.isArray(printJobs) ? printJobs : [printJobs]).filter((item) => item?.printJobId);
    if (!safePrintJobs.length) return;
    setPrintJobQueue((current) => {
      const items = mergeOfficePrintJobQueueItems(current.items, safePrintJobs);
      return {
        ...current,
        source: current.source === "idle" ? "api" : current.source,
        items,
        total: Math.max(Number(current.total ?? 0), items.length),
        lastSyncedAt: formatSyncTime(),
      };
    });
  }

  async function dispatchPrintJobQueueItem(printJobId) {
    const safePrintJobId = String(printJobId ?? "").trim();
    if (!safePrintJobId) {
      return withFeedback({ source: "ui_error", blocked: true }, "未选择打印作业，无法派发。");
    }
    setPrintJobQueue((current) => ({ ...current, actionJobId: safePrintJobId, error: "" }));
    const result = normalizeWriteResultForRuntime(
      await printApi.dispatchOfficePrintJob({
        authState,
        printJobId: safePrintJobId,
        operatorId: currentUserId,
        reason: `${currentUserDisplayName} 在打包/标签页派发打印作业`,
      }),
      { label: "打印作业派发", serverRequired },
    );
    setPrintJobQueue((current) => ({ ...current, actionJobId: "" }));
    if (result.blocked) {
      setPrintJobQueue((current) => ({
        ...current,
        source: result.source,
        error: result.error?.message ?? "打印作业派发 API 返回错误。",
      }));
      return withFeedback(result, formatBlockedFeedback("后端拒绝派发打印作业", result));
    }
    upsertPrintJobQueueItems([result.printJob]);
    const refreshResult = result.source === "api"
      ? await refreshOfficePrintJobQueue({ showToast: false })
      : null;
    const statusLabel = getPrintJobStatusLabel(result.printJob?.jobStatus ?? result.dispatchResult?.jobStatus);
    return withFeedback(
      result,
      isProjectionRefreshFailure(refreshResult) && result.source === "api"
        ? `打印作业 ${safePrintJobId} 已派发为${statusLabel}，但作业池刷新失败，请手动刷新。`
        : `打印作业 ${safePrintJobId} 已派发：${statusLabel}；只有 printed 回读才代表打印完成。`,
      { projectionRefreshFailed: isProjectionRefreshFailure(refreshResult) && result.source === "api" },
    );
  }

  async function retryPrintJobQueueItem(printJobId) {
    const safePrintJobId = String(printJobId ?? "").trim();
    if (!safePrintJobId) {
      return withFeedback({ source: "ui_error", blocked: true }, "未选择打印作业，无法重试。");
    }
    setPrintJobQueue((current) => ({ ...current, actionJobId: safePrintJobId, error: "" }));
    const result = normalizeWriteResultForRuntime(
      await printApi.retryOfficePrintJob({
        authState,
        printJobId: safePrintJobId,
        operatorId: currentUserId,
        retryReason: `${currentUserDisplayName} 在打包/标签页重试打印作业`,
      }),
      { label: "打印作业重试", serverRequired },
    );
    setPrintJobQueue((current) => ({ ...current, actionJobId: "" }));
    if (result.blocked) {
      setPrintJobQueue((current) => ({
        ...current,
        source: result.source,
        error: result.error?.message ?? "打印作业重试 API 返回错误。",
      }));
      return withFeedback(result, formatBlockedFeedback("后端拒绝重试打印作业", result));
    }
    upsertPrintJobQueueItems([result.sourcePrintJob, result.printJob]);
    const refreshResult = result.source === "api"
      ? await refreshOfficePrintJobQueue({ showToast: false })
      : null;
    return withFeedback(
      result,
      isProjectionRefreshFailure(refreshResult) && result.source === "api"
        ? `重试作业 ${result.printJob?.printJobId ?? ""} 已创建，但作业池刷新失败，请手动刷新。`
        : `已为 ${safePrintJobId} 创建重试作业 ${result.printJob?.printJobId ?? ""}；等待可信状态回读。`,
      { projectionRefreshFailed: isProjectionRefreshFailure(refreshResult) && result.source === "api" },
    );
  }

  async function savePrinterDeviceMode() {
    const qa = printerDeviceQaRef.current;
    const selectedDeviceId = qa.selectedDeviceId;
    if (!selectedDeviceId) {
      return withFeedback({ source: "ui_error", blocked: true }, "请先选择要维护的打印设备。");
    }
    const selectedDevice = qa.devices.find((item) => item.printDeviceId === selectedDeviceId);
    if (!selectedDevice) {
      return withFeedback({ source: "ui_error", blocked: true }, "当前设备列表里找不到该打印设备，请先刷新。");
    }
    const nextDriverMode = String(qa.driverModeDraft || "preview_only").trim() || "preview_only";
    setPrinterDeviceQa((current) => ({ ...current, savingDeviceMode: true, error: "" }));
    const result = normalizeWriteResultForRuntime(
      await printApi.updateOfficePrintDeviceDriverMode({
        authState,
        printDeviceId: selectedDeviceId,
        driverMode: nextDriverMode,
        operatorId: currentUserId,
        reason: `${currentUserDisplayName} 在打包/标签页把 ${selectedDevice.name || selectedDeviceId} 驱动模式改为 ${nextDriverMode}`,
      }),
      { label: "打印设备模式保存", serverRequired },
    );
    if (result.blocked) {
      setPrinterDeviceQa((current) => ({
        ...current,
        savingDeviceMode: false,
        source: result.source,
        error: result.error?.message ?? "打印设备保存 API 返回错误。",
      }));
      return withFeedback(result, formatBlockedFeedback("后端拒绝保存设备模式", result));
    }
    const savedDevice = result.printDevice ?? {
      ...selectedDevice,
      settings: { ...(selectedDevice.settings ?? {}), driverMode: nextDriverMode },
    };
    setPrinterDeviceQa((current) => ({
      ...current,
      savingDeviceMode: false,
      source: result.source,
      devices: current.devices.map((device) => device.printDeviceId === selectedDeviceId ? savedDevice : device),
      deviceLabel: savedDevice.name || current.deviceLabel,
      driverLabel: getPrinterDeviceQaDriverLabel(savedDevice) || current.driverLabel,
      driverModeDraft: getPrinterDeviceDriverMode(savedDevice),
      paperLabel: getPrinterDeviceQaPaperLabel(savedDevice) || current.paperLabel,
      error: "",
      lastSyncedAt: formatSyncTime(),
    }));
    const readinessResult = result.source === "api"
      ? await refreshPrintDriverReadiness({ showToast: false })
      : null;
    const modeTip = nextDriverMode === "system_printer"
      ? "已设为真实打印候选模式；这不证明已出纸，仍需 command bridge、spool 回读、CUPS 和现场 QA。"
      : "已切回仅预览，不会派发实体打印。";
    return withFeedback(
      result,
      isProjectionRefreshFailure(readinessResult) && result.source === "api"
        ? `设备模式已保存，但打印上线门禁刷新失败，请手动刷新。${modeTip}`
        : `设备模式已通过后端 API 保存：${selectedDevice.name || selectedDeviceId} -> ${nextDriverMode}。${modeTip}`,
      { projectionRefreshFailed: isProjectionRefreshFailure(readinessResult) && result.source === "api" },
    );
  }

  async function savePrinterDeviceQaRecord() {
    const qa = printerDeviceQaRef.current;
    const selectedDeviceId = qa.selectedDeviceId;
    if (!selectedDeviceId) {
      return withFeedback({ source: "ui_error", blocked: true }, "请先选择要验收的打印设备。");
    }
    const selectedDevice = qa.devices.find((item) => item.printDeviceId === selectedDeviceId) ?? { printDeviceId: selectedDeviceId };
    const selectedPrintJob = (qa.eligiblePrintJobs ?? []).find(
      (item) => item.printJobId === qa.selectedPrintJobId,
    ) ?? null;
    setPrinterDeviceQa((current) => ({ ...current, saving: true, error: "" }));
    const result = normalizeWriteResultForRuntime(
      await printApi.recordOfficePrinterDeviceFieldTest({
        authState,
        printDeviceId: selectedDeviceId,
        printDevice: {
          ...selectedDevice,
          name: qa.deviceLabel || selectedDevice.name,
          driverName: qa.driverLabel || selectedDevice.driverName,
          paperName: qa.paperLabel || selectedDevice.paperName,
        },
        printJob: selectedPrintJob ?? {},
        printJobId: selectedPrintJob?.printJobId ?? "",
        operatorId: currentUserId,
        operatorName: currentUserDisplayName,
        checks: qa.checks,
        evidence: qa.evidence,
        note: qa.note,
      }),
      { label: "打印设备现场验收记录", serverRequired },
    );
    if (result.blocked) {
      setPrinterDeviceQa((current) => ({
        ...current,
        saving: false,
        recordSource: result.source,
        error: result.error?.message ?? "打印设备验收记录 API 返回错误。",
      }));
      return withFeedback(result, formatBlockedFeedback("后端拒绝保存打印设备验收", result));
    }
    const savedRecord = result.record ?? null;
    setPrinterDeviceQa((current) => ({
      ...current,
      saving: false,
      recordSource: result.source,
      devices: current.devices.map((device) =>
        device.printDeviceId === selectedDeviceId && savedRecord
          ? {
              ...device,
              latestFieldTestRecord: savedRecord,
              latestFieldTestSummary: savedRecord.summary,
              latestFieldTestCheckedAt: savedRecord.checkedAt,
            }
          : device,
      ),
      fieldTests: savedRecord
        ? [savedRecord, ...current.fieldTests.filter((item) => item.recordId !== savedRecord.recordId)]
        : current.fieldTests,
      latestRecord: savedRecord ?? current.latestRecord,
      checks: savedRecord?.checks ?? current.checks,
      evidence: savedRecord?.evidence ?? current.evidence,
      error: result.error?.message ?? "",
      lastSyncedAt: formatSyncTime(),
    }));
    const refreshResult = result.source === "api"
      ? await refreshPrinterDeviceQa({ showToast: false, selectedDeviceId })
      : null;
    return withFeedback(
      result,
      isProjectionRefreshFailure(refreshResult) && result.source === "api"
        ? "打印设备验收记录已保存，但设备验收列表刷新失败，请手动刷新。"
        : result.acceptance?.ready
          ? `打印设备验收已保存并关联已打印作业 ${result.acceptance.printJobId}：现场验收通过。`
          : `打印设备验收记录已保存：${savedRecord?.summary?.label ?? result.summary?.label ?? "已记录"}；尚未达到现场验收通过条件，仍需现场证据支撑，并关联已打印作业。`,
      { projectionRefreshFailed: isProjectionRefreshFailure(refreshResult) && result.source === "api" },
    );
  }

  async function printFulfillmentDocument({ modal, payload = {} }) {
    const fulfillment = fulfillmentsRef.current.find((item) => item.id === modal.fulfillmentId);
    if (!fulfillment) {
      return withFeedback({ source: "ui_error", blocked: true }, "未找到对应出库 / 交付记录，无法打印。");
    }
    const result = normalizeWriteResultForRuntime(
      await printApi.printOfficeFulfillment({
        authState,
        fulfillment,
        action: modal.action,
        operatorId: currentUserId,
        reason: payload.reason,
      }),
      { label: "打印 / 预览", serverRequired },
    );
    if (result.blocked) return withFeedback(result, formatBlockedFeedback("后端拒绝打印 / 预览", result));
    setFulfillments((current) =>
      applyPrintRecordProjection(current, fulfillment.id, result.printRecord, fulfillment),
    );
    upsertPrintJobQueueItems([result.printJob]);
    let refreshResults = [];
    if (result.source === "api") {
      refreshResults = await Promise.all([
        refreshOfficePrintJobQueue({ showToast: false }),
        refreshFulfillments({ showToast: false }),
      ]);
    }
    const projectionRefreshFailed = refreshResults.some(isProjectionRefreshFailure);
    return withFeedback(
      result,
      projectionRefreshFailed
        ? `${getPrintRequestFeedback({ result, fulfillment, action: modal.action })} 后端投影刷新失败，请手动刷新。`
        : getPrintRequestFeedback({ result, fulfillment, action: modal.action }),
      { projectionRefreshFailed },
    );
  }

  async function voidFulfillmentPrintRecord({ modal, payload = {} }) {
    const fulfillment = fulfillmentsRef.current.find((item) => item.id === modal.fulfillmentId);
    const printRecordId = modal.printRecordId ?? fulfillment?.activePrintRecordId ?? fulfillment?.printRecordId;
    if (!fulfillment || !printRecordId) {
      return withFeedback({ source: "ui_error", blocked: true }, "未找到可作废的打印记录，无法继续。");
    }
    const result = normalizeWriteResultForRuntime(
      await printApi.voidOfficePrintRecord({
        authState,
        printRecordId,
        operatorId: currentUserId,
        reason: payload.reason,
      }),
      { label: "打印记录作废", serverRequired },
    );
    if (result.blocked) return withFeedback(result, formatBlockedFeedback("后端拒绝作废旧单据/标签", result));
    const printRecord = result.printRecord ?? {
      printRecordId,
      status: "voided",
      voidReason: payload.reason,
      voidedAt: new Date().toISOString(),
    };
    setFulfillments((current) => current.map((item) => item.id === fulfillment.id
      ? {
          ...item,
          printed: false,
          printRecordStatus: "voided",
          activePrintRecordId: printRecord.printRecordId,
          printRecordId: printRecord.printRecordId,
          printVoidReason: payload.reason,
          printVoidedAt: printRecord.voidedAt ?? "刚刚",
        }
      : item));
    const refreshResult = result.source === "api"
      ? await refreshFulfillments({ showToast: false })
      : null;
    const documentLabel = getFulfillmentDocumentLabel(fulfillment);
    const nextText = fulfillment.method === "快递快运" ? "确认拉走" : "完成交付";
    return withFeedback(
      result,
      isProjectionRefreshFailure(refreshResult) && result.source === "api"
        ? `旧${documentLabel}已作废，但交付列表刷新失败，请手动刷新。`
        : `已通过后端 API 作废旧${documentLabel}；需要重打并收到 printed 回读后才能${nextText}。`,
      { projectionRefreshFailed: isProjectionRefreshFailure(refreshResult) && result.source === "api" },
    );
  }

  async function confirmBatchPrintResult({ modal, payload = {} }) {
    const currentTodos = todosRef.current;
    const printTodos = currentTodos.filter(
      (item) => modal.todoIds?.includes(item.id) && !item.handled && isPrintTodo(item),
    );
    if (!printTodos.length) {
      return withFeedback({ source: "ui_error", blocked: true }, "没有可确认结果的打印类待办。");
    }
    const resultLabel = payload.reason;
    const totalLabels = getBatchPrintStats(printTodos).totalLabels;
    const printedLabelCount =
      resultLabel === "全部打出" ? totalLabels : resultLabel === "部分打出" ? Number(payload.actualQty ?? 0) : 0;
    if (
      resultLabel === "部分打出" &&
      (!Number.isFinite(printedLabelCount) || printedLabelCount <= 0 || printedLabelCount >= totalLabels)
    ) {
      return withFeedback(
        { source: "ui_error", blocked: true },
        `部分打出需要填写 1 到 ${Math.max(1, totalLabels - 1)} 之间的已打出标签数。`,
      );
    }
    const batchResult = applyBatchPrintResult(currentTodos, isPrintTodo, {
      todoIds: modal.todoIds,
      result: resultLabel,
      printedLabelCount,
      printedPackageIds: payload.printedPackageIds,
      operatorName: currentUserDisplayName,
    });
    let committedWrites = 0;
    if (batchResult.fullPrintedTodos.length) {
      const todoResult = normalizeWriteResultForRuntime(
        await printApi.handleOfficeTodoBatch({
          authState,
          todoIds: batchResult.fullPrintedTodos.map((item) => item.id),
          action: "批量打印标签",
          operatorId: currentUserId,
          handlingResult: `批量打印人工核对：${resultLabel}`,
        }),
        { label: "批量打印待办处理", serverRequired },
      );
      if (todoResult.blocked) return withFeedback(todoResult, formatBlockedFeedback("后端拒绝批量处理待办", todoResult));
      committedWrites += 1;
    }
    const pendingPrintTodos = batchResult.printTodos.filter((item) => !batchResult.fullyPrintedIds.has(item.id));
    for (const todo of pendingPrintTodos) {
      const projected = batchResult.todos.find((item) => item.id === todo.id) ?? todo;
      const todoResult = normalizeWriteResultForRuntime(
        await printApi.handleOfficeTodoAction({
          authState,
          todoId: todo.id,
          action: "批量打印结果待处理",
          operatorId: currentUserId,
          reason: resultLabel,
          handlingResult: projected.lastAction,
          printResultStatus: projected.printResultStatus,
          printedLabelCount: projected.printedLabelCount,
          pendingLabelCount: projected.pendingLabelCount,
          totalLabelCount: Number(projected.printedLabelCount ?? 0) + Number(projected.pendingLabelCount ?? 0),
          printedPackageIds: projected.printedPackageIds,
          pendingPackageIds: projected.pendingPackageIds,
          printPackages: projected.printPackages,
        }),
        { label: "打印结果记录", serverRequired },
      );
      if (todoResult.blocked) {
        if (committedWrites) await refreshTodos({ showToast: false });
        return withFeedback(
          todoResult,
          `${formatBlockedFeedback("后端拒绝记录打印结果", todoResult)} 此前已有 ${committedWrites} 项写入提交，请刷新核对。`,
          { partiallyCommitted: committedWrites > 0 },
        );
      }
      committedWrites += 1;
    }
    const printBatchPackages = batchResult.printTodos.flatMap((todo) => {
      const projected = batchResult.todos.find((item) => item.id === todo.id) ?? todo;
      return (projected.printPackages ?? []).map((item) => ({
        ...item,
        todoId: todo.id,
        todoRef: todo.ref,
        todoType: todo.type,
        customerId: todo.customerId,
        summary: todo.summary,
      }));
    });
    const printBatchDraft = createPrintBatchRecord({
      action: "批量打印标签",
      resultLabel,
      todoIds: batchResult.printTodos.map((item) => item.id),
      todoRefs: batchResult.printTodos.map((item) => item.ref),
      totalTaskCount: batchResult.totalTasks,
      totalLabelCount: batchResult.totalLabels,
      printedLabelCount: batchResult.printedLabelCount,
      pendingLabelCount: batchResult.pendingLabelCount,
      printedPackageIds: batchResult.printedPackageIds,
      pendingPackageIds: batchResult.pendingPackageIds,
      printPackages: printBatchPackages,
      operatorId: currentUserId,
      operatorName: currentUserDisplayName,
      sequence: printBatchRecordsRef.current.length + 1,
    });
    const batchApiResult = normalizeWriteResultForRuntime(
      await printApi.createOfficePrintBatchRecord({
        authState,
        operatorId: currentUserId,
        printBatchRecord: printBatchDraft,
      }),
      { label: "打印批次记录", serverRequired },
    );
    if (batchApiResult.blocked) {
      if (committedWrites) await refreshTodos({ showToast: false });
      return withFeedback(
        batchApiResult,
        `${formatBlockedFeedback("后端拒绝记录打印批次", batchApiResult)} 此前已有 ${committedWrites} 项待办写入提交，请刷新核对。`,
        { partiallyCommitted: committedWrites > 0 },
      );
    }
    const printBatchRecord = {
      ...printBatchDraft,
      ...(batchApiResult.printBatchRecord ?? {}),
      operationLogId: batchApiResult.operationLogId ?? batchApiResult.printBatchRecord?.operationLogId ?? "",
    };
    setTodos(batchResult.todos);
    setPrintBatchRecords((current) => [
      printBatchRecord,
      ...current.filter((item) => item.printBatchId !== printBatchRecord.printBatchId),
    ]);
    const nextOpenId = getNextOpenTodoId(
      batchResult.todos,
      batchResult.fullPrintedTodos.map((item) => item.id),
      sortTodos,
    );
    if (nextOpenId) setSelectedTodoId(nextOpenId);
    const refreshResult = batchApiResult.source === "api" ? await refreshTodos({ showToast: false }) : null;
    const pendingText = batchResult.pendingLabelCount
      ? `，剩余 ${batchResult.pendingLabelCount} 张继续待打印/核对`
      : "";
    return withFeedback(
      batchApiResult,
      isProjectionRefreshFailure(refreshResult) && batchApiResult.source === "api"
        ? `批次 ${printBatchRecord.printBatchId} 已记录，但待办刷新失败，请手动刷新。`
        : `已记录人工核对结果：${resultLabel}，${batchResult.printedLabelCount}/${batchResult.totalLabels} 张${pendingText}；批次 ${printBatchRecord.printBatchId}。该记录不替代 spool printed 回读，也不推进交付。`,
      { printBatchRecord, projectionRefreshFailed: isProjectionRefreshFailure(refreshResult) && batchApiResult.source === "api" },
    );
  }

  return {
    confirmBatchPrintResult,
    dispatchPrintJobQueueItem,
    printFulfillmentDocument,
    retryPrintJobQueueItem,
    savePrinterDeviceMode,
    savePrinterDeviceQaRecord,
    voidFulfillmentPrintRecord,
  };
}

export function useOfficePrintWrites(options) {
  const actions = createOfficePrintWriteActions(options);
  const dependencies = [
    options.authState,
    options.currentUserDisplayName,
    options.currentUserId,
    options.fulfillmentsRef,
    options.printerDeviceQaRef,
    options.printBatchRecordsRef,
    options.serverRequired,
    options.todosRef,
  ];
  return {
    confirmBatchPrintResult: useCallback(actions.confirmBatchPrintResult, dependencies),
    dispatchPrintJobQueueItem: useCallback(actions.dispatchPrintJobQueueItem, dependencies),
    printFulfillmentDocument: useCallback(actions.printFulfillmentDocument, dependencies),
    retryPrintJobQueueItem: useCallback(actions.retryPrintJobQueueItem, dependencies),
    savePrinterDeviceMode: useCallback(actions.savePrinterDeviceMode, dependencies),
    savePrinterDeviceQaRecord: useCallback(actions.savePrinterDeviceQaRecord, dependencies),
    voidFulfillmentPrintRecord: useCallback(actions.voidFulfillmentPrintRecord, dependencies),
  };
}
