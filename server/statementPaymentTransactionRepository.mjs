import { resolveStoreMode } from "./storeMode.mjs";
import { normalizePaymentRecord } from "./paymentRecordRepository.mjs";
import { createPostgresParameterBinder } from "./postgresSqlParameters.mjs";
import { createPostgresTransactionExecutor } from "./postgresTransactionExecutor.mjs";
import { buildPostgresIdempotencyRequest, resolveRepositoryIdempotencyKey } from "./idempotency.mjs";

export function createStatementPaymentTransactionRepository(options = {}) {
  const mode = resolveStoreMode({
    explicitMode: options.mode,
    envKeys: ["ERP_STATEMENT_PAYMENT_TRANSACTION_STORE", "ERP_STATEMENT_STORE", "ERP_PAYMENT_RECORD_STORE"],
    runtimeMode: options.runtimeMode,
    allowLocalFixture: options.allowLocalFixture,
  });
  if (mode === "postgres") {
    return createPostgresStatementPaymentTransactionRepository({
      databaseUrl:
        options.databaseUrl ?? process.env.ERP_STATEMENT_DATABASE_URL ?? process.env.DATABASE_URL ?? process.env.PGURL,
      queryJson: options.queryJson,
      transactionJson: options.transactionJson,
      idempotentTransactionJson: options.idempotentTransactionJson,
      postgresClient: options.postgresClient,
    });
  }
  if (mode === "local") return createLocalStatementPaymentTransactionRepository();
  throw new Error(`Unsupported statement payment transaction repository mode: ${mode}`);
}

export function createLocalStatementPaymentTransactionRepository() {
  return {
    kind: "local_memory",

    recordStatementPayment(input) {
      const statement = buildLocalSavedStatement(input);
      const statements = replaceStatement(input.statements, statement);
      applyStatementPaymentWorkspaceMutation({ ...input, statements, statement });
      return normalizeStatementPaymentTransactionResult({
        statement,
        payment: input.paymentRecord,
        todo: input.todo ?? null,
        operationLogId: input.operationLog?.id ?? "",
      });
    },
  };
}

export function createPostgresStatementPaymentTransactionRepository(options = {}) {
  const { idempotentTransactionJson } = createPostgresTransactionExecutor(options);

  return {
    kind: "postgres",

    async recordStatementPayment(input) {
      const query = buildRecordStatementPaymentTransactionQuery(input);
      const statementId = input.statement?.id ?? input.statement?.statementId ?? "";
      const saved = normalizeStatementPaymentTransactionResult(
        await idempotentTransactionJson(
          buildPostgresIdempotencyRequest({
            scope: "statement.payment.record",
            idempotencyKey: resolveRepositoryIdempotencyKey(input.idempotencyKey, input.operationLog?.id),
            payload: input.idempotencyPayload ?? {
              statementId,
              paymentRecord: input.paymentRecord,
              todo: input.todo,
            },
            operatorId: input.operationLog?.operatorId,
            targetType: "statement",
            targetId: statementId,
            resourceLocks: [`statement:${statementId}`],
            query,
          }),
        ),
      );
      if (!saved.statement || !saved.payment) {
        throw new Error("PostgreSQL statement payment transaction returned an invalid result");
      }
      applyStatementPaymentWorkspaceMutation({
        ...input,
        statement: saved.statement,
        paymentRecord: saved.payment,
        todo: saved.todo ?? input.todo,
      });
      return saved;
    },
  };
}

export function buildRecordStatementPaymentTransactionSql(input) {
  return buildRecordStatementPaymentTransactionQuery(input).text;
}

export function buildRecordStatementPaymentTransactionQuery(input) {
  const parameters = createPostgresParameterBinder();
  return {
    text: buildRecordStatementPaymentTransactionText(input, parameters),
    values: parameters.values,
  };
}

