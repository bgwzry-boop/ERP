import assert from "node:assert/strict";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createPrintDriverAdapter, dispatchPrintJob, pollPrintJobStatus } from "../server/printDriverAdapter.mjs";

const basePrintJob = {
  printJobId: "PJ-DRIVER-CHECK-001",
  printDeviceId: "PRN-DRIVER-CHECK-001",
  jobStatus: "queued",
};

const systemPrintJob = {
  ...basePrintJob,
  driverMode: "system_printer",
  printDeviceSnapshot: {
    name: "Office Label Printer",
    driverName: "CUPS",
    connectionUri: "usb://office-label-printer",
  },
};

const previewResult = dispatchPrintJob({
  printJob: {
    ...basePrintJob,
    driverMode: "preview_only",
  },
  operatorId: "U-OFFICE-A",
  reason: "preview boundary check",
});
assert.equal(previewResult.adapterStatus, "skipped");
assert.equal(previewResult.jobStatus, "preview_only");
assert.match(previewResult.message, /no operating system print call/i);

const pendingResult = dispatchPrintJob({
  printJob: {
    ...basePrintJob,
    driverMode: "adapter_pending",
  },
});
assert.equal(pendingResult.adapterStatus, "queued");
assert.equal(pendingResult.jobStatus, "queued");

const missingDeviceResult = dispatchPrintJob({
  printJob: {
    printJobId: "PJ-DRIVER-CHECK-MISSING-DEVICE",
    driverMode: "system_printer",
  },
});
assert.equal(missingDeviceResult.adapterStatus, "failed");
assert.equal(missingDeviceResult.jobStatus, "failed");
assert.equal(missingDeviceResult.errorCode, "PRINT_DEVICE_MISSING");

const guardedResult = dispatchPrintJob({
  printJob: systemPrintJob,
});
assert.equal(guardedResult.adapterStatus, "failed");
assert.equal(guardedResult.jobStatus, "failed");
assert.equal(guardedResult.errorCode, "SYSTEM_PRINTER_ADAPTER_NOT_CONFIGURED");

const enabledMissingAdapterResult = dispatchPrintJob({
  printJob: systemPrintJob,
  systemPrinterEnabled: true,
});
assert.equal(enabledMissingAdapterResult.adapterStatus, "failed");
assert.equal(enabledMissingAdapterResult.errorCode, "SYSTEM_PRINTER_ADAPTER_MISSING");

const missingCommandResult = dispatchPrintJob({
  printJob: systemPrintJob,
  systemPrinterEnabled: true,
  systemPrinterAdapterKind: "command_bridge",
});
assert.equal(missingCommandResult.adapterStatus, "failed");
assert.equal(missingCommandResult.errorCode, "SYSTEM_PRINTER_COMMAND_NOT_CONFIGURED");

const deniedDeviceResult = dispatchPrintJob({
  printJob: systemPrintJob,
  systemPrinterEnabled: true,
  systemPrinterAdapterKind: "command_bridge",
  systemPrinterCommand: "/usr/bin/lp -d SECRET_PRINTER",
  allowedPrinterNames: ["Another Printer"],
});
assert.equal(deniedDeviceResult.adapterStatus, "failed");
assert.equal(deniedDeviceResult.errorCode, "SYSTEM_PRINTER_DEVICE_NOT_ALLOWED");
assert.doesNotMatch(JSON.stringify(deniedDeviceResult), /SECRET_PRINTER/);

let capturedCommandCall = null;
const commandBridgeSentResult = dispatchPrintJob({
  printJob: systemPrintJob,
  systemPrinterEnabled: true,
  systemPrinterAdapterKind: "command_bridge",
  systemPrinterCommand: "/usr/local/bin/erp-print-bridge",
  systemPrinterCommandArgs: ["--job", "{printJobId}", "--device", "{printDeviceName}"],
  allowedPrinterNames: ["PRN-DRIVER-CHECK-001", "Office Label Printer"],
  commandRunner(input) {
    capturedCommandCall = input;
    return {
      status: 0,
      stdout: JSON.stringify({ externalJobId: "CMD-EXTERNAL-001" }),
      stderr: "",
    };
  },
});
assert.equal(commandBridgeSentResult.adapterStatus, "command_sent");
assert.equal(commandBridgeSentResult.jobStatus, "sent");
assert.equal(commandBridgeSentResult.externalJobId, "CMD-EXTERNAL-001");
assert.deepEqual(capturedCommandCall.args, ["--job", "PJ-DRIVER-CHECK-001", "--device", "Office Label Printer"]);
assert.match(capturedCommandCall.stdin, /PJ-DRIVER-CHECK-001/);
assert.doesNotMatch(JSON.stringify(commandBridgeSentResult), /erp-print-bridge/);
assert.doesNotMatch(JSON.stringify(commandBridgeSentResult), /--device/);

