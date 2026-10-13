import {
  readOfficeApiJson as readJson,
  requestOfficeApi as requestPrintDriverConfigApi,
  toOfficeApiError as toApiError,
} from "./officeApiClientCore.js";

export async function getOfficePrintDriverConfig(input = {}, options = {}) {
  const { authState, operatorId } = input;

  try {
    const response = await requestPrintDriverConfigApi("/print-driver/config", {
      ...options,
      authState,
      method: "GET",
      operatorId,
    });
    const json = await readJson(response, {});
    if (!response.ok) {
      return {
        source: "api_error",
        blocked: true,
        config: createLocalPrintDriverConfigFallback(),
        error: toApiError(json, response.status, "打印驱动配置 API 返回错误。"),
      };
    }

    return {
      source: "api",
      config: normalizePrintDriverConfig(json?.printDriverAdapter),
      error: null,
    };
  } catch (error) {
    return {
      source: "local_fallback",
      config: createLocalPrintDriverConfigFallback(),
      error: {
        code: "PRINT_DRIVER_CONFIG_API_UNAVAILABLE",
        message: error?.message ?? String(error),
      },
    };
  }
}

export async function getOfficePrintDriverV1Readiness(input = {}, options = {}) {
  const { authState, operatorId } = input;

  try {
    const response = await requestPrintDriverConfigApi("/print-driver/v1-readiness", {
      ...options,
      authState,
      method: "GET",
      operatorId,
    });
    const json = await readJson(response, {});
    if (!response.ok) {
      return {
        source: "api_error",
        blocked: true,
        readiness: createLocalPrintDriverV1ReadinessFallback(),
        error: toApiError(json, response.status, "打印 V1 上线门禁 API 返回错误。"),
      };
    }

    return {
      source: "api",
      readiness: normalizePrintDriverV1Readiness(json),
      error: null,
    };
  } catch (error) {
    return {
      source: "local_fallback",
      readiness: createLocalPrintDriverV1ReadinessFallback(),
      error: {
        code: "PRINT_DRIVER_V1_READINESS_API_UNAVAILABLE",
        message: error?.message ?? String(error),
      },
    };
  }
}

export async function getOfficePrintDriverCupsDiagnostics(input = {}, options = {}) {
  const { authState, operatorId } = input;

  try {
    const response = await requestPrintDriverConfigApi("/print-driver/cups-diagnostics", {
      ...options,
      authState,
      method: "GET",
      operatorId,
    });
    const json = await readJson(response, {});
    if (!response.ok) {
      return {
        source: "api_error",
        blocked: true,
        diagnostics: createLocalPrintDriverCupsDiagnosticsFallback(),
        error: toApiError(json, response.status, "CUPS 队列预检 API 返回错误。"),
      };
    }

    return {
      source: "api",
      diagnostics: normalizePrintDriverCupsDiagnostics(json),
      error: null,
    };
  } catch (error) {
    return {
      source: "local_fallback",
      diagnostics: createLocalPrintDriverCupsDiagnosticsFallback(),
      error: {
        code: "PRINT_DRIVER_CUPS_DIAGNOSTICS_API_UNAVAILABLE",
        message: error?.message ?? String(error),
      },
    };
  }
}

export async function getOfficePrintDriverSpoolDiagnostics(input = {}, options = {}) {
  const { authState, operatorId } = input;

  try {
    const response = await requestPrintDriverConfigApi("/print-driver/spool-diagnostics", {
      ...options,
      authState,
      method: "GET",
      operatorId,
    });
    const json = await readJson(response, {});
    if (!response.ok) {
      return {
        source: "api_error",
        blocked: true,
        diagnostics: createLocalPrintDriverSpoolDiagnosticsFallback(),
        error: toApiError(json, response.status, "打印 spool 状态回读 API 返回错误。"),
      };
    }

    return {
      source: "api",
      diagnostics: normalizePrintDriverSpoolDiagnostics(json),
      error: null,
    };
  } catch (error) {
    return {
      source: "local_fallback",
      diagnostics: createLocalPrintDriverSpoolDiagnosticsFallback(),
      error: {
        code: "PRINT_DRIVER_SPOOL_DIAGNOSTICS_API_UNAVAILABLE",
        message: error?.message ?? String(error),
      },
    };
  }
}

