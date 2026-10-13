#!/usr/bin/env node

import { createHash } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { precheckMasterDataImportWorkbook } from "../src/domain/masterDataImportPrecheck.js";
import { findPayrollPosition, suggestPayrollPosition } from "../shared/payrollPositionCatalog.js";

const defaultOutputDir = join(".erp-local-storage", "v1-d49-employee-workbook-precheck");

try {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    process.stdout.write(formatHelp());
  } else {
    if (!options.file) throw new Error("missing_file");
    const inputPath = resolve(options.file);
    if (!existsSync(inputPath)) throw new Error("missing_file");
    const workbookBytes = readFileSync(inputPath);
    const precheck = await precheckMasterDataImportWorkbook({
      bytes: workbookBytes,
      checkedAt: new Date().toISOString(),
    });
    const report = buildD49EmployeeWorkbookPrecheck(precheck, {
      sourceEvidence: buildWorkbookSourceEvidence(workbookBytes),
      requirePayrollAttendanceFields: options.requirePayrollAttendanceFields === true,
    });
    const files = writeReport(report, resolve(options.outputDir || defaultOutputDir));
    const result = { ...projectCommandReport(report), files };
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
    safeguards: buildSafeguards(false),
  };
  if (process.argv.includes("--json")) process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  else process.stderr.write(`D49 employee workbook precheck failed: ${result.error.message}\n`);
  process.exitCode = 1;
}

export function buildD49EmployeeWorkbookPrecheck(precheck = {}, { sourceEvidence, requirePayrollAttendanceFields = false } = {}) {
  const safeSourceEvidence = normalizeSourceEvidence(sourceEvidence);
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
  const payrollAttendanceReadiness = projectPayrollAttendanceReadiness(precheck, {
    required: requirePayrollAttendanceFields === true,
  });
  const payrollPositionMapping = projectPayrollPositionMapping(precheck);
  const uploadAllowed = dedicatedWorkbook && precheck.summary?.importAllowed === true;
  const ready = uploadAllowed && coverage.complete && warningCount === 0 && payrollAttendanceReadiness.ready;
  const status = uploadAllowed ? (ready ? "passed" : "review_required") : "blocked";
  return {
    scope: "v1_d49_employee_workbook_precheck",
    version: "v1-d49-employee-workbook-precheck-v3",
    status,
    ready,
    uploadAllowed,
    checkedAt: String(precheck.checkedAt || new Date().toISOString()),
    summary: {
      label: uploadAllowed
        ? payrollAttendanceReadiness.required && !payrollAttendanceReadiness.complete
          ? `员工机台工作簿可上传；工资/考勤资料仅 ${payrollAttendanceReadiness.coverageLabel} 完整`
          : coverage.complete
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
      payrollAttendanceCompleteCount: payrollAttendanceReadiness.completeCount,
      payrollAttendanceEmployeeCount: payrollAttendanceReadiness.employeeCount,
      payrollAttendanceCoverageLabel: payrollAttendanceReadiness.coverageLabel,
      payrollPositionConfirmedCount: payrollPositionMapping.confirmedCount,
      payrollPositionSuggestedCount: payrollPositionMapping.suggestedCount,
    },
    roleCoverage: coverage,
    payrollAttendanceReadiness,
    payrollPositionMapping,
    sheets: (precheck.sheets ?? []).map((sheet) => ({
      key: String(sheet.key || ""),
      label: String(sheet.label || sheet.worksheetName || ""),
      present: sheet.present === true,
      status: String(sheet.status || ""),
      dataRowCount: Number(sheet.dataRowCount || 0),
    })),
    issues: projectedIssues,
    sourceEvidence: safeSourceEvidence,
    nextActions: uploadAllowed
      ? [
          coverage.complete
            ? "在基础资料的员工机台入口上传同一工作簿并再次执行服务端预检查。"
            : `可分批上传；正式上线前仍需补齐：${coverage.missingRoleLabels.join("、") || "其余岗位"}。`,
          "正式导入后继续完成管理员复核、账号启用、临时密码发放和员工首次改密。",
          payrollAttendanceReadiness.complete
            ? "本工作簿中的员工档案、工资岗位和考勤身份映射均已填写；正式导入后仍需服务端再次校验。"
            : `工资/考勤资料仅 ${payrollAttendanceReadiness.coverageLabel} 完整；补齐出生/入职日期、工资岗位键和考勤来源/人员编号后再生成工资。`,
          payrollPositionMapping.suggestedCount
            ? `已有 ${payrollPositionMapping.suggestedCount} 行可按岗位/车间/机台或旧工资字段生成候选；负责人逐行复核后再填写工资岗位键，不按姓名自动确认。`
            : "工资岗位无法确定的行由负责人选择，不按员工姓名或模糊岗位静默匹配。",
          "只有D49岗位矩阵达到8/8且账号未锁定、未过期，车间岗已绑定默认机台，才算身份侧就绪。",
        ]
      : [
          "按issues中的行号和字段修正工作簿后重新运行本预检查。",
          "不要用全量主数据模板代替D49专用员工机台模板。",
        ],
    safeguards: buildSafeguards(Boolean(safeSourceEvidence.workbookDigest)),
  };
}

