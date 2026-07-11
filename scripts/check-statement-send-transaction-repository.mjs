import assert from "node:assert/strict";
import {
  buildMarkStatementSendReceiptTransactionQuery,
  buildMarkStatementSendReceiptTransactionSql,
  buildMarkStatementSentTransactionQuery,
  buildMarkStatementSentTransactionSql,
  buildRecordStatementCustomerConfirmationTransactionQuery,
  buildRecordStatementCustomerConfirmationTransactionSql,
  createLocalStatementSendTransactionRepository,
  createPostgresStatementSendTransactionRepository,
} from "../server/statementSendTransactionRepository.mjs";

await checkLocalStatementSendTransactionRepository();
await checkPostgresStatementSendTransactionSqlBoundary();
await checkLocalStatementSendReceiptTransactionRepository();
await checkPostgresStatementSendReceiptTransactionSqlBoundary();
await checkLocalStatementCustomerConfirmationTransactionRepository();
await checkPostgresStatementCustomerConfirmationTransactionSqlBoundary();
await checkPostgresStatementCommunicationIdempotencyBoundary();

console.log(
  "Statement send transaction repository check passed: local workspace mutation, customer confirmation, and PostgreSQL transaction SQL are covered.",
);

async function checkLocalStatementSendTransactionRepository() {
  const repository = createLocalStatementSendTransactionRepository();
  const before = buildStatement({ status: "待生成" });
  const after = buildStatement({ status: "已发送待回款", lastSentAt: "2026-07-01T10:30:00.000Z" });
  const workspace = {
    statements: [before],
    statementSendRecords: [],
    operationLogs: [],
  };

  const transaction = await repository.markStatementSent({
    workspace,
    statements: [after],
    statement: after,
    sendRecord: buildSendRecord(),
    operationLog: buildOperationLog({ before, after }),
  });

  assert.equal(transaction.statement.status, "已发送待回款");
  assert.equal(transaction.sendRecord.sendRecordId, "SEND-TXN-001");
  assert.equal(workspace.statements[0].status, "已发送待回款");
  assert.equal(workspace.statementSendRecords.length, 1);
  assert.equal(workspace.operationLogs.length, 1);
}

async function checkPostgresStatementSendTransactionSqlBoundary() {
  const calls = [];
  const before = buildStatement({ status: "待生成" });
  const after = buildStatement({ status: "已发送待回款", lastSentAt: "2026-07-01T10:30:00.000Z" });
  const sendRecord = buildSendRecord();
  const operationLog = buildOperationLog({ before, after });
  const repository = createPostgresStatementSendTransactionRepository({
    postgresClient: {
      transactionJson(text, values) {
        calls.push({ text, values });
        return {
          statement: { ...after, revision: 2 },
          sendRecord,
          operationLogId: operationLog.id,
        };
      },
    },
  });
  const workspace = {
    statements: [before],
    statementSendRecords: [],
    operationLogs: [],
  };

  const transaction = await repository.markStatementSent({
    workspace,
    statements: [after],
    statement: after,
    sendRecord,
    operationLog,
  });

  assert.equal(transaction.sendRecord.exportFileId, "DL-ST-TXN-001-CUSTOMER");
  assert.equal(workspace.statements[0].revision, 2);
  assert.match(calls[0].text, /^BEGIN;/);
  assert.match(calls[0].text, /UPDATE statements/);
  assert.match(calls[0].text, /locked_statement AS MATERIALIZED/);
  assert.match(calls[0].text, /revision = statements\.revision \+ 1/);
  assert.match(calls[0].text, /ERP_STATEMENT_CONCURRENCY_CONFLICT/);
  assert.match(calls[0].text, /last_sent_at/);
  assert.match(calls[0].text, /INSERT INTO statement_send_records/);
  assert.match(calls[0].text, /INSERT INTO operation_logs/);
  assert.match(calls[0].text, /COMMIT;/);
  assert.match(calls[0].text, /\$\d+::text/);
  assert.ok(calls[0].values.includes("DL-ST-TXN-001-CUSTOMER"));

  const query = buildMarkStatementSentTransactionQuery({
    statement: after,
    sendRecord: { ...sendRecord, includePaymentQr: true },
    operationLog,
  });
  assert.match(query.text, /\$\d+::boolean/);
  assert.match(query.text, /export_file_id/);
  assert.ok(query.values.includes(true));
  assert.equal(
    query.text,
    buildMarkStatementSentTransactionSql({ statement: after, sendRecord: { ...sendRecord, includePaymentQr: true }, operationLog }),
  );
}

