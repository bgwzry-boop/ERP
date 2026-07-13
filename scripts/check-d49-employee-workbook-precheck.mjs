import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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
writeFileSync(validPath, buildMasterDataImportTemplateWorkbook({ templateKey: "workshop", includeFixtureRows: true }));
writeFileSync(emptyPath, buildMasterDataImportTemplateWorkbook({ templateKey: "workshop" }));
writeFileSync(allTemplatePath, buildMasterDataImportTemplateWorkbook({ templateKey: "all", includeFixtureRows: true }));
writeFileSync(duplicatePath, buildDuplicateEmployeeWorkbook());

const validRun = await runNode([runner, "--file", validPath, "--output-dir", join(root, "valid-report"), "--json"]);
assert.equal(validRun.status, 0, validRun.stderr || validRun.stdout);
const validResult = JSON.parse(validRun.stdout);
assert.equal(validResult.scope, "v1_d49_employee_workbook_precheck");
assert.equal(validResult.status, "review_required");
assert.equal(validResult.uploadAllowed, true);
assert.equal(validResult.summary.employeeRowCount, 1);
assert.equal(validResult.summary.coverageLabel, "1/8");
assert.equal(validResult.safeguards.readOnly, true);
assert.equal(validResult.safeguards.formalDataWritten, false);
assert.equal(validResult.safeguards.stagedRowsIncluded, false);
assertNoPrivateData(validRun.stdout);
assertNoPrivateData(readFileSync(join(root, "valid-report", "latest.json"), "utf8"));
assertNoPrivateData(readFileSync(join(root, "valid-report", "latest.zh-CN.md"), "utf8"));

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

console.log("D49 employee workbook precheck passed: dedicated scope, redaction, role coverage, blocked inputs, and report files are covered.");

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

function assertNoPrivateData(output) {
  for (const privateValue of ["王师傅", "EMP-IMPORT-001", "隐私姓名甲", "隐私姓名乙", "PRIVATE-EMP-001", "private-emp-001", "private-valid.xlsx", root]) {
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
