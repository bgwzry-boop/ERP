import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildV1D49Readiness } from "../server/services/v1D49ReadinessService.mjs";

const checkedAt = "2026-07-14T00:00:00.000Z";
const operatorId = "U-MANAGER-TEST";
const sensitiveText = "postgres://owner:secret@db.internal/prod https://erp.internal/api /Users/private/secure.env";

const blocked = buildHarness({ employeeReady: false, setupReady: false }).result;
assert.equal(blocked.status, "blocked");
assert.equal(blocked.ready, false);
assert.equal(blocked.summary.employeeRoleLabel, "0/8");
assert.equal(blocked.summary.missingRoleCount, 8);
assert.equal(blocked.summary.employeeIntakeAvailable, true);
assert.equal(blocked.summary.employeeIntakeFresh, true);
assert.equal(blocked.summary.employeeIntakeRowCount, 19);
assert.equal(blocked.summary.employeeIntakeCoverageLabel, "6/8");
assert.equal(blocked.summary.employeeNumberMissingCount, 19);
assert.equal(blocked.employeeIntake.summary.missingEmployeeNumberCount, 19);
assert.match(blocked.nextAction, /补齐 19 个员工编号/);
assert.equal(blocked.summary.blocksRegardlessOfDemoMode, true);
assert.equal(blocked.safeguards.demoModeDoesNotBypassEmployeeReadiness, true);
assert.equal(blocked.safeguards.seedAccountsCountedAsFormal, false);
assert.equal(blocked.blockers.filter((item) => item.category === "employee").length, 8);
assertSensitiveTextAbsent(blocked);

const staleEmployeeIntake = buildHarness({ employeeReady: false, setupReady: true, envReady: true, intakeFresh: false }).result;
assert.equal(staleEmployeeIntake.summary.employeeIntakeAvailable, true);
assert.equal(staleEmployeeIntake.summary.employeeIntakeFresh, false);
assert.equal(staleEmployeeIntake.employeeIntake.status, "stale");
assert.equal(staleEmployeeIntake.employeeIntake.ready, false);
assert.match(staleEmployeeIntake.nextAction, /重新运行D49专用离线预检查/);
assertSensitiveTextAbsent(staleEmployeeIntake);

const employeesBlocked = buildHarness({ employeeReady: false, setupReady: true, envReady: true }).result;
assert.equal(employeesBlocked.summary.envPreflightLabel, "12/12");
assert.equal(employeesBlocked.environment.ready, true);
assert.equal(employeesBlocked.ready, false);

const envBlockedHarness = buildHarness({ employeeReady: true, setupReady: true, envReady: false });
const envBlocked = envBlockedHarness.result;
assert.equal(envBlocked.summary.employeeRoleLabel, "8/8");
assert.equal(envBlocked.summary.envPreflightLabel, "2/12");
assert.equal(envBlocked.environment.intakeReady, false);
assert.equal(envBlocked.ready, false);
assert.equal(envBlockedHarness.calls.preview, 1);
assertSensitiveTextAbsent(envBlocked);

const manyBlockers = buildHarness({
  employeeReady: false,
  setupReady: true,
  envReady: false,
  envPreflightBlockerCount: 15,
}).result;
assert.equal(manyBlockers.blockers.filter((item) => item.category === "employee").length, 8);
assert.equal(manyBlockers.blockers.filter((item) => item.category === "employee-intake").length, 1);
assert.equal(manyBlockers.blockers.filter((item) => item.category === "env-preflight").length, 15);
assert.equal(manyBlockers.blockers.filter((item) => item.category === "env-intake").length, 1);
assert.equal(manyBlockers.blockers.length, 25);
assert.equal(manyBlockers.summary.blockerCount, 25);
assertSensitiveTextAbsent(manyBlockers);

const readyHarness = buildHarness({ employeeReady: true, setupReady: true, envReady: true });
const ready = readyHarness.result;
assert.equal(ready.status, "ready");
assert.equal(ready.ready, true);
assert.equal(ready.summary.employeeRoleLabel, "8/8");
assert.equal(ready.summary.employeeIntakeReady, true);
assert.equal(ready.summary.employeePayrollAttendanceCoverageLabel, "19/19");
assert.equal(ready.summary.envPreflightLabel, "12/12");
assert.equal(ready.summary.envIntakeReady, true);
assert.equal(ready.employeeIntake.ready, true);
assert.equal(ready.blockers.length, 0);
assert.deepEqual(readyHarness.calls.auditInput, { envFiles: ["/private/secure.env"] });
assert.deepEqual(readyHarness.calls.preflightInput, {
  env: { ERP_RUNTIME_MODE: "production" },
  envFiles: ["/private/secure.env"],
});
assert.deepEqual(readyHarness.calls.intakeInput, {
  envFiles: ["/private/secure.env"],
  intakeCsv: "/private/intake.csv",
});

