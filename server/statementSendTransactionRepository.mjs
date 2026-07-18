import { createPostgresParameterBinder } from "./postgresSqlParameters.mjs";
import { createPostgresTransactionExecutor } from "./postgresTransactionExecutor.mjs";
import { buildPostgresIdempotencyRequest, resolveRepositoryIdempotencyKey } from "./idempotency.mjs";

export function createStatementSendTransactionRepository(options = {}) {
  const mode =
    options.mode ??
    process.env.ERP_STATEMENT_SEND_TRANSACTION_STORE ??
    process.env.ERP_STATEMENT_STORE ??
    "local";
  if (mode === "postgres") {
    return createPostgresStatementSendTransactionRepository({
      databaseUrl:
        options.databaseUrl ?? process.env.ERP_STATEMENT_DATABASE_URL ?? process.env.DATABASE_URL ?? process.env.PGURL,
      queryJson: options.queryJson,
      transactionJson: options.transactionJson,
      idempotentTransactionJson: options.idempotentTransactionJson,
      postgresClient: options.postgresClient,
    });
  }
  if (mode === "local") return createLocalStatementSendTransactionRepository();
  throw new Error(`Unsupported statement send transaction repository mode: ${mode}`);
}

export function createLocalStatementSendTransactionRepository() {
  return {
    kind: "local_memory",

    markStatementSent(input) {
      const statement = buildLocalSavedStatement(input);
      const statements = replaceStatement(input.statements, statement);
      applyStatementSendWorkspaceMutation({ ...input, statements, statement });
      return normalizeStatementSendTransactionResult({
        statement,
        sendRecord: input.sendRecord,
        operationLogId: input.operationLog?.id ?? "",
      });
    },

    markStatementSendReceipt(input) {
      const sendRecord = buildLocalSavedSendRecord(input);
      applyStatementSendReceiptWorkspaceMutation({ ...input, sendRecord });
      return normalizeStatementSendReceiptTransactionResult({
        sendRecord,
        operationLogId: input.operationLog?.id ?? "",
      });
    },

    recordStatementCustomerConfirmation(input) {
      const statement = buildLocalSavedStatement(input);
      const sendRecord = buildLocalSavedSendRecord(input);
      const statements = replaceStatement(input.statements, statement);
      applyStatementCustomerConfirmationWorkspaceMutation({ ...input, statements, statement, sendRecord });
      return normalizeStatementCustomerConfirmationTransactionResult({
        statement,
        sendRecord,
        confirmationRecord: input.confirmationRecord,
        operationLogId: input.operationLog?.id ?? "",
      });
    },
  };
}

