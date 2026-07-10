#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { redactDriverCloseoutText } from "./run-v1-driver-real-device-closeout.mjs";

const defaultApiBaseUrl = "http://127.0.0.1:8787/api";
const defaultFieldEvidenceManifestPath = "docs/development/v1-field-evidence-manifest.template.json";
const defaultOutputDir = ".erp-local-storage/v1-driver-real-device-execution";
const defaultDriverReadinessOutputDir = ".erp-local-storage/v1-driver-readiness";
const defaultCloseoutOutputDir = ".erp-local-storage/v1-driver-real-device-closeout";

if (isCliEntrypoint()) runCli();

async function runCli() {
  try {
    const options = parseArgs(process.argv.slice(2));
    const report = await buildDriverRealDeviceExecution({
      apiBaseUrl: options.apiBaseUrl,
      closeoutOutputDir: options.closeoutOutputDir,
      driverBearerToken: options.driverBearerToken,
      driverOperatorId: options.driverOperatorId,
      driverReadinessOutputDir: options.driverReadinessOutputDir,
      fieldEvidenceManifestPath: options.fieldEvidenceManifestPath,
      maxAgeHours: options.maxAgeHours,
      outputDir: options.outputDir,
      planOnly: options.planOnly,
    });
    const outputReport =
      options.write && !options.planOnly
        ? {
            ...report,
            artifacts: writeDriverRealDeviceExecutionArtifacts(report, { outputDir: options.outputDir }),
          }
        : report;
    if (options.json) {
      process.stdout.write(`${JSON.stringify(redactExecutionReport(outputReport), null, 2)}\n`);
    } else {
      process.stdout.write(formatDriverRealDeviceExecution(outputReport));
    }
    process.exit(report.ready ? 0 : report.status === "error" ? 1 : 2);
  } catch (error) {
    const message = redactExecutionText(error?.message || String(error));
    if (process.argv.includes("--json")) {
      process.stdout.write(`${JSON.stringify({ status: "error", ready: false, error: { message } }, null, 2)}\n`);
    } else {
      process.stderr.write(`V1 driver real-device execution failed: ${message}\n`);
    }
    process.exit(1);
  }
}

function isCliEntrypoint() {
  return process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
}

