#!/usr/bin/env node
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const supportedModes = new Set(["spool_only", "cups_lp"]);
const supportedActions = new Set(["submit", "status", "complete", "fail", "cancel", "cups-preflight"]);
const terminalStatuses = new Set(["completed", "failed", "canceled"]);
const statusDirectories = ["queued", "processing", "sent", "completed", "failed", "canceled"];

try {
  const options = parseArgs(process.argv.slice(2));
  const action = normalizeAction(options.action);
  const mode = String(options.mode ?? process.env.ERP_PRINT_COMMAND_BRIDGE_MODE ?? "spool_only").trim();
  if (!supportedModes.has(mode)) {
    fail("PRINT_BRIDGE_MODE_UNSUPPORTED", `Unsupported print bridge mode: ${mode}`);
  }
  const { storageRoot, spoolRoot } = resolveStorageRoots(options);
  ensureInsideStorageRoot({ storageRoot, spoolRoot });
  if (action === "cups-preflight") {
    const preflightResult = runCupsPreflight({ options, mode });
    process.stdout.write(`${JSON.stringify(preflightResult)}\n`);
  } else if (action !== "submit") {
    const lifecycleResult = runLifecycleAction({ action, options, spoolRoot });
    process.stdout.write(`${JSON.stringify(lifecycleResult)}\n`);
  } else {
    const input = readJsonStdin();
    const normalized = normalizeBridgeInput({ input, options });
    const bridgeJob = buildBridgeJob({ normalized, mode });
    const submitResult =
      mode === "cups_lp"
        ? submitCupsLpBridgeJob({ bridgeJob, normalized, options, spoolRoot })
        : submitSpoolOnlyBridgeJob({ bridgeJob, spoolRoot });
    process.stdout.write(
      `${JSON.stringify({
        externalJobId: bridgeJob.externalJobId,
        bridgeJobId: bridgeJob.bridgeJobId,
        status: submitResult.status,
        mode,
        ...(submitResult.cupsJobId ? { cupsJobId: submitResult.cupsJobId } : {}),
      })}\n`,
    );
    if (!existsSync(submitResult.spoolFile)) {
      fail("PRINT_BRIDGE_SPOOL_WRITE_FAILED", "Print bridge spool file was not created.");
    }
  }
} catch (error) {
  if (error?.isBridgeError) {
    process.stderr.write(`${JSON.stringify({ error: true, code: error.code, message: error.message })}\n`);
    process.exit(error.exitCode);
  }
  process.stderr.write(
    `${JSON.stringify({
      error: true,
      code: "PRINT_BRIDGE_UNEXPECTED_ERROR",
      message: "Print command bridge failed unexpectedly.",
    })}\n`,
  );
  process.exit(1);
}

function resolveStorageRoots(options) {
  const storageRoot = resolve(
    String(options.storageRoot ?? process.env.ERP_LOCAL_STORAGE_DIR ?? join(process.cwd(), ".erp-local-storage")),
  );
  const spoolRoot = resolve(
    String(options.spoolDir ?? process.env.ERP_PRINT_COMMAND_BRIDGE_SPOOL_DIR ?? join(storageRoot, "print-command-bridge")),
  );
  return { storageRoot, spoolRoot };
}

function runLifecycleAction({ action, options, spoolRoot }) {
  const externalJobId = normalizeRequiredId(
    options.externalJobId ?? options.bridgeJobId,
    "PRINT_BRIDGE_EXTERNAL_JOB_ID_REQUIRED",
  );
  const located = readBridgeJobByExternalJobId({ spoolRoot, externalJobId });
  if (!located) {
    fail("PRINT_BRIDGE_JOB_NOT_FOUND", "Print bridge job was not found in the spool lifecycle directories.", 4);
  }
  if (action === "status") {
    return buildBridgeJobSummary(located.bridgeJob, {
      action,
      previousStatus: located.bridgeJob.status,
      statusDirectory: located.statusDirectory,
    });
  }
  const nextStatus = getLifecycleNextStatus(action);
  if (terminalStatuses.has(String(located.bridgeJob.status ?? "").trim()) && located.bridgeJob.status !== nextStatus) {
    fail("PRINT_BRIDGE_TERMINAL_STATUS_LOCKED", "Terminal print bridge jobs cannot be moved to another status.", 5);
  }
  const now = new Date().toISOString();
  const updatedBridgeJob = {
    ...located.bridgeJob,
    status: nextStatus,
    updatedAt: now,
    ...(nextStatus === "completed" ? { completedAt: now } : {}),
    ...(nextStatus === "failed"
      ? {
          failedAt: now,
          errorCode: String(options.errorCode ?? "PRINT_BRIDGE_REPORTED_FAILED").trim(),
          errorMessage: sanitizeLifecycleMessage(options.message ?? options.errorMessage),
        }
      : {}),
    ...(nextStatus === "canceled"
      ? {
          canceledAt: now,
          cancelReason: sanitizeLifecycleMessage(options.reason ?? options.message),
        }
      : {}),
  };
  const spoolFile = writeBridgeJob({ spoolRoot, bridgeJob: updatedBridgeJob, statusDirectory: nextStatus });
  if (located.path !== spoolFile && existsSync(located.path)) {
    unlinkSync(located.path);
  }
  return buildBridgeJobSummary(updatedBridgeJob, {
    action,
    previousStatus: located.bridgeJob.status,
    statusDirectory: nextStatus,
  });
}