export function createPostgresStatementSendTransactionRepository(options = {}) {
  const { idempotentTransactionJson } = createPostgresTransactionExecutor(options);

  return {
    kind: "postgres",

    async markStatementSent(input) {
      const query = buildMarkStatementSentTransactionQuery(input);
      const statementId = input.statement?.id ?? input.statement?.statementId ?? "";
      const saved = normalizeStatementSendTransactionResult(
        await idempotentTransactionJson(
          buildPostgresIdempotencyRequest({
            scope: "statement.send.mark",
            idempotencyKey: resolveRepositoryIdempotencyKey(input.idempotencyKey, input.operationLog?.id),
            payload: input.idempotencyPayload ?? { statementId, sendRecord: input.sendRecord },
            operatorId: input.operationLog?.operatorId,
            targetType: "statement",
            targetId: statementId,
            resourceLocks: [`statement:${statementId}`],
            query,
          }),
        ),
      );
      if (!saved.statement || !saved.sendRecord) {
        throw new Error("PostgreSQL statement send transaction returned an invalid result");
      }
      applyStatementSendWorkspaceMutation({
        ...input,
        statement: saved.statement,
        sendRecord: saved.sendRecord,
        operationLog: saved.operationLogId === input.operationLog?.id ? input.operationLog : null,
      });
      return saved;
    },

    async markStatementSendReceipt(input) {
      const query = buildMarkStatementSendReceiptTransactionQuery(input);
      const sendRecordId = input.sendRecord?.sendRecordId ?? input.sendRecord?.id ?? "";
      const saved = normalizeStatementSendReceiptTransactionResult(
        await idempotentTransactionJson(
          buildPostgresIdempotencyRequest({
            scope: "statement.send.receipt",
            idempotencyKey: resolveRepositoryIdempotencyKey(input.idempotencyKey, input.operationLog?.id),
            payload: input.idempotencyPayload ?? { sendRecordId, sendRecord: input.sendRecord },
            operatorId: input.operationLog?.operatorId,
            targetType: "statement_send_record",
            targetId: sendRecordId,
            resourceLocks: [`statement-send-record:${sendRecordId}`],
            query,
          }),
        ),
      );
      if (!saved.sendRecord) {
        throw new Error("PostgreSQL statement send receipt transaction returned an invalid result");
      }
      applyStatementSendReceiptWorkspaceMutation({
        ...input,
        sendRecord: saved.sendRecord,
        operationLog: saved.operationLogId === input.operationLog?.id ? input.operationLog : null,
      });
      return saved;
    },

    async recordStatementCustomerConfirmation(input) {
      const query = buildRecordStatementCustomerConfirmationTransactionQuery(input);
      const statementId = input.statement?.id ?? input.statement?.statementId ?? "";
      const sendRecordId = input.sendRecord?.sendRecordId ?? input.sendRecord?.id ?? "";
      const saved = normalizeStatementCustomerConfirmationTransactionResult(
        await idempotentTransactionJson(
          buildPostgresIdempotencyRequest({
            scope: "statement.customer_confirmation.record",
            idempotencyKey: resolveRepositoryIdempotencyKey(input.idempotencyKey, input.operationLog?.id),
            payload: input.idempotencyPayload ?? {
              statementId,
              sendRecordId,
              confirmationRecord: input.confirmationRecord,
            },
            operatorId: input.operationLog?.operatorId,
            targetType: "statement",
            targetId: statementId,
            resourceLocks: [`statement:${statementId}`, `statement-send-record:${sendRecordId}`],
            query,
          }),
        ),
      );
      if (!saved.statement || !saved.sendRecord || !saved.confirmationRecord) {
        throw new Error("PostgreSQL statement customer confirmation transaction returned an invalid result");
      }
      applyStatementCustomerConfirmationWorkspaceMutation({
        ...input,
        statement: saved.statement,
        sendRecord: saved.sendRecord,
        confirmationRecord: saved.confirmationRecord,
        operationLog: saved.operationLogId === input.operationLog?.id ? input.operationLog : null,
      });
      return saved;
    },
  };
}

export function buildMarkStatementSentTransactionSql(input) {
  return buildMarkStatementSentTransactionQuery(input).text;
}

export function buildMarkStatementSentTransactionQuery(input) {
  const parameters = createPostgresParameterBinder();
  return {
    text: buildMarkStatementSentTransactionText(input, parameters),
    values: parameters.values,
  };
}