const missingAllowlistResult = dispatchPrintJob({
  printJob: systemPrintJob,
  systemPrinterEnabled: true,
  systemPrinterAdapterKind: "command_bridge",
  systemPrinterCommand: "/usr/local/bin/erp-print-bridge",
});
assert.equal(missingAllowlistResult.adapterStatus, "failed");
assert.equal(missingAllowlistResult.errorCode, "SYSTEM_PRINTER_ALLOWLIST_REQUIRED");

const commandBridgeFailedResult = dispatchPrintJob({
  printJob: systemPrintJob,
  systemPrinterEnabled: true,
  systemPrinterAdapterKind: "command_bridge",
  systemPrinterCommand: "/usr/local/bin/erp-print-bridge",
  allowedPrinterNames: ["Office Label Printer"],
  commandRunner() {
    return {
      status: 2,
      stdout: "externalJobId=SHOULD-NOT-MATTER",
      stderr: "printer unavailable",
    };
  },
});
assert.equal(commandBridgeFailedResult.adapterStatus, "failed");
assert.equal(commandBridgeFailedResult.jobStatus, "failed");
assert.equal(commandBridgeFailedResult.errorCode, "SYSTEM_PRINTER_COMMAND_FAILED");
assert.equal(commandBridgeFailedResult.metadata.commandBridge.exitCode, 2);
assert.doesNotMatch(JSON.stringify(commandBridgeFailedResult), /printer unavailable/);

const unsupportedAdapterResult = dispatchPrintJob({
  printJob: systemPrintJob,
  systemPrinterEnabled: true,
  systemPrinterAdapterKind: "unsupported",
});
assert.equal(unsupportedAdapterResult.adapterStatus, "failed");
assert.equal(unsupportedAdapterResult.errorCode, "SYSTEM_PRINTER_ADAPTER_UNSUPPORTED");

const dryRunResult = dispatchPrintJob({
  printJob: systemPrintJob,
  dryRunEnabled: true,
});
assert.equal(dryRunResult.adapterStatus, "dry_run_sent");
assert.equal(dryRunResult.jobStatus, "sent");
assert.equal(dryRunResult.externalJobId, "DRY-PJ-DRIVER-CHECK-001");

const guardedAdapterConfig = createPrintDriverAdapter().getConfiguration();
assert.equal(guardedAdapterConfig.environmentPreflight.summary.totalCount, 9);
assert.equal(guardedAdapterConfig.environmentPreflight.safeguards.nonPrinting, true);
assert.equal(guardedAdapterConfig.environmentPreflight.safeguards.commandValueExposed, false);
assert.equal(guardedAdapterConfig.environmentPreflight.safeguards.commandArgsExposed, false);
assert.equal(guardedAdapterConfig.environmentPreflight.safeguards.spoolPathExposed, false);
assert.equal(
  guardedAdapterConfig.environmentPreflight.items.find((item) => item.key === "system-printer-enabled")?.status,
  "pending",
);
const guardedSpoolDiagnostics = createPrintDriverAdapter().runSpoolDiagnostics();
assert.equal(guardedSpoolDiagnostics.status, "not_configured");
assert.equal(guardedSpoolDiagnostics.ready, false);
assert.equal(guardedSpoolDiagnostics.safeguards.nonPrinting, true);
assert.equal(guardedSpoolDiagnostics.physicalPrinterCalled, false);
assert.equal(guardedSpoolDiagnostics.secretFieldsExposed, false);
assert.equal(guardedSpoolDiagnostics.spoolPathExposed, false);
assert.equal(guardedSpoolDiagnostics.writeOk, false);
assert.ok(guardedSpoolDiagnostics.blockers.some((item) => item.key === "system-printer-enabled"));

