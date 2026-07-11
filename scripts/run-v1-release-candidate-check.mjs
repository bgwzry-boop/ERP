#!/usr/bin/env node

import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  defaultProductionEnvSetupJsonPath,
  productionEnvFileSourceLabel,
  resolveProductionEnvSetupEnvFiles,
} from "./productionEnvSetupEnvFileResolver.mjs";
import { validateV1FieldEvidenceManifest } from "./v1FieldEvidenceManifest.mjs";
import { loadEnvironment } from "./run-v1-production-env-preflight.mjs";

const defaultApiBaseUrl = "http://127.0.0.1:8787/api";
const defaultOutputDir = join(".erp-local-storage", "v1-release-candidate");
const defaultFieldEvidenceManifestPath = join("docs", "development", "v1-field-evidence-manifest.template.json");
const envFileAuditScript = fileURLToPath(new URL("./run-v1-production-env-file-audit.mjs", import.meta.url));
const preflightScript = fileURLToPath(new URL("./run-v1-production-env-preflight.mjs", import.meta.url));
const readinessScript = fileURLToPath(new URL("./run-v1-readiness-check.mjs", import.meta.url));
const fieldReportScript = fileURLToPath(new URL("./run-v1-field-acceptance-report.mjs", import.meta.url));

try {
  const options = parseArgs(process.argv.slice(2));
  const apiBaseUrl = normalizeApiBaseUrl(
    options.apiBaseUrl ||
      process.env.ERP_V1_RELEASE_API_BASE_URL ||
      process.env.ERP_V1_FIELD_ACCEPTANCE_API_BASE_URL ||
      process.env.ERP_V1_READINESS_API_BASE_URL ||
      process.env.VITE_ERP_API_BASE_URL ||
      defaultApiBaseUrl,
  );
  const operatorId = String(
    options.operatorId ||
      process.env.ERP_V1_RELEASE_OPERATOR_ID ||
      process.env.ERP_V1_FIELD_ACCEPTANCE_OPERATOR_ID ||
      process.env.ERP_V1_READINESS_OPERATOR_ID ||
      "U-OFFICE-A",
  ).trim();
  const driverOperatorId = String(
    options.driverOperatorId ||
      process.env.ERP_V1_RELEASE_DRIVER_OPERATOR_ID ||
      process.env.ERP_V1_FIELD_ACCEPTANCE_DRIVER_OPERATOR_ID ||
      process.env.ERP_V1_READINESS_DRIVER_OPERATOR_ID ||
      "U-DRIVER-A",
  ).trim();
  const outputDir = resolve(
    options.outputDir || process.env.ERP_V1_RELEASE_CANDIDATE_OUTPUT_DIR || defaultOutputDir,
  );
  const fieldEvidenceManifestPath = resolve(
    options.fieldEvidenceManifest ||
      process.env.ERP_V1_FIELD_EVIDENCE_MANIFEST ||
      defaultFieldEvidenceManifestPath,
  );

  const envFileResolution = resolveProductionEnvSetupEnvFiles({
    envFiles: options.envFiles,
    productionEnvSetupJsonPath: options.productionEnvSetupJsonPath,
    useProductionEnvSetupEnvFile: options.useProductionEnvSetupEnvFile,
  });
  const envFileAudit = await readProductionEnvFileAudit({ envFiles: envFileResolution.envFiles });
  const envPreflight = await readProductionEnvPreflight({
    envFiles: envFileResolution.envFiles,
    useProductionEnvSetupEnvFile: envFileResolution.usedProductionEnvSetup,
    productionEnvSetupJsonPath: options.productionEnvSetupJsonPath,
  });
  const fieldEvidence = readFieldEvidenceManifest({ manifestPath: fieldEvidenceManifestPath });
  const secureRuntimeEnv = loadEnvironment({ envFiles: envFileResolution.envFiles, baseEnv: process.env });
  const runtimeAuthEnv = buildRuntimeAuthEnv({
    env: secureRuntimeEnv,
    bearerToken: options.bearerToken || process.env.ERP_V1_RELEASE_TOKEN,
    driverBearerToken:
      options.driverBearerToken ||
      process.env.ERP_V1_RELEASE_DRIVER_TOKEN,
  });
  const readiness = await readRuntimeReadiness({
    apiBaseUrl,
    operatorId,
    driverOperatorId,
    runtimeAuthEnv,
  });
  const fieldAcceptance = await writeFieldAcceptanceReport({
    apiBaseUrl,
    operatorId,
    driverOperatorId,
    outputDir: join(outputDir, "field-acceptance"),
    runtimeAuthEnv,
  });
  const report = buildReleaseCandidateReport({
    apiBaseUrl,
    operatorId,
    driverOperatorId,
    envFileAudit,
    envPreflight,
    envFileSource: envFileResolution.source,
    envFileSourceSummary: envFileResolution.summary,
    envFileFromProductionSetup: envFileResolution.usedProductionEnvSetup,
    fieldEvidence,
    readiness,
    fieldAcceptance,
  });
  const files = writeReportFiles({ outputDir, report });
  const commandResult = buildCommandResult({ report, files });

  if (options.json) {
    process.stdout.write(`${JSON.stringify(commandResult, null, 2)}\n`);
  } else {
    process.stdout.write(formatCommandResult(commandResult));
  }

  process.exitCode = report.ready || options.allowBlockedExitZero ? 0 : 2;
} catch (error) {
  const message = error?.message || String(error);
  if (process.argv.includes("--json")) {
    process.stdout.write(`${JSON.stringify({ status: "error", ready: false, error: { message } }, null, 2)}\n`);
  } else {
    process.stderr.write(`V1 release candidate check failed: ${message}\n`);
  }
  process.exitCode = 1;
}

