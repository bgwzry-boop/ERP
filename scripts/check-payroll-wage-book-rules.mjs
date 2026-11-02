// Owner's 2026 wage book rules (confirmed 2026-11-02): default monthly 绩效 by
// position, no 岗位补贴 before probation ends, insurance deposit withheld in the
// hire month, the next month held back, both settled at year end.
import assert from "node:assert/strict";
import { calculatePayrollEstimate, resolveNewHireWithholding, validatePayrollPolicy } from "../server/services/attendancePayrollService.mjs";
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

console.log("Payroll wage-book rules passed: position 绩效 defaults, probation allowance, no overtime premium, driver days, new-hire deposit and held month.");
