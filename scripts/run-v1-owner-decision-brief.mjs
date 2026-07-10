#!/usr/bin/env node

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const defaultOutputDir = join(".erp-local-storage", "v1-owner-decision-brief");
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
  const outputDir = resolve(options.outputDir || process.env.ERP_V1_OWNER_DECISION_BRIEF_OUTPUT_DIR || defaultOutputDir);
  const completionSnapshotJsonPath = resolve(
    options.completionSnapshotJson ||
      process.env.ERP_V1_OWNER_DECISION_BRIEF_COMPLETION_SNAPSHOT_JSON ||
      defaultCompletionSnapshotJsonPath,
  );

  const completionSnapshot = readCompletionSnapshot({ path: completionSnapshotJsonPath });
  const brief = buildOwnerDecisionBrief({ completionSnapshot, completionSnapshotJsonPath });
  const files = writeBriefFiles({ outputDir, brief });
  const result = buildCommandResult({ brief, files });

  if (options.json) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } else {
    process.stdout.write(formatCommandResult(result));
  }
} catch (error) {
  const message = error?.message || String(error);
  if (process.argv.includes("--json")) {
    process.stdout.write(
      `${JSON.stringify({ status: "error", ready: false, error: { message: redactText(message) } }, null, 2)}\n`,
    );
  } else {
    process.stderr.write(`V1 owner decision brief failed: ${redactText(message)}\n`);
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
    "Usage: node scripts/run-v1-owner-decision-brief.mjs [options]",
    "",
    "Options:",
    "  --output-dir <dir>                    Output directory, default .erp-local-storage/v1-owner-decision-brief",
    "  --completion-snapshot-json <path>     V1 completion snapshot JSON, default .erp-local-storage/v1-completion-snapshot/latest.json",
    "  --json                                Print a machine-readable summary",
  ].join("\n");
}

function readCompletionSnapshot({ path }) {
  const snapshot = readJson(path, "V1 completion snapshot JSON");
  if (snapshot?.scope !== "v1_completion_snapshot") {
    throw new Error(`V1 completion snapshot JSON has an unexpected shape: ${displayInputPath(path)}`);
  }
  return sanitizeObject(snapshot);
}

function readJson(path, label) {
  if (!existsSync(path)) throw new Error(`${label} is missing: ${displayInputPath(path)}`);
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    throw new Error(`${label} is not readable JSON: ${displayInputPath(path)}`);
  }
}

function buildOwnerDecisionBrief({ completionSnapshot, completionSnapshotJsonPath }) {
  const ready = Boolean(completionSnapshot.ready);
  const blockedProof = arrayValue(completionSnapshot.completionProof).filter((item) => !isPassed(item.status));
  const blockerGroups = arrayValue(completionSnapshot.blockerGroups).map((group) => ({
    gate: sanitizeValue(group.gate),
    count: numberOrZero(group.count),
  }));
  const topBlockers = arrayValue(completionSnapshot.topBlockers).slice(0, 10).map((item) => ({
    gate: sanitizeValue(item.gate),
    label: sanitizeValue(item.label),
    status: sanitizeValue(item.status),
    detail: sanitizeValue(item.detail),
  }));
  const releaseGates = arrayValue(completionSnapshot.releaseCandidate?.gates).map((gate) => ({
    label: sanitizeValue(gate.label),
    status: gate.ready ? "passed" : "blocked",
    summary: sanitizeValue(gate.summary),
    detail: sanitizeValue(gate.detail),
  }));
  const nextActions = arrayValue(completionSnapshot.nextActions).map((item) => sanitizeValue(item)).filter(Boolean);
  const v2Differences = arrayValue(completionSnapshot.v2Differences).map((item) => sanitizeValue(item)).filter(Boolean);
  const completion = completionSnapshot.completion || {};
  const summary = completionSnapshot.summary || {};
  const doneHighlights = buildDoneHighlights({ summary, v2Differences, releaseGates });
  const unfinishedItems = buildUnfinishedItems({ blockedProof, blockerGroups, topBlockers, nextActions });

  return {
    scope: "v1_owner_decision_brief",
    status: ready ? "ready_for_owner_review" : "blocked_owner_brief_written",
    ready,
    canDeclareV1Complete: ready,
    generatedAt: new Date().toISOString(),
    conclusion: ready
      ? "当前证据显示 V1 已满足发布候选和现场任务条件，可提交负责人最终确认。"
      : "当前不能宣布 V1 完成；代码侧接近收口，但生产配置、现场证据、设备 / 真机验收和签字仍未闭环。",
    decision: {
      label: ready ? "可以进入负责人最终确认" : "不能宣布 V1 已完成",
      recommendation: ready
        ? "按交接包复核负责人签字、V1/V2 边界和小范围真实订单试运行记录。"
        : "先补齐生产环境、现场证据、真实设备 / 真机验收和负责人签字，再重新生成 release candidate。",
      ownerQuestion: ready ? "是否批准 V1 进入小范围真实上线？" : "是否继续按阻塞清单补齐后再评审？",
    },
    completion: {
      requirements: sanitizeValue(completion.requirements || summary.requirements),
      p0Prototype: sanitizeValue(completion.p0Prototype || summary.p0Prototype),
      v1Readiness: sanitizeValue(completion.v1Readiness || summary.v1Readiness),
      releaseGate: sanitizeValue(completion.releaseGate || summary.releaseGate),
      runtimeReadiness: sanitizeValue(completion.runtimeReadiness || summary.runtimeReadiness),
      fieldEvidence: sanitizeValue(completion.fieldEvidence || summary.fieldEvidence),
      fieldAcceptance: sanitizeValue(completion.fieldAcceptance || summary.fieldAcceptance),
      onsiteTaskCount: numberOrZero(completion.onsiteTaskCount ?? summary.onsiteTaskCount),
    },
    doneHighlights,
    unfinishedItems,
    releaseGates,
    blockerGroups,
    topBlockers,
    nextActions,
    v2Differences,
    source: {
      completionSnapshotJson: displayInputPath(completionSnapshotJsonPath),
    },
    safeguards: {
      redactedOutput: true,
      rawEvidenceRefsIncluded: false,
      rawSignersIncluded: false,
      rawSecretsIncluded: false,
      nonMutating: true,
      completionSnapshotReadyRequired: true,
    },
  };
}

