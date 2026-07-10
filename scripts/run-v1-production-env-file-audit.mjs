#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";
import { isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const workspaceRoot = process.cwd();
const sensitiveVariablePattern =
  /(DATABASE_URL|PGURL|SECRET|PASSWORD|PASSWD|TOKEN|ACCESS[_-]?KEY|COMMAND|SPOOL|BUCKET|ENDPOINT)/i;

if (isCliEntrypoint()) {
  runCli();
}

export function buildProductionEnvFileAuditReport(options = {}) {
  return buildAuditReport(options);
}

function isCliEntrypoint() {
  return process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
}

function runCli() {
  try {
    const options = parseArgs(process.argv.slice(2));
    const report = buildAuditReport(options);
    if (options.json) {
      process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    } else {
      process.stdout.write(formatReport(report));
    }
    process.exit(report.ready ? 0 : 2);
  } catch (error) {
    const message = error?.message || String(error);
    if (process.argv.includes("--json")) {
      process.stdout.write(`${JSON.stringify({ status: "error", ready: false, error: { message } }, null, 2)}\n`);
    } else {
      process.stderr.write(`V1 production env file audit failed: ${message}\n`);
    }
    process.exit(1);
  }
}

function parseArgs(args) {
  const options = { envFiles: [] };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--json") {
      options.json = true;
      continue;
    }
    if (arg === "--env-file") {
      options.envFiles.push(readValue(args, index, arg));
      index += 1;
      continue;
    }
    if (arg === "--help" || arg === "-h") {
      process.stdout.write(helpText());
      process.exit(0);
    }
    throw new Error(`Unknown argument: ${arg}`);
  }
  if (options.envFiles.length === 0) throw new Error("--env-file is required.");
  return options;
}

