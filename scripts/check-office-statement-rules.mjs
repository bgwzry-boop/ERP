import assert from "node:assert/strict";
import { getStatementFinancialSummary, money } from "../src/domain/officeRules.js";

const customers = [
  { id: "C-CURRENT", debt: 8_800 },
  { id: "C-SNAPSHOT", debt: 1_200, debtAmountSnapshot: 5_300 },
];

assert.deepEqual(
  getStatementFinancialSummary(
    { customerId: "C-CURRENT", receivable: 108_000, received: 80_000 },
    customers,
  ),
  {
    currentReceivable: 108_000,
    currentReceived: 80_000,
    currentUnpaid: 28_000,
    historicalDebt: 8_800,
    cumulativeDebt: 36_800,
  },
);

assert.equal(money(43.25), "¥43.25");
assert.deepEqual(
  getStatementFinancialSummary({ customerId: "C-MISSING", receivable: 100, received: 20 }, customers),
  {
    currentReceivable: 100,
    currentReceived: 20,
    currentUnpaid: 80,
    historicalDebt: 0,
    cumulativeDebt: 80,
  },
);

assert.deepEqual(
  getStatementFinancialSummary(
    { customerId: "C-SNAPSHOT", receivable: 1_510, received: 2_000 },
    customers,
  ),
  {
    currentReceivable: 1_510,
    currentReceived: 2_000,
    currentUnpaid: 0,
    historicalDebt: 5_300,
    cumulativeDebt: 5_300,
  },
);

assert.deepEqual(getStatementFinancialSummary(null, customers), {
  currentReceivable: 0,
  currentReceived: 0,
  currentUnpaid: 0,
  historicalDebt: 0,
  cumulativeDebt: 0,
});

assert.deepEqual(
  getStatementFinancialSummary({ customerId: "C-CURRENT", receivable: "invalid", received: -20 }, customers),
  {
    currentReceivable: 0,
    currentReceived: 0,
    currentUnpaid: 0,
    historicalDebt: 8_800,
    cumulativeDebt: 8_800,
  },
);

console.log("Office statement rules check passed: current-period and historical debt amounts remain separate.");
