#!/usr/bin/env node

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const defaultOutputDir = join(".erp-local-storage", "v1-v2-scope-brief");
const defaultV1V2ScopePath = join("docs", "development", "v1-v2-scope.zh-CN.md");
const defaultCompletionSnapshotJsonPath = join(".erp-local-storage", "v1-completion-snapshot", "latest.json");
const sensitivePatterns = [
  /postgres:\/\/[^\s|)]+/gi,
  /mysql:\/\/[^\s|)]+/gi,
  /mongodb:\/\/[^\s|)]+/gi,
  /AKIA[0-9A-Z_]{8,}/g,
  /SUPER_SECRET_VALUE/gi,
  /pass@[^:\s|)]+/gi,
  /prod-db\.[^\s|)]+/gi,
  /\/var\/spool\/[^\s|)]*/gi,
  /\/usr\/bin\/[^\s|)]*/gi,
  /\/usr\/local\/bin\/[^\s|)]*/gi,
];

try {
  const options = parseArgs(process.argv.slice(2));
  const outputDir = resolve(options.outputDir || process.env.ERP_V1_V2_SCOPE_BRIEF_OUTPUT_DIR || defaultOutputDir);
  const v1V2ScopePath = resolve(options.v1V2Scope || process.env.ERP_V1_V2_SCOPE_BRIEF_SOURCE || defaultV1V2ScopePath);
  const completionSnapshotPath = resolveOptionalPath(
    options.completionSnapshotJson ||
      process.env.ERP_V1_V2_SCOPE_BRIEF_COMPLETION_SNAPSHOT_JSON ||
      defaultCompletionSnapshotJsonPath,
  );

  const scope = readV1V2Scope({ path: v1V2ScopePath });
  const completionSnapshot = completionSnapshotPath ? readCompletionSnapshot({ path: completionSnapshotPath }) : null;
  const brief = buildV1V2ScopeBrief({ scope, v1V2ScopePath, completionSnapshot, completionSnapshotPath });
  const files = writeBriefFiles({ outputDir, brief });
  const result = buildCommandResult({ brief, files });

  assertNoSensitiveOutput(JSON.stringify(result));
  if (options.json) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } else {
    process.stdout.write(formatCommandResult(result));
  }
} catch (error) {
  const message = redactText(error?.message || String(error));
  if (process.argv.includes("--json")) {
    process.stdout.write(`${JSON.stringify({ scope: "v1_v2_scope_brief", status: "error", ready: false, error: { message } }, null, 2)}\n`);
  } else {
    process.stderr.write(`V1/V2 scope brief failed: ${message}\n`);
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
    if (arg === "--output-dir") {
      options.outputDir = readValue(args, index, arg);
      index += 1;
      continue;
    }
    if (arg === "--v1-v2-scope") {
      options.v1V2Scope = readValue(args, index, arg);
      index += 1;
      continue;
    }
    if (arg === "--completion-snapshot-json") {
      options.completionSnapshotJson = readValue(args, index, arg);
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
    "Usage: node scripts/run-v1-v2-scope-brief.mjs [options]",
    "",
    "Options:",
    "  --output-dir <dir>                    Output directory, default .erp-local-storage/v1-v2-scope-brief",
    "  --v1-v2-scope <path>                  V1/V2 scope Markdown, default docs/development/v1-v2-scope.zh-CN.md",
    "  --completion-snapshot-json <path>     Optional V1 completion snapshot JSON",
    "  --json                                Print a machine-readable summary",
  ].join("\n");
}

function readV1V2Scope({ path }) {
  const markdown = readText(path, "V1/V2 scope Markdown");
  const versionRows = parseMarkdownTableAfterHeading(markdown, "## 版本口径").map((row) => ({
    version: sanitizeValue(row["版本"]),
    target: summarizeCell(row["目标"]),
    exclusions: summarizeCell(row["不做什么"]),
  }));
  const moduleDifferences = parseMarkdownTableAfterHeading(markdown, "## 模块差异").map((row) => ({
    module: sanitizeValue(row["模块"]),
    v1: summarizeCell(row["V1 范围"]),
    v2: summarizeCell(row["V2 范围"]),
  }));
  const mustContinue = parseNumberedListAfterHeading(markdown, "## V1 当前必须继续补的能力").map((item) => sanitizeValue(item));
  if (!versionRows.length) throw new Error("V1/V2 scope Markdown missed version table.");
  if (!moduleDifferences.length) throw new Error("V1/V2 scope Markdown missed module difference table.");
  if (!mustContinue.length) throw new Error("V1/V2 scope Markdown missed V1 must-continue list.");
  return { versionRows, moduleDifferences, mustContinue };
}

function readCompletionSnapshot({ path }) {
  const snapshot = readJson(path, "V1 completion snapshot JSON");
  if (snapshot?.scope !== "v1_completion_snapshot") {
    throw new Error(`V1 completion snapshot JSON has an unexpected shape: ${displayInputPath(path)}`);
  }
  return sanitizeObject(snapshot);
}

function buildV1V2ScopeBrief({ scope, v1V2ScopePath, completionSnapshot, completionSnapshotPath }) {
  const ready = Boolean(completionSnapshot?.ready);
  const v2Differences = mergeUnique([
    ...(Array.isArray(completionSnapshot?.v2Differences) ? completionSnapshot.v2Differences : []),
    ...scope.moduleDifferences.map((item) => `${item.module}：${item.v2}`),
  ]).map((item) => sanitizeValue(item));
  const v2Categories = classifyV2Categories(v2Differences);
  const v1MustContinue = mergeUnique([
    ...scope.mustContinue,
    ...(Array.isArray(completionSnapshot?.v1MustContinue) ? completionSnapshot.v1MustContinue : []),
  ]).map((item) => sanitizeValue(item));
  const completion = completionSnapshot?.completion || completionSnapshot?.summary || {};

  return {
    scope: "v1_v2_scope_brief",
    status: ready ? "ready_scope_brief_written" : "blocked_scope_brief_written",
    ready,
    canDeclareV1Complete: ready,
    generatedAt: new Date().toISOString(),
    conclusion: ready
      ? "V1/V2 边界已整理，可随负责人最终复核一起确认。"
      : "V1/V2 边界已整理，但 V1 仍未完成；不得把生产配置、真实设备、现场证据或签字后移到 V2。",
    summary: {
      moduleDifferenceCount: scope.moduleDifferences.length,
      v2DifferenceCount: v2Differences.length,
      v2CategoryCount: v2Categories.length,
      v1MustContinueCount: v1MustContinue.length,
      p0Prototype: sanitizeValue(completion.p0Prototype || ""),
      v1Readiness: sanitizeValue(completion.v1Readiness || ""),
      releaseGate: sanitizeValue(completion.releaseGate || ""),
      fieldEvidence: sanitizeValue(completion.fieldEvidence || ""),
    },
    versionRows: scope.versionRows,
    moduleDifferences: scope.moduleDifferences,
    v1MustContinue,
    v2Differences,
    v2Categories,
    ownerReview: {
      question: "是否确认这些 V2 项不阻塞 V1，但 V1 必须继续补齐真实生产和现场验收？",
      recommendation: ready
        ? "随 V1 交接包完成负责人最终签字。"
        : "先按 V1 必须继续补的清单处理阻塞，再复核 V2 延后项。",
      approvalRule:
        "V2 差异只说明延后增强项；release candidate、现场证据、负责人签字和 V1/V2 边界确认缺一项都不能宣布 V1 完成。",
    },
    source: {
      v1V2Scope: displayInputPath(v1V2ScopePath),
      completionSnapshotJson: completionSnapshotPath ? displayInputPath(completionSnapshotPath) : "",
    },
    safeguards: {
      redactedOutput: true,
      rawEvidenceRefsIncluded: false,
      rawSignersIncluded: false,
      rawSecretsIncluded: false,
      nonMutating: true,
    },
  };
}

function classifyV2Categories(items) {
  const categories = new Set();
  for (const item of items) {
    if (/企业微信|客户群|自动回复|自动发送|会话/.test(item)) categories.add("企微 / 客户自动化");
    if (/AI|OCR|识别|图片质量/.test(item)) categories.add("AI / OCR / 图片识别");
    if (/路线|排产|插单|产能|换模|优化/.test(item)) categories.add("路线 / 排产优化");
    if (/原材料|成本|毛利|损耗|领料/.test(item)) categories.add("原材料 / 成本毛利");
    if (/售后|责任|绩效|扣款|工资|考勤/.test(item)) categories.add("售后 / 责任 / 工资");
    if (/报表|BI|分析|画像|预测/.test(item)) categories.add("BI / 经营分析");
    if (/承运商|接口|追踪|多仓|库位/.test(item)) categories.add("外部接口 / 运营深化");
  }
  return Array.from(categories).sort();
}

function writeBriefFiles({ outputDir, brief }) {
  mkdirSync(outputDir, { recursive: true });
  const stamp = compactTimestamp(brief.generatedAt);
  const markdownPath = join(outputDir, `v1-v2-scope-brief-${stamp}.zh-CN.md`);
  const jsonPath = join(outputDir, `v1-v2-scope-brief-${stamp}.json`);
  const latestMarkdownPath = join(outputDir, "latest.zh-CN.md");
  const latestJsonPath = join(outputDir, "latest.json");
  const markdown = formatBriefMarkdown(brief);
  const json = `${JSON.stringify(brief, null, 2)}\n`;
  assertNoSensitiveOutput(markdown + json);
  writeFileSync(markdownPath, markdown);
  writeFileSync(jsonPath, json);
  writeFileSync(latestMarkdownPath, markdown);
  writeFileSync(latestJsonPath, json);
  return {
    markdown: displayPath(markdownPath),
    json: displayPath(jsonPath),
    latestMarkdown: displayPath(latestMarkdownPath),
    latestJson: displayPath(latestJsonPath),
  };
}

function buildCommandResult({ brief, files }) {
  return {
    scope: brief.scope,
    status: brief.status,
    ready: brief.ready,
    canDeclareV1Complete: brief.canDeclareV1Complete,
    generatedAt: brief.generatedAt,
    conclusion: brief.conclusion,
    summary: brief.summary,
    v2Categories: brief.v2Categories,
    safeguards: brief.safeguards,
    files,
  };
}

function formatCommandResult(result) {
  return [
    `V1/V2 scope brief: ${result.ready ? "READY" : "BLOCKED"} (${result.summary.v2DifferenceCount} V2 differences)`,
    result.conclusion,
    `Markdown: ${result.files.latestMarkdown}`,
    `JSON: ${result.files.latestJson}`,
    "",
  ].join("\n");
}

function formatBriefMarkdown(brief) {
  return [
    "# ERP V1 / V2 差异摘要",
    "",
    `- 生成时间：${brief.generatedAt}`,
    `- 当前结论：${brief.ready ? "READY" : "BLOCKED"}`,
    `- 是否可以宣布 V1 完成：${brief.canDeclareV1Complete ? "可以" : "不可以"}`,
    `- V1 上线就绪：${brief.summary.v1Readiness || "未读取"}`,
    `- 发布门禁：${brief.summary.releaseGate || "未读取"}`,
    `- 现场证据：${brief.summary.fieldEvidence || "未读取"}`,
    `- V1 必须继续补：${brief.summary.v1MustContinueCount} 项`,
    `- V2 差异：${brief.summary.v2DifferenceCount} 项`,
    `- V2 主题：${brief.v2Categories.length ? brief.v2Categories.join("、") : "未分类"}`,
    `- 说明：${brief.conclusion}`,
    "",
    "## 版本口径",
    "",
    "| 版本 | 目标 | 不做什么 |",
    "| --- | --- | --- |",
    ...brief.versionRows.map((row) =>
      `| ${escapeMarkdownTable(row.version)} | ${escapeMarkdownTable(row.target)} | ${escapeMarkdownTable(row.exclusions)} |`,
    ),
    "",
    "## V1 必须继续补",
    "",
    ...brief.v1MustContinue.map((item) => `- ${item}`),
    "",
    "## V2 计划差异",
    "",
    "| 模块 | V1 范围 | V2 范围 |",
    "| --- | --- | --- |",
    ...brief.moduleDifferences.map((item) =>
      `| ${escapeMarkdownTable(item.module)} | ${escapeMarkdownTable(item.v1)} | ${escapeMarkdownTable(item.v2)} |`,
    ),
    "",
    "## 负责人复核",
    "",
    `- 问题：${brief.ownerReview.question}`,
    `- 建议：${brief.ownerReview.recommendation}`,
    `- 规则：${brief.ownerReview.approvalRule}`,
    "",
    "## 安全说明",
    "",
    "- 本摘要只整理 V1/V2 范围、计数和边界规则，不打印原始 evidenceRef、签字人、真实 env 值、命令路径、spool 路径或密钥。",
    "- V2 差异不是 V1 放行条件；V1 完成仍以 release candidate READY、现场证据 manifest READY、负责人签字和 V1/V2 边界确认为准。",
    "",
  ].join("\n");
}

function parseMarkdownTableAfterHeading(markdown, heading) {
  const lines = markdown.split(/\r?\n/);
  const start = lines.findIndex((line) => line.trim() === heading);
  if (start < 0) return [];
  let tableStart = -1;
  for (let index = start + 1; index < lines.length; index += 1) {
    const line = lines[index].trim();
    if (line.startsWith("#")) break;
    if (line.startsWith("|")) {
      tableStart = index;
      break;
    }
  }
  if (tableStart < 0 || tableStart + 1 >= lines.length) return [];
  const headers = splitMarkdownRow(lines[tableStart]);
  const rows = [];
  for (let index = tableStart + 2; index < lines.length; index += 1) {
    const line = lines[index].trim();
    if (!line.startsWith("|")) break;
    const cells = splitMarkdownRow(line);
    const row = {};
    headers.forEach((header, cellIndex) => {
      row[header] = cells[cellIndex] || "";
    });
    rows.push(row);
  }
  return rows;
}

function splitMarkdownRow(line) {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim());
}

