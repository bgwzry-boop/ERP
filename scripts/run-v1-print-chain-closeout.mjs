#!/usr/bin/env node

import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { validateV1FieldEvidenceManifest } from "./v1FieldEvidenceManifest.mjs";
import { redactCloseoutText } from "./run-v1-production-first-stage-closeout.mjs";

const defaultPrintReadinessPath = ".erp-local-storage/v1-print-readiness/latest.json";
const defaultFieldEvidenceManifestPath = "docs/development/v1-field-evidence-manifest.template.json";
const defaultOutputDir = ".erp-local-storage/v1-print-chain-closeout";
const defaultMaxAgeHours = 72;
const requiredPrintEvidenceKeys = [
  "cups_lpstat_checked",
  "label_sample_printed",
  "dot_matrix_sample_printed",
  "paper_alignment_checked",
  "barcode_scan_checked",
  "spool_or_driver_callback_checked",
  "void_reprint_checked",
];
const physicalProofKeys = [
  "label_sample_printed",
  "dot_matrix_sample_printed",
  "paper_alignment_checked",
  "barcode_scan_checked",
  "spool_or_driver_callback_checked",
  "void_reprint_checked",
];

if (isCliEntrypoint()) runCli();

function runCli() {
  try {
    const options = parseArgs(process.argv.slice(2));
    const report = buildPrintChainCloseout({
      printReadinessPath: options.printReadinessPath,
      fieldEvidenceManifestPath: options.fieldEvidenceManifestPath,
      maxAgeHours: options.maxAgeHours,
      now: new Date(),
    });
    const outputReport = redactPrintCloseoutReport(
      options.write
        ? {
            ...report,
            artifacts: writePrintChainCloseoutArtifacts(report, { outputDir: options.outputDir }),
          }
        : report,
    );
    if (options.json) {
      process.stdout.write(`${JSON.stringify(outputReport, null, 2)}\n`);
    } else {
      process.stdout.write(formatPrintChainCloseout(outputReport));
    }
    process.exit(report.ready ? 0 : 2);
  } catch (error) {
    const message = redactPrintCloseoutText(error?.message || String(error));
    if (process.argv.includes("--json")) {
      process.stdout.write(`${JSON.stringify({ status: "error", ready: false, error: { message } }, null, 2)}\n`);
    } else {
      process.stderr.write(`V1 print-chain closeout failed: ${message}\n`);
    }
    process.exit(1);
  }
}

function isCliEntrypoint() {
  return process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
}

