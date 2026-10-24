import { createHash } from "node:crypto";
import { exactPaymentPermission, exactPaymentError, validateExactPaymentEvidence } from "./statementExactPaymentPolicy.mjs";

export function createStatementExactPaymentCommand({ findStatement, buildOperationLog, now }) {
  return async function settleExactPayment({ workspace, statementId, body = {}, operatorId, actionPermissions = [] }) {
    if (!actionPermissions.includes(exactPaymentPermission)) return { error: true, statusCode: 403, code: "PERMISSION_DENIED", message: "当前账号没有受限足额结清权限。" };
    if (typeof body.idempotencyKey !== "string" || !body.idempotencyKey.trim()) throw exactPaymentError("本次结清缺少稳定提交编号。");
    const payload = { statementId, operatorId, ...Object.fromEntries(["expectedRevision", "expectedReceivable", "expectedReceived", "paymentRecordId", "customerConfirmationRecordId", "paymentAttachmentId", "customerAttachmentId", "matchNote"].map(key => [key, body[key]])) };
    const repository = workspace.statementSettlementTransactionRepository;
    const replay = await repository.findExactPaymentReplay({ workspace, idempotencyKey: body.idempotencyKey, payload });
    if (replay) return { response: replay };
    const statement = findStatement(workspace, statementId);
    const evidence = validateExactPaymentEvidence(workspace, statement, body, operatorId);
    const recordedAt = new Date(now()).toISOString();
    const identity = createHash("sha256").update(JSON.stringify([statementId, operatorId, body.idempotencyKey])).digest("hex").slice(0, 32);
    const record = { id: `SWO-EXACT-${identity}`, statementWriteOffRecordId: `SWO-EXACT-${identity}`, statementId,
      receivableSnapshot: evidence.receivable, receivedSnapshot: evidence.received, varianceSnapshot: 0, writeOffAmount: 0,
      settlementKind: "office_exact_payment", receiptConfirmation: { ...evidence, confirmedAt: recordedAt },
      handlingResult: "证据齐全足额结清", businessDecisionId: "", recordedBy: operatorId, revision: 1,
      operationLogId: `LOG-EXACT-${identity}`, createdAt: recordedAt };
    const operationLog = buildOperationLog(workspace, { id: record.operationLogId, targetType: "statement", targetId: statementId,
      action: "settle_statement_exact_payment", operatorId, before: statement,
      after: { ...statement, status: "已核销", revision: Number(statement.revision) + 1, exactPaymentReceipt: record.receiptConfirmation }, reason: evidence.matchNote });
    return { response: await repository.settleExactPayment({ workspace, statement, body, operatorId, record, operationLog,
      payload, idempotencyKey: body.idempotencyKey }) };
  };
}
