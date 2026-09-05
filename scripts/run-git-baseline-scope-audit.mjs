#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const DEFAULT_OUTPUT_PATH = ".erp-local-storage/git-baseline-scope-audit/latest.json";

const GROUPS = Object.freeze([
  {
    key: "governance_docs",
    label: "产品、项目与发布治理文档",
    owns: (path) => path.startsWith("docs/") || ROOT_DOCUMENTS.has(path),
  },
  {
    key: "engineering_tooling",
    label: "测试编排与发布审计工具",
    owns: (path) => path === ".gitignore" || path === "package.json" || path === "package-lock.json" || path === "vite.config.mjs" || path === "eslint.config.mjs" || PLAYWRIGHT_CONFIG_PATTERN.test(path) || path.startsWith("deploy/") || path.startsWith(".github/workflows/") || TOOLING_PATH_PATTERN.test(path),
  },
  {
    key: "runtime_domain",
    label: "数据库、后端与共享领域代码",
    owns: (path) => /^(db|server|shared)\//.test(path),
  },
  {
    key: "frontend_ui",
    label: "前端业务、交互与样式",
    owns: (path) => path === "index.html" || path.startsWith("src/"),
  },
  {
    key: "verification",
    label: "业务与结构回归脚本",
    owns: (path) =>
      path.startsWith("scripts/") ||
      path.startsWith("e2e/") ||
      path.startsWith("review-e2e/") ||
      path.startsWith("qa/"),
  },
]);

const STAGING_REVIEW_BATCHES = Object.freeze([
  {
    key: "runtime_domain",
    label: "数据库、后端与共享领域",
    checks: ["db:check", "api:validate-openapi", "对应领域专项"],
  },
  {
    key: "frontend_ui",
    label: "前端业务、交互与样式",
    checks: ["目标页面专项", "npm run build", "桌面/手机预览"],
  },
  {
    key: "verification",
    label: "业务与结构回归脚本",
    checks: ["对应业务专项", "npm run test", "脚本与源码同批复核"],
  },
  {
    key: "engineering_tooling",
    label: "测试编排与发布审计工具",
    checks: ["check-group-runner:check", "git-baseline-scope:check", "package 脚本复核"],
  },
  {
    key: "governance_docs",
    label: "产品、项目与发布治理文档",
    checks: ["current-project-docs:check", "git diff --check", "状态数字复核"],
  },
]);

const ROOT_DOCUMENTS = new Set([
  "00_项目入口.md",
  "01_当前状态与下一步.md",
  "02_问题或报错日志.md",
  "AGENTS.md",
  "DECISIONS.md",
  "PRODUCT.md",
  "PROJECT_STATUS.md",
  "ROADMAP.md",
  "README.md",
  "DESIGN.md",
  "design.md",
  "design-qa.md",
]);
const TOOLING_PATH_PATTERN = /^scripts\/(?:check-check-group-runner|check-current-project-docs|check-group-manifest|run-check-group|check-git-baseline-scope-audit|run-git-baseline-scope-audit)\.mjs$/;
const PLAYWRIGHT_CONFIG_PATTERN = /^playwright(?:\.[^/]+)?\.config\.mjs$/;
const FORBIDDEN_PATH_PATTERN = /^(?:\.erp-local-storage|dist|node_modules|screenshots)(?:\/|$)/;
const SENSITIVE_FILE_PATTERN = /(?:^|\/)(?:\.env(?:\..*)?|[^/]+\.(?:pem|key|p12|pfx|jks|keystore))$/i;
const ALLOWED_ENV_EXAMPLE_PATTERN = /(?:\.example|\.template)(?:\.[^/]*)?$/i;
const MAX_UNTRACKED_SCAN_BYTES = 2 * 1024 * 1024;
const CONTENT_RULES = Object.freeze([
  { key: "private_key", pattern: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/ },
  { key: "aws_access_key", pattern: /\bAKIA[0-9A-Z]{16}\b/ },
  { key: "github_token", pattern: /\bgh[pousr]_[A-Za-z0-9]{36,}\b/ },
  { key: "slack_token", pattern: /\bxox[baprs]-[A-Za-z0-9-]{20,}\b/ },
]);
const AUTHENTICATED_DATABASE_URL_PATTERN = /\bpostgres(?:ql)?:\/\/[^\s/:@]+:[^\s@/]+@[^\s/]+/i;

if (isCliEntrypoint()) runCli();

