#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { redactPrintCloseoutText } from "./run-v1-print-chain-closeout.mjs";

const defaultApiBaseUrl = "http://127.0.0.1:8787/api";
const defaultFieldEvidenceManifestPath = "docs/development/v1-field-evidence-manifest.template.json";
const defaultOutputDir = ".erp-local-storage/v1-print-chain-execution";
const defaultCupsPreflightOutputDir = ".erp-local-storage/v1-cups-queue-preflight";
const defaultPrintReadinessOutputDir = ".erp-local-storage/v1-print-readiness";
const defaultCloseoutOutputDir = ".erp-local-storage/v1-print-chain-closeout";

if (isCliEntrypoint()) runCli();

function runCli() {
  try {
    const options = parseArgs(process.argv.slice(2));
    const report = buildPrintChainExecution({
      apiBaseUrl: options.apiBaseUrl,
      bearerToken: options.bearerToken,
      closeoutOutputDir: options.closeoutOutputDir,
      cupsAllowlist: options.cupsAllowlist,
      cupsPreflightOutputDir: options.cupsPreflightOutputDir,
      cupsPrinter: options.cupsPrinter,
      cupsStatusArgsJson: options.cupsStatusArgsJson,
      cupsStatusCommand: options.cupsStatusCommand,
      cupsTimeoutMs: options.cupsTimeoutMs,
      fieldEvidenceManifestPath: options.fieldEvidenceManifestPath,
      maxAgeHours: options.maxAgeHours,
      operatorId: options.operatorId,
      outputDir: options.outputDir,
      planOnly: options.planOnly,
      printReadinessOutputDir: options.printReadinessOutputDir,
    });
    const outputReport =
      options.write && !options.planOnly
        ? {
            ...report,
            artifacts: writePrintChainExecutionArtifacts(report, { outputDir: options.outputDir }),
          }
        : report;
    if (options.json) {
      process.stdout.write(`${JSON.stringify(redactExecutionReport(outputReport), null, 2)}\n`);
    } else {
      process.stdout.write(formatPrintChainExecution(outputReport));
    }
    process.exitCode = report.ready ? 0 : report.status === "error" ? 1 : 2;
  } catch (error) {
    const message = redactExecutionText(error?.message || String(error));
    if (process.argv.includes("--json")) {
      process.stdout.write(`${JSON.stringify({ status: "error", ready: false, error: { message } }, null, 2)}\n`);
    } else {
      process.stderr.write(`V1 print-chain execution failed: ${message}\n`);
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
      process.env.ERP_PRINT_CHAIN_EXECUTION_API_BASE_URL ||
      process.env.ERP_PRINT_V1_READINESS_API_BASE_URL ||
      process.env.VITE_ERP_API_BASE_URL ||
      defaultApiBaseUrl,
    bearerToken: process.env.ERP_PRINT_CHAIN_EXECUTION_TOKEN || process.env.ERP_PRINT_V1_READINESS_TOKEN || "",
    closeoutOutputDir: defaultCloseoutOutputDir,
    cupsAllowlist: process.env.ERP_PRINT_CUPS_PREFLIGHT_ALLOWLIST || process.env.ERP_PRINT_COMMAND_BRIDGE_CUPS_ALLOWLIST || "",
    cupsPreflightOutputDir: defaultCupsPreflightOutputDir,
    cupsPrinter: process.env.ERP_PRINT_CUPS_PREFLIGHT_PRINTER || process.env.ERP_PRINT_COMMAND_BRIDGE_CUPS_PRINTER || "",
    cupsStatusArgsJson:
      process.env.ERP_PRINT_CUPS_PREFLIGHT_STATUS_ARGS_JSON ||
      process.env.ERP_PRINT_COMMAND_BRIDGE_CUPS_STATUS_ARGS_JSON ||
      "",
    cupsStatusCommand:
      process.env.ERP_PRINT_CUPS_PREFLIGHT_STATUS_COMMAND ||
      process.env.ERP_PRINT_COMMAND_BRIDGE_CUPS_STATUS_COMMAND ||
      "",
    cupsTimeoutMs:
      process.env.ERP_PRINT_CUPS_PREFLIGHT_TIMEOUT_MS ||
      process.env.ERP_PRINT_COMMAND_BRIDGE_CUPS_STATUS_TIMEOUT_MS ||
      "",
    fieldEvidenceManifestPath: defaultFieldEvidenceManifestPath,
    json: false,
    maxAgeHours: 72,
    operatorId: process.env.ERP_PRINT_CHAIN_EXECUTION_OPERATOR_ID || process.env.ERP_PRINT_V1_READINESS_OPERATOR_ID || "U-OFFICE-A",
    outputDir: defaultOutputDir,
    planOnly: false,
    printReadinessOutputDir: defaultPrintReadinessOutputDir,
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
    if (arg === "--cups-printer") {
      options.cupsPrinter = readValue(args, index, arg);
      index += 1;
      continue;
    }
    if (arg === "--cups-allowlist") {
      options.cupsAllowlist = readValue(args, index, arg);
      index += 1;
      continue;
    }
    if (arg === "--cups-status-command") {
      options.cupsStatusCommand = readValue(args, index, arg);
      index += 1;
      continue;
    }
    if (arg === "--cups-status-args-json") {
      options.cupsStatusArgsJson = readValue(args, index, arg);
      index += 1;
      continue;
    }
    if (arg === "--cups-timeout-ms") {
      options.cupsTimeoutMs = parsePositiveInteger(readValue(args, index, arg), arg);
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
    if (arg === "--cups-preflight-output-dir") {
      options.cupsPreflightOutputDir = readValue(args, index, arg);
      index += 1;
      continue;
    }
    if (arg === "--print-readiness-output-dir") {
      options.printReadinessOutputDir = readValue(args, index, arg);
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

function parsePositiveInteger(value, name) {
  const number = Number(value);
  if (!Number.isFinite(number) || !Number.isInteger(number) || number <= 0) {
    throw new Error(`${name} must be a positive integer.`);
  }
  return number;
}

function parseNonNegativeNumber(value, name) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) throw new Error(`${name} must be zero or a positive number.`);
  return number;
}

function helpText() {
  return [
    "Usage: node -- scripts/run-v1-print-chain-execution.mjs [options]",
    "",
    "Options:",
    "  --api-base-url <url>              ERP API base URL. Defaults to http://127.0.0.1:8787/api.",
    "  --operator-id <id>                ERP operator id. Defaults to U-OFFICE-A.",
    "  --bearer-token <jwt>              Optional bearer token instead of seed user header.",
    "  --cups-printer <name>             Real CUPS printer name for non-printing queue preflight.",
    "  --cups-allowlist <names>          Comma-separated CUPS printer allowlist.",
    "  --cups-status-command <command>   Queue status command, usually lpstat.",
    "  --cups-status-args-json <json>    Queue status command args template.",
    "  --cups-timeout-ms <ms>            Queue status command timeout.",
    "  --field-evidence-manifest <path>  Filled field-evidence manifest. Defaults to the pending template.",
    "  --max-age-hours <n>               Closeout source evidence freshness. Defaults to 72; 0 disables blocking.",
    "  --cups-preflight-output-dir <dir> Write standalone CUPS preflight latest JSON.",
    "  --print-readiness-output-dir <dir> Write print readiness latest JSON.",
    "  --closeout-output-dir <dir>        Write print-chain closeout files.",
    "  --output-dir <dir>                Write print-chain execution files.",
    "  --plan-only                       Print the ordered print-stage command plan without running it.",
    "  --no-write                        Do not write final execution JSON / Markdown files.",
    "  --json                            Print machine-readable JSON.",
    "",
    "Exit codes:",
    "  0  Print-chain execution reached closeout ready",
    "  1  Runner error",
    "  2  Plan-only or a readable print-chain blocker remains",
    "",
    "This execution is non-printing by itself. It runs CUPS queue status, API readiness, and closeout; physical sample prints and scans must be captured in field evidence.",
  ].join("\n");
}

function buildPrintChainExecution({
  apiBaseUrl = defaultApiBaseUrl,
  bearerToken = "",
  checkedAt = new Date().toISOString(),
  closeoutOutputDir = defaultCloseoutOutputDir,
  cupsAllowlist = "",
  cupsPreflightOutputDir = defaultCupsPreflightOutputDir,
  cupsPrinter = "",
  cupsStatusArgsJson = "",
  cupsStatusCommand = "",
  cupsTimeoutMs = "",
  fieldEvidenceManifestPath = defaultFieldEvidenceManifestPath,
  maxAgeHours = 72,
  operatorId = "U-OFFICE-A",
  outputDir: _outputDir = defaultOutputDir,
  planOnly = false,
  printReadinessOutputDir = defaultPrintReadinessOutputDir,
  stepExecutor = executeStepCommand,
} = {}) {
  const paths = buildExecutionArtifactPaths({ cupsPreflightOutputDir, printReadinessOutputDir, closeoutOutputDir });
  const steps = buildPrintChainExecutionSteps({
    apiBaseUrl,
    bearerToken,
    closeoutOutputDir,
    cupsAllowlist,
    cupsPrinter,
    cupsStatusArgsJson,
    cupsStatusCommand,
    cupsTimeoutMs,
    fieldEvidenceManifestPath,
    maxAgeHours,
    paths,
    operatorId,
  });
  const stages = [];

  if (planOnly) {
    stages.push(...steps.map((step) => buildPlannedStage(step)));
  } else {
    for (const step of steps) {
      const result = stepExecutor(step);
      const parsed = step.expectsJson ? parseJsonOrNull(result.stdout) : null;
      if (parsed && step.latestJsonPath) writeLatestJsonArtifact(parsed, { outputDir: step.latestOutputDir, latestJsonPath: step.latestJsonPath });
      const stage = buildStageFromResult(step, result, parsed);
      stages.push(stage);
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
    scope: "v1_print_chain_execution",
    summary: {
      label: planOnly
        ? `${steps.length} 个打印链路步骤待执行`
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
      operatorId: bearerToken ? "token" : operatorId,
      planOnly,
      fieldEvidenceManifestIncluded: false,
      actualArtifactPathsIncluded: false,
      standaloneCupsPreflightRequired: true,
      closeoutCoversOnlyPrintStage: true,
      outputDirIncluded: false,
    },
    stages,
    blockingStages,
    artifactsSummary: {
      cupsPreflightLatestJson: paths.cupsPreflightLatestJson ? "[redacted-path]" : "",
      printReadinessLatestJson: paths.printReadinessLatestJson ? "[redacted-path]" : "",
      closeoutOutputDir: "[redacted-path]",
      rawArtifactPathsIncluded: false,
    },
    safeguards: {
      nonMutating: true,
      businessDataMutated: false,
      physicalPrinterCalledByExecution: false,
      cupsSubmitCalledByExecution: false,
      apiCalledOnlyForReadiness: true,
      fieldEvidenceManifestMutated: false,
      driverDeliveryStatusChanged: false,
      commandValueExposed: false,
      commandArgsExposed: false,
      stdoutExposed: false,
      stderrExposed: false,
      spoolPathExposed: false,
      payloadExposed: false,
      secretFieldsExposed: false,
      declaresFullV1Complete: false,
    },
    nextActions: buildNextActions({ ready, status, planOnly, blockingStages }),
  });
}

function buildExecutionArtifactPaths({ cupsPreflightOutputDir, printReadinessOutputDir, closeoutOutputDir }) {
  return {
    cupsPreflightLatestJson: join(cupsPreflightOutputDir, "latest.json"),
    printReadinessLatestJson: join(printReadinessOutputDir, "latest.json"),
    closeoutOutputDir,
  };
}

function buildPrintChainExecutionSteps({
  apiBaseUrl,
  bearerToken,
  closeoutOutputDir,
  cupsAllowlist,
  cupsPrinter,
  cupsStatusArgsJson,
  cupsStatusCommand,
  cupsTimeoutMs,
  fieldEvidenceManifestPath,
  maxAgeHours,
  paths,
  operatorId,
}) {
  const cupsArgs = ["--json"];
  const cupsSafeArgs = ["--json"];
  if (cupsPrinter) {
    cupsArgs.push("--cups-printer", cupsPrinter);
    cupsSafeArgs.push("--cups-printer", "<cups-printer>");
  }
  if (cupsAllowlist) {
    cupsArgs.push("--cups-allowlist", cupsAllowlist);
    cupsSafeArgs.push("--cups-allowlist", "<cups-allowlist>");
  }
  if (cupsStatusCommand) {
    cupsArgs.push("--status-command", cupsStatusCommand);
    cupsSafeArgs.push("--status-command", "<cups-status-command>");
  }
  if (cupsStatusArgsJson) {
    cupsArgs.push("--status-args-json", cupsStatusArgsJson);
    cupsSafeArgs.push("--status-args-json", "<cups-status-args-json>");
  }
  if (cupsTimeoutMs) {
    cupsArgs.push("--timeout-ms", String(cupsTimeoutMs));
    cupsSafeArgs.push("--timeout-ms", String(cupsTimeoutMs));
  }

  const readinessArgs = ["--api-base-url", apiBaseUrl, "--json"];
  const readinessSafeArgs = ["--api-base-url", apiBaseUrl, "--json"];
  if (bearerToken) {
    readinessArgs.push("--bearer-token", bearerToken);
    readinessSafeArgs.push("--bearer-token", "<bearer-token>");
  } else {
    readinessArgs.push("--operator-id", operatorId);
    readinessSafeArgs.push("--operator-id", operatorId);
  }

  return [
    {
      key: "standalone-cups-queue-preflight",
      label: "真实 CUPS 队列 non-printing 预检",
      script: "scripts/run-cups-queue-preflight.mjs",
      args: cupsArgs,
      safeArgs: cupsSafeArgs,
      expectsJson: true,
      latestOutputDir: join(paths.cupsPreflightLatestJson, ".."),
      latestJsonPath: paths.cupsPreflightLatestJson,
      successDetail: "真实打印机器可读取 CUPS 队列状态，且未提交打印作业。",
    },
    {
      key: "print-v1-readiness",
      label: "运行中 API 打印门禁",
      script: "scripts/run-print-v1-readiness-check.mjs",
      args: readinessArgs,
      safeArgs: readinessSafeArgs,
      expectsJson: true,
      latestOutputDir: join(paths.printReadinessLatestJson, ".."),
      latestJsonPath: paths.printReadinessLatestJson,
      successDetail: "运行中 API 的打印 V1 readiness 已 ready。",
    },
    {
      key: "print-chain-closeout",
      label: "打印阶段负责人 closeout",
      script: "scripts/run-v1-print-chain-closeout.mjs",
      args: [
        "--print-readiness-json",
        paths.printReadinessLatestJson,
        "--field-evidence-manifest",
        fieldEvidenceManifestPath,
        "--max-age-hours",
        String(maxAgeHours),
        "--output-dir",
        closeoutOutputDir,
        "--json",
      ],
      safeArgs: [
        "--print-readiness-json",
        "<print-readiness-latest-json>",
        "--field-evidence-manifest",
        "<filled-field-evidence-manifest>",
        "--max-age-hours",
        String(maxAgeHours),
        "--output-dir",
        "<print-chain-closeout-output-dir>",
        "--json",
      ],
      expectsJson: true,
      successDetail: "打印 readiness 和 print_hardware 现场证据可交办公室 / 仓库负责人签收。",
    },
  ];
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
    detail: "计划执行，尚未访问 CUPS、API 或现场证据。",
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
  if (step.key === "standalone-cups-queue-preflight") {
    return {
      ...generic,
      cupsPrinterConfigured: parsed.cupsPrinterConfigured === true,
      cupsPrinterAllowed: parsed.cupsPrinterAllowed === true,
      cupsStatusCommandRunnable: parsed.cupsStatusCommandRunnable === true,
      stdoutBytes: numberOrZero(parsed.stdoutBytes),
      stderrBytes: numberOrZero(parsed.stderrBytes),
      nonPrinting: parsed.safeguards?.nonPrinting !== false,
      physicalPrinterCalled: parsed.safeguards?.physicalPrinterCalled === true,
      printFileCreated: parsed.safeguards?.printFileCreated === true,
      rawStdoutIncluded: false,
      rawStderrIncluded: false,
    };
  }
  if (step.key === "print-v1-readiness") {
    return {
      ...generic,
      cupsReady: parsed.cups?.ready === true,
      cupsPrinterConfigured: parsed.cups?.cupsPrinterConfigured === true,
      cupsStatusCommandRunnable: parsed.cups?.cupsStatusCommandRunnable === true,
      blockingCriteriaCount: Array.isArray(parsed.blockingCriteria) ? parsed.blockingCriteria.length : undefined,
      rawReadinessReportIncluded: false,
    };
  }
  if (step.key === "print-chain-closeout") {
    return {
      ...generic,
      printHardwareEvidenceStatus: parsed.evidenceSummary?.printHardwareEvidence?.status,
      printHardwareEvidenceCompleted: parsed.evidenceSummary?.printHardwareEvidence?.completedRequired,
      printHardwareEvidenceRequired: parsed.evidenceSummary?.printHardwareEvidence?.requiredTotal,
      rawEvidenceRefsIncluded: false,
    };
  }
  return generic;
}

function extractNextActions(parsed) {
  if (!parsed || !Array.isArray(parsed.nextActions)) return [];
  return parsed.nextActions.map((item) => String(item)).filter(Boolean).slice(0, 6);
}

function writeLatestJsonArtifact(parsed, { outputDir, latestJsonPath }) {
  mkdirSync(outputDir, { recursive: true });
  const checkedAt = cleanString(parsed.checkedAt || new Date().toISOString());
  const stamp = checkedAt.replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  const baseName = cleanString(parsed.scope || "v1-print-chain-step").replace(/[^a-z0-9_-]+/gi, "-");
  const report = redactExecutionReport(parsed);
  writeFileSync(join(outputDir, `${baseName}-${stamp}.json`), `${JSON.stringify(report, null, 2)}\n`);
  writeFileSync(latestJsonPath, `${JSON.stringify(report, null, 2)}\n`);
}

function writePrintChainExecutionArtifacts(report, { outputDir = defaultOutputDir } = {}) {
  mkdirSync(outputDir, { recursive: true });
  const stamp = new Date(report.checkedAt || Date.now()).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  const baseName = `v1-print-chain-execution-${stamp}`;
  const jsonPath = join(outputDir, `${baseName}.json`);
  const markdownPath = join(outputDir, `${baseName}.md`);
  const latestJsonPath = join(outputDir, "latest.json");
  const latestMarkdownPath = join(outputDir, "latest.md");
  const output = redactExecutionReport(report);
  writeFileSync(jsonPath, `${JSON.stringify(output, null, 2)}\n`);
  writeFileSync(markdownPath, formatPrintChainExecution(output));
  writeFileSync(latestJsonPath, `${JSON.stringify(output, null, 2)}\n`);
  writeFileSync(latestMarkdownPath, formatPrintChainExecution(output));
  return { jsonPath, markdownPath, latestJsonPath, latestMarkdownPath };
}

function formatPrintChainExecution(report) {
  const lines = [
    "# V1 Print-Chain Execution",
    "",
    `- Status: ${report.status}`,
    `- Ready: ${yesNo(report.ready)}`,
    `- Checked at: ${report.checkedAt}`,
    `- Summary: ${report.summary.label}`,
    `- API: ${report.execution.apiBaseUrl}`,
    `- Operator: ${report.execution.operatorId}`,
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
      "先在真实打印机器上确认 CUPS 队列名、白名单和 lpstat 权限。",
      "再用运行中的生产 API 跑打印 readiness，并保存到 `.erp-local-storage/v1-print-readiness/latest.json`。",
      "完成标签机 / 针式机出纸、纸张对位、条码扫码、状态回写和作废重打后，回填 print_hardware 现场证据。",
    ];
  }
  if (ready) {
    return [
      "把 print-chain execution、readiness、closeout 和 print_hardware 证据编号写入上线交接包。",
      "继续下一阶段司机真机验收：扫码、定位、导航、水印照片和上传兜底。",
    ];
  }
  const firstBlocked = blockingStages[0]?.label || "打印链路";
  const actions = [`先处理 ${firstBlocked} 的阻塞，处理后重新运行打印链路执行器。`];
  const firstNextActions = blockingStages[0]?.nextActions || [];
  actions.push(...firstNextActions.slice(0, 4));
  if (status === "error") actions.push("错误输出已脱敏；不要把命令路径、spool 路径、stdout/stderr 或客户 payload 复制到问题日志。");
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
  return ["node", "--", step.script, ...step.safeArgs].join(" ");
}

function redactExecutionReport(report) {
  return JSON.parse(redactExecutionText(JSON.stringify(report)));
}

function redactExecutionText(value) {
  return redactPrintCloseoutText(String(value ?? ""))
    .replace(/--bearer-token\s+("[^"]+"|'[^']+'|[^\s"',}]+)/g, "--bearer-token <bearer-token>")
    .replace(/--cups-status-command\s+("[^"]+"|'[^']+'|[^\s"',}]+)/g, "--cups-status-command <cups-status-command>")
    .replace(/--status-command\s+("[^"]+"|'[^']+'|[^\s"',}]+)/g, "--status-command <cups-status-command>")
    .replace(/--cups-status-args-json\s+("[^"]+"|'[^']+'|[^\s"',}]+)/g, "--cups-status-args-json <cups-status-args-json>")
    .replace(/--status-args-json\s+("[^"]+"|'[^']+'|[^\s"',}]+)/g, "--status-args-json <cups-status-args-json>")
    .replace(/\b\/(?:Users|private|var|tmp|usr|opt)\/[^\s"']+/g, "[redacted-path]")
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
  buildPrintChainExecution,
  buildPrintChainExecutionSteps,
  formatPrintChainExecution,
  parseArgs,
  redactExecutionText,
  writePrintChainExecutionArtifacts,
};