function parseArgs(args) {
  const options = { envFiles: [], productionEnvSetupJsonPath: defaultProductionEnvSetupJsonPath };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--json") {
      options.json = true;
      continue;
    }
    if (arg === "--allow-blocked-exit-zero") {
      options.allowBlockedExitZero = true;
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
    if (arg === "--driver-operator-id") {
      options.driverOperatorId = readValue(args, index, arg);
      index += 1;
      continue;
    }
    if (arg === "--bearer-token") {
      options.bearerToken = readValue(args, index, arg);
      index += 1;
      continue;
    }
    if (arg === "--driver-bearer-token") {
      options.driverBearerToken = readValue(args, index, arg);
      index += 1;
      continue;
    }
    if (arg === "--output-dir") {
      options.outputDir = readValue(args, index, arg);
      index += 1;
      continue;
    }
    if (arg === "--field-evidence-manifest") {
      options.fieldEvidenceManifest = readValue(args, index, arg);
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
    "Usage: node scripts/run-v1-release-candidate-check.mjs [options]",
    "",
    "Options:",
    "  --env-file <path>          Load V1 production env file for preflight. Can be repeated.",
    "  --use-production-env-setup-env-file",
    "                             Reuse the secure env file recorded by production env setup when no --env-file is passed.",
    "  --production-env-setup-json <path>",
    "                             Production env setup JSON, default .erp-local-storage/v1-production-env-setup/latest.json.",
    "  --api-base-url <url>       ERP API base URL, default http://127.0.0.1:8787/api",
    "  --operator-id <id>         Office operator id, default U-OFFICE-A",
    "  --driver-operator-id <id>  Driver operator id, default U-DRIVER-A",
    "  --bearer-token <token>     Deprecated compatibility input; prefer ERP_V1_READINESS_TOKEN in secure env",
    "  --driver-bearer-token <token> Deprecated compatibility input; prefer ERP_V1_READINESS_DRIVER_TOKEN",
    "  --output-dir <dir>         Output directory, default .erp-local-storage/v1-release-candidate",
    "  --field-evidence-manifest <path> Filled V1 field-evidence manifest path; defaults to the checked-in template, which remains blocked",
    "  --allow-blocked-exit-zero  Write a blocked report but exit 0 for archival workflows",
    "  --json                     Print machine-readable command summary",
    "",
    "Exit codes:",
    "  0  V1 release candidate gates are ready, or --allow-blocked-exit-zero was used",
    "  1  Runner/API/read/write error",
    "  2  Release candidate is readable but still blocked",
  ].join("\n");
}

async function readProductionEnvPreflight({ envFiles, useProductionEnvSetupEnvFile = false, productionEnvSetupJsonPath }) {
  const args = [preflightScript, "--json"];
  if (useProductionEnvSetupEnvFile) {
    args.push("--use-production-env-setup-env-file", "--production-env-setup-json", productionEnvSetupJsonPath);
  } else {
    for (const envFile of envFiles) args.push("--env-file", envFile);
  }
  const run = await runNode({ args, timeoutMs: 15000, label: "V1 production env preflight" });
  const report = parseJsonRun(run, "V1 production env preflight");
  if (run.status !== 0 && run.status !== 2) {
    throw new Error(report?.error?.message || `V1 production env preflight exited ${run.status}`);
  }
  if (report?.scope !== "v1_production_environment_preflight") {
    throw new Error("V1 production env preflight returned an unexpected report shape.");
  }
  return report;
}

async function readProductionEnvFileAudit({ envFiles }) {
  if (!envFiles.length) return buildSkippedEnvFileAudit();
  const args = [envFileAuditScript, "--json"];
  for (const envFile of envFiles) args.push("--env-file", envFile);
  const run = await runNode({ args, timeoutMs: 15000, label: "V1 production env file audit" });
  const report = parseJsonRun(run, "V1 production env file audit");
  if (run.status !== 0 && run.status !== 2) {
    throw new Error(report?.error?.message || `V1 production env file audit exited ${run.status}`);
  }
  if (report?.scope !== "v1_production_env_file_audit") {
    throw new Error("V1 production env file audit returned an unexpected report shape.");
  }
  return { included: true, ...report };
}

function buildSkippedEnvFileAudit() {
  return {
    included: false,
    scope: "v1_production_env_file_audit",
    status: "not_applicable",
    ready: true,
    checkedAt: new Date().toISOString(),
    envFileCount: 0,
    summary: {
      label: "未提供 --env-file，未执行 env 文件安全审计",
      fileCount: 0,
      blockingCount: 0,
      warningCount: 0,
      passedCount: 0,
      placeholderAssignmentCount: 0,
      uncommentedAssignmentCount: 0,
      sensitiveVariableNameCount: 0,
    },
    files: [],
    blockingFindings: [],
    warningFindings: [],
    safeguards: {
      nonMutating: true,
      envValuesExposed: false,
      connectionStringExposed: false,
      secretFieldsExposed: false,
      commandValueExposed: false,
      commentsCopied: false,
      rawLineContentCopied: false,
    },
    nextActions: [
      "如使用 production env setup，发布前传入 --use-production-env-setup-env-file 复用安全 env 文件；只有绕开 setup 报告时才显式传入 --env-file <secure-env-file>。",
    ],
  };
}