function runCupsPreflight({ options, mode }) {
  const checkedAt = new Date().toISOString();
  const cupsAllowlist = normalizeStringList(options.cupsAllowlist ?? process.env.ERP_PRINT_COMMAND_BRIDGE_CUPS_ALLOWLIST);
  const cupsPrinterName = resolveCupsPrinterNameForPreflight({ options, cupsAllowlist });
  const command = String(
    options.cupsStatusCommand ?? process.env.ERP_PRINT_COMMAND_BRIDGE_CUPS_STATUS_COMMAND ?? "lpstat",
  ).trim();
  const base = {
    action: "cups-preflight",
    status: "failed",
    ready: false,
    mode,
    checkedAt,
    scope: "non_printing_cups_queue_preflight",
    cupsAllowlistConfigured: cupsAllowlist.length > 0,
    cupsPrinterConfigured: Boolean(cupsPrinterName),
    cupsPrinterAllowed: false,
    cupsStatusCommandConfigured: Boolean(command),
    cupsStatusCommandRunnable: false,
    exitCode: null,
    signal: "",
    stdoutBytes: 0,
    stderrBytes: 0,
    errorCode: "",
    message: "",
    safeguards: {
      nonPrinting: true,
      physicalPrinterCalled: false,
      commandValueExposed: false,
      argsValueExposed: false,
      stdoutExposed: false,
      stderrExposed: false,
      payloadRead: false,
      printFileCreated: false,
    },
  };
  if (mode !== "cups_lp") {
    return {
      ...base,
      errorCode: "PRINT_BRIDGE_CUPS_PREFLIGHT_MODE_REQUIRED",
      message: "CUPS queue preflight requires cups_lp mode.",
    };
  }
  if (!cupsAllowlist.length) {
    return {
      ...base,
      errorCode: "PRINT_BRIDGE_CUPS_ALLOWLIST_REQUIRED",
      message: "CUPS printer allowlist is required for CUPS queue preflight.",
    };
  }
  if (!cupsPrinterName) {
    return {
      ...base,
      errorCode: "PRINT_BRIDGE_CUPS_PRINTER_REQUIRED",
      message: "CUPS queue preflight requires a CUPS printer name.",
    };
  }
  const cupsPrinterAllowed = isAllowedValue(cupsPrinterName, cupsAllowlist);
  if (!cupsPrinterAllowed) {
    return {
      ...base,
      cupsPrinterAllowed,
      errorCode: "PRINT_BRIDGE_CUPS_PRINTER_NOT_ALLOWED",
      message: "CUPS printer is outside the bridge allowlist.",
    };
  }
  if (!command) {
    return {
      ...base,
      cupsPrinterAllowed,
      errorCode: "PRINT_BRIDGE_CUPS_STATUS_COMMAND_REQUIRED",
      message: "CUPS status command is not configured.",
    };
  }
  const args = renderCupsStatusCommandArgs({
    template: options.cupsStatusArgsJson ?? process.env.ERP_PRINT_COMMAND_BRIDGE_CUPS_STATUS_ARGS_JSON,
    cupsPrinterName,
  });
  const result = runCupsStatusCommand({
    command,
    args,
    timeoutMs: normalizePositiveInteger(
      options.cupsStatusTimeoutMs ?? process.env.ERP_PRINT_COMMAND_BRIDGE_CUPS_STATUS_TIMEOUT_MS,
      5000,
      60000,
    ),
  });
  const ready = result.ok;
  return {
    ...base,
    status: ready ? "ok" : "failed",
    ready,
    cupsPrinterAllowed,
    cupsStatusCommandRunnable: result.exitCode !== null,
    exitCode: result.exitCode,
    signal: result.signal,
    stdoutBytes: byteLength(result.stdout),
    stderrBytes: byteLength(result.stderr),
    errorCode: result.errorCode,
    message: ready ? "CUPS queue preflight succeeded." : result.message,
  };
}

