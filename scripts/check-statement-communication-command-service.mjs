import assert from "node:assert/strict";
import { createStatementCommunicationCommandService } from "../server/services/statementCommunicationCommandService.mjs";

const calls = { exports: [], sends: [], receipts: [], confirmations: [] };
const workspace = createWorkspace();
const service = createStatementCommunicationCommandService({
  now: () => "2026-07-11T15:00:00.000Z",
  findAttachment(currentWorkspace, attachmentId) {
    return currentWorkspace.attachments.find((item) => item.attachmentId === attachmentId) ?? null;
  },
  findStatement(currentWorkspace, statementId) {
    return currentWorkspace.statements.find((item) => item.id === statementId);
  },
  getStatementExcelTemplateId(previewType) {
    return previewType === "internal_archive" ? "TPL-INTERNAL" : "TPL-CUSTOMER";
  },
  buildStatementPreviewLines() {
    return [{ statementLineId: "ST-1-001", statementId: "ST-1", orderLineId: "OL-1", amount: 100 }];
  },
  buildStatementExportFile(_workspace, statement, options) {
    return {
      exportFileId: options.downloadToken,
      statementId: statement.id,
      previewType: options.previewType,
      downloadToken: options.downloadToken,
      operationLogId: options.operationLogId,
      fileName: "statement.xlsx",
      contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      content: "eGxzeA==",
      contentEncoding: "base64",
      storageProvider: "object_storage",
      storageKey: options.downloadToken,
      createdBy: options.createdBy,
      createdAt: options.createdAt,
      metadata: { templateId: options.templateId, templateVersion: "v1" },
    };
  },
  async storeStatementExportFile(_workspace, exportFile) {
    return exportFile;
  },
  toStatementExportSummary(exportFile) {
    return { downloadToken: exportFile.downloadToken };
  },
  markStatementSent(statements, statementId, payload) {
    return statements.map((statement) =>
      statement.id === statementId
        ? { ...statement, status: "已发送待回款", lastSentAt: payload.sentAt, sentByName: payload.operatorName }
        : statement,
    );
  },
  recordStatementCustomerConfirmation(statements, statementId, payload) {
    return statements.map((statement) =>
      statement.id === statementId
        ? { ...statement, status: "客户已确认", confirmationOperatorName: payload.operatorName }
        : statement,
    );
  },
  normalizeStatementSendReceiptStatus(value) {
    return ["delivered", "read", "confirmed", "no_response"].includes(value) ? value : "read";
  },
  mapStatementApiStatus(status) {
    return status === "已发送待回款" ? "已发送" : status;
  },
  nextId(prefix, rows) {
    return `${prefix}-${rows.length + 1}`;
  },
  nextPlainId(prefix, value) {
    return `${prefix}-${value}`;
  },
  buildOperationLog(_workspace, input) {
    return {
      id: input.id ?? `LOG-${calls.exports.length + calls.sends.length + calls.receipts.length + calls.confirmations.length + 1}`,
      ...input,
      occurredAt: "2026-07-11T15:00:00.000Z",
      createdAt: "2026-07-11T15:00:00.000Z",
    };
  },
});

const preview = await service.previewStatement({
  workspace,
  statementId: "ST-1",
  operatorId: "U-FINANCE",
  body: { previewType: "customer_send", operatorId: "U-SPOOFED", idempotencyKey: "statement-preview-0001" },
});
assert.equal(preview.response.templateId, "TPL-CUSTOMER");
assert.match(preview.response.downloadToken, /^DL-[A-F0-9]{24}$/);
assert.equal(calls.exports[0].exportFile.createdBy, "U-FINANCE");
assert.equal(calls.exports[0].operationLog.operatorId, "U-FINANCE");
assert.equal(calls.exports[0].idempotencyPayload.operatorId, "U-FINANCE");

const sent = await service.markStatementSent({
  workspace,
  statementId: "ST-1",
  operatorId: "U-FINANCE",
  body: {
    channel: "wechat",
    sentTo: "客户财务",
    operatorId: "U-SPOOFED",
    operatorName: "伪造人员",
    idempotencyKey: "statement-send-0001",
  },
});
assert.equal(sent.response.status, "已发送");
assert.match(sent.response.sendRecordId, /^SEND-[A-F0-9]{24}$/);
assert.equal(calls.sends[0].sendRecord.sentBy, "U-FINANCE");
assert.equal(calls.sends[0].operationLog.operatorId, "U-FINANCE");
assert.equal(calls.sends[0].statement.sentByName, "财务A");
assert.equal(calls.sends[0].idempotencyPayload.operatorId, "U-FINANCE");

const invalidReceipt = await service.markStatementSendReceipt({
  workspace,
  statementId: "ST-1",
  operatorId: "U-FINANCE",
  body: { sendRecordId: "SEND-OTHER", idempotencyKey: "statement-receipt-0000" },
});
assert.equal(invalidReceipt.statusCode, 409);
assert.equal(invalidReceipt.code, "STATEMENT_SEND_RECORD_NOT_FOUND");

