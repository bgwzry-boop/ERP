import { createPostgresParameterBinder } from "./postgresSqlParameters.mjs";
import { createPostgresTransactionExecutor } from "./postgresTransactionExecutor.mjs";
import { buildPostgresIdempotencyRequest, resolveRepositoryIdempotencyKey } from "./idempotency.mjs";
import {
  buildBusinessDecisionAttachmentLinksCte,
  buildInsertBusinessDecisionCte,
  buildSupersedeBusinessDecisionCte,
  normalizeDecisionRecord,
} from "./businessDecisionEvidenceRepository.mjs";

export function createStatementSettlementTransactionRepository(options = {}) {
  const mode =
    options.mode ??
    process.env.ERP_STATEMENT_SETTLEMENT_TRANSACTION_STORE ??
    process.env.ERP_STATEMENT_STORE ??
    "local";
  if (mode === "postgres") {
    return createPostgresStatementSettlementTransactionRepository({
      databaseUrl:
        options.databaseUrl ?? process.env.ERP_STATEMENT_DATABASE_URL ?? process.env.DATABASE_URL ?? process.env.PGURL,
      queryJson: options.queryJson,
      transactionJson: options.transactionJson,
      idempotentTransactionJson: options.idempotentTransactionJson,
      postgresClient: options.postgresClient,
    });
  }
  if (mode === "local") return createLocalStatementSettlementTransactionRepository();
  throw new Error(`Unsupported statement settlement transaction repository mode: ${mode}`);
}

export function createLocalStatementSettlementTransactionRepository() {
  return {
    kind: "local_memory",

    handleStatementVariance(input) {
      const statement = buildLocalSavedStatement(input);
      const transaction = normalizeVarianceTransactionResult({
        statement,
        varianceRecord: input.varianceRecord,
        todo: input.todo ?? null,
        operationLogId: input.operationLog?.id ?? "",
      });
      return commitLocalSettlementDecision({
        input,
        scope: "statement.variance.handle",
        transaction,
        apply(stagedWorkspace) {
          applySettlementWorkspaceMutation({
            ...input,
            workspace: stagedWorkspace,
            statements: replaceStatement(input.statements, statement),
            statement,
            operationLog: null,
          });
        },
      });
    },

    writeOffStatement(input) {
      const statement = buildLocalSavedStatement(input);
      const transaction = normalizeWriteOffTransactionResult({
        statement,
        writeOffRecord: input.writeOffRecord,
        operationLogId: input.operationLog?.id ?? "",
      });
      return commitLocalSettlementDecision({
        input,
        scope: "statement.write_off",
        transaction,
        apply(stagedWorkspace) {
          applySettlementWorkspaceMutation({
            ...input,
            workspace: stagedWorkspace,
            statements: replaceStatement(input.statements, statement),
            statement,
            writeOffRecord: input.writeOffRecord,
            operationLog: null,
          });
        },
      });
    },
  };
}