function parseArgs(args) {
  const options = {
    apiBaseUrl:
      process.env.ERP_DRIVER_REAL_DEVICE_EXECUTION_API_BASE_URL ||
      process.env.ERP_V1_READINESS_API_BASE_URL ||
      process.env.VITE_ERP_API_BASE_URL ||
      defaultApiBaseUrl,
    closeoutOutputDir: defaultCloseoutOutputDir,
    driverBearerToken:
      process.env.ERP_DRIVER_REAL_DEVICE_EXECUTION_TOKEN ||
      process.env.ERP_DRIVER_V1_READINESS_TOKEN ||
      process.env.ERP_V1_READINESS_DRIVER_TOKEN ||
      "",
    driverOperatorId:
      process.env.ERP_DRIVER_REAL_DEVICE_EXECUTION_OPERATOR_ID ||
      process.env.ERP_V1_READINESS_DRIVER_OPERATOR_ID ||
      process.env.ERP_DRIVER_V1_READINESS_OPERATOR_ID ||
      "U-DRIVER-A",
    driverReadinessOutputDir: defaultDriverReadinessOutputDir,
    fieldEvidenceManifestPath: defaultFieldEvidenceManifestPath,
    json: false,
    maxAgeHours: 72,
    outputDir: defaultOutputDir,
    planOnly: false,
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
    if (arg === "--plan-only") {
      options.planOnly = true;
      continue;
    }
    if (arg === "--api-base-url") {
      options.apiBaseUrl = readValue(args, index, arg);
      index += 1;
      continue;
    }
    if (arg === "--driver-operator-id") {
      options.driverOperatorId = readValue(args, index, arg);
      index += 1;
      continue;
    }
    if (arg === "--driver-bearer-token") {
      options.driverBearerToken = readValue(args, index, arg);
      index += 1;
      continue;
    }
    if (arg === "--field-evidence-manifest") {
      options.fieldEvidenceManifestPath = readValue(args, index, arg);
      index += 1;
      continue;
    }
    if (arg === "--max-age-hours") {
      options.maxAgeHours = parseNonNegativeNumber(readValue(args, index, arg), arg);
      index += 1;
      continue;
    }
    if (arg === "--driver-readiness-output-dir") {
      options.driverReadinessOutputDir = readValue(args, index, arg);
      index += 1;
      continue;
    }
    if (arg === "--closeout-output-dir") {
      options.closeoutOutputDir = readValue(args, index, arg);
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

function parseNonNegativeNumber(value, name) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) throw new Error(`${name} must be zero or a positive number.`);
  return number;
}

function helpText() {
  return [
    "Usage: node -- scripts/run-v1-driver-real-device-execution.mjs [options]",
    "",
    "Options:",
    "  --api-base-url <url>                 ERP API base URL. Defaults to http://127.0.0.1:8787/api.",
    "  --driver-operator-id <id>            Driver operator id. Defaults to U-DRIVER-A.",
    "  --driver-bearer-token <jwt>          Optional driver bearer token instead of seed user header.",
    "  --field-evidence-manifest <path>     Filled field-evidence manifest. Defaults to the pending template.",
    "  --max-age-hours <n>                  Closeout source evidence freshness. Defaults to 72; 0 disables blocking.",
    "  --driver-readiness-output-dir <dir>  Write driver readiness latest JSON source evidence.",
    "  --closeout-output-dir <dir>          Write driver real-device closeout files.",
    "  --output-dir <dir>                   Write driver real-device execution files.",
    "  --plan-only                          Print the ordered driver-stage plan without calling the API.",
    "  --no-write                           Do not write final execution JSON / Markdown files.",
    "  --json                               Print machine-readable JSON.",
    "",
    "Exit codes:",
    "  0  Driver real-device execution reached closeout ready",
    "  1  Runner error",
    "  2  Plan-only or a readable driver real-device blocker remains",
    "",
    "This execution is read-only for driver devices. It reads driver readiness from the running API and runs closeout against saved field evidence. It does not request camera/location permissions, open navigation, invoke native bridges, upload photos, or change delivery status.",
  ].join("\n");
}

async function buildDriverRealDeviceExecution({
  apiBaseUrl = defaultApiBaseUrl,
  checkedAt = new Date().toISOString(),
  closeoutOutputDir = defaultCloseoutOutputDir,
  driverBearerToken = "",
  driverOperatorId = "U-DRIVER-A",
  driverReadinessOutputDir = defaultDriverReadinessOutputDir,
  fieldEvidenceManifestPath = defaultFieldEvidenceManifestPath,
  maxAgeHours = 72,
  outputDir: _outputDir = defaultOutputDir,
  planOnly = false,
  readinessFetcher = fetchDriverReadinessStep,
  stepExecutor = executeStepCommand,
} = {}) {
  const paths = buildExecutionArtifactPaths({ driverReadinessOutputDir, closeoutOutputDir });
  const steps = buildDriverRealDeviceExecutionSteps({
    apiBaseUrl,
    closeoutOutputDir,
    driverBearerToken,
    driverOperatorId,
    fieldEvidenceManifestPath,
    maxAgeHours,
    paths,
  });
  const stages = [];

  if (planOnly) {
    stages.push(...steps.map((step) => buildPlannedStage(step)));
  } else {
    for (const step of steps) {
      const result = step.kind === "api-json" ? await readinessFetcher(step) : stepExecutor(step);
      const parsed = result.parsed || (step.expectsJson ? parseJsonOrNull(result.stdout) : null);
      if (parsed && step.latestJsonPath) writeRawLatestJsonArtifact(parsed, { outputDir: step.latestOutputDir, latestJsonPath: step.latestJsonPath });
      stages.push(buildStageFromResult(step, result, parsed));
    }
  }

  const passedCount = stages.filter((stage) => stage.status === "passed").length;
  const plannedCount = stages.filter((stage) => stage.status === "planned").length;
  const errorCount = stages.filter((stage) => stage.status === "error").length;
  const blockingStages = stages.filter((stage) => stage.status === "blocked" || stage.status === "error");
  const ready = !planOnly && stages.length === steps.length && blockingStages.length === 0;
  const status = planOnly ? "planned" : ready ? "ready" : errorCount > 0 ? "error" : "blocked";

  return redactExecutionReport({
    status,
    ready,
    checkedAt,
    scope: "v1_driver_real_device_execution",
    summary: {
      label: planOnly
        ? `${steps.length} 个司机真机步骤待执行`
        : ready
          ? `${passedCount}/${steps.length} 步骤通过`
          : `${passedCount}/${steps.length} 步骤通过，仍有阻塞`,
      passedCount,
      plannedCount,
      totalCount: steps.length,
      blockingCount: blockingStages.length,
      errorCount,
    },
    execution: {
      apiBaseUrl,
      driverOperatorId: driverBearerToken ? "token" : driverOperatorId,
      planOnly,
      fieldEvidenceManifestIncluded: false,
      actualArtifactPathsIncluded: false,
      closeoutCoversOnlyDriverStage: true,
      outputDirIncluded: false,
    },
    stages,
    blockingStages,
    artifactsSummary: {
      driverReadinessLatestJson: paths.driverReadinessLatestJson ? "[redacted-path]" : "",
      closeoutOutputDir: "[redacted-path]",
      rawArtifactPathsIncluded: false,
      rawReadinessReportIncludedInExecution: false,
    },
    safeguards: {
      nonMutating: true,
      businessDataMutated: false,
      apiCalledOnlyForDriverReadiness: true,
      cameraPermissionRequestedByExecution: false,
      locationPermissionRequestedByExecution: false,
      navigationAppOpenedByExecution: false,
      nativeBridgeInvokedByExecution: false,
      deliveryStatusChangedByExecution: false,
      photoUploadedByExecution: false,
      fieldEvidenceManifestMutated: false,
      rawReadinessReportIncluded: false,
      scannedTextExposed: false,
      photoPayloadExposed: false,
      geoPointExposed: false,
      payloadExposed: false,
      bearerTokenExposed: false,
      secretFieldsExposed: false,
      declaresFullV1Complete: false,
    },
    nextActions: buildNextActions({ ready, status, planOnly, blockingStages }),
  });
}

function buildExecutionArtifactPaths({ driverReadinessOutputDir, closeoutOutputDir }) {
  return {
    driverReadinessLatestJson: join(driverReadinessOutputDir, "latest.json"),
    closeoutOutputDir,
  };
}

function buildDriverRealDeviceExecutionSteps({
  apiBaseUrl,
  closeoutOutputDir,
  driverBearerToken,
  driverOperatorId,
  fieldEvidenceManifestPath,
  maxAgeHours,
  paths,
}) {
  return [
    {
      key: "driver-v1-readiness",
      kind: "api-json",
      label: "运行中 API 司机真机门禁",
      apiBaseUrl,
      path: "/driver/v1-readiness",
      driverBearerToken,
      driverOperatorId,
      expectsJson: true,
      latestOutputDir: join(paths.driverReadinessLatestJson, ".."),
      latestJsonPath: paths.driverReadinessLatestJson,
      successDetail: "运行中 API 的司机端 V1 readiness 已 ready，并已保存为 closeout 源证据。",
    },
    {
      key: "driver-real-device-closeout",
      kind: "script",
      label: "司机真机阶段负责人 closeout",
      script: "scripts/run-v1-driver-real-device-closeout.mjs",
      args: [
        "--driver-readiness-json",
        paths.driverReadinessLatestJson,
        "--field-evidence-manifest",
        fieldEvidenceManifestPath,
        "--max-age-hours",
        String(maxAgeHours),
        "--output-dir",
        closeoutOutputDir,
        "--json",
      ],
      safeArgs: [
        "--driver-readiness-json",
        "<driver-readiness-latest-json>",
        "--field-evidence-manifest",
        "<filled-field-evidence-manifest>",
        "--max-age-hours",
        String(maxAgeHours),
        "--output-dir",
        "<driver-real-device-closeout-output-dir>",
        "--json",
      ],
      expectsJson: true,
      successDetail: "司机 readiness 和 driver_native_device 现场证据可交司机 / 技术负责人签收。",
    },
  ];
}

async function fetchDriverReadinessStep(step) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    const response = await fetch(joinApiUrl(step.apiBaseUrl, step.path), {
      headers: buildDriverHeaders(step),
      signal: controller.signal,
    });
    const text = await response.text();
    const parsed = text ? JSON.parse(text) : {};
    if (!response.ok) {
      const errorReport = {
        status: "error",
        ready: false,
        error: { message: parsed?.error?.message || parsed?.message || `HTTP ${response.status}` },
      };
      return {
        status: 1,
        stdout: JSON.stringify(errorReport),
        stderr: "",
        parsed: errorReport,
      };
    }
    return {
      status: parsed.ready === true && parsed.status === "ready" ? 0 : 2,
      stdout: JSON.stringify(parsed),
      stderr: "",
      parsed,
    };
  } catch (error) {
    const message = error?.name === "AbortError" ? "Driver readiness API timed out after 10000ms." : error?.message || String(error);
    const errorReport = { status: "error", ready: false, error: { message } };
    return {
      status: 1,
      stdout: JSON.stringify(errorReport),
      stderr: "",
      parsed: errorReport,
    };
  } finally {
    clearTimeout(timeout);
  }
}

