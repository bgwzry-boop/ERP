#!/usr/bin/env node

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const defaultOutputDir = join(".erp-local-storage", "v1-completion-snapshot");
const defaultReleaseCandidateJsonPath = join(".erp-local-storage", "v1-release-candidate", "latest.json");
const defaultOnsiteTaskBoardJsonPath = join(".erp-local-storage", "v1-onsite-task-board", "latest.json");
const defaultModuleCompletionPath = join("docs", "development", "module-completion-status.zh-CN.md");
const defaultV1V2ScopePath = join("docs", "development", "v1-v2-scope.zh-CN.md");
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
  const outputDir = resolve(options.outputDir || process.env.ERP_V1_COMPLETION_SNAPSHOT_OUTPUT_DIR || defaultOutputDir);
  const releaseCandidateJsonPath = resolve(
    options.releaseCandidateJson ||
      process.env.ERP_V1_COMPLETION_SNAPSHOT_RELEASE_CANDIDATE_JSON ||
      defaultReleaseCandidateJsonPath,
  );
  const onsiteTaskBoardJsonPath = resolveOptionalPath({
    explicitPath: options.onsiteTaskBoardJson,
    envPath: process.env.ERP_V1_COMPLETION_SNAPSHOT_ONSITE_TASK_BOARD_JSON,
    defaultPath: defaultOnsiteTaskBoardJsonPath,
    label: "V1 onsite task-board JSON",
  });
  const moduleCompletionPath = resolve(
    options.moduleCompletion || process.env.ERP_V1_COMPLETION_SNAPSHOT_MODULE_COMPLETION || defaultModuleCompletionPath,
  );
  const v1V2ScopePath = resolve(options.v1V2Scope || process.env.ERP_V1_COMPLETION_SNAPSHOT_V1_V2_SCOPE || defaultV1V2ScopePath);

  const releaseCandidate = readReleaseCandidate({ path: releaseCandidateJsonPath });
  const onsiteTaskBoard = readOnsiteTaskBoard({ path: onsiteTaskBoardJsonPath });
  const moduleCompletion = readModuleCompletion({ path: moduleCompletionPath });
  const v1V2Scope = readV1V2Scope({ path: v1V2ScopePath });
  const report = buildCompletionSnapshot({
    releaseCandidate,
    releaseCandidateJsonPath,
    onsiteTaskBoard,
    onsiteTaskBoardJsonPath,
    moduleCompletion,
    moduleCompletionPath,
    v1V2Scope,
    v1V2ScopePath,
  });
  const files = writeSnapshotFiles({ outputDir, report });
  const result = buildCommandResult({ report, files });

  if (options.json) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } else {
    process.stdout.write(formatCommandResult(result));
  }
} catch (error) {
  const message = error?.message || String(error);
  if (process.argv.includes("--json")) {
    process.stdout.write(`${JSON.stringify({ status: "error", ready: false, error: { message: redactText(message) } }, null, 2)}\n`);
  } else {
    process.stderr.write(`V1 completion snapshot failed: ${redactText(message)}\n`);
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
    if (arg === "--release-candidate-json") {
      options.releaseCandidateJson = readValue(args, index, arg);
      index += 1;
      continue;
    }
    if (arg === "--onsite-task-board-json") {
      options.onsiteTaskBoardJson = readValue(args, index, arg);
      index += 1;
      continue;
    }
    if (arg === "--module-completion") {
      options.moduleCompletion = readValue(args, index, arg);
      index += 1;
      continue;
    }
    if (arg === "--v1-v2-scope") {
      options.v1V2Scope = readValue(args, index, arg);
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
    "Usage: node scripts/run-v1-completion-snapshot.mjs [options]",
    "",
    "Options:",
    "  --output-dir <dir>                 Output directory, default .erp-local-storage/v1-completion-snapshot",
    "  --release-candidate-json <path>    V1 release-candidate JSON, default .erp-local-storage/v1-release-candidate/latest.json",
    "  --onsite-task-board-json <path>    Optional V1 onsite task-board JSON, default .erp-local-storage/v1-onsite-task-board/latest.json when present",
    "  --module-completion <path>         Module completion Markdown, default docs/development/module-completion-status.zh-CN.md",
    "  --v1-v2-scope <path>               V1/V2 scope Markdown, default docs/development/v1-v2-scope.zh-CN.md",
    "  --json                             Print a machine-readable summary",
  ].join("\n");
}

function readReleaseCandidate({ path }) {
  const releaseCandidate = readJson(path, "V1 release candidate JSON");
  if (releaseCandidate?.scope !== "v1_release_candidate_check") {
    throw new Error(`V1 release candidate JSON has an unexpected shape: ${displayInputPath(path)}`);
  }
  return releaseCandidate;
}

function readOnsiteTaskBoard({ path }) {
  if (!path) return { included: false, summary: {}, roleBuckets: [], tasks: [] };
  const taskBoard = readJson(path, "V1 onsite task-board JSON");
  if (taskBoard?.scope !== "v1_onsite_task_board") {
    throw new Error(`V1 onsite task-board JSON has an unexpected shape: ${displayInputPath(path)}`);
  }
  return {
    included: true,
    status: stringValue(taskBoard.status),
    ready: Boolean(taskBoard.ready),
    summary: taskBoard.summary || {},
    roleBuckets: Array.isArray(taskBoard.roleBuckets)
      ? taskBoard.roleBuckets.map((bucket) => ({
          role: sanitizeValue(bucket.role),
          taskCount: numberOrZero(bucket.taskCount),
          p0TaskCount: numberOrZero(bucket.p0TaskCount),
        }))
      : [],
    tasks: Array.isArray(taskBoard.tasks)
      ? taskBoard.tasks.map((task) => ({
          id: sanitizeValue(task.id),
          type: sanitizeValue(task.type),
          group: sanitizeValue(task.group),
          title: sanitizeValue(task.title),
          status: sanitizeValue(task.status),
          priority: sanitizeValue(task.priority),
          action: sanitizeValue(task.action),
          roles: Array.isArray(task.roles) ? task.roles.map((role) => sanitizeValue(role)).filter(Boolean) : [],
        }))
      : [],
  };
}

function readModuleCompletion({ path }) {
  const markdown = readText(path, "module completion Markdown");
  const overall = parseOverallCompletion(markdown);
  const modules = parseMarkdownTableAfterHeading(markdown, "## 分模块完成度").map((row) => ({
    module: sanitizeValue(row["模块"]),
    requirementCompletion: sanitizeValue(row["需求确认度"]),
    p0CodeCompletion: sanitizeValue(row["P0 原型 / 代码完成度"]),
    v1Readiness: sanitizeValue(row["V1 上线就绪度"]),
    currentStatus: summarizeCell(row["当前状态"]),
    remaining: summarizeCell(row["主要未完成项"]),
  }));
  return { overall, modules };
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
  const mustContinue = parseNumberedListAfterHeading(markdown, "## V1 当前必须继续补的能力").map((item) =>
    sanitizeValue(item),
  );
  return { versionRows, moduleDifferences, mustContinue };
}

function parseOverallCompletion(markdown) {
  const rows = parseMarkdownTableAfterHeading(markdown, "## 总体完成度");
  const result = {};
  for (const row of rows) {
    const key = stringValue(row["口径"]);
    if (key.includes("需求")) result.requirements = sanitizeValue(row["完成度"]);
    if (key.includes("P0")) result.p0Prototype = sanitizeValue(row["完成度"]);
    if (key.includes("V1")) result.v1Readiness = sanitizeValue(row["完成度"]);
  }
  return result;
}

function parseMarkdownTableAfterHeading(markdown, heading) {
  const index = markdown.indexOf(heading);
  if (index < 0) return [];
  const lines = markdown.slice(index).split(/\r?\n/);
  const tableStart = lines.findIndex((line) => line.trim().startsWith("|"));
  if (tableStart < 0 || tableStart + 1 >= lines.length) return [];
  const header = splitTableRow(lines[tableStart]);
  const rows = [];
  for (let index = tableStart + 2; index < lines.length; index += 1) {
    const line = lines[index].trim();
    if (!line.startsWith("|")) break;
    const values = splitTableRow(line);
    const row = {};
    for (const [cellIndex, key] of header.entries()) row[key] = values[cellIndex] || "";
    rows.push(row);
  }
  return rows;
}

function splitTableRow(line) {
  const trimmed = line.trim().replace(/^\|/, "").replace(/\|$/, "");
  return trimmed.split("|").map((cell) => cell.trim());
}

function parseNumberedListAfterHeading(markdown, heading) {
  const index = markdown.indexOf(heading);
  if (index < 0) return [];
  const lines = markdown.slice(index).split(/\r?\n/);
  const items = [];
  for (const line of lines.slice(1)) {
    if (line.startsWith("## ")) break;
    const match = line.match(/^\s*\d+\.\s+(.+)$/);
    if (match) items.push(match[1]);
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

function resolveOptionalPath({ explicitPath, envPath, defaultPath, label }) {
  const selected = explicitPath || envPath || defaultPath;
  const resolved = resolve(selected);
  if (existsSync(resolved)) return resolved;
  if (explicitPath || envPath) throw new Error(`${label} is missing: ${displayInputPath(resolved)}`);
  return null;
}

function buildCompletionSnapshot({
  releaseCandidate,
  releaseCandidateJsonPath,
  onsiteTaskBoard,
  onsiteTaskBoardJsonPath,
  moduleCompletion,
  moduleCompletionPath,
  v1V2Scope,
  v1V2ScopePath,
}) {
  const gates = normalizeGates(releaseCandidate.gates);
  const blockingItems = normalizeBlockingItems(releaseCandidate.blockingItems);
  const blockerGroups = groupBlockingItems(blockingItems);
  const v2Differences = mergeUnique([
    ...(Array.isArray(releaseCandidate.v2Differences) ? releaseCandidate.v2Differences : []),
    ...v1V2Scope.moduleDifferences.map((item) => `${item.module}：${item.v2}`),
  ]).map((item) => sanitizeValue(item));
  const ready = Boolean(releaseCandidate.ready && (!onsiteTaskBoard.included || onsiteTaskBoard.ready));
  const status = ready ? "ready" : "blocked";
  const completion = {
    requirements: moduleCompletion.overall.requirements || "",
    p0Prototype: moduleCompletion.overall.p0Prototype || "",
    v1Readiness: moduleCompletion.overall.v1Readiness || "",
    releaseGate: sanitizeValue(releaseCandidate.summary?.label || ""),
    runtimeReadiness: sanitizeValue(releaseCandidate.summary?.runtimeReadiness || ""),
    fieldEvidence: sanitizeValue(releaseCandidate.summary?.fieldEvidence || ""),
    fieldAcceptance: sanitizeValue(releaseCandidate.summary?.fieldAcceptance || ""),
    onsiteTaskCount: numberOrZero(onsiteTaskBoard.summary?.taskCount),
  };
  const completionProof = buildCompletionProof({ ready, releaseCandidate, onsiteTaskBoard });

  return {
    scope: "v1_completion_snapshot",
    status,
    ready,
    generatedAt: new Date().toISOString(),
    conclusion: ready
      ? "当前 V1 发布候选和现场任务均为 READY；可进入负责人最终复核。"
      : "当前不能声明 V1 已完成；代码侧能力已接近收口，但真实生产配置、现场证据、设备 / 真机验收和签字仍未完成。",
    sources: {
      releaseCandidateJson: displayInputPath(releaseCandidateJsonPath),
      onsiteTaskBoardJson: onsiteTaskBoardJsonPath ? displayInputPath(onsiteTaskBoardJsonPath) : "",
      moduleCompletion: displayInputPath(moduleCompletionPath),
      v1V2Scope: displayInputPath(v1V2ScopePath),
    },
    summary: {
      label: ready ? "V1 完成度快照：READY" : "V1 完成度快照：BLOCKED",
      requirements: completion.requirements,
      p0Prototype: completion.p0Prototype,
      v1Readiness: completion.v1Readiness,
      releaseGate: completion.releaseGate,
      runtimeReadiness: completion.runtimeReadiness,
      fieldEvidence: completion.fieldEvidence,
      fieldAcceptance: completion.fieldAcceptance,
      onsiteTaskCount: completion.onsiteTaskCount,
      v2DifferenceCount: v2Differences.length,
    },
    releaseCandidate: {
      status: sanitizeValue(releaseCandidate.status),
      ready: Boolean(releaseCandidate.ready),
      summary: sanitizeObject(releaseCandidate.summary || {}),
      gates,
    },
    onsiteTaskBoard: {
      included: Boolean(onsiteTaskBoard.included),
      status: sanitizeValue(onsiteTaskBoard.status),
      ready: Boolean(onsiteTaskBoard.ready),
      summary: sanitizeObject(onsiteTaskBoard.summary || {}),
      roleBuckets: onsiteTaskBoard.roleBuckets,
    },
    completion,
    completionProof,
    moduleCompletion: moduleCompletion.modules,
    blockerGroups,
    topBlockers: blockingItems.slice(0, 12),
    v1Scope: Array.isArray(releaseCandidate.v1Scope) ? releaseCandidate.v1Scope.map((item) => sanitizeValue(item)) : [],
    v2Differences,
    moduleV1V2Differences: v1V2Scope.moduleDifferences,
    v1MustContinue: v1V2Scope.mustContinue,
    nextActions: buildNextActions({ gates, onsiteTaskBoard, blockerGroups }),
    safeguards: {
      redactedOutput: true,
      rawEvidenceRefsIncluded: false,
      rawSignersIncluded: false,
      rawSecretsIncluded: false,
      nonMutating: true,
      releaseCandidateReadyRequired: true,
      onsiteTaskBoardReadyRequired: true,
    },
  };
}

function normalizeGates(gates) {
  return Array.isArray(gates)
    ? gates.map((gate) => ({
        key: sanitizeValue(gate.key),
        label: sanitizeValue(gate.label),
        status: sanitizeValue(gate.status),
        ready: Boolean(gate.ready),
        summary: sanitizeValue(gate.summary),
        detail: sanitizeValue(gate.detail),
      }))
    : [];
}

function normalizeBlockingItems(items) {
  return Array.isArray(items)
    ? items.map((item) => ({
        gate: sanitizeValue(item.gate),
        key: sanitizeValue(item.key),
        label: sanitizeValue(item.label),
        status: sanitizeValue(item.status),
        detail: sanitizeValue(item.detail),
      }))
    : [];
}

function groupBlockingItems(items) {
  const counts = new Map();
  for (const item of items) {
    const gate = item.gate || "未归类";
    counts.set(gate, (counts.get(gate) || 0) + 1);
  }
  return [...counts.entries()].map(([gate, count]) => ({ gate, count }));
}

function buildCompletionProof({ ready, releaseCandidate, onsiteTaskBoard }) {
  const releaseReady = Boolean(releaseCandidate.ready);
  const onsiteReady = onsiteTaskBoard.included ? Boolean(onsiteTaskBoard.ready) : false;
  const fieldEvidenceReady = releaseCandidate.fieldEvidenceManifest?.ready === true;
  return [
    {
      item: "发布候选 4/4 门禁",
      status: releaseReady ? "passed" : "blocked",
      evidence: sanitizeValue(releaseCandidate.summary?.label || ""),
    },
    {
      item: "现场任务清零",
      status: onsiteReady ? "passed" : "blocked",
      evidence: onsiteTaskBoard.included
        ? sanitizeValue(onsiteTaskBoard.summary?.label || "")
        : "未纳入现场任务板，不能证明现场任务清零。",
    },
    {
      item: "现场证据和签字",
      status: fieldEvidenceReady ? "passed" : "blocked",
      evidence: sanitizeValue(releaseCandidate.summary?.fieldEvidence || ""),
    },
    {
      item: "V1 完成声明",
      status: ready ? "passed" : "blocked",
      evidence: ready
        ? "发布候选与现场任务均为 ready。"
        : "至少一个发布或现场验收门禁仍未通过，不能声明 V1 完成。",
    },
  ];
}

function buildNextActions({ gates, onsiteTaskBoard, blockerGroups }) {
  const actions = [];
  for (const gate of gates.filter((item) => !item.ready)) {
    actions.push(`${gate.label}：${gate.detail || gate.summary || "补齐该发布门禁"}`);
  }
  if (onsiteTaskBoard.included && !onsiteTaskBoard.ready) {
    actions.push(`现场任务清单：继续处理 ${numberOrZero(onsiteTaskBoard.summary?.taskCount)} 个岗位任务，并回填现场证据 manifest。`);
  }
  for (const group of blockerGroups.slice(0, 6)) {
    actions.push(`${group.gate}：仍有 ${group.count} 个阻塞项。`);
  }
  return mergeUnique(actions).slice(0, 10);
}

function writeSnapshotFiles({ outputDir, report }) {
  mkdirSync(outputDir, { recursive: true });
  const stamp = report.generatedAt.replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  const baseName = `v1-completion-snapshot-${stamp}`;
  const jsonPath = join(outputDir, `${baseName}.json`);
  const markdownPath = join(outputDir, `${baseName}.md`);
  const latestJsonPath = join(outputDir, "latest.json");
  const latestMarkdownPath = join(outputDir, "latest.md");
  writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`);
  writeFileSync(markdownPath, formatSnapshotMarkdown(report));
  writeFileSync(latestJsonPath, `${JSON.stringify(report, null, 2)}\n`);
  writeFileSync(latestMarkdownPath, formatSnapshotMarkdown(report));
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
    conclusion: report.conclusion,
    summary: report.summary,
    completion: report.completion,
    completionProof: report.completionProof,
    moduleCompletion: report.moduleCompletion,
    blockerGroups: report.blockerGroups,
    onsiteTaskBoard: report.onsiteTaskBoard,
    v2Differences: report.v2Differences,
    moduleV1V2Differences: report.moduleV1V2Differences,
    v1MustContinue: report.v1MustContinue,
    nextActions: report.nextActions,
    safeguards: report.safeguards,
    files,
  };
}

function formatCommandResult(result) {
  return [
    `V1 completion snapshot: ${result.ready ? "READY" : "BLOCKED"} (${result.summary.releaseGate || "no release summary"})`,
    result.conclusion,
    `P0 prototype: ${result.summary.p0Prototype || "unknown"}`,
    `V1 readiness: ${result.summary.v1Readiness || "unknown"}`,
    `Onsite tasks: ${result.summary.onsiteTaskCount}`,
    `Markdown: ${result.files.markdown}`,
    `JSON: ${result.files.json}`,
    "",
  ].join("\n");
}

function formatSnapshotMarkdown(report) {
  const lines = [
    "# ERP V1 完成度快照",
    "",
    `- 生成时间：${report.generatedAt}`,
    `- 结论：${report.ready ? "READY" : "BLOCKED"}`,
    `- 说明：${report.conclusion}`,
    `- 需求确认度：${report.summary.requirements || "未读取"}`,
    `- P0 原型 / 代码完成度：${report.summary.p0Prototype || "未读取"}`,
    `- V1 真实上线就绪度：${report.summary.v1Readiness || "未读取"}`,
    `- 发布候选：${report.summary.releaseGate || "未读取"}`,
    `- 现场任务：${report.summary.onsiteTaskCount} 个`,
    "",
    "## 完成声明证据",
    "",
    "| 项目 | 状态 | 证据 |",
    "| --- | --- | --- |",
    ...report.completionProof.map((item) =>
      `| ${escapeMarkdownTable(item.item)} | ${escapeMarkdownTable(item.status)} | ${escapeMarkdownTable(item.evidence)} |`,
    ),
    "",
    "## 发布门禁",
    "",
    "| 门禁 | 状态 | 汇总 | 说明 |",
    "| --- | --- | --- | --- |",
    ...(report.releaseCandidate.gates.length
      ? report.releaseCandidate.gates.map((gate) =>
          `| ${escapeMarkdownTable(gate.label)} | ${gate.ready ? "通过" : "阻塞"} | ${escapeMarkdownTable(gate.summary)} | ${escapeMarkdownTable(gate.detail)} |`,
        )
      : ["| 未返回 | unknown | 未返回 | 未返回 |"]),
    "",
    "## 岗位阻塞",
    "",
    ...(report.onsiteTaskBoard.included
      ? [
          "| 角色 | 待处理任务 | P0 |",
          "| --- | ---: | ---: |",
          ...report.onsiteTaskBoard.roleBuckets
            .filter((bucket) => bucket.taskCount > 0)
            .map((bucket) => `| ${escapeMarkdownTable(bucket.role)} | ${bucket.taskCount} | ${bucket.p0TaskCount} |`),
        ]
      : ["- 未纳入现场任务清单。"]),
    "",
    "## 模块完成度",
    "",
    "| 模块 | 需求 | P0 / 代码 | V1 上线 | 主要未完成项 |",
    "| --- | ---: | ---: | ---: | --- |",
    ...report.moduleCompletion.map((item) =>
      `| ${escapeMarkdownTable(item.module)} | ${escapeMarkdownTable(item.requirementCompletion)} | ${escapeMarkdownTable(item.p0CodeCompletion)} | ${escapeMarkdownTable(item.v1Readiness)} | ${escapeMarkdownTable(item.remaining)} |`,
    ),
    "",
    "## V2 计划差异",
    "",
    "| 模块 | V1 范围 | V2 范围 |",
    "| --- | --- | --- |",
    ...report.moduleV1V2Differences.map((item) =>
      `| ${escapeMarkdownTable(item.module)} | ${escapeMarkdownTable(item.v1)} | ${escapeMarkdownTable(item.v2)} |`,
    ),
    "",
    "## 下一步",
    "",
    ...(report.nextActions.length ? report.nextActions.map((item) => `- ${item}`) : ["- 当前无下一步。"]),
    "",
    "## 安全说明",
    "",
    "- 本快照只汇总状态、计数、阻塞标签和 V1/V2 范围，不打印原始 evidenceRef、签字人、真实 env 值、命令路径、spool 路径或密钥。",
    "- 完成度快照不是上线批准；最终仍以 release candidate READY、现场证据 manifest ready、负责人签字和 V1/V2 边界确认作为完成标准。",
    "",
  ];
  return `${lines.join("\n")}`;
}

function summarizeCell(value) {
  const sanitized = sanitizeValue(value);
  if (sanitized.length <= 180) return sanitized;
  return `${sanitized.slice(0, 177)}...`;
}

function sanitizeObject(value) {
  return JSON.parse(JSON.stringify(value, (_, current) => (typeof current === "string" ? redactText(current) : current)));
}

function sanitizeValue(value) {
  return redactText(stringValue(value).replace(/\s+/g, " ").trim());
}

function redactText(value) {
  let output = stringValue(value);
  for (const pattern of sensitivePatterns) output = output.replace(pattern, "[redacted]");
  return output;
}

function mergeUnique(values) {
  const result = [];
  const seen = new Set();
  for (const value of values.map((item) => sanitizeValue(item)).filter(Boolean)) {
    if (seen.has(value)) continue;
    seen.add(value);
    result.push(value);
  }
  return result;
}

function numberOrZero(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function stringValue(value) {
  return value == null ? "" : String(value);
}

function displayPath(path) {
  const relativePath = relative(process.cwd(), resolve(path));
  if (!relativePath.startsWith("..") && !relativePath.startsWith("/") && relativePath !== "") return relativePath;
  return "[external-output]";
}

function displayInputPath(path) {
  const relativePath = relative(process.cwd(), resolve(path));
  if (!relativePath.startsWith("..") && !relativePath.startsWith("/") && relativePath !== "") return relativePath;
  return "[external-input]";
}

function escapeMarkdownTable(value) {
  return sanitizeValue(value).replace(/\|/g, "\\|").replace(/\n/g, " ");
}
