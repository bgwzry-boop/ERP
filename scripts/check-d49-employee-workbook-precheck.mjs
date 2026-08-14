import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { buildMasterDataImportTemplateWorkbook, getMasterDataImportWorksheetSpecs } from "../src/domain/masterDataImportTemplate.js";
import { buildXlsxWorkbookFromWorksheets, cell } from "../src/domain/xlsxWorkbook.js";

const root = join(process.cwd(), ".erp-local-storage", "checks", "d49-employee-workbook-precheck");
const runner = join(process.cwd(), "scripts", "run-d49-employee-workbook-precheck.mjs");
rmSync(root, { recursive: true, force: true });
mkdirSync(root, { recursive: true });

const validPath = join(root, "private-valid.xlsx");
const emptyPath = join(root, "private-empty.xlsx");
const allTemplatePath = join(root, "private-all.xlsx");
const duplicatePath = join(root, "private-duplicate.xlsx");
const incompletePayrollPath = join(root, "private-payroll-incomplete.xlsx");
writeFileSync(validPath, buildMasterDataImportTemplateWorkbook({ templateKey: "workshop", includeFixtureRows: true }));
writeFileSync(emptyPath, buildMasterDataImportTemplateWorkbook({ templateKey: "workshop" }));
writeFileSync(allTemplatePath, buildMasterDataImportTemplateWorkbook({ templateKey: "all", includeFixtureRows: true }));
writeFileSync(duplicatePath, buildDuplicateEmployeeWorkbook());
writeFileSync(incompletePayrollPath, buildIncompletePayrollEmployeeWorkbook());

const validRun = await runNode([runner, "--file", validPath, "--output-dir", join(root, "valid-report"), "--json"]);
assert.equal(validRun.status, 0, validRun.stderr || validRun.stdout);
const validResult = JSON.parse(validRun.stdout);
assert.equal(validResult.scope, "v1_d49_employee_workbook_precheck");
assert.equal(validResult.version, "v1-d49-employee-workbook-precheck-v2");
assert.equal(validResult.status, "review_required");
assert.equal(validResult.uploadAllowed, true);
assert.equal(validResult.summary.employeeRowCount, 1);
assert.equal(validResult.summary.coverageLabel, "1/8");
assert.equal(validResult.payrollAttendanceReadiness.required, false);
assert.equal(validResult.payrollAttendanceReadiness.ready, true);
assert.equal(validResult.payrollAttendanceReadiness.employeeCount, 1);
assert.equal(validResult.safeguards.readOnly, true);
assert.equal(validResult.safeguards.formalDataWritten, false);
assert.equal(validResult.safeguards.stagedRowsIncluded, false);
assert.equal(validResult.safeguards.workbookDigestIncluded, false);
assert.equal(validResult.sourceEvidence.workbookDigestIncluded, false);
assert.equal("workbookDigest" in validResult.sourceEvidence, false);
assertNoPrivateData(validRun.stdout);
const storedValidReportSource = readFileSync(join(root, "valid-report", "latest.json"), "utf8");
const storedValidReport = JSON.parse(storedValidReportSource);
assert.equal(statSync(join(root, "valid-report")).mode & 0o777, 0o700);
assert.equal(statSync(join(root, "valid-report", "latest.json")).mode & 0o777, 0o600);
assert.equal(statSync(join(root, "valid-report", "latest.zh-CN.md")).mode & 0o777, 0o600);
assert.match(storedValidReport.sourceEvidence.workbookDigest, /^[a-f0-9]{64}$/);
assert.equal(storedValidReport.sourceEvidence.workbookByteLength, readFileSync(validPath).length);
assert.equal(storedValidReport.safeguards.workbookDigestIncluded, true);
assert.equal(validRun.stdout.includes(storedValidReport.sourceEvidence.workbookDigest), false);
assertNoPrivateData(storedValidReportSource);
assertNoPrivateData(readFileSync(join(root, "valid-report", "latest.zh-CN.md"), "utf8"));

const payrollRequiredRun = await runNode([
  runner,
  "--file",
  incompletePayrollPath,
  "--output-dir",
  join(root, "payroll-required-report"),
  "--require-payroll-attendance-fields",
  "--json",
]);
assert.equal(payrollRequiredRun.status, 0, payrollRequiredRun.stderr || payrollRequiredRun.stdout);
const payrollRequiredResult = JSON.parse(payrollRequiredRun.stdout);
assert.equal(payrollRequiredResult.status, "review_required");
assert.equal(payrollRequiredResult.uploadAllowed, true);
assert.equal(payrollRequiredResult.ready, false);
assert.equal(payrollRequiredResult.payrollAttendanceReadiness.required, true);
assert.equal(payrollRequiredResult.payrollAttendanceReadiness.completeCount, 0);
assert.equal(payrollRequiredResult.payrollAttendanceReadiness.incompleteCount, 1);
assert.equal(payrollRequiredResult.payrollAttendanceReadiness.coverageLabel, "0/1");
assert.match(readFileSync(join(root, "payroll-required-report", "latest.zh-CN.md"), "utf8"), /工资与考勤资料完整度/);
assertNoPrivateData(payrollRequiredRun.stdout);

