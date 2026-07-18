#!/usr/bin/env node

import { precheckRealSampleOfficeSeed } from "../server/seeds/realSampleOfficeSeedIntake.mjs";

try {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    process.stdout.write(formatHelp());
  } else {
    const report = precheckRealSampleOfficeSeed({ file: options.file });
    process.stdout.write(options.json ? `${JSON.stringify(report, null, 2)}\n` : formatReport(report));
    if (!report.ready && !options.allowBlockedExitZero) process.exitCode = 2;
  }
} catch {
  const report = {
    version: "real-sample-seed-intake-v1",
    scope: "real_sample_seed_precheck",
    status: "error",
    ready: false,
    error: {
      code: "REAL_SAMPLE_SEED_PRECHECK_ARGUMENT_INVALID",
      message: "真实样例预检参数无效。",
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

function formatHelp() {
  return [
    "Usage: node scripts/run-real-sample-seed-precheck.mjs --file <private-json> [options]",
    "",
    "Options:",
    "  --file <file>                 Private real-sample JSON to inspect",
    "  --allow-blocked-exit-zero      Return zero after a blocked report",
    "  --json                        Print only a redacted aggregate result",
    "  --help                        Show this help",
    "",
    "The report never prints input paths, source messages, customers, orders, inventory, or other business rows.",
    "",
  ].join("\n");
}

function formatReport(report) {
  if (!report.ready) {
    return `真实样例预检未通过：${report.error.code}。${report.error.message}\n`;
  }
  return [
    "真实样例预检通过。",
    `案例：${report.summary.caseCount}；来源消息：${report.summary.sourceMessageCount}；场景：${report.summary.coverageKeys.length}/${report.summary.requiredCoverageCount}。`,
    `工作区记录：客户${report.summary.workspaceRecordCounts.customers}、订单${report.summary.workspaceRecordCounts.orderLines}、库存${report.summary.workspaceRecordCounts.inventories}、交付${report.summary.workspaceRecordCounts.fulfillments}、对账${report.summary.workspaceRecordCounts.statements}。`,
    "",
  ].join("\n");
}