export function normalizePrintDriverConfigForClient(value = {}) {
  return normalizePrintDriverConfig(value);
}

export function normalizePrintDriverV1ReadinessForClient(value = {}) {
  return normalizePrintDriverV1Readiness(value);
}

export function normalizePrintDriverSpoolDiagnosticsForClient(value = {}) {
  return normalizePrintDriverSpoolDiagnostics(value);
}

export function normalizePrintDriverCupsDiagnosticsForClient(value = {}) {
  return normalizePrintDriverCupsDiagnostics(value);
}

export function buildPrintDriverReadinessChecklist(value = null) {
  const hasConfig = isPlainObject(value);
  const config = hasConfig ? normalizePrintDriverConfig(value) : createLocalPrintDriverConfigFallback();
  const allowListCount = config.allowedPrinterNames.length;
  const configurationReadable = hasConfig && config.configurationAvailable;

  return [
    createReadinessChecklistItem({
      key: "configuration-readable",
      label: "后端配置可读",
      passed: configurationReadable,
      detail: configurationReadable ? "已读取脱敏驱动配置" : "尚未读取可用后端配置",
    }),
    createReadinessChecklistItem({
      key: "system-printer-enabled",
      label: "系统打印开关",
      passed: configurationReadable && config.systemPrinterEnabled,
      detail: config.systemPrinterEnabled ? "后端已允许系统打印" : "需开启系统打印环境开关",
    }),
    createReadinessChecklistItem({
      key: "command-bridge-selected",
      label: "命令桥类型",
      passed: configurationReadable && config.systemPrinterAdapterKind === "command_bridge",
      detail: config.systemPrinterAdapterKind === "command_bridge" ? "已选择命令桥适配器" : "需选择 command_bridge",
    }),
    createReadinessChecklistItem({
      key: "command-configured",
      label: "打印命令",
      passed: configurationReadable && config.systemPrinterCommandConfigured,
      detail: config.systemPrinterCommandConfigured ? "命令已在后端配置" : "需在后端配置打印命令",
    }),
    createReadinessChecklistItem({
      key: "command-args-configured",
      label: "命令参数",
      passed: configurationReadable && config.systemPrinterCommandArgsConfigured,
      detail: config.systemPrinterCommandArgsConfigured ? "参数模板已配置" : "需配置安全参数模板",
    }),
    createReadinessChecklistItem({
      key: "printer-allowlist",
      label: "打印机白名单",
      passed: configurationReadable && allowListCount > 0,
      detail: allowListCount ? `已限制 ${allowListCount} 台目标设备` : "真实派发前必须限制目标设备",
    }),
    createReadinessChecklistItem({
      key: "status-readback",
      label: "状态回读",
      passed: configurationReadable && config.commandBridgeStatusReadbackAvailable,
      detail: config.commandBridgeStatusReadbackAvailable ? "可读取本地 spool 状态" : "需接入 spool 状态回读",
    }),
    createReadinessChecklistItem({
      key: "command-redaction",
      label: "命令值脱敏",
      passed: configurationReadable && !config.safeguards.commandValueExposed,
      detail: config.safeguards.commandValueExposed ? "前端不应看到真实命令值" : "前端只看到脱敏配置",
      failureTone: "danger",
    }),
    createReadinessChecklistItem({
      key: "real-dispatch-available",
      label: "真实派发可达",
      passed: configurationReadable && config.realDispatchAvailable,
      detail: config.realDispatchAvailable ? "可提交真实命令桥" : "当前仍处保护或未满足派发条件",
    }),
  ];
}

export function getPrintDriverReadinessSummary(value = null) {
  const checklist = buildPrintDriverReadinessChecklist(value);
  const passedCount = checklist.filter((item) => item.passed).length;
  const dangerCount = checklist.filter((item) => item.tone === "danger").length;
  return {
    label: `${passedCount}/${checklist.length} 通过`,
    passedCount,
    totalCount: checklist.length,
    remainingCount: checklist.length - passedCount,
    dangerCount,
    tone: dangerCount ? "danger" : passedCount === checklist.length ? "success" : "warning",
  };
}

