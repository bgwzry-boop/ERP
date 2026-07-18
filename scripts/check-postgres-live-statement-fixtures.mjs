import assert from "node:assert/strict";
import {
  buildAccessLog,
  buildAttachment,
  buildOperationLog,
  buildPaymentRecord,
  buildSendRecord,
  buildStatement,
  buildStatementExportFile,
  buildStatementExportLines,
  buildTodo,
  buildVarianceRecord,
} from "./helpers/postgresLiveStatementFixtures.mjs";

const attachment = buildAttachment({
  attachmentId: "ATT-FIXTURE-001",
  ownerId: "ST-FIXTURE-001",
  uploadedBy: "U-FINANCE-001",
});
assert.equal(attachment.ownerType, "statement");
assert.equal(attachment.ownerId, "ST-FIXTURE-001");
assert.equal(attachment.storageKey, "attachments/ATT-FIXTURE-001/payment-proof-postgres-live.png");
assert.equal(attachment.contentDigest.length, 64);

const accessLog = buildAccessLog({
  logId: "ALOG-FIXTURE-001",
  attachmentId: attachment.attachmentId,
  operatorId: "U-FINANCE-001",
  operationLogId: "OP-FIXTURE-001",
});
assert.equal(accessLog.storageKey, attachment.storageKey);
assert.equal(accessLog.action, "attachment_content_read");

const payment = buildPaymentRecord({
  paymentRecordId: "PAY-FIXTURE-001",
  statementId: "ST-FIXTURE-001",
  customerId: "C-FIXTURE-001",
  operatorId: "U-FINANCE-001",
  amount: 320,
});
assert.equal(payment.amount, 320);
assert.deepEqual(payment.attachmentIds, ["ATT-PAY-LIVE-001"]);

const statement = buildStatement({
  id: payment.statementId,
  customerId: payment.customerId,
  status: "差额待确认",
  received: payment.amount,
  variance: 20,
  revision: 2,
});
assert.equal(statement.receivable, 273);
assert.equal(statement.received, payment.amount);
assert.equal(statement.variance, 20);
assert.equal(statement.revision, 2);

const todo = buildTodo({ todoId: "TODO-FIXTURE-001", statementId: statement.id });
assert.equal(todo.customerId, "C-LIVE-REPO");
assert.equal(todo.ref, statement.id);
assert.equal(todo.type, "收款差额待确认");

const operationLog = buildOperationLog({
  logId: "OP-FIXTURE-001",
  action: "handle_statement_variance",
  before: { ...statement, status: "差额待确认" },
  after: { ...statement, status: "有欠款" },
});
assert.equal(operationLog.targetType, "statement");
assert.equal(operationLog.targetId, statement.id);
assert.equal(operationLog.reason, "未收差额转欠款");
assert.equal(operationLog.operatorId, "U-FINANCE-A");

const variance = buildVarianceRecord({
  varianceRecordId: "VAR-FIXTURE-001",
  statementId: payment.statementId,
  amount: 20,
  operatorId: payment.operatorId,
});
assert.equal(variance.handlingResult, "carry_to_debt");
assert.equal(variance.amount, 20);

const exportFile = buildStatementExportFile({
  statementId: payment.statementId,
  downloadToken: "EXPORT-FIXTURE-001",
  operationLogId: "OP-EXPORT-FIXTURE-001",
});
assert.equal(exportFile.exportFileId, exportFile.downloadToken);
assert.equal(Buffer.from(exportFile.content, "base64").toString("utf8"), "Postgres Export Live XLSX");

const exportLines = buildStatementExportLines({
  statementId: payment.statementId,
  orderLineId: "OL-FIXTURE-001",
  fulfillmentId: "F-FIXTURE-001",
});
assert.equal(exportLines.length, 1);
assert.equal(exportLines[0].finalAmount, 273);

const send = buildSendRecord({
  sendRecordId: "SEND-FIXTURE-001",
  statementId: payment.statementId,
  exportFileId: exportFile.exportFileId,
  operatorId: payment.operatorId,
});
assert.equal(send.exportFileId, exportFile.exportFileId);
assert.equal(send.receiptStatus, "pending");

console.log("PostgreSQL live statement fixture checks passed: attachment, statement, payment, todo, operation log, variance, export, and send records are stable.");
