import assert from "node:assert/strict";
import {
  PAYROLL_POSITION_CATALOG,
  PAYROLL_SENIORITY_AWARDS,
  findPayrollPosition,
  payrollPositionPolicyRates,
  suggestPayrollPosition,
} from "../shared/payrollPositionCatalog.js";

assert.equal(PAYROLL_POSITION_CATALOG.length, 10);
assert.equal(new Set(PAYROLL_POSITION_CATALOG.map((item) => item.key)).size, 10);
assert.equal(PAYROLL_POSITION_CATALOG.filter((item) => item.mode === "hourly").length, 9);
assert.equal(PAYROLL_POSITION_CATALOG.filter((item) => item.mode === "daily").length, 1);
assert.deepEqual(findPayrollPosition("pay-driver"), PAYROLL_POSITION_CATALOG.at(-1));
assert.equal(PAYROLL_SENIORITY_AWARDS[0].monthlyAmount, 30);
assert.equal(PAYROLL_SENIORITY_AWARDS.at(-1).monthlyAmount, 135);

const rates = payrollPositionPolicyRates();
assert.equal(rates.find((item) => item.payrollPositionKey === "PAY-BAG").baseHourlyWage, 10);
assert.equal(rates.find((item) => item.payrollPositionKey === "PAY-BAG").positionAllowanceHourly, 5);
assert.equal(rates.find((item) => item.payrollPositionKey === "PAY-DRIVER").dailyWage, 180);
assert.equal("baseHourlyWage" in rates.find((item) => item.payrollPositionKey === "PAY-DRIVER"), false);

assert.deepEqual(suggestPayrollPosition({ roleName: "司机" }).candidates, ["PAY-DRIVER"]);
assert.deepEqual(suggestPayrollPosition({ defaultWorkshop: "丝印车间", defaultMachineId: "PRINT-03" }).candidates, ["PAY-PRINT"]);
assert.deepEqual(suggestPayrollPosition({ defaultMachine: "6号机" }).candidates, ["PAY-BAG"]);
assert.deepEqual(suggestPayrollPosition({ configuredMachineLabel: "6号制袋机" }).candidates, ["PAY-BAG"]);
assert.deepEqual(suggestPayrollPosition({ configuredMachineLabel: "3号丝印机" }).candidates, ["PAY-PRINT"]);
assert.deepEqual(suggestPayrollPosition({ configuredMachineLabel: "", defaultMachineId: "PRINT-02" }).candidates, ["PAY-PRINT"]);
assert.equal(suggestPayrollPosition({ roleName: "库房 / 出库" }).status, "unmatched");
assert.equal(suggestPayrollPosition({ baseHourlyWage: 10, positionAllowanceHourly: 5 }).status, "ambiguous");
assert.equal(suggestPayrollPosition({ payrollPositionKey: "PAY-TECH" }).status, "confirmed");

console.log("Payroll position catalog checks passed: workbook rates, hourly/daily modes, seniority tiers, and non-name suggestions are locked.");