function normalizePrintDriverConfig(value = {}) {
  const source = isPlainObject(value) ? value : {};
  const safeguards = isPlainObject(source.safeguards) ? source.safeguards : {};
  return {
    adapterName: cleanText(source.adapterName) || "unknown-print-driver-adapter",
    kind: cleanText(source.kind) || "unknown",
    configurationAvailable: source.configurationAvailable === undefined ? true : Boolean(source.configurationAvailable),
    dryRunEnabled: Boolean(source.dryRunEnabled),
    systemPrinterEnabled: Boolean(source.systemPrinterEnabled),
    systemPrinterAdapterKind: cleanText(source.systemPrinterAdapterKind) || "unknown",
    systemPrinterCommandConfigured: Boolean(source.systemPrinterCommandConfigured),
    systemPrinterCommandArgsConfigured: Boolean(source.systemPrinterCommandArgsConfigured),
    systemPrinterCommandTimeoutMs: Math.max(0, Math.trunc(Number(source.systemPrinterCommandTimeoutMs ?? 0))),
    commandBridgeStatusReadbackAvailable: Boolean(source.commandBridgeStatusReadbackAvailable),
    allowedPrinterNames: normalizeStringList(source.allowedPrinterNames),
    realDispatchAvailable: Boolean(source.realDispatchAvailable),
    environmentPreflight: normalizePrintDriverEnvironmentPreflight(source.environmentPreflight),
    safeguards: {
      commandValueExposed: Boolean(safeguards.commandValueExposed),
      physicalPrinterCallsBlocked: safeguards.physicalPrinterCallsBlocked === undefined
        ? true
        : Boolean(safeguards.physicalPrinterCallsBlocked),
    },
  };
}

function createLocalPrintDriverConfigFallback() {
  return normalizePrintDriverConfig({
    adapterName: "local-print-driver-config-fallback",
    kind: "unknown",
    configurationAvailable: false,
    dryRunEnabled: false,
    systemPrinterEnabled: false,
    systemPrinterAdapterKind: "unknown",
    systemPrinterCommandConfigured: false,
    systemPrinterCommandArgsConfigured: false,
    systemPrinterCommandTimeoutMs: 0,
    commandBridgeStatusReadbackAvailable: false,
    allowedPrinterNames: [],
    realDispatchAvailable: false,
    environmentPreflight: {
      checkedAt: "",
      scope: "non_printing_environment_preflight",
      summary: {
        label: "0/0 通过",
        passedCount: 0,
        totalCount: 0,
        blockingCount: 0,
        tone: "warning",
      },
      items: [],
      safeguards: {
        nonPrinting: true,
        commandValueExposed: false,
        commandArgsExposed: false,
        spoolPathExposed: false,
      },
    },
    safeguards: {
      commandValueExposed: false,
      physicalPrinterCallsBlocked: true,
    },
  });
}

function createLocalPrintDriverV1ReadinessFallback() {
  return normalizePrintDriverV1Readiness({
    status: "blocked",
    ready: false,
    checkedAt: "",
    operatorId: "",
    scope: "v1_print_go_live_readiness",
    summary: {
      label: "0/0 通过",
      passedCount: 0,
      totalCount: 0,
      blockingCount: 0,
      tone: "warning",
    },
    requiredDocumentTypes: [],
    criteria: [],
    deviceReadiness: [],
    spoolDiagnostics: createLocalPrintDriverSpoolDiagnosticsFallback(),
    cupsDiagnostics: createLocalPrintDriverCupsDiagnosticsFallback(),
    remainingV1Risks: ["后端门禁未读取，不能证明打印链路已满足 V1 上线条件"],
    safeguards: {
      nonPrinting: true,
      physicalPrinterCalled: false,
      commandValueExposed: false,
      commandArgsExposed: false,
      spoolPathExposed: false,
      payloadExposed: false,
    },
  });
}

function createLocalPrintDriverSpoolDiagnosticsFallback() {
  return normalizePrintDriverSpoolDiagnostics({
    status: "not_available",
    ready: false,
    checkedAt: "",
    scope: "non_printing_command_bridge_spool_diagnostics",
    mode: "local_fallback",
    storageKind: "unknown",
    configured: false,
    writeOk: false,
    pendingPollOk: false,
    completedPollOk: false,
    cleanupOk: false,
    missingConfigFields: [],
    blockers: [
      {
        key: "spool-diagnostics-api-unavailable",
        label: "spool 状态回读",
        detail: "后端 spool 诊断未读取，不能证明命令桥状态回读可用",
      },
    ],
    safeguards: {
      nonPrinting: true,
      physicalPrinterCalled: false,
      commandValueExposed: false,
      commandArgsExposed: false,
      spoolPathExposed: false,
      payloadExposed: false,
    },
  });
}

