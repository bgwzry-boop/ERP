// Owner's 2026 wage book rules (confirmed 2026-11-02): default monthly 绩效 by
// position, no 岗位补贴 before probation ends, insurance deposit withheld in the
// hire month, the next month held back, both settled at year end.
import assert from "node:assert/strict";
import { calculatePayrollEstimate, createAttendancePayrollService, resolveNewHireWithholding, validatePayrollPolicy } from "../server/services/attendancePayrollService.mjs";
import { buildRecordPayslipAcknowledgementQuery, createLocalAttendancePayrollRepository } from "../server/attendancePayrollRepository.mjs";
import { PAYROLL_NEW_HIRE_INSURANCE_DEPOSIT, PAYROLL_POSITION_CATALOG, payrollPositionPolicyRates } from "../shared/payrollPositionCatalog.js";

const performance = Object.fromEntries(PAYROLL_POSITION_CATALOG.map((position) => [position.key, position.monthlyPerformance]));
assert.deepEqual(
  { bag: performance["PAY-BAG"], print: performance["PAY-PRINT"], male: performance["PAY-MALE"], ware: performance["PAY-WARE"], driver: performance["PAY-DRIVER"], office: performance["PAY-OFFICE"], female: performance["PAY-FEMALE"], handle: performance["PAY-HANDLE"], tech: performance["PAY-TECH"] },
  { bag: 300, print: 300, male: 300, ware: 300, driver: 300, office: 500, female: 500, handle: 500, tech: 1300 },
);
assert.equal(PAYROLL_NEW_HIRE_INSURANCE_DEPOSIT, 952);

const policy = validatePayrollPolicy({
  regularMinutesPerDay: 480,
  overtimeMultiplier: 1,
  seniorityAwards: [{ minYears: 1, monthlyAmount: 30 }, { minYears: 2, monthlyAmount: 45 }],
  positionRates: payrollPositionPolicyRates(),
  newHireInsuranceDeposit: PAYROLL_NEW_HIRE_INSURANCE_DEPOSIT,
});
assert.equal(policy.newHireInsuranceDeposit, 952);
assert.equal(policy.positionRates.find((rate) => rate.payrollPositionKey === "PAY-TECH").monthlyPerformance, 1300);
assert.throws(() => validatePayrollPolicy({ ...policy, newHireInsuranceDeposit: -1 }), (error) => error.code === "PAYROLL_POLICY_INSURANCE_DEPOSIT_INVALID");
assert.throws(() => validatePayrollPolicy({ ...policy, positionRates: [{ ...policy.positionRates[0], monthlyPerformance: -5 }] }), (error) => error.code === "PAYROLL_POLICY_PERFORMANCE_INVALID");

const policyVersion = { id: "PPV-TEST", versionLabel: "test", policy };
const day = (workDate, hours) => ({ workDate, workMinutes: hours * 60, status: "confirmed" });
const asOf = new Date("2026-12-31T15:59:59.999Z");

// Regular bag worker: (10 + 5) × 20h + 300 绩效, no overtime premium.
const regular = calculatePayrollEstimate({
  employee: { id: "E1", hireDate: "2024-03-01", payrollPositionKey: "PAY-BAG" },
  days: [day("2026-12-01", 10), day("2026-12-02", 10)],
  policyVersion,
  asOf,
  month: "2026-12",
});
assert.equal(regular.baseWage, 200);
assert.equal(regular.positionAllowance, 100);
assert.equal(regular.overtimeWage, 0);
assert.equal(regular.performanceAward, 300);
assert.equal(regular.seniorityAward, 45);
assert.equal(regular.grossWage, 645);

// Probation ends on the 2nd: allowance only from that day; hired this month → no 绩效.
const newHire = calculatePayrollEstimate({
  employee: { id: "E2", hireDate: "2026-12-01", probationEndDate: "2026-12-02", payrollPositionKey: "PAY-BAG" },
  days: [day("2026-12-01", 10), day("2026-12-02", 10)],
  policyVersion,
  asOf,
  month: "2026-12",
});
assert.equal(newHire.positionAllowance, 50);
assert.equal(newHire.performanceAward, 0);
assert.equal(newHire.grossWage, 250);

