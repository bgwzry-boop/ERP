#!/usr/bin/env node

import { chmodSync, mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  defaultProductionEnvSetupJsonPath,
  productionEnvFileSourceLabel,
  resolveProductionEnvSetupEnvFiles,
} from "./productionEnvSetupEnvFileResolver.mjs";
import { loadEnvironment } from "./run-v1-production-env-preflight.mjs";
import {
  redactV1TodoLoadPrecheckText,
  runV1TodoLoadPrecheck,
} from "./v1TodoLoadPrecheckService.mjs";
import { buildV1ReadinessAuthInput } from "./v1ReadinessRuntimeAuth.mjs";

const defaultOutputDir = ".erp-local-storage/v1-todo-load-precheck";

if (isCliEntrypoint()) await runCli();

async function runCli() {
  try {
    const options = parseArgs(process.argv.slice(2));
    const envResolution = resolveProductionEnvSetupEnvFiles({
      envFiles: options.envFiles,
      productionEnvSetupJsonPath: options.productionEnvSetupJsonPath,
      useProductionEnvSetupEnvFile: options.useProductionEnvSetupEnvFile,
      noneSummary: "使用当前进程环境变量",
    });
    const env = loadEnvironment({ envFiles: envResolution.envFiles, baseEnv: process.env });
    const report = await runV1TodoLoadPrecheck({
      apiBaseUrl: options.apiBaseUrl || env.ERP_V1_READINESS_API_BASE_URL,
      confirmed: options.confirmed,
      authInput: buildV1ReadinessAuthInput({ role: "operator", env }),
      requestCount: options.requestCount,
      concurrency: options.concurrency,
      pageSize: options.pageSize,
      timeoutMs: options.timeoutMs,
      maxP95Ms: options.maxP95Ms,
      maxErrorRate: options.maxErrorRate,
    });
    const outputReport = {
      ...report,
      environment: {
        envFileCount: envResolution.envFiles.length,
        source: envResolution.source,
        sourceLabel:
          envResolution.source === "none"
            ? "当前进程环境变量"
            : productionEnvFileSourceLabel(envResolution.source),
        envFilePathExposed: false,
      },
      artifacts: { written: options.write, pathExposed: false },
    };
    if (options.write) writeV1TodoLoadPrecheckArtifacts(outputReport, { outputDir: options.outputDir });
    process.stdout.write(options.json ? `${JSON.stringify(outputReport, null, 2)}\n` : formatV1TodoLoadPrecheck(outputReport));
    process.exitCode = report.ready ? 0 : 2;
  } catch (error) {
    const message = redactV1TodoLoadPrecheckText(error?.message || String(error));
    if (process.argv.includes("--json")) {
      process.stdout.write(`${JSON.stringify({ scope: "v1_todo_load_precheck", status: "error", ready: false, error: { message } }, null, 2)}\n`);
    } else {
      process.stderr.write(`V1 todo load precheck failed: ${message}\n`);
    }
    process.exitCode = 1;
  }
}