function readValue(args, index, name) {
  const value = args[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${name} requires a value.`);
  return value;
}

function helpText() {
  return [
    "Usage: node scripts/run-v1-production-env-file-audit.mjs --env-file <path> [options]",
    "",
    "Options:",
    "  --env-file <path>  Audit a secure, untracked env file. Can be repeated.",
    "  --json             Print machine-readable JSON.",
    "",
    "Exit codes:",
    "  0  Env file handling is safe enough to continue with V1 preflight",
    "  1  Env file / runner error",
    "  2  Env file is readable but unsafe for V1 production handoff",
    "",
    "This audit never prints env values or env file paths; it reports safe file labels, variable names, counts, and statuses only.",
  ].join("\n");
}

function buildAuditReport({ envFiles }) {
  const files = envFiles.map((envFile, index) => auditEnvFile(envFile, index));
  const crossFileDuplicateVariables = findCrossFileDuplicateVariables(files);
  const findings = [
    ...files.flatMap((file) => file.findings),
    ...(crossFileDuplicateVariables.length > 0
      ? [
          finding({
            key: "cross-file-duplicate-variables",
            label: "跨多个 env 文件重复变量",
            passed: false,
            warningDetail: "多个 env 文件中出现同名变量；后加载的文件会覆盖前面的值，建议确认最终生效值。",
            okDetail: "",
            variables: crossFileDuplicateVariables,
          }),
        ]
      : []),
  ];
  const blockingFindings = findings.filter((finding) => finding.severity === "blocking");
  const warningFindings = findings.filter((finding) => finding.severity === "warning");
  const passedFindings = findings.filter((finding) => finding.severity === "ok");
  return {
    scope: "v1_production_env_file_audit",
    status: blockingFindings.length === 0 ? "passed" : "blocked",
    ready: blockingFindings.length === 0,
    checkedAt: new Date().toISOString(),
    envFileCount: files.length,
    summary: {
      label:
        blockingFindings.length === 0
          ? `${files.length} 个 env 文件安全审计通过`
          : `${blockingFindings.length} 项 env 文件安全风险阻塞 V1 预检`,
      fileCount: files.length,
      blockingCount: blockingFindings.length,
      warningCount: warningFindings.length,
      passedCount: passedFindings.length,
      placeholderAssignmentCount: sum(files, "placeholderAssignmentCount"),
      uncommentedAssignmentCount: sum(files, "uncommentedAssignmentCount"),
      sensitiveVariableNameCount: sum(files, "sensitiveVariableNameCount"),
      crossFileDuplicateVariableCount: crossFileDuplicateVariables.length,
    },
    files,
    blockingFindings,
    warningFindings,
    safeguards: {
      nonMutating: true,
      envValuesExposed: false,
      connectionStringExposed: false,
      secretFieldsExposed: false,
      commandValueExposed: false,
      envFilePathExposed: false,
      commentsCopied: false,
      rawLineContentCopied: false,
    },
    nextActions: buildNextActions({ blockingFindings, warningFindings }),
  };
}

function auditEnvFile(envFile, index) {
  const displayPath = `env 文件 ${index + 1}`;
  const fullPath = resolve(envFile);
  if (!existsSync(fullPath)) throw new Error(`${displayPath} not found.`);
  let stats;
  try {
    stats = statSync(fullPath);
  } catch {
    throw new Error(`${displayPath} could not be inspected.`);
  }
  if (!stats.isFile()) throw new Error(`${displayPath} is not a file.`);
  const relativePath = relative(workspaceRoot, fullPath);
  const insideWorkspace = Boolean(relativePath && !relativePath.startsWith("..") && !isAbsolute(relativePath));
  let content;
  try {
    content = readFileSync(fullPath, "utf8");
  } catch {
    throw new Error(`${displayPath} could not be read.`);
  }
  const parsed = parseEnvAssignments(content);
  const git = inspectGitPath({ relativePath, insideWorkspace });
  const placeholderVariables = unique(
    parsed.assignments.filter((assignment) => hasPlaceholderValue(assignment.value)).map((assignment) => assignment.key),
  );
  const duplicateVariables = duplicatedKeys(parsed.assignments.map((assignment) => assignment.key));
  const sensitiveVariableNames = unique(
    parsed.assignments
      .map((assignment) => assignment.key)
      .filter((name) => sensitiveVariablePattern.test(name)),
  );
  const mode = stats.mode & 0o777;
  const groupOrOtherReadable = Boolean(mode & 0o044);
  const templateLikePath =
    /(^|\/)docs\/development\//.test(fullPath) ||
    /\.env\.example$/i.test(fullPath) ||
    /\.example$/i.test(fullPath);
  const findings = [
    finding({
      key: "env-file-exists",
      label: "env 文件存在且可读取",
      passed: true,
      okDetail: "Env file exists and was parsed without printing raw values.",
      file: displayPath,
    }),
    finding({
      key: "not-template-or-doc",
      label: "未直接使用模板 / 文档文件",
      passed: !templateLikePath,
      blockingDetail: "不要把 docs/development 或 *.env.example 当作真实生产 env 文件。",
      okDetail: "Env file path is not the checked-in template or documentation path.",
      file: displayPath,
    }),
    finding({
      key: "not-git-tracked",
      label: "未被 git 跟踪",
      passed: !git.tracked,
      blockingDetail: "真实生产 env 文件不能被 git 跟踪；请移到安全未跟踪路径后重新审计。",
      okDetail: git.available ? "Git does not track this env file." : "Git status unavailable; file is treated as untracked for this audit.",
      file: displayPath,
    }),
    finding({
      key: "ignored-or-outside-workspace",
      label: "位于 git 忽略路径或工作区外",
      passed: !insideWorkspace || git.ignored,
      blockingDetail: "工作区内的真实 env 文件必须放在 git 忽略路径，避免误提交。",
      okDetail: insideWorkspace ? "Env file is inside a git-ignored path." : "Env file is outside the workspace.",
      file: displayPath,
    }),
    finding({
      key: "no-placeholder-values",
      label: "没有未替换的模板占位值",
      passed: placeholderVariables.length === 0,
      blockingDetail: "仍有变量值是 <REPLACE_WITH_...> 或 <OPTIONAL_...> 占位符；请先替换真实值。",
      okDetail: "No unresolved template placeholders were found in uncommented assignments.",
      file: displayPath,
      variables: placeholderVariables,
    }),
    finding({
      key: "has-uncommented-assignments",
      label: "存在实际 KEY=VALUE 行",
      passed: parsed.assignments.length > 0,
      warningDetail: "没有发现未注释的 KEY=VALUE 行；这通常说明只复制了模板但还没填写真实 env。",
      okDetail: "At least one uncommented env assignment was found.",
      file: displayPath,
    }),
    finding({
      key: "no-duplicate-variables",
      label: "没有重复变量名",
      passed: duplicateVariables.length === 0,
      warningDetail: "发现重复变量名；后面的值会覆盖前面的值，建议清理后再预检。",
      okDetail: "No duplicate variable names were found.",
      file: displayPath,
      variables: duplicateVariables,
    }),
    finding({
      key: "file-permission-review",
      label: "文件权限已收窄",
      passed: !groupOrOtherReadable,
      warningDetail: "文件对 group / other 可读；生产环境建议 chmod 600。",
      okDetail: "File is not group/other-readable.",
      file: displayPath,
    }),
  ];
  if (parsed.invalidLineCount > 0) {
    findings.push(
      finding({
        key: "invalid-lines",
        label: "存在未解析行",
        passed: false,
        warningDetail: "有非注释行不是有效 KEY=VALUE；脚本不会输出原文，请人工复核。",
        okDetail: "",
        file: displayPath,
      }),
    );
  }
  return {
    path: displayPath,
    pathRedacted: true,
    sourceIndex: index + 1,
    insideWorkspace,
    git,
    fileMode: mode.toString(8).padStart(3, "0"),
    uncommentedAssignmentCount: parsed.assignments.length,
    placeholderAssignmentCount: placeholderVariables.length,
    duplicateVariableCount: duplicateVariables.length,
    sensitiveVariableNameCount: sensitiveVariableNames.length,
    variableNames: unique(parsed.assignments.map((assignment) => assignment.key)).sort(),
    placeholderVariables: placeholderVariables.sort(),
    duplicateVariables: duplicateVariables.sort(),
    findings,
  };
}

function parseEnvAssignments(content) {
  const assignments = [];
  let invalidLineCount = 0;
  const lines = String(content ?? "").split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index].trim();
    if (!line || line.startsWith("#")) continue;
    const normalized = line.startsWith("export ") ? line.slice("export ".length).trim() : line;
    const equalsIndex = normalized.indexOf("=");
    if (equalsIndex <= 0) {
      invalidLineCount += 1;
      continue;
    }
    const key = normalized.slice(0, equalsIndex).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) {
      invalidLineCount += 1;
      continue;
    }
    assignments.push({
      key,
      value: unquoteEnvValue(normalized.slice(equalsIndex + 1).trim()),
      lineNumber: index + 1,
    });
  }
  return { assignments, invalidLineCount };
}

function unquoteEnvValue(value) {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }
  const hashIndex = value.search(/\s#/);
  return hashIndex >= 0 ? value.slice(0, hashIndex).trim() : value;
}

function inspectGitPath({ relativePath, insideWorkspace }) {
  if (!insideWorkspace) {
    return { available: true, tracked: false, ignored: false, outsideWorkspace: true };
  }
  const trackedRun = spawnSync("git", ["ls-files", "--error-unmatch", "--", relativePath], {
    cwd: workspaceRoot,
    encoding: "utf8",
    stdio: ["ignore", "ignore", "ignore"],
  });
  const ignoreRun = spawnSync("git", ["check-ignore", "--quiet", "--", relativePath], {
    cwd: workspaceRoot,
    encoding: "utf8",
    stdio: ["ignore", "ignore", "ignore"],
  });
  const available = trackedRun.error ? false : true;
  return {
    available,
    tracked: available && trackedRun.status === 0,
    ignored: available && ignoreRun.status === 0,
    outsideWorkspace: false,
  };
}

function finding({ key, label, passed, blockingDetail, warningDetail, okDetail, file, variables = [] }) {
  const severity = passed ? "ok" : warningDetail ? "warning" : "blocking";
  return {
    key,
    label,
    status: passed ? "passed" : severity === "warning" ? "warning" : "blocked",
    severity,
    file,
    detail: passed ? okDetail : warningDetail || blockingDetail,
    variables: variables.slice().sort(),
    nextAction: passed ? "" : nextActionForFinding(key),
  };
}

function nextActionForFinding(key) {
  const actions = {
    "not-template-or-doc": "复制模板到安全未跟踪 env 文件，真实值只填在该文件。",
    "not-git-tracked": "从 git 跟踪中移除真实 env 文件，并确认不会进入提交。",
    "ignored-or-outside-workspace": "把文件移到 .erp-local-storage/、工作区外，或新增明确 gitignore 规则。",
    "no-placeholder-values": "替换所有模板占位值后，再运行 env 文件审计和生产预检。",
    "has-uncommented-assignments": "取消注释并填写真实 KEY=VALUE 行，但不要提交该文件。",
    "no-duplicate-variables": "合并重复变量，只保留一处最终值。",
    "cross-file-duplicate-variables": "确认多文件加载顺序，合并重复变量或记录最终覆盖规则。",
    "file-permission-review": "在生产机器上执行 chmod 600 <secure-env-file>。",
    "invalid-lines": "删除或修正未解析行，避免预检漏读变量。",
  };
  return actions[key] || "修正后重新运行 env 文件安全审计。";
}

function hasPlaceholderValue(value) {
  const normalized = String(value ?? "").trim();
  return /<\s*(REPLACE_WITH|OPTIONAL)_/i.test(normalized) || /REPLACE_WITH_/i.test(normalized);
}

function duplicatedKeys(keys) {
  const seen = new Set();
  const duplicates = new Set();
  for (const key of keys) {
    if (seen.has(key)) duplicates.add(key);
    seen.add(key);
  }
  return [...duplicates];
}

function findCrossFileDuplicateVariables(files) {
  const seen = new Map();
  const duplicates = new Set();
  for (const file of files) {
    const variableNames = Array.isArray(file.variableNames) ? file.variableNames : [];
    for (const variableName of variableNames) {
      if (seen.has(variableName)) duplicates.add(variableName);
      seen.set(variableName, true);
    }
  }
  return [...duplicates].sort();
}

function unique(values) {
  return [...new Set(values.filter((value) => String(value || "").trim()))];
}

function sum(items, key) {
  return items.reduce((total, item) => total + Number(item[key] || 0), 0);
}

function buildNextActions({ blockingFindings, warningFindings }) {
  if (blockingFindings.length > 0) {
    return blockingFindings.slice(0, 8).map((finding) => `${finding.label}：${finding.nextAction}`);
  }
  const actions = [
    "继续运行 node scripts/run-v1-production-env-preflight.mjs --use-production-env-setup-env-file；只有绕开 production env setup 报告时才显式传入 --env-file <secure-env-file>。",
  ];
  if (warningFindings.length > 0) {
    actions.unshift("处理 warning 项，尤其是 chmod 600、重复变量和无效行。");
  }
  return actions;
}

function formatReport(report) {
  const lines = [
    `V1 production env file audit: ${report.ready ? "PASSED" : "BLOCKED"}`,
    `Summary: ${report.summary.label}`,
    "",
    "Files:",
  ];
  for (const file of report.files) {
    lines.push(
      `- ${file.path}: ${file.uncommentedAssignmentCount} assignments, ${file.placeholderAssignmentCount} placeholders, mode ${file.fileMode}`,
    );
  }
  const visibleFindings = [...report.blockingFindings, ...report.warningFindings];
  if (visibleFindings.length > 0) {
    lines.push("", "Findings:");
    for (const finding of visibleFindings) {
      const variables = finding.variables.length > 0 ? ` (${finding.variables.join(", ")})` : "";
      lines.push(`- [${finding.status}] ${finding.label}${variables}: ${finding.detail}`);
    }
  }
  lines.push("", "Next actions:");
  for (const action of report.nextActions) lines.push(`- ${action}`);
  lines.push("", "Safeguards: env values, env file paths, comments, raw lines, command paths, and secrets are not printed.");
  return `${lines.join("\n")}\n`;
}
