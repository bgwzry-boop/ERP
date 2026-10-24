import assert from "node:assert/strict";
import pg from "pg";
import { startLivePostgres, stopLivePostgres } from "./postgres-live/runtime.mjs";
import { createPostgresPoolClient } from "../server/postgresPoolClient.mjs";
import { createPostgresAttendancePayrollRepository } from "../server/attendancePayrollRepository.mjs";
import { createAttendancePayrollService } from "../server/services/attendancePayrollService.mjs";
import { ATTENDANCE_MINUTE_CALCULATION_VERSION } from "../server/services/attendanceWorkMinutes.mjs";
import { attendanceLunchFixture, setLunchPunches, lunchTestMonth, lunchTestDate, lunchTestNow } from "./helpers/attendanceLunchFixture.mjs";

// The test owns a new disposable loopback container; no existing DB URL is used.
const runtime = await startLivePostgres();
const pool = new pg.Pool({ connectionString: runtime.resolveLiveDatabaseUrl(), max: 5 });
const repository = createPostgresAttendancePayrollRepository({ postgresClient: createPostgresPoolClient({ pool }) });
const service = createAttendancePayrollService({ now: () => new Date(lunchTestNow), attendanceProvider: { key: "synthetic", fetchPunches: async () => [] } });
const base = attendanceLunchFixture(repository, "EMP-LIVE-MANAGER-001");
const employeeId = base.employees[0].id;
const cold = async () => ({ ...attendanceLunchFixture(repository, employeeId), ...await repository.loadState(), attendancePayrollRepository: repository });
const day = (workspace) => service.buildEmployeeAttendance({ workspace, employeeId, month: lunchTestMonth }).days[0];
const querySnapshot = async (text, values = []) => JSON.stringify((await pool.query(text, values)).rows);
try {
  await repository.importPunches({ workspace: base, batch: base.attendanceImportBatches[0], punches: base.attendancePunches });
  const policyInput = { versionLabel: "合成专项政策", effectiveFrom: "2026-09-01", policy: base.payrollPolicyVersions[0].policy };
  base.payrollPolicyVersions = [];
  const draftPolicy = await service.savePayrollPolicyVersion({ workspace: base, operatorId: "U-MANAGER-A", body: { ...policyInput, status: "draft" } });
  await service.savePayrollPolicyVersion({ workspace: base, operatorId: "U-MANAGER-A", body: { ...policyInput, id: draftPolicy.policyVersion.id, status: "published" } });
  await repository.saveDayReview({ workspace: base, review: { id: "ADR-LUNCH-LEGACY", employeeId, workDate: lunchTestDate,
    status: "approved", explanation: "合成旧复核快照", adjustedWorkMinutes: null, reviewedBy: "U-MANAGER-A",
    reviewedAt: lunchTestNow, createdAt: lunchTestNow, updatedAt: lunchTestNow } });
  let workspace = await cold();
  assert.equal(day(workspace).workMinutes, 540);
  assert.equal(day(workspace).minuteCalculation.legacyReviewedMinutesPreserved, true);
  const old = await service.generatePayrollDraft({ workspace, body: { month: lunchTestMonth }, operatorId: "U-MANAGER-A" });
  assert.equal(old.payrollLines[0].attendanceWorkMinutes, 540);
  for (const action of ["review", "lock", "payment"]) {
    await service.transitionPayrollRun({ workspace, payrollRunId: old.payrollRun.id, action, body: { paymentReference: "SYNTHETIC-NOT-A-PAYMENT" }, operatorId: "U-MANAGER-A" });
  }
  const oldSnapshot = await querySnapshot("SELECT row_to_json(r) AS row FROM payroll_runs r WHERE id=$1 UNION ALL SELECT row_to_json(l) FROM payroll_lines l WHERE payroll_run_id=$1", [old.payrollRun.id]);
  const rawSnapshot = await querySnapshot("SELECT row_to_json(p) AS row FROM attendance_punches p ORDER BY id");
  const policySnapshot = await querySnapshot("SELECT row_to_json(p) AS row FROM payroll_policy_versions p ORDER BY id");
  await service.reviewAttendanceDay({ workspace, employeeId, workDate: lunchTestDate, operatorId: "U-MANAGER-A",
    body: { status: "approved", explanation: "明确按工厂午休规则重新核对" } });
  workspace = await cold();
  assert.equal(day(workspace).workMinutes, 510, "The newly confirmed server minute snapshot survives a fresh PostgreSQL read");
  assert.equal(workspace.attendanceDayReviews[0].adjustedWorkMinutes, 510);
  assert.equal(workspace.attendanceDayReviews[0].status, "approved", "A server-confirmed snapshot is not relabelled as a manual adjustment");
  const own = service.buildOwnAttendance({ workspace, authContext: { user: { employeeId } }, month: lunchTestMonth });
  const workbench = service.buildPayrollWorkbench({ workspace, month: lunchTestMonth });
  assert.equal(own.summary.totalWorkMinutes, 510);
  assert.equal(workbench.employees[0].estimate.totalWorkMinutes, 510);
  const corrected = await service.generatePayrollDraft({ workspace, body: { month: lunchTestMonth }, operatorId: "U-MANAGER-A" });
  assert.equal(corrected.payrollRun.revision, 2);
  assert.equal(corrected.payrollLines[0].attendanceWorkMinutes, 510);
  assert.equal(corrected.payrollLines[0].calculation.attendanceMinuteEvidence[0].calculation.ruleVersion, ATTENDANCE_MINUTE_CALCULATION_VERSION);
  const newCold = await cold();
  assert.equal(newCold.payrollLines.find((line) => line.payrollRunId === corrected.payrollRun.id).calculation.attendanceMinuteEvidence[0].workMinutes, 510);
  assert.equal(await querySnapshot("SELECT row_to_json(r) AS row FROM payroll_runs r WHERE id=$1 UNION ALL SELECT row_to_json(l) FROM payroll_lines l WHERE payroll_run_id=$1", [old.payrollRun.id]), oldSnapshot, "Paid run, monetary lines and their original calculation JSON stay byte-equivalent");
  assert.equal(await querySnapshot("SELECT row_to_json(p) AS row FROM attendance_punches p ORDER BY id"), rawSnapshot);
  assert.equal(await querySnapshot("SELECT row_to_json(p) AS row FROM payroll_policy_versions p ORDER BY id"), policySnapshot);
  const [first, second] = await Promise.all([cold(), cold()]);
  const race = await Promise.allSettled([first, second].map((current) => service.generatePayrollDraft({ workspace: current, body: { month: lunchTestMonth }, operatorId: "U-MANAGER-A" })));
  assert.equal(race.filter((result) => result.status === "fulfilled").length, 1);
  assert.equal(race.find((result) => result.status === "rejected").reason.code, "PAYROLL_DRAFT_REVISION_CONFLICT");
  const beforeFailure = await querySnapshot("SELECT row_to_json(r) AS row FROM payroll_runs r ORDER BY id");
  const beforeLines = await querySnapshot("SELECT row_to_json(l) AS row FROM payroll_lines l ORDER BY id");
  await assert.rejects(repository.createPayrollRun({ workspace: await cold(), expectedLatestRevision: 3,
    payrollRun: { ...corrected.payrollRun, id: "PAY-LUNCH-ROLLBACK", revision: 4 },
    payrollLines: [{ ...corrected.payrollLines[0], id: old.payrollLines[0].id, payrollRunId: "PAY-LUNCH-ROLLBACK" }],
  }));
  assert.equal(await querySnapshot("SELECT row_to_json(r) AS row FROM payroll_runs r ORDER BY id"), beforeFailure, "A line failure rolls back the new parent run");
  assert.equal(await querySnapshot("SELECT row_to_json(l) AS row FROM payroll_lines l ORDER BY id"), beforeLines);
  // A second date tests the silk-screen rule without touching the paid day's history.
  const silkDate = "2026-09-16";
  workspace = await cold();
  workspace.employees[0].roleName = "丝印"; workspace.employees[0].defaultWorkshop = "丝印车间";
  setLunchPunches(workspace, ["08:00", "18:00"], silkDate);
  workspace.attendancePunches = workspace.attendancePunches.map((punch) => ({ ...punch, id: `${punch.id}-SILK`, externalPunchId: `${punch.externalPunchId}-SILK` }));
  await repository.importPunches({ workspace, batch: { ...base.attendanceImportBatches[0], id: "ATB-SILK-REST-SYNTHETIC", fetchedCount: 2, importedCount: 2 }, punches: workspace.attendancePunches });
  await service.reviewAttendanceDay({ workspace, employeeId, workDate: silkDate, operatorId: "U-MANAGER-A",
    body: { status: "approved", explanation: "合成丝印连续工作核对" } });
  let silkCold = await cold();
  silkCold.employees[0].roleName = "丝印"; silkCold.employees[0].defaultWorkshop = "丝印车间";
  const silkDay = (current) => service.buildEmployeeAttendance({ workspace: current, employeeId, month: lunchTestMonth }).days.find((item) => item.workDate === silkDate);
  assert.equal(silkDay(silkCold).workMinutes, 600);
  assert.equal(silkDay(silkCold).minuteCalculation.breakRule, "actual_rest_review");
  await service.reviewAttendanceDay({ workspace: silkCold, employeeId, workDate: silkDate, operatorId: "U-MANAGER-A",
    body: { status: "adjusted", explanation: "合成核对实际休息25分钟", adjustedWorkMinutes: 575 } });
  silkCold = await cold();
  silkCold.employees[0].roleName = "丝印"; silkCold.employees[0].defaultWorkshop = "丝印车间";
  assert.equal(silkDay(silkCold).workMinutes, 575);
  assert.equal(silkDay(silkCold).review.reviewedBy, "U-MANAGER-A");
  assert.equal(silkDay(silkCold).review.explanation, "合成核对实际休息25分钟");
  const silkTotal = 510 + 575;
  assert.equal(service.buildOwnAttendance({ workspace: silkCold, authContext: { user: { employeeId } }, month: lunchTestMonth }).summary.totalWorkMinutes, silkTotal);
  assert.equal(service.buildPayrollWorkbench({ workspace: silkCold, month: lunchTestMonth }).employees[0].estimate.totalWorkMinutes, silkTotal);
  const silkRun = await service.generatePayrollDraft({ workspace: silkCold, body: { month: lunchTestMonth }, operatorId: "U-MANAGER-A" });
  assert.equal(silkRun.payrollLines[0].attendanceWorkMinutes, silkTotal);
  assert.equal(silkRun.payrollLines[0].calculation.attendanceMinuteEvidence.find((item) => item.workDate === silkDate).workMinutes, 575);
  assert.equal(await querySnapshot("SELECT row_to_json(r) AS row FROM payroll_runs r WHERE id=$1 UNION ALL SELECT row_to_json(l) FROM payroll_lines l WHERE payroll_run_id=$1", [old.payrollRun.id]), oldSnapshot);
  console.log("Attendance lunch PostgreSQL passed: ordinary 540→510 and silk-screen 600→reviewed575 cold reads, shared calculation, paid history preservation, concurrent revision and complete rollback.");
} finally {
  await pool.end();
  await stopLivePostgres(runtime);
}
