import { isDeepStrictEqual } from "node:util";
import { createPostgresTransactionExecutor } from "./postgresTransactionExecutor.mjs";
import { createPostgresParameterBinder } from "./postgresSqlParameters.mjs";
import { buildPostgresIdempotencyRequest, readPostgresIdempotencyReplay, buildIdempotencyRequestHash, buildIdempotencyConflictError } from "./idempotency.mjs";
import { closedStatementPaymentStatuses } from "../shared/statementPaymentPolicy.js";
import { exactPaymentError, validateExactPaymentEvidence } from "./services/statementExactPaymentPolicy.mjs";

const scope = "statement.exact_payment.settle";
export function createStatementExactPaymentTransaction({ kind, ...options } = {}) {
  const executor = kind === "postgres" ? createPostgresTransactionExecutor(options) : null;
  async function findExactPaymentReplay({ workspace, idempotencyKey, payload }) {
    if (executor) return readPostgresIdempotencyReplay({ queryJson: executor.queryJson, scope, idempotencyKey, payload });
    const saved = (workspace.operationIdempotencyRecords ?? []).find(row => row.scope === scope && row.idempotencyKey === idempotencyKey);
    if (!saved) return null;
    if (saved.requestHash !== buildIdempotencyRequestHash(payload)) throw buildIdempotencyConflictError();
    return structuredClone(saved.response);
  }
  async function settleExactPayment(input) {
    const replay = await findExactPaymentReplay(input);
    if (replay) return replay;
    const { workspace, body, operatorId, record, operationLog } = input;
    const current = workspace.statements.find(row => row.id === input.statement.id);
    const evidence = validateExactPaymentEvidence(workspace, current, body, operatorId);
    if (record.statementId !== current.id || record.recordedBy !== operatorId || record.settlementKind !== "office_exact_payment"
      || record.businessDecisionId || record.writeOffAmount !== 0 || record.varianceSnapshot !== 0
      || record.receivableSnapshot !== evidence.receivable || record.receivedSnapshot !== evidence.received
      || !isDeepStrictEqual({ ...record.receiptConfirmation, confirmedAt: undefined }, { ...evidence, confirmedAt: undefined }))
      throw exactPaymentError("足额结清快照与当前证据不一致。");
    let result;
    if (executor) {
      result = await executor.idempotentTransactionJson(buildPostgresIdempotencyRequest({ scope,
        idempotencyKey: input.idempotencyKey, payload: input.payload, operatorId, targetType: "statement", targetId: current.id,
        resourceLocks: [`statement:${current.id}`], query: buildExactPaymentQuery(input) }));
    } else {
      if ((workspace.statementWriteOffRecords ?? []).some(row => (row.id ?? row.statementWriteOffRecordId) === record.id)
        || (workspace.operationLogs ?? []).some(row => row.id === operationLog.id)) throw exactPaymentError("结清记录已存在，未覆盖旧记录。");
      result = { statementId: current.id, status: "已结清", statementStatus: "已结清", statementRevision: Number(current.revision) + 1,
        receivable: evidence.receivable, received: evidence.received, variance: 0, operationLogId: operationLog.id, writeOffRecord: structuredClone(record) };
    }
    if (!result || result.statementId !== current.id || !result.writeOffRecord || !result.operationLogId)
      throw new Error("Exact payment transaction returned an incomplete receipt");
    const latest = workspace.statements.find(row => row.id === current.id);
    if (Number(latest?.revision) < result.statementRevision) workspace.statements = workspace.statements.map(row => row.id === current.id
      ? { ...row, status: "已核销", revision: result.statementRevision } : row);
    workspace.statementWriteOffRecords = [result.writeOffRecord, ...(workspace.statementWriteOffRecords ?? []).filter(row => (row.id ?? row.statementWriteOffRecordId) !== record.id)];
    workspace.operationLogs = [operationLog, ...(workspace.operationLogs ?? []).filter(row => row.id !== operationLog.id)];
    if (!executor) workspace.operationIdempotencyRecords = [...(workspace.operationIdempotencyRecords ?? []), {
      scope, idempotencyKey: input.idempotencyKey, requestHash: buildIdempotencyRequestHash(input.payload), response: structuredClone(result) }];
    return result;
  }
  return { findExactPaymentReplay, settleExactPayment };
}