const emptyRun = await runNode([
  runner,
  "--file",
  emptyPath,
  "--output-dir",
  join(root, "empty-report"),
  "--allow-blocked-exit-zero",
  "--json",
]);
assert.equal(emptyRun.status, 0, emptyRun.stderr || emptyRun.stdout);
const emptyResult = JSON.parse(emptyRun.stdout);
assert.equal(emptyResult.status, "blocked");
assert.equal(emptyResult.uploadAllowed, false);
assert.ok(emptyResult.issues.some((issue) => issue.message.includes("没有可导入数据")));

const allTemplateRun = await runNode([
  runner,
  "--file",
  allTemplatePath,
  "--output-dir",
  join(root, "all-report"),
  "--allow-blocked-exit-zero",
  "--json",
]);
assert.equal(allTemplateRun.status, 0, allTemplateRun.stderr || allTemplateRun.stdout);
const allTemplateResult = JSON.parse(allTemplateRun.stdout);
assert.equal(allTemplateResult.status, "blocked");
assert.equal(allTemplateResult.summary.dedicatedWorkbook, false);
assert.ok(allTemplateResult.issues.some((issue) => issue.field === "模板范围"));

const duplicateRun = await runNode([
  runner,
  "--file",
  duplicatePath,
  "--output-dir",
  join(root, "duplicate-report"),
  "--allow-blocked-exit-zero",
  "--json",
]);
assert.equal(duplicateRun.status, 0, duplicateRun.stderr || duplicateRun.stdout);
const duplicateResult = JSON.parse(duplicateRun.stdout);
assert.equal(duplicateResult.status, "blocked");
assert.ok(duplicateResult.issues.some((issue) => issue.message.includes("报告不显示编号原值")));
assertNoPrivateData(duplicateRun.stdout);

const missingRun = await runNode([runner, "--file", join(root, "missing.xlsx"), "--json"]);
assert.equal(missingRun.status, 1);
const missingResult = JSON.parse(missingRun.stdout);
assert.equal(missingResult.error.code, "employee_workbook_unreadable");
assert.doesNotMatch(missingRun.stdout, /missing\.xlsx|d49-employee-workbook-precheck/);

console.log("D49 employee workbook precheck passed: dedicated scope, redaction, source fingerprint evidence, role coverage, blocked inputs, and report files are covered.");

function buildDuplicateEmployeeWorkbook() {
  const spec = getMasterDataImportWorksheetSpecs().find((item) => item.key === "employees_machines");
  const first = Object.fromEntries(spec.columns.map((column) => [column, ""]));
  Object.assign(first, { 员工编号: "PRIVATE-EMP-001", 员工姓名: "隐私姓名甲", 角色: "办公室", 启用状态: "启用" });
  const second = { ...first, 员工编号: "private-emp-001", 员工姓名: "隐私姓名乙" };
  return buildXlsxWorkbookFromWorksheets({
    title: "D49 fixture",
    worksheets: [{
      name: "员工机台",
      rows: [
        spec.columns.map((column) => cell(column)),
        spec.columns.map((column) => cell(spec.requiredFields.includes(column) ? "必填" : spec.conditionalRequiredFields.includes(column) ? "车间岗必填" : spec.deferredFields.includes(column) ? "可后补" : "可选")),
        spec.columns.map((column) => cell(first[column])),
        spec.columns.map((column) => cell(second[column])),
      ],
    }],
  });
}

function buildIncompletePayrollEmployeeWorkbook() {
  const spec = getMasterDataImportWorksheetSpecs().find((item) => item.key === "employees_machines");
  const row = Object.fromEntries(spec.columns.map((column) => [column, ""]));
  Object.assign(row, { 员工编号: "PRIVATE-EMP-INCOMPLETE", 员工姓名: "隐私姓名未完成", 角色: "办公室", 启用状态: "启用" });
  return buildXlsxWorkbookFromWorksheets({
    title: "D49 incomplete payroll fixture",
    worksheets: [{
      name: "员工机台",
      rows: [
        spec.columns.map((column) => cell(column)),
        spec.columns.map((column) => cell(spec.requiredFields.includes(column) ? "必填" : spec.conditionalRequiredFields.includes(column) ? "车间岗必填" : spec.deferredFields.includes(column) ? "可后补" : "可选")),
        spec.columns.map((column) => cell(row[column])),
      ],
    }],
  });
}

function assertNoPrivateData(output) {
  for (const privateValue of ["王师傅", "EMP-IMPORT-001", "隐私姓名甲", "隐私姓名乙", "隐私姓名未完成", "PRIVATE-EMP-001", "private-emp-001", "PRIVATE-EMP-INCOMPLETE", "private-valid.xlsx", "private-payroll-incomplete.xlsx", root]) {
    assert.equal(output.includes(privateValue), false, `report leaked private value: ${privateValue}`);
  }
}

function runNode(args) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, args, { cwd: process.cwd(), env: process.env });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += String(chunk); });
    child.stderr.on("data", (chunk) => { stderr += String(chunk); });
    child.on("close", (status) => resolve({ status, stdout, stderr }));
  });
}