function createLocalPrintDriverCupsDiagnosticsFallback() {
  return normalizePrintDriverCupsDiagnostics({
    adapterName: "local-print-driver-cups-diagnostics-fallback",
    status: "not_available",
    ready: false,
    checkedAt: "",
    scope: "non_printing_cups_queue_preflight",
    operatorId: "",
    reason: "local_fallback",
    cupsQueueStatusReadback: "cups_status_command",
    cupsPrinterConfigured: false,
    cupsPrinterAllowed: false,
    cupsStatusCommandConfigured: false,
    cupsStatusCommandRunnable: false,
    physicalPrinterCalled: false,
    commandValueExposed: false,
    commandArgsExposed: false,
    stdoutExposed: false,
    stderrExposed: false,
    configuration: {
      kind: "unknown",
      dryRunEnabled: false,
      systemPrinterEnabled: false,
      systemPrinterAdapterKind: "unknown",
      systemPrinterCommandConfigured: false,
      systemPrinterCommandArgsConfigured: false,
      systemPrinterCommandTimeoutMs: 0,
      allowedPrinterCount: 0,
      realDispatchAvailable: false,
    },
    blockers: [
      {
        key: "cups-diagnostics-api-unavailable",
        label: "CUPS 队列预检",
        detail: "后端 CUPS 预检未读取，不能证明本机队列可访问",
      },
    ],
    preflightResult: null,
    safeguards: {
      nonPrinting: true,
      commandValueExposed: false,
      commandArgsExposed: false,
      stdoutExposed: false,
      stderrExposed: false,
      payloadExposed: false,
      printFileCreated: false,
      physicalPrinterCalled: false,
    },
  });
}

function createReadinessChecklistItem({
  key,
  label,
  passed,
  detail,
  failureTone = "warning",
}) {
  return {
    key,
    label,
    passed: Boolean(passed),
    status: passed ? "通过" : failureTone === "danger" ? "需检查" : "待配置",
    tone: passed ? "success" : failureTone,
    detail,
  };
}

function normalizePrintDriverV1Readiness(value = {}) {
  const source = isPlainObject(value) ? value : {};
  const criteria = Array.isArray(source.criteria) ? source.criteria.map(normalizePrintDriverReadinessCriterion) : [];
  const deviceReadiness = Array.isArray(source.deviceReadiness)
    ? source.deviceReadiness.map(normalizePrintDeviceReadiness).filter(Boolean)
    : [];
  const rawSafeguards = isPlainObject(source.safeguards) ? source.safeguards : {};
  return {
    status: normalizeReadinessStatus(source.status),
    ready: Boolean(source.ready),
    checkedAt: cleanText(source.checkedAt),
    operatorId: cleanText(source.operatorId),
    scope: cleanText(source.scope) || "v1_print_go_live_readiness",
    summary: normalizePrintDriverReadinessSummary(source.summary, criteria),
    requiredDocumentTypes: normalizeStringList(source.requiredDocumentTypes),
    criteria,
    deviceReadiness,
    printDriverAdapter: source.printDriverAdapter ? normalizePrintDriverConfig(source.printDriverAdapter) : null,
    spoolDiagnostics: normalizePrintDriverSpoolDiagnostics(source.spoolDiagnostics),
    cupsDiagnostics: normalizePrintDriverCupsDiagnostics(source.cupsDiagnostics),
    remainingV1Risks: normalizeStringList(source.remainingV1Risks),
    safeguards: {
      nonPrinting: rawSafeguards.nonPrinting === undefined ? true : Boolean(rawSafeguards.nonPrinting),
      physicalPrinterCalled: Boolean(rawSafeguards.physicalPrinterCalled),
      commandValueExposed: Boolean(rawSafeguards.commandValueExposed),
      commandArgsExposed: Boolean(rawSafeguards.commandArgsExposed),
      spoolPathExposed: Boolean(rawSafeguards.spoolPathExposed),
      payloadExposed: Boolean(rawSafeguards.payloadExposed),
    },
  };
}