async function checkLocalStatementSendReceiptTransactionRepository() {
  const repository = createLocalStatementSendTransactionRepository();
  const sendRecord = buildSendRecord();
  const receiptRecord = { ...sendRecord, receiptStatus: "read", receiptAt: "2026-07-01T11:00:00.000Z", receiptBy: "U-OFFICE-A", receiptNote: "客户微信已读" };
  const workspace = {
    statements: [],
    statementSendRecords: [sendRecord],
    operationLogs: [],
  };

  const transaction = await repository.markStatementSendReceipt({
    workspace,
    sendRecord: receiptRecord,
    operationLog: buildReceiptOperationLog({ before: sendRecord, after: receiptRecord }),
  });

  assert.equal(transaction.sendRecord.receiptStatus, "read");
  assert.equal(workspace.statementSendRecords[0].receiptStatus, "read");
  assert.equal(workspace.statementSendRecords[0].receiptNote, "客户微信已读");
  assert.equal(workspace.operationLogs[0].action, "mark_statement_send_receipt");
}

async function checkPostgresStatementSendReceiptTransactionSqlBoundary() {
  const calls = [];
  const sendRecord = buildSendRecord();
  const receiptRecord = { ...sendRecord, receiptStatus: "confirmed", receiptAt: "2026-07-01T11:10:00.000Z", receiptBy: "U-OFFICE-A", receiptNote: "客户确认 O'Brien 金额无误" };
  const operationLog = buildReceiptOperationLog({ before: sendRecord, after: receiptRecord });
  const repository = createPostgresStatementSendTransactionRepository({
    postgresClient: {
      transactionJson(text, values) {
        calls.push({ text, values });
        return {
          sendRecord: receiptRecord,
          operationLogId: operationLog.id,
        };
      },
    },
  });
  const workspace = {
    statements: [],
    statementSendRecords: [sendRecord],
    operationLogs: [],
  };

  const transaction = await repository.markStatementSendReceipt({
    workspace,
    sendRecord: receiptRecord,
    operationLog,
  });

  assert.equal(transaction.sendRecord.receiptStatus, "confirmed");
  assert.match(calls[0].text, /^BEGIN;/);
  assert.match(calls[0].text, /UPDATE statement_send_records/);
  assert.match(calls[0].text, /locked_send_record AS MATERIALIZED/);
  assert.match(calls[0].text, /revision = statement_send_records\.revision \+ 1/);
  assert.match(calls[0].text, /ERP_STATEMENT_SEND_RECORD_CONCURRENCY_CONFLICT/);
  assert.match(calls[0].text, /receipt_status/);
  assert.match(calls[0].text, /receipt_note/);
  assert.match(calls[0].text, /INSERT INTO operation_logs/);
  assert.match(calls[0].text, /COMMIT;/);
  assert.doesNotMatch(calls[0].text, /O''Brien/);
  assert.ok(calls[0].values.includes("客户确认 O'Brien 金额无误"));

  const query = buildMarkStatementSendReceiptTransactionQuery({
    sendRecord: receiptRecord,
    operationLog,
  });
  assert.match(query.text, /\$\d+::text/);
  assert.ok(query.values.includes("confirmed"));
  assert.equal(query.text, buildMarkStatementSendReceiptTransactionSql({ sendRecord: receiptRecord, operationLog }));
}

async function checkLocalStatementCustomerConfirmationTransactionRepository() {
  const repository = createLocalStatementSendTransactionRepository();
  const before = buildStatement({ status: "已发送待回款", lastSentAt: "2026-07-01T10:30:00.000Z" });
  const afterStatement = buildStatement({ status: "客户已确认", lastSentAt: "2026-07-01T10:30:00.000Z" });
  const sendRecord = buildSendRecord();
  const confirmedSendRecord = {
    ...sendRecord,
    receiptStatus: "confirmed",
    receiptAt: "2026-07-01T11:20:00.000Z",
    receiptBy: "U-OFFICE-A",
    receiptNote: "客户回复确认无误",
  };
  const confirmationRecord = buildConfirmationRecord();
  const operationLog = buildConfirmationOperationLog({
    before: { statement: before, sendRecord },
    after: { statement: afterStatement, sendRecord: confirmedSendRecord, confirmationRecord },
  });
  const workspace = {
    statements: [before],
    statementSendRecords: [sendRecord],
    statementConfirmationRecords: [],
    operationLogs: [],
  };

  const transaction = await repository.recordStatementCustomerConfirmation({
    workspace,
    statements: [afterStatement],
    statement: afterStatement,
    sendRecord: confirmedSendRecord,
    confirmationRecord,
    operationLog,
  });

  assert.equal(transaction.statement.status, "客户已确认");
  assert.equal(transaction.sendRecord.receiptStatus, "confirmed");
  assert.equal(transaction.confirmationRecord.confirmationRecordId, "SCONF-TXN-001");
  assert.equal(workspace.statements[0].status, "客户已确认");
  assert.equal(workspace.statementSendRecords[0].receiptStatus, "confirmed");
  assert.equal(workspace.statementConfirmationRecords[0].content, "客户回复确认无误");
  assert.equal(workspace.operationLogs[0].action, "record_statement_customer_confirmation");
}