function projectPayrollAttendanceReadiness(precheck = {}, { required = false } = {}) {
  const formalCoverage = precheck.employeePayrollAttendanceCoverage;
  if (formalCoverage?.available === true) {
    const employeeCount = Number(formalCoverage.employeeCount || 0);
    const completeCount = Number(formalCoverage.completeCount || 0);
    const complete = formalCoverage.complete === true && employeeCount > 0 && completeCount === employeeCount;
    return {
      required,
      ready: required ? complete : true,
      complete,
      employeeCount,
      completeCount,
      incompleteCount: Math.max(0, employeeCount - completeCount),
      profileReadyCount: Number(formalCoverage.profileReadyCount || 0),
      wageReadyCount: Number(formalCoverage.wageReadyCount || 0),
      payrollPositionReadyCount: Number(formalCoverage.payrollPositionReadyCount ?? formalCoverage.wageReadyCount ?? 0),
      attendanceMappingReadyCount: Number(formalCoverage.attendanceMappingReadyCount || 0),
      coverageLabel: `${completeCount}/${employeeCount}`,
    };
  }
  const employeeRows = (precheck.stagedRows ?? [])
    .find((sheet) => sheet.sheetKey === "employees_machines")
    ?.rows ?? [];
  const rowStates = employeeRows.map((row) => {
    const values = row.values ?? {};
    const profileReady = Boolean(cleanText(values["出生日期"]) && cleanText(values["入职日期"]));
    const wageReady = Boolean(findPayrollPosition(values["工资岗位键"]));
    const attendanceReady = Boolean(cleanText(values["考勤来源"]) && cleanText(values["考勤人员编号"]));
    return { profileReady, wageReady, attendanceReady, complete: profileReady && wageReady && attendanceReady };
  });
  const employeeCount = rowStates.length;
  const completeCount = rowStates.filter((row) => row.complete).length;
  const complete = employeeCount > 0 && completeCount === employeeCount;
  return {
    required,
    ready: required ? complete : true,
    complete,
    employeeCount,
    completeCount,
    incompleteCount: Math.max(0, employeeCount - completeCount),
    profileReadyCount: rowStates.filter((row) => row.profileReady).length,
    wageReadyCount: rowStates.filter((row) => row.wageReady).length,
    payrollPositionReadyCount: rowStates.filter((row) => row.wageReady).length,
    attendanceMappingReadyCount: rowStates.filter((row) => row.attendanceReady).length,
    coverageLabel: `${completeCount}/${employeeCount}`,
  };
}