function buildDriverHeaders(step) {
  const headers = { accept: "application/json", connection: "close" };
  if (step.driverBearerToken) {
    headers.authorization = `Bearer ${step.driverBearerToken}`;
  } else {
    headers["x-erp-user-id"] = step.driverOperatorId || "U-DRIVER-A";
  }
  return headers;
}

function joinApiUrl(baseUrl, path) {
  return `${String(baseUrl || defaultApiBaseUrl).replace(/\/+$/, "")}${path}`;
}

function executeStepCommand(step) {
  const result = spawnSync(process.execPath, ["--", step.script, ...step.args], {
    cwd: process.cwd(),
    env: process.env,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    maxBuffer: 1024 * 1024 * 4,
  });
  return {
    status: typeof result.status === "number" ? result.status : 1,
    signal: result.signal,
    stdout: result.stdout || "",
    stderr: result.stderr || "",
    error: result.error,
  };
}

function buildPlannedStage(step) {
  return {
    key: step.key,
    label: step.label,
    status: "planned",
    detail: "计划执行，尚未访问 API 或现场证据。",
    command: safeCommand(step),
    evidence: {
      actualCommandArgsIncluded: false,
      rawArtifactPathIncluded: false,
    },
  };
}

function buildStageFromResult(step, result = {}, parsed = null) {
  const exitCode = typeof result.status === "number" ? result.status : 1;
  const parsedReady = parsed?.ready === true || parsed?.status === "ready";
  const parsedBlocked = parsed?.ready === false || parsed?.status === "blocked";
  const status = exitCode === 0 && parsedReady ? "passed" : exitCode === 2 || parsedBlocked ? "blocked" : "error";
  return {
    key: step.key,
    label: step.label,
    status,
    detail: status === "passed" ? step.successDetail : blockedDetail(step, parsed, result),
    command: safeCommand(step),
    exitCode,
    evidence: extractStageEvidence(step, parsed, result),
    nextActions: status === "passed" ? [] : extractNextActions(parsed),
  };
}

