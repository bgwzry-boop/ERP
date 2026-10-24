import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { calculateAttendanceWorkMinutes, ATTENDANCE_MINUTE_CALCULATION_VERSION } from "../server/services/attendanceWorkMinutes.mjs";
import { buildAttendanceDays, createAttendancePayrollService } from "../server/services/attendancePayrollService.mjs";
import { createLocalAttendancePayrollRepository } from "../server/attendancePayrollRepository.mjs";
import { attendanceLunchFixture, setLunchPunches, lunchTestMonth, lunchTestDate, lunchTestNow } from "./helpers/attendanceLunchFixture.mjs";

const localTimes = (times) => times.map((time) => `2026-09-15T${time}:00+08:00`);
if (process.argv.includes("--timezone-probe")) {
  process.stdout.write(JSON.stringify(calculateAttendanceWorkMinutes(localTimes(["08:00", "18:00"]))));
  process.exit(0);
}
for (const [times, raw, paid] of [
  [["08:00", "18:00"], 600, 540],
  [["08:00", "12:00", "13:00", "18:00"], 540, 540],
  [["08:00", "12:30", "13:30", "18:00"], 540, 510],
  [["08:00", "12:00", "13:00", "14:00", "16:00", "18:00"], 420, 420],
  [["11:45", "12:15"], 30, 15], [["12:45", "13:15"], 30, 15],
  [["12:00", "13:00"], 60, 0], [["08:00", "12:00"], 240, 240],
  [["13:00", "18:00"], 300, 300], [["08:00", "11:00"], 180, 180],
]) {
  const evidence = calculateAttendanceWorkMinutes(localTimes(times));
  assert.equal(evidence.rawWorkMinutes, raw, times.join(" / "));
  assert.equal(evidence.workMinutes, paid, times.join(" / "));
  assert.equal(evidence.unpaidBreakMinutes, raw - paid);
}
assert.equal(calculateAttendanceWorkMinutes(["2026-09-15T23:00:00+08:00", "2026-09-16T02:00:00+08:00"]).workMinutes, 180);
assert.equal(calculateAttendanceWorkMinutes(["2026-09-15T23:00:00+08:00", "2026-09-16T14:00:00+08:00"]).workMinutes, 840);
assert.deepEqual(calculateAttendanceWorkMinutes(["bad", "also bad"]).segments, []);
for (const timeZone of ["UTC", "Asia/Shanghai", "America/Los_Angeles"]) {
  const result = JSON.parse(execFileSync(process.execPath, [fileURLToPath(import.meta.url), "--timezone-probe"], {
    env: { ...process.env, TZ: timeZone }, encoding: "utf8",
  }));
  assert.equal(result.workMinutes, 540);
  assert.equal(result.factoryTimeZone, "Asia/Shanghai");
}

const repository = createLocalAttendancePayrollRepository();
const workspace = attendanceLunchFixture(repository);
const employeeId = workspace.employees[0].id;
const service = createAttendancePayrollService({ now: () => new Date(lunchTestNow), attendanceProvider: { key: "synthetic", fetchPunches: async () => [] } });
const readDay = () => buildAttendanceDays({ workspace, employee: workspace.employees[0], month: lunchTestMonth })[0];
const original = JSON.stringify(workspace);
assert.equal(readDay().workMinutes, 540);
assert.equal(readDay().rawWorkMinutes, 600);
assert.equal(readDay().minuteCalculation.version, ATTENDANCE_MINUTE_CALCULATION_VERSION);
assert.equal(JSON.stringify(workspace), original, "Reading attendance never writes source data or policies");
const own = service.buildOwnAttendance({ workspace, authContext: { user: { employeeId } }, month: lunchTestMonth });
const workbench = service.buildPayrollWorkbench({ workspace, month: lunchTestMonth });
assert.equal(own.summary.totalWorkMinutes, 540);
assert.equal(own.payrollEstimate.baseWage, 9);
assert.equal(own.payrollEstimate.positionAllowance, 9);
assert.equal(own.payrollEstimate.overtimeWage, 0);
assert.equal(workbench.employees[0].estimate.totalWorkMinutes, own.payrollEstimate.totalWorkMinutes);
assert.equal(own.payrollEstimate.attendanceMinuteEvidence[0].calculation.ruleVersion, ATTENDANCE_MINUTE_CALCULATION_VERSION);

