import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildV1D49EmployeeIntakeStatus } from "../server/services/v1D49EmployeeIntakeStatusService.mjs";

const checkedAt = "2026-07-14T00:00:00.000Z";
const workbookDigest = "a".repeat(64);
const changedWorkbookDigest = "b".repeat(64);
const roleKeys = [
  "office",
  "warehouse",
  "finance",
  "workshop",
  "packing",
  "driver",
  "management",
  "technical_operations",
];

const blocked = buildV1D49EmployeeIntakeStatus({
  now: () => new Date(checkedAt),
  loadReport: () => buildReport(),
  loadWorkbookEvidence: () => buildWorkbookEvidence(),
});
assert.equal(blocked.available, true);
assert.equal(blocked.fresh, true);
assert.equal(blocked.status, "needs_employee_numbers");
assert.equal(blocked.ready, false);
assert.equal(blocked.uploadAllowed, false);
assert.equal(blocked.summary.employeeRowCount, 19);
assert.equal(blocked.summary.coverageLabel, "6/8");
assert.equal(blocked.summary.missingEmployeeNumberCount, 19);
assert.deepEqual(blocked.missingRoleLabels, ["财务 / 对账", "管理"]);
assert.equal(blocked.roles.length, 8);
assert.match(blocked.nextAction, /补齐 19 个员工编号/);
assert.match(blocked.nextAction, /可暂不填写，但D49会继续保持阻塞/);
assertSafeProjection(blocked);

const ready = buildV1D49EmployeeIntakeStatus({
  now: () => new Date(checkedAt),
  loadReport: () => buildReport({ ready: true, employeeNumberIssueCount: 0, coveredRoleCount: 8 }),
  loadWorkbookEvidence: () => buildWorkbookEvidence(),
});
assert.equal(ready.status, "ready_for_upload");
assert.equal(ready.ready, true);
assert.equal(ready.uploadAllowed, true);
assert.equal(ready.summary.coverageLabel, "8/8");
assert.match(ready.nextAction, /网页端仍会再次执行服务端预检查/);
assertSafeProjection(ready);

const roleCoverageBlocked = buildV1D49EmployeeIntakeStatus({
  now: () => new Date(checkedAt),
  loadReport: () => buildReport({ employeeNumberIssueCount: 0, coveredRoleCount: 6 }),
  loadWorkbookEvidence: () => buildWorkbookEvidence(),
});
assert.equal(roleCoverageBlocked.status, "needs_role_coverage");
assert.match(roleCoverageBlocked.nextAction, /财务 \/ 对账、管理/);

const unsafe = buildV1D49EmployeeIntakeStatus({
  now: () => new Date(checkedAt),
  loadReport: () => ({
    ...buildReport(),
    safeguards: { ...buildReport().safeguards, employeeNamesIncluded: true },
  }),
  loadWorkbookEvidence: () => buildWorkbookEvidence(),
});
assert.equal(unsafe.available, false);
assert.equal(unsafe.status, "unavailable");
assertSafeProjection(unsafe);

const malformed = buildV1D49EmployeeIntakeStatus({
  now: () => new Date(checkedAt),
  loadReport: () => ({ scope: "wrong" }),
});
assert.equal(malformed.available, false);

const changedWorkbook = buildV1D49EmployeeIntakeStatus({
  now: () => new Date(checkedAt),
  loadReport: () => buildReport({ ready: true, employeeNumberIssueCount: 0, coveredRoleCount: 8 }),
  loadWorkbookEvidence: () => buildWorkbookEvidence(changedWorkbookDigest),
});
assert.equal(changedWorkbook.available, true);
assert.equal(changedWorkbook.fresh, false);
assert.equal(changedWorkbook.status, "stale");
assert.equal(changedWorkbook.ready, false);
assert.equal(changedWorkbook.uploadAllowed, false);
assert.equal(changedWorkbook.freshness.status, "workbook_changed");
assert.match(changedWorkbook.nextAction, /重新运行D49专用离线预检查/);
assertSafeProjection(changedWorkbook);

const expired = buildV1D49EmployeeIntakeStatus({
  now: () => new Date(checkedAt),
  loadReport: () => buildReport({ reportCheckedAt: "2026-07-10T00:00:00.000Z" }),
  loadWorkbookEvidence: () => buildWorkbookEvidence(),
});
assert.equal(expired.status, "stale");
assert.equal(expired.freshness.status, "expired");
assert.equal(expired.freshness.ageHours, 96);
assert.equal(expired.summary.employeeRowCount, 19);
assertSafeProjection(expired);