function readFieldEvidenceManifest({ manifestPath }) {
  if (!existsSync(manifestPath)) {
    throw new Error(`V1 field evidence manifest file is missing: ${displayInputPath(manifestPath)}`);
  }
  let manifest = null;
  try {
    manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  } catch (error) {
    throw new Error(`V1 field evidence manifest is not readable JSON: ${displayInputPath(manifestPath)}`);
  }
  const report = validateV1FieldEvidenceManifest(manifest);
  return {
    manifestPath: displayInputPath(manifestPath),
    report,
  };
}

async function readRuntimeReadiness({
  apiBaseUrl,
  operatorId,
  driverOperatorId,
  runtimeAuthEnv,
}) {
  const args = [
    readinessScript,
    "--api-base-url",
    apiBaseUrl,
    "--operator-id",
    operatorId,
    "--driver-operator-id",
    driverOperatorId,
    "--json",
  ];
  const run = await runNode({
    args,
    env: { ...process.env, ...runtimeAuthEnv },
    timeoutMs: 25000,
    label: "V1 runtime readiness",
  });
  const report = parseJsonRun(run, "V1 runtime readiness");
  if (run.status !== 0 && run.status !== 2) {
    throw new Error(report?.error?.message || `V1 runtime readiness exited ${run.status}`);
  }
  if (report?.scope !== "v1_go_live_readiness") {
    throw new Error("V1 runtime readiness returned an unexpected report shape.");
  }
  return report;
}

async function writeFieldAcceptanceReport({
  apiBaseUrl,
  operatorId,
  driverOperatorId,
  outputDir,
  runtimeAuthEnv,
}) {
  const args = [
    fieldReportScript,
    "--api-base-url",
    apiBaseUrl,
    "--operator-id",
    operatorId,
    "--driver-operator-id",
    driverOperatorId,
    "--output-dir",
    outputDir,
    "--allow-blocked-exit-zero",
    "--json",
  ];
  const run = await runNode({
    args,
    env: { ...process.env, ...runtimeAuthEnv },
    timeoutMs: 30000,
    label: "V1 field acceptance report",
  });
  const commandResult = parseJsonRun(run, "V1 field acceptance report");
  if (run.status !== 0) {
    throw new Error(commandResult?.error?.message || `V1 field acceptance report exited ${run.status}`);
  }
  const report = readGeneratedJson(commandResult?.files?.json, "V1 field acceptance report JSON");
  if (report?.scope !== "v1_field_acceptance_report") {
    throw new Error("V1 field acceptance report file has an unexpected shape.");
  }
  return { commandResult, report };
}

function runNode({ args, timeoutMs, label, env = process.env }) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, {
      cwd: process.cwd(),
      env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    const timeout = setTimeout(() => {
      child.kill("SIGTERM");
      reject(new Error(`${label} timed out after ${timeoutMs}ms`));
    }, timeoutMs);
    timeout.unref?.();
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.on("close", (status, signal) => {
      clearTimeout(timeout);
      resolve({ status, signal, stdout, stderr });
    });
  });
}

function buildRuntimeAuthEnv({ env = {}, bearerToken = "", driverBearerToken = "" } = {}) {
  const keys = [
    "ERP_V1_READINESS_OPERATOR_ID",
    "ERP_V1_READINESS_LOGIN_NAME",
    "ERP_V1_READINESS_PASSWORD",
    "ERP_V1_READINESS_DRIVER_OPERATOR_ID",
    "ERP_V1_READINESS_DRIVER_LOGIN_NAME",
    "ERP_V1_READINESS_DRIVER_PASSWORD",
  ];
  const result = {};
  for (const key of keys) {
    if (String(env[key] ?? "").trim()) result[key] = env[key];
  }
  const resolvedBearerToken = bearerToken || env.ERP_V1_READINESS_TOKEN;
  const resolvedDriverBearerToken = driverBearerToken || env.ERP_V1_READINESS_DRIVER_TOKEN;
  if (resolvedBearerToken) result.ERP_V1_READINESS_TOKEN = resolvedBearerToken;
  if (resolvedDriverBearerToken) result.ERP_V1_READINESS_DRIVER_TOKEN = resolvedDriverBearerToken;
  return result;
}

function parseJsonRun(run, label) {
  try {
    return JSON.parse(run.stdout || "{}");
  } catch {
    throw new Error(`${label} returned unreadable JSON; exit=${run.status}`);
  }
}

function readGeneratedJson(displayPathValue, label) {
  if (!displayPathValue) throw new Error(`${label} path was not returned.`);
  const fullPath = resolve(process.cwd(), displayPathValue);
  if (!existsSync(fullPath)) throw new Error(`${label} file is missing: ${displayPathValue}`);
  return JSON.parse(readFileSync(fullPath, "utf8"));
}

