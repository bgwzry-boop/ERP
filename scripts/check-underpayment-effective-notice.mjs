import assert from "node:assert/strict";
import { createStatementFinancialCommandService } from "../server/services/statementFinancialCommandService.mjs";
import { createLocalStatementPaymentTransactionRepository } from "../server/statementPaymentTransactionRepository.mjs";
import { confirmStatementPayment, confirmStatementVariance, confirmStatementWriteOff, getStatementWriteOffBlocker } from "../src/state/officeStatementActions.js";
import { UNDERPAYMENT_EFFECTIVE_STATUS, UNDERPAYMENT_READ_AUDIENCES, UNDERPAYMENT_READ_TODO_TYPE } from "../shared/statementUnderpaymentNotice.js";

const recordedAt = "2026-10-24T02:00:00.000Z";
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

const open = { id: "ST-UNDER", customerId: "C-1", receivable: 100, received: 0, variance: 0, status: "已发送待回款", revision: 1 };
const missingReason = await service.recordPayment({
  workspace: workspace(open),
  statementId: open.id,
  operatorId: "U-OFFICE-A",
  body: { amount: 80, expectedRevision: 1, idempotencyKey: "underpay-no-reason" },
});
assert.equal(missingReason.code, "STATEMENT_UNDERPAYMENT_REASON_REQUIRED");

const current = workspace(open);
const payment = await service.recordPayment({
  workspace: current,
  statementId: open.id,
  operatorId: "U-OFFICE-A",
  body: { amount: 80, expectedRevision: 1, idempotencyKey: "underpay-80", remark: "客户少付，先登记" },
});
assert.equal(payment.response.statementStatus, UNDERPAYMENT_EFFECTIVE_STATUS);
assert.equal(current.statements[0].received, 80);
assert.equal(current.statements[0].variance, 20);
assert.equal(current.statements[0].status, UNDERPAYMENT_EFFECTIVE_STATUS);
assert.equal(current.paymentRecords[0].amount, 80);
assert.equal(current.paymentRecords[0].status, "recorded");
assert.equal(current.varianceRecords.length, 1);
assert.equal(current.varianceRecords[0].amount, 20);
assert.equal(current.varianceRecords[0].status, "已生效");
assert.equal(current.varianceRecords[0].handlingResult, "少付已登记");
assert.equal(current.varianceRecords[0].operatorId, "U-OFFICE-A");
assert.deepEqual(payment.response.readNoticeIds.length, 3);
assert.deepEqual(current.todos.map((todo) => todo.audience).sort(), [...UNDERPAYMENT_READ_AUDIENCES].sort());
for (const audience of UNDERPAYMENT_READ_AUDIENCES) {
  const notice = current.todos.find((todo) => todo.audience === audience);
  assert.equal(notice.type, UNDERPAYMENT_READ_TODO_TYPE);
  assert.equal(notice.handled, false);
  assert.match(notice.summary, new RegExp(`待阅·${audience}`));
  assert.match(notice.summary, /操作人 U-OFFICE-A/);
  assert.match(notice.summary, /少付差额 20/);
  assert.match(notice.summary, /原因 客户少付，先登记/);
  assert.match(notice.summary, new RegExp(recordedAt));
  assert.match(notice.summary, /知晓不改变已登记金额/);
}
const beforeAck = { received: current.statements[0].received, variance: current.statements[0].variance, status: current.statements[0].status };
current.todos.forEach((todo) => { todo.handled = true; });
assert.deepEqual({ received: current.statements[0].received, variance: current.statements[0].variance, status: current.statements[0].status }, beforeAck);

const silent = workspace({ ...current.statements[0], revision: 2 });
const blockedClear = await service.recordPayment({
  workspace: silent,
  statementId: open.id,
  operatorId: "U-OFFICE-A",
  body: { amount: 100, expectedRevision: 2, idempotencyKey: "clear-without-notice", remark: "补齐" },
});
assert.equal(blockedClear.code, "STATEMENT_UNDERPAYMENT_NOTICE_REQUIRED");
assert.equal(silent.statements[0].variance, 20);
const blockedVariance = await service.handleVariance({
  workspace: silent,
  statementId: open.id,
  operatorId: "U-OFFICE-A",
  body: { expectedRevision: 2, reason: "抹零/减免已审批" },
});
assert.equal(blockedVariance.code, "STATEMENT_UNDERPAYMENT_NOTICE_REQUIRED");
const blockedWriteOff = await service.writeOffStatement({
  workspace: silent,
  statementId: open.id,
  operatorId: "U-OFFICE-A",
  body: { expectedRevision: 2, confirmReason: "清掉差额" },
});
assert.equal(blockedWriteOff.code, "STATEMENT_UNDERPAYMENT_NOTICE_REQUIRED");

silent.todos = structuredClone(current.todos);
const allowed = await service.handleVariance({
  workspace: silent,
  statementId: open.id,
  operatorId: "U-FINANCE",
  body: { expectedRevision: 2, reason: "未收差额转欠款" },
});
assert.notEqual(allowed.code, "STATEMENT_UNDERPAYMENT_NOTICE_REQUIRED");
assert.equal(allowed.response.varianceRecord.operatorId, "U-FINANCE");
assert.equal(silent.statements[0].variance, 20, "待阅之后的差额处理仍保留已登记差额，不把它悄悄清成零");

console.log("Underpayment checks passed: immediate received and variance, three to-read notices, acknowledgement does not change amounts, silent clear is rejected.");