// Driver: daily wage × days + 300 绩效.
const driver = calculatePayrollEstimate({
  employee: { id: "E3", hireDate: "2026-06-03", payrollPositionKey: "PAY-DRIVER" },
  days: [day("2026-12-01", 9), day("2026-12-02", 9)],
  policyVersion,
  asOf,
  month: "2026-12",
});
assert.equal(driver.baseWage, 360);
// Owner 2026-11-02: drivers are always paid whole days, even for a short day.
const driverShortDay = calculatePayrollEstimate({
  employee: { id: "E4", hireDate: "2026-06-03", payrollPositionKey: "PAY-DRIVER" },
  days: [day("2026-12-01", 4)],
  policyVersion,
  asOf,
  month: "2026-12",
});
assert.equal(driverShortDay.attendanceDayCount, 1);
assert.equal(driverShortDay.baseWage, 180, "a short driver day is a whole 180-yuan day, never 90");
assert.equal(driver.performanceAward, 300);

// Deposit in the hire month, the whole next month held, nothing afterwards.
assert.deepEqual(resolveNewHireWithholding({ employee: { hireDate: "2026-11-16" }, month: "2026-11", netWage: 2300, policy }),
  { insuranceDepositWithheld: 952, heldWage: 0, payableNow: 1348, yearEndSettlement: 952 });
assert.deepEqual(resolveNewHireWithholding({ employee: { hireDate: "2026-11-16" }, month: "2026-12", netWage: 5000, policy }),
  { insuranceDepositWithheld: 0, heldWage: 5000, payableNow: 0, yearEndSettlement: 5000 });
assert.deepEqual(resolveNewHireWithholding({ employee: { hireDate: "2026-12-20" }, month: "2027-01", netWage: 4000, policy }),
  { insuranceDepositWithheld: 0, heldWage: 4000, payableNow: 0, yearEndSettlement: 4000 });
assert.deepEqual(resolveNewHireWithholding({ employee: { hireDate: "2026-11-16" }, month: "2027-01", netWage: 5000, policy }),
  { insuranceDepositWithheld: 0, heldWage: 0, payableNow: 5000, yearEndSettlement: 0 });
assert.equal(resolveNewHireWithholding({ employee: { hireDate: "2026-11-30" }, month: "2026-11", netWage: 300, policy }).insuranceDepositWithheld, 300,
  "the deposit never exceeds what was earned");
assert.equal(resolveNewHireWithholding({ employee: { hireDate: "2026-11-16" }, month: "2026-11", netWage: 2300, policy: {} }).insuranceDepositWithheld, 0,
  "a policy without a deposit withholds nothing");

