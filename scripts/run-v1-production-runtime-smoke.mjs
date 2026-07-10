#!/usr/bin/env node

import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { resolveProductionEnvSetupEnvFiles } from "./productionEnvSetupEnvFileResolver.mjs";
import { buildProductionEnvFileAuditReport } from "./run-v1-production-env-file-audit.mjs";
import { buildProductionEnvPreflight, loadEnvironment } from "./run-v1-production-env-preflight.mjs";
import { redactPersistenceEvidenceText } from "./run-v1-production-persistence-evidence.mjs";

const defaultOutputDir = ".erp-local-storage/v1-production-runtime-smoke";
const defaultProductionEnvSetupJsonPath = ".erp-local-storage/v1-production-env-setup/latest.json";
const defaultApiArgs = ["server/apiServer.mjs"];
const persistenceEnvCriterionKeys = new Set([
  "v1-persistence-profile",
  "attachment-object-storage-env",
  "statement-export-object-storage-env",
  "preflight-redaction-safeguard",
]);

if (isCliEntrypoint()) await runCli();

async function runCli() {
  try {
    const options = parseArgs(process.argv.slice(2));
    const report = await buildProductionRuntimeSmoke({
      envFiles: options.envFiles,
      envFileFromProductionSetup: options.envFileFromProductionSetup,
      envFileSource: options.envFileSource,
      envFileSourceSummary: options.envFileSourceSummary,
      baseEnv: process.env,
      apiBaseUrl: options.apiBaseUrl,
      apiCommand: options.apiCommand,
      apiArgs: options.apiArgs,
      port: options.port,
      timeoutMs: options.timeoutMs,
      operatorId: options.operatorId,
    });
    const outputReport = redactRuntimeSmokeReport(
      options.write
        ? {
            ...report,
            artifacts: writeProductionRuntimeSmokeArtifacts(report, { outputDir: options.outputDir }),
          }
        : report,
    );
    if (options.json) {
      process.stdout.write(`${JSON.stringify(outputReport, null, 2)}\n`);
    } else {
      process.stdout.write(formatProductionRuntimeSmoke(outputReport));
    }
    process.exitCode = report.ready ? 0 : 2;
  } catch (error) {
    const message = redactRuntimeSmokeText(error?.message || String(error));
    if (process.argv.includes("--json")) {
      process.stdout.write(`${JSON.stringify({ status: "error", ready: false, error: { message } }, null, 2)}\n`);
    } else {
      process.stderr.write(`V1 production runtime smoke failed: ${message}\n`);
    }
    process.exitCode = 1;
  }
}

function isCliEntrypoint() {
  return process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
}

function parseArgs(args) {
  const options = {
    envFiles: [],
    envFileFromProductionSetup: false,
    envFileSource: "none",
    envFileSourceSummary: "未传入 env 文件",
    apiCommand: process.execPath,
    apiArgs: defaultApiArgs,
    outputDir: defaultOutputDir,
    productionEnvSetupJsonPath: defaultProductionEnvSetupJsonPath,
    port: 0,
    timeoutMs: 15000,
    write: true,
  };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--json") {
      options.json = true;
      continue;
    }
    if (arg === "--no-write") {
      options.write = false;
      continue;
    }
    if (arg === "--env-file") {
      options.envFiles.push(readValue(args, index, arg));
      index += 1;
      continue;
    }
    if (arg === "--use-production-env-setup-env-file") {
      options.useProductionEnvSetupEnvFile = true;
      continue;
    }
    if (arg === "--production-env-setup-json") {
      options.productionEnvSetupJsonPath = readValue(args, index, arg);
      index += 1;
      continue;
    }
    if (arg === "--api-command") {
      options.apiCommand = readValue(args, index, arg);
      index += 1;
      continue;
    }
    if (arg === "--api-base-url") {
      options.apiBaseUrl = readValue(args, index, arg);
      index += 1;
      continue;
    }
    if (arg === "--api-args-json") {
      options.apiArgs = parseApiArgsJson(readValue(args, index, arg));
      index += 1;
      continue;
    }
    if (arg === "--port") {
      options.port = parsePositiveInteger(readValue(args, index, arg), arg, { allowZero: true });
      index += 1;
      continue;
    }
    if (arg === "--timeout-ms") {
      options.timeoutMs = parsePositiveInteger(readValue(args, index, arg), arg);
      index += 1;
      continue;
    }
    if (arg === "--operator-id") {
      options.operatorId = readValue(args, index, arg);
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
  const envFileResolution = resolveProductionRuntimeSmokeEnvFiles({
    envFiles: options.envFiles,
    productionEnvSetupJsonPath: options.productionEnvSetupJsonPath,
    useProductionEnvSetupEnvFile: options.useProductionEnvSetupEnvFile,
  });
  options.envFiles = envFileResolution.envFiles;
  options.envFileSource = envFileResolution.source;
  options.envFileSourceSummary = envFileResolution.summary;
  options.envFileFromProductionSetup = envFileResolution.usedProductionEnvSetup;
  return options;
}