function buildMarkStatementSentTransactionText(input, parameters) {
  const statement = normalizeStatementForPersistence(input.statement);
  const sendRecord = normalizeStatementSendRecord(input.sendRecord);
  const operationLog = normalizeOperationLogForPersistence(input.operationLog);
  if (!statement || !sendRecord || !operationLog) {
    throw new Error("Statement, send record, and operation log are required for statement send transaction");
  }
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
    receivable_amount = ${parameters.number(statement.receivable)},
    received_amount = ${parameters.number(statement.received)},
    variance_amount = ${parameters.number(statement.variance)},
    last_sent_at = ${parameters.timestamp(sendRecord.sentAt)},
    revision = statements.revision + 1,
    updated_at = now()
  FROM locked_statement AS locked
  WHERE statements.id = locked.id
    AND locked.revision = ${parameters.integer(statement.revision)}
  RETURNING ${statementJsonExpression("statements")} AS result
),
statement_write_guard AS MATERIALIZED (
  SELECT erp_require(
    (SELECT COUNT(*) FROM updated_statement) = 1,
    'ERP_STATEMENT_CONCURRENCY_CONFLICT'
  ) AS ok
),
inserted_send_record AS (
  INSERT INTO statement_send_records (
    id,
    statement_id,
    channel,
    sent_to,
    export_file_id,
    include_payment_qr,
    sent_by,
    sent_at,
    remark,
    revision
  ) SELECT
    ${parameters.text(sendRecord.sendRecordId)},
    ${parameters.text(sendRecord.statementId)},
    ${parameters.text(sendRecord.channel)},
    ${parameters.nullableText(sendRecord.sentTo)},
    ${parameters.nullableText(sendRecord.exportFileId)},
    ${parameters.boolean(sendRecord.includePaymentQr)},
    ${parameters.nullableText(sendRecord.sentBy)},
    ${parameters.timestamp(sendRecord.sentAt)},
    ${parameters.text(sendRecord.remark)},
    ${parameters.integer(sendRecord.revision)}
  FROM statement_write_guard
  WHERE ok
  ON CONFLICT (id) DO UPDATE SET
    statement_id = EXCLUDED.statement_id,
    channel = EXCLUDED.channel,
    sent_to = EXCLUDED.sent_to,
    export_file_id = EXCLUDED.export_file_id,
    include_payment_qr = EXCLUDED.include_payment_qr,
    sent_by = EXCLUDED.sent_by,
    sent_at = EXCLUDED.sent_at,
    remark = EXCLUDED.remark,
    revision = statement_send_records.revision + 1
  RETURNING ${sendRecordJsonExpression("statement_send_records")} AS result
),
inserted_operation_log AS (
  ${buildInsertOperationLogSql(operationLog, parameters, "statement_write_guard")}
)
SELECT json_build_object(
  'statement', (SELECT result FROM updated_statement),
  'sendRecord', (SELECT result FROM inserted_send_record),
  'operationLogId', (SELECT id FROM inserted_operation_log),
  'writeGuard', (SELECT ok FROM statement_write_guard)
) AS result;
COMMIT;
`.trim();
}

export function buildMarkStatementSendReceiptTransactionSql(input) {
  return buildMarkStatementSendReceiptTransactionQuery(input).text;
}

export function buildMarkStatementSendReceiptTransactionQuery(input) {
  const parameters = createPostgresParameterBinder();
  return {
    text: buildMarkStatementSendReceiptTransactionText(input, parameters),
    values: parameters.values,
  };
}

function buildMarkStatementSendReceiptTransactionText(input, parameters) {
  const sendRecord = normalizeStatementSendRecord(input.sendRecord);
  const operationLog = normalizeOperationLogForPersistence(input.operationLog);
  if (!sendRecord || !operationLog) {
    throw new Error("Send record and operation log are required for statement send receipt transaction");
  }
  return `
BEGIN;
WITH locked_send_record AS MATERIALIZED (
  SELECT id, revision
  FROM statement_send_records
  WHERE id = ${parameters.text(sendRecord.sendRecordId)}
  FOR UPDATE
),
updated_send_record AS (
  UPDATE statement_send_records
  SET
    receipt_status = ${parameters.text(sendRecord.receiptStatus)},
    receipt_at = ${parameters.timestamp(sendRecord.receiptAt)},
    receipt_by = ${parameters.nullableText(sendRecord.receiptBy)},
    receipt_note = ${parameters.text(sendRecord.receiptNote)},
    revision = statement_send_records.revision + 1
  FROM locked_send_record AS locked
  WHERE statement_send_records.id = locked.id
    AND locked.revision = ${parameters.integer(sendRecord.revision)}
  RETURNING ${sendRecordJsonExpression("statement_send_records")} AS result
),
send_record_write_guard AS MATERIALIZED (
  SELECT erp_require(
    (SELECT COUNT(*) FROM updated_send_record) = 1,
    'ERP_STATEMENT_SEND_RECORD_CONCURRENCY_CONFLICT'
  ) AS ok
),
inserted_operation_log AS (
  ${buildInsertOperationLogSql(operationLog, parameters, "send_record_write_guard")}
)
SELECT json_build_object(
  'sendRecord', (SELECT result FROM updated_send_record),
  'operationLogId', (SELECT id FROM inserted_operation_log),
  'writeGuard', (SELECT ok FROM send_record_write_guard)
) AS result;
COMMIT;
`.trim();
}

export function buildRecordStatementCustomerConfirmationTransactionSql(input) {
  return buildRecordStatementCustomerConfirmationTransactionQuery(input).text;
}

export function buildRecordStatementCustomerConfirmationTransactionQuery(input) {
  const parameters = createPostgresParameterBinder();
  return {
    text: buildRecordStatementCustomerConfirmationTransactionText(input, parameters),
    values: parameters.values,
  };
}

function buildRecordStatementCustomerConfirmationTransactionText(input, parameters) {
  const statement = normalizeStatementForPersistence(input.statement);
  const sendRecord = normalizeStatementSendRecord(input.sendRecord);
  const confirmationRecord = normalizeStatementConfirmationRecord(input.confirmationRecord);
  const operationLog = normalizeOperationLogForPersistence(input.operationLog);
  if (!statement || !sendRecord || !confirmationRecord || !operationLog) {
    throw new Error("Statement, send record, confirmation record, and operation log are required for statement customer confirmation transaction");
  }
  return `