function runCli() {
  try {
    const options = parseArgs(process.argv.slice(2));
    const report = inspectGitBaselineScope({ rootDir: options.rootDir });
    if (options.write) writeGitBaselineScopeReport(report, { outputPath: options.outputPath });
    process.stdout.write(options.json ? `${JSON.stringify(report, null, 2)}\n` : formatGitBaselineScopeReport(report));
    process.exitCode = report.scopeSafe ? 0 : 2;
  } catch (error) {
    process.stderr.write(`Git baseline scope audit failed: ${String(error?.message ?? error)}\n`);
    process.exitCode = 1;
  }
}

export function inspectGitBaselineScope({ rootDir = process.cwd() } = {}) {
  const resolvedRoot = resolve(rootDir);
  const entries = parsePorcelainStatus(runGit(resolvedRoot, ["status", "--porcelain=v1", "-z", "--untracked-files=all"]));
  const remotes = runGit(resolvedRoot, ["remote"], { trim: true }).split("\n").filter(Boolean);
  const branch = runGit(resolvedRoot, ["branch", "--show-current"], { trim: true });
  const head = runGit(resolvedRoot, ["rev-parse", "--short=12", "HEAD"], { trim: true });
  const contentFindings = scanChangedContent({ rootDir: resolvedRoot, entries });
  return buildGitBaselineScopeReport({ entries, remoteCount: remotes.length, branch, head, contentFindings });
}

export function buildGitBaselineScopeReport({
  entries = [],
  remoteCount = 0,
  branch = "",
  head = "",
  contentFindings = [],
} = {}) {
  const normalizedEntries = entries.map(normalizeEntry).sort((left, right) => left.path.localeCompare(right.path));
  const duplicatePaths = findDuplicates(normalizedEntries.map((entry) => entry.path));
  const forbiddenPaths = normalizedEntries
    .filter((entry) => FORBIDDEN_PATH_PATTERN.test(entry.path))
    .map((entry) => entry.path);
  const sensitivePaths = normalizedEntries
    .filter((entry) => SENSITIVE_FILE_PATTERN.test(entry.path) && !ALLOWED_ENV_EXAMPLE_PATTERN.test(entry.path))
    .map((entry) => entry.path);
  const groups = GROUPS.map((group) => ({ key: group.key, label: group.label, files: [] }));
  const unclassifiedPaths = [];

  for (const entry of normalizedEntries) {
    const owner = GROUPS.find((group) => group.owns(entry.path));
    if (!owner) {
      unclassifiedPaths.push(entry.path);
      continue;
    }
    groups.find((group) => group.key === owner.key).files.push({ path: entry.path, status: entry.status });
  }

  const stagedCount = normalizedEntries.filter((entry) => isStaged(entry.status)).length;
  const unstagedCount = normalizedEntries.filter((entry) => isUnstaged(entry.status)).length;
  const untrackedCount = normalizedEntries.filter((entry) => entry.status === "??").length;
  const deletedCount = normalizedEntries.filter((entry) => entry.status.includes("D")).length;
  const scopeSafe =
    duplicatePaths.length === 0 &&
    forbiddenPaths.length === 0 &&
    sensitivePaths.length === 0 &&
    contentFindings.length === 0 &&
    unclassifiedPaths.length === 0;
  const releaseReady = scopeSafe && normalizedEntries.length === 0 && Number(remoteCount) > 0;

  const groupsWithCounts = groups.map((group) => ({ ...group, count: group.files.length }));
  const stagingReview = buildStagingReview({
    groups: groupsWithCounts,
    scopeSafe,
    stagedCount,
  });

  return {
    scope: "git_baseline_scope_audit",
    status: scopeSafe ? "classified" : "blocked",
    scopeSafe,
    releaseReady,
    branch: cleanText(branch),
    head: cleanText(head),
    summary: {
      changedFileCount: normalizedEntries.length,
      stagedCount,
      unstagedCount,
      untrackedCount,
      deletedCount,
      classifiedCount: groups.reduce((sum, group) => sum + group.files.length, 0),
      groupCount: groups.length,
      remoteCount: Math.max(0, Number(remoteCount) || 0),
      unclassifiedCount: unclassifiedPaths.length,
      duplicateCount: duplicatePaths.length,
      forbiddenPathCount: forbiddenPaths.length,
      sensitivePathCount: sensitivePaths.length,
      sensitiveContentFindingCount: contentFindings.length,
    },
    groups: groupsWithCounts,
    stagingReview,
    blockers: [
      ...(Number(remoteCount) > 0 ? [] : ["controlled_git_remote_missing"]),
      ...(normalizedEntries.length === 0 ? [] : ["worktree_not_clean"]),
      ...(stagedCount > 0 ? ["staged_changes_require_review"] : []),
      ...(unclassifiedPaths.length ? ["unclassified_paths"] : []),
      ...(duplicatePaths.length ? ["duplicate_paths"] : []),
      ...(forbiddenPaths.length ? ["forbidden_paths"] : []),
      ...(sensitivePaths.length ? ["sensitive_paths"] : []),
      ...(contentFindings.length ? ["sensitive_content"] : []),
    ],
    unclassifiedPaths,
    duplicatePaths,
    forbiddenPaths,
    sensitivePaths,
    sensitiveContentFindings: contentFindings.map(normalizeContentFinding),
    safeguards: {
      readOnly: true,
      expandedUntrackedFiles: true,
      gitAddExecuted: false,
      gitCommitExecuted: false,
      gitPushExecuted: false,
      absolutePathsIncluded: false,
      fileContentsIncluded: false,
      matchedContentIncluded: false,
      secretValuesIncluded: false,
    },
  };
}

