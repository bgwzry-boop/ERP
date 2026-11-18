import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
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
  await assert.rejects(service.transitionPayrollRun({ workspace, payrollRunId: corrected.payrollRun.id, action: "review",
    operatorId: "U-MANAGER-A" }), { code: "PAYROLL_MONTH_ALREADY_PAID" });
  const paidReplay = await service.transitionPayrollRun({ workspace, payrollRunId: old.payrollRun.id, action: "payment",
    body: { paymentReference: "SYNTHETIC-NOT-A-PAYMENT" }, operatorId: "U-MANAGER-A" });
  assert.equal(paidReplay.replayed, true);
  assert.equal(paidReplay.payrollRun.id, old.payrollRun.id);
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
  await checkConcurrentMonthPayments(old);
  await checkHistoricPaidDuplicates();
  await checkMonthlyCoverageWithoutNewPunches();
  console.log("Attendance lunch and monthly payment PostgreSQL passed: ordinary 540→510 and silk-screen 600→reviewed575, correction draft only after pay, same receipt replay, competing revisions cannot both pay, legacy duplicate records preserved, concurrent draft revision and rollback, zero-new-punch monthly coverage.");
} finally {
  await pool.end();
  await stopLivePostgres(runtime);
}

async function checkMonthlyCoverageWithoutNewPunches() {
  const month = "2026-11";
  const rangeStart = "2026-10-31T16:00:00.000Z";
  const monthEnd = "2026-11-30T16:00:00.000Z";
  const midmonth = "2026-11-28T10:00:00.000Z";
  let now = midmonth;
  let returnsPunches = true;
  const sourcePunches = ["2026-11-27T08:00:00+08:00", "2026-11-27T18:00:00+08:00"].map((punchedAt, index) => ({
    externalPunchId: `PUNCH-COVERAGE-${index}`, externalEmployeeId: "PERSON-LUNCH-SYNTHETIC", punchedAt,
  }));
  const syncService = createAttendancePayrollService({
    now: () => new Date(now),
    attendanceProvider: {
      key: "synthetic",
      fetchPunches: async ({ rangeStart: start, rangeEnd: end }) => returnsPunches
        ? sourcePunches.filter(row => Date.parse(row.punchedAt) >= Date.parse(start) && Date.parse(row.punchedAt) < Date.parse(end))
        : [],
    },
  });
  const precheck = async requested => syncService.precheckAttendanceSync({ workspace: await cold(), body: { month: requested } });
  const sync = async ({ rangeStart, rangeEnd }) => syncService.syncAttendance({
    workspace: await cold(), body: { rangeStart, rangeEnd }, operatorId: "U-MANAGER-A",
  });
  await assert.rejects(precheck("2026-12"), { code: "ATTENDANCE_SYNC_FUTURE_RANGE" });
  const initial = await precheck(month);
  assert.deepEqual([initial.rangeStart, initial.rangeEnd], [rangeStart, midmonth]);
  assert.equal(initial.summary.newRecordCount, 2);
  assert.equal(initial.coverageConfirmationNeeded, false);
  assert.equal(initial.importRecommended, true);
  const imported = await sync(initial);
  assert.equal(imported.batch.importedCount, 2);
  now = "2026-12-01T01:00:00.000Z";
  const workbench = async () => syncService.buildPayrollWorkbench({ workspace: await cold(), month });
  assert.equal((await workbench()).summary.attendanceCoverageComplete, false);
  const before = await querySnapshot("SELECT row_to_json(p) AS row FROM attendance_punches p ORDER BY id");
  const beforeBatches = await querySnapshot("SELECT row_to_json(b) AS row FROM attendance_import_batches b ORDER BY id");
  returnsPunches = false;
  const empty = await precheck(month);
  assert.equal(empty.ready, false);
  assert.equal(empty.importRecommended, false);
  await assert.rejects(sync(empty), { code: "ATTENDANCE_SYNC_PRECHECK_BLOCKED" });
  assert.equal(await querySnapshot("SELECT row_to_json(b) AS row FROM attendance_import_batches b ORDER BY id"), beforeBatches);
  returnsPunches = true;
  const final = await precheck(month);
  assert.deepEqual([final.rangeStart, final.rangeEnd], [rangeStart, monthEnd]);
  assert.equal(final.summary.newRecordCount, 0);
  assert.equal(final.coverageConfirmationNeeded, true);
  assert.equal(final.importRecommended, true);
  assert.equal(await querySnapshot("SELECT row_to_json(b) AS row FROM attendance_import_batches b ORDER BY id"), beforeBatches);
  const closing = await sync(final);
  assert.equal(closing.batch.importedCount, 0);
  assert.equal(closing.batch.fetchedCount, 2);
  assert.equal(closing.batch.duplicateCount, 2);
  const closed = await workbench();
  assert.equal(closed.summary.attendanceCoverageComplete, true);
  assert.equal(closed.summary.attendanceCoverageGapCount, 0);
  assert.equal(await querySnapshot("SELECT row_to_json(p) AS row FROM attendance_punches p ORDER BY id"), before);
  const repeat = await precheck(month);
  assert.equal(repeat.importRecommended, false);
  assert.equal(repeat.coverageConfirmationNeeded, false);
}

