import { useCallback, useEffect, useRef } from "react";
import { printOfficeFulfillment, voidOfficePrintRecord } from "../services/officeFulfillmentLazyApi.js";
import { isOfficeApiServerRequired } from "../services/officeAuthService.js";
import { dispatchOfficePrintJob, retryOfficePrintJob } from "../services/officePrintLazyApi.js";
import {
  recordOfficePrinterDeviceFieldTest,
  updateOfficePrintDeviceDriverMode,
} from "../services/officePrintLazyApi.js";
import { getFulfillmentDocumentLabel } from "../domain/officeRules.js";
import {
  getPrintJobStatusLabel,
  getPrinterDeviceDriverMode,
  getPrinterDeviceQaDriverLabel,
  getPrinterDeviceQaPaperLabel,
  mergeOfficePrintJobQueueItems,
} from "../state/officePrintState.js";

const defaultApi = {
  dispatchOfficePrintJob,
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
  if (result.physicalPrintConfirmed === true) {
    return `${documentLabel}已确认打印完成。请按交付列表中的当前状态继续。`;
  }
  if (jobStatus === "printed") {
    return `${documentLabel}的打印作业已结束，但尚未确认当前单据的打印结果。请刷新并核对单据、包裹和标签版本后再继续。`;
  }
  const statusLabel = getPrintJobStatusLabel(jobStatus || "queued");
  return `${documentLabel}打印作业已创建（${statusLabel}）；设备确认打印完成后，系统才会更新交付状态。`;
}