const preflightSpoolDir = join(process.cwd(), ".erp-local-storage", "checks", "print-driver-adapter-preflight");
rmSync(preflightSpoolDir, { recursive: true, force: true });
mkdirSync(preflightSpoolDir, { recursive: true });
const readyAdapterConfig = createPrintDriverAdapter({
  systemPrinterEnabled: true,
  systemPrinterAdapterKind: "command_bridge",
  systemPrinterCommand: process.execPath,
  systemPrinterCommandArgs: ["--version"],
  commandBridgeSpoolDir: preflightSpoolDir,
  allowedPrinterNames: ["Office Label Printer"],
}).getConfiguration();
assert.equal(readyAdapterConfig.environmentPreflight.items.find((item) => item.key === "command-executable")?.status, "passed");
assert.equal(readyAdapterConfig.environmentPreflight.items.find((item) => item.key === "spool-directory")?.status, "passed");
assert.doesNotMatch(JSON.stringify(readyAdapterConfig.environmentPreflight), new RegExp(escapeRegExp(process.execPath)));
assert.doesNotMatch(JSON.stringify(readyAdapterConfig.environmentPreflight), /--version/);
assert.doesNotMatch(JSON.stringify(readyAdapterConfig.environmentPreflight), new RegExp(escapeRegExp(preflightSpoolDir)));

const diagnosticSpoolDir = join(process.cwd(), ".erp-local-storage", "checks", "print-driver-adapter-spool-diagnostics");
rmSync(diagnosticSpoolDir, { recursive: true, force: true });
mkdirSync(diagnosticSpoolDir, { recursive: true });
const readySpoolDiagnostics = createPrintDriverAdapter({
  systemPrinterEnabled: true,
  systemPrinterAdapterKind: "command_bridge",
  systemPrinterCommand: process.execPath,
  systemPrinterCommandArgs: ["--version"],
  commandBridgeSpoolDir: diagnosticSpoolDir,
  allowedPrinterNames: ["Office Label Printer"],
}).runSpoolDiagnostics({
  operatorId: "U-OFFICE-A",
  reason: "adapter check",
});
assert.equal(readySpoolDiagnostics.status, "ok");
assert.equal(readySpoolDiagnostics.ready, true);
assert.equal(readySpoolDiagnostics.writeOk, true);
assert.equal(readySpoolDiagnostics.pendingPollOk, true);
assert.equal(readySpoolDiagnostics.completedPollOk, true);
assert.equal(readySpoolDiagnostics.cleanupOk, true);
assert.equal(readySpoolDiagnostics.physicalPrinterCalled, false);
assert.equal(readySpoolDiagnostics.safeguards.nonPrinting, true);
assert.equal(readySpoolDiagnostics.safeguards.payloadExposed, false);
assert.equal(readySpoolDiagnostics.pollResults.pending.adapterStatus, "command_bridge_pending");
assert.equal(readySpoolDiagnostics.pollResults.completed.adapterStatus, "command_bridge_completed");
assert.doesNotMatch(JSON.stringify(readySpoolDiagnostics), new RegExp(escapeRegExp(process.execPath)));
assert.doesNotMatch(JSON.stringify(readySpoolDiagnostics), /--version/);
assert.doesNotMatch(JSON.stringify(readySpoolDiagnostics), new RegExp(escapeRegExp(diagnosticSpoolDir)));

const missingCommandConfig = createPrintDriverAdapter({
  systemPrinterEnabled: true,
  systemPrinterAdapterKind: "command_bridge",
  systemPrinterCommand: "/definitely/missing/erp-print-bridge",
  allowedPrinterNames: ["Office Label Printer"],
}).getConfiguration();
assert.equal(missingCommandConfig.environmentPreflight.items.find((item) => item.key === "command-executable")?.tone, "danger");