function normalizeReadinessStatus(value) {
  const status = cleanText(value);
  if (["ready", "blocked"].includes(status)) return status;
  return "blocked";
}

function normalizePrintDriverReadinessSummary(value = {}, criteria = []) {
  const source = isPlainObject(value) ? value : {};
  const passedCount = normalizeCount(source.passedCount, criteria.filter((item) => item.status === "passed").length);
  const totalCount = normalizeCount(source.totalCount, criteria.length);
  const blockingCount = normalizeCount(
    source.blockingCount,
    criteria.filter((item) => item.blocking && item.status !== "passed").length,
  );
  return {
    label: cleanText(source.label) || `${passedCount}/${totalCount} 通过`,
    passedCount,
    totalCount,
    blockingCount,
    tone: normalizeTone(source.tone || (blockingCount ? "danger" : "success")),
  };
}

function normalizePrintDriverReadinessCriterion(value = {}) {
  const source = isPlainObject(value) ? value : {};
  const status = normalizeCriterionStatus(source.status);
  return {
    key: cleanText(source.key) || "unknown-readiness-criterion",
    label: cleanText(source.label) || "门禁项",
    status,
    statusLabel: status === "passed" ? "通过" : "阻塞",
    tone: normalizeTone(source.tone || (status === "passed" ? "success" : "warning")),
    blocking: Boolean(source.blocking),
    detail: cleanText(source.detail),
    evidence: isPlainObject(source.evidence) ? source.evidence : {},
  };
}

function normalizeCriterionStatus(value) {
  const status = cleanText(value);
  if (["passed", "pending"].includes(status)) return status;
  return "pending";
}

function normalizePrintDeviceReadiness(value = {}) {
  const source = isPlainObject(value) ? value : {};
  const key = cleanText(source.key);
  const label = cleanText(source.label);
  if (!key && !label) return null;
  return {
    key: key || label,
    label: label || key,
    ready: Boolean(source.ready),
    documentTypes: normalizeStringList(source.documentTypes),
    requiredChecks: normalizeStringList(source.requiredChecks),
    printDevice: normalizePrintDeviceSummary(source.printDevice),
    latestFieldTestRecord: isPlainObject(source.latestFieldTestRecord) ? source.latestFieldTestRecord : null,
    latestFieldTestSummary: isPlainObject(source.latestFieldTestSummary) ? source.latestFieldTestSummary : null,
    criteria: Array.isArray(source.criteria) ? source.criteria.map(normalizePrintDriverReadinessCriterion) : [],
  };
}

function normalizePrintDeviceSummary(value = {}) {
  if (!isPlainObject(value)) return null;
  const printDeviceId = cleanText(value.printDeviceId ?? value.id);
  if (!printDeviceId) return null;
  return {
    printDeviceId,
    name: cleanText(value.name) || printDeviceId,
    deviceType: cleanText(value.deviceType),
    status: cleanText(value.status),
    connectionType: cleanText(value.connectionType),
    driverName: cleanText(value.driverName),
    supportedDocumentTypes: normalizeStringList(value.supportedDocumentTypes),
    defaultDocumentTypes: normalizeStringList(value.defaultDocumentTypes),
    paperWidthMm: normalizeCount(value.paperWidthMm, 0),
    paperHeightMm: normalizeCount(value.paperHeightMm, 0),
    paperName: cleanText(value.paperName),
    isContinuous: Boolean(value.isContinuous),
    driverMode: cleanText(value.driverMode) || "preview_only",
  };
}

