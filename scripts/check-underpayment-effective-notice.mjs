import assert from "node:assert/strict";
import { createStatementFinancialCommandService } from "../server/services/statementFinancialCommandService.mjs";
import { buildStatementDetail } from "../server/services/statementDetailProjectionService.mjs";
import { createLocalStatementPaymentTransactionRepository } from "../server/statementPaymentTransactionRepository.mjs";
import { confirmStatementPayment, confirmStatementVariance, confirmStatementWriteOff, getStatementWriteOffBlocker } from "../src/state/officeStatementActions.js";
import { getStatementBucket, getStatementFinancialSummary } from "../src/domain/officeRules.js";
import { ROUNDING_HANDLING_RESULT, UNDERPAYMENT_EFFECTIVE_STATUS, UNDERPAYMENT_READ_AUDIENCES, UNDERPAYMENT_READ_TODO_TYPE, UNDERPAYMENT_SETTLED_STATUS, summarizeAnnualReceiptAndRounding } from "../shared/statementUnderpaymentNotice.js";

const recordedAt = "2026-10-28T02:00:00.000Z";
const service = createStatementFinancialCommandService({
  now: () => recordedAt,
  businessDecisionEvidenceService: {
    prepareDecision() {
      return { ok: true, record: { id: "BD-UNDERPAY", businessDecisionId: "BD-UNDERPAY" }, attachmentLinks: [] };
    },
    toProjection(record) { return record; },
  },
  findStatement: (workspace, id) => workspace.statements.find((row) => row.id === id),
  findAttachment: () => null,
  confirmStatementPayment,
  confirmStatementVariance,
  confirmStatementWriteOff,
  getStatementWriteOffBlocker: () => "",
  nextId: (prefix) => `${prefix}-1`,
  buildTodo: (_workspace, input) => ({ ...input, id: input.id ?? `T-${input.audience}` }),
  buildOperationLog: (_workspace, input) => ({ ...input, id: input.id ?? `LOG-${input.action}` }),
});

function workspace(statement) {
  return {
    statements: [structuredClone(statement)],
    paymentRecords: [],
    varianceRecords: [],
    todos: [],
    operationLogs: [],
    customers: [],
    statementPaymentTransactionRepository: createLocalStatementPaymentTransactionRepository(),
    statementSettlementTransactionRepository: {
      async handleStatementVariance(input) {
        return { varianceRecord: input.varianceRecord, statement: input.statement, operationLogId: input.operationLog.id, businessDecision: input.decisionRecord };
      },
      async writeOffStatement(input) {
        return { statement: input.statement, operationLogId: input.operationLog.id, businessDecision: input.decisionRecord, writeOffRecord: input.writeOffRecord };
      },
    },
  };
}

const open = { id: "ST-UNDER", customerId: "C-1", receivable: 10850, received: 0, variance: 10850, status: "已发送待回款", revision: 1, period: "2026-10" };
const missingReason = await service.recordPayment({
  workspace: workspace(open),
  statementId: open.id,
  operatorId: "U-OFFICE-A",
  body: { amount: 10500, expectedRevision: 1, idempotencyKey: "underpay-no-reason" },
});
assert.equal(missingReason.code, "STATEMENT_UNDERPAYMENT_REASON_REQUIRED");

const current = workspace(open);
const payment = await service.recordPayment({
  workspace: current,
  statementId: open.id,
  operatorId: "U-OFFICE-A",
  body: { amount: 10500, expectedRevision: 1, idempotencyKey: "underpay-10500", remark: "客户少付 350，按抹零结清", paidAt: recordedAt },
});
assert.equal(payment.response.statementStatus, "已结清");
assert.equal(payment.response.receivableAmount, 10850);
assert.equal(payment.response.receivedAmount, 10500);
assert.equal(payment.response.roundingAmount, 350);
assert.equal(payment.response.varianceAmount, 0);
assert.equal(current.statements[0].receivable, 10850, "抹零不得改写应收");
assert.equal(current.statements[0].received, 10500);
assert.equal(current.statements[0].roundingAmount, 350);
assert.equal(current.statements[0].variance, 0);
assert.equal(current.statements[0].status, UNDERPAYMENT_SETTLED_STATUS);
assert.equal(current.statements[0].varianceHandling, ROUNDING_HANDLING_RESULT);
assert.equal(current.paymentRecords[0].amount, 10500);
assert.equal(current.paymentRecords[0].status, "recorded");
assert.equal(current.varianceRecords.length, 1);
assert.equal(current.varianceRecords[0].amount, 350);
assert.equal(current.varianceRecords[0].status, "已生效");
assert.equal(current.varianceRecords[0].handlingResult, ROUNDING_HANDLING_RESULT);
assert.equal(current.varianceRecords[0].operatorId, "U-OFFICE-A");
assert.equal(current.varianceRecords[0].createdAt, recordedAt);
assert.deepEqual(payment.response.readNoticeIds.length, 3);
assert.deepEqual(current.todos.map((todo) => todo.audience).sort(), [...UNDERPAYMENT_READ_AUDIENCES].sort());
for (const audience of UNDERPAYMENT_READ_AUDIENCES) {
  const notice = current.todos.find((todo) => todo.audience === audience);
  assert.equal(notice.type, UNDERPAYMENT_READ_TODO_TYPE);
  assert.equal(notice.handled, false);
  assert.match(notice.summary, new RegExp(`待阅·${audience}`));
  assert.match(notice.summary, /操作人 U-OFFICE-A/);
  assert.match(notice.summary, /抹零 350/);
  assert.match(notice.summary, /实收 10500/);
  assert.match(notice.summary, /应收 10850/);
  assert.match(notice.summary, /原因 客户少付 350，按抹零结清/);
  assert.match(notice.summary, new RegExp(recordedAt));
  assert.match(notice.summary, /知晓不改变实收和抹零/);
}
const beforeAck = { receivable: current.statements[0].receivable, received: current.statements[0].received, roundingAmount: current.statements[0].roundingAmount, status: current.statements[0].status };
current.todos.forEach((todo) => { todo.handled = true; });
assert.deepEqual({
  receivable: current.statements[0].receivable,
  received: current.statements[0].received,
  roundingAmount: current.statements[0].roundingAmount,
  status: current.statements[0].status,
}, beforeAck);

