#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const bridgeScript = join(scriptDir, "print-command-bridge.mjs");

try {
  const options = parseArgs(process.argv.slice(2));
  const printer = cleanText(
    options.printer ||
      options.cupsPrinter ||
      process.env.ERP_PRINT_CUPS_PREFLIGHT_PRINTER ||
      process.env.ERP_PRINT_COMMAND_BRIDGE_CUPS_PRINTER,
  );
  const allowlist = cleanText(
    options.allowlist ||
      options.cupsAllowlist ||
      process.env.ERP_PRINT_CUPS_PREFLIGHT_ALLOWLIST ||
      process.env.ERP_PRINT_COMMAND_BRIDGE_CUPS_ALLOWLIST,
  );
  const statusCommand = cleanText(
    options.statusCommand ||
      process.env.ERP_PRINT_CUPS_PREFLIGHT_STATUS_COMMAND ||
      process.env.ERP_PRINT_COMMAND_BRIDGE_CUPS_STATUS_COMMAND ||
      "lpstat",
  );
  const statusArgsJson = cleanText(
    options.statusArgsJson ||
      process.env.ERP_PRINT_CUPS_PREFLIGHT_STATUS_ARGS_JSON ||
      process.env.ERP_PRINT_COMMAND_BRIDGE_CUPS_STATUS_ARGS_JSON ||
      JSON.stringify(["-p", "{cupsPrinterName}"]),
  );
  const timeoutMs = normalizePositiveInteger(
    options.timeoutMs ||
      process.env.ERP_PRINT_CUPS_PREFLIGHT_TIMEOUT_MS ||
      process.env.ERP_PRINT_COMMAND_BRIDGE_CUPS_STATUS_TIMEOUT_MS,
    5000,
    60000,
  );
  const result = runBridgePreflight({ printer, allowlist, statusCommand, statusArgsJson, timeoutMs });
  const report = buildReport({ printer, allowlist, result });
  if (options.json) {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  } else {
    process.stdout.write(formatReport(report));
  }
  process.exit(report.ready ? 0 : 2);
} catch (error) {
  const message = error?.message || String(error);
  if (process.argv.includes("--json")) {
    process.stdout.write(`${JSON.stringify({ status: "error", ready: false, error: { message } }, null, 2)}\n`);
  } else {
    process.stderr.write(`CUPS queue preflight failed: ${message}\n`);
  }
  process.exit(1);
}

function parseArgs(args) {
  const options = {};
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--json") {
      options.json = true;
      continue;
    }
    if (arg === "--printer" || arg === "--cups-printer") {
      options.printer = readValue(args, index, arg);
      index += 1;
      continue;
    }
    if (arg === "--allowlist" || arg === "--cups-allowlist") {
      options.allowlist = readValue(args, index, arg);
      index += 1;
      continue;
    }
    if (arg === "--status-command") {
      options.statusCommand = readValue(args, index, arg);
      index += 1;
      continue;
    }
    if (arg === "--status-args-json") {
      options.statusArgsJson = readValue(args, index, arg);
      index += 1;
      continue;
    }
    if (arg === "--timeout-ms") {
      options.timeoutMs = readValue(args, index, arg);
      index += 1;
      continue;
    }
    if (arg === "--help" || arg === "-h") {
      process.stdout.write(helpText());
      process.exit(0);
    }
    throw new Error(`Unknown argument: ${arg}`);
  }
  return options;
}