function normalizePrintDriverSpoolDiagnostics(value = {}) {
  const source = isPlainObject(value) ? value : {};
  const rawSafeguards = isPlainObject(source.safeguards) ? source.safeguards : {};
  return {
    status: cleanText(source.status) || "blocked",
    ready: Boolean(source.ready),
    checkedAt: cleanText(source.checkedAt),
    scope: cleanText(source.scope),
    mode: cleanText(source.mode),
    storageKind: cleanText(source.storageKind),
    configured: Boolean(source.configured),
    writeOk: Boolean(source.writeOk),
    pendingPollOk: Boolean(source.pendingPollOk),
    completedPollOk: Boolean(source.completedPollOk),
    cleanupOk: Boolean(source.cleanupOk),
    missingConfigFields: normalizeStringList(source.missingConfigFields),
    blockers: Array.isArray(source.blockers) ? source.blockers.map(normalizeSpoolDiagnosticsBlocker) : [],
    safeguards: {
      nonPrinting: rawSafeguards.nonPrinting === undefined ? true : Boolean(rawSafeguards.nonPrinting),
      physicalPrinterCalled: Boolean(rawSafeguards.physicalPrinterCalled),
      commandValueExposed: Boolean(rawSafeguards.commandValueExposed),
      commandArgsExposed: Boolean(rawSafeguards.commandArgsExposed),
      spoolPathExposed: Boolean(rawSafeguards.spoolPathExposed),
      payloadExposed: Boolean(rawSafeguards.payloadExposed),
    },
  };
}

function normalizePrintDriverCupsDiagnostics(value = {}) {
  const source = isPlainObject(value) ? value : {};
  const rawSafeguards = isPlainObject(source.safeguards) ? source.safeguards : {};
  return {
    adapterName: cleanText(source.adapterName) || "unknown-print-driver-adapter",
    status: cleanText(source.status) || "not_configured",
    ready: Boolean(source.ready),
    checkedAt: cleanText(source.checkedAt),
    scope: cleanText(source.scope) || "non_printing_cups_queue_preflight",
    operatorId: cleanText(source.operatorId),
    reason: cleanText(source.reason),
    cupsQueueStatusReadback: cleanText(source.cupsQueueStatusReadback) || "cups_status_command",
    cupsPrinterConfigured: Boolean(source.cupsPrinterConfigured),
    cupsPrinterAllowed: Boolean(source.cupsPrinterAllowed),
    cupsStatusCommandConfigured: Boolean(source.cupsStatusCommandConfigured),
    cupsStatusCommandRunnable: Boolean(source.cupsStatusCommandRunnable),
    physicalPrinterCalled: Boolean(source.physicalPrinterCalled),
    commandValueExposed: Boolean(source.commandValueExposed),
    commandArgsExposed: Boolean(source.commandArgsExposed),
    stdoutExposed: Boolean(source.stdoutExposed),
    stderrExposed: Boolean(source.stderrExposed),
    configuration: normalizePrintDriverCupsDiagnosticsConfiguration(source.configuration),
    blockers: Array.isArray(source.blockers) ? source.blockers.map(normalizeSpoolDiagnosticsBlocker) : [],
    preflightResult: normalizePrintDriverCupsDiagnosticsPreflightResult(source.preflightResult),
    safeguards: {
      nonPrinting: rawSafeguards.nonPrinting === undefined ? true : Boolean(rawSafeguards.nonPrinting),
      commandValueExposed: Boolean(rawSafeguards.commandValueExposed),
      commandArgsExposed: Boolean(rawSafeguards.commandArgsExposed),
      stdoutExposed: Boolean(rawSafeguards.stdoutExposed),
      stderrExposed: Boolean(rawSafeguards.stderrExposed),
      payloadExposed: Boolean(rawSafeguards.payloadExposed),
      printFileCreated: Boolean(rawSafeguards.printFileCreated),
      physicalPrinterCalled: Boolean(rawSafeguards.physicalPrinterCalled),
    },
  };
}

function normalizePrintDriverCupsDiagnosticsConfiguration(value = {}) {
  const source = isPlainObject(value) ? value : {};
  return {
    kind: cleanText(source.kind) || "unknown",
    dryRunEnabled: Boolean(source.dryRunEnabled),
    systemPrinterEnabled: Boolean(source.systemPrinterEnabled),
    systemPrinterAdapterKind: cleanText(source.systemPrinterAdapterKind) || "unknown",
    systemPrinterCommandConfigured: Boolean(source.systemPrinterCommandConfigured),
    systemPrinterCommandArgsConfigured: Boolean(source.systemPrinterCommandArgsConfigured),
    systemPrinterCommandTimeoutMs: normalizeCount(source.systemPrinterCommandTimeoutMs, 0),
    allowedPrinterCount: normalizeCount(source.allowedPrinterCount, 0),
    realDispatchAvailable: Boolean(source.realDispatchAvailable),
  };
}