function parseArgs(args) {
  const options = {
    envFiles: [],
    productionEnvSetupJsonPath: defaultProductionEnvSetupJsonPath,
    outputDir: defaultOutputDir,
    requestCount: 100,
    concurrency: 10,
    pageSize: 100,
    timeoutMs: 5_000,
    maxP95Ms: 1_000,
    maxErrorRate: 0,
    write: true,
    confirmed: false,
    json: false,
  };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--confirm-read-load") {
      options.confirmed = true;
      continue;
    }
    if (arg === "--json") {
      options.json = true;
      continue;
    }
    if (arg === "--no-write") {
      options.write = false;
      continue;
    }
    if (arg === "--use-production-env-setup-env-file") {
      options.useProductionEnvSetupEnvFile = true;
      continue;
    }
    if (arg === "--env-file") {
      options.envFiles.push(readValue(args, index, arg));
      index += 1;
      continue;
    }
    if (arg === "--production-env-setup-json") {
      options.productionEnvSetupJsonPath = readValue(args, index, arg);
      index += 1;
      continue;
    }
    if (arg === "--api-base-url") {
      options.apiBaseUrl = readValue(args, index, arg);
      index += 1;
      continue;
    }
    if (arg === "--requests") {
      options.requestCount = readNumber(args, index, arg);
      index += 1;
      continue;
    }
    if (arg === "--concurrency") {
      options.concurrency = readNumber(args, index, arg);
      index += 1;
      continue;
    }
    if (arg === "--page-size") {
      options.pageSize = readNumber(args, index, arg);
      index += 1;
      continue;
    }
    if (arg === "--timeout-ms") {
      options.timeoutMs = readNumber(args, index, arg);
      index += 1;
      continue;
    }
    if (arg === "--max-p95-ms") {
      options.maxP95Ms = readNumber(args, index, arg);
      index += 1;
      continue;
    }
    if (arg === "--max-error-rate") {
      options.maxErrorRate = readNumber(args, index, arg);
      index += 1;
      continue;
    }
    if (arg === "--output-dir") {
      options.outputDir = readValue(args, index, arg);
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

function readNumber(args, index, name) {
  const value = Number(readValue(args, index, name));
  if (!Number.isFinite(value)) throw new Error(`${name} requires a number.`);
  return value;
}

function helpText() {
  return [
    "Usage: node scripts/run-v1-todo-load-precheck.mjs --confirm-read-load [options]",
    "",
    "Options:",
    "  --confirm-read-load            Required explicit confirmation before sending the bounded GET load.",
    "  --api-base-url <url>           Existing API base URL ending in /api; defaults to ERP_V1_READINESS_API_BASE_URL.",
    "  --env-file <path>              Load a secure env file. Can be repeated.",
    "  --use-production-env-setup-env-file",
    "                                  Reuse the fresh, untracked mode-600 env file from production env setup.",
    "  --production-env-setup-json <path>",
    "                                  Override the production env setup report path.",
    "  --requests <n>                 GET request count, default 100, hard maximum 2000.",
    "  --concurrency <n>              Worker count, default 10, hard maximum 50.",
    "  --page-size <n>                Todo page size, default 100, hard maximum 200.",
    "  --timeout-ms <n>               Per-request timeout, default 5000, hard maximum 30000.",
    "  --max-p95-ms <n>               Blocking P95 threshold, default 1000.",
    "  --max-error-rate <ratio>       Blocking error-rate threshold from 0 to 1, default 0.",
    "  --output-dir <path>            Redacted evidence directory.",
    "  --no-write                     Do not write JSON / Markdown evidence.",
    "  --json                         Print machine-readable JSON.",
    "",
    "Authentication is read only from ERP_V1_READINESS_TOKEN or the formal login-name/password env variables.",
    "The runner never accepts a token/password argument, never uses x-erp-user-id, and never calls a business write endpoint.",
  ].join("\n");
}

function writeV1TodoLoadPrecheckArtifacts(report, { outputDir = defaultOutputDir } = {}) {
  mkdirSync(outputDir, { recursive: true, mode: 0o700 });
  chmodSync(outputDir, 0o700);
  const timestamp = String(report.checkedAt || new Date().toISOString()).replace(/[:.]/g, "-");
  const json = `${JSON.stringify(report, null, 2)}\n`;
  const markdown = formatV1TodoLoadPrecheck(report);
  const paths = {
    jsonPath: join(outputDir, `todo-load-precheck-${timestamp}.json`),
    markdownPath: join(outputDir, `todo-load-precheck-${timestamp}.md`),
    latestJsonPath: join(outputDir, "latest.json"),
    latestMarkdownPath: join(outputDir, "latest.md"),
  };
  writeFileSync(paths.jsonPath, json, { mode: 0o600 });
  writeFileSync(paths.markdownPath, markdown, { mode: 0o600 });
  writeFileSync(paths.latestJsonPath, json, { mode: 0o600 });
  writeFileSync(paths.latestMarkdownPath, markdown, { mode: 0o600 });
  return paths;
}

function formatV1TodoLoadPrecheck(report) {
  const latency = report.summary?.latencyMs || {};
  const lines = [
    "# V1 Todo Load Precheck",
    "",
    `Status: ${report.ready ? "READY" : "BLOCKED"} (${report.summary?.label || ""})`,
    `Checked at: ${report.checkedAt}`,
    `Requests: ${report.summary?.successCount || 0}/${report.summary?.requestCount || 0} successful`,
    `Error rate: ${formatPercent(report.summary?.errorRate)} / threshold ${formatPercent(report.config?.maxErrorRate)}`,
    `Latency P50/P95/Max: ${latency.p50 || 0}ms / ${latency.p95 || 0}ms / ${latency.max || 0}ms`,
    `P95 threshold: ${report.config?.maxP95Ms || 0}ms`,
    `Throughput: ${report.summary?.throughputPerSecond || 0} req/s`,
    `Snapshot changed during load: ${report.summary?.snapshotChanged ? "yes" : "no"}`,
    "",
    "## Stages",
  ];
  for (const stage of report.stages || []) {
    lines.push(`- ${stage.status.toUpperCase()} ${stage.label}: ${stage.detail}`);
    if (!stage.ready && stage.nextAction) lines.push(`  - Next: ${stage.nextAction}`);
  }
  if (report.errorBreakdown?.length) {
    lines.push("", "## Errors");
    for (const item of report.errorBreakdown) lines.push(`- ${item.category}: ${item.count}`);
  }
  if (report.warnings?.length) {
    lines.push("", "## Warnings");
    for (const item of report.warnings) lines.push(`- ${item.detail}`);
  }
  lines.push(
    "",
    "## Safeguards",
    `- Formal runtime authentication: ${yesNo(report.authentication?.serverVerified)}`,
    `- Business requests are GET only: ${yesNo(report.safeguards?.businessProbeMethod === "GET")}`,
    `- Business data mutated: ${yesNo(report.safeguards?.businessDataMutated)}`,
    `- Request count bounded: ${yesNo(report.safeguards?.requestCountBounded)}`,
    `- Concurrency bounded: ${yesNo(report.safeguards?.concurrencyBounded)}`,
    `- Credentials exposed: ${yesNo(report.safeguards?.credentialsExposed)}`,
    `- Response payload stored: ${yesNo(report.safeguards?.responsePayloadStored)}`,
    "",
  );
  return redactV1TodoLoadPrecheckText(lines.join("\n"));
}

function formatPercent(value) {
  return `${Math.round((Number(value) || 0) * 10_000) / 100}%`;
}

function yesNo(value) {
  return value ? "yes" : "no";
}

function isCliEntrypoint() {
  return process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
}

export {
  formatV1TodoLoadPrecheck,
  helpText,
  parseArgs,
  writeV1TodoLoadPrecheckArtifacts,
};
