import assert from "node:assert/strict";
import { createStatementFinancialCommandService } from "../server/services/statementFinancialCommandService.mjs";

const calls = { payments: [], variances: [], writeOffs: [] };
const workspace = createWorkspace();
const service = createStatementFinancialCommandService({
  now: () => "2026-07-11T16:00:00.000Z",
  businessDecisionEvidenceService: {
    prepareDecision(input) {
      return {
        ok: true,
        record: { id: `BD-${input.decisionScope}`, businessDecisionId: `BD-${input.decisionScope}` },
        attachmentLinks: [],
      };
    },
    toProjection(record) { return record; },
  },
  findStatement(current, statementId) {
    return current.statements.find((item) => item.id === statementId) ?? null;
  },
  findAttachment(current, attachmentId) {
    return current.attachments.find((item) => item.attachmentId === attachmentId) ?? null;
  },
  confirmStatementPayment(statements, statement) {
    const next = { ...statement, received: 80, variance: 20, status: "差额待确认" };
    return {
      statements: statements.map((item) => (item.id === statement.id ? next : item)),
      todoInput: { id: "TODO-PAY", type: "收款差额待确认", ref: statement.id },
    };
  },
  confirmStatementVariance(statements, statement) {
    const next = { ...statement, status: "有欠款", variance: 20 };
    return { statements: statements.map((item) => (item.id === statement.id ? next : item)), todoInput: null };
  },
  confirmStatementWriteOff(statements, statement) {
    const next = { ...statement, status: "已确认欠款" };
    return { statements: statements.map((item) => (item.id === statement.id ? next : item)) };
  },
  getStatementWriteOffBlocker() {
    return "";
  },
  nextId(prefix, rows) {
    return `${prefix}-${rows.length + 1}`;
  },
  buildTodo(_current, input) {
    return { handled: false, ...input };
  },
  buildOperationLog(_current, input) {
    return { id: `LOG-${input.action}`, ...input };
  },
});

for (const [attachmentId, expectedCode] of [
  ["ATT-NOT-FOUND", "STATEMENT_PAYMENT_ATTACHMENT_NOT_FOUND"],
  ["ATT-WRONG-OWNER", "STATEMENT_PAYMENT_ATTACHMENT_OWNER_MISMATCH"],
  ["ATT-WRONG-PURPOSE", "STATEMENT_PAYMENT_ATTACHMENT_PURPOSE_MISMATCH"],
  ["ATT-MISSING-UPLOADER", "STATEMENT_PAYMENT_ATTACHMENT_UPLOADER_REQUIRED"],
  ["ATT-NO-CONTENT", "STATEMENT_PAYMENT_ATTACHMENT_INVALID"],
  ["ATT-INVALID", "STATEMENT_PAYMENT_ATTACHMENT_INVALID"],
]) {
  const blocked = await service.recordPayment({
    workspace,
    statementId: "ST-1",
    body: { amount: 80, attachmentIds: [attachmentId], expectedRevision: 1 },
    operatorId: "U-FINANCE",
  });
  assert.equal(blocked.code, expectedCode);
}

const payment = await service.recordPayment({
  workspace,
  statementId: "ST-1",
  body: {
    amount: 80,
    expectedRevision: 1,
    attachmentIds: ["ATT-PAY", "ATT-PAY"],
    operatorId: "U-SPOOFED",
    idempotencyKey: "payment-command-001",
  },
  operatorId: "U-FINANCE",
});
assert.equal(payment.response.payment.operatorId, "U-FINANCE");
assert.deepEqual(payment.response.payment.attachmentIds, ["ATT-PAY"]);
assert.equal(payment.response.statementRevision, 2);
assert.equal(calls.payments[0].idempotencyPayload.operatorId, "U-FINANCE");