function readJsonStdin() {
  const raw = readFileSync(0, "utf8").trim();
  if (!raw) fail("PRINT_BRIDGE_STDIN_REQUIRED", "Print bridge requires JSON payload on stdin.");
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      fail("PRINT_BRIDGE_PAYLOAD_INVALID", "Print bridge stdin payload must be a JSON object.");
    }
    return parsed;
  } catch {
    fail("PRINT_BRIDGE_PAYLOAD_INVALID", "Print bridge stdin payload must be valid JSON.");
  }
}

function normalizeBridgeInput({ input, options }) {
  const printJobId = normalizeRequiredId(input.printJobId ?? options.printJobId, "PRINT_BRIDGE_JOB_ID_REQUIRED");
  const printDeviceId = normalizeRequiredId(
    input.printDeviceId ?? options.printDeviceId,
    "PRINT_BRIDGE_DEVICE_ID_REQUIRED",
  );
  const cliJobId = normalizeOptionalId(options.printJobId);
  const cliDeviceId = normalizeOptionalId(options.printDeviceId);
  if (cliJobId && input.printJobId && cliJobId !== printJobId) {
    fail("PRINT_BRIDGE_JOB_ID_MISMATCH", "CLI printJobId does not match stdin printJobId.");
  }
  if (cliDeviceId && input.printDeviceId && cliDeviceId !== printDeviceId) {
    fail("PRINT_BRIDGE_DEVICE_ID_MISMATCH", "CLI printDeviceId does not match stdin printDeviceId.");
  }
  return {
    printJobId,
    printDeviceId,
    printDeviceName: String(input.printDeviceName ?? options.printDeviceName ?? "").trim(),
    driverName: String(input.driverName ?? "").trim(),
    connectionUri: String(input.connectionUri ?? "").trim(),
    documentType: String(input.documentType ?? "").trim(),
    targetType: String(input.targetType ?? "").trim(),
    targetId: String(input.targetId ?? "").trim(),
    payloadSnapshot: normalizeObject(input.payloadSnapshot),
    printDeviceSnapshot: normalizeObject(input.printDeviceSnapshot),
  };
}

function buildBridgeJob({ normalized, mode }) {
  const createdAt = new Date().toISOString();
  const digest = createHash("sha256").update(JSON.stringify(normalized)).digest("hex");
  const safeJobId = safeFileSegment(normalized.printJobId);
  const externalJobId = `PCB-${safeJobId}-${digest.slice(0, 10)}`;
  return {
    bridgeJobId: externalJobId,
    externalJobId,
    status: "queued",
    mode,
    createdAt,
    payloadDigest: digest,
    printJobId: normalized.printJobId,
    printDeviceId: normalized.printDeviceId,
    printDeviceName: normalized.printDeviceName,
    driverName: normalized.driverName,
    connectionUri: normalized.connectionUri,
    documentType: normalized.documentType,
    targetType: normalized.targetType,
    targetId: normalized.targetId,
    payloadSnapshot: normalized.payloadSnapshot,
    printDeviceSnapshot: normalized.printDeviceSnapshot,
  };
}

function submitSpoolOnlyBridgeJob({ bridgeJob, spoolRoot }) {
  const spoolFile = writeBridgeJob({ spoolRoot, bridgeJob, statusDirectory: "queued" });
  return {
    status: "queued",
    spoolFile,
  };
}