function buildRecordStatementPaymentTransactionText(input, parameters) {
  const statement = normalizeStatementForPersistence(input.statement);
  const paymentRecord = normalizePaymentRecord(input.paymentRecord);
  const todo = normalizeTodoForPersistence(input.todo, input.operationLog?.operatorId);
  const operationLog = normalizeOperationLogForPersistence(input.operationLog);
  if (!statement || !paymentRecord || !operationLog) {
    throw new Error("Statement, payment record, and operation log are required for statement payment transaction");
  }
  const insertedTodoCte = todo
    ? `INSERT INTO todos (
  id,
  biz_no,
  type,
  ref_type,
  ref_id,
  priority,
  status,
  summary,
  due_at,
  remind_at,
  created_by,
  created_at,
  updated_at
) VALUES (
  ${parameters.text(todo.id)},
  ${parameters.text(todo.bizNo)},
  ${parameters.text(todo.type)},
  ${parameters.text(todo.refType)},
  ${parameters.text(todo.refId)},
  ${parameters.text(todo.priority)},
  ${parameters.text(todo.status)},
  ${parameters.text(todo.summary)},
  ${parameters.nullableTimestamp(todo.dueAt)},
  ${parameters.nullableTimestamp(todo.remindAt)},
  ${parameters.nullableText(todo.createdBy)},
  now(),
  now()
)
ON CONFLICT (id) DO UPDATE SET
  type = EXCLUDED.type,
  ref_type = EXCLUDED.ref_type,
  ref_id = EXCLUDED.ref_id,
  priority = EXCLUDED.priority,
  status = EXCLUDED.status,
  summary = EXCLUDED.summary,
  due_at = EXCLUDED.due_at,
  remind_at = EXCLUDED.remind_at,
  updated_at = now()
RETURNING ${todoJsonExpression("todos")} AS result`
    : "SELECT NULL::json AS result WHERE false";

  return `
BEGIN;
WITH locked_statement AS MATERIALIZED (
  SELECT id, revision
  FROM statements
  WHERE id = ${parameters.text(statement.id)}
  FOR UPDATE
),
updated_statement AS (
  UPDATE statements
  SET
    status = ${parameters.text(statement.status)},
    received_amount = ${parameters.number(statement.received)},
    variance_amount = ${parameters.number(statement.variance)},
    receivable_amount = ${parameters.number(statement.receivable)},
    revision = statements.revision + 1,
    updated_at = now()
  FROM locked_statement AS locked
  WHERE statements.id = locked.id AND locked.revision = ${parameters.integer(statement.revision)}
  RETURNING ${statementJsonExpression("statements")} AS result
),
statement_write_guard AS MATERIALIZED (
  SELECT erp_require(
    (SELECT COUNT(*) FROM updated_statement) = 1,
    'ERP_STATEMENT_CONCURRENCY_CONFLICT'
  ) AS ok
),
inserted_payment AS (
  INSERT INTO payment_records (
    id,
    biz_no,
    statement_id,
    customer_id,
    amount,
    payment_method,
    payment_at,
    status,
    registered_by,
    evidence_attachment_id,
    remark,
    created_at,
    updated_at
  ) VALUES (
    ${parameters.text(paymentRecord.paymentRecordId)},
    ${parameters.text(paymentRecord.bizNo ?? paymentRecord.paymentRecordId)},
    ${parameters.text(paymentRecord.statementId)},
    ${parameters.text(paymentRecord.customerId)},
    ${parameters.number(paymentRecord.amount)},
    ${parameters.text(paymentRecord.method ?? "other")},
    ${parameters.timestamp(paymentRecord.paidAt)},
    ${parameters.text(paymentRecord.status ?? "recorded")},
    ${parameters.nullableText(paymentRecord.operatorId)},
    ${parameters.nullableText(paymentRecord.attachmentIds[0])},
    ${parameters.text(paymentRecord.remark ?? "")},
    now(),
    now()
  )
  ON CONFLICT (id) DO UPDATE SET
    biz_no = EXCLUDED.biz_no,
    statement_id = EXCLUDED.statement_id,
    customer_id = EXCLUDED.customer_id,
    amount = EXCLUDED.amount,
    payment_method = EXCLUDED.payment_method,
    payment_at = EXCLUDED.payment_at,
    status = EXCLUDED.status,
    registered_by = EXCLUDED.registered_by,
    evidence_attachment_id = EXCLUDED.evidence_attachment_id,
    remark = EXCLUDED.remark,
    updated_at = now()
  RETURNING ${paymentRecordJsonExpression("payment_records")} AS result
),
inserted_todo AS (
  ${insertedTodoCte}
),
inserted_operation_log AS (
  INSERT INTO operation_logs (
    id,
    target_type,
    target_id,
    action,
    before_json,
    after_json,
    reason,
    operator_id,
    page_key,
    occurred_at,
    created_at
  ) VALUES (
    ${parameters.text(operationLog.id)},
    ${parameters.text(operationLog.targetType)},
    ${parameters.text(operationLog.targetId)},
    ${parameters.text(operationLog.action)},
    ${parameters.json(operationLog.before)},
    ${parameters.json(operationLog.after)},
    ${parameters.text(operationLog.reason)},
    ${parameters.nullableText(operationLog.operatorId)},
    ${parameters.text(operationLog.pageKey)},
    ${parameters.timestamp(operationLog.occurredAt)},
    ${parameters.timestamp(operationLog.createdAt)}
  )
  ON CONFLICT (id) DO UPDATE SET
    target_type = EXCLUDED.target_type,
    target_id = EXCLUDED.target_id,
    action = EXCLUDED.action,
    before_json = EXCLUDED.before_json,
    after_json = EXCLUDED.after_json,
    reason = EXCLUDED.reason,
    operator_id = EXCLUDED.operator_id,
    page_key = EXCLUDED.page_key
  RETURNING id
)
SELECT json_build_object(
  'statement', (SELECT result FROM updated_statement),
  'payment', (SELECT result FROM inserted_payment),
  'todo', (SELECT result FROM inserted_todo LIMIT 1),
  'operationLogId', (SELECT id FROM inserted_operation_log),
  'writeGuard', (SELECT ok FROM statement_write_guard)
) AS result;
COMMIT;
`.trim();
}

