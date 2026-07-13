#!/usr/bin/env node

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { precheckMasterDataImportWorkbook } from "../src/domain/masterDataImportPrecheck.js";

const defaultOutputDir = join(".erp-local-storage", "v1-d49-employee-workbook-precheck");

try {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    process.stdout.write(formatHelp());
  } else {
    if (!options.file) throw new Error("missing_file");
    const inputPath = resolve(options.file);
    if (!existsSync(inputPath)) throw new Error("missing_file");
    const precheck = await precheckMasterDataImportWorkbook({
      bytes: readFileSync(inputPath),
      checkedAt: new Date().toISOString(),
    });
    const report = buildD49EmployeeWorkbookPrecheck(precheck);
    const files = writeReport(report, resolve(options.outputDir || defaultOutputDir));
    const result = { ...report, files };
    process.stdout.write(options.json ? `${JSON.stringify(result, null, 2)}\n` : formatCommandResult(result));
    if (!report.uploadAllowed && !options.allowBlockedExitZero) process.exitCode = 2;
  }
} catch {
  const result = {
    scope: "v1_d49_employee_workbook_precheck",
    status: "error",
    ready: false,
    uploadAllowed: false,
    error: {
      code: "employee_workbook_unreadable",
      message: "无法读取或解析员工机台工作簿；请确认文件存在，并使用系统生成的D49专用XLSX重新填写。",
    },
    safeguards: buildSafeguards(),
  };
  if (process.argv.includes("--json")) process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  else process.stderr.write(`D49 employee workbook precheck failed: ${result.error.message}\n`);
  process.exitCode = 1;
}

export function buildD49EmployeeWorkbookPrecheck(precheck = {}) {
  const employeeSheets = (precheck.sheets ?? []).filter((sheet) => sheet.key === "employees_machines");
  const dedicatedWorkbook = precheck.sheets?.length === 1 && employeeSheets.length === 1;
  const domainIssues = Array.isArray(precheck.issues) ? precheck.issues : [];
  const projectedIssues = domainIssues.map(projectIssue);
  if (!dedicatedWorkbook) {
    projectedIssues.unshift({
      severity: "error",
      sheet: "员工机台",
      row: 0,
      field: "模板范围",
      message: "当前文件不是D49专用员工机台工作簿；请使用交接包内的专用模板，避免混入其他主数据。",
    });
  }
  const errorCount = projectedIssues.filter((issue) => issue.severity === "error").length;
  const warningCount = projectedIssues.filter((issue) => issue.severity === "warning").length;
  const coverage = projectCoverage(precheck.employeeRoleCoverage);
  const uploadAllowed = dedicatedWorkbook && precheck.summary?.importAllowed === true;
  const ready = uploadAllowed && coverage.complete && warningCount === 0;
  const status = uploadAllowed ? (ready ? "passed" : "review_required") : "blocked";
  return {
    scope: "v1_d49_employee_workbook_precheck",
    version: "v1-d49-employee-workbook-precheck-v1",
    status,
    ready,
    uploadAllowed,
    checkedAt: String(precheck.checkedAt || new Date().toISOString()),
    summary: {
      label: uploadAllowed
        ? coverage.complete
          ? "员工机台工作簿可上传，8类岗位已覆盖"
          : `员工机台工作簿可上传，岗位覆盖 ${coverage.coverageLabel}`
        : `员工机台工作簿被阻断：${errorCount}项错误`,
      employeeRowCount: Number(coverage.employeeRowCount || 0),
      coveredRoleCount: coverage.coveredRoleCount,
      requiredRoleCount: coverage.requiredRoleCount,
      coverageLabel: coverage.coverageLabel,
      errorCount,
      warningCount,
      issueCount: projectedIssues.length,
      dedicatedWorkbook,
    },
    roleCoverage: coverage,
    sheets: (precheck.sheets ?? []).map((sheet) => ({
      key: String(sheet.key || ""),
      label: String(sheet.label || sheet.worksheetName || ""),
      present: sheet.present === true,
      status: String(sheet.status || ""),
      dataRowCount: Number(sheet.dataRowCount || 0),
    })),
    issues: projectedIssues,
    nextActions: uploadAllowed
      ? [
          coverage.complete
            ? "在基础资料的员工机台入口上传同一工作簿并再次执行服务端预检查。"
            : `可分批上传；正式上线前仍需补齐：${coverage.missingRoleLabels.join("、") || "其余岗位"}。`,
          "正式导入后继续完成管理员复核、账号启用、临时密码发放和员工首次改密。",
          "只有D49岗位矩阵达到8/8且账号未锁定、未过期，车间岗已绑定默认机台，才算身份侧就绪。",
        ]
      : [
          "按issues中的行号和字段修正工作簿后重新运行本预检查。",
          "不要用全量主数据模板代替D49专用员工机台模板。",
        ],
    safeguards: buildSafeguards(),
  };
}

function projectCoverage(value = {}) {
  const roles = Array.isArray(value.roles)
    ? value.roles.map((role) => ({
        roleKey: String(role.roleKey || ""),
        roleLabel: String(role.roleLabel || ""),
        covered: role.covered === true,
        rowCount: Number(role.rowCount || 0),
      }))
    : [];
  const requiredRoleCount = Number(value.requiredRoleCount || roles.length || 8);
  const coveredRoleCount = Number(value.coveredRoleCount || roles.filter((role) => role.covered).length);
  return {
    complete: value.complete === true,
    employeeRowCount: Number(value.employeeRowCount || 0),
    requiredRoleCount,
    coveredRoleCount,
    missingRoleCount: Math.max(0, requiredRoleCount - coveredRoleCount),
    coverageLabel: `${coveredRoleCount}/${requiredRoleCount}`,
    missingRoleLabels: roles.filter((role) => !role.covered).map((role) => role.roleLabel),
    roles,
  };
}