function blockedDetail(step, parsed, result) {
  if (parsed?.summary?.label) return parsed.summary.label;
  if (parsed?.error?.message) return parsed.error.message;
  if (parsed?.message) return parsed.message;
  if (result?.error?.message) return result.error.message;
  if (result?.stderr || result?.stdout) return capText(redactExecutionText(result.stderr || result.stdout));
  return `${step.label} 未通过。`;
}

function extractStageEvidence(step, parsed, result) {
  const base = {
    actualCommandArgsIncluded: false,
    rawArtifactPathIncluded: false,
    reportParsed: Boolean(parsed),
    exitCode: typeof result.status === "number" ? result.status : 1,
  };
  if (!parsed) return base;
  const generic = {
    ...base,
    reportStatus: parsed.status,
    reportReady: parsed.ready,
    summaryLabel: parsed.summary?.label,
    passedCount: parsed.summary?.passedCount,
    totalCount: parsed.summary?.totalCount,
    blockingCount: parsed.summary?.blockingCount,
    scope: parsed.scope,
  };
  if (step.key === "driver-v1-readiness") {
    return {
      ...generic,
      nativeSupportedLabel: `${numberOrZero(parsed.nativeBridgeDiagnostics?.supportedCount)}/${numberOrZero(parsed.nativeBridgeDiagnostics?.total || 2)}`,
      packageLabelScanMethod: cleanString(parsed.packageLabelScanSample?.method),
      packageLabelScanResult: cleanString(parsed.packageLabelScanSample?.result),
      blockingCriteriaCount: Array.isArray(parsed.blockingCriteria) ? parsed.blockingCriteria.length : undefined,
      rawReadinessReportIncluded: false,
      scanTextIncluded: false,
      photoPayloadIncluded: false,
      geoPointIncluded: false,
    };
  }
  if (step.key === "driver-real-device-closeout") {
    return {
      ...generic,
      driverNativeEvidenceStatus: parsed.evidenceSummary?.driverNativeDeviceEvidence?.status,
      driverNativeEvidenceCompleted: parsed.evidenceSummary?.driverNativeDeviceEvidence?.completedRequired,
      driverNativeEvidenceRequired: parsed.evidenceSummary?.driverNativeDeviceEvidence?.requiredTotal,
      rawEvidenceRefsIncluded: false,
      rawReadinessReportIncluded: false,
    };
  }
  return generic;
}