function readValue(args, index, name) {
  const value = args[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${name} requires a value.`);
  return value;
}

function helpText() {
  return [
    "Usage: node scripts/run-cups-queue-preflight.mjs [options]",
    "",
    "Options:",
    "  --printer <name>            CUPS printer name. Defaults to ERP_PRINT_COMMAND_BRIDGE_CUPS_PRINTER.",
    "  --allowlist <names>         Comma-separated CUPS printer allowlist. Required for ready status.",
    "  --status-command <command>  Queue status command. Defaults to lpstat.",
    "  --status-args-json <json>   Status command args. Defaults to [\"-p\",\"{cupsPrinterName}\"].",
    "  --timeout-ms <ms>           Status command timeout, default 5000, max 60000.",
    "  --json                      Print machine-readable JSON.",
    "",
    "Exit codes:",
    "  0  CUPS queue preflight is ready",
    "  1  Runner/bridge error",
    "  2  Preflight ran but queue is still blocked",
    "",
    "This check is non-printing: it does not read order payload, create a print file, or submit a print job.",
  ].join("\n");
}

function runBridgePreflight({ printer, allowlist, statusCommand, statusArgsJson, timeoutMs }) {
  const args = [bridgeScript, "--action", "cups-preflight", "--mode", "cups_lp"];
  if (printer) args.push("--cups-printer", printer);
  if (allowlist) args.push("--cups-allowlist", allowlist);
  if (statusCommand) args.push("--cups-status-command", statusCommand);
  if (statusArgsJson) args.push("--cups-status-args-json", statusArgsJson);
  if (timeoutMs) args.push("--cups-status-timeout-ms", String(timeoutMs));
  const spawned = spawnSync(process.execPath, args, {
    cwd: process.cwd(),
    encoding: "utf8",
    timeout: timeoutMs + 2000,
    maxBuffer: 1024 * 1024,
    shell: false,
  });
  if (spawned.error) {
    const timedOut = spawned.error.code === "ETIMEDOUT";
    throw new Error(timedOut ? "CUPS queue preflight timed out." : "CUPS queue preflight bridge could not be started.");
  }
  if (spawned.status !== 0) {
    throw new Error("CUPS queue preflight bridge exited before returning a readiness report.");
  }
  const stdout = cleanText(spawned.stdout);
  if (!stdout) throw new Error("CUPS queue preflight bridge returned an empty report.");
  try {
    return JSON.parse(stdout);
  } catch {
    throw new Error("CUPS queue preflight bridge returned invalid JSON.");
  }
}

function buildReport({ printer, allowlist, result = {} }) {
  const ready = result.ready === true;
  const safeguards = result.safeguards && typeof result.safeguards === "object" ? result.safeguards : {};
  return {
    status: ready ? "ready" : "blocked",
    ready,
    checkedAt: cleanText(result.checkedAt) || new Date().toISOString(),
    scope: cleanText(result.scope || "non_printing_cups_queue_preflight"),
    printer: cleanText(printer || result.cupsPrinterName),
    allowlistConfigured: Boolean(result.cupsAllowlistConfigured || cleanList(allowlist).length > 0),
    cupsPrinterConfigured: Boolean(result.cupsPrinterConfigured),
    cupsPrinterAllowed: Boolean(result.cupsPrinterAllowed),
    cupsStatusCommandConfigured: Boolean(result.cupsStatusCommandConfigured),
    cupsStatusCommandRunnable: Boolean(result.cupsStatusCommandRunnable),
    stdoutBytes: numberOrZero(result.stdoutBytes),
    stderrBytes: numberOrZero(result.stderrBytes),
    errorCode: cleanText(result.errorCode),
    message: cleanText(result.message),
    safeguards: {
      nonPrinting: safeguards.nonPrinting !== false,
      physicalPrinterCalled: Boolean(safeguards.physicalPrinterCalled),
      payloadRead: Boolean(safeguards.payloadRead),
      printFileCreated: Boolean(safeguards.printFileCreated),
      commandValueExposed: Boolean(safeguards.commandValueExposed),
      argsValueExposed: Boolean(safeguards.argsValueExposed),
      stdoutExposed: Boolean(safeguards.stdoutExposed),
      stderrExposed: Boolean(safeguards.stderrExposed),
    },
    nextActions: buildNextActions(result),
  };
}

function buildNextActions(result = {}) {
  if (result.ready === true) {
    return [
      "Continue with physical sample print, paper alignment, barcode scan, void/reprint, and operator acceptance.",
      "Record the passing CUPS queue evidence inside the ERP V1 print readiness gate.",
    ];
  }
  const code = cleanText(result.errorCode);
  if (code === "PRINT_BRIDGE_CUPS_ALLOWLIST_REQUIRED") return ["Configure a CUPS printer allowlist before field use."];
  if (code === "PRINT_BRIDGE_CUPS_PRINTER_REQUIRED") return ["Pass --printer or configure a single allowed CUPS printer."];
  if (code === "PRINT_BRIDGE_CUPS_PRINTER_NOT_ALLOWED") return ["Add the target CUPS printer to the allowlist or select an allowed queue."];
  if (code === "PRINT_BRIDGE_CUPS_STATUS_COMMAND_REQUIRED") return ["Configure a CUPS status command such as lpstat."];
  if (code) return ["Check the local CUPS queue, status-command permissions, and printer name."];
  return ["Check the CUPS queue preflight result and local printer configuration."];
}

function formatReport(report) {
  const lines = [
    `CUPS queue preflight: ${report.ready ? "READY" : "BLOCKED"}`,
    `Printer configured: ${yesNo(report.cupsPrinterConfigured)}`,
    `Printer allowed: ${yesNo(report.cupsPrinterAllowed)}`,
    `Status command runnable: ${yesNo(report.cupsStatusCommandRunnable)}`,
    `stdout/stderr bytes: ${report.stdoutBytes}/${report.stderrBytes}`,
    `No physical print: ${yesNo(!report.safeguards.physicalPrinterCalled && !report.safeguards.printFileCreated)}`,
  ];
  if (!report.ready) {
    lines.push(`Blocker: ${report.errorCode || "cups_queue_preflight_blocked"}`);
    if (report.message) lines.push(`Detail: ${report.message}`);
  }
  if (report.nextActions.length) {
    lines.push("", "Next actions:");
    for (const action of report.nextActions) lines.push(`- ${action}`);
  }
  lines.push("");
  return lines.join("\n");
}

function cleanText(value) {
  return String(value ?? "").trim();
}

function cleanList(value) {
  return cleanText(value)
    .split(",")
    .map((item) => cleanText(item))
    .filter(Boolean);
}

function normalizePositiveInteger(value, fallback, max) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(Math.floor(parsed), max);
}

function numberOrZero(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return Math.trunc(parsed);
}

function yesNo(value) {
  return value ? "yes" : "no";
}
