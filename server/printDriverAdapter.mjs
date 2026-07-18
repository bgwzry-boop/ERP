import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import {
  buildCupsDiagnosticRuntimeBlockers,
  buildDiagnosticSpoolRecord,
  buildSpoolDiagnosticRuntimeBlockers,
  parseCupsPreflightStdout,
  sanitizeCommandBridgeMessage,
  summarizePollResultForDiagnostics,
} from "./printDriverDiagnosticProjection.mjs";
import {
  buildCommandBridgeStatusMetadata,
  normalizeCommandBridgeDriverStatus,
  normalizeCommandBridgeSpoolStatus,
  resolveCommandBridgePollResult,
} from "./printDriverCommandBridgeStatusProjection.mjs";
import {
  buildCommandBridgeDispatchMetadata,
  buildCommandBridgePayload,
  byteLength,
  defaultCommandArgTemplate,
  extractCommandExternalJobId,
  normalizeCommandArgs,
  normalizeCommandRunnerResult,
  normalizeOptionalInteger,
  renderCommandArgs,
} from "./printDriverCommandBridgeDispatchProjection.mjs";
import {
  inspectCommandAvailability,
  inspectSpoolDirectory,
  runSystemPrinterCommand,
} from "./printDriverSystemCommandRuntime.mjs";

export function createPrintDriverAdapter(options = {}) {
  const dryRunEnabled =
    options.dryRunEnabled ?? ["1", "true", "yes"].includes(String(process.env.ERP_PRINT_DRIVER_DRY_RUN ?? "").toLowerCase());
  const systemPrinterEnabled =
    options.systemPrinterEnabled ??
    ["1", "true", "yes"].includes(String(process.env.ERP_SYSTEM_PRINTER_ENABLED ?? "").toLowerCase());
  const systemPrinterAdapterKind = normalizeSystemPrinterAdapterKind(
    options.systemPrinterAdapterKind ?? process.env.ERP_SYSTEM_PRINTER_ADAPTER,
  );
  const systemPrinterCommand = String(options.systemPrinterCommand ?? process.env.ERP_SYSTEM_PRINTER_COMMAND ?? "").trim();
  const systemPrinterCommandArgs = normalizeCommandArgs(
    options.systemPrinterCommandArgs ?? process.env.ERP_SYSTEM_PRINTER_COMMAND_ARGS_JSON,
  );
  const systemPrinterCommandTimeoutMs = normalizePositiveInteger(
    options.systemPrinterCommandTimeoutMs ?? process.env.ERP_SYSTEM_PRINTER_COMMAND_TIMEOUT_MS,
    5000,
    60000,
  );
  const commandBridgeSpoolDir = normalizeCommandBridgeSpoolDir({
    spoolDir: options.commandBridgeSpoolDir ?? process.env.ERP_PRINT_COMMAND_BRIDGE_SPOOL_DIR,
    localStorageDir: options.localStorageDir ?? process.env.ERP_LOCAL_STORAGE_DIR,
  });
  const allowedPrinterNames = normalizeStringList(
    options.allowedPrinterNames ?? process.env.ERP_SYSTEM_PRINTER_ALLOWLIST,
  );
  const commandRunner = options.commandRunner ?? runSystemPrinterCommand;
  const configuration = buildConfiguration({
    dryRunEnabled,
    systemPrinterEnabled,
    systemPrinterAdapterKind,
    systemPrinterCommand,
    systemPrinterCommandArgs,
    systemPrinterCommandTimeoutMs,
    commandBridgeSpoolDir,
    allowedPrinterNames,
  });

  return {
    kind: dryRunEnabled ? "dry_run_adapter" : "guarded_adapter",

    getConfiguration() {
      return {
        ...configuration,
        allowedPrinterNames: [...configuration.allowedPrinterNames],
        environmentPreflight: buildSystemPrinterEnvironmentPreflight(configuration, {
          systemPrinterCommand,
          commandBridgeSpoolDir,
        }),
      };
    },

    dispatchPrintJob({ printJob, operatorId = "U-OFFICE-A", reason = "" }) {
      return dispatchPrintJob({
        printJob,
        operatorId,
        reason,
        dryRunEnabled,
        systemPrinterEnabled,
        systemPrinterAdapterKind,
        systemPrinterCommand,
        systemPrinterCommandArgs,
        systemPrinterCommandTimeoutMs,
        allowedPrinterNames,
        commandRunner,
      });
    },

    pollPrintJobStatus({ printJob, operatorId = "U-PRINT-DRIVER-A", reason = "" }) {
      return pollPrintJobStatus({
        printJob,
        operatorId,
        reason,
        dryRunEnabled,
        systemPrinterEnabled,
        systemPrinterAdapterKind,
        systemPrinterCommand,
        systemPrinterCommandArgs,
        systemPrinterCommandTimeoutMs,
        commandBridgeSpoolDir,
        allowedPrinterNames,
      });
    },

    runSpoolDiagnostics({ operatorId = "U-OFFICE-A", reason = "" } = {}) {
      return runCommandBridgeSpoolDiagnostics({
        operatorId,
        reason,
        dryRunEnabled,
        systemPrinterEnabled,
        systemPrinterAdapterKind,
        systemPrinterCommand,
        systemPrinterCommandArgs,
        systemPrinterCommandTimeoutMs,
        commandBridgeSpoolDir,
        allowedPrinterNames,
      });
    },

    runCupsDiagnostics({ operatorId = "U-OFFICE-A", reason = "" } = {}) {
      return runCommandBridgeCupsDiagnostics({
        operatorId,
        reason,
        dryRunEnabled,
        systemPrinterEnabled,
        systemPrinterAdapterKind,
        systemPrinterCommand,
        systemPrinterCommandArgs,
        systemPrinterCommandTimeoutMs,
        commandBridgeSpoolDir,
        allowedPrinterNames,
        commandRunner,
      });
    },
  };
}