function buildReleaseCandidateReport({
  apiBaseUrl,
  operatorId,
  driverOperatorId,
  envFileAudit,
  envPreflight,
  envFileSource,
  envFileSourceSummary,
  envFileFromProductionSetup,
  fieldEvidence,
  readiness,
  fieldAcceptance,
}) {
  const envFileAuditReady = envFileAudit.ready !== false;
  const envGateReady = envPreflight.ready === true && envFileAuditReady;
  const envGate = buildGate({
    key: "production_env_preflight",
    label: "生产环境变量预检",
    ready: envGateReady,
    summary: buildEnvGateSummary({ envPreflight, envFileAudit }),
    detail: buildEnvGateDetail({ envPreflight, envFileAudit }),
    files: {},
  });
  const fieldEvidenceGate = buildGate({
    key: "field_evidence_manifest",
    label: "现场证据 manifest",
    ready: fieldEvidence.report.ready === true,
    summary: fieldEvidence.report.summary?.label,
    detail: fieldEvidence.report.ready
      ? "现场证据 manifest 已通过，必填证据、签字和 V1/V2 边界确认完整。"
      : fieldEvidence.report.schemaValid === false
        ? "现场证据 manifest 格式错误或缺少必需分组。"
        : "现场证据 manifest 仍未填满，不能作为 V1 现场签字依据。",
    files: { manifest: fieldEvidence.manifestPath },
  });
  const runtimeGate = buildGate({
    key: "runtime_readiness",
    label: "运行时 V1 readiness",
    ready: readiness.ready === true,
    summary: readiness.summary?.label,
    detail: readiness.ready
      ? "运行中 ERP API 的 11 项 V1 门禁已通过。"
      : `运行中 ERP API 仍有 ${numberOrZero(readiness.summary?.blockingCount)} 项门禁阻塞。`,
    files: {},
  });
  const fieldGate = buildGate({
    key: "field_acceptance_package",
    label: "现场验收报告包",
    ready: fieldAcceptance.report.ready === true,
    summary: fieldAcceptance.report.summary?.label,
    detail: fieldAcceptance.report.ready
      ? "现场验收 Markdown / JSON 报告已生成且门禁为 ready。"
      : "现场验收 Markdown / JSON 报告已生成，但结论仍是 blocked。",
    files: fieldAcceptance.commandResult.files || {},
  });
  const gates = [envGate, fieldEvidenceGate, runtimeGate, fieldGate];
  const ready = gates.every((gate) => gate.ready);
  const blockingItems = collectBlockingItems({
    envFileAudit,
    envPreflight,
    fieldEvidence: fieldEvidence.report,
    readiness,
    fieldReport: fieldAcceptance.report,
  });
  const v1Scope = buildV1Scope();
  const v2Differences = buildV2Differences();
  const nextActions = buildNextActions({ ready, gates, blockingItems });
  const summary = {
    label: `${gates.filter((gate) => gate.ready).length}/${gates.length} 发布门禁通过`,
    passedGateCount: gates.filter((gate) => gate.ready).length,
    totalGateCount: gates.length,
    blockingCount: blockingItems.length,
    envFileSource: stringValue(envFileSource || "none"),
    envFileSourceLabel: productionEnvFileSourceLabel(envFileSource),
    envFileFromProductionSetup: envFileFromProductionSetup === true,
    envPreflight: envPreflight.summary?.label || "",
    envFileAudit: envFileAudit.summary?.label || "",
    fieldEvidence: fieldEvidence.report.summary?.label || "",
    runtimeReadiness: readiness.summary?.label || "",
    fieldAcceptance: fieldAcceptance.report.summary?.label || "",
  };
  const envFileAuditSummary = summarizeEnvFileAudit(envFileAudit);
  const envPreflightSummary = summarizeEnvPreflight(envPreflight);

  return {
    scope: "v1_release_candidate_check",
    status: ready ? "ready" : "blocked",
    ready,
    generatedAt: new Date().toISOString(),
    apiBaseUrl: sanitizeApiBaseUrl(apiBaseUrl),
    operatorId,
    driverOperatorId,
    envFileSource: stringValue(envFileSource || "none"),
    envFileSourceLabel: productionEnvFileSourceLabel(envFileSource),
    envFileSourceSummary: stringValue(envFileSourceSummary),
    envFileFromProductionSetup: envFileFromProductionSetup === true,
    conclusion: ready
      ? "当前生产环境预检、现场证据 manifest、运行时 readiness 和现场验收报告均为 READY；可以进入负责人签字和小范围真实订单试运行。"
      : "当前仍不能声明 V1 已完成或可真实上线；必须先处理阻塞项。",
    summary,
    gates,
    blockingItems,
    envFileAudit: envFileAuditSummary,
    envPreflight: envPreflightSummary,
    v1Scope,
    v2Differences,
    fieldEvidenceManifest: {
      path: fieldEvidence.manifestPath,
      status: fieldEvidence.report.status,
      ready: fieldEvidence.report.ready,
      summary: fieldEvidence.report.summary,
    },
    fieldAcceptanceFiles: fieldAcceptance.commandResult.files || {},
    safeguards: buildSafeguards({
      envFileAudit,
      envPreflight,
      envFileFromProductionSetup,
      fieldEvidence: fieldEvidence.report,
      readiness,
      fieldReport: fieldAcceptance.report,
    }),
    nextActions,
  };
}

function buildGate({ key, label, ready, summary, detail, files }) {
  return {
    key,
    label,
    status: ready ? "passed" : "blocked",
    ready: Boolean(ready),
    summary: stringValue(summary),
    detail: stringValue(detail),
    files,
  };
}

function buildEnvGateSummary({ envPreflight, envFileAudit }) {
  const preflightLabel = envPreflight.summary?.label || "生产环境变量预检未返回";
  if (envFileAudit.included === false) return preflightLabel;
  const auditLabel = envFileAudit.summary?.label || "env 文件安全审计未返回";
  return `${preflightLabel}；${auditLabel}`;
}