function submitCupsLpBridgeJob({ bridgeJob, normalized, options, spoolRoot }) {
  const cupsPrinterName = resolveCupsPrinterName({ normalized, options });
  const cupsAllowlist = normalizeStringList(options.cupsAllowlist ?? process.env.ERP_PRINT_COMMAND_BRIDGE_CUPS_ALLOWLIST);
  if (!cupsAllowlist.length) {
    const failedJob = buildFailedBridgeJob({
      bridgeJob,
      errorCode: "PRINT_BRIDGE_CUPS_ALLOWLIST_REQUIRED",
      message: "CUPS printer allowlist is required for cups_lp mode.",
    });
    const spoolFile = writeBridgeJob({ spoolRoot, bridgeJob: failedJob, statusDirectory: "failed" });
    fail("PRINT_BRIDGE_CUPS_ALLOWLIST_REQUIRED", "CUPS printer allowlist is required for cups_lp mode.", 6, { spoolFile });
  }
  if (!isAllowedValue(cupsPrinterName, cupsAllowlist)) {
    const failedJob = buildFailedBridgeJob({
      bridgeJob,
      errorCode: "PRINT_BRIDGE_CUPS_PRINTER_NOT_ALLOWED",
      message: "CUPS printer is outside the bridge allowlist.",
    });
    const spoolFile = writeBridgeJob({ spoolRoot, bridgeJob: failedJob, statusDirectory: "failed" });
    fail("PRINT_BRIDGE_CUPS_PRINTER_NOT_ALLOWED", "CUPS printer is outside the bridge allowlist.", 6, { spoolFile });
  }

  const queuedFile = writeBridgeJob({ spoolRoot, bridgeJob, statusDirectory: "queued" });
  const printable = buildPrintableText({ normalized });
  const printFile = writeCupsPrintFile({ spoolRoot, bridgeJob, printable });
  const command = String(options.cupsCommand ?? process.env.ERP_PRINT_COMMAND_BRIDGE_CUPS_COMMAND ?? "lp").trim();
  const commandArgs = renderCupsCommandArgs({
    template: options.cupsCommandArgsJson ?? process.env.ERP_PRINT_COMMAND_BRIDGE_CUPS_ARGS_JSON,
    bridgeJob,
    normalized,
    cupsPrinterName,
    printFile,
  });
  const result = runCupsCommand({
    command,
    args: commandArgs,
    timeoutMs: normalizePositiveInteger(
      options.cupsTimeoutMs ?? process.env.ERP_PRINT_COMMAND_BRIDGE_CUPS_TIMEOUT_MS,
      15000,
      120000,
    ),
  });

  if (!result.ok) {
    const failedJob = buildFailedBridgeJob({
      bridgeJob,
      errorCode: result.errorCode,
      message: result.message,
      extra: {
        cups: {
          printerName: cupsPrinterName,
          submitted: false,
          exitCode: result.exitCode,
          signal: result.signal,
          stdoutBytes: byteLength(result.stdout),
          stderrBytes: byteLength(result.stderr),
          printFileDigest: createHash("sha256").update(printable).digest("hex"),
        },
      },
    });
    const failedFile = writeBridgeJob({ spoolRoot, bridgeJob: failedJob, statusDirectory: "failed" });
    if (existsSync(queuedFile)) unlinkSync(queuedFile);
    fail(result.errorCode, result.message, 6, { spoolFile: failedFile });
  }

  const now = new Date().toISOString();
  const cupsJobId = extractCupsJobId(result.stdout) || `CUPS-${bridgeJob.externalJobId}`;
  const sentJob = {
    ...bridgeJob,
    status: "sent",
    updatedAt: now,
    sentAt: now,
    cups: {
      printerName: cupsPrinterName,
      submitted: true,
      cupsJobId,
      exitCode: result.exitCode,
      signal: result.signal,
      stdoutBytes: byteLength(result.stdout),
      stderrBytes: byteLength(result.stderr),
      printFileDigest: createHash("sha256").update(printable).digest("hex"),
    },
  };
  const sentFile = writeBridgeJob({ spoolRoot, bridgeJob: sentJob, statusDirectory: "sent" });
  if (existsSync(queuedFile)) unlinkSync(queuedFile);
  return {
    status: "sent",
    spoolFile: sentFile,
    cupsJobId,
  };
}

function writeBridgeJob({ spoolRoot, bridgeJob, statusDirectory }) {
  const directory = join(spoolRoot, statusDirectory);
  mkdirSync(directory, { recursive: true });
  const spoolFile = join(directory, `${safeFileSegment(bridgeJob.externalJobId)}.json`);
  writeFileSync(spoolFile, `${JSON.stringify(bridgeJob, null, 2)}\n`, "utf8");
  return spoolFile;
}

