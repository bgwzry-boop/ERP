import { requestOfficeApi, readOfficeApiJson, toOfficeApiError } from "./officeApiClientCore.js";

export async function settleOfficeStatementExactPayment(input, options = {}) {
  const { authState, statement, idempotencyKey, ...values } = input;
  const body = Object.fromEntries(["expectedRevision", "expectedReceivable", "expectedReceived", "paymentRecordId", "customerConfirmationRecordId", "paymentAttachmentId", "customerAttachmentId", "matchNote"].map(key => [key, values[key]]));
  try {
    const response = await requestOfficeApi(`/statements/${encodeURIComponent(statement.id)}/exact-payment-settle`, {
      ...options, serverRequired: true, authState, method: "POST", idempotencyKey, body: { ...body, idempotencyKey } });
    const json = await readOfficeApiJson(response);
    if (!response.ok) return { source: "api_error", blocked: true, error: toOfficeApiError(json, response.status, "足额结清未保存，请核对后重试。") };
    const record = json?.writeOffRecord, evidence = record?.receiptConfirmation;
    if (json?.statementId !== statement.id || !json.operationLogId || json.statementRevision !== body.expectedRevision + 1
      || json.writeOffRecord?.statementId !== statement.id || !json.writeOffRecord?.statementWriteOffRecordId
      || record.settlementKind !== "office_exact_payment" || json.variance !== 0
      || json.receivable !== body.expectedReceivable || json.received !== body.expectedReceived
      || record.receivableSnapshot !== body.expectedReceivable || record.receivedSnapshot !== body.expectedReceived
      || record.varianceSnapshot !== 0 || record.writeOffAmount !== 0 || record.operationLogId !== json.operationLogId
      || evidence?.schema !== "office-exact-payment-v1" || evidence.statementRevision !== body.expectedRevision
      || !["paymentRecordId", "customerConfirmationRecordId", "paymentAttachmentId", "customerAttachmentId"].every(key => evidence[key] === body[key]))
      return { source: "api_error", blocked: true, error: { code: "STATEMENT_EXACT_PAYMENT_UNCONFIRMED", message: "未收到完整结清凭据，请用原内容重试。" } };
    return { ...json, source: "api" };
  } catch {
    return { source: "api_error", blocked: true, error: { code: "STATEMENT_EXACT_PAYMENT_UNAVAILABLE", message: "结果尚未确认，请保留原内容并重试。" } };
  }
}