export function createPostgresStatementSettlementTransactionRepository(options = {}) {
  const { idempotentTransactionJson } = createPostgresTransactionExecutor(options);

  return {
    kind: "postgres",

    async handleStatementVariance(input) {
      const query = buildHandleStatementVarianceTransactionQuery(input);
      const statementId = input.statement?.id ?? input.statement?.statementId ?? "";
      const saved = normalizeVarianceTransactionResult(
        await idempotentTransactionJson(
          buildPostgresIdempotencyRequest({
            scope: "statement.variance.handle",
            idempotencyKey: resolveRepositoryIdempotencyKey(input.idempotencyKey, input.operationLog?.id),
            payload: input.idempotencyPayload ?? {
              statementId,
              varianceRecord: input.varianceRecord,
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
      if (!saved.statement || !saved.varianceRecord) {
        throw new Error("PostgreSQL statement variance transaction returned an invalid result");
      }
      applySettlementWorkspaceMutation({
        ...input,
        statement: { ...input.statement, ...saved.statement },
        varianceRecord: saved.varianceRecord,
        todo: saved.todo ? { ...input.todo, ...saved.todo } : null,
        operationLog: saved.operationLogId === input.operationLog?.id ? input.operationLog : null,
      });
      applyDecisionWorkspaceMutation(input.workspace, saved.businessDecision, input.attachmentLinks);
      return saved;
    },

    async writeOffStatement(input) {
      const query = buildWriteOffStatementTransactionQuery(input);
      const statementId = input.statement?.id ?? input.statement?.statementId ?? "";
      const saved = normalizeWriteOffTransactionResult(
        await idempotentTransactionJson(
          buildPostgresIdempotencyRequest({
            scope: "statement.write_off",
            idempotencyKey: resolveRepositoryIdempotencyKey(input.idempotencyKey, input.operationLog?.id),
            payload: input.idempotencyPayload ?? { statementId, statement: input.statement },
            operatorId: input.operationLog?.operatorId,
            targetType: "statement",
            targetId: statementId,
            resourceLocks: [`statement:${statementId}`],
            query,
          }),
        ),
      );
      if (!saved.statement) {
        throw new Error("PostgreSQL statement write-off transaction returned an invalid result");
      }
      applySettlementWorkspaceMutation({
        ...input,
        statement: { ...input.statement, ...saved.statement },
        writeOffRecord: saved.writeOffRecord,
        operationLog: saved.operationLogId === input.operationLog?.id ? input.operationLog : null,
      });
      applyDecisionWorkspaceMutation(input.workspace, saved.businessDecision, input.attachmentLinks);
      return saved;
    },
  };
}

export function buildHandleStatementVarianceTransactionSql(input) {
  return buildHandleStatementVarianceTransactionQuery(input).text;
}

export function buildHandleStatementVarianceTransactionQuery(input) {
  const parameters = createPostgresParameterBinder();
  return {
    text: buildHandleStatementVarianceTransactionText(input, parameters),
    values: parameters.values,
  };
}

function buildHandleStatementVarianceTransactionText(input, parameters) {
  const statement = normalizeStatementForPersistence(input.statement);
  const varianceRecord = normalizeVarianceRecord(input.varianceRecord);
  const todo = normalizeTodoForPersistence(input.todo, input.operationLog?.operatorId);
  const operationLog = normalizeOperationLogForPersistence(input.operationLog);
  const decisionRecord = normalizeDecisionRecord(input.decisionRecord);
  if (!statement || !varianceRecord || !operationLog || !decisionRecord) {
    throw new Error("Statement, variance record, business decision, and operation log are required for statement variance transaction");
  }
  const insertedTodoCte = todo ? buildInsertTodoSql(todo, parameters) : "SELECT NULL::json AS result WHERE false";
  const decisionCtes = buildStatementDecisionCtes(decisionRecord, input.attachmentLinks, parameters);
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
inserted_variance AS (
  INSERT INTO variance_records (
    id,
    statement_id,
    payment_record_id,
    variance_amount,
    handling_result,
    reason,
    status,
    attachment_id,
    created_by,
    created_at,
    updated_at
  ) VALUES (
    ${parameters.text(varianceRecord.varianceRecordId)},
    ${parameters.text(varianceRecord.statementId)},
    ${parameters.nullableText(varianceRecord.paymentRecordId)},
    ${parameters.number(varianceRecord.amount)},
    ${parameters.text(varianceRecord.handlingResult)},
    ${parameters.text(varianceRecord.reason)},
    ${parameters.text(varianceRecord.status)},
    ${parameters.nullableText(varianceRecord.attachmentId)},
    ${parameters.nullableText(varianceRecord.operatorId)},
    now(),
    now()
  )
  ON CONFLICT (id) DO UPDATE SET
    statement_id = EXCLUDED.statement_id,
    payment_record_id = EXCLUDED.payment_record_id,
    variance_amount = EXCLUDED.variance_amount,
    handling_result = EXCLUDED.handling_result,
    reason = EXCLUDED.reason,
    status = EXCLUDED.status,
    attachment_id = EXCLUDED.attachment_id,
    updated_at = now()
  RETURNING ${varianceRecordJsonExpression("variance_records")} AS result
),
inserted_todo AS (
  ${insertedTodoCte}
),
inserted_operation_log AS (
  ${buildInsertOperationLogSql(operationLog, parameters)}
),
${decisionCtes}
SELECT json_build_object(
  'statement', (SELECT result FROM updated_statement),
  'varianceRecord', (SELECT result FROM inserted_variance),
  'todo', (SELECT result FROM inserted_todo LIMIT 1),
  'businessDecision', (SELECT result FROM inserted_business_decision),
  'operationLogId', (SELECT id FROM inserted_operation_log),
  'writeGuard', (SELECT ok FROM statement_write_guard)
) AS result;
COMMIT;
`.trim();
}

export function buildWriteOffStatementTransactionSql(input) {
  return buildWriteOffStatementTransactionQuery(input).text;
}

export function buildWriteOffStatementTransactionQuery(input) {
  const parameters = createPostgresParameterBinder();
  return {
    text: buildWriteOffStatementTransactionText(input, parameters),
    values: parameters.values,
  };
}

function buildWriteOffStatementTransactionText(input, parameters) {
  const statement = normalizeStatementForPersistence(input.statement);
  const operationLog = normalizeOperationLogForPersistence(input.operationLog);
  const decisionRecord = normalizeDecisionRecord(input.decisionRecord);
  const writeOffRecord = normalizeStatementWriteOffRecord(input.writeOffRecord);
  if (!statement || !operationLog || !decisionRecord || !writeOffRecord) {
    throw new Error("Statement, write-off record, business decision, and operation log are required for statement write-off transaction");
  }
  const settledAtAssignment = statement.status === "已核销" ? "now()" : "settled_at";
  const decisionCtes = buildStatementDecisionCtes(decisionRecord, input.attachmentLinks, parameters);
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
    settled_at = ${settledAtAssignment},
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
inserted_operation_log AS (
  ${buildInsertOperationLogSql(operationLog, parameters)}
),
${decisionCtes},
inserted_statement_write_off AS (
  INSERT INTO statement_write_off_records (
    id, statement_id, receivable_snapshot, received_snapshot, variance_snapshot,
    write_off_amount, handling_result, business_decision_id, recorded_by,
    revision, operation_log_id, created_at
  ) SELECT
    ${parameters.text(writeOffRecord.id)}, ${parameters.text(writeOffRecord.statementId)},
    ${parameters.number(writeOffRecord.receivableSnapshot)}, ${parameters.number(writeOffRecord.receivedSnapshot)},
    ${parameters.number(writeOffRecord.varianceSnapshot)}, ${parameters.number(writeOffRecord.writeOffAmount)},
    ${parameters.text(writeOffRecord.handlingResult)}, ${parameters.text(writeOffRecord.businessDecisionId)},
    ${parameters.text(writeOffRecord.recordedBy)}, 1, ${parameters.text(writeOffRecord.operationLogId)},
    ${parameters.timestamp(writeOffRecord.createdAt)}
  WHERE EXISTS (SELECT 1 FROM inserted_business_decision)
  ON CONFLICT (id) DO NOTHING
  RETURNING ${statementWriteOffJsonExpression("statement_write_off_records")} AS result
)
SELECT json_build_object(
  'statement', (SELECT result FROM updated_statement),
  'writeOffRecord', (SELECT result FROM inserted_statement_write_off),
  'businessDecision', (SELECT result FROM inserted_business_decision),
  'operationLogId', (SELECT id FROM inserted_operation_log),
  'writeGuard', (SELECT ok FROM statement_write_guard)
) AS result;
COMMIT;
`.trim();
}

function buildInsertTodoSql(todo, parameters) {
  return `INSERT INTO todos (
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
RETURNING ${todoJsonExpression("todos")} AS result`;
}

function buildInsertOperationLogSql(operationLog, parameters) {
  return `INSERT INTO operation_logs (
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
RETURNING id`;
}

function commitLocalSettlementDecision({ input, scope, transaction, apply }) {
  const decisionRecord = normalizeDecisionRecord(input.decisionRecord);
  if (!decisionRecord || typeof apply !== "function") {
    throw new Error("A business decision is required for statement settlement changes");
  }
  const committed = input.workspace.businessDecisionEvidenceRepository.commitDecisionBundle({
    workspace: input.workspace,
    decisionRecord,
    attachmentLinks: input.attachmentLinks,
    operationLog: input.operationLog,
    idempotencyScope: scope,
    idempotencyKey: input.idempotencyKey,
    idempotencyPayload: input.idempotencyPayload,
    applyBusinessMutation(stagedWorkspace) {
      const current = (stagedWorkspace.statements ?? []).find((statement) => statement.id === input.statement?.id);
      const expectedRevision = Number(input.statement?.revision ?? 0);
      if (!current || Number(current.revision ?? 1) !== expectedRevision) {
        const error = new Error("对账单已被另一位办公室人员更新，请刷新后重新确认。");
        error.statusCode = 409;
        error.code = "BUSINESS_WRITE_CONFLICT";
        error.details = { currentRevision: Number(current?.revision ?? 0) };
        throw error;
      }
      apply(stagedWorkspace);
      return {
        commitKeys: ["statements", "varianceRecords", "todos", "statementWriteOffRecords"],
        result: transaction,
      };
    },
  });
  return {
    ...committed.businessResult,
    businessDecision: committed.businessDecision,
    replayed: committed.replayed === true,
  };
}

function buildLocalSavedStatement(input) {
  const statement = normalizeStatementForApi(input.statement);
  if (!statement) throw new Error("A valid statement is required");
  return { ...input.statement, ...statement, revision: statement.revision + 1 };
}

function replaceStatement(statements, savedStatement) {
  return (Array.isArray(statements) ? statements : []).map((statement) =>
    statement.id === savedStatement.id ? { ...statement, ...savedStatement } : statement,
  );
}

function buildStatementDecisionCtes(decisionRecord, attachmentLinks, parameters) {
  return `superseded_business_decision AS (
  ${buildSupersedeBusinessDecisionCte(decisionRecord, parameters, "statement_write_guard")}
),
inserted_business_decision AS (
  ${buildInsertBusinessDecisionCte(decisionRecord, parameters, "statement_write_guard")}
),
inserted_business_decision_attachment_links AS (
  ${buildBusinessDecisionAttachmentLinksCte(attachmentLinks, parameters, "inserted_business_decision")}
)`;
}

function applyDecisionWorkspaceMutation(workspace, businessDecision, attachmentLinks = []) {
  const decision = normalizeDecisionRecord(businessDecision);
  if (!workspace || !decision) return;
  workspace.businessDecisionRecords = [
    decision,
    ...(workspace.businessDecisionRecords ?? []).filter((item) => String(item.id ?? item.businessDecisionId ?? "") !== decision.id),
  ];
  for (const link of Array.isArray(attachmentLinks) ? attachmentLinks : []) {
    workspace.attachmentLinks = [
      link,
      ...(workspace.attachmentLinks ?? []).filter((item) => String(item.id ?? "") !== String(link.id ?? "")),
    ];
  }
}

export function normalizeVarianceTransactionResult(value) {
  if (!value || typeof value !== "object") {
    return { statement: null, varianceRecord: null, todo: null, businessDecision: null, operationLogId: "" };
  }
  return {
    statement: normalizeStatementForApi(value.statement),
    varianceRecord: normalizeVarianceRecord(value.varianceRecord),
    todo: normalizeTodoForApi(value.todo),
    businessDecision: normalizeDecisionRecord(value.businessDecision ?? value.business_decision),
    operationLogId: String(value.operationLogId ?? value.operation_log_id ?? "").trim(),
  };
}

export function normalizeWriteOffTransactionResult(value) {
  if (!value || typeof value !== "object") {
    return { statement: null, writeOffRecord: null, businessDecision: null, operationLogId: "" };
  }
  return {
    statement: normalizeStatementForApi(value.statement),
    writeOffRecord: normalizeStatementWriteOffRecord(value.writeOffRecord ?? value.write_off_record),
    businessDecision: normalizeDecisionRecord(value.businessDecision ?? value.business_decision),
    operationLogId: String(value.operationLogId ?? value.operation_log_id ?? "").trim(),
  };
}

function applySettlementWorkspaceMutation({ workspace, statements, statement, varianceRecord, writeOffRecord, todo, operationLog }) {
  if (Array.isArray(statements)) {
    workspace.statements = statements.map((item) => (item.id === statement?.id ? { ...item, ...statement } : item));
  } else if (statement?.id) {
    workspace.statements = workspace.statements.map((item) => (item.id === statement.id ? { ...item, ...statement } : item));
  }
  const normalizedVariance = normalizeVarianceRecord(varianceRecord);
  if (normalizedVariance) {
    workspace.varianceRecords = [
      normalizedVariance,
      ...(workspace.varianceRecords ?? []).filter(
        (item) => (item.varianceRecordId ?? item.id) !== normalizedVariance.varianceRecordId,
      ),
    ];
  }
  if (todo) workspace.todos = [todo, ...(workspace.todos ?? []).filter((item) => item.id !== todo.id)];
  const normalizedWriteOff = normalizeStatementWriteOffRecord(writeOffRecord);
  if (normalizedWriteOff) {
    workspace.statementWriteOffRecords = [
      normalizedWriteOff,
      ...(workspace.statementWriteOffRecords ?? []).filter((item) => String(item.id ?? item.statementWriteOffRecordId ?? "") !== normalizedWriteOff.id),
    ];
  }
  if (operationLog) {
    workspace.operationLogs = [
      operationLog,
      ...(workspace.operationLogs ?? []).filter((item) => item.id !== operationLog.id),
    ];
  }
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

function normalizeVarianceRecord(record) {
  if (!record || typeof record !== "object") return null;
  const varianceRecordId = String(record.varianceRecordId ?? record.id ?? "").trim();
  const statementId = String(record.statementId ?? record.statement_id ?? "").trim();
  const amount = Number(record.amount ?? record.varianceAmount ?? record.variance_amount ?? 0);
  if (!varianceRecordId || !statementId) return null;
  return {
    varianceRecordId,
    statementId,
    paymentRecordId: String(record.paymentRecordId ?? record.payment_record_id ?? "").trim(),
    amount,
    handlingResult: String(record.handlingResult ?? record.handling_result ?? "").trim(),
    reason: String(record.reason ?? "").trim(),
    status: String(record.status ?? "recorded").trim() || "recorded",
    attachmentId: String(record.attachmentId ?? record.attachment_id ?? "").trim(),
    operatorId: String(record.operatorId ?? record.createdBy ?? record.created_by ?? "").trim(),
  };
}

function normalizeStatementWriteOffRecord(record) {
  if (!record || typeof record !== "object") return null;
  const id = String(record.id ?? record.statementWriteOffRecordId ?? record.statement_write_off_record_id ?? "").trim();
  const statementId = String(record.statementId ?? record.statement_id ?? "").trim();
  if (!id || !statementId) return null;
  return {
    id,
    statementWriteOffRecordId: id,
    statementId,
    receivableSnapshot: Number(record.receivableSnapshot ?? record.receivable_snapshot ?? 0),
    receivedSnapshot: Number(record.receivedSnapshot ?? record.received_snapshot ?? 0),
    varianceSnapshot: Number(record.varianceSnapshot ?? record.variance_snapshot ?? 0),
    writeOffAmount: Number(record.writeOffAmount ?? record.write_off_amount ?? 0),
    handlingResult: String(record.handlingResult ?? record.handling_result ?? "").trim(),
    businessDecisionId: String(record.businessDecisionId ?? record.business_decision_id ?? "").trim(),
    recordedBy: String(record.recordedBy ?? record.recorded_by ?? "").trim(),
    revision: Math.max(1, Number(record.revision ?? 1) || 1),
    operationLogId: String(record.operationLogId ?? record.operation_log_id ?? "").trim(),
    createdAt: String(record.createdAt ?? record.created_at ?? "").trim(),
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

function varianceRecordJsonExpression(alias) {
  return `json_build_object(
    'varianceRecordId', ${alias}.id,
    'statementId', ${alias}.statement_id,
    'paymentRecordId', ${alias}.payment_record_id,
    'amount', ${alias}.variance_amount,
    'handlingResult', ${alias}.handling_result,
    'reason', ${alias}.reason,
    'status', ${alias}.status,
    'attachmentId', ${alias}.attachment_id,
    'operatorId', ${alias}.created_by
  )`;
}

function statementWriteOffJsonExpression(alias) {
  return `json_build_object(
    'statementWriteOffRecordId', ${alias}.id,
    'statementId', ${alias}.statement_id,
    'receivableSnapshot', ${alias}.receivable_snapshot,
    'receivedSnapshot', ${alias}.received_snapshot,
    'varianceSnapshot', ${alias}.variance_snapshot,
    'writeOffAmount', ${alias}.write_off_amount,
    'handlingResult', ${alias}.handling_result,
    'businessDecisionId', ${alias}.business_decision_id,
    'recordedBy', ${alias}.recorded_by,
    'revision', ${alias}.revision,
    'operationLogId', ${alias}.operation_log_id,
    'createdAt', ${alias}.created_at
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