function readBridgeJobByExternalJobId({ spoolRoot, externalJobId }) {
  const safeExternalJobId = safeFileSegment(externalJobId);
  for (const statusDirectory of statusDirectories) {
    const path = join(spoolRoot, statusDirectory, `${safeExternalJobId}.json`);
    if (!existsSync(path)) continue;
    try {
      const bridgeJob = JSON.parse(readFileSync(path, "utf8"));
      return { bridgeJob, path, statusDirectory };
    } catch {
      fail("PRINT_BRIDGE_JOB_INVALID", "Print bridge job file is not valid JSON.", 3);
    }
  }
  return null;
}

function buildBridgeJobSummary(bridgeJob, { action, previousStatus, statusDirectory }) {
  return {
    externalJobId: bridgeJob.externalJobId,
    bridgeJobId: bridgeJob.bridgeJobId,
    action,
    previousStatus,
    status: bridgeJob.status,
    statusDirectory,
    mode: bridgeJob.mode,
    printJobId: bridgeJob.printJobId,
    printDeviceId: bridgeJob.printDeviceId,
    createdAt: bridgeJob.createdAt,
    updatedAt: bridgeJob.updatedAt ?? "",
    completedAt: bridgeJob.completedAt ?? "",
    failedAt: bridgeJob.failedAt ?? "",
    canceledAt: bridgeJob.canceledAt ?? "",
    errorCode: bridgeJob.errorCode ?? "",
    errorMessage: bridgeJob.errorMessage ?? "",
    cancelReason: bridgeJob.cancelReason ?? "",
    cupsJobId: bridgeJob.cups?.cupsJobId ?? "",
    cupsSubmitted: Boolean(bridgeJob.cups?.submitted),
    payloadDigest: bridgeJob.payloadDigest,
  };
}

function parseArgs(argv) {
  const result = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith("--")) continue;
    const key = arg.slice(2).replace(/-([a-z])/g, (_, char) => char.toUpperCase());
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) {
      result[key] = true;
      continue;
    }
    result[key] = next;
    index += 1;
  }
  return result;
}

function normalizeAction(value) {
  const action = String(value ?? "submit").trim().toLowerCase();
  if (!supportedActions.has(action)) {
    fail("PRINT_BRIDGE_ACTION_UNSUPPORTED", `Unsupported print bridge action: ${action}`);
  }
  return action;
}

function getLifecycleNextStatus(action) {
  if (action === "complete") return "completed";
  if (action === "fail") return "failed";
  if (action === "cancel") return "canceled";
  return "queued";
}

function ensureInsideStorageRoot({ storageRoot, spoolRoot }) {
  const root = storageRoot.endsWith("/") ? storageRoot : `${storageRoot}/`;
  if (spoolRoot !== storageRoot && !spoolRoot.startsWith(root)) {
    fail("PRINT_BRIDGE_SPOOL_OUTSIDE_STORAGE_ROOT", "Print bridge spool directory must stay inside storage root.");
  }
}

function writeCupsPrintFile({ spoolRoot, bridgeJob, printable }) {
  const directory = join(spoolRoot, "documents");
  mkdirSync(directory, { recursive: true });
  const file = join(directory, `${safeFileSegment(bridgeJob.externalJobId)}.txt`);
  writeFileSync(file, printable, "utf8");
  return file;
}

function resolveCupsPrinterName({ normalized, options }) {
  const value =
    options.cupsPrinter ??
    process.env.ERP_PRINT_COMMAND_BRIDGE_CUPS_PRINTER ??
    normalized.printDeviceSnapshot?.settings?.cupsPrinterName ??
    normalized.printDeviceSnapshot?.cupsPrinterName ??
    normalized.printDeviceName ??
    normalized.printDeviceId;
  const printerName = String(value ?? "").trim();
  if (!printerName) fail("PRINT_BRIDGE_CUPS_PRINTER_REQUIRED", "cups_lp mode requires a CUPS printer name.", 6);
  return printerName;
}

function resolveCupsPrinterNameForPreflight({ options, cupsAllowlist }) {
  const explicit = String(options.cupsPrinter ?? process.env.ERP_PRINT_COMMAND_BRIDGE_CUPS_PRINTER ?? "").trim();
  if (explicit) return explicit;
  return cupsAllowlist.length === 1 ? cupsAllowlist[0] : "";
}