function extractNextActions(parsed) {
  if (!parsed || !Array.isArray(parsed.nextActions)) return [];
  return parsed.nextActions.map((item) => String(item)).filter(Boolean).slice(0, 6);
}

function writeRawLatestJsonArtifact(parsed, { outputDir, latestJsonPath }) {
  mkdirSync(outputDir, { recursive: true });
  const checkedAt = cleanString(parsed.checkedAt || new Date().toISOString());
  const stamp = checkedAt.replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  const baseName = cleanString(parsed.scope || "v1-driver-real-device-step").replace(/[^a-z0-9_-]+/gi, "-");
  writeFileSync(join(outputDir, `${baseName}-${stamp}.json`), `${JSON.stringify(parsed, null, 2)}\n`);
  writeFileSync(latestJsonPath, `${JSON.stringify(parsed, null, 2)}\n`);
}

function writeDriverRealDeviceExecutionArtifacts(report, { outputDir = defaultOutputDir } = {}) {
  mkdirSync(outputDir, { recursive: true });
  const stamp = new Date(report.checkedAt || Date.now()).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  const baseName = `v1-driver-real-device-execution-${stamp}`;
  const jsonPath = join(outputDir, `${baseName}.json`);
  const markdownPath = join(outputDir, `${baseName}.md`);
  const latestJsonPath = join(outputDir, "latest.json");
  const latestMarkdownPath = join(outputDir, "latest.md");
  const output = redactExecutionReport(report);
  writeFileSync(jsonPath, `${JSON.stringify(output, null, 2)}\n`);
  writeFileSync(markdownPath, formatDriverRealDeviceExecution(output));
  writeFileSync(latestJsonPath, `${JSON.stringify(output, null, 2)}\n`);
  writeFileSync(latestMarkdownPath, formatDriverRealDeviceExecution(output));
  return { jsonPath, markdownPath, latestJsonPath, latestMarkdownPath };
}

function formatDriverRealDeviceExecution(report) {
  const lines = [
    "# V1 Driver Real-Device Execution",
    "",
    `- Status: ${report.status}`,
    `- Ready: ${yesNo(report.ready)}`,
    `- Checked at: ${report.checkedAt}`,
    `- Summary: ${report.summary.label}`,
    `- API: ${report.execution.apiBaseUrl}`,
    `- Driver operator: ${report.execution.driverOperatorId}`,
    "",
    "## Stages",
    "",
  ];
  for (const stage of report.stages || []) {
    lines.push(`- [${stage.status}] ${stage.label}: ${stage.detail}`);
    lines.push(`  command: ${stage.command}`);
  }
  if (report.nextActions?.length) {
    lines.push("", "## Next Actions", "");
    for (const action of report.nextActions) lines.push(`- ${action}`);
  }
  if (report.artifacts) {
    lines.push("", "## Artifacts", "- JSON: [redacted-path]", "- Markdown: [redacted-path]");
  }
  lines.push("");
  return redactExecutionText(lines.join("\n"));
}

