export function buildDiagnosticSpoolRecord({ diagnosticExternalJobId, diagnosticPrintJob, status, now }) {
  return {
    bridgeJobId: diagnosticExternalJobId,
    externalJobId: diagnosticExternalJobId,
    status,
    mode: "diagnostic_spool_only",
    createdAt: now,
    ...(status === "completed" ? { completedAt: now, updatedAt: now } : {}),
    payloadDigest: "0".repeat(64),
    printJobId: diagnosticPrintJob.printJobId,
    printDeviceId: diagnosticPrintJob.printDeviceId,
    documentType: "diagnostic",
    targetType: "print_driver",
    targetId: "command_bridge_spool",
  };
}

export function summarizePollResultForDiagnostics(result = {}) {
  return {
    adapterStatus: String(result.adapterStatus ?? "").trim(),
    status: String(result.status ?? "").trim(),
    driverStatus: String(result.driverStatus ?? "").trim(),
    externalJobId: String(result.externalJobId ?? "").trim(),
    errorCode: String(result.errorCode ?? "").trim(),
    message: String(result.message ?? "").trim(),
    metadata: {
      commandBridge: {
        statusReadback: result.metadata?.commandBridge?.statusReadback ?? "",
        statusFileFound: Boolean(result.metadata?.commandBridge?.statusFileFound),
        statusFileValid: Boolean(result.metadata?.commandBridge?.statusFileValid),
        bridgeStatus: String(result.metadata?.commandBridge?.bridgeStatus ?? "").trim(),
        bridgeDirectoryStatus: String(result.metadata?.commandBridge?.bridgeDirectoryStatus ?? "").trim(),
        bridgeMode: String(result.metadata?.commandBridge?.bridgeMode ?? "").trim(),
      },
    },
  };
}

export function buildSpoolDiagnosticRuntimeBlockers({ writeOk, pendingPollOk, completedPollOk, cleanupOk, pendingPoll, completedPoll }) {
  const blockers = [];
  if (!writeOk) {
    blockers.push({
      key: "diagnostic-spool-write",
      label: "诊断 spool 写入",
      status: "failed",
      tone: "danger",
      blocking: true,
      detail: "诊断状态文件未能写入或写入后不可见",
    });
  }
  if (!pendingPollOk) {
    blockers.push({
      key: "diagnostic-pending-readback",
      label: "pending 状态回读",
      status: "failed",
      tone: "danger",
      blocking: true,
      detail: pendingPoll?.message || "诊断 queued 状态无法按 sent/pending 回读",
    });
  }
  if (!completedPollOk) {
    blockers.push({
      key: "diagnostic-completed-readback",
      label: "completed 状态回读",
      status: "failed",
      tone: "danger",
      blocking: true,
      detail: completedPoll?.message || "诊断 completed 状态无法按 printed 回读",
    });
  }
  if (!cleanupOk) {
    blockers.push({
      key: "diagnostic-cleanup",
      label: "诊断文件清理",
      status: "failed",
      tone: "danger",
      blocking: false,
      detail: "诊断状态文件未能清理干净",
    });
  }
  return blockers;
}

export function parseCupsPreflightStdout(stdout) {
  const raw = String(stdout ?? "").trim();
  if (!raw) {
    return {
      status: "failed",
      ready: false,
      errorCode: "SYSTEM_PRINTER_CUPS_PREFLIGHT_NO_OUTPUT",
      message: "CUPS queue preflight did not return a JSON result.",
    };
  }
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed
      : {
          status: "failed",
          ready: false,
          errorCode: "SYSTEM_PRINTER_CUPS_PREFLIGHT_INVALID_OUTPUT",
          message: "CUPS queue preflight returned invalid JSON.",
        };
  } catch {
    return {
      status: "failed",
      ready: false,
      errorCode: "SYSTEM_PRINTER_CUPS_PREFLIGHT_INVALID_OUTPUT",
      message: "CUPS queue preflight returned invalid JSON.",
    };
  }
}

export function buildCupsDiagnosticRuntimeBlockers({ result, parsed }) {
  const blockers = [];
  if (!result.ok) {
    blockers.push({
      key: "cups-preflight-command-bridge",
      label: "CUPS 队列预检桥",
      status: "failed",
      tone: "danger",
      blocking: true,
      detail: result.message || "命令桥未能返回 CUPS 队列预检结果",
    });
  }
  if (parsed.errorCode) {
    blockers.push({
      key: "cups-preflight-runtime",
      label: "CUPS 队列状态",
      status: "failed",
      tone: "danger",
      blocking: true,
      detail: sanitizeCommandBridgeMessage(parsed.message) || "CUPS 队列预检未通过",
    });
  }
  if (parsed.ready !== true && !parsed.errorCode) {
    blockers.push({
      key: "cups-preflight-ready",
      label: "CUPS 队列可用性",
      status: "pending",
      tone: "warning",
      blocking: true,
      detail: sanitizeCommandBridgeMessage(parsed.message) || "CUPS 队列尚未证明可用",
    });
  }
  return blockers;
}

export function sanitizeCommandBridgeMessage(value) {
  const message = String(value ?? "").trim();
  if (!message) return "";
  return message.slice(0, 200);
}