const dryRunPollResult = pollPrintJobStatus({
  printJob: {
    ...basePrintJob,
    driverMode: "system_printer",
    jobStatus: "sent",
    metadata: {
      externalJobId: "DRY-PJ-DRIVER-CHECK-001",
    },
  },
  dryRunEnabled: true,
});
assert.equal(dryRunPollResult.adapterStatus, "dry_run_completed");
assert.equal(dryRunPollResult.status, "printed");
assert.equal(dryRunPollResult.driverStatus, "completed");
assert.equal(dryRunPollResult.eventSource, "driver_poll");

const guardedPollResult = pollPrintJobStatus({
  printJob: {
    ...systemPrintJob,
    jobStatus: "sent",
    metadata: {
      externalJobId: "SYS-PJ-DRIVER-CHECK-001",
    },
  },
});
assert.equal(guardedPollResult.adapterStatus, "poll_unavailable");
assert.equal(guardedPollResult.status, "");

const commandPollBlockedResult = pollPrintJobStatus({
  printJob: {
    ...systemPrintJob,
    jobStatus: "sent",
    metadata: {
      externalJobId: "SYS-PJ-DRIVER-CHECK-001",
    },
  },
  systemPrinterEnabled: true,
  systemPrinterAdapterKind: "command_bridge",
  systemPrinterCommand: "/usr/bin/lp -d SECRET_PRINTER",
  allowedPrinterNames: ["Another Printer"],
});
assert.equal(commandPollBlockedResult.adapterStatus, "failed");
assert.equal(commandPollBlockedResult.errorCode, "SYSTEM_PRINTER_POLL_DEVICE_NOT_ALLOWED");
assert.doesNotMatch(JSON.stringify(commandPollBlockedResult), /SECRET_PRINTER/);

const commandPollUnavailableResult = pollPrintJobStatus({
  printJob: {
    ...systemPrintJob,
    jobStatus: "sent",
    metadata: {
      externalJobId: "CMD-EXTERNAL-001",
    },
  },
  systemPrinterEnabled: true,
  systemPrinterAdapterKind: "command_bridge",
  systemPrinterCommand: "/usr/local/bin/erp-print-bridge",
  allowedPrinterNames: ["Office Label Printer"],
});
assert.equal(commandPollUnavailableResult.adapterStatus, "poll_unavailable");
assert.equal(commandPollUnavailableResult.errorCode, "SYSTEM_PRINTER_COMMAND_BRIDGE_STATUS_NOT_FOUND");
assert.equal(commandPollUnavailableResult.status, "");

const commandBridgeSpoolDir = join(process.cwd(), ".erp-local-storage", "checks", "print-driver-adapter-command-poll");
rmSync(commandBridgeSpoolDir, { recursive: true, force: true });
mkdirSync(join(commandBridgeSpoolDir, "queued"), { recursive: true });
writeFileSync(
  join(commandBridgeSpoolDir, "queued", "CMD-EXTERNAL-001.json"),
  `${JSON.stringify(
    {
      bridgeJobId: "CMD-EXTERNAL-001",
      externalJobId: "CMD-EXTERNAL-001",
      status: "queued",
      mode: "spool_only",
      createdAt: "2026-07-02T10:00:00.000Z",
      payloadDigest: "a".repeat(64),
    },
    null,
    2,
  )}\n`,
);
const commandPollPendingResult = pollPrintJobStatus({
  printJob: {
    ...systemPrintJob,
    jobStatus: "sent",
    metadata: {
      externalJobId: "CMD-EXTERNAL-001",
    },
  },
  systemPrinterEnabled: true,
  systemPrinterAdapterKind: "command_bridge",
  systemPrinterCommand: "/usr/local/bin/erp-print-bridge",
  allowedPrinterNames: ["Office Label Printer"],
  commandBridgeSpoolDir,
});
assert.equal(commandPollPendingResult.adapterStatus, "command_bridge_pending");
assert.equal(commandPollPendingResult.status, "sent");
assert.equal(commandPollPendingResult.driverStatus, "queued");
assert.equal(commandPollPendingResult.metadata.commandBridge.statusReadback, "spool_file");
assert.equal(commandPollPendingResult.metadata.commandBridge.payloadDigest, "a".repeat(64));