function projectIssue(issue = {}) {
  return {
    severity: String(issue.severity || "error"),
    sheet: String(issue.sheet || ""),
    row: Number(issue.row || 0),
    field: String(issue.field || ""),
    message: sanitizeIssueMessage(issue),
  };
}

function sanitizeIssueMessage(issue = {}) {
  const message = String(issue.message || "预检查发现问题，请按行号和字段复核。");
  if (String(issue.field || "") === "员工编号" && message.includes("重复")) {
    return "员工编号重复，请检查同一编号是否重复填写；报告不显示编号原值。";
  }
  return message;
}

function buildSafeguards() {
  return {
    readOnly: true,
    formalDataWritten: false,
    employeeNamesIncluded: false,
    employeeNumbersIncluded: false,
    workbookPathIncluded: false,
    stagedRowsIncluded: false,
    passwordsIncluded: false,
    seedAccountsCountedAsReady: false,
    uploadStillRequiresServerPrecheck: true,
  };
}

function writeReport(report, outputDir) {
  mkdirSync(outputDir, { recursive: true });
  const jsonPath = join(outputDir, "latest.json");
  const markdownPath = join(outputDir, "latest.zh-CN.md");
  writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`);
  writeFileSync(markdownPath, formatMarkdown(report));
  return {
    latestJson: displayOutputPath(jsonPath),
    latestMarkdown: displayOutputPath(markdownPath),
  };
}

function formatMarkdown(report) {
  const lines = [
    "# D49 员工机台工作簿预检查",
    "",
    `- 状态：${report.status}`,
    `- 是否允许上传：${report.uploadAllowed ? "是" : "否"}`,
    `- 员工行数：${report.summary.employeeRowCount}`,
    `- 岗位覆盖：${report.summary.coverageLabel}`,
    `- 问题：错误 ${report.summary.errorCount}，提醒 ${report.summary.warningCount}`,
    "- 本报告不包含员工姓名、员工编号原值、密码、工作簿路径或可导入数据行。",
    "",
    "## 岗位覆盖",
    "",
    "| 岗位 | 覆盖 | 行数 |",
    "| --- | --- | ---: |",
    ...report.roleCoverage.roles.map((role) => `| ${escapeMarkdown(role.roleLabel)} | ${role.covered ? "已覆盖" : "缺少"} | ${role.rowCount} |`),
    "",
    "## 问题",
    "",
    ...(report.issues.length
      ? [
          "| 级别 | Sheet | 行 | 字段 | 说明 |",
          "| --- | --- | ---: | --- | --- |",
          ...report.issues.map((issue) => `| ${escapeMarkdown(issue.severity)} | ${escapeMarkdown(issue.sheet)} | ${issue.row || "-"} | ${escapeMarkdown(issue.field)} | ${escapeMarkdown(issue.message)} |`),
        ]
      : ["- 未发现阻断或提醒。"]),
    "",
    "## 下一步",
    "",
    ...report.nextActions.map((action) => `- ${action}`),
    "",
  ];
  return `${lines.join("\n")}\n`;
}

function formatCommandResult(result) {
  return [
    `D49 employee workbook precheck: ${result.status}`,
    result.summary.label,
    `Upload allowed: ${result.uploadAllowed ? "yes" : "no"}`,
    `Report: ${result.files.latestMarkdown}`,
    "",
  ].join("\n");
}

function parseArgs(args) {
  const options = {};
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--help" || arg === "-h") options.help = true;
    else if (arg === "--json") options.json = true;
    else if (arg === "--allow-blocked-exit-zero") options.allowBlockedExitZero = true;
    else if (arg === "--file") options.file = readArgValue(args, ++index, "--file");
    else if (arg === "--output-dir") options.outputDir = readArgValue(args, ++index, "--output-dir");
    else throw new Error("unknown_argument");
  }
  return options;
}

function readArgValue(args, index, label) {
  const value = String(args[index] || "").trim();
  if (!value || value.startsWith("--")) throw new Error(`missing_${label}`);
  return value;
}

function formatHelp() {
  return [
    "Usage: node scripts/run-d49-employee-workbook-precheck.mjs --file <filled-workbook.xlsx> [options]",
    "",
    "Options:",
    "  --output-dir <dir>          Report directory; defaults to .erp-local-storage/v1-d49-employee-workbook-precheck",
    "  --json                      Print a redacted machine-readable result",
    "  --allow-blocked-exit-zero   Return exit 0 for a blocked workbook so automation can inspect the report",
    "  --help                      Show this help",
    "",
    "The command is read-only and never prints employee names, employee-number values, passwords, workbook paths, or staged rows.",
    "",
  ].join("\n");
}

function displayOutputPath(path) {
  const absolute = resolve(path);
  const cwd = resolve(".");
  return absolute.startsWith(`${cwd}/`) ? absolute.slice(cwd.length + 1) : "[external-output]";
}

function escapeMarkdown(value) {
  return String(value ?? "").replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
}
