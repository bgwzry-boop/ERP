import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { join } from "node:path";

const runnerScript = join(process.cwd(), "scripts", "run-cups-queue-preflight.mjs");
const fakeCupsStatusScript = join(process.cwd(), "scripts", "fake-cups-lpstat.mjs");
const fakeArgsJson = JSON.stringify([fakeCupsStatusScript, "--printer", "{cupsPrinterName}"]);
const fakeFailArgsJson = JSON.stringify([fakeCupsStatusScript, "--printer", "{cupsPrinterName}", "--fail"]);

const readyRun = runPreflight({
  args: [
    "--printer",
    "QA Label Printer",
    "--allowlist",
    "QA Label Printer",
    "--status-command",
    process.execPath,
    "--status-args-json",
    fakeArgsJson,
    "--json",
  ],
});
assert.equal(readyRun.status, 0, runFailureMessage("ready CUPS queue preflight should exit 0", readyRun));
const readyReport = JSON.parse(readyRun.stdout);
assert.equal(readyReport.status, "ready");
assert.equal(readyReport.ready, true);
assert.equal(readyReport.scope, "non_printing_cups_queue_preflight");
assert.equal(readyReport.cupsPrinterConfigured, true);
assert.equal(readyReport.cupsPrinterAllowed, true);
assert.equal(readyReport.cupsStatusCommandRunnable, true);
assert.equal(readyReport.stdoutBytes > 0, true);
assert.equal(readyReport.safeguards.nonPrinting, true);
assert.equal(readyReport.safeguards.physicalPrinterCalled, false);
assert.equal(readyReport.safeguards.printFileCreated, false);
assertNoSensitiveOutput(readyRun.stdout + readyRun.stderr);

const textRun = runPreflight({
  args: [
    "--printer",
    "QA Label Printer",
    "--allowlist",
    "QA Label Printer",
    "--status-command",
    process.execPath,
    "--status-args-json",
    fakeArgsJson,
  ],
});
assert.equal(textRun.status, 0, runFailureMessage("ready CUPS text preflight should exit 0", textRun));
assert.match(textRun.stdout, /CUPS queue preflight: READY/);
assert.match(textRun.stdout, /No physical print: yes/);
assertNoSensitiveOutput(textRun.stdout + textRun.stderr);

const missingAllowlistRun = runPreflight({
  args: [
    "--printer",
    "QA Label Printer",
    "--status-command",
    process.execPath,
    "--status-args-json",
    fakeArgsJson,
    "--json",
  ],
});
assert.equal(missingAllowlistRun.status, 2, runFailureMessage("missing allowlist should exit 2", missingAllowlistRun));
const missingAllowlistReport = JSON.parse(missingAllowlistRun.stdout);
assert.equal(missingAllowlistReport.status, "blocked");
assert.equal(missingAllowlistReport.ready, false);
assert.equal(missingAllowlistReport.errorCode, "PRINT_BRIDGE_CUPS_ALLOWLIST_REQUIRED");
assert.equal(missingAllowlistReport.safeguards.physicalPrinterCalled, false);
assertNoSensitiveOutput(missingAllowlistRun.stdout + missingAllowlistRun.stderr);

const failingQueueRun = runPreflight({
  args: [
    "--printer",
    "QA Label Printer",
    "--allowlist",
    "QA Label Printer",
    "--status-command",
    process.execPath,
    "--status-args-json",
    fakeFailArgsJson,
    "--json",
  ],
});
assert.equal(failingQueueRun.status, 2, runFailureMessage("failing queue should exit 2", failingQueueRun));
const failingQueueReport = JSON.parse(failingQueueRun.stdout);
assert.equal(failingQueueReport.status, "blocked");
assert.equal(failingQueueReport.ready, false);
assert.equal(failingQueueReport.cupsStatusCommandRunnable, true);
assert.equal(failingQueueReport.errorCode, "PRINT_BRIDGE_CUPS_STATUS_COMMAND_FAILED");
assert.equal(failingQueueReport.safeguards.physicalPrinterCalled, false);
assertNoSensitiveOutput(failingQueueRun.stdout + failingQueueRun.stderr);

console.log("CUPS queue preflight runner check passed: ready, blocked, failing status command, redaction, and exit codes are covered.");

function runPreflight({ args }) {
  return spawnSync(process.execPath, [runnerScript, ...args], {
    cwd: process.cwd(),
    encoding: "utf8",
    env: {
      ...process.env,
      ERP_PRINT_CUPS_PREFLIGHT_PRINTER: "",
      ERP_PRINT_COMMAND_BRIDGE_CUPS_PRINTER: "",
      ERP_PRINT_CUPS_PREFLIGHT_ALLOWLIST: "",
      ERP_PRINT_COMMAND_BRIDGE_CUPS_ALLOWLIST: "",
      ERP_PRINT_CUPS_PREFLIGHT_STATUS_COMMAND: "",
      ERP_PRINT_COMMAND_BRIDGE_CUPS_STATUS_COMMAND: "",
      ERP_PRINT_CUPS_PREFLIGHT_STATUS_ARGS_JSON: "",
      ERP_PRINT_COMMAND_BRIDGE_CUPS_STATUS_ARGS_JSON: "",
    },
  });
}

function assertNoSensitiveOutput(output) {
  assert.doesNotMatch(output, new RegExp(escapeRegExp(process.execPath)), "preflight output leaked node command path");
  assert.doesNotMatch(output, new RegExp(escapeRegExp(fakeCupsStatusScript)), "preflight output leaked fake CUPS command path");
  assert.doesNotMatch(output, /printer queue is unavailable/, "preflight output leaked stderr content");
}

function runFailureMessage(message, result) {
  return `${message}; actual=${result.status}; stdout=${result.stdout || "<empty>"}; stderr=${result.stderr || "<empty>"}`;
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