function buildEnvGateDetail({ envPreflight, envFileAudit }) {
  const envBlockedCount = numberOrZero(envPreflight.summary?.blockingCount);
  const auditBlockedCount = numberOrZero(envFileAudit.summary?.blockingCount);
  if (envPreflight.ready === true && envFileAudit.ready !== false) {
    return envFileAudit.included === false
      ? "生产环境变量形态已满足 V1 预检。"
      : "生产环境变量形态和 env 文件安全审计均满足 V1 预检。";
  }
  if (envPreflight.ready !== true && envFileAudit.ready === false) {
    return `生产环境变量仍有 ${envBlockedCount} 项阻塞，生产 env 文件安全审计仍有 ${auditBlockedCount} 项阻塞。`;
  }
  if (envPreflight.ready !== true) {
    return `生产环境变量仍有 ${envBlockedCount} 项阻塞。`;
  }
  return `生产 env 文件安全审计仍有 ${auditBlockedCount} 项阻塞。`;
}

function summarizeEnvFileAudit(envFileAudit) {
  const pathLabelMap = buildEnvFilePathLabelMap(envFileAudit.files);
  return {
    included: envFileAudit.included !== false,
    status: stringValue(envFileAudit.status),
    ready: envFileAudit.ready !== false,
    checkedAt: stringValue(envFileAudit.checkedAt),
    envFileCount: numberOrZero(envFileAudit.envFileCount),
    summary: envFileAudit.summary || {},
    files: normalizeEnvFileAuditFiles(envFileAudit.files, pathLabelMap),
    blockingFindings: normalizeEnvFileAuditFindings(envFileAudit.blockingFindings, pathLabelMap),
    warningFindings: normalizeEnvFileAuditFindings(envFileAudit.warningFindings, pathLabelMap),
    safeguards: {
      ...(envFileAudit.safeguards || {}),
      envFilePathExposed: false,
    },
    nextActions: Array.isArray(envFileAudit.nextActions)
      ? envFileAudit.nextActions.map((item) => stringValue(item))
      : [],
  };
}

function buildEnvFilePathLabelMap(files) {
  const map = new Map();
  if (!Array.isArray(files)) return map;
  files.forEach((file, index) => {
    const path = stringValue(file?.path);
    if (path) map.set(path, `env 文件 ${index + 1}`);
  });
  return map;
}

function redactEnvFileDisplayPath(path, pathLabelMap) {
  const cleanPath = stringValue(path);
  if (!cleanPath) return "";
  return pathLabelMap.get(cleanPath) || "env 文件";
}

function normalizeEnvFileAuditFiles(value, pathLabelMap = new Map()) {
  if (!Array.isArray(value)) return [];
  return value.map((file) => ({
    path: redactEnvFileDisplayPath(file.path, pathLabelMap),
    pathRedacted: true,
    insideWorkspace: file.insideWorkspace === true,
    git: file.git || {},
    fileMode: stringValue(file.fileMode),
    uncommentedAssignmentCount: numberOrZero(file.uncommentedAssignmentCount),
    placeholderAssignmentCount: numberOrZero(file.placeholderAssignmentCount),
    duplicateVariableCount: numberOrZero(file.duplicateVariableCount),
    sensitiveVariableNameCount: numberOrZero(file.sensitiveVariableNameCount),
    variableNames: stringArray(file.variableNames),
    placeholderVariables: stringArray(file.placeholderVariables),
    duplicateVariables: stringArray(file.duplicateVariables),
    findings: normalizeEnvFileAuditFindings(file.findings, pathLabelMap),
  }));
}

function normalizeEnvFileAuditFindings(value, pathLabelMap = new Map()) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => ({
    key: stringValue(item.key || "unknown"),
    label: stringValue(item.label || item.key || "env 文件审计项"),
    status: stringValue(item.status || "pending"),
    severity: stringValue(item.severity || "unknown"),
    file: redactEnvFileDisplayPath(item.file, pathLabelMap),
    variables: stringArray(item.variables),
    detail: stringValue(item.detail),
    nextAction: stringValue(item.nextAction),
  }));
}

function summarizeEnvPreflight(envPreflight) {
  return {
    status: stringValue(envPreflight.status),
    ready: envPreflight.ready === true,
    checkedAt: stringValue(envPreflight.checkedAt),
    envFileCount: numberOrZero(envPreflight.envFileCount),
    summary: envPreflight.summary || {},
    blockingCriteria: normalizeCriteria(envPreflight.blockingCriteria),
    warningCriteria: normalizeCriteria(envPreflight.warningCriteria),
    fixChecklist: normalizeEnvFixChecklist(envPreflight.fixChecklist),
    safeguards: envPreflight.safeguards || {},
    nextActions: Array.isArray(envPreflight.nextActions)
      ? envPreflight.nextActions.map((item) => stringValue(item))
      : [],
  };
}

function normalizeEnvFixChecklist(value) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => ({
    key: stringValue(item.key || "unknown"),
    label: stringValue(item.label || item.key || "生产环境预检项"),
    status: stringValue(item.status || "pending"),
    ready: item.ready === true,
    blocking: item.blocking !== false,
    severity: stringValue(item.severity || (item.ready ? "ok" : "blocking")),
    ownerRole: stringValue(item.ownerRole || "技术/管理"),
    requiredVariables: stringArray(item.requiredVariables),
    recommendedVariables: stringArray(item.recommendedVariables),
    configuredVariableCount: numberOrZero(item.configuredVariableCount),
    totalVariableCount: numberOrZero(item.totalVariableCount),
    missingVariables: stringArray(item.missingVariables),
    placeholderVariableCount: numberOrZero(item.placeholderVariableCount),
    placeholderVariables: stringArray(item.placeholderVariables),
    nextAction: stringValue(item.nextAction),
  }));
}

