#!/usr/bin/env node

import { precheckRawMaterialOcrHoldoutCorpus } from "../server/services/rawMaterialOcrHoldoutCorpusService.mjs";

try {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) process.stdout.write(formatHelp());
  else {
    const report = precheckRawMaterialOcrHoldoutCorpus({ file: options.file });
    process.stdout.write(options.json ? `${JSON.stringify(report, null, 2)}\n` : formatReport(report));
    if (!report.ready && !options.allowBlockedExitZero) process.exitCode = 2;
  }
} catch {
  const report = {
    version: "raw-material-ocr-holdout-corpus-v1",
    scope: "raw_material_ocr_holdout_precheck",
    status: "error",
    ready: false,
    error: { code: "RAW_MATERIAL_OCR_HOLDOUT_ARGUMENT_INVALID", message: "原材料OCR留出样本预检参数无效。" },
  };
  if (process.argv.includes("--json")) process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  else process.stderr.write(`${report.error.message}\n`);
  process.exitCode = 1;
}

function parseArgs(args) {
  const options = {};
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--help" || arg === "-h") options.help = true;
    else if (arg === "--json") options.json = true;
    else if (arg === "--allow-blocked-exit-zero") options.allowBlockedExitZero = true;
    else if (arg === "--file") options.file = readValue(args, ++index);
    else throw new Error("unknown_argument");
  }
  return options;
}

function readValue(args, index) {
  const value = String(args[index] ?? "").trim();
  if (!value || value.startsWith("--")) throw new Error("missing_file");
  return value;
}

function formatReport(report) {
  if (!report.ready) return `原材料OCR留出样本预检未通过：${report.error.code}。${report.error.message}\n`;
  return [
    "原材料OCR留出样本预检通过。",
    `样本：${report.summary.caseCount}；供应商格式：${report.summary.formatKeys.length}/${report.summary.requiredFormatCount}；解析行：${report.summary.parsedLineCount}；卷/件：${report.summary.expectedRollCount}。`,
    "该结果仅证明私有留出表格行可被当前解析器稳定复现，不替代原图OCR、标签、贴标、扫码或整套ERP上线验收。",
    "",
  ].join("\n");
}

function formatHelp() {
  return [
    "Usage: node scripts/run-raw-material-ocr-holdout-precheck.mjs --file <private-json> [options]",
    "",
    "Options:",
    "  --file <file>                 Private holdout JSON to inspect",
    "  --allow-blocked-exit-zero      Return zero after a blocked report",
    "  --json                        Print only a redacted aggregate result",
    "  --help                        Show this help",
    "",
    "The report never prints input paths, supplier identities, document numbers, source cells, or monetary values.",
    "",
  ].join("\n");
}