function parseArgs(args) {
  const options = {
    printReadinessPath: defaultPrintReadinessPath,
    fieldEvidenceManifestPath: defaultFieldEvidenceManifestPath,
    outputDir: defaultOutputDir,
    maxAgeHours: defaultMaxAgeHours,
    write: true,
    json: false,
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
    if (arg === "--print-readiness-json") {
      options.printReadinessPath = readValue(args, index, arg);
      index += 1;
      continue;
    }
    if (arg === "--field-evidence-manifest") {
      options.fieldEvidenceManifestPath = readValue(args, index, arg);
      index += 1;
      continue;
    }
    if (arg === "--output-dir") {
      options.outputDir = readValue(args, index, arg);
      index += 1;
      continue;
    }
    if (arg === "--max-age-hours") {
      options.maxAgeHours = parseNonNegativeNumber(readValue(args, index, arg), arg);
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
    "Usage: node scripts/run-v1-print-chain-closeout.mjs [options]",
    "",
    "Options:",
    "  --print-readiness-json <path>    Print V1 readiness JSON, usually captured from run-print-v1-readiness-check --json.",
    "                                  Defaults to .erp-local-storage/v1-print-readiness/latest.json.",
    "  --field-evidence-manifest <path> Filled V1 field evidence manifest. Defaults to the pending template.",
    "  --max-age-hours <n>              Maximum print readiness report age. Defaults to 72; use 0 to disable freshness blocking.",
    "  --output-dir <path>              Write redacted closeout files. Defaults to .erp-local-storage/v1-print-chain-closeout.",
    "  --no-write                       Do not write JSON / Markdown closeout files.",
    "  --json                           Print machine-readable JSON.",
    "",
    "Exit codes:",
    "  0  Real print-chain evidence is ready for stage closeout",
    "  1  Runner/read/write error",
    "  2  Closeout is readable but still blocked",
    "",
    "This closeout does not call printers, CUPS, APIs, or external services. It validates the redacted readiness report and the print_hardware evidence group in the field-evidence manifest.",
  ].join("\n");
}

function buildPrintChainCloseout({
  printReadinessPath = defaultPrintReadinessPath,
  fieldEvidenceManifestPath = defaultFieldEvidenceManifestPath,
  maxAgeHours = defaultMaxAgeHours,
  checkedAt = new Date().toISOString(),
  now = new Date(checkedAt),
} = {}) {
  const readinessArtifact = readJsonArtifact({
    artifactKey: "print-v1-readiness",
    label: "打印 V1 readiness",
    filePath: printReadinessPath,
  });
  const manifestArtifact = readJsonArtifact({
    artifactKey: "field-evidence-manifest",
    label: "现场证据 manifest",
    filePath: fieldEvidenceManifestPath,
  });
  const manifestValidation = manifestArtifact.readable
    ? validateV1FieldEvidenceManifest(manifestArtifact.report)
    : buildMissingManifestValidation(manifestArtifact);
  const printGroup = getPrintHardwareGroup(manifestValidation);
  const stages = [
    buildReadinessArtifactStage(readinessArtifact),
    buildReadinessReadyStage(readinessArtifact),
    buildCupsReadbackStage(readinessArtifact),
    buildReadinessFreshnessStage({ artifact: readinessArtifact, maxAgeHours, now }),
    buildManifestArtifactStage({ manifestArtifact, manifestValidation }),
    buildPrintEvidenceStage(printGroup),
    buildPhysicalProofStage(printGroup),
    buildPrintCloseoutSafeguardsStage({ readinessArtifact, manifestValidation }),
  ];
  const passedCount = stages.filter((item) => item.status === "passed").length;
  const blockingCount = stages.length - passedCount;
  const ready = blockingCount === 0;
  const report = {
    status: ready ? "ready" : "blocked",
    ready,
    checkedAt,
    scope: "v1_print_chain_closeout",
    summary: {
      label: `${passedCount}/${stages.length} 通过`,
      passedCount,
      totalCount: stages.length,
      blockingCount,
      warningCount: 0,
    },
    stages,
    blockingStages: stages.filter((item) => item.status !== "passed"),
    evidenceSummary: {
      printReadiness: summarizeReadinessArtifact(readinessArtifact),
      printHardwareEvidence: summarizePrintHardwareEvidence(printGroup),
      maxAgeHours,
      sourceArtifactPathsIncluded: false,
      rawReadinessReportIncluded: false,
      rawEvidenceRefsIncluded: false,
      closeoutCoversOnlyPrintStage: true,
    },
    safeguards: {
      nonMutating: true,
      externalServiceCalledByCloseout: false,
      apiCalledByCloseout: false,
      physicalPrinterCalledByCloseout: false,
      cupsCommandCalledByCloseout: false,
      sourceArtifactPathExposed: false,
      rawReadinessReportIncluded: false,
      rawEvidenceRefsIncluded: false,
      commandValueExposed: false,
      commandArgsExposed: false,
      stdoutExposed: false,
      stderrExposed: false,
      spoolPathExposed: false,
      payloadExposed: false,
      secretFieldsExposed: false,
      declaresFullV1Complete: false,
      driverDeliveryStatusChanged: false,
    },
    nextActions: buildNextActions(stages, ready),
  };
  return redactPrintCloseoutReport(report);
}

function readJsonArtifact({ artifactKey, label, filePath }) {
  const fullPath = resolve(filePath);
  if (!existsSync(fullPath)) {
    return {
      artifactKey,
      label,
      available: false,
      readable: false,
      error: "Evidence JSON not found.",
      rawPathIncluded: false,
    };
  }
  try {
    const stats = statSync(fullPath);
    if (!stats.isFile()) throw new Error("Evidence path is not a file.");
    const parsed = JSON.parse(readFileSync(fullPath, "utf8"));
    return {
      artifactKey,
      label,
      available: true,
      readable: true,
      report: parsed,
      bytes: stats.size,
      rawPathIncluded: false,
    };
  } catch (error) {
    return {
      artifactKey,
      label,
      available: true,
      readable: false,
      error: error?.message || String(error),
      rawPathIncluded: false,
    };
  }
}

function buildMissingManifestValidation(manifestArtifact) {
  return {
    status: "invalid",
    ready: false,
    schemaValid: false,
    schemaErrors: [manifestArtifact.error || "manifest is unavailable"],
    groups: [],
    blockers: [],
    safeguards: {
      evidenceRefsRedacted: true,
      possibleSensitiveEvidenceRefCount: 0,
      rawEvidenceRefsIncludedInReport: false,
    },
  };
}

function buildReadinessArtifactStage(artifact) {
  const report = artifact.report || {};
  const criteria = Array.isArray(report.criteria) ? report.criteria : [];
  const passed =
    artifact.readable === true &&
    cleanString(report.status) &&
    typeof report.ready === "boolean" &&
    criteria.length > 0;
  return {
    key: "print-readiness-artifact",
    label: "打印 readiness 文件",
    status: passed ? "passed" : "blocked",
    ready: passed,
    detail: passed ? "打印 readiness JSON 可读取且包含门禁摘要。" : artifact.error || "打印 readiness JSON 不可读取或格式不完整。",
    summary: {
      label: passed ? "1/1 通过" : "0/1 通过",
      passedCount: passed ? 1 : 0,
      totalCount: 1,
      blockingCount: passed ? 0 : 1,
      warningCount: 0,
    },
    evidence: {
      available: artifact.available === true,
      readable: artifact.readable === true,
      sourceStatus: cleanString(report.status || "unavailable"),
      sourceReady: report.ready === true,
      criteriaCount: criteria.length,
      byteCount: numberOrZero(artifact.bytes),
      rawPathIncluded: false,
    },
    nextAction: passed ? "继续检查打印 readiness 是否 ready。" : "先运行打印 V1 readiness runner 并保存 JSON 后重跑 closeout。",
  };
}

function buildReadinessReadyStage(artifact) {
  const report = artifact.report || {};
  const blockingCriteria = Array.isArray(report.blockingCriteria) ? report.blockingCriteria : [];
  const ready =
    artifact.readable === true &&
    report.ready === true &&
    cleanString(report.status) === "ready" &&
    numberOrZero(report.summary?.blockingCount) === 0 &&
    blockingCriteria.length === 0;
  return {
    key: "print-readiness-ready",
    label: "打印 V1 readiness ready",
    status: ready ? "passed" : "blocked",
    ready,
    detail: ready ? "打印 V1 readiness 已 ready 且无阻塞门禁。" : "打印 V1 readiness 未 ready 或仍有阻塞门禁。",
    summary: {
      label: cleanString(report.summary?.label) || (ready ? "ready" : "blocked"),
      passedCount: numberOrZero(report.summary?.passedCount),
      totalCount: numberOrZero(report.summary?.totalCount),
      blockingCount: ready ? 0 : Math.max(1, numberOrZero(report.summary?.blockingCount || blockingCriteria.length)),
      warningCount: numberOrZero(report.summary?.warningCount),
    },
    blockingItems: sanitizeBlockingCriteria(blockingCriteria),
    evidence: {
      sourceStatus: cleanString(report.status || "unavailable"),
      sourceReady: report.ready === true,
      rawReportIncluded: false,
    },
    nextAction: ready ? "继续核对 CUPS 队列和现场实物证据。" : firstAction(report.nextActions) || "先处理打印 readiness 阻塞项。",
  };
}

function buildCupsReadbackStage(artifact) {
  const cups = artifact.report?.cups || {};
  const safeguards = cups.safeguards || {};
  const ready =
    artifact.readable === true &&
    cups.ready === true &&
    cups.cupsPrinterConfigured === true &&
    cups.cupsPrinterAllowed === true &&
    cups.cupsStatusCommandRunnable === true &&
    safeguards.nonPrinting !== false &&
    safeguards.physicalPrinterCalled !== true &&
    safeguards.printFileCreated !== true;
  return {
    key: "cups-non-printing-preflight",
    label: "CUPS non-printing 队列预检",
    status: ready ? "passed" : "blocked",
    ready,
    detail: ready
      ? "CUPS 队列预检 ready，且 readiness 读取阶段未提交真实打印作业。"
      : "CUPS 队列预检未 ready，或 non-printing 安全护栏不完整。",
    summary: {
      label: ready ? "5/5 通过" : "0/5 通过",
      passedCount: ready ? 5 : 0,
      totalCount: 5,
      blockingCount: ready ? 0 : 1,
      warningCount: 0,
    },
    evidence: {
      cupsStatus: cleanString(cups.status || "unavailable"),
      cupsReady: cups.ready === true,
      cupsPrinterConfigured: cups.cupsPrinterConfigured === true,
      cupsPrinterAllowed: cups.cupsPrinterAllowed === true,
      cupsStatusCommandRunnable: cups.cupsStatusCommandRunnable === true,
      stdoutBytes: numberOrZero(cups.stdoutBytes),
      stderrBytes: numberOrZero(cups.stderrBytes),
      nonPrinting: safeguards.nonPrinting !== false,
      physicalPrinterCalled: safeguards.physicalPrinterCalled === true,
      printFileCreated: safeguards.printFileCreated === true,
      stdoutIncluded: false,
      stderrIncluded: false,
    },
    nextAction: ready ? "继续检查真实出纸、扫码、对位和作废重打证据。" : "先在真实打印机器上修复 CUPS 队列预检。",
  };
}

function buildReadinessFreshnessStage({ artifact, maxAgeHours, now }) {
  if (Number(maxAgeHours) <= 0) {
    return {
      key: "print-readiness-freshness",
      label: "打印 readiness 时效",
      status: "passed",
      ready: true,
      detail: "打印 readiness 时效检查已按 --max-age-hours 0 关闭。",
      summary: { label: "时效检查关闭", passedCount: 1, totalCount: 1, blockingCount: 0, warningCount: 0 },
      evidence: { maxAgeHours: 0 },
      nextAction: "继续检查现场证据 manifest。",
    };
  }
  const checkedAt = cleanString(artifact.report?.checkedAt);
  const parsed = checkedAt ? new Date(checkedAt) : null;
  const valid = parsed instanceof Date && !Number.isNaN(parsed.getTime());
  const ageHours = valid ? Math.max(0, (now.getTime() - parsed.getTime()) / 3600000) : Number.POSITIVE_INFINITY;
  const passed = valid && ageHours <= maxAgeHours;
  return {
    key: "print-readiness-freshness",
    label: "打印 readiness 时效",
    status: passed ? "passed" : "blocked",
    ready: passed,
    detail: passed ? `打印 readiness 报告在 ${maxAgeHours} 小时内。` : `打印 readiness 报告缺少 checkedAt 或超过 ${maxAgeHours} 小时。`,
    summary: {
      label: passed ? "1/1 通过" : "0/1 通过",
      passedCount: passed ? 1 : 0,
      totalCount: 1,
      blockingCount: passed ? 0 : 1,
      warningCount: 0,
    },
    evidence: {
      checkedAt,
      maxAgeHours,
      ageHours: Number.isFinite(ageHours) ? Number(ageHours.toFixed(2)) : null,
      validCheckedAt: valid,
    },
    nextAction: passed ? "继续检查现场证据 manifest。" : "重新运行打印 readiness runner 并保存最新 JSON 后重跑 closeout。",
  };
}

function buildManifestArtifactStage({ manifestArtifact, manifestValidation }) {
  const passed = manifestArtifact.readable === true && manifestValidation.schemaValid === true;
  return {
    key: "field-evidence-manifest-artifact",
    label: "现场证据 manifest 文件",
    status: passed ? "passed" : "blocked",
    ready: passed,
    detail: passed ? "现场证据 manifest 可读取且 schema 正确。" : manifestArtifact.error || "现场证据 manifest 不可读取或 schema 错误。",
    summary: {
      label: passed ? "1/1 通过" : "0/1 通过",
      passedCount: passed ? 1 : 0,
      totalCount: 1,
      blockingCount: passed ? 0 : 1,
      warningCount: 0,
    },
    evidence: {
      available: manifestArtifact.available === true,
      readable: manifestArtifact.readable === true,
      schemaValid: manifestValidation.schemaValid === true,
      schemaErrorCount: Array.isArray(manifestValidation.schemaErrors) ? manifestValidation.schemaErrors.length : 0,
      wholeManifestReady: manifestValidation.ready === true,
      rawPathIncluded: false,
    },
    nextAction: passed ? "继续检查 print_hardware 证据组。" : "先修正现场证据 manifest 格式后重跑 closeout。",
  };
}

function buildPrintEvidenceStage(printGroup) {
  const itemMap = new Map((printGroup?.items || []).map((item) => [item.key, item]));
  const checks = requiredPrintEvidenceKeys.map((key) => {
    const item = itemMap.get(key);
    const passed =
      Boolean(item) &&
      ["passed", "accepted"].includes(cleanString(item.status)) &&
      item.evidenceRefFilled === true;
    return {
      key,
      label: cleanString(item?.label || key),
      status: passed ? "passed" : "pending",
      ready: passed,
      detail: passed ? "状态已通过且 evidenceRef 已填写。" : "需要状态为 passed/accepted，并填写 evidenceRef。",
    };
  });
  const blockingItems = checks.filter((item) => item.status !== "passed");
  return {
    key: "print-hardware-evidence",
    label: "打印硬件现场证据",
    status: blockingItems.length === 0 ? "passed" : "blocked",
    ready: blockingItems.length === 0,
    detail:
      blockingItems.length === 0
        ? "print_hardware 7 项现场证据均已通过并填写证据引用。"
        : `print_hardware 仍有 ${blockingItems.length} 项证据未完成。`,
    summary: {
      label: `${checks.length - blockingItems.length}/${checks.length} 通过`,
      passedCount: checks.length - blockingItems.length,
      totalCount: checks.length,
      blockingCount: blockingItems.length,
      warningCount: 0,
    },
    checks,
    blockingItems,
    evidence: {
      groupFound: Boolean(printGroup),
      groupStatus: cleanString(printGroup?.status || "missing"),
      requiredEvidenceItemsTotal: requiredPrintEvidenceKeys.length,
      requiredEvidenceItemsCompleted: checks.length - blockingItems.length,
      rawEvidenceRefsIncluded: false,
    },
    nextAction:
      blockingItems.length === 0
        ? "继续检查真实物理打印覆盖项。"
        : "先在现场证据 manifest 的 print_hardware 组补齐 passed/accepted 和 evidenceRef。",
  };
}

function buildPhysicalProofStage(printGroup) {
  const itemMap = new Map((printGroup?.items || []).map((item) => [item.key, item]));
  const checks = physicalProofKeys.map((key) => {
    const item = itemMap.get(key);
    const passed =
      Boolean(item) &&
      ["passed", "accepted"].includes(cleanString(item.status)) &&
      item.evidenceRefFilled === true;
    return {
      key,
      label: physicalProofLabel(key, item?.label),
      status: passed ? "passed" : "pending",
      ready: passed,
      detail: passed ? "已有现场实物证据引用。" : "缺少真实出纸、扫码、对位、回写或作废重打证据。",
    };
  });
  const blockingItems = checks.filter((item) => item.status !== "passed");
  return {
    key: "physical-print-proof",
    label: "真实出纸 / 扫码 / 对位覆盖",
    status: blockingItems.length === 0 ? "passed" : "blocked",
    ready: blockingItems.length === 0,
    detail:
      blockingItems.length === 0
        ? "标签机、针式单据、纸张对位、条码扫码、状态回写和作废重打均有现场证据。"
        : `${blockingItems.length} 项真实物理打印覆盖证据仍未完成。`,
    summary: {
      label: `${checks.length - blockingItems.length}/${checks.length} 通过`,
      passedCount: checks.length - blockingItems.length,
      totalCount: checks.length,
      blockingCount: blockingItems.length,
      warningCount: 0,
    },
    checks,
    blockingItems,
    nextAction:
      blockingItems.length === 0
        ? "真实打印链路 closeout 可作为打印阶段签收依据。"
        : "继续补标签机/针式机样张、纸张对位、条码扫码、状态回写和作废重打证据。",
  };
}

function buildPrintCloseoutSafeguardsStage({ readinessArtifact, manifestValidation }) {
  const readinessSafeguards = readinessArtifact.report?.safeguards || {};
  const cupsSafeguards = readinessArtifact.report?.cups?.safeguards || {};
  const manifestSafeguards = manifestValidation.safeguards || {};
  const checks = [
    safeguardCheck({
      key: "readiness-redacted",
      label: "readiness 输出已脱敏",
      passed:
        readinessSafeguards.commandValueExposed !== true &&
        readinessSafeguards.commandArgsExposed !== true &&
        readinessSafeguards.stdoutExposed !== true &&
        readinessSafeguards.stderrExposed !== true &&
        readinessSafeguards.spoolPathExposed !== true &&
        readinessSafeguards.payloadExposed !== true &&
        cupsSafeguards.commandValueExposed !== true &&
        cupsSafeguards.commandArgsExposed !== true &&
        cupsSafeguards.stdoutExposed !== true &&
        cupsSafeguards.stderrExposed !== true &&
        cupsSafeguards.payloadExposed !== true,
      detail: "readiness / CUPS 报告不能暴露命令、参数、stdout/stderr、spool 路径或 payload。",
    }),
    safeguardCheck({
      key: "readiness-runner-non-printing",
      label: "readiness runner 未调用物理打印",
      passed:
        readinessSafeguards.nonPrinting !== false &&
        readinessSafeguards.physicalPrinterCalled !== true &&
        cupsSafeguards.physicalPrinterCalled !== true &&
        cupsSafeguards.printFileCreated !== true,
      detail: "readiness runner 只能读取门禁，不能把自己当成真实出纸证明。",
    }),
    safeguardCheck({
      key: "manifest-evidence-ref-redacted",
      label: "manifest 证据引用未泄露敏感字段",
      passed:
        manifestSafeguards.evidenceRefsRedacted === true &&
        manifestSafeguards.rawEvidenceRefsIncludedInReport !== true &&
        numberOrZero(manifestSafeguards.possibleSensitiveEvidenceRefCount) === 0,
      detail: "证据引用只能是报告编号、截图名、附件编号或签字单编号，不能包含密钥、连接串、命令路径或 spool 路径。",
    }),
  ];
  const blockingItems = checks.filter((item) => item.status !== "passed");
  return {
    key: "print-chain-closeout-safeguards",
    label: "打印阶段 closeout 安全护栏",
    status: blockingItems.length === 0 ? "passed" : "blocked",
    ready: blockingItems.length === 0,
    detail:
      blockingItems.length === 0
        ? "打印阶段 closeout 的脱敏、非打印和证据引用护栏均通过。"
        : `${blockingItems.length} 项打印阶段安全护栏未通过。`,
    summary: {
      label: `${checks.length - blockingItems.length}/${checks.length} 通过`,
      passedCount: checks.length - blockingItems.length,
      totalCount: checks.length,
      blockingCount: blockingItems.length,
      warningCount: 0,
    },
    checks,
    blockingItems,
    nextAction:
      blockingItems.length === 0
        ? "打印阶段 closeout 可交给办公室 / 仓库负责人复核。"
        : "先清理敏感输出或补齐 non-printing / 现场证据边界后重跑 closeout。",
  };
}

function getPrintHardwareGroup(manifestValidation = {}) {
  return (manifestValidation.groups || []).find((group) => group.key === "print_hardware") || null;
}

function summarizeReadinessArtifact(artifact) {
  const report = artifact.report || {};
  return {
    available: artifact.available === true,
    readable: artifact.readable === true,
    status: cleanString(report.status || "unavailable"),
    ready: report.ready === true,
    checkedAt: cleanString(report.checkedAt),
    summaryLabel: cleanString(report.summary?.label),
    rawPathIncluded: false,
  };
}

function summarizePrintHardwareEvidence(printGroup) {
  return {
    groupFound: Boolean(printGroup),
    status: cleanString(printGroup?.status || "missing"),
    ready: printGroup?.ready === true,
    requiredTotal: numberOrZero(printGroup?.requiredTotal || requiredPrintEvidenceKeys.length),
    completedRequired: numberOrZero(printGroup?.completedRequired),
    blockedRequired: numberOrZero(printGroup?.blockedRequired),
    rawEvidenceRefsIncluded: false,
  };
}

function sanitizeBlockingCriteria(items = []) {
  if (!Array.isArray(items)) return [];
  return items.slice(0, 8).map((item) => ({
    key: cleanString(item.key),
    label: cleanString(item.label),
    status: cleanString(item.status),
    detail: cleanString(item.detail),
  }));
}

function safeguardCheck({ key, label, passed, detail }) {
  return {
    key,
    label,
    status: passed ? "passed" : "pending",
    ready: passed === true,
    detail,
  };
}

function physicalProofLabel(key, fallback) {
  const labels = {
    label_sample_printed: "标签机真实样张",
    dot_matrix_sample_printed: "针式单据真实样张",
    paper_alignment_checked: "纸张对位",
    barcode_scan_checked: "条码扫码",
    spool_or_driver_callback_checked: "spool / 驱动回写",
    void_reprint_checked: "作废重打",
  };
  return labels[key] || cleanString(fallback || key);
}

function buildNextActions(stages, ready) {
  if (ready) {
    return [
      "把 print-chain closeout、打印 readiness 报告和 print_hardware 现场证据编号写入上线交接包。",
      "继续下一阶段司机真机验收：扫码、定位、导航、水印照片和上传兜底。",
    ];
  }
  return stages
    .filter((item) => item.status !== "passed")
    .map((item) => cleanString(item.nextAction))
    .filter(Boolean)
    .slice(0, 8);
}

function writePrintChainCloseoutArtifacts(report, { outputDir = defaultOutputDir } = {}) {
  mkdirSync(outputDir, { recursive: true });
  const safeTimestamp = cleanString(report.checkedAt || new Date().toISOString()).replace(/[:.]/g, "-");
  const json = `${JSON.stringify(report, null, 2)}\n`;
  const markdown = formatPrintChainCloseout(report);
  const jsonPath = join(outputDir, `print-chain-closeout-${safeTimestamp}.json`);
  const markdownPath = join(outputDir, `print-chain-closeout-${safeTimestamp}.md`);
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

function formatPrintChainCloseout(report) {
  const lines = [
    "# V1 Print-Chain Closeout",
    "",
    `Status: ${report.ready ? "READY" : "BLOCKED"} (${report.summary.label})`,
    `Checked at: ${report.checkedAt}`,
    "",
    "## Stages",
  ];
  for (const stage of report.stages) {
    lines.push(`- ${stage.status.toUpperCase()} ${stage.label}: ${stage.detail}`);
    if (stage.nextAction && stage.status !== "passed") lines.push(`  - Next: ${stage.nextAction}`);
  }
  lines.push(
    "",
    "## Evidence Summary",
    `- Print readiness: ${report.evidenceSummary.printReadiness.status} ${report.evidenceSummary.printReadiness.summaryLabel}`,
    `- Print hardware evidence: ${report.evidenceSummary.printHardwareEvidence.status} ${report.evidenceSummary.printHardwareEvidence.completedRequired}/${report.evidenceSummary.printHardwareEvidence.requiredTotal}`,
    `- Source artifact paths included: ${yesNo(report.evidenceSummary.sourceArtifactPathsIncluded)}`,
    `- Raw readiness report included: ${yesNo(report.evidenceSummary.rawReadinessReportIncluded)}`,
    `- Raw evidence refs included: ${yesNo(report.evidenceSummary.rawEvidenceRefsIncluded)}`,
    "",
    "## Safeguards",
    `- External service called by closeout: ${yesNo(report.safeguards.externalServiceCalledByCloseout)}`,
    `- API called by closeout: ${yesNo(report.safeguards.apiCalledByCloseout)}`,
    `- Physical printer called by closeout: ${yesNo(report.safeguards.physicalPrinterCalledByCloseout)}`,
    `- CUPS command called by closeout: ${yesNo(report.safeguards.cupsCommandCalledByCloseout)}`,
    `- Source artifact path exposed: ${yesNo(report.safeguards.sourceArtifactPathExposed)}`,
    `- Raw evidence refs included: ${yesNo(report.safeguards.rawEvidenceRefsIncluded)}`,
    `- Command values exposed: ${yesNo(report.safeguards.commandValueExposed)}`,
    `- Spool path exposed: ${yesNo(report.safeguards.spoolPathExposed)}`,
    `- Payload exposed: ${yesNo(report.safeguards.payloadExposed)}`,
    `- Declares full V1 complete: ${yesNo(report.safeguards.declaresFullV1Complete)}`,
    "",
    report.ready ? "## Next" : "## Next Blockers",
  );
  for (const action of report.nextActions) lines.push(`- ${action}`);
  if (report.artifacts) {
    lines.push("", "## Artifacts", `- JSON: ${report.artifacts.latestJsonPath}`, `- Markdown: ${report.artifacts.latestMarkdownPath}`);
  }
  lines.push("");
  return redactPrintCloseoutText(lines.join("\n"));
}

function redactPrintCloseoutReport(report) {
  const outputReport = {
    ...report,
    ...(report.artifacts ? { artifacts: redactCloseoutArtifactPaths(report.artifacts) } : {}),
  };
  return JSON.parse(redactPrintCloseoutText(JSON.stringify(outputReport)));
}

function redactCloseoutArtifactPaths(artifacts = {}) {
  return Object.fromEntries(
    Object.entries(artifacts).map(([key, value]) => [
      key,
      key === "outputDir" || key.endsWith("Path") ? "[redacted-path]" : value,
    ]),
  );
}

function redactPrintCloseoutText(value) {
  return redactCloseoutText(value).replace(/\/(?:Users|private|var|tmp|usr|opt)\/[^\s"'<>]+/g, "[redacted-path]");
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

function yesNo(value) {
  return value ? "yes" : "no";
}

export {
  buildPrintChainCloseout,
  formatPrintChainCloseout,
  parseArgs,
  redactPrintCloseoutText,
  writePrintChainCloseoutArtifacts,
};