// The employee's online payslip shows what is paid now and what waits for year end.
{
  const service = createAttendancePayrollService({ now: () => new Date("2026-12-10T02:00:00Z") });
  const line = (id, runId, month, netWage, withholding) => ({
    id, payrollRunId: runId, employeeId: "E9", attendanceWorkMinutes: 6000, baseWage: netWage, positionAllowance: 0,
    seniorityAward: 0, performanceAward: 0, overtimeWage: 0, leaveDeduction: 0, otherDeduction: 0, grossWage: netWage, netWage,
    calculation: { calculationMode: "hourly", attendanceDayCount: 10, withholding },
  });
  const workspace = {
    employees: [{ id: "E9", name: "新员工", roleName: "制袋机-理袋女工", hireDate: "2026-10-16" }],
    payrollRuns: [
      { id: "R10", payrollMonth: "2026-10", revision: 1, status: "paid", paidAt: "2026-11-05T02:00:00Z" },
      { id: "R11", payrollMonth: "2026-11", revision: 1, status: "reviewed" },
      { id: "R11D", payrollMonth: "2026-11", revision: 2, status: "draft" },
    ],
    payrollLines: [
      line("L10", "R10", "2026-10", 2300, resolveNewHireWithholding({ employee: { hireDate: "2026-10-16" }, month: "2026-10", netWage: 2300, policy })),
      line("L11", "R11", "2026-11", 5000, resolveNewHireWithholding({ employee: { hireDate: "2026-10-16" }, month: "2026-11", netWage: 5000, policy })),
      line("L11D", "R11D", "2026-11", 9999, null),
    ],
  };
  const auth = { user: { employeeId: "E9" } };
  const october = service.buildOwnPayslip({ workspace, authContext: auth, month: "2026-10" });
  assert.equal(october.payslip.statusLabel, "已发放");
  assert.equal(october.payslip.insuranceDepositWithheld, 952);
  assert.equal(october.payslip.payableNow, 1348);
  const november = service.buildOwnPayslip({ workspace, authContext: auth, month: "2026-11" });
  assert.equal(november.payslip.netWage, 5000, "the newer draft revision stays hidden");
  assert.equal(november.payslip.heldWage, 5000);
  assert.equal(november.payslip.payableNow, 0);
  assert.deepEqual(november.yearEndSettlement, { year: "2026", insuranceDeposit: 952, heldWage: 5000, total: 5952 });
  assert.deepEqual(november.availableMonths, ["2026-11", "2026-10"]);

  // The employee confirms the revision they see (replaces 工资确认签名).
  workspace.attendancePayrollRepository = createLocalAttendancePayrollRepository();
  workspace.payslipAcknowledgements = [];
  assert.equal(november.payslip.acknowledgedAt, "");
  await assert.rejects(service.acknowledgeOwnPayslip({ workspace, authContext: auth, body: { month: "2026-11", revision: 2 } }),
    (error) => error.code === "PAYSLIP_REVISION_CHANGED", "a draft or other revision cannot be confirmed");
  await assert.rejects(service.acknowledgeOwnPayslip({ workspace, authContext: auth, body: { month: "2026-12", revision: 1 } }),
    (error) => error.code === "PAYSLIP_NOT_AVAILABLE");
  // Cross-month regression (release review 2026-11-03): both months are revision 1, so the
  // month and the shown amount must match the payslip actually being confirmed.
  await assert.rejects(service.acknowledgeOwnPayslip({ workspace, authContext: auth, body: { revision: 1, netWage: 5000 } }),
    (error) => error.code === "PAYSLIP_MONTH_REQUIRED", "no silent default to the current month");
  await assert.rejects(service.acknowledgeOwnPayslip({ workspace, authContext: auth, body: { month: "2026-11", revision: 1, netWage: 2300 } }),
    (error) => error.code === "PAYSLIP_REVISION_CHANGED", "October's amount cannot confirm November");
  assert.equal(workspace.payslipAcknowledgements.length, 0);
  const confirmed = await service.acknowledgeOwnPayslip({ workspace, authContext: { user: { employeeId: "E9", userId: "U-E9" } }, body: { month: "2026-11", revision: 1, netWage: 5000 } });
  assert.equal(confirmed.acknowledgement.payrollLineId, "L11");
  assert.equal(confirmed.acknowledgement.netWage, 5000);
  assert.equal(confirmed.acknowledgement.payableNow, 0);
  assert.equal(confirmed.acknowledgement.acknowledgedBy, "U-E9");
  const again = await service.acknowledgeOwnPayslip({ workspace, authContext: auth, body: { month: "2026-11", revision: 1 } });
  assert.equal(again.replayed, true);
  assert.equal(workspace.payslipAcknowledgements.length, 1, "confirming twice keeps one record");
  assert.equal(service.buildOwnPayslip({ workspace, authContext: auth, month: "2026-11" }).payslip.acknowledgedAt, confirmed.acknowledgement.acknowledgedAt);
  workspace.employees.push({ id: "E8", name: "其他员工" });
  assert.equal(service.buildOwnPayslip({ workspace, authContext: { user: { employeeId: "E8" } }, month: "2026-11" }).payslip, null,
    "another employee never sees or confirms E9's payslip");
  const query = buildRecordPayslipAcknowledgementQuery({ acknowledgement: confirmed.acknowledgement });
  assert.match(query.text, /payroll_runs\.status IN \('reviewed', 'locked', 'paid'\)/);
  assert.match(query.text, /ON CONFLICT \(payroll_line_id\) DO NOTHING/);
}

{
  const { readFileSync } = await import("node:fs");
  const page = readFileSync(new URL("../src/features/payroll/EmployeeAttendanceMobilePage.jsx", import.meta.url), "utf8");
  assert.match(page, /month: slip\.payrollMonth, revision: slip\.revision, netWage: slip\.netWage/, "the phone confirms the payslip on screen, not the month picker");
  assert.match(page, /state\.data\?\.month === month/, "a response for another month is never shown");
  assert.match(page, /key=\{month\}/, "switching month resets the payslip section");
  // Slow-network regression (release review 2026-11-03): a late September confirmation reply
  // must not reload the October page with September parameters.
  assert.match(page, /const \{ month, authState, userId \} = viewRef\.current;/, "refresh always reads the month and session on screen");
  assert.match(page, /viewRef\.current\.month !== month \|\| viewRef\.current\.authState !== authState\) return;/, "a stale read never overwrites the page");
  assert.match(page, /if \(current\.month !== slip\.payrollMonth \|\| current\.authState !== sent\.authState \|\| current\.userId !== sent\.userId\) return "";/, "a late confirmation reply for another month or session triggers nothing");
}

console.log("Payroll wage-book rules passed: position 绩效 defaults, probation allowance, no overtime premium, driver days, new-hire deposit and held month.");