function buildDoneHighlights({ summary, v2Differences, releaseGates }) {
  const highlights = [];
  if (summary.requirements) highlights.push(`需求确认已推进到 ${sanitizeValue(summary.requirements)}。`);
  if (summary.p0Prototype) highlights.push(`P0 原型 / 代码已推进到 ${sanitizeValue(summary.p0Prototype)}。`);
  if (releaseGates.length) highlights.push(`发布候选门禁已结构化为 ${releaseGates.length} 项，可重复运行校验。`);
  if (v2Differences.length) highlights.push(`V1/V2 差异已整理 ${v2Differences.length} 项，负责人可直接复核边界。`);
  return highlights.length ? highlights : ["已生成 V1 完成度快照，可作为负责人复核入口。"];
}

function buildUnfinishedItems({ blockedProof, blockerGroups, topBlockers, nextActions }) {
  const items = [];
  for (const proof of blockedProof) {
    items.push({
      type: "completion-proof",
      label: sanitizeValue(proof.item),
      detail: sanitizeValue(proof.evidence),
    });
  }
  for (const group of blockerGroups.filter((item) => item.count > 0)) {
    items.push({
      type: "blocker-group",
      label: sanitizeValue(group.gate),
      detail: `${group.count} 个阻塞项`,
    });
  }
  for (const blocker of topBlockers.slice(0, 5)) {
    items.push({
      type: "top-blocker",
      label: `${sanitizeValue(blocker.gate)} / ${sanitizeValue(blocker.label)}`.replace(/ \/ $/, ""),
      detail: sanitizeValue(blocker.detail || blocker.status),
    });
  }
  if (!items.length && nextActions.length) {
    for (const action of nextActions.slice(0, 5)) {
      items.push({ type: "next-action", label: "下一步", detail: action });
    }
  }
  return dedupeObjects(items).slice(0, 18);
}

function writeBriefFiles({ outputDir, brief }) {
  mkdirSync(outputDir, { recursive: true });
  const stamp = brief.generatedAt.replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  const baseName = `v1-owner-decision-brief-${stamp}`;
  const jsonPath = join(outputDir, `${baseName}.json`);
  const markdownPath = join(outputDir, `${baseName}.zh-CN.md`);
  const latestJsonPath = join(outputDir, "latest.json");
  const latestMarkdownPath = join(outputDir, "latest.zh-CN.md");
  writeFileSync(jsonPath, `${JSON.stringify(brief, null, 2)}\n`);
  writeFileSync(markdownPath, formatBriefMarkdown(brief));
  writeFileSync(latestJsonPath, `${JSON.stringify(brief, null, 2)}\n`);
  writeFileSync(latestMarkdownPath, formatBriefMarkdown(brief));
  return {
    json: displayPath(jsonPath),
    markdown: displayPath(markdownPath),
    latestJson: displayPath(latestJsonPath),
    latestMarkdown: displayPath(latestMarkdownPath),
  };
}

function buildCommandResult({ brief, files }) {
  return {
    status: brief.status,
    ready: brief.ready,
    canDeclareV1Complete: brief.canDeclareV1Complete,
    generatedAt: brief.generatedAt,
    conclusion: brief.conclusion,
    decision: brief.decision,
    completion: brief.completion,
    doneHighlights: brief.doneHighlights,
    unfinishedItems: brief.unfinishedItems,
    blockerGroups: brief.blockerGroups,
    nextActions: brief.nextActions,
    v2DifferenceCount: brief.v2Differences.length,
    safeguards: brief.safeguards,
    files,
  };
}