function parseNumberedListAfterHeading(markdown, heading) {
  const lines = markdown.split(/\r?\n/);
  const start = lines.findIndex((line) => line.trim() === heading);
  if (start < 0) return [];
  const items = [];
  for (let index = start + 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (line.trim().startsWith("#")) break;
    const match = line.match(/^\s*\d+\.\s+(.*)$/);
    if (match) items.push(match[1].trim());
  }
  return items;
}

function readJson(path, label) {
  if (!existsSync(path)) throw new Error(`${label} is missing: ${displayInputPath(path)}`);
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    throw new Error(`${label} is not readable JSON: ${displayInputPath(path)}`);
  }
}

function readText(path, label) {
  if (!existsSync(path)) throw new Error(`${label} is missing: ${displayInputPath(path)}`);
  return readFileSync(path, "utf8");
}

function resolveOptionalPath(path) {
  if (!path) return null;
  const fullPath = resolve(path);
  return existsSync(fullPath) ? fullPath : null;
}

function summarizeCell(value) {
  return sanitizeValue(value).replace(/\s+/g, " ").trim();
}

function sanitizeObject(value) {
  return JSON.parse(JSON.stringify(value, (_, inner) => (typeof inner === "string" ? redactText(inner) : inner)));
}

function sanitizeValue(value) {
  return redactText(String(value ?? "").replace(/\s+/g, " ").trim());
}

function mergeUnique(items) {
  const result = [];
  const seen = new Set();
  for (const item of items.map((value) => sanitizeValue(value)).filter(Boolean)) {
    if (seen.has(item)) continue;
    seen.add(item);
    result.push(item);
  }
  return result;
}

function displayInputPath(path) {
  return displayPath(path);
}

function displayPath(path) {
  if (!path) return "";
  const relativePath = relative(process.cwd(), resolve(path));
  return relativePath.startsWith("..") ? "[outside-workspace]" : relativePath || ".";
}

function compactTimestamp(value) {
  return String(value).replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

function escapeMarkdownTable(value) {
  return String(value ?? "").replaceAll("|", "\\|").replace(/\r?\n/g, " ");
}

function assertNoSensitiveOutput(output) {
  for (const pattern of sensitivePatterns) {
    if (pattern.test(output)) throw new Error(`output matched sensitive pattern ${pattern}`);
    pattern.lastIndex = 0;
  }
}

function redactText(text) {
  let result = String(text ?? "");
  for (const pattern of sensitivePatterns) {
    result = result.replace(pattern, "[redacted]");
  }
  return result;
}