async function checkPostgresStatementCustomerConfirmationTransactionSqlBoundary() {
  const calls = [];
  const before = buildStatement({ status: "已发送待回款", lastSentAt: "2026-07-01T10:30:00.000Z" });
  const afterStatement = buildStatement({ status: "客户已确认", lastSentAt: "2026-07-01T10:30:00.000Z" });
  const sendRecord = buildSendRecord();
  const confirmedSendRecord = {
    ...sendRecord,
    receiptStatus: "confirmed",
    receiptAt: "2026-07-01T11:20:00.000Z",
    receiptBy: "U-OFFICE-A",
    receiptNote: "客户回复确认无误",
  };
  const confirmationRecord = buildConfirmationRecord();
  const operationLog = buildConfirmationOperationLog({
    before: { statement: before, sendRecord },
    after: { statement: afterStatement, sendRecord: confirmedSendRecord, confirmationRecord },
  });
  const repository = createPostgresStatementSendTransactionRepository({
    postgresClient: {
      transactionJson(text, values) {
        calls.push({ text, values });
        return {
          statement: afterStatement,
          sendRecord: confirmedSendRecord,
          confirmationRecord,
          operationLogId: operationLog.id,
        };
      },
    },
  });
  const workspace = {
    statements: [before],
    statementSendRecords: [sendRecord],
    statementConfirmationRecords: [],
    operationLogs: [],
  };

  const transaction = await repository.recordStatementCustomerConfirmation({
    workspace,
    statements: [afterStatement],
    statement: afterStatement,
    sendRecord: confirmedSendRecord,
    confirmationRecord,
    operationLog,
  });

  assert.equal(transaction.confirmationRecord.content, "客户回复确认无误");
  assert.match(calls[0].text, /^BEGIN;/);
  assert.match(calls[0].text, /UPDATE statements/);
  assert.match(calls[0].text, /UPDATE statement_send_records/);
  assert.match(calls[0].text, /locked_statement AS MATERIALIZED/);
  assert.match(calls[0].text, /locked_send_record AS MATERIALIZED/);
  assert.match(calls[0].text, /communication_write_guard AS MATERIALIZED/);
  assert.match(calls[0].text, /INSERT INTO statement_confirmation_records/);
  assert.match(calls[0].text, /attachment_ids_json/);
  assert.ok(calls[0].values.includes("record_statement_customer_confirmation"));
  assert.match(calls[0].text, /COMMIT;/);
  assert.ok(calls[0].values.includes('["ATT-CHAT-CONFIRM-1"]'));

  const query = buildRecordStatementCustomerConfirmationTransactionQuery({
    statement: afterStatement,
    sendRecord: confirmedSendRecord,
    confirmationRecord,
    operationLog,
  });
  assert.match(query.text, /\$\d+::jsonb/);
  assert.ok(query.values.includes("客户回复确认无误"));
  assert.equal(
    query.text,
    buildRecordStatementCustomerConfirmationTransactionSql({ statement: afterStatement, sendRecord: confirmedSendRecord, confirmationRecord, operationLog }),
  );
}