export function normalizeStatementPaymentTransactionResult(value) {
  if (!value || typeof value !== "object") {
    return { statement: null, payment: null, todo: null, operationLogId: "" };
  }
  return {
    statement: normalizeStatementForApi(value.statement),
    payment: normalizePaymentRecord(value.payment),
    todo: normalizeTodoForApi(value.todo),
    operationLogId: String(value.operationLogId ?? value.operation_log_id ?? "").trim(),
  };
}

function applyStatementPaymentWorkspaceMutation({ workspace, statements, statement, paymentRecord, todo, operationLog }) {
  if (Array.isArray(statements)) {
    workspace.statements = statements.map((item) => (item.id === statement?.id ? { ...item, ...statement } : item));
  } else if (statement?.id) {
    workspace.statements = workspace.statements.map((item) => (item.id === statement.id ? { ...item, ...statement } : item));
  }
  const payment = normalizePaymentRecord(paymentRecord);
  if (payment) workspace.paymentRecords.unshift(payment);
  if (todo) workspace.todos.unshift(todo);
  if (operationLog) workspace.operationLogs.unshift(operationLog);
}

function buildLocalSavedStatement(input) {
  const expected = Number(input.statement?.revision ?? 0);
  const current = (input.workspace?.statements ?? []).find((item) => item.id === input.statement?.id);
  if (!current || Number(current.revision ?? 1) !== expected) throw statementWriteConflict(current?.revision);
  return { ...input.statement, revision: expected + 1 };
}

function replaceStatement(statements, saved) {
  return (Array.isArray(statements) ? statements : []).map((item) => item.id === saved.id ? { ...item, ...saved } : item);
}

function statementWriteConflict(currentRevision) {
  const error = new Error("该对账单已被另一位办公室人员更新，请刷新后重新确认。");
  error.statusCode = 409;
  error.code = "BUSINESS_WRITE_CONFLICT";
  error.details = { currentRevision: Number(currentRevision ?? 0) };
  return error;
}

function normalizeStatementForPersistence(statement) {
  if (!statement || typeof statement !== "object") return null;
  const id = String(statement.id ?? statement.statementId ?? "").trim();
  if (!id) return null;
  return {
    id,
    status: String(statement.status ?? "").trim(),
    receivable: Number(statement.receivable ?? statement.receivableAmount ?? 0),
    received: Number(statement.received ?? statement.receivedAmount ?? 0),
    variance: Number(statement.variance ?? statement.varianceAmount ?? 0),
    revision: Math.max(1, Number(statement.revision ?? 1) || 1),
  };
}

function normalizeStatementForApi(statement) {
  if (!statement || typeof statement !== "object") return null;
  const id = String(statement.id ?? statement.statementId ?? "").trim();
  if (!id) return null;
  return {
    id,
    customerId: String(statement.customerId ?? statement.customer_id ?? "").trim(),
    status: String(statement.status ?? "").trim(),
    receivable: Number(statement.receivable ?? statement.receivableAmount ?? statement.receivable_amount ?? 0),
    received: Number(statement.received ?? statement.receivedAmount ?? statement.received_amount ?? 0),
    variance: Number(statement.variance ?? statement.varianceAmount ?? statement.variance_amount ?? 0),
    revision: Math.max(1, Number(statement.revision ?? 1) || 1),
  };
}