const receipt = await service.markStatementSendReceipt({
  workspace,
  statementId: "ST-1",
  operatorId: "U-FINANCE",
  body: {
    sendRecordId: "SEND-EXISTING",
    receiptStatus: "read",
    operatorId: "U-SPOOFED",
    idempotencyKey: "statement-receipt-0001",
  },
});
assert.equal(receipt.response.receiptStatus, "read");
assert.equal(calls.receipts[0].sendRecord.receiptBy, "U-FINANCE");
assert.equal(calls.receipts[0].operationLog.operatorId, "U-FINANCE");

const blockedConfirmation = await service.recordStatementCustomerConfirmation({
  workspace,
  statementId: "ST-1",
  operatorId: "U-FINANCE",
  body: {
    sendRecordId: "SEND-EXISTING",
    attachmentIds: ["ATT-WRONG-OWNER"],
  },
});
assert.equal(blockedConfirmation.code, "STATEMENT_CONFIRMATION_ATTACHMENT_OWNER_MISMATCH");

const confirmation = await service.recordStatementCustomerConfirmation({
  workspace,
  statementId: "ST-1",
  operatorId: "U-FINANCE",
  body: {
    sendRecordId: "SEND-EXISTING",
    content: "客户确认无误",
    attachmentIds: ["ATT-1"],
    operatorId: "U-SPOOFED",
    operatorName: "伪造人员",
    idempotencyKey: "statement-confirm-0001",
  },
});
assert.equal(confirmation.response.status, "客户已确认");
assert.match(confirmation.response.confirmationRecordId, /^SCONF-[A-F0-9]{24}$/);
assert.equal(calls.confirmations[0].confirmationRecord.recordedBy, "U-FINANCE");
assert.equal(calls.confirmations[0].sendRecord.receiptBy, "U-FINANCE");
assert.equal(calls.confirmations[0].operationLog.operatorId, "U-FINANCE");
assert.equal(calls.confirmations[0].statement.confirmationOperatorName, "财务A");
assert.equal(calls.confirmations[0].idempotencyPayload.operatorId, "U-FINANCE");

console.log("Statement communication command service checks passed");

function createWorkspace() {
  const currentWorkspace = {
    users: [{ id: "U-FINANCE", displayName: "财务A" }],
    statements: [{ id: "ST-1", customerId: "C-1", status: "待生成", receivable: 100, received: 0, variance: 100, revision: 2 }],
    statementLines: [],
    statementExportFiles: [],
    statementSendRecords: [
      {
        sendRecordId: "SEND-EXISTING",
        statementId: "ST-1",
        channel: "wechat",
        sentTo: "客户财务",
        sentAt: "2026-07-11T14:00:00.000Z",
        receiptStatus: "pending",
        revision: 3,
      },
      { sendRecordId: "SEND-OTHER", statementId: "ST-OTHER", sentAt: "2026-07-11T14:30:00.000Z", revision: 1 },
    ],
    statementConfirmationRecords: [],
    attachments: [
      {
        attachmentId: "ATT-1",
        ownerType: "statement",
        ownerId: "ST-1",
        purpose: "statement_customer_confirmation",
        uploadedBy: "U-OFFICE",
        status: "uploaded",
        hasContent: true,
        fileType: "image",
        mimeType: "image/png",
      },
      {
        attachmentId: "ATT-WRONG-OWNER",
        ownerType: "statement",
        ownerId: "ST-OTHER",
        purpose: "statement_customer_confirmation",
        uploadedBy: "U-FINANCE",
        status: "uploaded",
        hasContent: true,
        fileType: "image",
        mimeType: "image/png",
      },
    ],
    operationLogs: [],
  };
  currentWorkspace.statementExportRepository = {
    async findExportFileByToken() {
      return null;
    },
    async findLatestExportFile() {
      return { downloadToken: "DL-LATEST", previewType: "customer_send" };
    },
    async createExportFile(input) {
      calls.exports.push(input);
      return {
        exportFile: input.exportFile,
        statementLines: input.statementLines,
        operationLogId: input.operationLog.id,
      };
    },
  };
  currentWorkspace.statementSendTransactionRepository = {
    async markStatementSent(input) {
      calls.sends.push(input);
      return { statement: input.statement, sendRecord: input.sendRecord, operationLogId: input.operationLog.id };
    },
    async markStatementSendReceipt(input) {
      calls.receipts.push(input);
      return { sendRecord: input.sendRecord, operationLogId: input.operationLog.id };
    },
    async recordStatementCustomerConfirmation(input) {
      calls.confirmations.push(input);
      return {
        statement: input.statement,
        sendRecord: input.sendRecord,
        confirmationRecord: input.confirmationRecord,
        operationLogId: input.operationLog.id,
      };
    },
  };
  return currentWorkspace;
}
