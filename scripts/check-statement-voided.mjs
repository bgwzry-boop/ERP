import assert from "node:assert/strict";
import { getStatementCustomers } from "../server/seedData.mjs";
import { buildStatementDetail } from "../server/services/statementDetailProjectionService.mjs";
import { getStatementBlockingAmount, getStatementBucket, statementMatchesFilters } from "../src/domain/officeRules.js";
import { mapLocalStatementCustomerSummary, mapStatementCustomerSummaryToLocal } from "../src/services/officeStatementSelectors.js";
import { createStatementFinancialCommandService } from "../server/services/statementFinancialCommandService.mjs";
import { validateExactPaymentEvidence } from "../server/services/statementExactPaymentPolicy.mjs";
import { createLocalStatementPaymentTransactionRepository } from "../server/statementPaymentTransactionRepository.mjs";
import { createLocalStatementSettlementTransactionRepository } from "../server/statementSettlementTransactionRepository.mjs";
import { createLocalStatementSendTransactionRepository } from "../server/statementSendTransactionRepository.mjs";

const mustNotRun = () => assert.fail("A voided bill must be rejected before financial mutation or decision creation.");
const service = createStatementFinancialCommandService({
  businessDecisionEvidenceService: { prepareDecision: mustNotRun },
  findStatement: (workspace, id) => workspace.statements.find(row => row.id === id),
  findAttachment: mustNotRun, buildOperationLog: mustNotRun, buildTodo: mustNotRun,
  confirmStatementPayment: mustNotRun, confirmStatementVariance: mustNotRun,
  confirmStatementWriteOff: mustNotRun, getStatementWriteOffBlocker: mustNotRun, nextId: mustNotRun,
});

for (const status of ["已作废", "作废"]) {
  for (const receivable of [0, 273]) {
    const statement = { id: "ST-VOID", customerId: "C-VOID", status, receivable, received: 0,
      variance: receivable, revision: 3, lineIds: [] };
    const workspace = { customers: [{ id: "C-VOID", name: "作废回归客户", debt: 50 }], statements: [statement],
      statementLines: [], paymentRecords: [], varianceRecords: [], statementWriteOffRecords: [],
      statementSendRecords: [], statementConfirmationRecords: [], operationLogs: [], todos: [] };
    const snapshot = structuredClone(workspace);
    const summary = getStatementCustomers(workspace)[0];
    assert.equal(summary.status, "voided");
    assert.equal(summary.currentReceivable, receivable, "Current stored bill amount is retained, never inferred as its pre-void amount.");
    assert.equal(summary.currentUnpaid, 0);
    assert.equal(summary.varianceAmount, 0);
    assert.equal(summary.cumulativeDebt, 50, "Voided bill adds nothing to the independent historical debt.");
    assert.equal(summary.paymentPending, false);
    assert.equal(mapLocalStatementCustomerSummary(statement).status, "voided");
    assert.equal(mapLocalStatementCustomerSummary(statement).currentUnpaid, 0);
    assert.equal(mapLocalStatementCustomerSummary(statement).varianceAmount, 0);
    assert.equal(mapStatementCustomerSummaryToLocal(summary).status, "已作废");
    assert.equal(buildStatementDetail(workspace, statement).status, status);
    assert.equal(buildStatementDetail(workspace, statement).currentUnpaid, 0);
    assert.equal(getStatementBucket(statement, workspace.customers), "已作废");
    assert.equal(getStatementBlockingAmount(statement), 0);
    for (const bucket of ["默认待处理", "本期待对账", "欠款/差额", "收款待确认", "已结清"]) {
      assert.equal(statementMatchesFilters(statement, { query: "", status: bucket }, workspace.customers), false, bucket);
    }
    for (const bucket of ["全部", "已作废"]) {
      assert.equal(statementMatchesFilters(statement, { query: "", status: bucket }, workspace.customers), true, bucket);
    }
    for (const command of ["recordPayment", "handleVariance", "writeOffStatement"]) {
      const result = await service[command]({ workspace, statementId: statement.id, operatorId: "U-FINANCE",
        body: { expectedRevision: 3, amount: 273, handlingResult: "carry_to_debt" } });
      assert.equal(result.code, "STATEMENT_PAYMENT_PERIOD_CLOSED", command);
      assert.equal(result.statusCode, 409);
    }
    assert.throws(() => validateExactPaymentEvidence(workspace, statement, {}, "U-FINANCE"),
      error => error.code === "STATEMENT_PAYMENT_PERIOD_CLOSED");

    // A stale caller must also fail at the actual repository boundary, even with the current revision.
    const input = { workspace, statement: { ...statement, status: "收款待确认", received: 273 },
      statements: [{ ...statement, status: "收款待确认", received: 273 }],
      paymentRecord: { paymentRecordId: "PAY-VOID", statementId: statement.id, amount: 273 },
      sendRecord: { sendRecordId: "SEND-VOID", statementId: statement.id },
      operationLog: { id: "LOG-VOID", targetType: "statement", targetId: statement.id, operatorId: "U-FINANCE" } };
    const settlement = createLocalStatementSettlementTransactionRepository();
    for (const run of [
      () => createLocalStatementPaymentTransactionRepository().recordStatementPayment(input),
      () => settlement.handleStatementVariance(input),
      () => settlement.writeOffStatement(input),
    ]) assert.throws(run, error => error.code === "STATEMENT_PAYMENT_PERIOD_CLOSED");
    const communication = createLocalStatementSendTransactionRepository();
    for (const run of [
      () => communication.markStatementSent(input),
      () => communication.recordStatementCustomerConfirmation(input),
    ]) assert.throws(run, error => error.code === "BUSINESS_WRITE_CONFLICT");
    assert.deepEqual(workspace, snapshot, "Blocked commands leave the bill, evidence, payments and logs intact.");
  }
}

const active = { id: "ST-ACTIVE", customerId: "C-ACTIVE", status: "待生成", receivable: 273, received: 0, variance: 0 };
assert.equal(getStatementCustomers({ statements: [active], customers: [] })[0].currentUnpaid, 273);
assert.equal(getStatementBucket(active, []), "本期待对账", "An active unpaid bill is still actionable.");
console.log("PASS voided bill status, current stored amount, zero active debt, task filtering, financial service guards and repository anti-revival guards; source history remains intact.");