const futureDated = buildV1D49EmployeeIntakeStatus({
  now: () => new Date(checkedAt),
  loadReport: () => buildReport({ reportCheckedAt: "2026-07-14T01:00:00.000Z" }),
  loadWorkbookEvidence: () => buildWorkbookEvidence(),
});
assert.equal(futureDated.status, "stale");
assert.equal(futureDated.freshness.status, "invalid_checked_at");
assertSafeProjection(futureDated);

const loadError = buildV1D49EmployeeIntakeStatus({
  now: () => new Date(checkedAt),
  loadReport: () => { throw new Error("/Users/private/employee.xlsx 郝蒙蒙 E001"); },
});
assert.equal(loadError.available, false);
assertSafeProjection(loadError);

const source = readFileSync(new URL("../server/services/v1D49EmployeeIntakeStatusService.mjs", import.meta.url), "utf8");
assert.match(source, /final-precheck/);
assert.match(source, /employeeNamesIncluded: false/);
assert.match(source, /employeeNumbersIncluded: false/);
assert.match(source, /workbookPathIncluded: false/);
assert.match(source, /issueRowsIncluded: false/);
assert.match(source, /MAX_REPORT_AGE_MS/);
assert.match(source, /createHash\("sha256"\)/);
assert.doesNotMatch(source, /employeeName:\s*report|employeeNumber:\s*report|row:\s*issue/);

console.log(
  "V1 D49 employee intake status checks passed: controlled aggregate loading, workbook fingerprint freshness, 72-hour expiry, eight-role coverage, fail-closed redaction, and server recheck boundary are covered.",
);

function buildReport({
  ready = false,
  employeeNumberIssueCount = 19,
  coveredRoleCount = 6,
  reportCheckedAt = checkedAt,
} = {}) {
  const missingRoleKeys = coveredRoleCount === 8 ? [] : ["finance", "management"];
  const roles = roleKeys.map((roleKey, index) => ({
    roleKey,
    roleLabel: `untrusted-${roleKey}`,
    covered: !missingRoleKeys.includes(roleKey),
    rowCount: missingRoleKeys.includes(roleKey) ? 0 : index === 3 ? 9 : index < 2 ? 3 - index : 1,
    employeeName: "郝蒙蒙",
    employeeNumber: "E001",
  }));
  return {
    scope: "v1_d49_employee_workbook_precheck",
    version: "v1-d49-employee-workbook-precheck-v2",
    status: ready ? "ready" : "blocked",
    ready,
    uploadAllowed: ready,
    checkedAt: reportCheckedAt,
    summary: {
      employeeRowCount: 19,
      coveredRoleCount,
      requiredRoleCount: 8,
      coverageLabel: `${coveredRoleCount}/8`,
      errorCount: employeeNumberIssueCount,
      warningCount: 0,
    },
    roleCoverage: { roles },
    sourceEvidence: {
      version: "v1-d49-workbook-source-evidence-v1",
      digestAlgorithm: "sha256",
      workbookDigest,
      workbookByteLength: 2048,
    },
    issues: Array.from({ length: employeeNumberIssueCount }, (_, index) => ({
      severity: "error",
      sheet: "员工机台",
      row: index + 3,
      field: "员工编号",
      message: "员工编号 不能为空。",
      employeeName: "郝蒙蒙",
      employeeNumber: "E001",
      workbookPath: "/Users/private/employee.xlsx",
    })),
    safeguards: {
      readOnly: true,
      formalDataWritten: false,
      employeeNamesIncluded: false,
      employeeNumbersIncluded: false,
      workbookPathIncluded: false,
      stagedRowsIncluded: false,
      passwordsIncluded: false,
      seedAccountsCountedAsReady: false,
      uploadStillRequiresServerPrecheck: true,
      workbookDigestIncluded: true,
    },
  };
}

function buildWorkbookEvidence(digest = workbookDigest) {
  return {
    workbookDigest: digest,
    workbookByteLength: 2048,
  };
}

function assertSafeProjection(value) {
  const serialized = JSON.stringify(value);
  for (const sensitive of ["郝蒙蒙", "E001", "/Users/private", "employee.xlsx", workbookDigest, changedWorkbookDigest]) {
    assert.equal(serialized.includes(sensitive), false, `projection must not include ${sensitive}`);
  }
  assert.equal(value.safeguards.employeeNamesIncluded, false);
  assert.equal(value.safeguards.employeeNumbersIncluded, false);
  assert.equal(value.safeguards.workbookPathIncluded, false);
  assert.equal(value.safeguards.issueRowsIncluded, false);
  assert.equal(value.safeguards.rawIssuesIncluded, false);
  assert.equal(value.safeguards.formalDataWritten, false);
  assert.equal(value.safeguards.workbookDigestIncluded, false);
}
