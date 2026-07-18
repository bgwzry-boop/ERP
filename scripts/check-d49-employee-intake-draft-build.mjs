import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { chmodSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { precheckMasterDataImportWorkbook } from "../src/domain/masterDataImportPrecheck.js";

const root = join(process.cwd(), ".erp-local-storage", "checks", "d49-employee-intake-draft-build");
const runner = join(process.cwd(), "scripts", "run-d49-employee-intake-draft-build.mjs");
const draftPath = join(root, "controlled-intake.json");
const workbookPath = join(root, "controlled-intake.xlsx");
const privateValues = ["受控姓名甲", "受控姓名乙", "PRIVATE-001", "controlled-intake.json", root];

rmSync(root, { recursive: true, force: true });
mkdirSync(root, { recursive: true, mode: 0o700 });
writeFileSync(draftPath, `${JSON.stringify(buildDraft(), null, 2)}\n`, { mode: 0o600 });
chmodSync(draftPath, 0o600);

const confirmationBlocked = await runNode([
  runner,
  "--draft-json",
  draftPath,
  "--output-file",
  workbookPath,
  "--json",
]);
assert.equal(confirmationBlocked.status, 1);
assert.equal(JSON.parse(confirmationBlocked.stdout).error.code, "confirmation_required");
assertNoPrivateData(confirmationBlocked.stdout);

const unsafeDraftPath = join(root, "unsafe-mode.json");
writeFileSync(unsafeDraftPath, `${JSON.stringify(buildDraft(), null, 2)}\n`, { mode: 0o644 });
chmodSync(unsafeDraftPath, 0o644);
const unsafeModeRun = await runNode([
  runner,
  "--draft-json",
  unsafeDraftPath,
  "--output-file",
  join(root, "unsafe-mode.xlsx"),
  "--confirm-controlled-rebuild",
  "--json",
]);
assert.equal(unsafeModeRun.status, 1);
assert.equal(JSON.parse(unsafeModeRun.stdout).error.code, "draft_file_mode_unsafe");
assertNoPrivateData(unsafeModeRun.stdout);

const resultRun = await runNode([
  runner,
  "--draft-json",
  draftPath,
  "--output-file",
  workbookPath,
  "--confirm-controlled-rebuild",
  "--json",
]);
assert.equal(resultRun.status, 0, resultRun.stderr || resultRun.stdout);
const result = JSON.parse(resultRun.stdout);
assert.equal(result.scope, "v1_d49_employee_intake_draft_build");
assert.equal(result.status, "written");
assert.equal(result.summary.employeeRowCount, 2);
assert.equal(result.summary.coverageLabel, "3/8");
assert.equal(result.summary.missingEmployeeNumberCount, 1);
assert.equal(result.safeguards.outputMode, "0600");
assert.equal(result.safeguards.employeeNamesIncluded, false);
assert.equal(result.safeguards.employeeNumbersIncluded, false);
assert.equal(result.safeguards.workbookPathIncluded, false);
assert.equal(statSync(workbookPath).mode & 0o777, 0o600);
assertNoPrivateData(resultRun.stdout);

const precheck = await precheckMasterDataImportWorkbook({
  bytes: readFileSync(workbookPath),
  checkedAt: "2026-07-14T00:00:00.000Z",
});
assert.equal(precheck.sheets.length, 1);
assert.equal(precheck.sheets[0].key, "employees_machines");
assert.equal(precheck.sheets[0].dataRowCount, 2);
assert.equal(precheck.employeeRoleCoverage.coverageLabel, "3/8");
assert.equal(precheck.issues.filter((item) => item.field === "员工编号").length, 1);

const invalidRolePath = join(root, "invalid-role.json");
writeFileSync(invalidRolePath, `${JSON.stringify(buildDraft({ invalidRole: true }), null, 2)}\n`, { mode: 0o600 });
const invalidRoleRun = await runNode([
  runner,
  "--draft-json",
  invalidRolePath,
  "--output-file",
  join(root, "invalid-role.xlsx"),
  "--confirm-controlled-rebuild",
  "--json",
]);
assert.equal(invalidRoleRun.status, 1);
assert.equal(JSON.parse(invalidRoleRun.stdout).error.code, "employee_role_invalid");
assertNoPrivateData(invalidRoleRun.stdout);

const duplicatePath = join(root, "duplicate.json");
writeFileSync(duplicatePath, `${JSON.stringify(buildDraft({ duplicateNumber: true }), null, 2)}\n`, { mode: 0o600 });
const duplicateRun = await runNode([
  runner,
  "--draft-json",
  duplicatePath,
  "--output-file",
  join(root, "duplicate.xlsx"),
  "--confirm-controlled-rebuild",
  "--json",
]);
assert.equal(duplicateRun.status, 1);
assert.equal(JSON.parse(duplicateRun.stdout).error.code, "employee_number_duplicate");
assertNoPrivateData(duplicateRun.stdout);

console.log("D49 controlled intake draft build passed: explicit confirmation, identity-redacted output, role validation, private file mode, workbook generation, and duplicate-number blocking are covered.");

function buildDraft({ invalidRole = false, duplicateNumber = false } = {}) {
  return {
    scope: "v1_d49_employee_intake_draft",
    status: "needs_required_fields",
    source: "controlled-test-fixture",
    employees: [
      {
        employeeNumber: "PRIVATE-001",
        employeeName: "受控姓名甲",
        role: "办公室",
        additionalRoles: ["财务 / 对账"],
        defaultWorkshop: "",
        defaultMachine: "",
      },
      {
        employeeNumber: duplicateNumber ? "private-001" : "",
        employeeName: "受控姓名乙",
        role: invalidRole ? "未知岗位" : "技术运维",
        defaultWorkshop: "",
        defaultMachine: "",
      },
    ],
  };
}

function assertNoPrivateData(output) {
  for (const privateValue of privateValues) {
    assert.equal(output.includes(privateValue), false, `command output leaked ${privateValue}`);
  }
  assert.doesNotMatch(output, /[a-f0-9]{64}/i);
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