BEGIN;
WITH locked_statement AS MATERIALIZED (
  SELECT id, revision
  FROM statements
  WHERE id = ${parameters.text(statement.id)}
  FOR UPDATE
),
locked_send_record AS MATERIALIZED (
  SELECT id, revision
  FROM statement_send_records
  WHERE id = ${parameters.text(sendRecord.sendRecordId)}
  FOR UPDATE
),
updated_statement AS (
  UPDATE statements
  SET
    status = ${parameters.text(statement.status)},
    receivable_amount = ${parameters.number(statement.receivable)},
    received_amount = ${parameters.number(statement.received)},
    variance_amount = ${parameters.number(statement.variance)},
    revision = statements.revision + 1,
    updated_at = now()
  FROM locked_statement AS locked
  WHERE statements.id = locked.id
    AND locked.revision = ${parameters.integer(statement.revision)}
  RETURNING ${statementJsonExpression("statements")} AS result
),
updated_send_record AS (
  UPDATE statement_send_records
  SET
    receipt_status = ${parameters.text(sendRecord.receiptStatus)},
    receipt_at = ${parameters.timestamp(sendRecord.receiptAt)},
    receipt_by = ${parameters.nullableText(sendRecord.receiptBy)},
    receipt_note = ${parameters.text(sendRecord.receiptNote)},
    revision = statement_send_records.revision + 1
  FROM locked_send_record AS locked
  WHERE statement_send_records.id = locked.id
    AND locked.revision = ${parameters.integer(sendRecord.revision)}
  RETURNING ${sendRecordJsonExpression("statement_send_records")} AS result
),
communication_write_guard AS MATERIALIZED (
  SELECT erp_require(
    (SELECT COUNT(*) FROM updated_statement) = 1,
    'ERP_STATEMENT_CONCURRENCY_CONFLICT'
  )
  AND erp_require(
    (SELECT COUNT(*) FROM updated_send_record) = 1,
    'ERP_STATEMENT_SEND_RECORD_CONCURRENCY_CONFLICT'
  ) AS ok
),
inserted_confirmation AS (
  INSERT INTO statement_confirmation_records (
    id,
    statement_id,
    send_record_id,
    confirmation_type,
    channel,
    confirmed_by_customer,
    confirmed_at,
    content,
    attachment_ids_json,
    recorded_by,
    operation_log_id,
    created_at
  ) SELECT
    ${parameters.text(confirmationRecord.confirmationRecordId)},
    ${parameters.text(confirmationRecord.statementId)},
    ${parameters.nullableText(confirmationRecord.sendRecordId)},
    ${parameters.text(confirmationRecord.confirmationType)},
    ${parameters.text(confirmationRecord.channel)},
    ${parameters.text(confirmationRecord.confirmedByCustomer)},
    ${parameters.timestamp(confirmationRecord.confirmedAt)},
    ${parameters.text(confirmationRecord.content)},
    ${parameters.json(confirmationRecord.attachmentIds)},
    ${parameters.nullableText(confirmationRecord.recordedBy)},
    ${parameters.text(operationLog.id)},
    now()
  FROM communication_write_guard
  WHERE ok
  ON CONFLICT (id) DO UPDATE SET
    statement_id = EXCLUDED.statement_id,
    send_record_id = EXCLUDED.send_record_id,
    confirmation_type = EXCLUDED.confirmation_type,
    channel = EXCLUDED.channel,
    confirmed_by_customer = EXCLUDED.confirmed_by_customer,
    confirmed_at = EXCLUDED.confirmed_at,
    content = EXCLUDED.content,
    attachment_ids_json = EXCLUDED.attachment_ids_json,
    recorded_by = EXCLUDED.recorded_by,
    operation_log_id = EXCLUDED.operation_log_id
  RETURNING ${confirmationRecordJsonExpression("statement_confirmation_records")} AS result
),
inserted_operation_log AS (
  ${buildInsertOperationLogSql(operationLog, parameters, "communication_write_guard")}
)
SELECT json_build_object(
  'statement', (SELECT result FROM updated_statement),
  'sendRecord', (SELECT result FROM updated_send_record),
  'confirmationRecord', (SELECT result FROM inserted_confirmation),
  'operationLogId', (SELECT id FROM inserted_operation_log),
  'writeGuard', (SELECT ok FROM communication_write_guard)
) AS result;
COMMIT;
`.trim();
}

function buildInsertOperationLogSql(operationLog, parameters, guardCte = "") {
  const values = `
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
    ${parameters.timestamp(operationLog.createdAt)}`;
  const guardedValues = guardCte ? `SELECT${values}\n  FROM ${guardCte}\n  WHERE ok` : `VALUES (${values}\n  )`;
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
) ${guardedValues}
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

export function normalizeStatementSendTransactionResult(value) {
  if (!value || typeof value !== "object") {
    return { statement: null, sendRecord: null, operationLogId: "" };
  }
  return {
    statement: normalizeStatementForApi(value.statement),
    sendRecord: normalizeStatementSendRecord(value.sendRecord),
    operationLogId: String(value.operationLogId ?? value.operation_log_id ?? "").trim(),
  };
}

export function normalizeStatementSendReceiptTransactionResult(value) {
  if (!value || typeof value !== "object") {
    return { sendRecord: null, operationLogId: "" };
  }
  return {
    sendRecord: normalizeStatementSendRecord(value.sendRecord),
    operationLogId: String(value.operationLogId ?? value.operation_log_id ?? "").trim(),
  };
}

export function normalizeStatementCustomerConfirmationTransactionResult(value) {
  if (!value || typeof value !== "object") {
    return { statement: null, sendRecord: null, confirmationRecord: null, operationLogId: "" };
  }
  return {
    statement: normalizeStatementForApi(value.statement),
    sendRecord: normalizeStatementSendRecord(value.sendRecord),
    confirmationRecord: normalizeStatementConfirmationRecord(value.confirmationRecord),
    operationLogId: String(value.operationLogId ?? value.operation_log_id ?? "").trim(),
  };
}

function buildLocalSavedStatement(input) {
  const expected = Number(input.statement?.revision ?? 0);
  const current = (input.workspace?.statements ?? []).find((item) => item.id === input.statement?.id);
  if (!current || Number(current.revision ?? 1) !== expected) throw statementWriteConflict(current?.revision);
  return { ...input.statement, revision: expected + 1 };
}

function buildLocalSavedSendRecord(input) {
  const expected = Number(input.sendRecord?.revision ?? 0);
  const sendRecordId = input.sendRecord?.sendRecordId ?? input.sendRecord?.id;
  const current = (input.workspace?.statementSendRecords ?? []).find(
    (item) => (item.sendRecordId ?? item.id) === sendRecordId,
  );
  if (!current || Number(current.revision ?? 1) !== expected) throw statementWriteConflict(current?.revision);
  return { ...input.sendRecord, revision: expected + 1 };
}

function replaceStatement(statements, saved) {
  return (Array.isArray(statements) ? statements : []).map((item) => item.id === saved.id ? { ...item, ...saved } : item);
}

function statementWriteConflict(currentRevision) {
  const error = new Error("该记录已被另一位办公室人员更新，请刷新后重新确认。");
  error.statusCode = 409;
  error.code = "BUSINESS_WRITE_CONFLICT";
  error.details = { currentRevision: Number(currentRevision ?? 0) };
  return error;
}

function applyStatementSendWorkspaceMutation({ workspace, statements, statement, sendRecord, operationLog }) {
  if (Array.isArray(statements)) {
    workspace.statements = statements.map((item) =>
      item.id === statement?.id ? { ...item, ...statement } : item,
    );
  } else if (statement?.id) {
    workspace.statements = workspace.statements.map((item) => (item.id === statement.id ? { ...item, ...statement } : item));
  }
  const normalizedSendRecord = normalizeStatementSendRecord(sendRecord);
  if (normalizedSendRecord) {
    workspace.statementSendRecords = workspace.statementSendRecords ?? [];
    workspace.statementSendRecords = [
      normalizedSendRecord,
      ...workspace.statementSendRecords.filter((item) => item.sendRecordId !== normalizedSendRecord.sendRecordId),
    ];
  }
  upsertOperationLog(workspace, operationLog);
}

function applyStatementSendReceiptWorkspaceMutation({ workspace, sendRecord, operationLog }) {
  const normalizedSendRecord = normalizeStatementSendRecord(sendRecord);
  if (normalizedSendRecord) {
    workspace.statementSendRecords = (workspace.statementSendRecords ?? []).map((item) =>
      item.sendRecordId === normalizedSendRecord.sendRecordId ? { ...item, ...normalizedSendRecord } : item,
    );
  }
  upsertOperationLog(workspace, operationLog);
}

function applyStatementCustomerConfirmationWorkspaceMutation({
  workspace,
  statements,
  statement,
  sendRecord,
  confirmationRecord,
  operationLog,
}) {
  if (Array.isArray(statements)) {
    workspace.statements = statements.map((item) =>
      item.id === statement?.id ? { ...item, ...statement } : item,
    );
  } else if (statement?.id) {
    workspace.statements = workspace.statements.map((item) => (item.id === statement.id ? { ...item, ...statement } : item));
  }
  const normalizedSendRecord = normalizeStatementSendRecord(sendRecord);
  if (normalizedSendRecord) {
    workspace.statementSendRecords = (workspace.statementSendRecords ?? []).map((item) =>
      item.sendRecordId === normalizedSendRecord.sendRecordId ? { ...item, ...normalizedSendRecord } : item,
    );
  }
  const normalizedConfirmationRecord = normalizeStatementConfirmationRecord(confirmationRecord);
  if (normalizedConfirmationRecord) {
    workspace.statementConfirmationRecords = workspace.statementConfirmationRecords ?? [];
    workspace.statementConfirmationRecords = [
      normalizedConfirmationRecord,
      ...workspace.statementConfirmationRecords.filter(
        (item) => item.confirmationRecordId !== normalizedConfirmationRecord.confirmationRecordId,
      ),
    ];
  }
  upsertOperationLog(workspace, operationLog);
}

function upsertOperationLog(workspace, operationLog) {
  if (!operationLog) return;
  workspace.operationLogs = workspace.operationLogs ?? [];
  workspace.operationLogs = [operationLog, ...workspace.operationLogs.filter((item) => item.id !== operationLog.id)];
}

function normalizeStatementForPersistence(statement) {
  if (!statement || typeof statement !== "object") return null;
  const id = String(statement.id ?? statement.statementId ?? "").trim();
  if (!id) return null;
  return {
    id,
    customerId: String(statement.customerId ?? statement.customer_id ?? "").trim(),
    status: String(statement.status ?? "").trim(),
    receivable: Number(statement.receivable ?? statement.receivableAmount ?? 0),
    received: Number(statement.received ?? statement.receivedAmount ?? 0),
    variance: Number(statement.variance ?? statement.varianceAmount ?? 0),
    lastSentAt: statement.lastSentAt ?? statement.last_sent_at ?? statement.sentAt ?? "",
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
    lastSentAt: String(statement.lastSentAt ?? statement.last_sent_at ?? "").trim(),
    revision: Math.max(1, Number(statement.revision ?? 1) || 1),
  };
}

function normalizeStatementSendRecord(record) {
  if (!record || typeof record !== "object") return null;
  const sendRecordId = String(record.sendRecordId ?? record.id ?? "").trim();
  const statementId = String(record.statementId ?? record.statement_id ?? "").trim();
  if (!sendRecordId || !statementId) return null;
  return {
    sendRecordId,
    statementId,
    channel: String(record.channel ?? "").trim() || "wechat",
    sentTo: String(record.sentTo ?? record.sent_to ?? "").trim(),
    exportFileId: String(record.exportFileId ?? record.export_file_id ?? "").trim(),
    includePaymentQr: Boolean(record.includePaymentQr ?? record.include_payment_qr ?? false),
    sentBy: String(record.sentBy ?? record.sent_by ?? record.operatorId ?? "").trim(),
    sentAt: String(record.sentAt ?? record.sent_at ?? new Date().toISOString()).trim(),
    remark: String(record.remark ?? "").trim(),
    receiptStatus: normalizeStatementReceiptStatus(record.receiptStatus ?? record.receipt_status),
    receiptAt: String(record.receiptAt ?? record.receipt_at ?? "").trim(),
    receiptBy: String(record.receiptBy ?? record.receipt_by ?? "").trim(),
    receiptNote: String(record.receiptNote ?? record.receipt_note ?? "").trim(),
    revision: Math.max(1, Number(record.revision ?? 1) || 1),
  };
}

function normalizeStatementConfirmationRecord(record) {
  if (!record || typeof record !== "object") return null;
  const confirmationRecordId = String(record.confirmationRecordId ?? record.id ?? "").trim();
  const statementId = String(record.statementId ?? record.statement_id ?? "").trim();
  if (!confirmationRecordId || !statementId) return null;
  const rawAttachmentIds = record.attachmentIds ?? record.attachment_ids ?? record.attachment_ids_json ?? [];
  const attachmentIds = Array.isArray(rawAttachmentIds)
    ? rawAttachmentIds.map((item) => String(item ?? "").trim()).filter(Boolean)
    : [];
  return {
    confirmationRecordId,
    statementId,
    sendRecordId: String(record.sendRecordId ?? record.send_record_id ?? "").trim(),
    confirmationType: String(record.confirmationType ?? record.confirmation_type ?? "").trim() || "customer_reply",
    channel: String(record.channel ?? "").trim() || "wechat",
    confirmedByCustomer: String(record.confirmedByCustomer ?? record.confirmed_by_customer ?? "").trim(),
    confirmedAt: String(record.confirmedAt ?? record.confirmed_at ?? new Date().toISOString()).trim(),
    content: String(record.content ?? "").trim(),
    attachmentIds,
    recordedBy: String(record.recordedBy ?? record.recorded_by ?? record.operatorId ?? "").trim(),
    operationLogId: String(record.operationLogId ?? record.operation_log_id ?? "").trim(),
  };
}

function normalizeStatementReceiptStatus(value) {
  const status = String(value ?? "").trim();
  if (["pending", "delivered", "read", "confirmed", "no_response"].includes(status)) return status;
  return "pending";
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
    'lastSentAt', ${alias}.last_sent_at,
    'revision', ${alias}.revision
  )`;
}