writeFileSync(
  join(commandBridgeSpoolDir, "queued", "CMD-EXTERNAL-001.json"),
  `${JSON.stringify(
    {
      bridgeJobId: "CMD-EXTERNAL-001",
      externalJobId: "CMD-EXTERNAL-001",
      status: "completed",
      mode: "spool_only",
      completedAt: "2026-07-02T10:02:00.000Z",
      payloadDigest: "a".repeat(64),
    },
    null,
    2,
  )}\n`,
);
const commandPollCompletedResult = pollPrintJobStatus({
  printJob: {
    ...systemPrintJob,
    jobStatus: "sent",
    metadata: {
      externalJobId: "CMD-EXTERNAL-001",
    },
  },
  systemPrinterEnabled: true,
  systemPrinterAdapterKind: "command_bridge",
  systemPrinterCommand: "/usr/local/bin/erp-print-bridge",
  allowedPrinterNames: ["Office Label Printer"],
  commandBridgeSpoolDir,
});
assert.equal(commandPollCompletedResult.adapterStatus, "command_bridge_completed");
assert.equal(commandPollCompletedResult.status, "printed");
assert.equal(commandPollCompletedResult.driverStatus, "completed");
assert.equal(commandPollCompletedResult.metadata.commandBridge.bridgeUpdatedAt, "2026-07-02T10:02:00.000Z");

const guardedAdapter = createPrintDriverAdapter({ dryRunEnabled: false, systemPrinterEnabled: false });
assert.equal(guardedAdapter.kind, "guarded_adapter");
const guardedConfig = guardedAdapter.getConfiguration();
assert.equal(guardedConfig.kind, "guarded_adapter");
assert.equal(guardedConfig.systemPrinterEnabled, false);
assert.equal(guardedConfig.systemPrinterCommandConfigured, false);
assert.deepEqual(guardedConfig.allowedPrinterNames, []);
assert.equal(guardedConfig.realDispatchAvailable, false);
assert.equal(guardedConfig.safeguards.commandValueExposed, false);
assert.equal(
  guardedAdapter.dispatchPrintJob({
    printJob: systemPrintJob,
  }).errorCode,
  "SYSTEM_PRINTER_ADAPTER_NOT_CONFIGURED",
);

const configuredCommandAdapter = createPrintDriverAdapter({
  dryRunEnabled: false,
  systemPrinterEnabled: true,
  systemPrinterAdapterKind: "command_bridge",
  systemPrinterCommand: "/usr/bin/lp -d SECRET_PRINTER",
  allowedPrinterNames: "PRN-DRIVER-CHECK-001,Office Label Printer",
});
const configuredCommandConfig = configuredCommandAdapter.getConfiguration();
assert.equal(configuredCommandConfig.systemPrinterAdapterKind, "command_bridge");
assert.equal(configuredCommandConfig.systemPrinterCommandConfigured, true);
assert.equal(configuredCommandConfig.systemPrinterCommandArgsConfigured, true);
assert.deepEqual(configuredCommandConfig.allowedPrinterNames, ["PRN-DRIVER-CHECK-001", "Office Label Printer"]);
assert.equal(configuredCommandConfig.realDispatchAvailable, true);
assert.equal(configuredCommandConfig.safeguards.physicalPrinterCallsBlocked, false);
assert.doesNotMatch(JSON.stringify(configuredCommandConfig), /SECRET_PRINTER/);
assert.equal(
  configuredCommandAdapter.dispatchPrintJob({
    printJob: systemPrintJob,
  }).errorCode,
  "SYSTEM_PRINTER_COMMAND_FAILED",
);

const dryRunAdapter = createPrintDriverAdapter({ dryRunEnabled: true });
assert.equal(dryRunAdapter.kind, "dry_run_adapter");
assert.equal(
  dryRunAdapter.dispatchPrintJob({
    printJob: {
      ...basePrintJob,
      driverMode: "system_printer",
    },
  }).jobStatus,
  "sent",
);
assert.equal(
  dryRunAdapter.pollPrintJobStatus({
    printJob: {
      ...basePrintJob,
      driverMode: "system_printer",
      jobStatus: "sent",
      metadata: {
        externalJobId: "DRY-PJ-DRIVER-CHECK-001",
      },
    },
  }).status,
  "printed",
);

console.log("print-driver-adapter check passed");

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