function buildNextActions({ ready, status, planOnly, blockingStages }) {
  if (planOnly) {
    return [
      "先用真实司机手机 / 原生壳完成登录、相机水印、纸质标签扫码、定位、导航和弱网上传兜底。",
      "再用运行中的生产 API 读取司机 V1 readiness，并保存到 `.erp-local-storage/v1-driver-readiness/latest.json`。",
      "回填 driver_native_device 现场证据后，生成司机真机阶段 closeout。",
    ];
  }
  if (ready) {
    return [
      "把 driver real-device execution、readiness、closeout 和 driver_native_device 证据编号写入上线交接包。",
      "继续下一阶段真实订单试跑：录入、库存、出库、生产打包、对账收款和异常待办。",
    ];
  }
  const firstBlocked = blockingStages[0]?.label || "司机真机链路";
  const actions = [`先处理 ${firstBlocked} 的阻塞，处理后重新运行司机真机执行器。`];
  const firstNextActions = blockingStages[0]?.nextActions || [];
  actions.push(...firstNextActions.slice(0, 4));
  if (status === "error") actions.push("错误输出已脱敏；不要把 token、扫码文本、定位点、照片 payload 或本地路径复制到问题日志。");
  return actions.filter(Boolean).slice(0, 7);
}

function parseJsonOrNull(value) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function safeCommand(step) {
  if (step.kind === "api-json") {
    const operator = step.driverBearerToken ? "<driver-bearer-token>" : step.driverOperatorId;
    return `GET ${joinApiUrl(step.apiBaseUrl, step.path)} as ${operator}`;
  }
  return ["node", "--", step.script, ...step.safeArgs].join(" ");
}

function redactExecutionReport(report) {
  return JSON.parse(redactExecutionText(JSON.stringify(report)));
}

function redactExecutionText(value) {
  return redactDriverCloseoutText(String(value ?? ""))
    .replace(/--driver-bearer-token\s+("[^"]+"|'[^']+'|[^\s"',}]+)/g, "--driver-bearer-token <driver-bearer-token>")
    .replace(/--bearer-token\s+("[^"]+"|'[^']+'|[^\s"',}]+)/g, "--bearer-token <bearer-token>")
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/g, "Bearer <redacted-token>")
    .replace(/"scannedText"\s*:\s*"[^"]*"/g, '"scannedText":"[redacted-scan-text]"')
    .replace(/\bPKG-[A-Z0-9_-]*SECRET[A-Z0-9_-]*\b/g, "[redacted-scan-text]")
    .replace(/\b(?:-?\d{1,3}\.\d{3,},\s*-?\d{1,3}\.\d{3,})\b/g, "[redacted-geo]")
    .replace(/\b\/(?:Users|private|var|tmp|usr|opt)\/[^\s"']+/g, "[redacted-path]")
    .replace(/\.erp-local-storage\/[^\s"'<>]+/g, "[redacted-path]")
    .replace(/\b[A-Z0-9_]*(?:SECRET|PASSWORD|TOKEN|ACCESS_KEY)[A-Z0-9_]*=([^\s"']+)/gi, "[redacted-secret-assignment]");
}

function capText(value) {
  return String(value ?? "").slice(0, 500);
}

function cleanString(value) {
  return String(value ?? "").trim();
}

function numberOrZero(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) return 0;
  return Math.trunc(number);
}

function yesNo(value) {
  return value ? "yes" : "no";
}

export {
  buildDriverRealDeviceExecution,
  buildDriverRealDeviceExecutionSteps,
  formatDriverRealDeviceExecution,
  parseArgs,
  redactExecutionText,
  writeDriverRealDeviceExecutionArtifacts,
};