function projectPayrollPositionMapping(precheck = {}) {
  const employeeRows = (precheck.stagedRows ?? [])
    .find((sheet) => sheet.sheetKey === "employees_machines")
    ?.rows ?? [];
  const suggestions = employeeRows.map((row) => {
    const values = row.values ?? {};
    return suggestPayrollPosition({
      payrollPositionKey: values["工资岗位键"],
      roleName: values["角色"],
      defaultWorkshop: values["默认车间"],
      defaultMachine: values["默认机台"],
      baseHourlyWage: values["基础时薪"],
      positionAllowanceHourly: values["岗位补贴/小时"],
    });
  });
  const suggestedByPosition = {};
  for (const suggestion of suggestions.filter((item) => item.status === "suggested")) {
    const key = cleanText(suggestion.payrollPositionKey);
    if (key) suggestedByPosition[key] = (suggestedByPosition[key] ?? 0) + 1;
  }
  return {
    employeeCount: employeeRows.length,
    confirmedCount: suggestions.filter((item) => item.status === "confirmed").length,
    suggestedCount: suggestions.filter((item) => item.status === "suggested").length,
    ambiguousCount: suggestions.filter((item) => item.status === "ambiguous").length,
    unmatchedCount: suggestions.filter((item) => item.status === "unmatched").length,
    suggestedByPosition,
    namesExposed: false,
    automaticPersistenceAllowed: false,
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

function buildSafeguards(workbookDigestIncluded = false) {
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
    workbookDigestIncluded,
  };
}

function buildWorkbookSourceEvidence(bytes) {
  return {
    version: "v1-d49-workbook-source-evidence-v1",
    digestAlgorithm: "sha256",
    workbookDigest: createHash("sha256").update(bytes).digest("hex"),
    workbookByteLength: bytes.length,
  };
}

function normalizeSourceEvidence(value = {}) {
  const workbookDigest = String(value.workbookDigest || "").trim().toLowerCase();
  return {
    version: value.version === "v1-d49-workbook-source-evidence-v1"
      ? value.version
      : "v1-d49-workbook-source-evidence-v1",
    digestAlgorithm: value.digestAlgorithm === "sha256" ? "sha256" : "sha256",
    workbookDigest: /^[a-f0-9]{64}$/.test(workbookDigest) ? workbookDigest : "",
    workbookByteLength: Number.isSafeInteger(value.workbookByteLength) && value.workbookByteLength >= 0
      ? value.workbookByteLength
      : 0,
  };
}

function projectCommandReport(report) {
  return {
    ...report,
    sourceEvidence: {
      version: report.sourceEvidence.version,
      digestAlgorithm: report.sourceEvidence.digestAlgorithm,
      workbookByteLength: report.sourceEvidence.workbookByteLength,
      workbookDigestIncluded: false,
    },
    safeguards: {
      ...report.safeguards,
      workbookDigestIncluded: false,
    },
  };
}

function writeReport(report, outputDir) {
  mkdirSync(outputDir, { recursive: true, mode: 0o700 });
  chmodSync(outputDir, 0o700);
  const jsonPath = join(outputDir, "latest.json");
  const markdownPath = join(outputDir, "latest.zh-CN.md");
  writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 });
  writeFileSync(markdownPath, formatMarkdown(report), { mode: 0o600 });
  chmodSync(jsonPath, 0o600);
  chmodSync(markdownPath, 0o600);
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
    "## 工资与考勤资料完整度",
    "",
    `- 完整：${report.payrollAttendanceReadiness.coverageLabel}`,
    `- 出生/入职日期完整：${report.payrollAttendanceReadiness.profileReadyCount}/${report.payrollAttendanceReadiness.employeeCount}`,
    `- 工资岗位键已确认：${report.payrollAttendanceReadiness.payrollPositionReadyCount}/${report.payrollAttendanceReadiness.employeeCount}`,
    `- 考勤来源/人员编号完整：${report.payrollAttendanceReadiness.attendanceMappingReadyCount}/${report.payrollAttendanceReadiness.employeeCount}`,
    `- 本次检查${report.payrollAttendanceReadiness.required ? "要求" : "不要求"}工资与考勤资料全部完整；不完整时仍可分批导入，但不得生成工资或声称工资就绪。`,
    "",
    "## 工资岗位映射",
    "",
    `- 已确认：${report.payrollPositionMapping.confirmedCount}`,
    `- 可生成待复核候选：${report.payrollPositionMapping.suggestedCount}`,
    `- 多候选：${report.payrollPositionMapping.ambiguousCount}`,
    `- 无法匹配：${report.payrollPositionMapping.unmatchedCount}`,
    "- 候选不按姓名生成，也不会自动写入；负责人逐行复核后才可保存。",
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
    else if (arg === "--require-payroll-attendance-fields") options.requirePayrollAttendanceFields = true;
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
    "  --require-payroll-attendance-fields  Mark readiness incomplete until every employee has profile dates, wage basis, and attendance mapping",
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

function cleanText(value) {
  return String(value ?? "").trim();
}