function sendRecordJsonExpression(alias) {
  return `json_build_object(
    'sendRecordId', ${alias}.id,
    'statementId', ${alias}.statement_id,
    'channel', ${alias}.channel,
    'sentTo', ${alias}.sent_to,
    'exportFileId', ${alias}.export_file_id,
    'includePaymentQr', ${alias}.include_payment_qr,
    'sentBy', ${alias}.sent_by,
    'sentAt', ${alias}.sent_at,
    'remark', ${alias}.remark,
    'receiptStatus', ${alias}.receipt_status,
    'receiptAt', ${alias}.receipt_at,
    'receiptBy', ${alias}.receipt_by,
    'receiptNote', ${alias}.receipt_note,
    'revision', ${alias}.revision
  )`;
}

function confirmationRecordJsonExpression(alias) {
  return `json_build_object(
    'confirmationRecordId', ${alias}.id,
    'statementId', ${alias}.statement_id,
    'sendRecordId', ${alias}.send_record_id,
    'confirmationType', ${alias}.confirmation_type,
    'channel', ${alias}.channel,
    'confirmedByCustomer', ${alias}.confirmed_by_customer,
    'confirmedAt', ${alias}.confirmed_at,
    'content', ${alias}.content,
    'attachmentIds', ${alias}.attachment_ids_json,
    'recordedBy', ${alias}.recorded_by,
    'operationLogId', ${alias}.operation_log_id
  )`;
}