function collectBlockingItems({ envFileAudit, envPreflight, fieldEvidence, readiness, fieldReport }) {
  const items = [];
  for (const item of normalizeEnvFileAuditFindings(envFileAudit.blockingFindings)) {
    items.push({ gate: "生产 env 文件安全审计", ...item });
  }
  for (const item of normalizeCriteria(envPreflight.blockingCriteria)) {
    items.push({ gate: "生产环境变量预检", ...item });
  }
  for (const item of normalizeFieldEvidenceBlockers(fieldEvidence.blockers)) {
    items.push({ gate: "现场证据 manifest", ...item });
  }
  for (const item of normalizeCriteria(readiness.blockingCriteria)) {
    items.push({ gate: "运行时 V1 readiness", ...item });
  }
  for (const item of normalizeCriteria(fieldReport.blockingCriteria)) {
    const duplicate = items.some(
      (existing) => existing.key === item.key && existing.label === item.label && existing.detail === item.detail,
    );
    if (!duplicate) items.push({ gate: "现场验收报告包", ...item });
  }
  return items;
}

function normalizeFieldEvidenceBlockers(value) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => ({
    key: stringValue(item.key || item.groupKey || item.type || "field_evidence"),
    label: stringValue(item.groupLabel ? `${item.groupLabel} / ${item.label}` : item.label || item.key || "现场证据项"),
    status: stringValue(item.status || "pending"),
    detail: stringValue(item.reason || "补齐现场证据 manifest"),
  }));
}

function normalizeCriteria(value) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => ({
    key: stringValue(item.key || "unknown"),
    label: stringValue(item.label || item.key || "门禁项"),
    status: stringValue(item.status || "pending"),
    detail: stringValue(item.detail),
  }));
}

function buildV1Scope() {
  return [
    "办公室六个核心页可用：公共待办、订单录入、订单池、库存查询、出库交付、对账收款。",
    "订单、库存、出库、对账、附件、生产 / 打包、打印和司机端具备 API / 仓储 / 门禁边界。",
    "V1 必须用生产级 PostgreSQL / 对象存储，或经业务签字接受本地持久化风险。",
    "V1 必须完成真实打印设备、真实 CUPS 队列、司机真机和现场 QA 证据。",
    "V1 客户通知、成品图确认、异常处理和对账发送仍以人工确认闭环为主。",
  ];
}

function buildV2Differences() {
  return [
    "客户群 / 企业微信自动发送、自动回执抓取和消息风控。",
    "AI / OCR 识别客户原文、图片订单和更复杂的自动拆单纠错。",
    "路线优化、司机绩效、地图深度集成和自动派车。",
    "自动排产、插单优化、换模工单、产能预测和车间大屏联动。",
    "原材料、成本、毛利、售后责任、绩效扣款、工资和 BI 报表深化。",
    "更多外部系统集成、权限审计深化和生产运维自动化。",
  ];
}

function buildNextActions({ ready, gates, blockingItems }) {
  if (ready) {
    return [
      "由办公室、仓库、车间、司机、财务负责人复核 release-candidate 报告和现场证据。",
      "使用真实订单做小范围试运行，并留存订单、库存、打印、司机、附件和对账证据。",
      "试运行无阻塞后再扩大 V1 使用范围；V2 自动化需求继续冻结到后续版本。",
    ];
  }
  const actions = [];
  for (const gate of gates.filter((item) => !item.ready)) {
    actions.push(`${gate.label}：${gate.detail}`);
  }
  for (const item of blockingItems.slice(0, 8)) {
    const action = `${item.gate} / ${item.label}：${item.detail || "补齐该门禁证据"}`;
    if (!actions.includes(action)) actions.push(action);
  }
  return actions.slice(0, 10);
}

function buildSafeguards({ envFileAudit, envPreflight, envFileFromProductionSetup, fieldEvidence, readiness, fieldReport }) {
  const envFileSafeguards = envFileAudit.safeguards || {};
  const envSafeguards = envPreflight.safeguards || {};
  const readinessSafeguards = readiness.safeguards || {};
  const fieldSafeguards = fieldReport.safeguards || {};
  return {
    productionEnvFileAuditNonMutating: envFileSafeguards.nonMutating !== false,
    productionEnvFileValuesExposed: Boolean(envFileSafeguards.envValuesExposed),
    productionEnvFileRawLinesExposed: Boolean(envFileSafeguards.rawLineContentCopied),
    productionEnvFileCommentsCopied: Boolean(envFileSafeguards.commentsCopied),
    productionEnvFilePathExposed: Boolean(envFileSafeguards.envFilePathExposed),
    productionEnvFileReadFromProductionSetup: envFileFromProductionSetup === true,
    productionEnvPreflightNonMutating: envSafeguards.nonMutating !== false,
    connectionStringExposed: Boolean(envSafeguards.connectionStringExposed),
    objectStorageSecretsExposed: Boolean(envSafeguards.secretFieldsExposed),
    commandValueExposed: Boolean(envSafeguards.commandValueExposed || fieldSafeguards.printCommandExposed),
    commandArgsExposed: Boolean(envSafeguards.commandArgsExposed),
    spoolPathExposed: Boolean(envSafeguards.spoolPathExposed || readinessSafeguards.spoolPathExposed || fieldSafeguards.spoolPathExposed),
    payloadExposed: Boolean(envSafeguards.payloadExposed || readinessSafeguards.payloadExposed || fieldSafeguards.printPayloadExposed),
    runtimeReadOnly: readinessSafeguards.systemReadOnly !== false && fieldSafeguards.systemReadOnly !== false,
    physicalPrinterCalledByCheck: Boolean(readinessSafeguards.physicalPrinterCalled || fieldSafeguards.physicalPrinterCalledByCheck),
    driverDeliveryStatusChangedByCheck: Boolean(fieldSafeguards.driverDeliveryStatusChanged),
    fieldEvidenceRefsRedacted: fieldEvidence?.safeguards?.evidenceRefsRedacted !== false,
    fieldEvidenceRawRefsExposed: Boolean(fieldEvidence?.safeguards?.rawEvidenceRefsIncludedInReport),
    fieldEvidencePossibleSensitiveRefCount: numberOrZero(fieldEvidence?.safeguards?.possibleSensitiveEvidenceRefCount),
  };
}