function normalizeTodoForPersistence(todo, operatorId) {
  if (!todo || typeof todo !== "object") return null;
  const id = String(todo.id ?? todo.todoId ?? "").trim();
  if (!id) return null;
  return {
    id,
    bizNo: String(todo.bizNo ?? todo.biz_no ?? id).trim(),
    type: String(todo.type ?? "").trim(),
    refType: String(todo.refType ?? todo.ref_type ?? inferTodoRefType(todo.ref ?? todo.refId ?? "")).trim(),
    refId: String(todo.refId ?? todo.ref_id ?? todo.ref ?? "").trim(),
    priority: mapTodoPriorityForSql(todo.urgency ?? todo.priority),
    status: todo.handled ? "已处理" : "未处理",
    summary: String(todo.summary ?? "").trim(),
    dueAt: todo.dueAt ?? null,
    remindAt: todo.remindAt ?? todo.snoozeUntil ?? null,
    createdBy: String(todo.createdBy ?? todo.created_by ?? operatorId ?? "").trim(),
  };
}

function normalizeTodoForApi(todo) {
  if (!todo || typeof todo !== "object") return null;
  const id = String(todo.id ?? todo.todoId ?? "").trim();
  if (!id) return null;
  return {
    id,
    type: String(todo.type ?? "").trim(),
    ref: String(todo.ref ?? todo.refId ?? todo.ref_id ?? "").trim(),
    summary: String(todo.summary ?? "").trim(),
    urgency: String(todo.urgency ?? todo.priority ?? "").trim(),
  };
}

function normalizeOperationLogForPersistence(operationLog) {
  if (!operationLog || typeof operationLog !== "object") return null;
  const id = String(operationLog.id ?? "").trim();
  if (!id) return null;
  return {
    id,
    targetType: String(operationLog.targetType ?? operationLog.target_type ?? "").trim(),
    targetId: String(operationLog.targetId ?? operationLog.target_id ?? "").trim(),
    action: String(operationLog.action ?? "").trim(),
    before: operationLog.before ?? null,
    after: operationLog.after ?? null,
    reason: String(operationLog.reason ?? "").trim(),
    operatorId: String(operationLog.operatorId ?? operationLog.operator_id ?? "").trim(),
    pageKey: String(operationLog.pageKey ?? operationLog.page_key ?? "api").trim() || "api",
    occurredAt: operationLog.occurredAt ?? new Date().toISOString(),
    createdAt: operationLog.createdAt ?? new Date().toISOString(),
  };
}

function statementJsonExpression(alias) {
  return `json_build_object(
    'id', ${alias}.id,
    'customerId', ${alias}.customer_id,
    'status', ${alias}.status,
    'receivable', ${alias}.receivable_amount,
    'received', ${alias}.received_amount,
    'variance', ${alias}.variance_amount,
    'revision', ${alias}.revision
  )`;
}

function paymentRecordJsonExpression(alias) {
  return `json_build_object(
    'paymentRecordId', ${alias}.id,
    'bizNo', ${alias}.biz_no,
    'statementId', ${alias}.statement_id,
    'customerId', ${alias}.customer_id,
    'amount', ${alias}.amount,
    'paidAt', ${alias}.payment_at,
    'method', ${alias}.payment_method,
    'status', ${alias}.status,
    'attachmentIds', CASE
      WHEN ${alias}.evidence_attachment_id IS NULL OR ${alias}.evidence_attachment_id = '' THEN '[]'::json
      ELSE json_build_array(${alias}.evidence_attachment_id)
    END,
    'operatorId', ${alias}.registered_by,
    'remark', ${alias}.remark
  )`;
}

function todoJsonExpression(alias) {
  return `json_build_object(
    'id', ${alias}.id,
    'type', ${alias}.type,
    'ref', ${alias}.ref_id,
    'summary', ${alias}.summary,
    'urgency', ${alias}.priority
  )`;
}

function inferTodoRefType(refId) {
  const value = String(refId ?? "");
  if (value.startsWith("ST-")) return "statement";
  if (value.startsWith("DRAFT")) return "order_draft";
  if (value.startsWith("F")) return "fulfillment";
  return "order_line";
}

function mapTodoPriorityForSql(value) {
  const map = {
    急: "urgent",
    今天: "urgent",
    异常: "exception",
    关注: "management_watch",
    普通: "normal",
  };
  return map[value] ?? (String(value ?? "normal").trim() || "normal");
}
