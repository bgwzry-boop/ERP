#!/usr/bin/env node

const defaultApiBaseUrl = "http://127.0.0.1:8787/api";

try {
  const options = parseArgs(process.argv.slice(2));
  const apiBaseUrl = normalizeApiBaseUrl(
    options.apiBaseUrl ||
      process.env.ERP_PRINT_V1_READINESS_API_BASE_URL ||
      process.env.VITE_ERP_API_BASE_URL ||
      defaultApiBaseUrl,
  );
  const operatorId = String(options.operatorId || process.env.ERP_PRINT_V1_READINESS_OPERATOR_ID || "U-OFFICE-A").trim();
  const headers = buildHeaders({ operatorId, bearerToken: options.bearerToken || process.env.ERP_PRINT_V1_READINESS_TOKEN });
  const cupsDiagnostics = await getJson(apiBaseUrl, "/print-driver/cups-diagnostics", { headers });
  const readiness = await getJson(apiBaseUrl, "/print-driver/v1-readiness", { headers });
  const report = buildReadinessReport({ apiBaseUrl, operatorId, cupsDiagnostics, readiness });
  if (options.json) {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  } else {
    process.stdout.write(formatReadinessReport(report));
  }
  process.exit(report.ready ? 0 : 2);
} catch (error) {
  const message = error?.message || String(error);
  if (process.argv.includes("--json")) {
    process.stdout.write(`${JSON.stringify({ status: "error", ready: false, error: { message } }, null, 2)}\n`);
  } else {
    process.stderr.write(`Print V1 readiness check failed: ${message}\n`);
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
    if (arg === "--api-base-url") {
      options.apiBaseUrl = readValue(args, index, arg);
      index += 1;
      continue;
    }
    if (arg === "--operator-id") {
      options.operatorId = readValue(args, index, arg);
      index += 1;
      continue;
    }
    if (arg === "--bearer-token") {
      options.bearerToken = readValue(args, index, arg);
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
    "Usage: node scripts/run-print-v1-readiness-check.mjs [options]",
    "",
    "Options:",
    "  --api-base-url <url>   ERP API base URL, default http://127.0.0.1:8787/api",
    "  --operator-id <id>     ERP operator id, default U-OFFICE-A",
    "  --bearer-token <jwt>   Optional bearer token instead of seed user header",
    "  --json                 Print machine-readable JSON",
    "",
    "Exit codes:",
    "  0  V1 print readiness gate is ready",
    "  1  API/read error",
    "  2  Gate is reachable but still blocked",
  ].join("\n");
}

function normalizeApiBaseUrl(value) {
  const baseUrl = String(value || defaultApiBaseUrl).trim().replace(/\/+$/, "");
  if (!baseUrl) throw new Error("API base URL is required.");
  return baseUrl;
}

function buildHeaders({ operatorId, bearerToken }) {
  const headers = { "content-type": "application/json" };
  if (bearerToken) {
    headers.authorization = `Bearer ${bearerToken}`;
  } else if (operatorId) {
    headers["x-erp-user-id"] = operatorId;
  }
  return headers;
}

async function getJson(apiBaseUrl, path, { headers }) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    const response = await fetch(`${apiBaseUrl}${path}`, {
      headers: { ...headers, connection: "close" },
      signal: controller.signal,
    });
    const text = await response.text();
    const json = text ? JSON.parse(text) : {};
    if (!response.ok) {
      const message = json?.error?.message || json?.message || `${path} returned HTTP ${response.status}`;
      throw new Error(message);
    }
    return json;
  } catch (error) {
    if (error?.name === "AbortError") throw new Error(`${path} request timed out after 10000ms`);
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function buildReadinessReport({ apiBaseUrl, operatorId, cupsDiagnostics, readiness }) {
  const criteria = Array.isArray(readiness.criteria) ? readiness.criteria.map(normalizeCriterion) : [];
  const blockingCriteria = criteria.filter((item) => item.blocking && item.status !== "passed");
  const cups = normalizeCupsDiagnostics(cupsDiagnostics);
  return {
    status: readiness.ready ? "ready" : "blocked",
    ready: Boolean(readiness.ready),
    checkedAt: readiness.checkedAt || cups.checkedAt || new Date().toISOString(),
    apiBaseUrl,
    operatorId,
    summary: {
      label: readiness.summary?.label || `${criteria.filter((item) => item.status === "passed").length}/${criteria.length} 通过`,
      passedCount: numberOrZero(readiness.summary?.passedCount),
      totalCount: numberOrZero(readiness.summary?.totalCount || criteria.length),
      blockingCount: numberOrZero(readiness.summary?.blockingCount || blockingCriteria.length),
    },
    cups,
    criteria,
    blockingCriteria,
    remainingV1Risks: stringList(readiness.remainingV1Risks),
    safeguards: {
      nonPrinting: readiness.safeguards?.nonPrinting !== false && cups.safeguards.nonPrinting !== false,
      physicalPrinterCalled: Boolean(readiness.safeguards?.physicalPrinterCalled || cups.safeguards.physicalPrinterCalled),
      commandValueExposed: Boolean(readiness.safeguards?.commandValueExposed || cups.safeguards.commandValueExposed),
      commandArgsExposed: Boolean(readiness.safeguards?.commandArgsExposed || cups.safeguards.commandArgsExposed),
      stdoutExposed: Boolean(cups.safeguards.stdoutExposed),
      stderrExposed: Boolean(cups.safeguards.stderrExposed),
      spoolPathExposed: Boolean(readiness.safeguards?.spoolPathExposed),
      payloadExposed: Boolean(readiness.safeguards?.payloadExposed || cups.safeguards.payloadExposed),
      printFileCreated: Boolean(cups.safeguards.printFileCreated),
    },
    nextActions: buildNextActions({ cups, blockingCriteria, ready: Boolean(readiness.ready) }),
  };
}

function normalizeCupsDiagnostics(value = {}) {
  const preflight = value.preflightResult && typeof value.preflightResult === "object" ? value.preflightResult : {};
  const safeguards = value.safeguards && typeof value.safeguards === "object" ? value.safeguards : {};
  return {
    status: stringValue(value.status || "not_configured"),
    ready: Boolean(value.ready),
    checkedAt: stringValue(value.checkedAt),
    scope: stringValue(value.scope || "non_printing_cups_queue_preflight"),
    cupsQueueStatusReadback: stringValue(value.cupsQueueStatusReadback || "cups_status_command"),
    cupsPrinterConfigured: Boolean(value.cupsPrinterConfigured),
    cupsPrinterAllowed: Boolean(value.cupsPrinterAllowed),
    cupsStatusCommandConfigured: Boolean(value.cupsStatusCommandConfigured),
    cupsStatusCommandRunnable: Boolean(value.cupsStatusCommandRunnable),
    stdoutBytes: numberOrZero(preflight.stdoutBytes),
    stderrBytes: numberOrZero(preflight.stderrBytes),
    errorCode: stringValue(preflight.errorCode),
    message: stringValue(preflight.message),
    blockers: Array.isArray(value.blockers) ? value.blockers.map(normalizeBlocker) : [],
    safeguards: {
      nonPrinting: safeguards.nonPrinting !== false,
      physicalPrinterCalled: Boolean(safeguards.physicalPrinterCalled || value.physicalPrinterCalled),
      commandValueExposed: Boolean(safeguards.commandValueExposed || value.commandValueExposed),
      commandArgsExposed: Boolean(safeguards.commandArgsExposed || value.commandArgsExposed),
      stdoutExposed: Boolean(safeguards.stdoutExposed || value.stdoutExposed),
      stderrExposed: Boolean(safeguards.stderrExposed || value.stderrExposed),
      payloadExposed: Boolean(safeguards.payloadExposed),
      printFileCreated: Boolean(safeguards.printFileCreated),
    },
  };
}

function normalizeCriterion(value = {}) {
  return {
    key: stringValue(value.key || "unknown"),
    label: stringValue(value.label || value.key || "门禁项"),
    status: stringValue(value.status || "pending"),
    blocking: Boolean(value.blocking),
    detail: stringValue(value.detail),
  };
}

function normalizeBlocker(value = {}) {
  return {
    key: stringValue(value.key || "blocker"),
    label: stringValue(value.label || value.key || "阻塞项"),
    detail: stringValue(value.detail),
  };
}

function buildNextActions({ cups, blockingCriteria, ready }) {
  if (ready) {
    return [
      "继续执行真实样张、纸张对位、条码扫码、作废重打和现场签认抽检。",
      "保留 CUPS 队列、spool completed、现场 QA 证据和操作日志。",
    ];
  }
  const actions = [];
  if (!cups.ready) {
    actions.push("先修 CUPS 队列预检：确认队列名、白名单、lpstat 权限和当前后端进程可访问队列。");
  }
  for (const item of blockingCriteria.slice(0, 5)) {
    actions.push(`${item.label}：${item.detail || "补齐该门禁证据"}`);
  }
  return actions.length ? actions : ["查看 V1 打印上线门禁详情并补齐阻塞项。"];
}

function formatReadinessReport(report) {
  const lines = [
    `V1 print readiness: ${report.ready ? "READY" : "BLOCKED"}`,
    `API: ${report.apiBaseUrl}`,
    `Operator: ${report.operatorId || "token"}`,
    `Gate: ${report.summary.label}; blockers ${report.summary.blockingCount}`,
    "",
    `CUPS queue preflight: ${report.cups.ready ? "READY" : "BLOCKED"}`,
    `- printer configured: ${yesNo(report.cups.cupsPrinterConfigured)}`,
    `- printer allowed: ${yesNo(report.cups.cupsPrinterAllowed)}`,
    `- status command runnable: ${yesNo(report.cups.cupsStatusCommandRunnable)}`,
    `- stdout/stderr bytes: ${report.cups.stdoutBytes}/${report.cups.stderrBytes}`,
    `- no physical print: ${yesNo(!report.cups.safeguards.physicalPrinterCalled && !report.cups.safeguards.printFileCreated)}`,
  ];
  if (report.blockingCriteria.length) {
    lines.push("", "Blocking criteria:");
    for (const item of report.blockingCriteria) {
      lines.push(`- ${item.label}: ${item.detail || item.status}`);
    }
  }
  if (report.remainingV1Risks.length) {
    lines.push("", "Remaining V1 risks:");
    for (const risk of report.remainingV1Risks.slice(0, 8)) {
      lines.push(`- ${risk}`);
    }
  }
  if (report.nextActions.length) {
    lines.push("", "Next actions:");
    for (const action of report.nextActions) {
      lines.push(`- ${action}`);
    }
  }
  lines.push("");
  return lines.join("\n");
}

function stringList(value) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => stringValue(item)).filter(Boolean);
}

function stringValue(value) {
  return String(value ?? "").trim();
}

function numberOrZero(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return Math.trunc(parsed);
}

function yesNo(value) {
  return value ? "yes" : "no";
}