function runCupsCommand({ command, args, timeoutMs }) {
  if (!command) {
    return {
      ok: false,
      exitCode: null,
      signal: "",
      stdout: "",
      stderr: "",
      errorCode: "PRINT_BRIDGE_CUPS_COMMAND_REQUIRED",
      message: "CUPS command is not configured.",
    };
  }
  const result = spawnSync(command, args, {
    encoding: "utf8",
    timeout: timeoutMs,
    maxBuffer: 1024 * 1024,
    shell: false,
  });
  if (result.error) {
    const timedOut = result.error.code === "ETIMEDOUT";
    return {
      ok: false,
      exitCode: null,
      signal: String(result.signal ?? "").trim(),
      stdout: String(result.stdout ?? ""),
      stderr: String(result.stderr ?? ""),
      errorCode: timedOut ? "PRINT_BRIDGE_CUPS_TIMEOUT" : "PRINT_BRIDGE_CUPS_COMMAND_FAILED",
      message: timedOut ? "CUPS lp command timed out." : "CUPS lp command could not be started.",
    };
  }
  const exitCode = normalizeOptionalInteger(result.status ?? result.exitCode ?? result.code, 0);
  return {
    ok: exitCode === 0,
    exitCode,
    signal: String(result.signal ?? "").trim(),
    stdout: String(result.stdout ?? ""),
    stderr: String(result.stderr ?? ""),
    errorCode: exitCode === 0 ? "" : "PRINT_BRIDGE_CUPS_COMMAND_FAILED",
    message: exitCode === 0 ? "CUPS lp command accepted the job." : `CUPS lp command exited with code ${exitCode}.`,
  };
}

function runCupsStatusCommand({ command, args, timeoutMs }) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    timeout: timeoutMs,
    maxBuffer: 1024 * 1024,
    shell: false,
  });
  if (result.error) {
    const timedOut = result.error.code === "ETIMEDOUT";
    return {
      ok: false,
      exitCode: null,
      signal: String(result.signal ?? "").trim(),
      stdout: String(result.stdout ?? ""),
      stderr: String(result.stderr ?? ""),
      errorCode: timedOut ? "PRINT_BRIDGE_CUPS_STATUS_TIMEOUT" : "PRINT_BRIDGE_CUPS_STATUS_COMMAND_FAILED",
      message: timedOut ? "CUPS status command timed out." : "CUPS status command could not be started.",
    };
  }
  const exitCode = normalizeOptionalInteger(result.status ?? result.exitCode ?? result.code, 0);
  return {
    ok: exitCode === 0,
    exitCode,
    signal: String(result.signal ?? "").trim(),
    stdout: String(result.stdout ?? ""),
    stderr: String(result.stderr ?? ""),
    errorCode: exitCode === 0 ? "" : "PRINT_BRIDGE_CUPS_STATUS_COMMAND_FAILED",
    message: exitCode === 0 ? "CUPS status command completed." : `CUPS status command exited with code ${exitCode}.`,
  };
}

function renderCupsCommandArgs({ template, bridgeJob, normalized, cupsPrinterName, printFile }) {
  const args = normalizeJsonStringList(template, [
    "-d",
    "{cupsPrinterName}",
    "-t",
    "{jobTitle}",
    "{printFile}",
  ]);
  const jobTitle = buildCupsJobTitle({ bridgeJob, normalized });
  return args.map((arg) =>
    String(arg)
      .replaceAll("{cupsPrinterName}", cupsPrinterName)
      .replaceAll("{printFile}", printFile)
      .replaceAll("{jobTitle}", jobTitle)
      .replaceAll("{printJobId}", normalized.printJobId)
      .replaceAll("{printDeviceId}", normalized.printDeviceId)
      .replaceAll("{printDeviceName}", normalized.printDeviceName)
      .replaceAll("{documentType}", normalized.documentType)
      .replaceAll("{targetId}", normalized.targetId),
  );
}

function renderCupsStatusCommandArgs({ template, cupsPrinterName }) {
  const args = normalizeJsonStringList(template, ["-p", "{cupsPrinterName}"]);
  return args.map((arg) => String(arg).replaceAll("{cupsPrinterName}", cupsPrinterName));
}

function buildCupsJobTitle({ bridgeJob, normalized }) {
  const base = ["ERP", normalized.documentType || "print", normalized.printJobId || bridgeJob.externalJobId]
    .filter(Boolean)
    .join(" ");
  return base.replace(/[\r\n\t]/g, " ").slice(0, 120);
}

