import assert from "node:assert/strict";
import { existsSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { dispatchPrintJob, runCommandBridgeCupsDiagnostics } from "../server/printDriverAdapter.mjs";

const storageRoot = join(process.cwd(), ".erp-local-storage", "checks", "print-command-bridge");
const bridgeScript = join(process.cwd(), "scripts", "print-command-bridge.mjs");
const fakeCupsScript = join(process.cwd(), "scripts", "fake-cups-lp.mjs");
const fakeCupsStatusScript = join(process.cwd(), "scripts", "fake-cups-lpstat.mjs");
rmSync(storageRoot, { recursive: true, force: true });

const payload = {
  printJobId: "PJ-BRIDGE-CHECK-001",
  printDeviceId: "PRN-BRIDGE-CHECK-001",
  printDeviceName: "QA Label Printer",
  driverName: "QA 203dpi Driver",
  connectionUri: "system://qa-label-printer",
  documentType: "express_ltl_label",
  targetType: "fulfillment",
  targetId: "FUL-BRIDGE-CHECK-001",
  payloadSnapshot: {
    templateId: "tpl-check-label",
    labelText: "QA label payload",
  },
  printDeviceSnapshot: {
    printDeviceId: "PRN-BRIDGE-CHECK-001",
    name: "QA Label Printer",
    settings: { driverMode: "system_printer" },
  },
};

const directResult = runBridge({
  args: [
    "--storage-root",
    storageRoot,
    "--print-job-id",
    "PJ-BRIDGE-CHECK-001",
    "--print-device-id",
    "PRN-BRIDGE-CHECK-001",
    "--print-device-name",
    "QA Label Printer",
  ],
  input: payload,
});
assert.equal(directResult.status, 0);
const directOutput = JSON.parse(directResult.stdout);
assert.match(directOutput.externalJobId, /^PCB-PJ-BRIDGE-CHECK-001-/);
assert.equal(directOutput.status, "queued");
assert.equal(directOutput.mode, "spool_only");
assert.doesNotMatch(directResult.stdout, /QA label payload/);

const directSpoolPath = join(storageRoot, "print-command-bridge", "queued", `${directOutput.externalJobId}.json`);
assert.equal(existsSync(directSpoolPath), true);
const directSpoolRecord = JSON.parse(readFileSync(directSpoolPath, "utf8"));
assert.equal(directSpoolRecord.printJobId, payload.printJobId);
assert.equal(directSpoolRecord.printDeviceId, payload.printDeviceId);
assert.equal(directSpoolRecord.payloadSnapshot.labelText, "QA label payload");
assert.match(directSpoolRecord.payloadDigest, /^[0-9a-f]{64}$/);

const directStatusResult = runBridge({
  args: ["--storage-root", storageRoot, "--action", "status", "--external-job-id", directOutput.externalJobId],
});
assert.equal(directStatusResult.status, 0);
const directStatusOutput = JSON.parse(directStatusResult.stdout);
assert.equal(directStatusOutput.status, "queued");
assert.equal(directStatusOutput.statusDirectory, "queued");
assert.equal(directStatusOutput.payloadDigest, directSpoolRecord.payloadDigest);
assert.doesNotMatch(directStatusResult.stdout, /QA label payload/);

const directCompleteResult = runBridge({
  args: ["--storage-root", storageRoot, "--action", "complete", "--external-job-id", directOutput.externalJobId],
});
assert.equal(directCompleteResult.status, 0);
const directCompleteOutput = JSON.parse(directCompleteResult.stdout);
assert.equal(directCompleteOutput.previousStatus, "queued");
assert.equal(directCompleteOutput.status, "completed");
assert.equal(directCompleteOutput.statusDirectory, "completed");
assert.match(directCompleteOutput.completedAt, /^\d{4}-\d{2}-\d{2}T/);
assert.equal(existsSync(directSpoolPath), false);
assert.equal(existsSync(join(storageRoot, "print-command-bridge", "completed", `${directOutput.externalJobId}.json`)), true);

const directCancelTerminalResult = runBridge({
  args: ["--storage-root", storageRoot, "--action", "cancel", "--external-job-id", directOutput.externalJobId],
});
assert.equal(directCancelTerminalResult.status, 5);
assert.match(directCancelTerminalResult.stderr, /PRINT_BRIDGE_TERMINAL_STATUS_LOCKED/);

const failPayload = { ...payload, printJobId: "PJ-BRIDGE-CHECK-FAIL", targetId: "FUL-BRIDGE-CHECK-FAIL" };
const failSubmitResult = runBridge({
  args: [
    "--storage-root",
    storageRoot,
    "--print-job-id",
    "PJ-BRIDGE-CHECK-FAIL",
    "--print-device-id",
    "PRN-BRIDGE-CHECK-001",
  ],
  input: failPayload,
});
assert.equal(failSubmitResult.status, 0);
const failSubmitOutput = JSON.parse(failSubmitResult.stdout);
const failActionResult = runBridge({
  args: [
    "--storage-root",
    storageRoot,
    "--action",
    "fail",
    "--external-job-id",
    failSubmitOutput.externalJobId,
    "--error-code",
    "QA_PRINT_FAILED",
    "--message",
    "sample failure",
  ],
});
assert.equal(failActionResult.status, 0);
const failActionOutput = JSON.parse(failActionResult.stdout);
assert.equal(failActionOutput.status, "failed");
assert.equal(failActionOutput.errorCode, "QA_PRINT_FAILED");
assert.equal(failActionOutput.errorMessage, "sample failure");
assert.equal(existsSync(join(storageRoot, "print-command-bridge", "failed", `${failSubmitOutput.externalJobId}.json`)), true);

const cancelPayload = { ...payload, printJobId: "PJ-BRIDGE-CHECK-CANCEL", targetId: "FUL-BRIDGE-CHECK-CANCEL" };
const cancelSubmitResult = runBridge({
  args: [
    "--storage-root",
    storageRoot,
    "--print-job-id",
    "PJ-BRIDGE-CHECK-CANCEL",
    "--print-device-id",
    "PRN-BRIDGE-CHECK-001",
  ],
  input: cancelPayload,
});
assert.equal(cancelSubmitResult.status, 0);
const cancelSubmitOutput = JSON.parse(cancelSubmitResult.stdout);
const cancelActionResult = runBridge({
  args: [
    "--storage-root",
    storageRoot,
    "--action",
    "cancel",
    "--external-job-id",
    cancelSubmitOutput.externalJobId,
    "--reason",
    "operator canceled",
  ],
});
assert.equal(cancelActionResult.status, 0);
const cancelActionOutput = JSON.parse(cancelActionResult.stdout);
assert.equal(cancelActionOutput.status, "canceled");
assert.equal(cancelActionOutput.cancelReason, "operator canceled");
assert.equal(existsSync(join(storageRoot, "print-command-bridge", "canceled", `${cancelSubmitOutput.externalJobId}.json`)), true);

const mismatchResult = runBridge({
  args: ["--storage-root", storageRoot, "--print-job-id", "PJ-MISMATCH"],
  input: payload,
});
assert.equal(mismatchResult.status, 2);
assert.match(mismatchResult.stderr, /PRINT_BRIDGE_JOB_ID_MISMATCH/);

const outsideResult = runBridge({
  args: ["--storage-root", storageRoot, "--spool-dir", process.cwd(), "--print-job-id", payload.printJobId],
  input: payload,
});
assert.equal(outsideResult.status, 2);
assert.match(outsideResult.stderr, /PRINT_BRIDGE_SPOOL_OUTSIDE_STORAGE_ROOT/);

const invalidJsonResult = spawnSync(process.execPath, [bridgeScript, "--storage-root", storageRoot], {
  input: "{not json",
  encoding: "utf8",
});
assert.equal(invalidJsonResult.status, 2);
assert.match(invalidJsonResult.stderr, /PRINT_BRIDGE_PAYLOAD_INVALID/);

const adapterDispatchResult = dispatchPrintJob({
  printJob: {
    printJobId: "PJ-BRIDGE-CHECK-002",
    printDeviceId: "PRN-BRIDGE-CHECK-001",
    driverMode: "system_printer",
    jobStatus: "queued",
    documentType: "express_ltl_label",
    targetType: "fulfillment",
    targetId: "FUL-BRIDGE-CHECK-002",
    payloadSnapshot: { templateId: "tpl-check-label-2" },
    printDeviceSnapshot: {
      name: "QA Label Printer",
      driverName: "QA 203dpi Driver",
      connectionUri: "system://qa-label-printer",
      settings: { driverMode: "system_printer" },
    },
  },
  systemPrinterEnabled: true,
  systemPrinterAdapterKind: "command_bridge",
  systemPrinterCommand: process.execPath,
  systemPrinterCommandArgs: [
    bridgeScript,
    "--storage-root",
    storageRoot,
    "--print-job-id",
    "{printJobId}",
    "--print-device-id",
    "{printDeviceId}",
    "--print-device-name",
    "{printDeviceName}",
  ],
  allowedPrinterNames: ["PRN-BRIDGE-CHECK-001", "QA Label Printer"],
});
assert.equal(adapterDispatchResult.adapterStatus, "command_sent");
assert.equal(adapterDispatchResult.jobStatus, "sent");
assert.match(adapterDispatchResult.externalJobId, /^PCB-PJ-BRIDGE-CHECK-002-/);
assert.equal(adapterDispatchResult.metadata.commandBridge.exitCode, 0);
assert.doesNotMatch(JSON.stringify(adapterDispatchResult), /QA label payload/);
assert.doesNotMatch(JSON.stringify(adapterDispatchResult), new RegExp(escapeRegExp(bridgeScript)));
const adapterSpoolPath = join(storageRoot, "print-command-bridge", "queued", `${adapterDispatchResult.externalJobId}.json`);
assert.equal(existsSync(adapterSpoolPath), true);

const cupsDirectPayload = {
  ...payload,
  printJobId: "PJ-BRIDGE-CHECK-CUPS-001",
  targetId: "FUL-BRIDGE-CHECK-CUPS-001",
};
const cupsDirectResult = runBridge({
  args: [
    "--storage-root",
    storageRoot,
    "--mode",
    "cups_lp",
    "--cups-command",
    process.execPath,
    "--cups-command-args-json",
    JSON.stringify([fakeCupsScript, "--printer", "{cupsPrinterName}", "--job-title", "{jobTitle}", "{printFile}"]),
    "--cups-allowlist",
    "QA Label Printer",
    "--print-job-id",
    cupsDirectPayload.printJobId,
    "--print-device-id",
    cupsDirectPayload.printDeviceId,
    "--print-device-name",
    cupsDirectPayload.printDeviceName,
  ],
  input: cupsDirectPayload,
});
assert.equal(cupsDirectResult.status, 0);
const cupsDirectOutput = JSON.parse(cupsDirectResult.stdout);
assert.match(cupsDirectOutput.externalJobId, /^PCB-PJ-BRIDGE-CHECK-CUPS-001-/);
assert.equal(cupsDirectOutput.status, "sent");
assert.equal(cupsDirectOutput.mode, "cups_lp");
assert.equal(cupsDirectOutput.cupsJobId, "QA_Label_Printer-101");
assert.doesNotMatch(cupsDirectResult.stdout, /QA label payload/);
assert.doesNotMatch(cupsDirectResult.stdout, new RegExp(escapeRegExp(fakeCupsScript)));

const cupsSentPath = join(storageRoot, "print-command-bridge", "sent", `${cupsDirectOutput.externalJobId}.json`);
assert.equal(existsSync(cupsSentPath), true);
const cupsSentRecord = JSON.parse(readFileSync(cupsSentPath, "utf8"));
assert.equal(cupsSentRecord.status, "sent");
assert.equal(cupsSentRecord.mode, "cups_lp");
assert.equal(cupsSentRecord.cups.submitted, true);
assert.equal(cupsSentRecord.cups.cupsJobId, "QA_Label_Printer-101");
assert.equal(cupsSentRecord.cups.stdoutBytes > 0, true);
assert.match(cupsSentRecord.cups.printFileDigest, /^[0-9a-f]{64}$/);
assert.equal(existsSync(join(storageRoot, "print-command-bridge", "documents", `${cupsDirectOutput.externalJobId}.txt`)), true);

const cupsStatusResult = runBridge({
  args: ["--storage-root", storageRoot, "--action", "status", "--external-job-id", cupsDirectOutput.externalJobId],
});
assert.equal(cupsStatusResult.status, 0);
const cupsStatusOutput = JSON.parse(cupsStatusResult.stdout);
assert.equal(cupsStatusOutput.status, "sent");
assert.equal(cupsStatusOutput.statusDirectory, "sent");
assert.equal(cupsStatusOutput.cupsSubmitted, true);
assert.equal(cupsStatusOutput.cupsJobId, "QA_Label_Printer-101");
assert.doesNotMatch(cupsStatusResult.stdout, /QA label payload/);

const cupsCompleteResult = runBridge({
  args: ["--storage-root", storageRoot, "--action", "complete", "--external-job-id", cupsDirectOutput.externalJobId],
});
assert.equal(cupsCompleteResult.status, 0);
const cupsCompleteOutput = JSON.parse(cupsCompleteResult.stdout);
assert.equal(cupsCompleteOutput.previousStatus, "sent");
assert.equal(cupsCompleteOutput.status, "completed");
assert.equal(cupsCompleteOutput.cupsSubmitted, true);
assert.equal(existsSync(cupsSentPath), false);
assert.equal(existsSync(join(storageRoot, "print-command-bridge", "completed", `${cupsDirectOutput.externalJobId}.json`)), true);

const cupsMissingAllowlistResult = runBridge({
  args: [
    "--storage-root",
    storageRoot,
    "--mode",
    "cups_lp",
    "--cups-command",
    process.execPath,
    "--cups-command-args-json",
    JSON.stringify([fakeCupsScript, "--printer", "{cupsPrinterName}", "{printFile}"]),
    "--print-job-id",
    "PJ-BRIDGE-CHECK-CUPS-NOALLOW",
    "--print-device-id",
    cupsDirectPayload.printDeviceId,
    "--print-device-name",
    cupsDirectPayload.printDeviceName,
  ],
  input: { ...cupsDirectPayload, printJobId: "PJ-BRIDGE-CHECK-CUPS-NOALLOW" },
});
assert.equal(cupsMissingAllowlistResult.status, 6);
assert.match(cupsMissingAllowlistResult.stderr, /PRINT_BRIDGE_CUPS_ALLOWLIST_REQUIRED/);
assert.doesNotMatch(cupsMissingAllowlistResult.stderr, /QA label payload/);

const cupsPreflightResult = runBridge({
  args: [
    "--storage-root",
    storageRoot,
    "--action",
    "cups-preflight",
    "--mode",
    "cups_lp",
    "--cups-printer",
    "QA Label Printer",
    "--cups-allowlist",
    "QA Label Printer",
    "--cups-status-command",
    process.execPath,
    "--cups-status-args-json",
    JSON.stringify([fakeCupsStatusScript, "--printer", "{cupsPrinterName}"]),
  ],
});
assert.equal(cupsPreflightResult.status, 0);
const cupsPreflightOutput = JSON.parse(cupsPreflightResult.stdout);
assert.equal(cupsPreflightOutput.action, "cups-preflight");
assert.equal(cupsPreflightOutput.status, "ok");
assert.equal(cupsPreflightOutput.ready, true);
assert.equal(cupsPreflightOutput.mode, "cups_lp");
assert.equal(cupsPreflightOutput.cupsPrinterAllowed, true);
assert.equal(cupsPreflightOutput.cupsStatusCommandRunnable, true);
assert.equal(cupsPreflightOutput.safeguards?.nonPrinting, true);
assert.equal(cupsPreflightOutput.safeguards?.physicalPrinterCalled, false);
assert.equal(cupsPreflightOutput.safeguards?.payloadRead, false);
assert.equal(cupsPreflightOutput.safeguards?.printFileCreated, false);
assert.doesNotMatch(cupsPreflightResult.stdout, new RegExp(escapeRegExp(fakeCupsStatusScript)));
assert.doesNotMatch(cupsPreflightResult.stdout, /QA label payload/);

const cupsPreflightMissingAllowlistResult = runBridge({
  args: [
    "--storage-root",
    storageRoot,
    "--action",
    "cups-preflight",
    "--mode",
    "cups_lp",
    "--cups-printer",
    "QA Label Printer",
    "--cups-status-command",
    process.execPath,
    "--cups-status-args-json",
    JSON.stringify([fakeCupsStatusScript, "--printer", "{cupsPrinterName}"]),
  ],
});
assert.equal(cupsPreflightMissingAllowlistResult.status, 0);
const cupsPreflightMissingAllowlistOutput = JSON.parse(cupsPreflightMissingAllowlistResult.stdout);
assert.equal(cupsPreflightMissingAllowlistOutput.ready, false);
assert.equal(cupsPreflightMissingAllowlistOutput.errorCode, "PRINT_BRIDGE_CUPS_ALLOWLIST_REQUIRED");
assert.equal(cupsPreflightMissingAllowlistOutput.safeguards?.physicalPrinterCalled, false);
assert.doesNotMatch(cupsPreflightMissingAllowlistResult.stdout, new RegExp(escapeRegExp(fakeCupsStatusScript)));

const adapterCupsDispatchResult = dispatchPrintJob({
  printJob: {
    printJobId: "PJ-BRIDGE-CHECK-CUPS-002",
    printDeviceId: "PRN-BRIDGE-CHECK-001",
    driverMode: "system_printer",
    jobStatus: "queued",
    documentType: "express_ltl_label",
    targetType: "fulfillment",
    targetId: "FUL-BRIDGE-CHECK-CUPS-002",
    payloadSnapshot: { templateId: "tpl-check-label-cups", labelText: "QA CUPS label payload" },
    printDeviceSnapshot: {
      name: "QA Label Printer",
      driverName: "QA 203dpi Driver",
      connectionUri: "system://qa-label-printer",
      settings: { driverMode: "system_printer" },
    },
  },
  systemPrinterEnabled: true,
  systemPrinterAdapterKind: "command_bridge",
  systemPrinterCommand: process.execPath,
  systemPrinterCommandArgs: [
    bridgeScript,
    "--storage-root",
    storageRoot,
    "--mode",
    "cups_lp",
    "--cups-command",
    process.execPath,
    "--cups-command-args-json",
    JSON.stringify([fakeCupsScript, "--printer", "{cupsPrinterName}", "--job-title", "{jobTitle}", "{printFile}"]),
    "--cups-allowlist",
    "QA Label Printer",
    "--print-job-id",
    "{printJobId}",
    "--print-device-id",
    "{printDeviceId}",
    "--print-device-name",
    "{printDeviceName}",
  ],
  allowedPrinterNames: ["PRN-BRIDGE-CHECK-001", "QA Label Printer"],
});
assert.equal(adapterCupsDispatchResult.adapterStatus, "command_sent");
assert.equal(adapterCupsDispatchResult.jobStatus, "sent");
assert.match(adapterCupsDispatchResult.externalJobId, /^PCB-PJ-BRIDGE-CHECK-CUPS-002-/);
assert.equal(adapterCupsDispatchResult.metadata.commandBridge.exitCode, 0);
assert.doesNotMatch(JSON.stringify(adapterCupsDispatchResult), /QA CUPS label payload/);
assert.doesNotMatch(JSON.stringify(adapterCupsDispatchResult), new RegExp(escapeRegExp(fakeCupsScript)));
assert.equal(
  existsSync(join(storageRoot, "print-command-bridge", "sent", `${adapterCupsDispatchResult.externalJobId}.json`)),
  true,
);

const adapterCupsDiagnosticsResult = runCommandBridgeCupsDiagnostics({
  systemPrinterEnabled: true,
  systemPrinterAdapterKind: "command_bridge",
  systemPrinterCommand: process.execPath,
  systemPrinterCommandArgs: [
    bridgeScript,
    "--storage-root",
    storageRoot,
    "--cups-status-command",
    process.execPath,
    "--cups-status-args-json",
    JSON.stringify([fakeCupsStatusScript, "--printer", "{cupsPrinterName}"]),
  ],
  allowedPrinterNames: ["QA Label Printer"],
});
assert.equal(adapterCupsDiagnosticsResult.status, "ok");
assert.equal(adapterCupsDiagnosticsResult.ready, true);
assert.equal(adapterCupsDiagnosticsResult.scope, "non_printing_cups_queue_preflight");
assert.equal(adapterCupsDiagnosticsResult.cupsPrinterAllowed, true);
assert.equal(adapterCupsDiagnosticsResult.cupsStatusCommandRunnable, true);
assert.equal(adapterCupsDiagnosticsResult.safeguards?.nonPrinting, true);
assert.equal(adapterCupsDiagnosticsResult.safeguards?.physicalPrinterCalled, false);
assert.equal(adapterCupsDiagnosticsResult.safeguards?.printFileCreated, false);
assert.doesNotMatch(JSON.stringify(adapterCupsDiagnosticsResult), new RegExp(escapeRegExp(fakeCupsStatusScript)));
assert.doesNotMatch(JSON.stringify(adapterCupsDiagnosticsResult), /QA CUPS label payload/);

console.log("print-command-bridge check passed");

function runBridge({ args, input }) {
  return spawnSync(process.execPath, [bridgeScript, ...args], {
    input: input ? `${JSON.stringify(input)}\n` : "",
    encoding: "utf8",
  });
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