export function buildExactPaymentQuery({ statement, body, operatorId, record, operationLog }) {
  const p = createPostgresParameterBinder(), s = id => p.text(id), e = record.receiptConfirmation;
  const attachment = (id, purpose, customer) => `SELECT a.id FROM attachments a JOIN attachment_links link ON link.attachment_id=a.id
    WHERE a.id=${s(id)} AND a.status='uploaded' AND a.has_content=TRUE AND a.uploaded_by IS NOT NULL
      AND a.purpose=${s(purpose)} AND link.owner_type='statement' AND link.owner_id=${s(statement.id)} AND link.purpose=${s(purpose)}
      AND ${customer ? "((a.file_type='image' AND a.mime_type LIKE 'image/%') OR (a.file_type='pdf' AND a.mime_type='application/pdf'))" : "a.file_type='image' AND a.mime_type LIKE 'image/%'"}
    FOR SHARE OF a,link`;
  return { text: `WITH locked_statement AS MATERIALIZED (
    SELECT * FROM statements WHERE id=${s(statement.id)} FOR UPDATE
  ), locked_payment AS MATERIALIZED (
    SELECT * FROM payment_records WHERE id=${s(body.paymentRecordId)} FOR SHARE
  ), locked_confirmation AS MATERIALIZED (
    SELECT * FROM statement_confirmation_records WHERE id=${s(body.customerConfirmationRecordId)} FOR SHARE
  ), locked_send AS MATERIALIZED (
    SELECT * FROM statement_send_records WHERE id=${s(e.sendRecordId)} FOR SHARE
  ), locked_payment_attachment AS MATERIALIZED (${attachment(body.paymentAttachmentId, "payment_screenshot", false)}),
  locked_customer_attachment AS MATERIALIZED (${attachment(body.customerAttachmentId, "statement_customer_confirmation", true)}),
  exact_guard AS MATERIALIZED (
    SELECT erp_require(
      EXISTS (SELECT 1 FROM locked_statement WHERE revision=${p.integer(body.expectedRevision)}
        AND customer_id=${s(statement.customerId)} AND status NOT IN (${closedStatementPaymentStatuses.map(s).join(",")})
        AND receivable_amount=${p.number(body.expectedReceivable)} AND received_amount=${p.number(body.expectedReceived)}
        AND receivable_amount>0 AND received_amount=receivable_amount AND variance_amount=0)
      AND EXISTS (SELECT 1 FROM locked_payment WHERE statement_id=${s(statement.id)} AND customer_id=${s(statement.customerId)}
        AND status IN ('recorded','confirmed') AND amount=${p.number(body.expectedReceived)} AND payment_method=${s(e.paymentMethod)}
        AND payment_method IN ('wechat','alipay') AND (evidence_attachment_ids ? ${s(body.paymentAttachmentId)} OR evidence_attachment_id=${s(body.paymentAttachmentId)}))
      AND EXISTS (SELECT 1 FROM locked_confirmation WHERE statement_id=${s(statement.id)} AND send_record_id=${s(e.sendRecordId)}
        AND content=${s(e.confirmationContent)} AND attachment_ids_json ? ${s(body.customerAttachmentId)})
      AND EXISTS (SELECT 1 FROM locked_send WHERE statement_id=${s(statement.id)})
      AND (SELECT count(*) FROM locked_payment_attachment)=1 AND (SELECT count(*) FROM locked_customer_attachment)=1,
      'ERP_STATEMENT_EXACT_PAYMENT_CONFLICT') AS ok
  ), updated_statement AS (
    UPDATE statements SET status='已核销',settled_at=now(),revision=statements.revision+1,updated_at=now()
    FROM exact_guard WHERE statements.id=${s(statement.id)} AND exact_guard.ok
    RETURNING statements.id, statements.revision
  ), inserted_log AS (
    INSERT INTO operation_logs(id,target_type,target_id,action,before_json,after_json,reason,operator_id,page_key,occurred_at,created_at)
    SELECT ${s(operationLog.id)},'statement',${s(statement.id)},'settle_statement_exact_payment',${p.json(operationLog.before)},${p.json(operationLog.after)},${s(e.matchNote)},${s(operatorId)},'statements',now(),now()
    FROM updated_statement RETURNING id
  ), inserted_receipt AS (
    INSERT INTO statement_write_off_records(id,statement_id,receivable_snapshot,received_snapshot,variance_snapshot,write_off_amount,
      handling_result,business_decision_id,recorded_by,revision,operation_log_id,created_at,settlement_kind,receipt_confirmation_json)
    SELECT ${s(record.id)},${s(statement.id)},${p.number(e.receivable)},${p.number(e.received)},0,0,
      '证据齐全足额结清',NULL,${s(operatorId)},1,${s(operationLog.id)},now(),'office_exact_payment',${p.json(record.receiptConfirmation)}
    FROM inserted_log RETURNING id
  ) SELECT json_build_object('statementId',${s(statement.id)},'status','已结清','statementStatus','已结清',
    'statementRevision',(SELECT revision FROM updated_statement),'receivable',${p.number(e.receivable)},'received',${p.number(e.received)},'variance',0,
    'operationLogId',(SELECT id FROM inserted_log),'writeOffRecord',${p.json(record)},
    'writeGuard',erp_require((SELECT count(*) FROM updated_statement)=1 AND (SELECT count(*) FROM inserted_log)=1 AND (SELECT count(*) FROM inserted_receipt)=1,'ERP_STATEMENT_EXACT_PAYMENT_CONFLICT')) AS result;`, values: p.values };
}
