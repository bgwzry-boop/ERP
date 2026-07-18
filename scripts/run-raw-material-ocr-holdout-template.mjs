#!/usr/bin/env node

import { createRawMaterialOcrHoldoutCorpusTemplate } from "../server/services/rawMaterialOcrHoldoutCorpusService.mjs";

try {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) process.stdout.write(formatHelp());
  else {
    if (!options.confirmTemplateCreate) throw Object.assign(new Error(), { code: "RAW_MATERIAL_OCR_HOLDOUT_TEMPLATE_CONFIRMATION_REQUIRED" });
    const report = createRawMaterialOcrHoldoutCorpusTemplate({ outputFile: options.outputFile });
    process.stdout.write(options.json ? `${JSON.stringify(report, null, 2)}\n` : "已创建私有原材料OCR留出样本空模板。模板不含业务数据，不能作为通过证据。\n");
  }
} catch (error) {
  const report = {
    version: "raw-material-ocr-holdout-corpus-v1",
    scope: "raw_material_ocr_holdout_template",
    status: "error",
    ready: false,
    error: { code: String(error?.code ?? "RAW_MATERIAL_OCR_HOLDOUT_TEMPLATE_FAILED"), message: "原材料OCR留出样本模板创建失败。" },
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
    else if (arg === "--confirm-template-create") options.confirmTemplateCreate = true;
    else if (arg === "--output-file") options.outputFile = readValue(args, ++index);
    else throw new Error("unknown_argument");
  }
  return options;
}

function readValue(args, index) {
  const value = String(args[index] ?? "").trim();
  if (!value || value.startsWith("--")) throw new Error("missing_value");
  return value;
}

function formatHelp() {
  return [
    "Usage: node scripts/run-raw-material-ocr-holdout-template.mjs --confirm-template-create [options]",
    "",
    "Options:",
    "  --output-file <file>  Private output under .erp-local-storage/raw-material-ocr-holdout/",
    "  --json                Print a redacted JSON result",
    "  --help                Show this help",
    "",
  ].join("\n");
}