async function checkConcurrentMonthPayments(template) {
  const month = "2026-08";
  const ids = ["PAY-MONTH-RACE-1", "PAY-MONTH-RACE-2"];
  for (const [index, id] of ids.entries()) {
    const workspace = await cold();
    const payrollRun = { ...template.payrollRun, id, payrollMonth: month, revision: index + 1, status: "draft" };
    await repository.createPayrollRun({
      workspace, payrollRun, expectedLatestRevision: index,
      payrollLines: [{ ...template.payrollLines[0], id: `LINE-${id}`, payrollRunId: id }],
    });
    for (const action of ["review", "lock"]) await service.transitionPayrollRun({
      workspace, payrollRunId: id, action, operatorId: "U-MANAGER-A",
    });
  }
  const workspaces = await Promise.all(ids.map(() => cold()));
  const pay = (index, workspace = workspaces[index]) => service.transitionPayrollRun({
    workspace, payrollRunId: ids[index], action: "payment", operatorId: "U-MANAGER-A",
    body: { paymentReference: `LOCAL-TEST-RECEIPT-${index}` },
  });
  // Both database commands begin from a snapshot with neither run paid.
  // Retry the first candidate at the same time to exercise fresh-snapshot replay.
  const sameReceiptWorkspace = await cold();
  const stalePaymentWorkspace = await cold();
  const outcomes = await Promise.allSettled([pay(0), pay(1), pay(0, sameReceiptWorkspace)]);
  const paid = (await pool.query("SELECT id FROM payroll_runs WHERE payroll_month=$1 AND status='paid'", [month])).rows;
  assert.equal(paid.length, 1);
  const commits = outcomes.filter((outcome) => outcome.status === "fulfilled").map((outcome) => outcome.value);
  assert.ok(commits.length >= 1);
  assert.ok(commits.every((receipt) => receipt.payrollRun.id === paid[0].id));
  assert.ok(outcomes.filter((outcome) => outcome.status === "rejected")
    .every((outcome) => outcome.reason.code === "PAYROLL_MONTH_ALREADY_PAID"));
  const winnerIndex = ids.indexOf(paid[0].id);
  if (winnerIndex === 0) {
    assert.equal(commits.length, 2);
    assert.equal(commits.filter((receipt) => receipt.replayed).length, 1);
  }
  const replay = await pay(winnerIndex, await cold());
  assert.equal(replay.replayed, true);
  assert.equal(replay.payrollRun.paidAt, commits[0].payrollRun.paidAt);
  const staleReplay = await pay(winnerIndex, stalePaymentWorkspace);
  assert.equal(staleReplay.replayed, true);
  assert.equal(staleReplay.payrollRun.paidAt, commits[0].payrollRun.paidAt);
  await assert.rejects(pay(1 - winnerIndex, await cold()), { code: "PAYROLL_MONTH_ALREADY_PAID" });
}

async function checkHistoricPaidDuplicates() {
  const migration = await readFile(new URL("../db/migrations/0070_payroll_month_payment_guard.sql", import.meta.url), "utf8");
  const conn = await pool.connect();
  try {
    await conn.query("BEGIN");
    // Recreate the pre-migration table state inside this disposable database.
    await conn.query("DROP TRIGGER trg_payroll_month_payment_guard ON payroll_runs");
    await conn.query("DROP TABLE payroll_paid_month_guards");
    await conn.query(`INSERT INTO payroll_runs(id,payroll_month,status,revision,paid_at,payment_reference)
      VALUES ('PAY-LEGACY-HISTORY-1','2026-01','paid',1,'2026-02-01Z','OLD-TEST-1'),
      ('PAY-LEGACY-HISTORY-2','2026-01','paid',2,'2026-02-02Z','OLD-TEST-2')`);
    const legacy = () => conn.query("SELECT * FROM payroll_runs WHERE payroll_month='2026-01' ORDER BY revision").then((result) => result.rows);
    const before = await legacy();
    await conn.query(migration);
    assert.deepEqual(await legacy(), before);
    assert.deepEqual((await conn.query("SELECT payroll_run_id FROM payroll_paid_month_guards WHERE payroll_month='2026-01'")).rows,
      [{ payroll_run_id: "PAY-LEGACY-HISTORY-1" }]);
    await conn.query("SAVEPOINT before_third");
    await assert.rejects(conn.query("INSERT INTO payroll_runs (id,payroll_month,status,revision) VALUES ('PAY-LEGACY-HISTORY-3','2026-01','paid',3)"),
      { code: "23505", constraint: "payroll_paid_month_guards_pkey" });
    await conn.query("ROLLBACK TO SAVEPOINT before_third");
    assert.deepEqual(await legacy(), before);
  } finally {
    await conn.query("ROLLBACK");
    conn.release();
  }
}