export function dispatchPrintJob({
  printJob,
  operatorId = "U-OFFICE-A",
  reason = "",
  dryRunEnabled = false,
  systemPrinterEnabled = false,
  systemPrinterAdapterKind = "none",
  systemPrinterCommand = "",
  systemPrinterCommandArgs = defaultCommandArgTemplate,
  systemPrinterCommandTimeoutMs = 5000,
  allowedPrinterNames = [],
  commandRunner = runSystemPrinterCommand,
}) {
  const normalized = normalizePrintJob(printJob);
  const now = new Date().toISOString();
  if (!normalized.printJobId) {
    return buildDispatchResult({
      now,
      operatorId,
      reason,
      adapterStatus: "failed",
      jobStatus: "failed",
      errorCode: "PRINT_JOB_INVALID",
      message: "Print job is missing printJobId.",
    });
  }
  if (!normalized.printDeviceId) {
    return buildDispatchResult({
      now,
      operatorId,
      reason,
      adapterStatus: "failed",
      jobStatus: "failed",
      errorCode: "PRINT_DEVICE_MISSING",
      message: "Print job has no print device snapshot.",
    });
  }
  if (normalized.driverMode === "preview_only") {
    return buildDispatchResult({
      now,
      operatorId,
      reason,
      adapterStatus: "skipped",
      jobStatus: "preview_only",
      message: "Device is configured as preview_only; no operating system print call was made.",
    });
  }
  if (normalized.driverMode === "adapter_pending") {
    return buildDispatchResult({
      now,
      operatorId,
      reason,
      adapterStatus: "queued",
      jobStatus: "queued",
      message: "Print job remains queued because the concrete driver adapter is not selected yet.",
    });
  }
  if (["browser_download", "manual"].includes(normalized.driverMode)) {
    return buildDispatchResult({
      now,
      operatorId,
      reason,
      adapterStatus: "queued",
      jobStatus: "queued",
      message: "Print job requires browser/manual handling; no system printer call was made.",
    });
  }
  if (normalized.driverMode === "system_printer") {
    if (dryRunEnabled) {
      return buildDispatchResult({
        now,
        operatorId,
        reason,
        adapterStatus: "dry_run_sent",
        jobStatus: "sent",
        externalJobId: `DRY-${normalized.printJobId}`,
        message: "Dry-run system printer adapter accepted the job without touching a physical printer.",
      });
    }
    if (!systemPrinterEnabled) {
      return buildDispatchResult({
        now,
        operatorId,
        reason,
        adapterStatus: "failed",
        jobStatus: "failed",
        errorCode: "SYSTEM_PRINTER_ADAPTER_NOT_CONFIGURED",
        message: "System printer dispatch is disabled; set ERP_SYSTEM_PRINTER_ENABLED=true only after a real driver adapter is installed.",
      });
    }
    const guardError = getSystemPrinterBridgeGuardError(normalized, {
      action: "dispatch",
      systemPrinterAdapterKind: normalizeSystemPrinterAdapterKind(systemPrinterAdapterKind),
      systemPrinterCommand,
      allowedPrinterNames,
    });
    if (!guardError && normalizeSystemPrinterAdapterKind(systemPrinterAdapterKind) === "command_bridge") {
      return dispatchCommandBridgePrintJob({
        printJob,
        normalized,
        now,
        operatorId,
        reason,
        systemPrinterCommand,
        systemPrinterCommandArgs,
        systemPrinterCommandTimeoutMs,
        commandRunner,
      });
    }
    return buildDispatchResult({
      now,
      operatorId,
      reason,
      adapterStatus: "failed",
      jobStatus: "failed",
      errorCode: guardError.errorCode,
      message: guardError.message,
    });
  }
  return buildDispatchResult({
    now,
    operatorId,
    reason,
    adapterStatus: "failed",
    jobStatus: "failed",
    errorCode: "PRINT_DRIVER_MODE_UNSUPPORTED",
    message: `Unsupported print driver mode: ${normalized.driverMode}`,
  });
}