export function createOfficePrintWriteActions({
  api = {},
  authState,
  currentUserDisplayName,
  currentUserId,
  fulfillmentsRef,
  printerDeviceQaRef,
  refreshFulfillments,
  refreshOfficePrintJobQueue,
  refreshPrinterDeviceQa,
  refreshPrintDriverReadiness,
  serverRequired = isOfficeApiServerRequired,
  isPrintSessionCurrent = () => true,
  printerQaPendingRef = { current: new Set() },
  setPrinterDeviceQa,
  setPrintJobQueue,
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
    if (!isPrintSessionCurrent()) return { blocked: true, stale: true };
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
    if (!isPrintSessionCurrent() || printerDeviceQaRef.current.selectedDeviceId !== selectedDeviceId ||
      (printerDeviceQaRef.current.selectionRevision ?? 0) !== (qa.selectionRevision ?? 0)) {
      return { ...result, stale: true };
    }
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
    if (!isPrintSessionCurrent("print.device_qa.record")) return { blocked: true, stale: true };
    const qa = printerDeviceQaRef.current;
    const key = JSON.stringify([currentUserId, authState?.session?.accessToken, qa.selectedDeviceId]);
    if (printerQaPendingRef.current.has(key)) {
      return withFeedback({ source: "ui_error", blocked: true }, "验收记录正在保存，请等待结果。");
    }
    printerQaPendingRef.current.add(key);
    try {
      return await performPrinterDeviceQaSave();
    } catch {
      const stale = !isPrintSessionCurrent("print.device_qa.record") ||
        printerDeviceQaRef.current.selectedDeviceId !== qa.selectedDeviceId ||
        (printerDeviceQaRef.current.selectionRevision ?? 0) !== (qa.selectionRevision ?? 0);
      const message = "验收保存结果未确认，请刷新核对记录后再操作。";
      if (!stale) setPrinterDeviceQa((current) => ({ ...current, saving: false, error: message }));
      return withFeedback({ source: "api_error", blocked: true, stale,
        error: { code: "PRINTER_QA_SAVE_UNCONFIRMED", message } }, message);
    } finally {
      printerQaPendingRef.current.delete(key);
    }
  }

  async function performPrinterDeviceQaSave() {
    if (!isPrintSessionCurrent("print.device_qa.record")) return { blocked: true, stale: true };
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
    if (!isPrintSessionCurrent("print.device_qa.record") || printerDeviceQaRef.current.selectedDeviceId !== selectedDeviceId ||
      (printerDeviceQaRef.current.selectionRevision ?? 0) !== (qa.selectionRevision ?? 0)) {
      return { ...result, stale: true };
    }
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
    let refreshResult = null;
    if (result.source === "api") {
      try {
        refreshResult = await refreshPrinterDeviceQa({ showToast: false, selectedDeviceId });
      } catch {
        refreshResult = { source: "api_error", blocked: true };
      }
    }
    if (!isPrintSessionCurrent("print.device_qa.record") ||
      printerDeviceQaRef.current.selectedDeviceId !== selectedDeviceId ||
      (printerDeviceQaRef.current.selectionRevision ?? 0) !== (qa.selectionRevision ?? 0)) {
      return { ...result, stale: true };
    }
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

  async function runFulfillmentPrintCommand({ modal, payload = {}, voiding = false }) {
    const frozen = payload.printRequest;
    const fulfillment = frozen?.fulfillment ?? fulfillmentsRef.current.find(item => item.id === modal.fulfillmentId);
    const printRecordId = frozen?.printRecordId ?? modal.printRecordId ?? fulfillment?.activePrintRecordId ?? fulfillment?.printRecordId;
    if (!isPrintSessionCurrent()) return { blocked: true, stale: true, feedback: "账号或打印权限已变化，请重新进入操作。" };
    if (!fulfillment || fulfillment.id !== modal.fulfillmentId || (voiding && !printRecordId)) {
      return { blocked: true, feedback: "未找到对应出库或打印记录，请刷新后重新核对。" };
    }
    const reason = frozen?.reason ?? payload.reason;
    const input = {
      authState, operatorId: currentUserId, fulfillment,
      action: modal.action, reason, printRecordId,
      idempotencyKey: frozen?.idempotencyKey,
    };
    let result;
    try {
      result = normalizeWriteResultForRuntime(await (voiding
        ? printApi.voidOfficePrintRecord(input)
        : printApi.printOfficeFulfillment(input)), { label: voiding ? "打印作废" : "打印", serverRequired });
    } catch {
      return { blocked: true, feedback: "未能确认服务器结果，已保留本次内容。请使用原请求重试。" };
    }
    if (!isPrintSessionCurrent()) return { blocked: true, stale: true };
    if (result.blocked) return withFeedback(result, formatBlockedFeedback("服务器暂未确认操作", result));
    const record = result.printRecord;
    const job = result.printJob;
    const receiptMatches = result.source === "api" && result.operationLogId && record?.printRecordId
      && record.targetType === "fulfillment" && record.targetId === fulfillment.id
      && (voiding
        ? record.printRecordId === printRecordId && record.status === "voided"
        : result.fulfillmentId === fulfillment.id && job?.printJobId && job.printRecordId === record.printRecordId
          && job.targetType === "fulfillment" && job.targetId === fulfillment.id && result.printJobOperationLogId);
    if (!receiptMatches) return {
      blocked: true, error: { code: "PRINT_RECEIPT_MISMATCH" },
      feedback: "服务器返回的打印凭据不完整或不属于本单，未确认成功。请保留原请求重试。",
    };
    const refreshed = await Promise.allSettled([
      refreshFulfillments({ showToast: false }),
      refreshOfficePrintJobQueue({ showToast: false }),
    ]);
    if (!isPrintSessionCurrent()) return { blocked: true, stale: true };
    const projectionRefreshFailed = refreshed.some(item => item.status !== "fulfilled" || isProjectionRefreshFailure(item.value));
    const feedback = voiding
      ? `原${getFulfillmentDocumentLabel(fulfillment)}的作废凭据已确认。请按列表中的当前状态继续。`
      : getPrintRequestFeedback({ result, fulfillment, action: modal.action });
    return withFeedback(result, projectionRefreshFailed
      ? `${feedback} 操作已保存，但当前状态刷新失败，请刷新列表；不必重新提交。`
      : feedback, { confirmed: true, projectionRefreshFailed });
  }

  function printFulfillmentDocument(input) {
    return runFulfillmentPrintCommand(input);
  }

  function voidFulfillmentPrintRecord(input) {
    return runFulfillmentPrintCommand({ ...input, voiding: true });
  }

  return {
    dispatchPrintJobQueueItem,
    printFulfillmentDocument,
    retryPrintJobQueueItem,
    savePrinterDeviceMode,
    savePrinterDeviceQaRecord,
    voidFulfillmentPrintRecord,
  };
}

export function useOfficePrintWrites(options) {
  const printMounted = useRef(true);
  const printerQaPendingRef = useRef(new Set());
  useEffect(() => { printMounted.current = true; return () => { printMounted.current = false; }; }, []);
  const owner = options.currentUserId;
  const token = options.authState?.session?.accessToken;
  const currentSession = useRef(options);
  currentSession.current = options;
  const actions = createOfficePrintWriteActions({
    ...options,
    printerQaPendingRef,
    isPrintSessionCurrent: (permission = "fulfillment.print") => printMounted.current && currentSession.current.currentUserId === owner
      && currentSession.current.authState?.session?.accessToken === token
      && currentSession.current.authState?.permissions?.actionPermissions?.includes(permission) === true,
  });
  const dependencies = [
    options.authState,
    options.currentUserDisplayName,
    options.currentUserId,
    options.fulfillmentsRef,
    options.printerDeviceQaRef,
    options.serverRequired,
  ];
  return {
    dispatchPrintJobQueueItem: useCallback(actions.dispatchPrintJobQueueItem, dependencies),
    printFulfillmentDocument: useCallback(actions.printFulfillmentDocument, dependencies),
    retryPrintJobQueueItem: useCallback(actions.retryPrintJobQueueItem, dependencies),
    savePrinterDeviceMode: useCallback(actions.savePrinterDeviceMode, dependencies),
    savePrinterDeviceQaRecord: useCallback(actions.savePrinterDeviceQaRecord, dependencies),
    voidFulfillmentPrintRecord: useCallback(actions.voidFulfillmentPrintRecord, dependencies),
  };
}