const blockedVarianceAttachments = await service.handleVariance({
  workspace,
  statementId: "ST-1",
  body: {
    varianceAmount: 20,
    expectedRevision: 1,
    reason: "未收差额转欠款",
    attachmentIds: ["ATT-PAY", "ATT-PAY-2"],
  },
  operatorId: "U-FINANCE",
});
assert.equal(blockedVarianceAttachments.code, "STATEMENT_VARIANCE_ATTACHMENT_LIMIT");

const variance = await service.handleVariance({
  workspace,
  statementId: "ST-1",
  body: {
    varianceAmount: 9999,
    expectedRevision: 1,
    reason: "未收差额转欠款",
    attachmentIds: ["ATT-PAY"],
    operatorId: "U-SPOOFED",
  },
  operatorId: "U-FINANCE",
});
assert.equal(variance.response.varianceRecord.attachmentId, "ATT-PAY");
assert.equal(variance.response.varianceRecord.operatorId, "U-FINANCE");
assert.equal(variance.response.varianceRecord.amount, 20, "client varianceAmount must not override the statement amount");
assert.equal(variance.response.statementRevision, 2);

const blockedWriteOffAttachment = await service.writeOffStatement({
  workspace,
  statementId: "ST-1",
  body: { confirmReason: "确认转欠款", attachmentIds: ["ATT-PAY"], expectedRevision: 1 },
  operatorId: "U-FINANCE",
});
assert.equal(blockedWriteOffAttachment.code, "STATEMENT_WRITE_OFF_ATTACHMENT_UNSUPPORTED");

const writtenOff = await service.writeOffStatement({
  workspace,
  statementId: "ST-1",
  body: {
    confirmReason: "确认转欠款",
    operatorId: "U-SPOOFED",
    expectedRevision: 1,
    delegatedDecision: { evidenceAttachmentIds: ["ATT-PAY"] },
  },
  operatorId: "U-FINANCE",
});
assert.equal(writtenOff.response.status, "已确认欠款");
assert.equal(writtenOff.response.statementRevision, 2);
assert.equal(calls.writeOffs[0].operationLog.operatorId, "U-FINANCE");

console.log("Statement financial command service checks passed");

function createWorkspace() {
  const current = {
    statements: [{ id: "ST-1", customerId: "C-1", receivable: 100, received: 0, variance: 20, status: "差额待确认", revision: 1 }],
    paymentRecords: [],
    varianceRecords: [],
    todos: [],
    attachments: [
      attachment("ATT-PAY"),
      attachment("ATT-PAY-2"),
      attachment("ATT-WRONG-OWNER", { ownerId: "ST-OTHER" }),
      attachment("ATT-WRONG-PURPOSE", { purpose: "statement_customer_confirmation" }),
      attachment("ATT-MISSING-UPLOADER", { uploadedBy: "" }),
      attachment("ATT-NO-CONTENT", { hasContent: false }),
      attachment("ATT-INVALID", { fileType: "pdf", mimeType: "application/pdf" }),
    ],
  };
  current.statementPaymentTransactionRepository = {
    async recordStatementPayment(input) {
      calls.payments.push(input);
      return {
        payment: input.paymentRecord,
        todo: input.todo,
        operationLogId: input.operationLog.id,
      };
    },
  };
  current.statementSettlementTransactionRepository = {
    async handleStatementVariance(input) {
      calls.variances.push(input);
      return {
        varianceRecord: input.varianceRecord,
        todo: input.todo,
        businessDecision: input.decisionRecord,
        operationLogId: input.operationLog.id,
      };
    },
    async writeOffStatement(input) {
      calls.writeOffs.push(input);
      return {
        statement: input.statement,
        writeOffRecord: input.writeOffRecord,
        businessDecision: input.decisionRecord,
        operationLogId: input.operationLog.id,
      };
    },
  };
  return current;
}

function attachment(attachmentId, overrides = {}) {
  return {
    attachmentId,
    ownerType: "statement",
    ownerId: "ST-1",
    purpose: "payment_screenshot",
    uploadedBy: "U-OFFICE",
    status: "uploaded",
    hasContent: true,
    fileType: "image",
    mimeType: "image/png",
    ...overrides,
  };
}