export function pollPrintJobStatus({
  printJob,
  operatorId = "U-PRINT-DRIVER-A",
  reason = "",
  dryRunEnabled = false,
  systemPrinterEnabled = false,
  systemPrinterAdapterKind = "none",
  systemPrinterCommand = "",
  systemPrinterCommandArgs: _systemPrinterCommandArgs = defaultCommandArgTemplate,
  systemPrinterCommandTimeoutMs: _systemPrinterCommandTimeoutMs = 5000,
  commandBridgeSpoolDir = normalizeCommandBridgeSpoolDir(),
  allowedPrinterNames = [],
}) {
  const normalized = normalizePrintJob(printJob);
  const now = new Date().toISOString();
  if (!normalized.printJobId) {
    return buildPollResult({
      now,
      operatorId,
      reason,
      adapterStatus: "failed",
      errorCode: "PRINT_JOB_INVALID",
      message: "Print job is missing printJobId.",
    });
  }
  if (["preview_only", "browser_download", "manual", "adapter_pending"].includes(normalized.driverMode)) {
    return buildPollResult({
      now,
      operatorId,
      reason,
      adapterStatus: "no_poll_needed",
      externalJobId: normalized.externalJobId,
      message: `Driver mode ${normalized.driverMode} does not expose a system-printer status queue.`,
    });
  }
  if (["printed", "failed", "canceled"].includes(normalized.jobStatus)) {
    return buildPollResult({
      now,
      operatorId,
      reason,
      adapterStatus: "terminal_no_poll",
      externalJobId: normalized.externalJobId,
      message: `Print job is already terminal: ${normalized.jobStatus}.`,
    });
  }
  if (normalized.driverMode === "system_printer") {
    if (dryRunEnabled && normalized.externalJobId?.startsWith("DRY-")) {
      return buildPollResult({
        now,
        operatorId,
        reason,
        adapterStatus: "dry_run_completed",
        status: "printed",
        driverStatus: "completed",
        externalJobId: normalized.externalJobId,
        message: "Dry-run system printer status poll reports the job as completed.",
      });
    }
    if (!systemPrinterEnabled) {
      return buildPollResult({
        now,
        operatorId,
        reason,
        adapterStatus: "poll_unavailable",
        externalJobId: normalized.externalJobId,
        message:
          "System printer status polling is disabled; set ERP_SYSTEM_PRINTER_ENABLED=true only after a real poll adapter is installed.",
      });
    }
    const guardError = getSystemPrinterBridgeGuardError(normalized, {
      action: "poll",
      systemPrinterAdapterKind: normalizeSystemPrinterAdapterKind(systemPrinterAdapterKind),
      systemPrinterCommand,
      allowedPrinterNames,
    });
    if (!guardError && normalizeSystemPrinterAdapterKind(systemPrinterAdapterKind) === "command_bridge") {
      return pollCommandBridgePrintJobStatus({
        normalized,
        now,
        operatorId,
        reason,
        commandBridgeSpoolDir,
      });
    }
    return buildPollResult({
      now,
      operatorId,
      reason,
      adapterStatus: "failed",
      errorCode: guardError.errorCode,
      externalJobId: normalized.externalJobId,
      message: guardError.message,
    });
  }
  return buildPollResult({
    now,
    operatorId,
    reason,
    adapterStatus: "poll_unavailable",
    externalJobId: normalized.externalJobId,
    message: `Unsupported print driver mode for polling: ${normalized.driverMode}`,
  });
}

