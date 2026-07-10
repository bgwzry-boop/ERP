import assert from "node:assert/strict";
import {
  buildHandleStatementVarianceTransactionQuery,
  buildHandleStatementVarianceTransactionSql,
  buildWriteOffStatementTransactionQuery,
  buildWriteOffStatementTransactionSql,
  createLocalStatementSettlementTransactionRepository,
  createPostgresStatementSettlementTransactionRepository,
} from "../server/statementSettlementTransactionRepository.mjs";

await checkLocalStatementSettlementTransactionRepository();
await checkPostgresStatementSettlementTransactionSqlBoundary();

console.log(
  "Statement settlement transaction repository check passed: variance handling and write-off transactions are covered.",
);

async function checkLocalStatementSettlementTransactionRepository() {
  const repository = createLocalStatementSettlementTransactionRepository();
  const before = buildStatement({ status: "差额待确认", received: 80000, variance: 28000 });
  const after = buildStatement({ status: "有欠款", received: 80000, variance: 28000 });
  const workspace = {
    statements: [before],
    varianceRecords: [],
    todos: [],
    operationLogs: [],
  };

  const varianceTransaction = await repository.handleStatementVariance({
    idempotencyKey: "idem-statement-variance-001",
    workspace,
    statements: [after],
    statement: after,
    varianceRecord: buildVarianceRecord(),
    todo: buildTodo(),
    operationLog: buildOperationLog({ action: "handle_statement_variance", before, after }),
  });

  assert.equal(varianceTransaction.statement.status, "有欠款");
  assert.equal(varianceTransaction.varianceRecord.varianceRecordId, "VAR-TXN-001");
  assert.equal(varianceTransaction.todo.id, "T-VAR-TXN-001");
  assert.equal(workspace.varianceRecords.length, 1);
  assert.equal(workspace.todos.length, 1);
  assert.equal(workspace.operationLogs.length, 1);

  const writtenOff = buildStatement({ status: "已确认欠款", received: 80000, variance: 28000 });
  const writeOffTransaction = await repository.writeOffStatement({
    idempotencyKey: "idem-statement-writeoff-001",
    workspace,
    statements: [writtenOff],
    statement: writtenOff,
    operationLog: buildOperationLog({ action: "write_off_statement", before: after, after: writtenOff }),
  });

  assert.equal(writeOffTransaction.statement.status, "已确认欠款");
  assert.equal(workspace.statements[0].status, "已确认欠款");
  assert.equal(workspace.operationLogs.length, 2);
}

