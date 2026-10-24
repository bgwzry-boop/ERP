import { getStatementPaymentBlocker } from "../../shared/statementPaymentPolicy.js";
import { validateBusinessAttachment } from "./businessAttachmentValidationService.mjs";

export const exactPaymentPermission = "statement.exact_payment.settle";
export function exactPaymentError(message, code = "STATEMENT_EXACT_PAYMENT_INVALID") {
  return Object.assign(new Error(message), { statusCode: 409, code });
}
export function exactPaymentCents(value) {
  if (!["number", "string"].includes(typeof value) || !String(value).trim()) return null;
  const amount = Number(value), cents = Math.round(amount * 100);
  return Number.isFinite(amount) && amount >= 0 && Number.isSafeInteger(cents)
    && Math.abs(amount * 100 - cents) < 0.00001 ? cents : null;
}
export function validateExactPaymentEvidence(workspace, statement, body, operatorId) {
  if (!statement || !operatorId) throw exactPaymentError("未找到当前账单或认证操作人。");
  const blocker = getStatementPaymentBlocker(statement);
  if (blocker) throw exactPaymentError(blocker, "STATEMENT_PAYMENT_PERIOD_CLOSED");
  const receivable = exactPaymentCents(statement.receivable), received = exactPaymentCents(statement.received);
  if (receivable === null || received === null || exactPaymentCents(statement.variance) !== 0
    || receivable <= 0 || received !== receivable) throw exactPaymentError("当前应收、累计实收及差额须已核实且足额一致；差额另行审批。");
  if (Number(statement.revision) !== body.expectedRevision || !Number.isSafeInteger(body.expectedRevision)
    || body.expectedRevision < 1 || exactPaymentCents(body.expectedReceivable) !== receivable
    || exactPaymentCents(body.expectedReceived) !== received) throw exactPaymentError("账单已变化，请刷新后重新核对。", "BUSINESS_WRITE_CONFLICT");
  if (typeof body.matchNote !== "string" || !body.matchNote.trim() || body.matchNote.length > 1000)
    throw exactPaymentError("请写明到账记录与客户消息或截图如何匹配。");
  const payment = (workspace.paymentRecords ?? []).find(row => (row.paymentRecordId ?? row.id) === body.paymentRecordId);
  const confirmation = (workspace.statementConfirmationRecords ?? []).find(row => (row.confirmationRecordId ?? row.id) === body.customerConfirmationRecordId);
  const send = (workspace.statementSendRecords ?? []).find(row => (row.sendRecordId ?? row.id) === confirmation?.sendRecordId);
  if (!payment || payment.statementId !== statement.id || payment.customerId !== statement.customerId
    || !["recorded", "confirmed"].includes(payment.status) || exactPaymentCents(payment.amount) !== received
    || !["wechat", "alipay"].includes(payment.method) || !(payment.attachmentIds ?? []).includes(body.paymentAttachmentId))
    throw exactPaymentError("请选择本账单与当前累计实收一致、带微信或支付宝到账凭证的收款记录。");
  if (!confirmation || confirmation.statementId !== statement.id || !send || send.statementId !== statement.id
    || !String(confirmation.content ?? "").trim() || !(confirmation.attachmentIds ?? []).includes(body.customerAttachmentId))
    throw exactPaymentError("请选择本账单客户实际回复记录及其消息或截图凭证。");
  for (const [attachmentId, purpose, customer] of [[body.paymentAttachmentId, "payment_screenshot", false], [body.customerAttachmentId, "statement_customer_confirmation", true]]) {
    const validation = validateBusinessAttachment({ workspace, attachmentId,
      findAttachment: (state, id) => (state.attachments ?? []).find(row => (row.attachmentId ?? row.id) === id),
      expectedOwnerType: "statement", expectedOwnerId: statement.id, expectedPurpose: purpose, requireUploader: true,
      ...(customer ? { allowedFileTypes: ["image", "pdf"], allowedMimePrefixes: ["image/"], allowedMimeTypes: ["application/pdf"] } : {}),
    });
    if (!validation.ok) throw exactPaymentError("付款及客户凭证须为本账单真实留存的有效附件。", "STATEMENT_EXACT_PAYMENT_EVIDENCE_INVALID");
  }
  return { schema: "office-exact-payment-v1", statementRevision: body.expectedRevision, receivable: receivable / 100,
    received: received / 100, variance: 0, paymentRecordId: body.paymentRecordId,
    customerConfirmationRecordId: body.customerConfirmationRecordId, paymentAttachmentId: body.paymentAttachmentId,
    customerAttachmentId: body.customerAttachmentId, paymentMethod: payment.method,
    confirmationContent: confirmation.content, sendRecordId: confirmation.sendRecordId, matchNote: body.matchNote.trim(), operatorId };
}
