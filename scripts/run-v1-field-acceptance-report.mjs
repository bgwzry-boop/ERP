#!/usr/bin/env node

import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const defaultApiBaseUrl = "http://127.0.0.1:8787/api";
const defaultOutputDir = join(".erp-local-storage", "v1-field-acceptance");
const readinessRunnerScript = fileURLToPath(new URL("./run-v1-readiness-check.mjs", import.meta.url));

try {
  const options = parseArgs(process.argv.slice(2));
  const apiBaseUrl = normalizeApiBaseUrl(
    options.apiBaseUrl ||
      process.env.ERP_V1_FIELD_ACCEPTANCE_API_BASE_URL ||
      process.env.ERP_V1_READINESS_API_BASE_URL ||
      process.env.VITE_ERP_API_BASE_URL ||
      defaultApiBaseUrl,
  );
  const operatorId = String(
    options.operatorId ||
      process.env.ERP_V1_FIELD_ACCEPTANCE_OPERATOR_ID ||
      process.env.ERP_V1_READINESS_OPERATOR_ID ||
      "U-OFFICE-A",
  ).trim();
  const driverOperatorId = String(
    options.driverOperatorId ||
      process.env.ERP_V1_FIELD_ACCEPTANCE_DRIVER_OPERATOR_ID ||
      process.env.ERP_V1_READINESS_DRIVER_OPERATOR_ID ||
      "U-DRIVER-A",
  ).trim();
  const outputDir = resolve(
    options.outputDir || process.env.ERP_V1_FIELD_ACCEPTANCE_OUTPUT_DIR || defaultOutputDir,
  );
  const readinessRun = await runReadinessRunner({
    apiBaseUrl,
    operatorId,
    driverOperatorId,
    bearerToken: options.bearerToken || process.env.ERP_V1_FIELD_ACCEPTANCE_TOKEN,
    driverBearerToken:
      options.driverBearerToken ||
      options.bearerToken ||
      process.env.ERP_V1_FIELD_ACCEPTANCE_DRIVER_TOKEN ||
      process.env.ERP_V1_FIELD_ACCEPTANCE_TOKEN,
  });
  const readiness = parseReadinessRun(readinessRun);
  const report = buildFieldAcceptanceReport({ apiBaseUrl, operatorId, driverOperatorId, readiness });
  const files = writeReportFiles({ outputDir, report });
  const commandResult = buildCommandResult({ report, files });

  if (options.json) {
    process.stdout.write(`${JSON.stringify(commandResult, null, 2)}\n`);
  } else {
    process.stdout.write(formatCommandResult(commandResult));
  }

  process.exit(report.ready || options.allowBlockedExitZero ? 0 : 2);
} catch (error) {
  const message = error?.message || String(error);
  if (process.argv.includes("--json")) {
    process.stdout.write(`${JSON.stringify({ status: "error", ready: false, error: { message } }, null, 2)}\n`);
  } else {
    process.stderr.write(`V1 field acceptance report failed: ${message}\n`);
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
    if (arg === "--allow-blocked-exit-zero") {
      options.allowBlockedExitZero = true;
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
    "Usage: node scripts/run-v1-field-acceptance-report.mjs [options]",
    "",
    "Options:",
    "  --api-base-url <url>       ERP API base URL, default http://127.0.0.1:8787/api",
    "  --operator-id <id>         Office operator id, default U-OFFICE-A",
    "  --driver-operator-id <id>  Driver operator id, default U-DRIVER-A",
    "  --bearer-token <token>     Deprecated compatibility input; prefer ERP_V1_READINESS_TOKEN in secure env",
    "  --driver-bearer-token <token> Deprecated compatibility input; prefer ERP_V1_READINESS_DRIVER_TOKEN",
    "  --output-dir <dir>         Output directory, default .erp-local-storage/v1-field-acceptance",
    "  --allow-blocked-exit-zero  Write a blocked report but exit 0 for archival workflows",
    "  --json                     Print machine-readable command summary",
    "",
    "Exit codes:",
    "  0  Report written and V1 readiness is ready, or --allow-blocked-exit-zero was used",
    "  1  API/read/write error",
    "  2  Report written but V1 field acceptance remains blocked",
  ].join("\n");
}

function normalizeApiBaseUrl(value) {
  const baseUrl = String(value || defaultApiBaseUrl).trim().replace(/\/+$/, "");
  if (!baseUrl) throw new Error("API base URL is required.");
  return baseUrl;
}

function runReadinessRunner({ apiBaseUrl, operatorId, driverOperatorId, bearerToken, driverBearerToken }) {
  const args = [
    readinessRunnerScript,
    "--api-base-url",
    apiBaseUrl,
    "--operator-id",
    operatorId,
    "--driver-operator-id",
    driverOperatorId,
    "--json",
  ];
  const childEnv = { ...process.env };
  if (bearerToken) childEnv.ERP_V1_READINESS_TOKEN = bearerToken;
  if (driverBearerToken) childEnv.ERP_V1_READINESS_DRIVER_TOKEN = driverBearerToken;

  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, {
      cwd: process.cwd(),
      env: childEnv,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    const timeout = setTimeout(() => {
      child.kill("SIGTERM");
      reject(new Error("V1 readiness runner timed out after 20000ms"));
    }, 20000);
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

function parseReadinessRun(run) {
  let parsed = null;
  try {
    parsed = JSON.parse(run.stdout || "{}");
  } catch (error) {
    throw new Error(`V1 readiness runner returned unreadable JSON; exit=${run.status}`);
  }
  if (run.status !== 0 && run.status !== 2) {
    const message = parsed?.error?.message || run.stderr || `V1 readiness runner exited ${run.status}`;
    throw new Error(message);
  }
  if (!parsed || typeof parsed !== "object" || parsed.scope !== "v1_go_live_readiness") {
    throw new Error("V1 readiness runner did not return the expected readiness report.");
  }
  return parsed;
}

function buildFieldAcceptanceReport({ apiBaseUrl, operatorId, driverOperatorId, readiness }) {
  const criteria = Array.isArray(readiness.criteria) ? readiness.criteria.map(normalizeCriterion) : [];
  const blockingCriteria = Array.isArray(readiness.blockingCriteria)
    ? readiness.blockingCriteria.map(normalizeCriterion)
    : criteria.filter((item) => item.blocking && item.status !== "passed");
  const ready = Boolean(readiness.ready);
  const summary = {
    label: stringValue(readiness.summary?.label || `${criteria.filter((item) => item.status === "passed").length}/${criteria.length} 通过`),
    passedCount: numberOrZero(readiness.summary?.passedCount),
    totalCount: numberOrZero(readiness.summary?.totalCount || criteria.length),
    blockingCount: numberOrZero(readiness.summary?.blockingCount || blockingCriteria.length),
  };
  const modules = buildModuleStatus({ readiness, criteria });
  const remainingV1Risks = stringList(readiness.remainingV1Risks);
  const nextActions = buildNextActions({ ready, blockingCriteria, remainingV1Risks, modules });

  return {
    scope: "v1_field_acceptance_report",
    status: ready ? "ready" : "blocked",
    ready,
    generatedAt: new Date().toISOString(),
    readinessCheckedAt: stringValue(readiness.checkedAt),
    apiBaseUrl: sanitizeApiBaseUrl(apiBaseUrl),
    operatorId,
    driverOperatorId,
    conclusion: ready
      ? "当前 API 门禁为 READY；可作为 V1 候选上线验收报告，仍需负责人确认生产环境和现场留档完整。"
      : "当前 API 门禁为 BLOCKED；不能声明 V1 已完成或已可上线。",
    summary,
    modules,
    blockingCriteria,
    remainingV1Risks,
    requiredFieldEvidence: buildRequiredFieldEvidence(),
    safeguards: normalizeSafeguards(readiness.safeguards),
    nextActions,
  };
}

function buildModuleStatus({ readiness, criteria }) {
  const hasPassed = (key) => criteria.find((item) => item.key === key)?.status === "passed";
  const getDetail = (key, fallback) => criteria.find((item) => item.key === key)?.detail || fallback;
  const readinessSummary = (value, fallback) => value?.summary?.label || fallback;
  return [
    {
      key: "api_contract",
      label: "API / OpenAPI 合同",
      ready: hasPassed("api-health") && hasPassed("openapi-contract"),
      status: hasPassed("api-health") && hasPassed("openapi-contract") ? "passed" : "pending",
      detail: "API 可访问，OpenAPI 合同可校验。",
      evidence: [
        getDetail("api-health", "API 健康检查"),
        getDetail("openapi-contract", "OpenAPI 合同"),
      ],
    },
    {
      key: "permission_accounts",
      label: "办公室 / 司机验收账号",
      ready: hasPassed("operator-permissions") && hasPassed("driver-operator-permissions"),
      status: hasPassed("operator-permissions") && hasPassed("driver-operator-permissions") ? "passed" : "pending",
      detail: "办公室账号和司机账号具备读取对应门禁的最小权限。",
      evidence: [
        getDetail("operator-permissions", "办公室账号权限"),
        getDetail("driver-operator-permissions", "司机账号权限"),
      ],
    },
    {
      key: "production_persistence",
      label: "生产持久化",
      ready: hasPassed("system-v1-persistence") && Boolean(readiness.systemPersistence?.ready),
      status: hasPassed("system-v1-persistence") && Boolean(readiness.systemPersistence?.ready) ? "passed" : "pending",
      detail: getDetail("system-v1-persistence", "系统 V1 持久化门禁"),
      evidence: [readinessSummary(readiness.systemPersistence, "系统持久化门禁未返回汇总")],
    },
    {
      key: "attachment_retention",
      label: "附件留档",
      ready:
        hasPassed("attachment-storage-diagnostics") &&
        hasPassed("attachment-v1-readiness") &&
        Boolean(readiness.attachmentReadiness?.ready),
      status:
        hasPassed("attachment-storage-diagnostics") &&
        hasPassed("attachment-v1-readiness") &&
        Boolean(readiness.attachmentReadiness?.ready)
          ? "passed"
          : "pending",
      detail: getDetail("attachment-v1-readiness", "附件 V1 留档门禁"),
      evidence: [
        readiness.attachmentStorage?.status ? `存储诊断：${readiness.attachmentStorage.status}` : "附件存储诊断未返回",
        readinessSummary(readiness.attachmentReadiness, "附件留档门禁未返回汇总"),
      ],
    },
    {
      key: "print_field_gate",
      label: "打印现场门禁",
      ready:
        hasPassed("print-spool-diagnostics") &&
        hasPassed("print-cups-diagnostics") &&
        hasPassed("print-v1-readiness") &&
        Boolean(readiness.printReadiness?.ready),
      status:
        hasPassed("print-spool-diagnostics") &&
        hasPassed("print-cups-diagnostics") &&
        hasPassed("print-v1-readiness") &&
        Boolean(readiness.printReadiness?.ready)
          ? "passed"
          : "pending",
      detail: getDetail("print-v1-readiness", "打印 V1 门禁"),
      evidence: [
        readiness.spoolDiagnostics?.status ? `spool：${readiness.spoolDiagnostics.status}` : "spool 诊断未返回",
        readiness.cupsDiagnostics?.status ? `CUPS：${readiness.cupsDiagnostics.status}` : "CUPS 诊断未返回",
        readinessSummary(readiness.printReadiness, "打印门禁未返回汇总"),
      ],
    },
    {
      key: "driver_device_gate",
      label: "司机真机门禁",
      ready: hasPassed("driver-v1-readiness") && Boolean(readiness.driverReadiness?.ready),
      status: hasPassed("driver-v1-readiness") && Boolean(readiness.driverReadiness?.ready) ? "passed" : "pending",
      detail: getDetail("driver-v1-readiness", "司机端 V1 真机门禁"),
      evidence: [readinessSummary(readiness.driverReadiness, "司机真机门禁未返回汇总")],
    },
  ];
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

function normalizeSafeguards(value = {}) {
  return {
    systemReadOnly: value.systemReadOnly !== false,
    systemRepositoryPayloadExposed: Boolean(value.systemRepositoryPayloadExposed),
    systemConnectionStringExposed: Boolean(value.systemConnectionStringExposed),
    systemLocalPathExposed: Boolean(value.systemLocalPathExposed),
    secretFieldsExposed: Boolean(value.secretFieldsExposed),
    attachmentPayloadExposed: Boolean(value.attachmentPayloadExposed),
    nonPrintingReadinessCheck: value.nonPrinting !== false,
    physicalPrinterCalledByCheck: Boolean(value.physicalPrinterCalled),
    printCommandExposed: Boolean(value.commandValueExposed || value.commandArgsExposed),
    spoolPathExposed: Boolean(value.spoolPathExposed),
    printPayloadExposed: Boolean(value.payloadExposed),
    driverReadOnly: value.driverReadOnly !== false,
    driverDeliveryStatusChanged: Boolean(value.driverDeliveryStatusChanged),
    driverPayloadExposed: Boolean(value.driverPayloadExposed),
  };
}

function buildRequiredFieldEvidence() {
  return [
    {
      key: "production_persistence",
      label: "生产持久化",
      required: [
        "PostgreSQL / 生产级仓储 profile 已启用并通过 /system/v1-readiness。",
        "迁移、备份、恢复、权限和连接池配置有负责人确认。",
      ],
    },
    {
      key: "attachment_retention",
      label: "附件留档",
      required: [
        "真实 OSS/S3/COS bucket 完成上传、读回、签名 URL、访问审计和清理诊断。",
        "生命周期、备份、权限、病毒扫描或人工复核方案已确认。",
      ],
    },
    {
      key: "print_field_gate",
      label: "打印现场验收",
      required: [
        "标签机和针式机均为 system_printer，并通过 CUPS 队列预检和 spool 状态回读。",
        "样张、纸张对位、条码扫码、驱动回写、作废重打和现场签认齐全。",
      ],
    },
    {
      key: "driver_device_gate",
      label: "司机真机验收",
      required: [
        "真实司机手机完成相机、水印拍照、纸质包裹标签扫码、定位、上传兜底和导航验收。",
        "原生扫码和原生导航桥接记录来自真实壳或现场批准的等效壳。",
      ],
    },
    {
      key: "business_signoff",
      label: "业务签字",
      required: [
        "办公室、仓库、车间、司机、财务各自确认当天试运行样本无阻塞。",
        "价格、库存占用、出库交付、对账收款和异常处理责任人已确认。",
      ],
    },
  ];
}

function buildNextActions({ ready, blockingCriteria, remainingV1Risks, modules }) {
  if (ready) {
    return [
      "现场负责人复核本报告、真实设备证据和生产环境配置后签字。",
      "安排小范围真实订单试运行，并保留订单、打印、司机、附件和对账证据。",
      "试运行无阻塞后再扩大到完整 V1 使用范围。",
    ];
  }
  const actions = [];
  for (const item of blockingCriteria.slice(0, 8)) {
    actions.push(`${item.label}：${item.detail || "补齐该门禁证据"}`);
  }
  for (const item of remainingV1Risks.slice(0, 8)) {
    if (actions.length >= 8) break;
    if (!actions.includes(item)) actions.push(item);
  }
  for (const module of modules.filter((item) => !item.ready)) {
    if (actions.length >= 8) break;
    const action = `${module.label}：${module.detail || "补齐现场证据"}`;
    if (!actions.includes(action)) actions.push(action);
  }
  return actions;
}

function writeReportFiles({ outputDir, report }) {
  mkdirSync(outputDir, { recursive: true });
  const stamp = report.generatedAt.replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  const baseName = `v1-field-acceptance-${stamp}`;
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
    blockingCount: report.blockingCriteria.length,
    nextActions: report.nextActions,
  };
}

function formatCommandResult(result) {
  return [
    `V1 field acceptance: ${result.ready ? "READY" : "BLOCKED"} (${result.summary.label})`,
    result.conclusion,
    `Markdown: ${result.files.markdown}`,
    `JSON: ${result.files.json}`,
    result.ready ? "Next: run a controlled live-order pilot and keep the acceptance package." : "Next blockers:",
    ...(result.ready ? [] : result.nextActions.slice(0, 5).map((item) => `- ${item}`)),
    "",
  ].join("\n");
}

function formatMarkdownReport(report) {
  const lines = [
    "# ERP V1 现场验收报告",
    "",
    `- 生成时间：${report.generatedAt}`,
    `- readiness 时间：${report.readinessCheckedAt || "未返回"}`,
    `- API：${report.apiBaseUrl}`,
    `- 办公室验收账号：${report.operatorId}`,
    `- 司机验收账号：${report.driverOperatorId}`,
    `- 结论：${report.ready ? "READY" : "BLOCKED"}（${report.summary.label}）`,
    `- 说明：${report.conclusion}`,
    "",
    "## 分模块状态",
    "",
    "| 模块 | 状态 | 依据 |",
    "| --- | --- | --- |",
    ...report.modules.map((item) =>
      `| ${escapeMarkdownTable(item.label)} | ${item.ready ? "通过" : "未通过"} | ${escapeMarkdownTable([item.detail, ...item.evidence].filter(Boolean).join("；"))} |`,
    ),
    "",
    "## 当前阻塞",
    "",
    "| 门禁 | 状态 | 说明 |",
    "| --- | --- | --- |",
    ...(report.blockingCriteria.length
      ? report.blockingCriteria.map((item) =>
          `| ${escapeMarkdownTable(item.label)} | ${escapeMarkdownTable(item.status)} | ${escapeMarkdownTable(item.detail)} |`,
        )
      : ["| 无 | passed | 当前总门禁未返回阻塞项 |"]),
    "",
    "## 现场必须留档",
    "",
    ...report.requiredFieldEvidence.flatMap((item) => [
      `### ${item.label}`,
      ...item.required.map((text) => `- ${text}`),
      "",
    ]),
    "## 安全护栏",
    "",
    "| 护栏 | 当前值 |",
    "| --- | --- |",
    ...Object.entries(report.safeguards).map(([key, value]) => `| ${escapeMarkdownTable(key)} | ${value ? "true" : "false"} |`),
    "",
    "## 下一步",
    "",
    ...(report.nextActions.length ? report.nextActions.map((item) => `- ${item}`) : ["- 暂无"]),
    "",
  ];
  return `${lines.join("\n")}\n`;
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

function stringValue(value) {
  return value == null ? "" : String(value);
}

function stringList(value) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => stringValue(item)).filter(Boolean);
}

function numberOrZero(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function escapeMarkdownTable(value) {
  return stringValue(value).replace(/\|/g, "\\|").replace(/\n/g, " ");
}