async function checkPostgresStatementSettlementTransactionSqlBoundary() {
  const calls = [];
  const before = buildStatement({ status: "差额待确认", received: 80000, variance: 28000 });
  const after = buildStatement({ status: "有欠款", received: 80000, variance: 28000 });
  const varianceRecord = buildVarianceRecord();
  const todo = buildTodo();
  const varianceLog = buildOperationLog({ action: "handle_statement_variance", before, after });
  const repository = createPostgresStatementSettlementTransactionRepository({
    postgresClient: {
      idempotentTransactionJson(request) {
        calls.push(request);
        if (request.text.includes("INSERT INTO variance_records")) {
          return {
            statement: after,
            varianceRecord,
            todo,
            operationLogId: varianceLog.id,
          };
        }
        return {
          statement: buildStatement({ status: "已确认欠款", received: 80000, variance: 28000 }),
          operationLogId: "LOG-WRITE-TXN-001",
        };
      },
    },
  });

  const workspace = {
    statements: [before],
    varianceRecords: [],
    todos: [],
    operationLogs: [],
  };
  const varianceTransaction = await repository.handleStatementVariance({
    idempotencyKey: "idem-statement-variance-001",
    workspace,
    statements: [after],
    statement: after,
    varianceRecord,
    todo,
    operationLog: varianceLog,
  });

  assert.equal(varianceTransaction.varianceRecord.reason, "O'Brien difference to debt");
  assert.equal(calls[0].scope, "statement.variance.handle");
  assert.equal(calls[0].idempotencyKey, "idem-statement-variance-001");
  assert.ok(calls[0].resourceLocks.includes("statement:ST-TXN-002"));
  assert.match(calls[0].text, /^BEGIN;/);
  assert.match(calls[0].text, /UPDATE statements/);
  assert.match(calls[0].text, /INSERT INTO variance_records/);
  assert.match(calls[0].text, /INSERT INTO todos/);
  assert.match(calls[0].text, /INSERT INTO operation_logs/);
  assert.match(calls[0].text, /COMMIT;/);
  assert.match(calls[0].text, /\$\d+::text/);
  assert.doesNotMatch(calls[0].text, /O''Brien/);
  assert.ok(calls[0].values.includes("O'Brien difference to debt"));

  const varianceQuery = buildHandleStatementVarianceTransactionQuery({
    statement: after,
    varianceRecord,
    todo,
    operationLog: varianceLog,
  });
  assert.equal(
    varianceQuery.text,
    buildHandleStatementVarianceTransactionSql({ statement: after, varianceRecord, todo, operationLog: varianceLog }),
  );
  assert.ok(varianceQuery.values.length > 25);

  const writeOffSql = buildWriteOffStatementTransactionSql({
    statement: buildStatement({ status: "已核销", received: 108000, variance: 0 }),
    operationLog: buildOperationLog({
      action: "write_off_statement",
      before: after,
      after: buildStatement({ status: "已核销", received: 108000, variance: 0 }),
    }),
  });
  assert.match(writeOffSql, /settled_at = now\(\)/);

  const noTodoSql = buildHandleStatementVarianceTransactionSql({
    statement: after,
    varianceRecord,
    todo: null,
    operationLog: varianceLog,
  });
  assert.match(noTodoSql, /SELECT NULL::json AS result WHERE false/);

  const writeOffTransaction = await repository.writeOffStatement({
    idempotencyKey: "idem-statement-writeoff-001",
    workspace,
    statements: [buildStatement({ status: "已确认欠款", received: 80000, variance: 28000 })],
    statement: buildStatement({ status: "已确认欠款", received: 80000, variance: 28000 }),
    operationLog: buildOperationLog({ action: "write_off_statement", before: after, after }),
  });
  assert.equal(writeOffTransaction.operationLogId, "LOG-WRITE-TXN-001");
  assert.equal(calls[1].scope, "statement.write_off");
  assert.equal(calls[1].idempotencyKey, "idem-statement-writeoff-001");
  assert.match(calls[1].text, /UPDATE statements/);
  assert.match(calls[1].text, /INSERT INTO operation_logs/);

  const writeOffQuery = buildWriteOffStatementTransactionQuery({
    statement: buildStatement({ status: "已核销", received: 108000, variance: 0 }),
    operationLog: buildOperationLog({ action: "write_off_statement", before: after, after }),
  });
  assert.equal(
    writeOffQuery.text,
    buildWriteOffStatementTransactionSql({
      statement: buildStatement({ status: "已核销", received: 108000, variance: 0 }),
      operationLog: buildOperationLog({ action: "write_off_statement", before: after, after }),
    }),
  );
  assert.ok(writeOffQuery.values.length > 10);
}

function buildStatement(overrides = {}) {
  return {
    id: "ST-TXN-002",
    customerId: "C002",
    status: overrides.status,
    receivable: 108000,
    received: overrides.received,
    variance: overrides.variance,
  };
}

function buildVarianceRecord() {
  return {
    varianceRecordId: "VAR-TXN-001",
    statementId: "ST-TXN-002",
    paymentRecordId: "PAY-TXN-001",
    amount: 28000,
    handlingResult: "carry_to_debt",
    reason: "O'Brien difference to debt",
    status: "recorded",
    attachmentId: "",
    operatorId: "U-OFFICE-A",
  };
}

function buildTodo() {
  return {
    id: "T-VAR-TXN-001",
    type: "收款差额待确认",
    customerId: "C002",
    ref: "ST-TXN-002",
    summary: "差额 ¥28000，处理结果：未收差额转欠款",
    latest: "本期",
    urgency: "异常",
    impact: "影响核销、欠款和客户沟通",
  };
}

function buildOperationLog({ action, before, after }) {
  return {
    id: action === "write_off_statement" ? "LOG-WRITE-TXN-001" : "LOG-VAR-TXN-001",
    targetType: "statement",
    targetId: "ST-TXN-002",
    action,
    before,
    after,
    reason: "未收差额转欠款",
    operatorId: "U-OFFICE-A",
    pageKey: "api",
    occurredAt: "2026-07-01T10:30:00.000Z",
    createdAt: "2026-07-01T10:30:00.000Z",
  };
}