function normalizePrintDriverCupsDiagnosticsPreflightResult(value = null) {
  if (!isPlainObject(value)) return null;
  return {
    status: cleanText(value.status),
    ready: Boolean(value.ready),
    action: cleanText(value.action),
    mode: cleanText(value.mode),
    scope: cleanText(value.scope),
    cupsAllowlistConfigured: Boolean(value.cupsAllowlistConfigured),
    cupsPrinterConfigured: Boolean(value.cupsPrinterConfigured),
    cupsPrinterAllowed: Boolean(value.cupsPrinterAllowed),
    cupsStatusCommandConfigured: Boolean(value.cupsStatusCommandConfigured),
    cupsStatusCommandRunnable: Boolean(value.cupsStatusCommandRunnable),
    exitCode: value.exitCode === null || value.exitCode === undefined ? null : normalizeCount(value.exitCode, 0),
    signal: cleanText(value.signal),
    stdoutBytes: normalizeCount(value.stdoutBytes, 0),
    stderrBytes: normalizeCount(value.stderrBytes, 0),
    errorCode: cleanText(value.errorCode),
    message: cleanText(value.message),
  };
}

function normalizeSpoolDiagnosticsBlocker(value = {}) {
  const source = isPlainObject(value) ? value : {};
  return {
    key: cleanText(source.key) || "spool-blocker",
    label: cleanText(source.label) || "spool 阻塞项",
    detail: cleanText(source.detail),
  };
}

function normalizePrintDriverEnvironmentPreflight(value = {}) {
  const source = isPlainObject(value) ? value : {};
  const rawSummary = isPlainObject(source.summary) ? source.summary : {};
  const rawSafeguards = isPlainObject(source.safeguards) ? source.safeguards : {};
  const items = Array.isArray(source.items) ? source.items.map(normalizePrintDriverEnvironmentPreflightItem) : [];
  const passedCount = normalizeCount(rawSummary.passedCount, items.filter((item) => item.status === "passed").length);
  const totalCount = normalizeCount(rawSummary.totalCount, items.length);
  const blockingCount = normalizeCount(
    rawSummary.blockingCount,
    items.filter((item) => item.blocking && item.status !== "passed").length,
  );
  return {
    checkedAt: cleanText(source.checkedAt),
    scope: cleanText(source.scope) || "non_printing_environment_preflight",
    summary: {
      label: cleanText(rawSummary.label) || `${passedCount}/${totalCount} 通过`,
      passedCount,
      totalCount,
      blockingCount,
      tone: normalizeTone(rawSummary.tone),
    },
    items,
    safeguards: {
      nonPrinting: rawSafeguards.nonPrinting === undefined ? true : Boolean(rawSafeguards.nonPrinting),
      commandValueExposed: Boolean(rawSafeguards.commandValueExposed),
      commandArgsExposed: Boolean(rawSafeguards.commandArgsExposed),
      spoolPathExposed: Boolean(rawSafeguards.spoolPathExposed),
    },
  };
}

function normalizePrintDriverEnvironmentPreflightItem(value = {}) {
  const source = isPlainObject(value) ? value : {};
  const status = normalizePreflightStatus(source.status);
  return {
    key: cleanText(source.key) || "unknown-preflight-item",
    label: cleanText(source.label) || "预检项",
    status,
    statusLabel: getPreflightStatusLabel(status),
    tone: normalizeTone(source.tone),
    detail: cleanText(source.detail),
    blocking: Boolean(source.blocking),
  };
}

function normalizePreflightStatus(value) {
  const status = cleanText(value);
  if (["passed", "pending", "attention"].includes(status)) return status;
  return "pending";
}

function getPreflightStatusLabel(status) {
  if (status === "passed") return "通过";
  if (status === "attention") return "需检查";
  return "待配置";
}

function normalizeTone(value) {
  const tone = cleanText(value);
  if (["success", "warning", "danger", "neutral", "blue"].includes(tone)) return tone;
  return "warning";
}

function normalizeCount(value, fallback = 0) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return fallback;
  return Math.trunc(parsed);
}

function normalizeStringList(value) {
  const raw = Array.isArray(value) ? value : String(value ?? "").split(",");
  return raw.map((item) => cleanText(item)).filter(Boolean);
}

function cleanText(value) {
  return String(value ?? "").trim();
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