function writeReportFiles({ outputDir, report }) {
  mkdirSync(outputDir, { recursive: true });
  const stamp = report.generatedAt.replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  const baseName = `v1-release-candidate-${stamp}`;
  const jsonPath = join(outputDir, `${baseName}.json`);
  const markdownPath = join(outputDir, `${baseName}.md`);
  const latestJsonPath = join(outputDir, "latest.json");
  const latestMarkdownPath = join(outputDir, "latest.md");
  writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`);
  writeFileSync(markdownPath, formatMarkdownReport(report));
  writeFileSync(latestJsonPath, `${JSON.stringify(report, null, 2)}\n`);
  writeFileSync(latestMarkdownPath, formatMarkdownReport(report));
  return {
    json: displayPath(jsonPath),
    markdown: displayPath(markdownPath),
    latestJson: displayPath(latestJsonPath),
    latestMarkdown: displayPath(latestMarkdownPath),
  };
}

function buildCommandResult({ report, files }) {
  return {
    status: report.status,
    ready: report.ready,
    generatedAt: report.generatedAt,
    summary: report.summary,
    conclusion: report.conclusion,
    files,
    envFileSource: report.envFileSource,
    envFileSourceLabel: report.envFileSourceLabel,
    envFileFromProductionSetup: report.envFileFromProductionSetup,
    envFileAudit: report.envFileAudit,
    envPreflight: report.envPreflight,
    fieldEvidenceManifest: report.fieldEvidenceManifest,
    fieldAcceptanceFiles: report.fieldAcceptanceFiles,
    blockingCount: report.blockingItems.length,
    nextActions: report.nextActions,
    v1Scope: report.v1Scope,
    v2Differences: report.v2Differences,
  };
}

function formatCommandResult(result) {
  return [
    `V1 release candidate: ${result.ready ? "READY" : "BLOCKED"} (${result.summary.label})`,
    result.conclusion,
    `Markdown: ${result.files.markdown}`,
    `JSON: ${result.files.json}`,
    result.ready ? "Next:" : "Next blockers:",
    ...(result.ready ? result.nextActions.slice(0, 3) : result.nextActions.slice(0, 8)).map((item) => `- ${item}`),
    "",
  ].join("\n");
}

function formatMarkdownReport(report) {
  const lines = [
    "# ERP V1 发布候选检查",
    "",
    `- 生成时间：${report.generatedAt}`,
    `- API：${report.apiBaseUrl}`,
    `- 办公室验收账号：${report.operatorId}`,
    `- 司机验收账号：${report.driverOperatorId}`,
    `- 生产 env 来源：${report.envFileSourceLabel || "未传入 env 文件"}；复用 production env setup：${report.envFileFromProductionSetup ? "是" : "否"}`,
    `- 结论：${report.ready ? "READY" : "BLOCKED"}（${report.summary.label}）`,
    `- 说明：${report.conclusion}`,
    "",
    "## 发布门禁",
    "",
    "| 门禁 | 状态 | 汇总 | 说明 |",
    "| --- | --- | --- | --- |",
    ...report.gates.map((gate) =>
      `| ${escapeMarkdownTable(gate.label)} | ${gate.ready ? "通过" : "阻塞"} | ${escapeMarkdownTable(gate.summary)} | ${escapeMarkdownTable(gate.detail)} |`,
    ),
    "",
    "## 当前阻塞",
    "",
    "| 来源 | 门禁 | 状态 | 说明 |",
    "| --- | --- | --- | --- |",
    ...(report.blockingItems.length
      ? report.blockingItems.map((item) =>
          `| ${escapeMarkdownTable(item.gate)} | ${escapeMarkdownTable(item.label)} | ${escapeMarkdownTable(item.status)} | ${escapeMarkdownTable(item.detail)} |`,
        )
      : ["| 无 | 无 | passed | 当前发布候选检查未返回阻塞项 |"]),
    "",
    "## V1 范围",
    "",
    ...report.v1Scope.map((item) => `- ${item}`),
    "",
    "## V2 计划差异",
    "",
    ...report.v2Differences.map((item) => `- ${item}`),
    "",
    "## 生产 env 文件安全审计",
    "",
    `- 汇总：${report.envFileAudit?.summary?.label || "未返回"}`,
    `- 状态：${report.envFileAudit?.ready ? "READY" : "BLOCKED"}`,
    `- 是否执行：${report.envFileAudit?.included ? "已执行" : "未执行（未提供 --env-file）"}`,
    `- 文件数：${numberOrZero(report.envFileAudit?.envFileCount)}`,
    "",
    "| 文件 | KEY=VALUE 行 | 占位变量 | 重复变量 | 敏感变量名数 |",
    "| --- | --- | --- | --- | --- |",
    ...(report.envFileAudit?.files?.length
      ? report.envFileAudit.files.map((file) =>
          `| ${escapeMarkdownTable(file.path)} | ${numberOrZero(file.uncommentedAssignmentCount)} | ${numberOrZero(file.placeholderAssignmentCount)} | ${numberOrZero(file.duplicateVariableCount)} | ${numberOrZero(file.sensitiveVariableNameCount)} |`,
        )
      : ["| 未提供 | 0 | 0 | 0 | 0 |"]),
    "",
    "| 文件 | 审计项 | 状态 | 变量名 | 下一步 |",
    "| --- | --- | --- | --- | --- |",
    ...buildEnvFileAuditFindingRows(report.envFileAudit),
    "",
    "## 生产环境预检修正清单",
    "",
    `- 汇总：${report.envPreflight?.summary?.label || "未返回"}`,
    `- 状态：${report.envPreflight?.ready ? "READY" : "BLOCKED"}`,
    "",
    "| 负责人 | 项目 | 级别 | 配置数 | 需补变量 | 下一步 |",
    "| --- | --- | --- | --- | --- | --- |",
    ...(report.envPreflight?.fixChecklist?.length
      ? report.envPreflight.fixChecklist.map((item) =>
          `| ${escapeMarkdownTable(item.ownerRole)} | ${escapeMarkdownTable(item.label)} | ${escapeMarkdownTable(item.severity)} | ${escapeMarkdownTable(`${item.configuredVariableCount}/${item.totalVariableCount}`)} | ${escapeMarkdownTable(item.missingVariables.join(", ") || "无")} | ${escapeMarkdownTable(item.nextAction)} |`,
        )
      : ["| 技术/管理 | 未返回 | unknown | 0/0 | 未返回 | 重新运行生产环境变量预检 |"]),
    "",
    "## 现场证据 manifest",
    "",
    `- Manifest：${report.fieldEvidenceManifest?.path || "未返回"}`,
    `- 状态：${report.fieldEvidenceManifest?.status || "unknown"}`,
    `- 汇总：${report.fieldEvidenceManifest?.summary?.label || "未返回"}`,
    "",
    "## 现场验收报告",
    "",
    `- Markdown：${report.fieldAcceptanceFiles.markdown || "未返回"}`,
    `- JSON：${report.fieldAcceptanceFiles.json || "未返回"}`,
    `- Latest Markdown：${report.fieldAcceptanceFiles.latestMarkdown || "未返回"}`,
    `- Latest JSON：${report.fieldAcceptanceFiles.latestJson || "未返回"}`,
    "",
    "## 安全护栏",
    "",
    "| 护栏 | 当前值 |",
    "| --- | --- |",
    ...Object.entries(report.safeguards).map(([key, value]) => `| ${escapeMarkdownTable(key)} | ${formatSafeguardValue(value)} |`),
    "",
    "## 下一步",
    "",
    ...(report.nextActions.length ? report.nextActions.map((item) => `- ${item}`) : ["- 暂无"]),
    "",
  ];
  return `${lines.join("\n")}\n`;
}

function buildEnvFileAuditFindingRows(envFileAudit) {
  const findings = [
    ...(Array.isArray(envFileAudit?.blockingFindings) ? envFileAudit.blockingFindings : []),
    ...(Array.isArray(envFileAudit?.warningFindings) ? envFileAudit.warningFindings : []),
  ];
  if (!findings.length) {
    return [
      `| ${envFileAudit?.included ? "无" : "未提供"} | ${envFileAudit?.included ? "无阻塞 / warning" : "未执行"} | ${envFileAudit?.included ? "passed" : "not_applicable"} | 无 | ${envFileAudit?.included ? "继续生产环境变量预检" : "如使用真实 env 文件，传入 --env-file 后重跑发布候选检查"} |`,
    ];
  }
  return findings.map((item) =>
    `| ${escapeMarkdownTable(item.file)} | ${escapeMarkdownTable(item.label)} | ${escapeMarkdownTable(item.status)} | ${escapeMarkdownTable(item.variables.join(", ") || "无")} | ${escapeMarkdownTable(item.nextAction || item.detail)} |`,
  );
}

function normalizeApiBaseUrl(value) {
  const baseUrl = String(value || defaultApiBaseUrl).trim().replace(/\/+$/, "");
  if (!baseUrl) throw new Error("API base URL is required.");
  return baseUrl;
}

function sanitizeApiBaseUrl(value) {
  try {
    const url = new URL(value);
    url.username = "";
    url.password = "";
    url.search = "";
    url.hash = "";
    return url.toString().replace(/\/+$/, "");
  } catch {
    return "[invalid-api-base-url]";
  }
}

function displayPath(path) {
  const relativePath = relative(process.cwd(), path);
  if (!relativePath.startsWith("..") && !relativePath.startsWith("/") && relativePath !== "") return relativePath;
  return join("custom-output", relative(dirname(path), path));
}

function displayInputPath(path) {
  const relativePath = relative(process.cwd(), path);
  if (!relativePath.startsWith("..") && !relativePath.startsWith("/") && relativePath !== "") return relativePath;
  return "[external-field-evidence-manifest]";
}

function stringValue(value) {
  return value == null ? "" : String(value);
}

function stringArray(value) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => stringValue(item)).filter(Boolean);
}

function numberOrZero(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function formatSafeguardValue(value) {
  if (typeof value === "boolean") return value ? "true" : "false";
  return escapeMarkdownTable(value);
}

function escapeMarkdownTable(value) {
  return stringValue(value).replace(/\|/g, "\\|").replace(/\n/g, " ");
}