function readValue(args, index, name) {
  const value = args[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${name} requires a value.`);
  return value;
}

function parsePositiveInteger(value, name, { allowZero = false } = {}) {
  const number = Number(value);
  if (!Number.isFinite(number) || !Number.isInteger(number) || number < (allowZero ? 0 : 1)) {
    throw new Error(`${name} must be ${allowZero ? "0 or a positive integer" : "a positive integer"}.`);
  }
  return number;
}

function parseApiArgsJson(value) {
  let parsed;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error("--api-args-json must be a valid JSON array.");
  }
  if (!Array.isArray(parsed) || parsed.some((item) => typeof item !== "string")) {
    throw new Error("--api-args-json must be a JSON array of strings.");
  }
  return parsed;
}

function helpText() {
  return [
    "Usage: node scripts/run-v1-production-runtime-smoke.mjs --env-file <secure-env-file> [options]",
    "   or: node scripts/run-v1-production-runtime-smoke.mjs --use-production-env-setup-env-file [options]",
    "",
    "Options:",
    "  --env-file <path>              Load and audit secure production env file. Can be repeated.",
    "  --use-production-env-setup-env-file",
    "                                  When no --env-file is passed, reuse the safe env file recorded by production env setup.",
    "  --production-env-setup-json <path>",
    "                                  Production env setup JSON. Defaults to .erp-local-storage/v1-production-env-setup/latest.json.",
    "  --api-base-url <url>           Probe an already-running production API instead of spawning a temporary API.",
    "  --api-command <path>           API process command. Defaults to current node executable.",
    '  --api-args-json <json>         API process args. Defaults to ["server/apiServer.mjs"].',
    "  --port <n>                     Port passed as ERP_API_PORT. Defaults to 0, which selects a free local port.",
    "  --timeout-ms <n>               API startup/read timeout. Defaults to 15000.",
    "  --operator-id <id>             Operator id for read-only readiness probes. Defaults to env or U-OFFICE-A.",
    "  --output-dir <path>            Write redacted evidence files. Defaults to .erp-local-storage/v1-production-runtime-smoke.",
    "  --no-write                     Do not write JSON / Markdown evidence files.",
    "  --json                         Print machine-readable JSON.",
    "",
    "Exit codes:",
    "  0  API started from the secure env and first production runtime profile checks passed",
    "  1  Runner error",
    "  2  Runtime smoke is readable but still blocked for first production go-live stage",
    "",
    "This runner only performs GET readiness probes, does not apply migrations, does not mutate business data, does not print, and stops the spawned API process after checking.",
  ].join("\n");
}

function resolveProductionRuntimeSmokeEnvFiles({
  envFiles = [],
  productionEnvSetupJsonPath = defaultProductionEnvSetupJsonPath,
  useProductionEnvSetupEnvFile = false,
} = {}) {
  if (envFiles.length) {
    return {
      envFiles,
      source: "cli",
      summary: `${envFiles.length} 个命令行 env 文件`,
      usedProductionEnvSetup: false,
    };
  }
  if (!useProductionEnvSetupEnvFile) {
    return {
      envFiles: [],
      source: "none",
      summary: "未传入 env 文件",
      usedProductionEnvSetup: false,
    };
  }
  return resolveProductionEnvSetupEnvFiles({
    productionEnvSetupJsonPath,
    useProductionEnvSetupEnvFile: true,
  });
}

async function buildProductionRuntimeSmoke({
  envFiles = [],
  envFileFromProductionSetup = false,
  envFileSource = "",
  envFileSourceSummary = "",
  baseEnv = process.env,
  apiBaseUrl = "",
  apiCommand = process.execPath,
  apiArgs = defaultApiArgs,
  port = 0,
  timeoutMs = 15000,
  operatorId,
  checkedAt = new Date().toISOString(),
  fetchImpl = globalThis.fetch,
} = {}) {
  const envFileAuditStage = buildEnvFileAuditStage({ envFiles });
  const env = loadEnvironment({ envFiles, baseEnv });
  const envPreflight = buildProductionEnvPreflight({ env, envFiles });
  const persistenceEnvStage = buildPersistenceEnvStage(envPreflight);
  const externalApiBaseUrl = normalizeApiBaseUrl(apiBaseUrl);
  const selectedPort = externalApiBaseUrl ? 0 : port > 0 ? port : await findFreePort();
  const runtimeApiBaseUrl = externalApiBaseUrl || `http://127.0.0.1:${selectedPort}/api`;
  const resolvedOperatorId = cleanString(operatorId || env.ERP_V1_READINESS_OPERATOR_ID || "U-OFFICE-A");
  const runtimeResult = externalApiBaseUrl
    ? await probeExistingApiRuntime({
        apiBaseUrl: runtimeApiBaseUrl,
        operatorId: resolvedOperatorId,
        timeoutMs,
        fetchImpl,
      })
    : await runApiRuntimeProbe({
        env,
        baseEnv,
        envFiles,
        apiCommand,
        apiArgs,
        port: selectedPort,
        apiBaseUrl: runtimeApiBaseUrl,
        operatorId: resolvedOperatorId,
        timeoutMs,
        fetchImpl,
      });
  const apiStartupStage = buildApiStartupStage(runtimeResult);
  const runtimeProfileStage = buildRuntimeProfileStage(runtimeResult);
  const stages = [envFileAuditStage, persistenceEnvStage, apiStartupStage, runtimeProfileStage];
  const passedCount = stages.filter((item) => item.status === "passed").length;
  const blockingCount = stages.length - passedCount;
  const ready = blockingCount === 0;
  const normalizedEnvFileSource = normalizeEnvFileSource(envFileSource, envFiles);
  const normalizedEnvFileSourceSummary =
    cleanString(envFileSourceSummary) || (normalizedEnvFileSource === "none" ? "未传入 env 文件" : `${envFiles.length} 个 env 文件`);
  const report = {
    status: ready ? "ready" : "blocked",
    ready,
    checkedAt,
    scope: "v1_production_runtime_smoke",
    envFileCount: envFiles.length,
    envFileSource: normalizedEnvFileSource,
    envFileSourceLabel: envFileSourceLabel(normalizedEnvFileSource),
    envFileSourceSummary: normalizedEnvFileSourceSummary,
    envFileFromProductionSetup: Boolean(envFileFromProductionSetup || normalizedEnvFileSource === "production_env_setup"),
    summary: {
      label: `${passedCount}/${stages.length} 通过`,
      passedCount,
      totalCount: stages.length,
      blockingCount,
      warningCount:
        numberOrZero(envFileAuditStage.summary.warningCount) +
        numberOrZero(persistenceEnvStage.summary.warningCount) +
        numberOrZero(apiStartupStage.summary.warningCount) +
        numberOrZero(runtimeProfileStage.summary.warningCount),
      envFileSource: normalizedEnvFileSource,
      envFileSourceLabel: envFileSourceLabel(normalizedEnvFileSource),
      envFileFromProductionSetup: Boolean(envFileFromProductionSetup || normalizedEnvFileSource === "production_env_setup"),
    },
    stages,
    blockingStages: stages.filter((item) => item.status !== "passed"),
    runtime: buildRuntimeSnapshot(runtimeResult),
    safeguards: {
      nonMutating: true,
      readOnlyHttpProbesOnly: true,
      apiProcessSpawned: runtimeResult.apiProcessSpawned === true,
      apiProcessTerminated: runtimeResult.apiProcessTerminated === true,
      externalApiProbed: runtimeResult.externalApiProbed === true,
      envFileReadFromProductionSetup: Boolean(envFileFromProductionSetup || normalizedEnvFileSource === "production_env_setup"),
      productionEnvAppliedToProcess: runtimeResult.health?.seed?.productionEnvFileApplication?.applied === true,
      migrationApplyExecuted: false,
      businessDataMutated: false,
      physicalPrinterCalled: false,
      driverDeliveryStatusChanged: false,
      envValuesExposed: false,
      envFilePathExposed: false,
      databaseUrlExposed: false,
      objectStorageEndpointExposed: false,
      objectStorageBucketExposed: false,
      secretFieldsExposed: false,
      commandValueExposed: false,
      commandArgsExposed: false,
      payloadExposed: false,
    },
    nextActions: buildNextActions(stages),
  };
  return redactRuntimeSmokeReport(report);
}

function normalizeApiBaseUrl(value) {
  const text = cleanString(value);
  if (!text) return "";
  return text.replace(/\/+$/, "");
}

function buildEnvFileAuditStage({ envFiles }) {
  if (envFiles.length === 0) {
    return {
      key: "production-env-file-audit",
      label: "生产 env 文件安全审计",
      status: "blocked",
      ready: false,
      detail: "未提供安全生产 env 文件，不能证明 API 使用真实生产配置启动。",
      summary: { label: "0 个 env 文件", passedCount: 0, totalCount: 1, blockingCount: 1, warningCount: 0 },
      evidence: { envFileCount: 0, rawEnvFilePathIncluded: false },
      nextAction: "先把真实生产变量填入未跟踪的安全 env 文件，再用 --use-production-env-setup-env-file 或 --env-file 运行本脚本。",
    };
  }
  const report = buildProductionEnvFileAuditReport({ envFiles });
  return {
    key: "production-env-file-audit",
    label: "生产 env 文件安全审计",
    status: report.ready ? "passed" : "blocked",
    ready: report.ready === true,
    detail: cleanString(report.summary?.label) || (report.ready ? "生产 env 文件安全审计通过。" : "生产 env 文件安全审计未通过。"),
    summary: {
      label: cleanString(report.summary?.label) || "",
      passedCount: numberOrZero(report.summary?.passedCount),
      totalCount:
        numberOrZero(report.summary?.passedCount) +
        numberOrZero(report.summary?.warningCount) +
        numberOrZero(report.summary?.blockingCount),
      blockingCount: numberOrZero(report.summary?.blockingCount),
      warningCount: numberOrZero(report.summary?.warningCount),
    },
    evidence: {
      envFileCount: numberOrZero(report.envFileCount),
      placeholderAssignmentCount: numberOrZero(report.summary?.placeholderAssignmentCount),
      uncommentedAssignmentCount: numberOrZero(report.summary?.uncommentedAssignmentCount),
      sensitiveVariableNameCount: numberOrZero(report.summary?.sensitiveVariableNameCount),
      rawEnvFilePathIncluded: false,
    },
    blockingItems: sanitizeFindings(report.blockingFindings),
    nextAction:
      report.ready === true
        ? "继续使用同一份安全 env 文件启动 API runtime smoke。"
        : firstAction(report.nextActions) || "修正 env 文件安全审计阻塞项后重跑。",
  };
}

function normalizeEnvFileSource(source, envFiles = []) {
  const text = cleanString(source);
  if (text === "cli" || text === "production_env_setup" || text === "none" || text === "provided") return text;
  return envFiles.length ? "cli" : "none";
}

function envFileSourceLabel(source) {
  if (source === "cli") return "命令行 env 文件";
  if (source === "provided") return "已传入 env 文件";
  if (source === "production_env_setup") return "生产 env setup 安全文件";
  return "未传入 env 文件";
}

function buildPersistenceEnvStage(envPreflight = {}) {
  const criteria = Array.isArray(envPreflight.criteria) ? envPreflight.criteria : [];
  const scopedCriteria = criteria.filter((item) => persistenceEnvCriterionKeys.has(item.key));
  const passedCount = scopedCriteria.filter((item) => item.status === "passed").length;
  const blockingItems = scopedCriteria.filter((item) => item.status !== "passed");
  return {
    key: "production-persistence-env-subset",
    label: "生产持久化 env 子集",
    status: blockingItems.length === 0 && scopedCriteria.length > 0 ? "passed" : "blocked",
    ready: blockingItems.length === 0 && scopedCriteria.length > 0,
    detail:
      blockingItems.length === 0 && scopedCriteria.length > 0
        ? "PostgreSQL、附件对象存储、对账导出对象存储和脱敏保护变量检查通过。"
        : `${blockingItems.length || 1} 项生产持久化 env 子集仍阻塞。`,
    summary: {
      label: `${passedCount}/${scopedCriteria.length || persistenceEnvCriterionKeys.size} 通过`,
      passedCount,
      totalCount: scopedCriteria.length || persistenceEnvCriterionKeys.size,
      blockingCount: blockingItems.length || (scopedCriteria.length === 0 ? 1 : 0),
      warningCount: 0,
    },
    evidence: {
      fullEnvStatus: cleanString(envPreflight.status || "unknown"),
      fullEnvBlockingCount: numberOrZero(envPreflight.summary?.blockingCount),
      checkedCriterionKeys: scopedCriteria.map((item) => cleanString(item.key)).filter(Boolean),
    },
    blockingItems: sanitizeFindings(blockingItems),
    nextAction:
      blockingItems.length === 0 && scopedCriteria.length > 0
        ? "继续确认 API 运行态已从同一份 env 读取 PostgreSQL / 对象存储 profile。"
        : firstAction(envPreflight.nextActions) || "补齐 PostgreSQL / 对象存储相关生产 env 后重跑。",
  };
}

async function runApiRuntimeProbe({
  env: _env,
  baseEnv,
  envFiles = [],
  apiCommand,
  apiArgs,
  port,
  apiBaseUrl,
  operatorId,
  timeoutMs,
  fetchImpl,
}) {
  if (typeof fetchImpl !== "function") throw new Error("A fetch implementation is required.");
  const childEnv = {
    ...baseEnv,
    ERP_V1_PRODUCTION_ENV_FILE: envFiles.join(","),
    ERP_API_PORT: String(port),
    ERP_V1_READINESS_API_BASE_URL: apiBaseUrl,
    ERP_V1_READINESS_OPERATOR_ID: operatorId,
  };
  for (const key of ["ERP_V1_ENV_FILE", "ERP_V1_PRODUCTION_ENV_FILE_AUDIT_PATHS"]) {
    if (Object.prototype.hasOwnProperty.call(childEnv, key)) delete childEnv[key];
  }
  const child = spawn(apiCommand, apiArgs, {
    cwd: process.cwd(),
    env: childEnv,
    stdio: ["ignore", "pipe", "pipe"],
  });
  const state = trackChildProcess(child);
  let result;
  try {
    const health = await waitForHealth({ apiBaseUrl, timeoutMs, fetchImpl, childState: state });
    const headers = buildSeedHeaders(operatorId);
    const systemReadiness = await requestJson({
      apiBaseUrl,
      path: "/system/v1-readiness",
      headers,
      timeoutMs,
      fetchImpl,
    });
    result = {
      apiBaseUrl,
      operatorId,
      port,
      apiProcessSpawned: true,
      apiProcessTerminated: false,
      startupReady: true,
      health,
      systemReadiness,
      stdoutSample: "",
      stderrSample: "",
      exitBeforeReady: false,
    };
  } catch (error) {
    result = {
      apiBaseUrl,
      operatorId,
      port,
      apiProcessSpawned: true,
      apiProcessTerminated: false,
      startupReady: false,
      error: sanitizeError(error),
      stdoutSample: redactRuntimeSmokeText(state.stdout),
      stderrSample: redactRuntimeSmokeText(state.stderr),
      exitBeforeReady: state.closed,
      exitCode: state.exitCode,
      signalCode: state.signalCode,
    };
  } finally {
    const termination = await stopChildProcess(child, state);
    if (result) result.apiProcessTerminated = termination.terminated;
  }
  return result;
}

async function probeExistingApiRuntime({ apiBaseUrl, operatorId, timeoutMs, fetchImpl }) {
  try {
    const health = await requestJson({
      apiBaseUrl,
      path: "/health",
      headers: {},
      timeoutMs,
      fetchImpl,
    });
    const headers = buildSeedHeaders(operatorId);
    const systemReadiness = await requestJson({
      apiBaseUrl,
      path: "/system/v1-readiness",
      headers,
      timeoutMs,
      fetchImpl,
    });
    return {
      apiBaseUrl,
      operatorId,
      port: 0,
      runtimeMode: "external_service",
      externalApiProbed: true,
      apiProcessSpawned: false,
      apiProcessTerminated: false,
      startupReady: health?.status === "ok",
      health,
      systemReadiness,
      stdoutSample: "",
      stderrSample: "",
      exitBeforeReady: false,
    };
  } catch (error) {
    return {
      apiBaseUrl,
      operatorId,
      port: 0,
      runtimeMode: "external_service",
      externalApiProbed: true,
      apiProcessSpawned: false,
      apiProcessTerminated: false,
      startupReady: false,
      error: sanitizeError(error),
      stdoutSample: "",
      stderrSample: "",
      exitBeforeReady: false,
    };
  }
}

function trackChildProcess(child) {
  const state = {
    closed: false,
    exitCode: null,
    signalCode: "",
    stdout: "",
    stderr: "",
    apiProcessTerminated: false,
  };
  state.closePromise = new Promise((resolveClose) => {
    child.stdout?.on("data", (chunk) => {
      state.stdout = capText(`${state.stdout}${chunk.toString("utf8")}`);
    });
    child.stderr?.on("data", (chunk) => {
      state.stderr = capText(`${state.stderr}${chunk.toString("utf8")}`);
    });
    child.on("error", (error) => {
      state.closed = true;
      state.stderr = capText(`${state.stderr}\n${error.message}`);
      resolveClose();
    });
    child.on("close", (exitCode, signalCode) => {
      state.closed = true;
      state.exitCode = exitCode;
      state.signalCode = signalCode || "";
      resolveClose();
    });
  });
  return state;
}

async function waitForHealth({ apiBaseUrl, timeoutMs, fetchImpl, childState }) {
  const startedAt = Date.now();
  let lastError = null;
  while (Date.now() - startedAt < timeoutMs) {
    if (childState.closed) {
      throw new Error(
        `API process exited before /health became ready${childState.exitCode === null ? "" : ` (exit ${childState.exitCode})`}.`,
      );
    }
    try {
      const health = await requestJson({
        apiBaseUrl,
        path: "/health",
        headers: {},
        timeoutMs: Math.min(2500, Math.max(500, timeoutMs)),
        fetchImpl,
      });
      if (health?.status === "ok") return health;
      lastError = new Error("/health did not return status=ok");
    } catch (error) {
      lastError = error;
    }
    await delay(250);
  }
  throw new Error(lastError?.message || `API health did not become ready within ${timeoutMs}ms.`);
}

async function requestJson({ apiBaseUrl, path, headers, timeoutMs, fetchImpl }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(`${apiBaseUrl}${path}`, {
      method: "GET",
      headers: { ...headers, connection: "close" },
      signal: controller.signal,
    });
    const text = await response.text();
    const json = text ? JSON.parse(text) : {};
    if (!response.ok) {
      throw new Error(`${path} returned HTTP ${response.status}`);
    }
    return json;
  } catch (error) {
    if (error?.name === "AbortError") throw new Error(`${path} request timed out after ${timeoutMs}ms.`);
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

async function stopChildProcess(child, state) {
  if (!child || state.closed) return { terminated: true, alreadyExited: true };
  child.kill("SIGTERM");
  const graceful = await Promise.race([state.closePromise.then(() => true), delay(1500).then(() => false)]);
  if (!graceful && !state.closed) {
    child.kill("SIGKILL");
    await Promise.race([state.closePromise, delay(1500)]);
  }
  return { terminated: state.closed, alreadyExited: false };
}

async function findFreePort() {
  const probe = createServer();
  await new Promise((resolveListen, reject) => {
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", resolveListen);
  });
  const address = probe.address();
  const port = typeof address === "object" && address ? address.port : 0;
  await new Promise((resolveClose) => probe.close(resolveClose));
  if (!port) throw new Error("Unable to allocate a local API port.");
  return port;
}

function buildSeedHeaders(operatorId) {
  const headers = { "content-type": "application/json" };
  if (operatorId) headers["x-erp-user-id"] = operatorId;
  return headers;
}

function buildApiStartupStage(runtimeResult = {}) {
  const ready = runtimeResult.startupReady === true && runtimeResult.health?.status === "ok";
  return {
    key: "api-runtime-startup",
    label: "API 运行态启动",
    status: ready ? "passed" : "blocked",
    ready,
    detail: ready
      ? "API 已用安全 env 启动并通过 /health。"
      : runtimeResult.error?.message || "API 未能在限定时间内通过 /health。",
    summary: {
      label: ready ? "1/1 通过" : "0/1 通过",
      passedCount: ready ? 1 : 0,
      totalCount: 1,
      blockingCount: ready ? 0 : 1,
      warningCount: 0,
    },
    evidence: {
      healthStatus: cleanString(runtimeResult.health?.status || "unavailable"),
      service: cleanString(runtimeResult.health?.service || ""),
      openapiValid: runtimeResult.health?.openapi?.valid === true,
      openapiPathCount: numberOrZero(runtimeResult.health?.openapi?.pathCount),
      apiBaseUrlIncluded: true,
      apiCommandValueIncluded: false,
      apiCommandArgsIncluded: false,
      stdoutIncluded: false,
      stderrIncluded: false,
    },
    nextAction: ready
      ? "继续读取 /api/system/v1-readiness 并确认当前运行态是生产 profile。"
      : runtimeResult.externalApiProbed === true
        ? "先确认生产 API 长驻服务、反向代理和健康检查可访问，再重跑 runtime smoke。"
        : "先用同一份 env 手工启动 API 定位失败，再重跑 runtime smoke。",
  };
}

function buildRuntimeProfileStage(runtimeResult = {}) {
  const checks = buildRuntimeProfileChecks(runtimeResult);
  const passedCount = checks.filter((item) => item.status === "passed").length;
  const blockingItems = checks.filter((item) => item.status !== "passed");
  return {
    key: "runtime-production-profile",
    label: "当前 API 生产 profile 确认",
    status: blockingItems.length === 0 && checks.length > 0 ? "passed" : "blocked",
    ready: blockingItems.length === 0 && checks.length > 0,
    detail:
      blockingItems.length === 0 && checks.length > 0
        ? "当前 API 运行态已显示 PostgreSQL profile、对象存储和系统持久化门禁通过。"
        : `${blockingItems.length || 1} 项运行态生产 profile 检查仍阻塞。`,
    summary: {
      label: `${passedCount}/${checks.length || 6} 通过`,
      passedCount,
      totalCount: checks.length || 6,
      blockingCount: blockingItems.length || (checks.length === 0 ? 1 : 0),
      warningCount: 0,
    },
    checks,
    blockingItems: blockingItems.map((item) => ({
      key: item.key,
      label: item.label,
      status: item.status,
      detail: item.detail,
    })),
    evidence: {
      systemReadinessStatus: cleanString(runtimeResult.systemReadiness?.status || "unavailable"),
      systemReadinessReady: runtimeResult.systemReadiness?.ready === true,
      repositoryCount: numberOrZero(runtimeResult.systemReadiness?.summary?.totalCount || runtimeResult.systemReadiness?.repositories?.length),
      localRepositoryCount: numberOrZero(runtimeResult.systemReadiness?.localRepositoryCount),
      attachmentObjectStorageKind: cleanString(runtimeResult.health?.seed?.attachmentObjectStorage || ""),
      statementExportObjectStorageKind: cleanString(runtimeResult.health?.seed?.statementExportObjectStorage || ""),
      repositoryProfile: cleanString(runtimeResult.health?.seed?.v1PersistenceProfile?.repositoryProfile || ""),
      rawRepositoryNamesIncluded: false,
    },
    nextAction:
      blockingItems.length === 0 && checks.length > 0
        ? "保存 runtime smoke 留证，继续补真实打印链路和司机真机阶段。"
        : "用生产 PostgreSQL profile 和 object_storage 配置重启 API 后重跑。",
  };
}

function buildRuntimeProfileChecks(runtimeResult = {}) {
  if (runtimeResult.startupReady !== true) {
    return [
      {
        key: "api-startup-required",
        label: "API 必须先启动",
        status: "pending",
        detail: runtimeResult.error?.message || "API 未启动，无法读取运行态 profile。",
      },
    ];
  }
  const health = runtimeResult.health || {};
  const seed = health.seed || {};
  const systemReadiness = runtimeResult.systemReadiness || {};
  const localPersistenceAccepted =
    systemReadiness.localPersistenceAcceptance?.accepted === true ||
    systemReadiness.safeguards?.localPersistenceAcceptedForV1 === true;
  const profile = seed.v1PersistenceProfile || {};
  const productionEnvFileApplication = seed.productionEnvFileApplication || {};
  const repositoryProfile = cleanString(profile.repositoryProfile);
  const unsupportedRepositoryCount = numberOrZero(profile.unsupportedRepositoryCount);
  const attachmentStorageKind = cleanString(seed.attachmentObjectStorage);
  const statementExportStorageKind = cleanString(seed.statementExportObjectStorage);
  return [
    criterion({
      key: "health-ok",
      label: "API health 可访问",
      passed: health.status === "ok",
      detail: health.status === "ok" ? "Health endpoint returned ok." : "Health endpoint is not ok.",
    }),
    criterion({
      key: "runtime-production-env-file-applied",
      label: "当前 API 已应用安全生产 env 文件",
      passed:
        productionEnvFileApplication.applied === true &&
        productionEnvFileApplication.ready === true &&
        productionEnvFileApplication.auditReady === true,
      detail:
        productionEnvFileApplication.applied === true &&
        productionEnvFileApplication.ready === true &&
        productionEnvFileApplication.auditReady === true
          ? "Runtime health reports audited production env file application before process env mutation."
          : cleanString(productionEnvFileApplication.nextAction) ||
            "当前 API 未证明通过 ERP_V1_PRODUCTION_ENV_FILE 应用了已审计安全 env 文件。",
    }),
    criterion({
      key: "postgres-repository-profile",
      label: "运行态使用 PostgreSQL repository profile",
      passed: repositoryProfile === "postgres" && unsupportedRepositoryCount === 0,
      detail:
        repositoryProfile === "postgres" && unsupportedRepositoryCount === 0
          ? "Runtime health reports PostgreSQL repository profile and no unsupported repository."
          : "当前 health 未显示 PostgreSQL repository profile 或仍有不支持 PostgreSQL 的仓储。",
    }),
    criterion({
      key: "system-persistence-ready",
      label: "系统 V1 持久化门禁通过",
      passed: systemReadiness.ready === true && !localPersistenceAccepted,
      detail:
        systemReadiness.ready === true && !localPersistenceAccepted
          ? "System V1 persistence readiness passed without local acceptance bypass."
          : "系统持久化门禁未通过，或仍启用了本地持久化 V1 接受旁路。",
    }),
    criterion({
      key: "attachment-object-storage-runtime",
      label: "附件运行态为对象存储",
      passed: attachmentStorageKind === "object_storage",
      detail:
        attachmentStorageKind === "object_storage"
          ? "Runtime health reports attachment object storage."
          : "当前附件运行态不是 object_storage。",
    }),
    criterion({
      key: "statement-export-object-storage-runtime",
      label: "对账导出运行态为对象存储",
      passed: statementExportStorageKind === "object_storage",
      detail:
        statementExportStorageKind === "object_storage"
          ? "Runtime health reports statement export object storage."
          : "当前对账导出运行态不是 object_storage。",
    }),
  ];
}

function criterion({ key, label, passed, detail }) {
  return {
    key,
    label,
    status: passed ? "passed" : "pending",
    ready: passed === true,
    detail,
  };
}

function buildRuntimeSnapshot(runtimeResult = {}) {
  return {
    apiBaseUrl: cleanString(runtimeResult.apiBaseUrl),
    operatorId: cleanString(runtimeResult.operatorId),
    port: numberOrZero(runtimeResult.port),
    runtimeMode: cleanString(runtimeResult.runtimeMode || (runtimeResult.externalApiProbed ? "external_service" : "spawned_temporary_api")),
    externalApiProbed: runtimeResult.externalApiProbed === true,
    startupReady: runtimeResult.startupReady === true,
    health: {
      status: cleanString(runtimeResult.health?.status || "unavailable"),
      service: cleanString(runtimeResult.health?.service || ""),
      openapiValid: runtimeResult.health?.openapi?.valid === true,
      openapiPathCount: numberOrZero(runtimeResult.health?.openapi?.pathCount),
      openapiSchemaCount: numberOrZero(runtimeResult.health?.openapi?.schemaCount),
    },
    repositoryProfile: {
      repositoryProfile: cleanString(runtimeResult.health?.seed?.v1PersistenceProfile?.repositoryProfile || ""),
      unsupportedRepositoryCount: numberOrZero(runtimeResult.health?.seed?.v1PersistenceProfile?.unsupportedRepositoryCount),
      postgresRepositoryDefaultsApplied: numberOrZero(
        runtimeResult.health?.seed?.v1PersistenceProfile?.postgresRepositoryDefaultsApplied,
      ),
      connectionStringExposed: runtimeResult.health?.seed?.v1PersistenceProfile?.connectionStringExposed === true,
    },
    storageProfile: {
      attachmentObjectStorageKind: cleanString(runtimeResult.health?.seed?.attachmentObjectStorage || ""),
      statementExportObjectStorageKind: cleanString(runtimeResult.health?.seed?.statementExportObjectStorage || ""),
    },
    productionEnvFileApplication: {
      status: cleanString(runtimeResult.health?.seed?.productionEnvFileApplication?.status || "unknown"),
      ready: runtimeResult.health?.seed?.productionEnvFileApplication?.ready === true,
      applied: runtimeResult.health?.seed?.productionEnvFileApplication?.applied === true,
      selectedSourceKind: cleanString(runtimeResult.health?.seed?.productionEnvFileApplication?.selectedSourceKind || "none"),
      configuredEnvFileCount: numberOrZero(runtimeResult.health?.seed?.productionEnvFileApplication?.configuredEnvFileCount),
      assignmentCount: numberOrZero(runtimeResult.health?.seed?.productionEnvFileApplication?.assignmentCount),
      auditReady: runtimeResult.health?.seed?.productionEnvFileApplication?.auditReady === true,
      auditStatus: cleanString(runtimeResult.health?.seed?.productionEnvFileApplication?.auditStatus || "unknown"),
      auditBlockingCount: numberOrZero(runtimeResult.health?.seed?.productionEnvFileApplication?.auditBlockingCount),
      auditWarningCount: numberOrZero(runtimeResult.health?.seed?.productionEnvFileApplication?.auditWarningCount),
    },
    systemReadiness: {
      status: cleanString(runtimeResult.systemReadiness?.status || "unavailable"),
      ready: runtimeResult.systemReadiness?.ready === true,
      summaryLabel: cleanString(runtimeResult.systemReadiness?.summary?.label || ""),
      localRepositoryCount: numberOrZero(runtimeResult.systemReadiness?.localRepositoryCount),
      localMemoryCount: numberOrZero(runtimeResult.systemReadiness?.localMemoryCount),
      localPersistenceAcceptedForV1:
        runtimeResult.systemReadiness?.localPersistenceAcceptance?.accepted === true ||
        runtimeResult.systemReadiness?.safeguards?.localPersistenceAcceptedForV1 === true,
    },
    error: runtimeResult.error || null,
  };
}

function sanitizeFindings(items = []) {
  if (!Array.isArray(items)) return [];
  return items.slice(0, 8).map((item) => ({
    key: cleanString(item.key),
    label: cleanString(item.label),
    status: cleanString(item.status || item.severity || "pending"),
    detail: cleanString(item.detail || item.blockingDetail || item.warningDetail || item.okDetail),
    variables: Array.isArray(item.variables) ? item.variables.map(cleanString).filter(Boolean).slice(0, 12) : [],
  }));
}

function buildNextActions(stages) {
  const blocked = stages.filter((item) => item.status !== "passed");
  if (blocked.length === 0) {
    return [
      "把 runtime smoke 的 latest.md / latest.json 加入第一阶段现场留证。",
      "继续执行真实打印链路：标签机 / 针式机、CUPS、出纸、扫码和纸张对位。",
    ];
  }
  return blocked
    .map((item) => cleanString(item.nextAction))
    .filter(Boolean)
    .slice(0, 8);
}

function writeProductionRuntimeSmokeArtifacts(report, { outputDir = defaultOutputDir } = {}) {
  mkdirSync(outputDir, { recursive: true });
  const safeTimestamp = cleanString(report.checkedAt || new Date().toISOString()).replace(/[:.]/g, "-");
  const json = `${JSON.stringify(report, null, 2)}\n`;
  const markdown = formatProductionRuntimeSmoke(report);
  const jsonPath = join(outputDir, `runtime-smoke-${safeTimestamp}.json`);
  const markdownPath = join(outputDir, `runtime-smoke-${safeTimestamp}.md`);
  const latestJsonPath = join(outputDir, "latest.json");
  const latestMarkdownPath = join(outputDir, "latest.md");
  writeFileSync(jsonPath, json);
  writeFileSync(markdownPath, markdown);
  writeFileSync(latestJsonPath, json);
  writeFileSync(latestMarkdownPath, markdown);
  return {
    outputDir,
    jsonPath,
    markdownPath,
    latestJsonPath,
    latestMarkdownPath,
  };
}

function formatProductionRuntimeSmoke(report) {
  const lines = [
    "# V1 Production Runtime Smoke",
    "",
    `Status: ${report.ready ? "READY" : "BLOCKED"} (${report.summary.label})`,
    `Checked at: ${report.checkedAt}`,
    `Env files checked: ${Number(report.envFileCount) || 0}`,
    `Env file source: ${report.envFileSourceLabel || "未传入 env 文件"}`,
    `Env file from production setup: ${yesNo(report.envFileFromProductionSetup)}`,
    `Runtime mode: ${report.runtime.runtimeMode}`,
    `API base URL: ${report.runtime.apiBaseUrl}`,
    "",
    "## Stages",
  ];
  for (const stage of report.stages) {
    lines.push(`- ${stage.status.toUpperCase()} ${stage.label}: ${stage.detail}`);
    if (stage.nextAction && stage.status !== "passed") lines.push(`  - Next: ${stage.nextAction}`);
  }
  lines.push(
    "",
    "## Runtime Snapshot",
    `- Health: ${report.runtime.health.status}`,
    `- Repository profile: ${report.runtime.repositoryProfile.repositoryProfile || "unknown"}`,
    `- Attachment storage: ${report.runtime.storageProfile.attachmentObjectStorageKind || "unknown"}`,
    `- Statement export storage: ${report.runtime.storageProfile.statementExportObjectStorageKind || "unknown"}`,
    `- Production env applied: ${yesNo(report.runtime.productionEnvFileApplication.applied)}`,
    `- System readiness: ${report.runtime.systemReadiness.status || "unknown"} ${report.runtime.systemReadiness.summaryLabel}`,
    "",
    "## Safeguards",
    `- Read-only HTTP probes only: ${yesNo(report.safeguards.readOnlyHttpProbesOnly)}`,
    `- API process spawned: ${yesNo(report.safeguards.apiProcessSpawned)}`,
    `- API process terminated: ${yesNo(report.safeguards.apiProcessTerminated)}`,
    `- Env file read from production setup: ${yesNo(report.safeguards.envFileReadFromProductionSetup)}`,
    `- Migration apply executed: ${yesNo(report.safeguards.migrationApplyExecuted)}`,
    `- Business data mutated: ${yesNo(report.safeguards.businessDataMutated)}`,
    `- Physical printer called: ${yesNo(report.safeguards.physicalPrinterCalled)}`,
    `- Env values exposed: ${yesNo(report.safeguards.envValuesExposed)}`,
    `- Production env applied to process: ${yesNo(report.safeguards.productionEnvAppliedToProcess)}`,
    `- Database URL exposed: ${yesNo(report.safeguards.databaseUrlExposed)}`,
    `- Object-storage endpoint exposed: ${yesNo(report.safeguards.objectStorageEndpointExposed)}`,
    `- Object-storage bucket exposed: ${yesNo(report.safeguards.objectStorageBucketExposed)}`,
    `- Secret fields exposed: ${yesNo(report.safeguards.secretFieldsExposed)}`,
    `- Command value exposed: ${yesNo(report.safeguards.commandValueExposed)}`,
    "",
    report.ready ? "## Next" : "## Next Blockers",
  );
  for (const action of report.nextActions) lines.push(`- ${action}`);
  if (report.artifacts) {
    lines.push("", "## Artifacts", `- JSON: ${report.artifacts.latestJsonPath}`, `- Markdown: ${report.artifacts.latestMarkdownPath}`);
  }
  lines.push("");
  return redactRuntimeSmokeText(lines.join("\n"));
}

function redactRuntimeSmokeReport(report) {
  return JSON.parse(redactRuntimeSmokeText(JSON.stringify(report)));
}

function redactRuntimeSmokeText(value) {
  return redactPersistenceEvidenceText(value)
    .replace(/(ERP_API_PORT|ERP_V1_READINESS_OPERATOR_ID|ERP_V1_READINESS_API_BASE_URL)=([^\s]+)/gi, "$1=[redacted]")
    .replace(/\/(?:Users|private|var|tmp)\/[^\s"'<>]+/g, "[redacted-path]");
}

function sanitizeError(error) {
  return {
    message: redactRuntimeSmokeText(error?.message || String(error)),
  };
}

function firstAction(values) {
  return Array.isArray(values) ? cleanString(values.find(Boolean) || "") : cleanString(values);
}

function cleanString(value) {
  return String(value ?? "").trim();
}

function numberOrZero(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) return 0;
  return Math.trunc(number);
}

function capText(value) {
  return String(value ?? "").slice(-4000);
}

function delay(ms) {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, ms));
}

function yesNo(value) {
  return value ? "yes" : "no";
}

export {
  buildProductionRuntimeSmoke,
  formatProductionRuntimeSmoke,
  parseArgs,
  redactRuntimeSmokeText,
  resolveProductionRuntimeSmokeEnvFiles,
  writeProductionRuntimeSmokeArtifacts,
};
