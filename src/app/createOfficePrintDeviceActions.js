import {
  createPrinterDeviceFieldTestChecks,
  createPrinterDeviceFieldTestEvidence,
  normalizePrinterDeviceFieldTestEvidence,
  normalizePrinterDeviceFieldTestChecks,
} from "../services/printerDeviceFieldTestClient.js";
import {
  getPrinterDeviceDriverMode,
  getPrinterDeviceQaDriverLabel,
  getPrinterDeviceQaPaperLabel,
} from "../state/officePrintState.js";

export function createOfficePrintDeviceActions({
  allowLocalFallback,
  dispatchPrintJobQueueItem,
  guardUiAction,
  printerDeviceQa,
  printerDeviceQaSelectedIdRef,
  refreshPrinterDeviceQa,
  retryPrintJobQueueItem,
  savePrinterDeviceMode,
  savePrinterDeviceQaRecord,
  setPrinterDeviceQa,
  setToast,
}) {
  function normalizeFormalWriteResult(result, label) {
    if (!result || result.blocked || allowLocalFallback || result.source === "api") return result;
    return {
      ...result,
      blocked: true,
      upstreamSource: result.source,
      source: "api_error",
      error: {
        code: result.error?.code ?? "PRINT_DEVICE_ACTION_SERVER_REQUIRED",
        message: result.error?.message ?? `生产模式要求通过后端完成${label}。`,
      },
      feedback: `后端未确认${label}，production 不接受本地替代结果。`,
    };
  }

  async function runWriteAction({ surfaceAction, label, execute }) {
    if (!guardUiAction("productionPacking", surfaceAction)) return null;
    const result = normalizeFormalWriteResult(await execute(), label);
    if (result?.feedback) setToast(result.feedback);
    return result;
  }

  async function dispatchPrintJob(printJobId) {
    return runWriteAction({
      surfaceAction: "派发打印作业",
      label: "打印作业派发",
      execute: () => dispatchPrintJobQueueItem(printJobId),
    });
  }

  async function retryPrintJob(printJobId) {
    return runWriteAction({
      surfaceAction: "重试打印作业",
      label: "打印作业重试",
      execute: () => retryPrintJobQueueItem(printJobId),
    });
  }

  async function selectPrinterDeviceQaDevice(printDeviceId) {
    const safePrintDeviceId = String(printDeviceId ?? "").trim();
    if (!safePrintDeviceId) {
      setToast("未选择打印设备。");
      return null;
    }
    printerDeviceQaSelectedIdRef.current = safePrintDeviceId;
    const canProjectCurrentDevice = allowLocalFallback || printerDeviceQa.source === "api";
    if (canProjectCurrentDevice) {
      const selectedDevice = printerDeviceQa.devices.find((item) => item.printDeviceId === safePrintDeviceId) ?? null;
      setPrinterDeviceQa((current) => ({
        ...current,
        selectedDeviceId: safePrintDeviceId,
        fieldTests: [],
        latestRecord: null,
        checks: createPrinterDeviceFieldTestChecks(),
        deviceLabel: selectedDevice?.name ?? "",
        driverLabel: getPrinterDeviceQaDriverLabel(selectedDevice),
        driverModeDraft: selectedDevice ? getPrinterDeviceDriverMode(selectedDevice) : "preview_only",
        paperLabel: getPrinterDeviceQaPaperLabel(selectedDevice),
        evidence: createPrinterDeviceFieldTestEvidence(),
        error: "",
      }));
    }
    const result = await refreshPrinterDeviceQa({ selectedDeviceId: safePrintDeviceId, showToast: false });
    const devicesSource = result?.devices?.source;
    if (!allowLocalFallback && (result?.blocked || devicesSource !== "api")) {
      setToast("打印设备列表尚未通过后端 API 刷新，production 不使用本地设备。");
      return null;
    }
    if (result?.feedback) setToast(result.feedback);
    return result;
  }

  function changePrinterDeviceQaField(field, value) {
    setPrinterDeviceQa((current) => ({ ...current, [field]: value }));
  }

  function changePrinterDeviceQaCheck(checkKey, status) {
    setPrinterDeviceQa((current) => ({
      ...current,
      checks: normalizePrinterDeviceFieldTestChecks(
        current.checks.map((item) => item.key === checkKey ? { ...item, status } : item),
      ),
    }));
  }

  function changePrinterDeviceQaEvidenceField(field, value) {
    setPrinterDeviceQa((current) => ({
      ...current,
      evidence: normalizePrinterDeviceFieldTestEvidence({
        ...(current.evidence ?? {}),
        [field]: value,
      }),
    }));
  }

  async function persistPrinterDeviceMode() {
    return runWriteAction({
      surfaceAction: "保存设备模式",
      label: "打印设备模式保存",
      execute: savePrinterDeviceMode,
    });
  }

  async function persistPrinterDeviceQaRecord() {
    return runWriteAction({
      surfaceAction: "保存打印验收",
      label: "打印设备验收保存",
      execute: savePrinterDeviceQaRecord,
    });
  }

  return {
    changePrinterDeviceQaCheck,
    changePrinterDeviceQaEvidenceField,
    changePrinterDeviceQaField,
    dispatchPrintJobQueueItem: dispatchPrintJob,
    retryPrintJobQueueItem: retryPrintJob,
    savePrinterDeviceMode: persistPrinterDeviceMode,
    savePrinterDeviceQaRecord: persistPrinterDeviceQaRecord,
    selectPrinterDeviceQaDevice,
  };
}
