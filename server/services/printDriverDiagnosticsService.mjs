import { buildPrintDriverV1Readiness } from "./printDriverV1ReadinessService.mjs";

export function createPrintDriverDiagnosticsService({
  buildReadiness = buildPrintDriverV1Readiness,
  now = () => new Date(),
} = {}) {
  requireFunction(buildReadiness, "buildReadiness");
  requireFunction(now, "now");

  return {
    getConfiguration,
    getCupsDiagnostics,
    getSpoolDiagnostics,
    getV1Readiness,
  };

  function getConfiguration({ workspace = {} } = {}) {
    const adapter = workspace.printDriverAdapter ?? {};
    const configuration =
      typeof adapter.getConfiguration === "function"
        ? adapter.getConfiguration()
        : buildUnavailableConfiguration(adapter, checkedAt());
    return { printDriverAdapter: configuration };
  }

  function getSpoolDiagnostics({ workspace = {}, operatorId = "" } = {}) {
    const adapter = workspace.printDriverAdapter ?? {};
    if (typeof adapter.runSpoolDiagnostics !== "function") {
      return buildUnavailableSpoolDiagnostics({ adapter, operatorId, checkedAt: checkedAt() });
    }
    return adapter.runSpoolDiagnostics({
      operatorId,
      reason: "api_print_driver_spool_diagnostics",
    });
  }

  function getCupsDiagnostics({ workspace = {}, operatorId = "" } = {}) {
    const adapter = workspace.printDriverAdapter ?? {};
    if (typeof adapter.runCupsDiagnostics !== "function") {
      return buildUnavailableCupsDiagnostics({ adapter, operatorId, checkedAt: checkedAt() });
    }
    return adapter.runCupsDiagnostics({
      operatorId,
      reason: "api_print_driver_cups_diagnostics",
    });
  }

  function getV1Readiness({ workspace = {}, operatorId = "" } = {}) {
    return buildReadiness({
      workspace,
      operatorId,
      getConfiguration: (targetWorkspace) => getConfiguration({ workspace: targetWorkspace }),
      getSpoolDiagnostics,
      getCupsDiagnostics,
      now,
    });
  }

  function checkedAt() {
    const value = now();
    if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
      throw new TypeError("print driver diagnostics now() must return a valid Date");
    }
    return value.toISOString();
  }
}

function buildUnavailableConfiguration(adapter, checkedAt) {
  return {
    adapterName: "unknown-print-driver-adapter",
    kind: text(adapter.kind) || "unknown",
    configurationAvailable: false,
    dryRunEnabled: false,
    systemPrinterEnabled: false,
    systemPrinterAdapterKind: "unknown",
    systemPrinterCommandConfigured: false,
    systemPrinterCommandArgsConfigured: false,
    systemPrinterCommandTimeoutMs: 0,
    allowedPrinterNames: [],
    realDispatchAvailable: false,
    environmentPreflight: {
      checkedAt,
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
  };
}

function buildUnavailableSpoolDiagnostics({ adapter, operatorId, checkedAt }) {
  return {
    status: "not_available",
    ready: false,
    checkedAt,
    scope: "non_printing_command_bridge_spool_diagnostics",
    operatorId,
    diagnosticPrintJobId: "",
    diagnosticExternalJobId: "",
    statusReadback: "spool_file",
    writeOk: false,
    pendingPollOk: false,
    completedPollOk: false,
    cleanupOk: false,
    secretFieldsExposed: false,
    spoolPathExposed: false,
    physicalPrinterCalled: false,
    configuration: buildUnavailableDiagnosticConfiguration(adapter, { commandBridgeStatusReadbackAvailable: false }),
    blockers: [
      {
        key: "spool-diagnostics-adapter-method",
        label: "spool 诊断适配器",
        status: "failed",
        tone: "danger",
        blocking: true,
        detail: "当前打印适配器未提供 spool 诊断方法",
      },
    ],
    pollResults: { pending: null, completed: null },
    safeguards: {
      nonPrinting: true,
      commandValueExposed: false,
      commandArgsExposed: false,
      spoolPathExposed: false,
      payloadExposed: false,
      physicalPrinterCalled: false,
    },
  };
}

function buildUnavailableCupsDiagnostics({ adapter, operatorId, checkedAt }) {
  return {
    adapterName: "unknown-print-driver-adapter",
    status: "not_available",
    ready: false,
    checkedAt,
    scope: "non_printing_cups_queue_preflight",
    operatorId,
    reason: "api_print_driver_cups_diagnostics",
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
    configuration: buildUnavailableDiagnosticConfiguration(adapter),
    blockers: [
      {
        key: "cups-diagnostics-adapter-method",
        label: "CUPS 队列预检适配器",
        status: "failed",
        tone: "danger",
        blocking: true,
        detail: "当前打印适配器未提供 CUPS 队列预检方法",
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
  };
}

function buildUnavailableDiagnosticConfiguration(adapter, extra = {}) {
  return {
    kind: text(adapter.kind) || "unknown",
    dryRunEnabled: false,
    systemPrinterEnabled: false,
    systemPrinterAdapterKind: "unknown",
    systemPrinterCommandConfigured: false,
    systemPrinterCommandArgsConfigured: false,
    systemPrinterCommandTimeoutMs: 0,
    allowedPrinterCount: 0,
    realDispatchAvailable: false,
    ...extra,
  };
}

function requireFunction(value, name) {
  if (typeof value !== "function") throw new TypeError(`${name} must be a function`);
}

function text(value) {
  return String(value ?? "").trim();
}