function formatCommandResult(result) {
  return [
    `V1 owner decision brief: ${result.ready ? "READY" : "BLOCKED"} (${result.decision.label})`,
    result.conclusion,
    `Can declare V1 complete: ${result.canDeclareV1Complete ? "yes" : "no"}`,
    `Markdown: ${result.files.markdown}`,
    `JSON: ${result.files.json}`,
    "",
  ].join("\n");
}

function formatBriefMarkdown(brief) {
  const lines = [
    "# ERP V1 负责人决策摘要",
    "",
    `- 生成时间：${brief.generatedAt}`,
    `- 当前结论：${brief.ready ? "READY" : "BLOCKED"}`,
    `- 是否可以宣布 V1 完成：${brief.canDeclareV1Complete ? "可以" : "不可以"}`,
    `- 决策建议：${brief.decision.recommendation}`,
    `- 负责人需要判断：${brief.decision.ownerQuestion}`,
    "",
    "## 一句话结论",
    "",
    brief.conclusion,
    "",
    "## 完成度",
    "",
    "| 口径 | 当前值 |",
    "| --- | --- |",
    `| 需求确认 | ${escapeMarkdownTable(brief.completion.requirements || "未读取")} |`,
    `| P0 原型 / 代码 | ${escapeMarkdownTable(brief.completion.p0Prototype || "未读取")} |`,
    `| V1 真实上线就绪 | ${escapeMarkdownTable(brief.completion.v1Readiness || "未读取")} |`,
    `| 发布候选 | ${escapeMarkdownTable(brief.completion.releaseGate || "未读取")} |`,
    `| 运行时 readiness | ${escapeMarkdownTable(brief.completion.runtimeReadiness || "未读取")} |`,
    `| 现场证据 | ${escapeMarkdownTable(brief.completion.fieldEvidence || "未读取")} |`,
    `| 现场验收 | ${escapeMarkdownTable(brief.completion.fieldAcceptance || "未读取")} |`,
    `| 现场任务 | ${brief.completion.onsiteTaskCount} 个 |`,
    "",
    "## 已完成 / 已收口",
    "",
    ...brief.doneHighlights.map((item) => `- ${item}`),
    "",
    "## 还没完成",
    "",
    ...(brief.unfinishedItems.length
      ? [
          "| 类型 | 项目 | 说明 |",
          "| --- | --- | --- |",
          ...brief.unfinishedItems.map((item) =>
            `| ${escapeMarkdownTable(item.type)} | ${escapeMarkdownTable(item.label)} | ${escapeMarkdownTable(item.detail)} |`,
          ),
        ]
      : ["- 当前没有未完成项；请进入负责人签字和小范围真实订单试运行。"]),
    "",
    "## 发布门禁",
    "",
    "| 门禁 | 状态 | 汇总 | 说明 |",
    "| --- | --- | --- | --- |",
    ...(brief.releaseGates.length
      ? brief.releaseGates.map((gate) =>
          `| ${escapeMarkdownTable(gate.label)} | ${gate.status === "passed" ? "通过" : "阻塞"} | ${escapeMarkdownTable(gate.summary)} | ${escapeMarkdownTable(gate.detail)} |`,
        )
      : ["| 未返回 | unknown | 未读取 | 未读取 |"]),
    "",
    "## V2 计划差异",
    "",
    ...(brief.v2Differences.length ? brief.v2Differences.map((item) => `- ${item}`) : ["- 未读取 V2 差异。"]),
    "",
    "## 建议下一步",
    "",
    ...(brief.nextActions.length ? brief.nextActions.map((item) => `- ${item}`) : ["- 当前无下一步。"]),
    "",
    "## 安全说明",
    "",
    "- 本摘要只汇总状态、计数、阻塞标签和 V1/V2 范围，不打印原始 evidenceRef、签字人、真实 env 值、命令路径、spool 路径或密钥。",
    "- 本摘要不是上线批准；只有 release candidate READY、现场证据 manifest READY、负责人签字和 V1/V2 边界确认完成后，才可以宣布 V1 完成。",
    "",
  ];
  return `${lines.join("\n")}`;
}

function dedupeObjects(items) {
  const result = [];
  const seen = new Set();
  for (const item of items) {
    const key = `${item.type}|${item.label}|${item.detail}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(item);
  }
  return result;
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

function isPassed(status) {
  return ["passed", "ready", "accepted"].includes(sanitizeValue(status));
}

function arrayValue(value) {
  return Array.isArray(value) ? value : [];
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
  return `[external:${stringValue(path).split(/[\\/]/).pop() || "file"}]`;
}

function escapeMarkdownTable(value) {
  return stringValue(value).replace(/\|/g, "\\|").replace(/\n/g, " ");
}
