#!/usr/bin/env node

import { createRealSampleSeedTemplate } from "../server/seeds/realSampleOfficeSeedIntake.mjs";

try {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    process.stdout.write(formatHelp());
  } else {
    if (!options.confirmTemplateCreate) throw createError("REAL_SAMPLE_TEMPLATE_CONFIRMATION_REQUIRED");
    const report = createRealSampleSeedTemplate({ outputFile: options.outputFile });
    process.stdout.write(options.json ? `${JSON.stringify(report, null, 2)}\n` : formatReport(report));
  }
} catch (error) {
  const report = {
    version: "real-sample-seed-intake-v1",
    scope: "real_sample_seed_template",
    status: "error",
    ready: false,
    error: {
      code: String(error?.code ?? "REAL_SAMPLE_TEMPLATE_FAILED"),
      message: "无法生成私有真实样例模板。",
    },
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
    else throw createError("REAL_SAMPLE_TEMPLATE_ARGUMENT_INVALID");
  }
  return options;
}

function readValue(args, index) {
  const value = String(args[index] ?? "").trim();
  if (!value || value.startsWith("--")) throw createError("REAL_SAMPLE_TEMPLATE_ARGUMENT_INVALID");
  return value;
}

function formatHelp() {
  return [
    "Usage: node scripts/run-real-sample-seed-template.mjs --confirm-template-create [options]",
    "",
    "Options:",
    "  --output-file <file>        Private output under .erp-local-storage/real-samples/",
    "  --confirm-template-create   Required before creating the empty template",
    "  --json                      Print a redacted result",
    "  --help                      Show this help",
    "",
    "The template contains no customer, order, inventory, or source-message data and never overwrites a file.",
    "",
  ].join("\n");
}

function formatReport(report) {
  return [
    "已生成私有真实样例模板。",
    `要求案例：${report.summary.requiredCaseMin}-${report.summary.requiredCaseMax}条。`,
    `要求场景：${report.summary.requiredCoverageCount}类。`,
    "模板本身不含客户、订单、库存或消息数据，填写后必须运行预检。",
    "",
  ].join("\n");
}

function createError(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}