export function runCommandBridgeSpoolDiagnostics({
  operatorId = "U-OFFICE-A",
  reason = "",
  dryRunEnabled = false,
  systemPrinterEnabled = false,
  systemPrinterAdapterKind = "none",
  systemPrinterCommand = "",
  systemPrinterCommandArgs = defaultCommandArgTemplate,
  systemPrinterCommandTimeoutMs = 5000,
  commandBridgeSpoolDir = normalizeCommandBridgeSpoolDir(),
  allowedPrinterNames = [],
} = {}) {
  const checkedAt = new Date().toISOString();
  const normalizedAdapterKind = normalizeSystemPrinterAdapterKind(systemPrinterAdapterKind);
  const normalizedAllowedPrinters = normalizeStringList(allowedPrinterNames);
  const configuration = buildConfiguration({
    dryRunEnabled,
    systemPrinterEnabled,
    systemPrinterAdapterKind: normalizedAdapterKind,
    systemPrinterCommand,
    systemPrinterCommandArgs: normalizeCommandArgs(systemPrinterCommandArgs),
    systemPrinterCommandTimeoutMs,
    commandBridgeSpoolDir,
    allowedPrinterNames: normalizedAllowedPrinters,
  });
  const environmentPreflight = buildSystemPrinterEnvironmentPreflight(configuration, {
    systemPrinterCommand,
    commandBridgeSpoolDir,
  });
  const blockers = environmentPreflight.items
    .filter((item) => item.status !== "passed")
    .map((item) => ({
      key: item.key,
      label: item.label,
      status: item.status,
      tone: item.tone,
      blocking: item.blocking,
      detail: item.detail,
    }));
  const base = {
    adapterName: "p0-print-driver-adapter",
    status: "not_configured",
    ready: false,
    checkedAt,
    scope: "non_printing_command_bridge_spool_diagnostics",
    operatorId,
    reason: String(reason ?? "").trim(),
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
    configuration: {
      kind: configuration.kind,
      dryRunEnabled: configuration.dryRunEnabled,
      systemPrinterEnabled: configuration.systemPrinterEnabled,
      systemPrinterAdapterKind: configuration.systemPrinterAdapterKind,
      systemPrinterCommandConfigured: configuration.systemPrinterCommandConfigured,
      systemPrinterCommandArgsConfigured: configuration.systemPrinterCommandArgsConfigured,
      systemPrinterCommandTimeoutMs: configuration.systemPrinterCommandTimeoutMs,
      commandBridgeStatusReadbackAvailable: configuration.commandBridgeStatusReadbackAvailable,
      allowedPrinterCount: configuration.allowedPrinterNames.length,
      realDispatchAvailable: configuration.realDispatchAvailable,
    },
    blockers,
    pollResults: {
      pending: null,
      completed: null,
    },
    safeguards: {
      nonPrinting: true,
      commandValueExposed: false,
      commandArgsExposed: false,
      spoolPathExposed: false,
      payloadExposed: false,
      physicalPrinterCalled: false,
    },
  };

  if (
    !configuration.commandBridgeStatusReadbackAvailable ||
    environmentPreflight.items.some((item) => item.key === "spool-directory" && item.status !== "passed") ||
    environmentPreflight.items.some((item) => item.blocking && item.status !== "passed")
  ) {
    return base;
  }

  const diagnosticPrintJobId = `PJ-SPOOL-DIAG-${Date.now()}-${Math.floor(Math.random() * 100000)}`;
  const diagnosticExternalJobId = `PCB-SPOOL-DIAG-${safeFileSegment(diagnosticPrintJobId)}`;
  const primaryPrinterName = normalizedAllowedPrinters[0] || "ERP-SPOOL-DIAGNOSTIC";
  const diagnosticPrintJob = {
    printJobId: diagnosticPrintJobId,
    printDeviceId: primaryPrinterName,
    driverMode: "system_printer",
    jobStatus: "sent",
    printDeviceSnapshot: {
      name: primaryPrinterName,
      driverName: "command_bridge_spool_diagnostics",
      connectionUri: "spool://diagnostic",
      settings: {
        driverMode: "system_printer",
      },
    },
    metadata: {
      externalJobId: diagnosticExternalJobId,
    },
  };
  const queuedPath = join(commandBridgeSpoolDir, "queued", `${safeFileSegment(diagnosticExternalJobId)}.json`);
  const completedPath = join(commandBridgeSpoolDir, "completed", `${safeFileSegment(diagnosticExternalJobId)}.json`);

  try {
    mkdirSync(join(commandBridgeSpoolDir, "queued"), { recursive: true });
    mkdirSync(join(commandBridgeSpoolDir, "completed"), { recursive: true });
    writeFileSync(
      queuedPath,
      `${JSON.stringify(
        buildDiagnosticSpoolRecord({
          diagnosticExternalJobId,
          diagnosticPrintJob,
          status: "queued",
          now: checkedAt,
        }),
        null,
        2,
      )}\n`,
      "utf8",
    );
    const writeOk = existsSync(queuedPath);
    const pendingPoll = pollPrintJobStatus({
      printJob: diagnosticPrintJob,
      operatorId,
      reason: "print command bridge spool diagnostics pending readback",
      dryRunEnabled,
      systemPrinterEnabled,
      systemPrinterAdapterKind: normalizedAdapterKind,
      systemPrinterCommand,
      systemPrinterCommandArgs,
      systemPrinterCommandTimeoutMs,
      commandBridgeSpoolDir,
      allowedPrinterNames: normalizedAllowedPrinters,
    });
    writeFileSync(
      completedPath,
      `${JSON.stringify(
        buildDiagnosticSpoolRecord({
          diagnosticExternalJobId,
          diagnosticPrintJob,
          status: "completed",
          now: new Date().toISOString(),
        }),
        null,
        2,
      )}\n`,
      "utf8",
    );
    const completedPoll = pollPrintJobStatus({
      printJob: diagnosticPrintJob,
      operatorId,
      reason: "print command bridge spool diagnostics completed readback",
      dryRunEnabled,
      systemPrinterEnabled,
      systemPrinterAdapterKind: normalizedAdapterKind,
      systemPrinterCommand,
      systemPrinterCommandArgs,
      systemPrinterCommandTimeoutMs,
      commandBridgeSpoolDir,
      allowedPrinterNames: normalizedAllowedPrinters,
    });
    rmSync(queuedPath, { force: true });
    rmSync(completedPath, { force: true });
    const cleanupOk = !existsSync(queuedPath) && !existsSync(completedPath);
    const pendingPollOk = pendingPoll.adapterStatus === "command_bridge_pending" && pendingPoll.status === "sent";
    const completedPollOk = completedPoll.adapterStatus === "command_bridge_completed" && completedPoll.status === "printed";
    const ready = writeOk && pendingPollOk && completedPollOk && cleanupOk;
    return {
      ...base,
      status: ready ? "ok" : "failed",
      ready,
      diagnosticPrintJobId,
      diagnosticExternalJobId,
      writeOk,
      pendingPollOk,
      completedPollOk,
      cleanupOk,
      blockers: ready
        ? []
        : [
            ...blockers,
            ...buildSpoolDiagnosticRuntimeBlockers({
              writeOk,
              pendingPollOk,
              completedPollOk,
              cleanupOk,
              pendingPoll,
              completedPoll,
            }),
          ],
      pollResults: {
        pending: summarizePollResultForDiagnostics(pendingPoll),
        completed: summarizePollResultForDiagnostics(completedPoll),
      },
    };
  } catch (error) {
    rmSync(queuedPath, { force: true });
    rmSync(completedPath, { force: true });
    return {
      ...base,
      status: "failed",
      diagnosticPrintJobId,
      diagnosticExternalJobId,
      cleanupOk: !existsSync(queuedPath) && !existsSync(completedPath),
      blockers: [
        ...blockers,
        {
          key: "spool-diagnostics-runtime",
          label: "spool 诊断运行",
          status: "failed",
          tone: "danger",
          blocking: true,
          detail: `诊断写入或回读失败：${error?.name ?? "Error"}`,
        },
      ],
    };
  }
}