export function scanChangedContent({ rootDir = process.cwd(), entries = [] } = {}) {
  const findings = [];
  for (const entry of entries.map(normalizeEntry)) {
    if (!entry.path || entry.status.includes("D")) continue;
    if (entry.status === "??") {
      const source = readUntrackedTextFile(rootDir, entry.path);
      if (source !== null) findings.push(...scanLines(entry.path, source.split(/\r?\n/)));
      continue;
    }
    const unstagedDiff = runGit(rootDir, ["diff", "--no-ext-diff", "--no-color", "--unified=0", "--", entry.path]);
    const stagedDiff = runGit(rootDir, ["diff", "--cached", "--no-ext-diff", "--no-color", "--unified=0", "--", entry.path]);
    findings.push(...scanLines(entry.path, extractAddedLines(unstagedDiff)));
    findings.push(...scanLines(entry.path, extractAddedLines(stagedDiff)));
  }
  return deduplicateFindings(findings);
}

function scanLines(path, lines) {
  const findings = [];
  lines.forEach((line, index) => {
    for (const rule of CONTENT_RULES) {
      if (rule.pattern.test(line)) findings.push({ path, rule: rule.key, line: index + 1 });
    }
    if (shouldScanDatabaseCredentials(path) && AUTHENTICATED_DATABASE_URL_PATTERN.test(line)) {
      findings.push({ path, rule: "database_url_with_password", line: index + 1 });
    }
  });
  return findings;
}

function extractAddedLines(diffSource) {
  return String(diffSource ?? "")
    .split(/\r?\n/)
    .filter((line) => line.startsWith("+") && !line.startsWith("+++"))
    .map((line) => line.slice(1));
}

function readUntrackedTextFile(rootDir, path) {
  try {
    const absolutePath = resolve(rootDir, path);
    const stats = statSync(absolutePath);
    if (!stats.isFile() || stats.size > MAX_UNTRACKED_SCAN_BYTES) return null;
    const buffer = readFileSync(absolutePath);
    if (buffer.includes(0)) return null;
    return buffer.toString("utf8");
  } catch {
    return null;
  }
}

function shouldScanDatabaseCredentials(path) {
  if (path.startsWith("docs/")) return false;
  if (/^scripts\/check-/.test(path)) return false;
  if (/(?:\.example|\.template)(?:\.[^/]*)?$/i.test(path)) return false;
  return /^(?:server|src|shared|deploy)\//.test(path) || path === "package.json";
}

function normalizeContentFinding(value) {
  return {
    path: cleanRelativePath(value?.path),
    rule: cleanText(value?.rule),
    line: Math.max(0, Math.trunc(Number(value?.line) || 0)),
  };
}