function buildPrintableText({ normalized }) {
  const payload = normalized.payloadSnapshot ?? {};
  const explicit = [
    payload.printText,
    payload.renderedText,
    payload.documentText,
    payload.labelText,
    payload.plainText,
  ]
    .map((item) => String(item ?? "").trim())
    .find(Boolean);
  if (explicit) return ensureTrailingNewline(explicit);
  const fields = payload.fields && typeof payload.fields === "object" ? payload.fields : {};
  const lines = [
    "ERP PRINT JOB",
    `Print Job: ${normalized.printJobId}`,
    `Device: ${normalized.printDeviceName || normalized.printDeviceId}`,
    `Document: ${normalized.documentType || "unknown"}`,
    `Target: ${[normalized.targetType, normalized.targetId].filter(Boolean).join(" / ") || "unknown"}`,
    `Template: ${payload.templateId ?? "unknown"}`,
    `Customer: ${fields.customerName ?? payload.customerName ?? ""}`,
    `Goods: ${fields.goodsSummary ?? payload.goodsSummary ?? ""}`,
    `Quantity: ${fields.quantityText ?? payload.quantityText ?? fields.quantity ?? payload.quantity ?? ""}`,
    `Packages: ${fields.packageText ?? payload.packageText ?? ""}`,
    `Barcode: ${fields.barcodeText ?? payload.barcodeText ?? ""}`,
    `Note: ${fields.note ?? payload.note ?? ""}`,
  ].filter((line) => !line.endsWith(": "));
  return ensureTrailingNewline(lines.join("\n"));
}

function extractCupsJobId(stdout) {
  const text = String(stdout ?? "").trim();
  if (!text) return "";
  const requestMatch = text.match(/request\s+id\s+is\s+([A-Za-z0-9_.:-]+)/i);
  if (requestMatch?.[1]) return requestMatch[1];
  const idMatch = text.match(/\b([A-Za-z0-9_.:-]+-\d+)\b/);
  if (idMatch?.[1]) return idMatch[1];
  return "";
}

function buildFailedBridgeJob({ bridgeJob, errorCode, message, extra = {} }) {
  const now = new Date().toISOString();
  return {
    ...bridgeJob,
    ...extra,
    status: "failed",
    updatedAt: now,
    failedAt: now,
    errorCode,
    errorMessage: sanitizeLifecycleMessage(message),
  };
}

function normalizeStringList(value) {
  const raw = Array.isArray(value) ? value : String(value ?? "").split(",");
  return [...new Set(raw.map((item) => String(item ?? "").trim()).filter(Boolean))];
}

function normalizeJsonStringList(value, fallback = []) {
  if (Array.isArray(value)) return value.map((item) => String(item ?? "").trim()).filter(Boolean);
  const raw = String(value ?? "").trim();
  if (!raw) return [...fallback];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed.map((item) => String(item ?? "").trim()).filter(Boolean);
  } catch {
    return [raw];
  }
  return [...fallback];
}

function isAllowedValue(value, allowlist) {
  const normalizedValue = String(value ?? "").trim().toLowerCase();
  return normalizeStringList(allowlist).some((item) => item.toLowerCase() === normalizedValue);
}

function ensureTrailingNewline(value) {
  const text = String(value ?? "");
  return text.endsWith("\n") ? text : `${text}\n`;
}

function normalizePositiveInteger(value, fallback, max) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(Math.floor(parsed), max);
}

function normalizeOptionalInteger(value, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.floor(parsed);
}

function byteLength(value) {
  return Buffer.byteLength(String(value ?? ""), "utf8");
}

function normalizeRequiredId(value, code) {
  const id = normalizeOptionalId(value);
  if (!id) fail(code, "Print bridge is missing a required identifier.");
  return id;
}

function normalizeOptionalId(value) {
  return String(value ?? "").trim();
}

function normalizeObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function safeFileSegment(value) {
  const segment = String(value ?? "").trim().replace(/[^A-Za-z0-9_.-]/g, "_");
  return segment || "unknown";
}

function sanitizeLifecycleMessage(value) {
  return String(value ?? "").trim().slice(0, 200);
}

function fail(code, message, exitCode = 2, details = {}) {
  const error = new Error(message);
  error.isBridgeError = true;
  error.code = code;
  error.exitCode = exitCode;
  error.details = details;
  throw error;
}