workspace.attendanceDayReviews = [{ id: "ADR-LEGACY", employeeId, workDate: lunchTestDate, status: "approved", adjustedWorkMinutes: null }];
const legacy = readDay();
assert.equal(legacy.workMinutes, 600, "An old human approval is not silently repriced");
assert.equal(legacy.minuteCalculation.legacyReviewedMinutesPreserved, true);
assert.equal(legacy.minuteCalculation.calculatedWorkMinutes, 540);
workspace.payrollRuns = [{ id: "PAY-OLD", status: "paid", revision: 1, payrollMonth: lunchTestMonth }];
workspace.payrollLines = [{ id: "LINE-OLD", payrollRunId: "PAY-OLD", attendanceWorkMinutes: 600, calculation: { version: "legacy", totalWorkMinutes: 600 } }];
const historical = JSON.stringify([workspace.payrollRuns, workspace.payrollLines, workspace.payrollPolicyVersions, workspace.users, workspace.attendancePunches]);
await service.reviewAttendanceDay({ workspace, employeeId, workDate: lunchTestDate, operatorId: "U-MANAGER-A", body: { status: "approved", explanation: "明确重新核对午休", adjustedWorkMinutes: 1 } });
assert.equal(workspace.attendanceDayReviews[0].status, "approved");
assert.equal(workspace.attendanceDayReviews[0].adjustedWorkMinutes, 540, "Approved minutes are computed by the server, never the request body");
assert.equal(readDay().workMinutes, 540);
assert.equal(readDay().minuteCalculation.reviewedMinuteSnapshot, true);
assert.equal(JSON.stringify([workspace.payrollRuns, workspace.payrollLines, workspace.payrollPolicyVersions, workspace.users, workspace.attendancePunches]), historical);
setLunchPunches(workspace, ["08:00", "19:00"]);
assert.equal(readDay().workMinutes, 540, "A persisted approval remains an exact minute snapshot");
await service.reviewAttendanceDay({ workspace, employeeId, workDate: lunchTestDate, operatorId: "U-MANAGER-A", body: { status: "adjusted", explanation: "有明确依据的人工分钟", adjustedWorkMinutes: 501 } });
assert.equal(readDay().workMinutes, 501, "Manual confirmed minutes are never reduced a second time");
await service.reviewAttendanceDay({ workspace, employeeId, workDate: lunchTestDate, operatorId: "U-MANAGER-A", body: { status: "rejected", explanation: "暂不计薪" } });
assert.equal(readDay().workMinutes, 0);
assert.equal(readDay().rawWorkMinutes, 660);
workspace.attendanceDayReviews = [];
setLunchPunches(workspace, ["08:00", "12:00", "13:00", "14:00", "16:00", "18:00"]);
assert.equal(readDay().status, "pending_review", "Six punches still require the established human exception review");
assert.equal(service.buildEmployeeAttendance({ workspace, employeeId, month: lunchTestMonth }).summary.totalWorkMinutes, 0);
workspace.employees[0].roleName = "司机"; workspace.employees[0].defaultWorkshop = "司机";
setLunchPunches(workspace, ["08:00", "12:30", "13:30", "18:00"]);
workspace.payrollPolicyVersions[0].policy.positionRates[0] = { payrollPositionKey: "PAY-LUNCH-SYNTHETIC", positionName: "合成日薪", mode: "daily", dailyWage: 1 };
const daily = service.buildEmployeeAttendance({ workspace, employeeId, month: lunchTestMonth }).payrollEstimate;
assert.equal(daily.totalWorkMinutes, 510);
assert.equal(daily.baseWage, 1);
assert.equal(daily.positionAllowance, 0);
assert.equal(daily.overtimeWage, 0);
console.log("Attendance lunch checks passed: factory-time intersections, 3 host timezones, immutable raw punches/history, explicit review snapshots, six-punch review gate, shared estimates and unchanged daily-wage rules.");
