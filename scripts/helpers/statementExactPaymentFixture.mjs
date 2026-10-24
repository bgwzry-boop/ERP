import { createLocalStatementSettlementTransactionRepository } from "../../server/statementSettlementTransactionRepository.mjs";

export function exactPaymentFixture() {
  const statement = { id: "ST-EXACT-SYNTHETIC", customerId: "C-EXACT-SYNTHETIC", customerName: "合成结清客户", status: "待核销", receivable: 100, received: 100, variance: 0, revision: 1, period: "2026-09-01 至 2026-09-30" };
  const attachment = (id, purpose) => ({ attachmentId: id, ownerType: "statement", ownerId: statement.id, purpose,
    fileName: `${id}.png`, fileType: "image", mimeType: "image/png", status: "uploaded", hasContent: true, uploadedBy: "U-OFFICE-A" });
  return { statements: [statement], paymentRecords: [{ paymentRecordId: "PAY-EXACT-SYNTHETIC", statementId: statement.id,
    customerId: statement.customerId, amount: 100, method: "wechat", status: "recorded", attachmentIds: ["ATT-EXACT-PAY"], operatorId: "U-OFFICE-B" }],
    statementSendRecords: [{ sendRecordId: "SEND-EXACT-SYNTHETIC", statementId: statement.id, sentTo: "合成客户", sentAt: "2026-10-01T00:00:00Z" }],
    statementConfirmationRecords: [{ confirmationRecordId: "CONF-EXACT-SYNTHETIC", statementId: statement.id, sendRecordId: "SEND-EXACT-SYNTHETIC",
      content: "合成核对：本期100元已付款", confirmedByCustomer: "合成客户", attachmentIds: ["ATT-EXACT-CUSTOMER"] }],
    attachments: [attachment("ATT-EXACT-PAY", "payment_screenshot"), attachment("ATT-EXACT-CUSTOMER", "statement_customer_confirmation")],
    statementWriteOffRecords: [], operationLogs: [], operationIdempotencyRecords: [],
    statementSettlementTransactionRepository: createLocalStatementSettlementTransactionRepository() };
}
export const exactPaymentBody = (key = "synthetic-exact-settle") => ({ idempotencyKey: key, expectedRevision: 1, expectedReceivable: 100, expectedReceived: 100,
  paymentRecordId: "PAY-EXACT-SYNTHETIC", customerConfirmationRecordId: "CONF-EXACT-SYNTHETIC", paymentAttachmentId: "ATT-EXACT-PAY",
  customerAttachmentId: "ATT-EXACT-CUSTOMER", matchNote: "合成核对：到账记录与本账单客户回复金额、时间和归属一致" });