export function runCommandBridgeCupsDiagnostics({
  operatorId = "U-OFFICE-A",
  reason = "",
  dryRunEnabled = false,
  systemPrinterEnabled = false,
  systemPrinterAdapterKind = "none",
  systemPrinterCommand = "",
  systemPrinterCommandArgs = defaultCommandArgTemplate,
  systemPrinterCommandTimeoutMs = 5000,
  commandBridgeSpoolDir = normalizeCommandBridgeSpoolDir(),
  allowedPrinterNames = [],
  commandRunner = runSystemPrinterCommand,
} = {}) {
  const checkedAt = new Date().toISOString();
  const normalizedAdapterKind = normalizeSystemPrinterAdapterKind(systemPrinterAdapterKind);
  const normalizedAllowedPrinters = normalizeStringList(allowedPrinterNames);
  const configuration = buildConfiguration({
    dryRunEnabled,
    systemPrinterEnabled,
    systemPrinterAdapterKind: normalizedAdapterKind,
    systemPrinterCommand,
    systemPrinterCommandArgs: normalizeCommandArgs(systemPrinterCommandArgs),
    systemPrinterCommandTimeoutMs,
    commandBridgeSpoolDir,
    allowedPrinterNames: normalizedAllowedPrinters,
  });
  const environmentPreflight = buildSystemPrinterEnvironmentPreflight(configuration, {
    systemPrinterCommand,
    commandBridgeSpoolDir,
  });
  const blockers = environmentPreflight.items
    .filter((item) => item.blocking && item.status !== "passed")
    .map((item) => ({
      key: item.key,
      label: item.label,
      status: item.status,
      tone: item.tone,
      blocking: item.blocking,
      detail: item.detail,
    }));
  const base = {
    adapterName: "p0-print-driver-adapter",
    status: "not_configured",
    ready: false,
    checkedAt,
    scope: "non_printing_cups_queue_preflight",
    operatorId,
    reason: String(reason ?? "").trim(),
    cupsQueueStatusReadback: "cups_status_command",
    cupsPrinterConfigured: normalizedAllowedPrinters.length > 0,
    cupsPrinterAllowed: false,
    cupsStatusCommandConfigured: configuration.systemPrinterCommandConfigured,
    cupsStatusCommandRunnable: false,
    physicalPrinterCalled: false,
    commandValueExposed: false,
    commandArgsExposed: false,
    stdoutExposed: false,
    stderrExposed: false,
    configuration: {
      kind: configuration.kind,
      dryRunEnabled: configuration.dryRunEnabled,
      systemPrinterEnabled: configuration.systemPrinterEnabled,
      systemPrinterAdapterKind: configuration.systemPrinterAdapterKind,
      systemPrinterCommandConfigured: configuration.systemPrinterCommandConfigured,
      systemPrinterCommandArgsConfigured: configuration.systemPrinterCommandArgsConfigured,
      systemPrinterCommandTimeoutMs: configuration.systemPrinterCommandTimeoutMs,
      allowedPrinterCount: configuration.allowedPrinterNames.length,
      realDispatchAvailable: configuration.realDispatchAvailable,
    },
    blockers,
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

  if (!configuration.realDispatchAvailable || blockers.length > 0) {
    return base;
  }

  const diagnosticPrinterName = normalizedAllowedPrinters[0];
  const diagnosticPrintJobId = `PJ-CUPS-DIAG-${Date.now()}-${Math.floor(Math.random() * 100000)}`;
  const normalized = {
    printJobId: diagnosticPrintJobId,
    printDeviceId: diagnosticPrinterName,
    printDeviceName: diagnosticPrinterName,
    driverName: "command_bridge_cups_diagnostics",
    connectionUri: "cups://diagnostic",
    documentType: "diagnostic",
    targetType: "print_driver",
    targetId: "cups_queue_preflight",
    driverMode: "system_printer",
    jobStatus: "diagnostic",
    externalJobId: "",
  };
  const args = [
    ...renderCommandArgs(normalizeCommandArgs(systemPrinterCommandArgs), normalized),
    "--action",
    "cups-preflight",
    "--mode",
    "cups_lp",
    "--cups-printer",
    diagnosticPrinterName,
    "--cups-allowlist",
    normalizedAllowedPrinters.join(","),
  ];
  const result = runCommandRunner({
    commandRunner,
    command: systemPrinterCommand,
    args,
    stdin: "",
    timeoutMs: systemPrinterCommandTimeoutMs,
    normalized,
  });
  const parsed = parseCupsPreflightStdout(result.stdout);
  const runtimeBlockers = buildCupsDiagnosticRuntimeBlockers({ result, parsed });
  const ready = result.ok && parsed.ready === true && runtimeBlockers.length === 0;
  return {
    ...base,
    status: ready ? "ok" : "failed",
    ready,
    cupsPrinterConfigured: Boolean(parsed.cupsPrinterConfigured ?? base.cupsPrinterConfigured),
    cupsPrinterAllowed: Boolean(parsed.cupsPrinterAllowed),
    cupsStatusCommandConfigured: Boolean(parsed.cupsStatusCommandConfigured ?? base.cupsStatusCommandConfigured),
    cupsStatusCommandRunnable: Boolean(parsed.cupsStatusCommandRunnable),
    blockers: ready ? [] : [...blockers, ...runtimeBlockers],
    preflightResult: {
      status: String(parsed.status ?? "").trim(),
      ready: parsed.ready === true,
      action: String(parsed.action ?? "").trim(),
      mode: String(parsed.mode ?? "").trim(),
      scope: String(parsed.scope ?? "").trim(),
      cupsAllowlistConfigured: Boolean(parsed.cupsAllowlistConfigured),
      cupsPrinterConfigured: Boolean(parsed.cupsPrinterConfigured),
      cupsPrinterAllowed: Boolean(parsed.cupsPrinterAllowed),
      cupsStatusCommandConfigured: Boolean(parsed.cupsStatusCommandConfigured),
      cupsStatusCommandRunnable: Boolean(parsed.cupsStatusCommandRunnable),
      exitCode: parsed.exitCode ?? result.exitCode,
      signal: String(parsed.signal ?? result.signal ?? "").trim(),
      stdoutBytes: normalizeOptionalInteger(parsed.stdoutBytes, byteLength(result.stdout)),
      stderrBytes: normalizeOptionalInteger(parsed.stderrBytes, byteLength(result.stderr)),
      errorCode: String(parsed.errorCode ?? result.errorCode ?? "").trim(),
      message: sanitizeCommandBridgeMessage(parsed.message ?? result.message),
    },
  };
}

function buildDispatchResult(input) {
  return {
    adapterName: "p0-print-driver-adapter",
    adapterStatus: input.adapterStatus,
    jobStatus: input.jobStatus,
    externalJobId: input.externalJobId ?? "",
    errorCode: input.errorCode ?? "",
    errorMessage: input.errorCode ? input.message : "",
    message: input.message,
    dispatchedAt: input.now,
    operatorId: input.operatorId,
    reason: input.reason,
    metadata: input.metadata ?? {},
  };
}

function buildPollResult(input) {
  return {
    adapterName: "p0-print-driver-adapter",
    adapterStatus: input.adapterStatus,
    eventSource: "driver_poll",
    status: input.status ?? "",
    driverStatus: input.driverStatus ?? input.status ?? "",
    externalJobId: input.externalJobId ?? "",
    errorCode: input.errorCode ?? "",
    errorMessage: input.errorCode ? input.message : "",
    message: input.message,
    eventAt: input.now,
    polledAt: input.now,
    operatorId: input.operatorId,
    reason: input.reason,
    metadata: {
      pollAdapterStatus: input.adapterStatus,
      ...(input.metadata ?? {}),
    },
  };
}

function normalizePrintJob(printJob) {
  if (!printJob || typeof printJob !== "object") {
    return {
      printJobId: "",
      printDeviceId: "",
      driverMode: "preview_only",
      jobStatus: "",
      externalJobId: "",
    };
  }
  const metadata = printJob.metadata && typeof printJob.metadata === "object" ? printJob.metadata : {};
  const printDeviceSnapshot =
    printJob.printDeviceSnapshot && typeof printJob.printDeviceSnapshot === "object" ? printJob.printDeviceSnapshot : {};
  return {
    printJobId: String(printJob.printJobId ?? printJob.id ?? "").trim(),
    printDeviceId: String(printJob.printDeviceId ?? printJob.printerDeviceId ?? "").trim(),
    printDeviceName: String(printDeviceSnapshot.name ?? printDeviceSnapshot.displayName ?? "").trim(),
    driverName: String(printDeviceSnapshot.driverName ?? printDeviceSnapshot.driver ?? "").trim(),
    connectionUri: String(printDeviceSnapshot.connectionUri ?? printDeviceSnapshot.uri ?? "").trim(),
    documentType: String(printJob.documentType ?? printJob.document_type ?? "").trim(),
    targetType: String(printJob.targetType ?? printJob.target_type ?? "").trim(),
    targetId: String(printJob.targetId ?? printJob.target_id ?? "").trim(),
    driverMode: normalizeDriverMode(printJob.driverMode ?? printDeviceSnapshot.settings?.driverMode),
    jobStatus: String(printJob.jobStatus ?? printJob.status ?? "").trim(),
    externalJobId: String(
      metadata.externalJobId ?? metadata.lastDriverStatusEvent?.externalJobId ?? metadata.lastDispatch?.externalJobId ?? "",
    ).trim(),
  };
}

function normalizeDriverMode(value) {
  const mode = String(value ?? "").trim();
  if (["preview_only", "system_printer", "browser_download", "manual", "adapter_pending"].includes(mode)) return mode;
  return "preview_only";
}

function buildConfiguration({
  dryRunEnabled,
  systemPrinterEnabled,
  systemPrinterAdapterKind,
  systemPrinterCommand,
  systemPrinterCommandArgs,
  systemPrinterCommandTimeoutMs,
  commandBridgeSpoolDir,
  allowedPrinterNames,
}) {
  const commandBridgeReady =
    systemPrinterEnabled &&
    systemPrinterAdapterKind === "command_bridge" &&
    Boolean(systemPrinterCommand) &&
    allowedPrinterNames.length > 0;
  return {
    adapterName: "p0-print-driver-adapter",
    kind: dryRunEnabled ? "dry_run_adapter" : "guarded_adapter",
    dryRunEnabled,
    systemPrinterEnabled,
    systemPrinterAdapterKind,
    systemPrinterCommandConfigured: Boolean(systemPrinterCommand),
    systemPrinterCommandArgsConfigured: systemPrinterCommandArgs.length > 0,
    systemPrinterCommandTimeoutMs,
    commandBridgeStatusReadbackAvailable: commandBridgeReady && Boolean(commandBridgeSpoolDir),
    allowedPrinterNames,
    realDispatchAvailable: commandBridgeReady,
    safeguards: {
      commandValueExposed: false,
      physicalPrinterCallsBlocked: !commandBridgeReady,
    },
  };
}

function buildSystemPrinterEnvironmentPreflight(configuration, { systemPrinterCommand, commandBridgeSpoolDir }) {
  const commandAvailability = inspectCommandAvailability(systemPrinterCommand);
  const spoolAvailability = inspectSpoolDirectory(commandBridgeSpoolDir);
  const items = [
    buildPreflightItem({
      key: "system-printer-enabled",
      label: "系统打印开关",
      passed: configuration.systemPrinterEnabled,
      detail: configuration.systemPrinterEnabled ? "后端允许系统打印派发" : "系统打印仍关闭，真实派发会被阻断",
      blocking: true,
    }),
    buildPreflightItem({
      key: "command-bridge-selected",
      label: "命令桥类型",
      passed: configuration.systemPrinterAdapterKind === "command_bridge",
      detail:
        configuration.systemPrinterAdapterKind === "command_bridge"
          ? "已选择 command_bridge"
          : "需选择 command_bridge 才能走本机命令桥",
      blocking: true,
    }),
    buildPreflightItem({
      key: "command-configured",
      label: "打印命令配置",
      passed: configuration.systemPrinterCommandConfigured,
      detail: configuration.systemPrinterCommandConfigured ? "后端已配置打印命令" : "尚未配置打印命令",
      blocking: true,
    }),
    buildPreflightItem({
      key: "command-executable",
      label: "打印命令可执行",
      passed: commandAvailability.executable,
      detail: commandAvailability.detail,
      blocking: true,
      failureTone: commandAvailability.configured ? "danger" : "warning",
    }),
    buildPreflightItem({
      key: "command-args-configured",
      label: "命令参数模板",
      passed: configuration.systemPrinterCommandArgsConfigured,
      detail: configuration.systemPrinterCommandArgsConfigured ? "已配置安全参数模板" : "需配置安全参数模板",
      blocking: true,
    }),
    buildPreflightItem({
      key: "printer-allowlist",
      label: "打印机白名单",
      passed: configuration.allowedPrinterNames.length > 0,
      detail: configuration.allowedPrinterNames.length
        ? `已限制 ${configuration.allowedPrinterNames.length} 个目标标识`
        : "需配置 ERP_SYSTEM_PRINTER_ALLOWLIST",
      blocking: true,
    }),
    buildPreflightItem({
      key: "spool-directory",
      label: "spool 状态目录",
      passed: spoolAvailability.writable,
      detail: spoolAvailability.detail,
      blocking: false,
      failureTone: spoolAvailability.exists ? "danger" : "warning",
    }),
    buildPreflightItem({
      key: "command-redaction",
      label: "命令值脱敏",
      passed: !configuration.safeguards.commandValueExposed,
      detail: configuration.safeguards.commandValueExposed ? "前端不应看到真实命令值" : "预检结果不暴露命令路径或参数",
      blocking: true,
      failureTone: "danger",
    }),
    buildPreflightItem({
      key: "real-dispatch-available",
      label: "真实派发可达",
      passed: configuration.realDispatchAvailable,
      detail: configuration.realDispatchAvailable ? "配置允许提交命令桥" : "当前配置仍会阻断真实派发",
      blocking: true,
    }),
  ];
  const passedCount = items.filter((item) => item.status === "passed").length;
  const blockingCount = items.filter((item) => item.blocking && item.status !== "passed").length;
  const dangerCount = items.filter((item) => item.tone === "danger").length;
  return {
    checkedAt: new Date().toISOString(),
    scope: "non_printing_environment_preflight",
    summary: {
      label: `${passedCount}/${items.length} 通过`,
      passedCount,
      totalCount: items.length,
      blockingCount,
      tone: dangerCount ? "danger" : blockingCount ? "warning" : "success",
    },
    items,
    safeguards: {
      nonPrinting: true,
      commandValueExposed: false,
      commandArgsExposed: false,
      spoolPathExposed: false,
    },
  };
}

function buildPreflightItem({ key, label, passed, detail, blocking, failureTone = "warning" }) {
  return {
    key,
    label,
    status: passed ? "passed" : "pending",
    tone: passed ? "success" : failureTone,
    detail,
    blocking: Boolean(blocking),
  };
}

function pollCommandBridgePrintJobStatus({ normalized, now, operatorId, reason, commandBridgeSpoolDir }) {
  const bridgeStatus = normalized.externalJobId
    ? readCommandBridgeSpoolStatus({
        externalJobId: normalized.externalJobId,
        spoolDir: commandBridgeSpoolDir,
      })
    : undefined;
  return buildPollResult({
    now,
    operatorId,
    reason,
    ...resolveCommandBridgePollResult({
      externalJobId: normalized.externalJobId,
      bridgeStatus,
    }),
  });
}

function readCommandBridgeSpoolStatus({ externalJobId, spoolDir }) {
  const resolvedSpoolDir = normalizeCommandBridgeSpoolDir({ spoolDir });
  const safeExternalJobId = safeFileSegment(externalJobId);
  const directoryCandidates = ["completed", "failed", "canceled", "cancelled", "sent", "processing", "queued"];
  for (const directoryStatus of directoryCandidates) {
    const spoolPath = join(resolvedSpoolDir, directoryStatus, `${safeExternalJobId}.json`);
    if (!existsSync(spoolPath)) continue;
    try {
      const record = JSON.parse(readFileSync(spoolPath, "utf8"));
      const rawStatus = sanitizeCommandBridgeMessage(record.status ?? directoryStatus);
      const status = normalizeCommandBridgeSpoolStatus(rawStatus);
      return {
        found: true,
        status,
        rawStatus,
        driverStatus: normalizeCommandBridgeDriverStatus(rawStatus),
        errorCode: String(record.errorCode ?? record.error_code ?? "").trim(),
        message: sanitizeCommandBridgeMessage(record.message ?? record.errorMessage ?? record.error_message),
        metadata: buildCommandBridgeStatusMetadata({ record, rawStatus, directoryStatus }),
      };
    } catch {
      return {
        found: false,
        errorCode: "SYSTEM_PRINTER_COMMAND_BRIDGE_STATUS_INVALID",
        message: "Command-bridge spool status file is not valid JSON.",
        metadata: {
          commandBridge: {
            statusReadback: "spool_file",
            statusFileFound: true,
            statusFileValid: false,
          },
        },
      };
    }
  }
  return {
    found: false,
    errorCode: "SYSTEM_PRINTER_COMMAND_BRIDGE_STATUS_NOT_FOUND",
    message: "Command-bridge spool status file was not found for this external job id.",
    metadata: {
      commandBridge: {
        statusReadback: "spool_file",
        statusFileFound: false,
      },
    },
  };
}

function getSystemPrinterBridgeGuardError(
  normalized,
  { action, systemPrinterAdapterKind, systemPrinterCommand, allowedPrinterNames },
) {
  const actionLabel = action === "poll" ? "polling" : "dispatch";
  if (systemPrinterAdapterKind === "none") {
    return {
      errorCode: action === "poll" ? "SYSTEM_PRINTER_POLL_ADAPTER_MISSING" : "SYSTEM_PRINTER_ADAPTER_MISSING",
      message: `System printer ${actionLabel} is enabled but no concrete OS printer adapter has been selected.`,
    };
  }
  if (systemPrinterAdapterKind === "unsupported") {
    return {
      errorCode:
        action === "poll" ? "SYSTEM_PRINTER_POLL_ADAPTER_UNSUPPORTED" : "SYSTEM_PRINTER_ADAPTER_UNSUPPORTED",
      message: `System printer ${actionLabel} uses an unsupported adapter kind.`,
    };
  }
  if (systemPrinterAdapterKind === "command_bridge" && !String(systemPrinterCommand ?? "").trim()) {
    return {
      errorCode:
        action === "poll" ? "SYSTEM_PRINTER_POLL_COMMAND_NOT_CONFIGURED" : "SYSTEM_PRINTER_COMMAND_NOT_CONFIGURED",
      message: `System printer ${actionLabel} selected command_bridge but ERP_SYSTEM_PRINTER_COMMAND is not configured.`,
    };
  }
  if (systemPrinterAdapterKind === "command_bridge" && normalizeStringList(allowedPrinterNames).length === 0) {
    return {
      errorCode:
        action === "poll" ? "SYSTEM_PRINTER_POLL_ALLOWLIST_REQUIRED" : "SYSTEM_PRINTER_ALLOWLIST_REQUIRED",
      message: `System printer ${actionLabel} selected command_bridge but ERP_SYSTEM_PRINTER_ALLOWLIST is not configured.`,
    };
  }
  if (!isPrintDeviceAllowed(normalized, allowedPrinterNames)) {
    return {
      errorCode:
        action === "poll" ? "SYSTEM_PRINTER_POLL_DEVICE_NOT_ALLOWED" : "SYSTEM_PRINTER_DEVICE_NOT_ALLOWED",
      message: `System printer ${actionLabel} refused this device because it is outside ERP_SYSTEM_PRINTER_ALLOWLIST.`,
    };
  }
  if (systemPrinterAdapterKind === "command_bridge") {
    return null;
  }
  return {
    errorCode:
      action === "poll" ? "SYSTEM_PRINTER_POLL_VENDOR_BRIDGE_NOT_IMPLEMENTED" : "SYSTEM_PRINTER_VENDOR_BRIDGE_NOT_IMPLEMENTED",
    message: `System printer ${actionLabel} vendor_bridge is selected but no vendor SDK bridge has been implemented in this prototype.`,
  };
}

function dispatchCommandBridgePrintJob({
  printJob,
  normalized,
  now,
  operatorId,
  reason,
  systemPrinterCommand,
  systemPrinterCommandArgs,
  systemPrinterCommandTimeoutMs,
  commandRunner,
}) {
  const args = renderCommandArgs(normalizeCommandArgs(systemPrinterCommandArgs), normalized);
  const stdin = buildCommandBridgePayload({ printJob, normalized });
  const result = runCommandRunner({
    commandRunner,
    command: systemPrinterCommand,
    args,
    stdin,
    timeoutMs: systemPrinterCommandTimeoutMs,
    normalized,
  });
  if (!result.ok) {
    return buildDispatchResult({
      now,
      operatorId,
      reason,
      adapterStatus: "failed",
      jobStatus: "failed",
      errorCode: result.errorCode,
      message: result.message,
      metadata: buildCommandBridgeDispatchMetadata(result),
    });
  }
  return buildDispatchResult({
    now,
    operatorId,
    reason,
    adapterStatus: "command_sent",
    jobStatus: "sent",
    externalJobId: extractCommandExternalJobId(result, normalized),
    message: "Command-bridge printer adapter submitted the job; physical completion still requires callback or confirmation.",
    metadata: buildCommandBridgeDispatchMetadata(result),
  });
}

function runCommandRunner({ commandRunner, command, args, stdin, timeoutMs, normalized }) {
  try {
    const result = commandRunner({ command, args, stdin, timeoutMs, printJob: normalized });
    const normalizedResult = normalizeCommandRunnerResult(result);
    if (normalizedResult.errorCode) return normalizedResult;
    if (normalizedResult.exitCode !== 0) {
      return {
        ...normalizedResult,
        ok: false,
        errorCode: "SYSTEM_PRINTER_COMMAND_FAILED",
        message: `System printer command exited with code ${normalizedResult.exitCode}.`,
      };
    }
    return {
      ...normalizedResult,
      ok: true,
      message: "System printer command completed.",
    };
  } catch (error) {
    return {
      ok: false,
      exitCode: null,
      signal: "",
      stdout: "",
      stderr: "",
      errorCode: "SYSTEM_PRINTER_COMMAND_EXCEPTION",
      message: `System printer command runner threw ${error?.name ?? "Error"}.`,
    };
  }
}

function isPrintDeviceAllowed(normalized, allowedPrinterNames) {
  const allowlist = normalizeStringList(allowedPrinterNames);
  if (allowlist.length === 0) return true;
  const deviceIdentifiers = [
    normalized.printDeviceId,
    normalized.printDeviceName,
    normalized.driverName,
    normalized.connectionUri,
  ]
    .map((value) => String(value ?? "").trim().toLowerCase())
    .filter(Boolean);
  return allowlist.some((allowed) => deviceIdentifiers.includes(String(allowed).trim().toLowerCase()));
}

function normalizeSystemPrinterAdapterKind(value) {
  const kind = String(value ?? "none").trim().toLowerCase();
  if (!kind || kind === "none") return "none";
  if (["command_bridge", "vendor_bridge"].includes(kind)) return kind;
  return "unsupported";
}

function normalizeStringList(value) {
  const raw = Array.isArray(value) ? value : String(value ?? "").split(",");
  return [...new Set(raw.map((item) => String(item ?? "").trim()).filter(Boolean))];
}

function normalizeCommandBridgeSpoolDir({ spoolDir = "", localStorageDir = "" } = {}) {
  const configuredSpoolDir = String(spoolDir ?? "").trim();
  if (configuredSpoolDir) return resolve(configuredSpoolDir);
  const configuredStorageDir = String(localStorageDir ?? "").trim() || join(process.cwd(), ".erp-local-storage");
  return resolve(configuredStorageDir, "print-command-bridge");
}

function normalizePositiveInteger(value, fallback, max) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(Math.floor(parsed), max);
}

function safeFileSegment(value) {
  const segment = String(value ?? "").trim().replace(/[^A-Za-z0-9_.-]/g, "_");
  return segment || "unknown";
}
