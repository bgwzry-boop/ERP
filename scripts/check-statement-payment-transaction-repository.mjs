import assert from "node:assert/strict";
import {
  buildRecordStatementPaymentTransactionQuery,
  buildRecordStatementPaymentTransactionSql,
  createLocalStatementPaymentTransactionRepository,
  createPostgresStatementPaymentTransactionRepository,
} from "../server/statementPaymentTransactionRepository.mjs";

await checkLocalStatementPaymentTransactionRepository();
await checkPostgresStatementPaymentTransactionSqlBoundary();

console.log(
  "Statement payment transaction repository check passed: local workspace mutation and PostgreSQL transaction SQL are covered.",
);

async function checkLocalStatementPaymentTransactionRepository() {
  const repository = createLocalStatementPaymentTransactionRepository();
  const before = buildStatement({ received: 0, variance: 0, status: "已发送待回款" });
  const after = buildStatement({ received: 200, variance: 73, status: "差额待确认" });
  const workspace = {
    statements: [before],
    paymentRecords: [],
    todos: [],
    operationLogs: [],
  };

  const transaction = await repository.recordStatementPayment({
    idempotencyKey: "idem-statement-payment-001",
    workspace,
    statements: [after],
    statement: after,
    paymentRecord: buildPaymentRecord(),
    todo: buildTodo(),
    operationLog: buildOperationLog({ before, after }),
  });

  assert.equal(transaction.statement.status, "差额待确认");
  assert.equal(transaction.payment.paymentRecordId, "PAY-TXN-001");
  assert.equal(transaction.todo.id, "T-TXN-001");
  assert.equal(transaction.operationLogId, "LOG-TXN-001");
  assert.equal(workspace.statements[0].received, 200);
  assert.equal(workspace.paymentRecords.length, 1);
  assert.equal(workspace.todos.length, 1);
  assert.equal(workspace.operationLogs.length, 1);
}

async function checkPostgresStatementPaymentTransactionSqlBoundary() {
  const calls = [];
  const before = buildStatement({ received: 0, variance: 0, status: "已发送待回款" });
  const after = buildStatement({ received: 200, variance: 73, status: "差额待确认" });
  const paymentRecord = buildPaymentRecord();
  const todo = buildTodo();
  const operationLog = buildOperationLog({ before, after });
  const repository = createPostgresStatementPaymentTransactionRepository({
    postgresClient: {
      idempotentTransactionJson(request) {
        calls.push(request);
        return {
          statement: after,
          payment: paymentRecord,
          todo,
          operationLogId: operationLog.id,
        };
      },
    },
  });

  const workspace = {
    statements: [before],
    paymentRecords: [],
    todos: [],
    operationLogs: [],
  };
  const transaction = await repository.recordStatementPayment({
    idempotencyKey: "idem-statement-payment-001",
    workspace,
    statements: [after],
    statement: after,
    paymentRecord,
    todo,
    operationLog,
  });

  assert.equal(transaction.payment.attachmentIds[0], "ATT-TXN-001");
  assert.equal(calls[0].scope, "statement.payment.record");
  assert.equal(calls[0].idempotencyKey, "idem-statement-payment-001");
  assert.ok(calls[0].resourceLocks.includes("statement:ST-TXN-001"));
  assert.match(calls[0].text, /^BEGIN;/);
  assert.match(calls[0].text, /UPDATE statements/);
  assert.match(calls[0].text, /INSERT INTO payment_records/);
  assert.match(calls[0].text, /INSERT INTO todos/);
  assert.match(calls[0].text, /INSERT INTO operation_logs/);
  assert.match(calls[0].text, /COMMIT;/);
  assert.match(calls[0].text, /\$\d+::text/);
  assert.doesNotMatch(calls[0].text, /O''Brien/);
  assert.ok(calls[0].values.includes("O'Brien transaction repository check"));
  assert.equal(workspace.statements[0].status, "差额待确认");
  assert.equal(workspace.todos.length, 1);

  const directQuery = buildRecordStatementPaymentTransactionQuery({
    statement: after,
    paymentRecord,
    todo,
    operationLog,
  });
  assert.equal(directQuery.text, buildRecordStatementPaymentTransactionSql({ statement: after, paymentRecord, todo, operationLog }));
  assert.ok(directQuery.values.length > 20);

  const noTodoSql = buildRecordStatementPaymentTransactionSql({
    statement: buildStatement({ received: 273, variance: 0, status: "收款待确认" }),
    paymentRecord,
    todo: null,
    operationLog,
  });
  assert.match(noTodoSql, /SELECT NULL::json AS result WHERE false/);
}

function buildStatement(overrides = {}) {
  return {
    id: "ST-TXN-001",
    customerId: "C001",
    status: overrides.status,
    receivable: 273,
    received: overrides.received,
    variance: overrides.variance,
    revision: overrides.revision ?? 1,
  };
}

function buildPaymentRecord() {
  return {
    paymentRecordId: "PAY-TXN-001",
    bizNo: "PAY-TXN-001",
    statementId: "ST-TXN-001",
    customerId: "C001",
    amount: 200,
    paidAt: "2026-07-01T10:30:00.000Z",
    method: "wechat",
    status: "recorded",
    attachmentIds: ["ATT-TXN-001"],
    operatorId: "U-OFFICE-A",
    remark: "O'Brien transaction repository check",
  };
}

function buildTodo() {
  return {
    id: "T-TXN-001",
    type: "收款差额待确认",
    customerId: "C001",
    ref: "ST-TXN-001",
    summary: "应收 ¥273，实收 ¥200，差额 ¥73",
    latest: "本期",
    urgency: "异常",
    impact: "需确认未收差额",
  };
}

function buildOperationLog({ before, after }) {
  return {
    id: "LOG-TXN-001",
    targetType: "statement",
    targetId: "ST-TXN-001",
    action: "record_statement_payment",
    before,
    after,
    reason: "wechat",
    operatorId: "U-OFFICE-A",
    pageKey: "api",
    occurredAt: "2026-07-01T10:30:00.000Z",
    createdAt: "2026-07-01T10:30:00.000Z",
  };
}
