#!/usr/bin/env node

import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

if (isCliEntrypoint()) await runCli();

async function runCli() {
  try {
    const options = parseArgs(process.argv.slice(2));
    const report = await buildProductionServiceHealthReport({
      apiBaseUrl: options.apiBaseUrl,
      timeoutMs: options.timeoutMs,
    });
    process.stdout.write(options.json ? `${JSON.stringify(report)}\n` : formatReport(report));
    process.exitCode = report.ready ? 0 : 2;
  } catch {
    process.stderr.write("ERP production service health check failed without exposing endpoint or response details.\n");
    process.exitCode = 1;
  }
}

function isCliEntrypoint() {
  return process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
}

function parseArgs(args) {
  const options = {
    apiBaseUrl: "http://127.0.0.1:8787/api",
    timeoutMs: 5_000,
    json: false,
  };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--api-base-url") {
      options.apiBaseUrl = readValue(args, index, arg);
      index += 1;
      continue;
    }
    if (arg === "--timeout-ms") {
      options.timeoutMs = parsePositiveInteger(readValue(args, index, arg), arg);
      index += 1;
      continue;
    }
    if (arg === "--json") {
      options.json = true;
      continue;
    }
    if (arg === "--no-write") continue;
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

function parsePositiveInteger(value, name) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) throw new Error(`${name} must be a positive integer.`);
  return parsed;
}

function helpText() {
  return [
    "Usage: node scripts/run-v1-production-service-health-check.mjs [options]",
    "",
    "Options:",
    "  --api-base-url <url>  API base URL. Defaults to the loopback production API.",
    "  --timeout-ms <n>      Request timeout. Defaults to 5000.",
    "  --json                Print one redacted JSON line.",
    "  --no-write            Accepted for systemd compatibility; this runner never writes files.",
    "",
    "The report never includes the API URL, response body, business counts, env paths, or secrets.",
  ].join("\n");
}

export async function buildProductionServiceHealthReport(options = {}) {
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  const timeoutMs = parsePositiveInteger(options.timeoutMs ?? 5_000, "timeoutMs");
  const healthUrl = buildHealthUrl(options.apiBaseUrl ?? "http://127.0.0.1:8787/api");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  timeout.unref?.();

  let response;
  let payload;
  let requestSucceeded = false;
  try {
    response = await fetchImpl(healthUrl, {
      method: "GET",
      headers: { accept: "application/json" },
      signal: controller.signal,
    });
    requestSucceeded = response.ok;
    payload = requestSucceeded ? await response.json() : null;
  } catch {
    payload = null;
  } finally {
    clearTimeout(timeout);
  }

  const checks = [
    check("http", "API health 可访问", requestSucceeded),
    check("status", "API health 状态正常", payload?.status === "ok"),
    check("runtime", "生产运行模式", payload?.seed?.runtimeConfig?.production === true),
    check("env-file", "安全 env 已在启动时应用", payload?.seed?.productionEnvFileApplication?.applied === true),
    check("postgres", "PostgreSQL 持久化 profile", payload?.seed?.v1PersistenceProfile?.repositoryProfile === "postgres"),
    check(
      "repository-gate",
      "无不支持的生产仓储",
      Number(payload?.seed?.v1PersistenceProfile?.unsupportedRepositoryCount ?? -1) === 0,
    ),
    check("attachment-storage", "附件对象存储", payload?.seed?.attachmentObjectStorage === "object_storage"),
    check("statement-storage", "对账导出对象存储", payload?.seed?.statementExportObjectStorage === "object_storage"),
  ];
  const passedCount = checks.filter((item) => item.ready).length;
  const ready = passedCount === checks.length;

  return {
    scope: "v1_production_service_health",
    status: ready ? "ready" : "blocked",
    ready,
    checkedAt: new Date().toISOString(),
    summary: {
      passedCount,
      totalCount: checks.length,
      blockingCount: checks.length - passedCount,
    },
    checks,
    nextAction: ready
      ? "继续由 systemd timer 周期检查，并把失败 unit 接入受控告警渠道。"
      : "检查 erp-api.service、生产 env、PostgreSQL / 对象存储配置和 journal 日志后再恢复流量。",
    safeguards: {
      readOnly: true,
      endpointExposed: false,
      responseBodyIncluded: false,
      businessCountsIncluded: false,
      envValuesIncluded: false,
      localPathExposed: false,
      secretValuesIncluded: false,
    },
  };
}

function buildHealthUrl(value) {
  const url = new URL(String(value || "http://127.0.0.1:8787/api"));
  if (!/^https?:$/.test(url.protocol)) throw new Error("API base URL must use http or https.");
  url.pathname = `${url.pathname.replace(/\/+$/, "")}/health`;
  url.search = "";
  url.hash = "";
  return url;
}

function check(key, label, ready) {
  return { key, label, ready: ready === true, status: ready === true ? "passed" : "blocked" };
}

export function formatReport(report) {
  return [
    `ERP production service health: ${report.status}`,
    `Passed: ${report.summary.passedCount}/${report.summary.totalCount}`,
    ...report.checks.map((item) => `- ${item.label}: ${item.status}`),
    `Next: ${report.nextAction}`,
    "",
  ].join("\n");
}