function deduplicateFindings(findings) {
  const seen = new Set();
  return findings
    .map(normalizeContentFinding)
    .filter((finding) => {
      const key = `${finding.path}:${finding.rule}:${finding.line}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((left, right) => `${left.path}:${left.rule}:${left.line}`.localeCompare(`${right.path}:${right.rule}:${right.line}`));
}

export function parsePorcelainStatus(source) {
  const records = String(source ?? "").split("\0");
  const entries = [];
  for (let index = 0; index < records.length; index += 1) {
    const record = records[index];
    if (!record) continue;
    const status = record.slice(0, 2);
    const path = record.slice(3);
    if (!path) continue;
    const entry = { status, path };
    if (status.includes("R") || status.includes("C")) {
      entry.originalPath = records[index + 1] || "";
      index += 1;
    }
    entries.push(entry);
  }
  return entries;
}

export function formatGitBaselineScopeReport(report) {
  const lines = [
    "# Git 基线范围审计",
    "",
    `- 范围状态：${report.scopeSafe ? "已完整归类" : "阻塞"}`,
    `- 正式发布就绪：${report.releaseReady ? "是" : "否"}`,
    `- 当前改动文件：${report.summary.changedFileCount}`,
    `- 已暂存 / 未暂存 / 未跟踪：${report.summary.stagedCount} / ${report.summary.unstagedCount} / ${report.summary.untrackedCount}`,
    `- 受控远端：${report.summary.remoteCount > 0 ? "已配置" : "未配置"}`,
    "",
    "## 所有权分组",
    ...report.groups.map((group) => `- ${group.label}：${group.count}`),
    "",
    `阻塞项：${report.blockers.length ? report.blockers.join("、") : "无"}`,
    "",
    "## 建议分批复核",
    `- 可开始只读分批复核：${report.stagingReview?.readyToStartReview ? "是" : "否"}`,
    `- 分批复核阻塞：${report.stagingReview?.blockers?.length ? report.stagingReview.blockers.join("、") : "无"}`,
    ...(report.stagingReview?.batches ?? []).map(
      (batch) => `- ${batch.order}. ${batch.label}：${batch.count}个文件；最低检查：${batch.checks.join("、")}`,
    ),
    "",
  ];
  return `${lines.join("\n")}\n`;
}

function buildStagingReview({ groups, scopeSafe, stagedCount }) {
  const groupByKey = new Map(groups.map((group) => [group.key, group]));
  const blockers = [
    ...(scopeSafe ? [] : ["scope_audit_not_safe"]),
    ...(stagedCount > 0 ? ["staged_changes_require_manual_review"] : []),
  ];
  return {
    readOnly: true,
    readyToStartReview: blockers.length === 0,
    blockers,
    batches: STAGING_REVIEW_BATCHES.map((definition, index) => {
      const group = groupByKey.get(definition.key);
      return {
        order: index + 1,
        key: definition.key,
        label: definition.label,
        count: group?.count ?? 0,
        checks: definition.checks,
      };
    }).filter((batch) => batch.count > 0),
  };
}

export function writeGitBaselineScopeReport(report, { outputPath = DEFAULT_OUTPUT_PATH } = {}) {
  const resolvedPath = resolve(outputPath);
  mkdirSync(dirname(resolvedPath), { recursive: true });
  writeFileSync(resolvedPath, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 });
  return resolvedPath;
}

function parseArgs(args) {
  const options = {
    rootDir: process.cwd(),
    outputPath: DEFAULT_OUTPUT_PATH,
    write: false,
    json: false,
  };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--root-dir") {
      options.rootDir = readValue(args, index, arg);
      index += 1;
    } else if (arg === "--output") {
      options.outputPath = readValue(args, index, arg);
      index += 1;
    } else if (arg === "--write") {
      options.write = true;
    } else if (arg === "--json") {
      options.json = true;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return options;
}

function readValue(args, index, name) {
  const value = args[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${name} requires a value`);
  return value;
}

function runGit(rootDir, args, { trim = false } = {}) {
  const output = execFileSync("git", args, { cwd: rootDir, encoding: "utf8" });
  return trim ? output.trim() : output;
}

function normalizeEntry(entry) {
  return {
    status: String(entry?.status ?? "").padEnd(2, " ").slice(0, 2),
    path: cleanRelativePath(entry?.path),
    ...(entry?.originalPath ? { originalPath: cleanRelativePath(entry.originalPath) } : {}),
  };
}

function cleanRelativePath(value) {
  return String(value ?? "").replaceAll("\\", "/").replace(/^\.\//, "").trim();
}

function cleanText(value) {
  return String(value ?? "").trim();
}

function isStaged(status) {
  return status !== "??" && status[0] !== " ";
}

function isUnstaged(status) {
  return status === "??" || status[1] !== " ";
}

function findDuplicates(values) {
  const seen = new Set();
  const duplicates = new Set();
  for (const value of values) {
    if (seen.has(value)) duplicates.add(value);
    seen.add(value);
  }
  return [...duplicates].sort();
}

function isCliEntrypoint() {
  return process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
}