async function checkPostgresStatementCommunicationIdempotencyBoundary() {
  const requests = [];
  const before = buildStatement({ status: "待生成" });
  const after = buildStatement({ status: "已发送待回款", lastSentAt: "2026-07-01T10:30:00.000Z" });
  const sendRecord = buildSendRecord();
  const receiptRecord = {
    ...sendRecord,
    receiptStatus: "read",
    receiptAt: "2026-07-01T11:00:00.000Z",
    receiptBy: "U-OFFICE-A",
  };
  const confirmationStatement = buildStatement({ status: "客户已确认", lastSentAt: "2026-07-01T10:30:00.000Z" });
  const confirmationRecord = buildConfirmationRecord();
  const repository = createPostgresStatementSendTransactionRepository({
    transactionJson() {
      throw new Error("plain transaction path must not be used");
    },
    async idempotentTransactionJson(request) {
      requests.push(request);
      if (request.scope === "statement.send.mark") {
        return { statement: after, sendRecord, operationLogId: "LOG-SEND-TXN-001" };
      }
      if (request.scope === "statement.send.receipt") {
        return { sendRecord: receiptRecord, operationLogId: "LOG-SEND-RECEIPT-TXN-001" };
      }
      return {
        statement: confirmationStatement,
        sendRecord: { ...receiptRecord, receiptStatus: "confirmed" },
        confirmationRecord,
        operationLogId: "LOG-SEND-CONFIRM-TXN-001",
      };
    },
  });
  const workspace = {
    statements: [before],
    statementSendRecords: [sendRecord],
    statementConfirmationRecords: [],
    operationLogs: [],
  };

  await repository.markStatementSent({
    workspace,
    statements: [after],
    statement: after,
    sendRecord,
    operationLog: buildOperationLog({ before, after }),
    idempotencyKey: "statement-send-idempotency-001",
    idempotencyPayload: { statementId: before.id, channel: "wechat" },
  });
  await repository.markStatementSendReceipt({
    workspace,
    sendRecord: receiptRecord,
    operationLog: buildReceiptOperationLog({ before: sendRecord, after: receiptRecord }),
    idempotencyKey: "statement-receipt-idempotency-001",
    idempotencyPayload: { sendRecordId: sendRecord.sendRecordId, receiptStatus: "read" },
  });
  await repository.recordStatementCustomerConfirmation({
    workspace,
    statements: [confirmationStatement],
    statement: confirmationStatement,
    sendRecord: { ...receiptRecord, receiptStatus: "confirmed" },
    confirmationRecord,
    operationLog: buildConfirmationOperationLog({
      before: { statement: after, sendRecord: receiptRecord },
      after: { statement: confirmationStatement, sendRecord: receiptRecord, confirmationRecord },
    }),
    idempotencyKey: "statement-confirmation-idempotency-001",
    idempotencyPayload: { statementId: before.id, sendRecordId: sendRecord.sendRecordId },
  });

  assert.deepEqual(requests.map((request) => request.scope), [
    "statement.send.mark",
    "statement.send.receipt",
    "statement.customer_confirmation.record",
  ]);
  assert.ok(requests[0].resourceLocks.includes(`statement:${before.id}`));
  assert.ok(requests[1].resourceLocks.includes(`statement-send-record:${sendRecord.sendRecordId}`));
  assert.ok(requests[2].resourceLocks.includes(`statement:${before.id}`));
  assert.ok(requests[2].resourceLocks.includes(`statement-send-record:${sendRecord.sendRecordId}`));
}

function buildStatement(overrides = {}) {
  return {
    id: "ST-TXN-003",
    customerId: "C003",
    status: overrides.status,
    receivable: 1200,
    received: 0,
    variance: 1200,
    lastSentAt: overrides.lastSentAt ?? "",
    revision: 1,
  };
}

function buildSendRecord() {
  return {
    sendRecordId: "SEND-TXN-001",
    statementId: "ST-TXN-003",
    channel: "wechat",
    sentTo: "客户财务",
    exportFileId: "DL-ST-TXN-001-CUSTOMER",
    includePaymentQr: false,
    sentBy: "U-OFFICE-A",
    sentAt: "2026-07-01T10:30:00.000Z",
    remark: "客户发送版对账单已发送",
    receiptStatus: "pending",
    receiptAt: "",
    receiptBy: "",
    receiptNote: "",
    revision: 1,
  };
}

function buildConfirmationRecord() {
  return {
    confirmationRecordId: "SCONF-TXN-001",
    statementId: "ST-TXN-003",
    sendRecordId: "SEND-TXN-001",
    confirmationType: "customer_reply",
    channel: "wechat",
    confirmedByCustomer: "客户财务",
    confirmedAt: "2026-07-01T11:20:00.000Z",
    content: "客户回复确认无误",
    attachmentIds: ["ATT-CHAT-CONFIRM-1"],
    recordedBy: "U-OFFICE-A",
  };
}

function buildOperationLog({ before, after }) {
  return {
    id: "LOG-SEND-TXN-001",
    targetType: "statement",
    targetId: "ST-TXN-003",
    action: "mark_statement_sent",
    before,
    after,
    reason: "客户发送版对账单已发送",
    operatorId: "U-OFFICE-A",
    pageKey: "api",
    occurredAt: "2026-07-01T10:30:00.000Z",
    createdAt: "2026-07-01T10:30:00.000Z",
  };
}

function buildConfirmationOperationLog({ before, after }) {
  return {
    id: "LOG-SEND-CONFIRM-TXN-001",
    targetType: "statement",
    targetId: "ST-TXN-003",
    action: "record_statement_customer_confirmation",
    before,
    after,
    reason: "客户回复确认无误",
    operatorId: "U-OFFICE-A",
    pageKey: "api",
    occurredAt: "2026-07-01T11:20:00.000Z",
    createdAt: "2026-07-01T11:20:00.000Z",
  };
}

function buildReceiptOperationLog({ before, after }) {
  return {
    id: "LOG-SEND-RECEIPT-TXN-001",
    targetType: "statement_send_record",
    targetId: "SEND-TXN-001",
    action: "mark_statement_send_receipt",
    before,
    after,
    reason: after.receiptNote,
    operatorId: "U-OFFICE-A",
    pageKey: "api",
    occurredAt: "2026-07-01T11:10:00.000Z",
    createdAt: "2026-07-01T11:10:00.000Z",
  };
}