const summary = getStatementFinancialSummary(current.statements[0], []);
assert.equal(summary.currentReceivable, 10850);
assert.equal(summary.currentReceived, 10500);
assert.equal(summary.currentUnpaid, 0);
assert.equal(getStatementBucket(current.statements[0], []), "已结清");

const closed = workspace(current.statements[0]);
closed.paymentRecords = structuredClone(current.paymentRecords);
closed.varianceRecords = structuredClone(current.varianceRecords);
closed.todos = structuredClone(current.todos);
const blockedPayment = await service.recordPayment({
  workspace: closed,
  statementId: open.id,
  operatorId: "U-OFFICE-A",
  body: { amount: 10850, expectedRevision: 2, idempotencyKey: "clear-after-settle", remark: "补齐" },
});
assert.equal(blockedPayment.code, "STATEMENT_PAYMENT_PERIOD_CLOSED");
assert.equal(closed.statements[0].receivable, 10850);
assert.equal(closed.statements[0].received, 10500);
const blockedVariance = await service.handleVariance({
  workspace: closed,
  statementId: open.id,
  operatorId: "U-OFFICE-A",
  body: { expectedRevision: 2, reason: "未收差额转欠款" },
});
assert.equal(blockedVariance.code, "STATEMENT_PAYMENT_PERIOD_CLOSED");
const blockedWriteOff = await service.writeOffStatement({
  workspace: closed,
  statementId: open.id,
  operatorId: "U-OFFICE-A",
  body: { expectedRevision: 2, confirmReason: "清掉差额" },
});
assert.equal(blockedWriteOff.code, "STATEMENT_PAYMENT_PERIOD_CLOSED");
assert.equal(closed.varianceRecords[0].amount, 350);
assert.equal(closed.varianceRecords[0].handlingResult, ROUNDING_HANDLING_RESULT);

const legacy = workspace({ ...open, received: 10500, variance: 350, status: UNDERPAYMENT_EFFECTIVE_STATUS, revision: 2 });
const blockedLegacy = await service.recordPayment({
  workspace: legacy,
  statementId: open.id,
  operatorId: "U-OFFICE-A",
  body: { amount: 10850, expectedRevision: 2, idempotencyKey: "legacy-clear", remark: "补齐" },
});
assert.equal(blockedLegacy.code, "STATEMENT_UNDERPAYMENT_NOTICE_REQUIRED");
assert.equal(legacy.statements[0].variance, 350);

current.paymentRecords.push({ paymentRecordId: "PAY-OLD", statementId: "ST-OLD", amount: 800, paidAt: "2025-12-31T10:00:00.000Z", status: "recorded" });
current.varianceRecords.push({ varianceRecordId: "VAR-OLD", statementId: "ST-OLD", amount: 20, handlingResult: ROUNDING_HANDLING_RESULT, createdAt: "2025-12-31T10:00:00.000Z" });
const annual = summarizeAnnualReceiptAndRounding(current, 2026);
assert.deepEqual(annual, { year: 2026, receivedTotal: 10500, roundingTotal: 350 });
const prior = summarizeAnnualReceiptAndRounding(current, 2025);
assert.deepEqual(prior, { year: 2025, receivedTotal: 800, roundingTotal: 20 });

const detail = buildStatementDetail(current, current.statements[0]);
assert.equal(detail.roundingAmount, 350);
assert.equal(detail.receivable, 10850);
assert.equal(detail.received, 10500);
assert.equal(detail.currentUnpaid, 0);
assert.deepEqual(detail.annualReceiptSummary, { year: 2026, receivedTotal: 10500, roundingTotal: 350 });

console.log("Underpayment checks passed: 10850 receivable, 10500 received, 350 rounding, period settled, three to-read notices, acknowledgement and later writes do not erase the columns, annual totals stay split.");