const error = buildHarness({ employeeReady: true, setupReady: true, envError: new Error(sensitiveText) }).result;
assert.equal(error.status, "blocked");
assert.equal(error.environment.status, "error");
assert.equal(error.environment.ready, false);
assertSensitiveTextAbsent(error);

const apiSource = readFileSync(new URL("../server/apiServer.mjs", import.meta.url), "utf8");
const routeSource = readFileSync(new URL("../server/routes/systemReadRoutes.mjs", import.meta.url), "utf8");
const statusResponseSource = readFileSync(
  new URL("../server/services/v1GoLiveStatusResponseService.mjs", import.meta.url),
  "utf8",
);
assert.match(statusResponseSource, /from "\.\/v1D49ReadinessService\.mjs"/);
assert.match(statusResponseSource, /const d49Readiness = buildD49Readiness\(\{ workspace, operatorId \}\);/);
assert.match(statusResponseSource, /d49Readiness,/);
const registrySource = readFileSync(new URL("../server/apiSharedServiceRegistry.mjs", import.meta.url), "utf8");
assert.match(registrySource, /createV1GoLiveStatusResponseService/);
assert.match(routeSource, /v1GoLiveStatusResponseService\.build\(\{\s*workspace,/);
assert.doesNotMatch(apiSource, /passwordHash.*d49Readiness|loginName.*d49Readiness/);

console.log(
  "V1 D49 readiness checks passed: eight formal roles, setup/audit/preflight/intake gates, demo-mode blocking, redaction, and go-live status integration are covered.",
);

function buildHarness({ employeeReady, setupReady, envReady = false, envError = null, envPreflightBlockerCount = 1, intakeFresh = true }) {
  const calls = { preview: 0, auditInput: null, preflightInput: null, intakeInput: null };
  const result = buildV1D49Readiness({
    workspace: { runtimeConfig: { mode: "demo" }, users: [] },
    operatorId,
    now: () => new Date(checkedAt),
    intakeCsv: "/private/intake.csv",
    buildEmployeeReadiness: () => buildEmployeeReadiness(employeeReady),
    buildEmployeeIntakeStatus: () => buildEmployeeIntakeStatus(employeeReady, intakeFresh),
    resolveSetup: () => setupReady
      ? { status: "configured", ready: true, setupReady: true, envFiles: ["/private/secure.env"], blockingItems: [] }
      : {
          status: "not_configured",
          ready: false,
          setupReady: false,
          envFiles: [],
          blockingItems: [{ key: "setup", label: `setup ${sensitiveText}`, detail: sensitiveText, nextAction: sensitiveText }],
        },
    buildEnvFileAudit(input) {
      calls.auditInput = input;
      if (envError) throw envError;
      return {
        ready: true,
        blockingFindings: [],
      };
    },
    buildPreviewEnvironment() {
      calls.preview += 1;
      return { ERP_RUNTIME_MODE: "production" };
    },
    buildEnvPreflight(input) {
      calls.preflightInput = input;
      const checks = envReady
        ? []
        : Array.from({ length: envPreflightBlockerCount }, (_, index) => ({
            key: `database-${index + 1}`,
            label: `数据库 ${index + 1} ${sensitiveText}`,
            severity: "blocking",
            ready: false,
            detail: sensitiveText,
            nextAction: sensitiveText,
          }));
      return {
        ready: envReady,
        summary: {
          passedCount: envReady ? 12 : 2,
          totalCount: envReady ? 12 : Math.max(12, 2 + envPreflightBlockerCount),
          blockingCount: envReady ? 0 : envPreflightBlockerCount,
          warningCount: envReady ? 0 : 1,
        },
        checks,
      };
    },
    buildEnvIntakeVerification(input) {
      calls.intakeInput = input;
      return {
        scope: "v1_production_env_real_value_intake_verification",
        status: envReady ? "ready" : "blocked",
        ready: envReady,
        checkedAt,
        summary: {
          label: `intake ${sensitiveText}`,
          intakeRowCount: 11,
          configuredRowCount: envReady ? 11 : 2,
          missingRowCount: envReady ? 0 : 9,
          blockingCount: envReady ? 0 : 1,
          warningCount: 0,
          auditReady: true,
          intakeCsvReady: true,
        },
        blockingFindings: envReady ? [] : [{
          key: "intake",
          label: `intake ${sensitiveText}`,
          detail: sensitiveText,
          nextAction: sensitiveText,
        }],
        warningFindings: [],
        nextActions: envReady ? [] : [sensitiveText],
      };
    },
  });
  return { result, calls };
}

function buildEmployeeIntakeStatus(ready, fresh = true) {
  return {
    version: "p0-v1-d49-employee-intake-status-v2",
    scope: "v1_d49_employee_intake_status",
    available: true,
    fresh,
    status: !fresh ? "stale" : ready ? "ready_for_upload" : "needs_employee_numbers",
    ready: fresh && ready,
    uploadAllowed: fresh && ready,
    checkedAt,
    freshness: {
      fresh,
      status: fresh ? "fresh" : "workbook_changed",
      label: fresh ? "当前工作簿与预检报告一致" : "工作簿已变化，需重新预检",
      checkedAtValid: true,
      withinMaxAge: true,
      sourceMatched: fresh,
      maxAgeHours: 72,
      ageHours: 0,
    },
    summary: {
      label: ready ? "受控草稿已通过" : "受控草稿仍缺19个员工编号",
      employeeRowCount: 19,
      coveredRoleCount: ready ? 8 : 6,
      requiredRoleCount: 8,
      missingRoleCount: ready ? 0 : 2,
      coverageLabel: ready ? "8/8" : "6/8",
      errorCount: ready ? 0 : 19,
      warningCount: 0,
      issueCount: ready ? 0 : 19,
      missingEmployeeNumberCount: ready ? 0 : 19,
      blockerCount: ready ? 0 : 19,
      blockerLabel: ready ? "0 项" : "19 项",
      freshnessLabel: fresh ? "当前工作簿与预检报告一致" : "工作簿已变化，需重新预检",
      payrollAttendanceCoverageLabel: ready ? "19/19" : "0/19",
    },
    payrollAttendanceCoverage: {
      available: true,
      required: true,
      ready: fresh && ready,
      complete: fresh && ready,
      employeeCount: 19,
      completeCount: ready ? 19 : 0,
      incompleteCount: ready ? 0 : 19,
      profileReadyCount: ready ? 19 : 0,
      wageReadyCount: ready ? 19 : 0,
      attendanceMappingReadyCount: ready ? 19 : 0,
      coverageLabel: ready ? "19/19" : "0/19",
    },
    roles: [],
    missingRoleLabels: ready ? [] : ["财务 / 对账", "管理"],
    nextAction: !fresh ? "重新运行D49专用离线预检查。" : ready ? "进入网页预检查。" : "先补齐 19 个员工编号并重新预检查。",
    safeguards: {
      readOnly: true,
      reportRedactionVerified: true,
      employeeNamesIncluded: false,
      employeeNumbersIncluded: false,
      workbookPathIncluded: false,
      issueRowsIncluded: false,
      rawIssuesIncluded: false,
      sourceEvidenceVerified: fresh,
      workbookDigestIncluded: false,
    },
  };
}

function buildEmployeeReadiness(ready) {
  const roles = ["office", "warehouse", "finance", "workshop", "packing", "driver", "management", "technical_operations"];
  return {
    ready,
    requiredRoleCount: 8,
    coveredRoleCount: ready ? 8 : 0,
    missingRoleCount: ready ? 0 : 8,
    formalAccountCount: ready ? 8 : 0,
    readyFormalAccountCount: ready ? 8 : 0,
    roles: roles.map((roleKey) => ({
      roleKey,
      roleLabel: roleKey,
      ready,
      accountCount: ready ? 1 : 0,
      readyAccountCount: ready ? 1 : 0,
      blockers: [],
    })),
  };
}

function assertSensitiveTextAbsent(value) {
  const serialized = JSON.stringify(value);
  for (const fragment of ["postgres://", "owner:secret", "db.internal", "erp.internal", "/Users/private", "/private/secure.env", "/private/intake.csv"]) {
    assert.equal(serialized.includes(fragment), false, `response must redact ${fragment}`);
  }
}
