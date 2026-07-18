import { createHash } from "node:crypto";
import { validateBusinessAttachment } from "./businessAttachmentValidationService.mjs";
import { createStatementPolicyService } from "./statementPolicyService.mjs";

const statementPolicyService = createStatementPolicyService();

export function createStatementCommunicationCommandService(dependencies = {}) {
  const {
    buildOperationLog,
    buildStatementExportFile,
    buildStatementPreviewLines,
    findAttachment,
    findStatement,
    getStatementExcelTemplateId,
    mapStatementApiStatus = statementPolicyService.mapStatementApiStatus,
    markStatementSent,
    nextId,
    nextPlainId,
    normalizeStatementSendReceiptStatus = statementPolicyService.normalizeStatementSendReceiptStatus,
    recordStatementCustomerConfirmation,
    storeStatementExportFile,
    toStatementExportSummary,
    now = () => new Date().toISOString(),
  } = dependencies;

  return {
    previewStatement,
    markStatementSent: markSent,
    markStatementSendReceipt: markSendReceipt,
    recordStatementCustomerConfirmation: recordCustomerConfirmation,
  };

  async function previewStatement({ workspace, statementId, body = {}, operatorId }) {
    const statement = findStatement(workspace, statementId);
    if (!statement) return notFound("STATEMENT_NOT_FOUND");

    const previewType = body.previewType === "internal_archive" ? "internal_archive" : "customer_send";
    const templateId = getStatementExcelTemplateId(previewType);
    const initialLines = buildStatementPreviewLines(workspace, statement);
    const downloadToken = buildStableCommandId({
      prefix: "DL",
      scope: `statement-preview:${statementId}:${previewType}`,
      idempotencyKey: body.idempotencyKey,
      fallback: () =>
        nextPlainId(
          "DL",
          `${statementId}-${previewType}-${workspace.operationLogs.length + workspace.statementExportFiles.length + 1}`,
        ),
    });
    const operationLog = buildOperationLog(workspace, {
      id: buildStableCommandId({
        prefix: "LOG",
        scope: `statement-preview-log:${statementId}:${previewType}`,
        idempotencyKey: body.idempotencyKey,
      }),
      targetType: "statement",
      targetId: statementId,
      action: "preview_statement",
      operatorId,
      after: {
        previewType,
        templateId,
        lineCount: initialLines.length,
        downloadToken,
      },
    });
    const existingExport = await workspace.statementExportRepository.findExportFileByToken({
      workspace,
      statementId,
      downloadToken,
    });
    const summary = buildStatementSummary(statement, initialLines.length);
    const exportFile =
      existingExport ??
      (await storeStatementExportFile(
        workspace,
        buildStatementExportFile(workspace, statement, {
          previewType,
          summary,
          lines: initialLines,
          downloadToken,
          operationLogId: operationLog.id,
          createdBy: operatorId,
          createdAt: now(),
          templateId,
        }),
      ));
    const transaction = await workspace.statementExportRepository.createExportFile({
      workspace,
      exportFile,
      statementLines: initialLines,
      operationLog,
      idempotencyKey: body.idempotencyKey,
      idempotencyPayload: {
        statementId,
        previewType,
        templateId,
        operatorId,
      },
    });
    const lines = mergeStatementPreviewLines(initialLines, transaction.statementLines);
    const savedTemplateId = transaction.exportFile.metadata?.templateId ?? templateId;

    return success({
      statementId,
      previewType: transaction.exportFile.previewType,
      templateId: savedTemplateId,
      templateVersion: transaction.exportFile.metadata?.templateVersion ?? "",
      summary: buildStatementSummary(statement, lines.length),
      lines,
      downloadToken: transaction.exportFile.downloadToken,
      operationLogId: transaction.operationLogId,
    });
  }

  async function markSent({ workspace, statementId, body = {}, operatorId }) {
    const before = findStatement(workspace, statementId);
    if (!before) return notFound("STATEMENT_NOT_FOUND");
    const expectedRevision = requireExpectedRevision(body.expectedRevision);
    if (expectedRevision.error) return expectedRevision.error;
    const latestCustomerExport =
      (await workspace.statementExportRepository.findLatestExportFile({
        workspace,
        statementId,
        previewType: "customer_send",
      })) ?? null;
    const sendRecordId = buildStableCommandId({
      prefix: "SEND",
      scope: `statement-send:${statementId}`,
      idempotencyKey: body.idempotencyKey,
      fallback: () => nextId("SEND", workspace.statementSendRecords),
    });
    const existingRecord = findSendRecordById(workspace, sendRecordId);
    const sentAt = body.sentAt ?? existingRecord?.sentAt ?? now();
    const sendRecord = {
      sendRecordId,
      statementId,
      channel: body.channel ?? "wechat",
      sentTo: body.sentTo ?? "",
      exportFileId: body.exportFileId ?? latestCustomerExport?.downloadToken ?? "",
      includePaymentQr: Boolean(body.includePaymentQr ?? false),
      sentBy: operatorId,
      sentAt,
      remark: body.remark ?? "",
      revision: existingRecord?.revision ?? 1,
    };
    const nextStatements = markStatementSent(workspace.statements, statementId, {
      sendRecordId,
      channel: sendRecord.channel,
      sentTo: sendRecord.sentTo,
      sentAt,
      operatorName: getAuthenticatedOperatorName(workspace, operatorId),
      remark: sendRecord.remark,
      exportRecord: latestCustomerExport ? toStatementExportSummary(latestCustomerExport) : null,
    });
    const after = {
      ...nextStatements.find((item) => item.id === statementId),
      revision: expectedRevision.value,
    };
    const versionedStatements = nextStatements.map((item) => item.id === statementId ? after : item);
    const operationLog = buildOperationLog(workspace, {
      id: buildStableCommandId({
        prefix: "LOG",
        scope: `statement-send-log:${statementId}`,
        idempotencyKey: body.idempotencyKey,
      }),
      targetType: "statement",
      targetId: statementId,
      action: "mark_statement_sent",
      operatorId,
      before,
      after,
      reason: sendRecord.remark,
    });
    const transaction = await workspace.statementSendTransactionRepository.markStatementSent({
      workspace,
      statements: versionedStatements,
      statement: after,
      sendRecord,
      operationLog,
      idempotencyKey: body.idempotencyKey,
      idempotencyPayload: {
        statementId,
        channel: sendRecord.channel,
        sentTo: sendRecord.sentTo,
        exportFileId: sendRecord.exportFileId,
        includePaymentQr: sendRecord.includePaymentQr,
        sentAt: body.sentAt ?? "",
        remark: sendRecord.remark,
        operatorId,
      },
    });

    return success({
      statementId,
      status: mapStatementApiStatus(transaction.statement.status),
      sendRecordId: transaction.sendRecord.sendRecordId,
      operationLogId: transaction.operationLogId,
    });
  }

  async function markSendReceipt({ workspace, statementId, body = {}, operatorId }) {
    const statement = findStatement(workspace, statementId);
    if (!statement) return notFound("STATEMENT_NOT_FOUND");
    const before = findRequestedSendRecord(workspace, statementId, body.sendRecordId);
    if (!before) {
      return conflict("STATEMENT_SEND_RECORD_NOT_FOUND", "当前对账单还没有可登记回执的发送记录。");
    }
    const expectedRevision = requireExpectedRevision(body.expectedRevision);
    if (expectedRevision.error) return expectedRevision.error;

    const receiptStatus = normalizeStatementSendReceiptStatus(body.receiptStatus ?? "read");
    const receiptAt = body.receiptAt ?? now();
    const receiptNote = body.remark ?? "";
    const after = {
      ...before,
      revision: expectedRevision.value,
      receiptStatus,
      receiptAt,
      receiptBy: operatorId,
      receiptNote,
    };
    const operationLog = buildOperationLog(workspace, {
      id: buildStableCommandId({
        prefix: "LOG",
        scope: `statement-send-receipt:${before.sendRecordId}`,
        idempotencyKey: body.idempotencyKey,
      }),
      targetType: "statement_send_record",
      targetId: before.sendRecordId,
      action: "mark_statement_send_receipt",
      operatorId,
      before,
      after,
      reason: receiptNote,
    });
    const transaction = await workspace.statementSendTransactionRepository.markStatementSendReceipt({
      workspace,
      sendRecord: after,
      operationLog,
      idempotencyKey: body.idempotencyKey,
      idempotencyPayload: {
        statementId,
        sendRecordId: before.sendRecordId,
        receiptStatus,
        receiptAt: body.receiptAt ?? "",
        receiptNote,
        operatorId,
      },
    });

    return success({
      statementId,
      status: mapStatementApiStatus(statement.status),
      sendRecordId: transaction.sendRecord.sendRecordId,
      receiptStatus: transaction.sendRecord.receiptStatus,
      receiptAt: transaction.sendRecord.receiptAt,
      operationLogId: transaction.operationLogId,
    });
  }

  async function recordCustomerConfirmation({ workspace, statementId, body = {}, operatorId }) {
    const beforeStatement = findStatement(workspace, statementId);
    if (!beforeStatement) return notFound("STATEMENT_NOT_FOUND");
    const expectedRevision = requireExpectedRevision(body.expectedRevision);
    if (expectedRevision.error) return expectedRevision.error;
    const beforeSendRecord = findRequestedSendRecord(workspace, statementId, body.sendRecordId);
    if (!beforeSendRecord) {
      return conflict("STATEMENT_SEND_RECORD_NOT_FOUND", "当前对账单还没有可登记客户确认的发送记录。");
    }

    const confirmationRecordId = buildStableCommandId({
      prefix: "SCONF",
      scope: `statement-confirmation:${statementId}:${beforeSendRecord.sendRecordId}`,
      idempotencyKey: body.idempotencyKey,
      fallback: () => nextId("SCONF", workspace.statementConfirmationRecords ?? []),
    });
    const existingConfirmation = (workspace.statementConfirmationRecords ?? []).find(
      (record) => record.confirmationRecordId === confirmationRecordId || record.id === confirmationRecordId,
    );
    const confirmedAt = body.confirmedAt ?? existingConfirmation?.confirmedAt ?? now();
    const confirmationContent =
      String(body.content ?? "").trim() || String(body.remark ?? "").trim() || "客户回复确认无误";
    const attachmentValidation = validateCustomerConfirmationAttachments({
      workspace,
      statementId,
      attachmentIds: body.attachmentIds,
    });
    if (attachmentValidation.error) return attachmentValidation;
    const attachmentIds = attachmentValidation.attachmentIds;
    const confirmationRecord = {
      confirmationRecordId,
      statementId,
      sendRecordId: beforeSendRecord.sendRecordId,
      confirmationType: body.confirmationType ?? "customer_reply",
      channel: body.channel ?? beforeSendRecord.channel ?? "wechat",
      confirmedByCustomer: body.confirmedByCustomer ?? body.confirmedBy ?? beforeSendRecord.sentTo ?? "",
      confirmedAt,
      content: confirmationContent,
      attachmentIds,
      recordedBy: operatorId,
    };
    const afterSendRecord = {
      ...beforeSendRecord,
      receiptStatus: "confirmed",
      receiptAt: confirmedAt,
      receiptBy: operatorId,
      receiptNote: confirmationContent,
    };
    const nextStatements = recordStatementCustomerConfirmation(workspace.statements, statementId, {
      confirmationRecordId,
      channel: confirmationRecord.channel,
      confirmedByCustomer: confirmationRecord.confirmedByCustomer,
      confirmedAt,
      content: confirmationContent,
      attachmentIds,
      operatorName: getAuthenticatedOperatorName(workspace, operatorId),
    });
    const afterStatement = {
      ...nextStatements.find((item) => item.id === statementId),
      revision: expectedRevision.value,
    };
    const versionedStatements = nextStatements.map((item) => item.id === statementId ? afterStatement : item);
    const operationLog = buildOperationLog(workspace, {
      id: buildStableCommandId({
        prefix: "LOG",
        scope: `statement-confirmation-log:${statementId}:${beforeSendRecord.sendRecordId}`,
        idempotencyKey: body.idempotencyKey,
      }),
      targetType: "statement",
      targetId: statementId,
      action: "record_statement_customer_confirmation",
      operatorId,
      before: { statement: beforeStatement, sendRecord: beforeSendRecord },
      after: { statement: afterStatement, sendRecord: afterSendRecord, confirmationRecord },
      reason: confirmationContent,
    });
    const transaction = await workspace.statementSendTransactionRepository.recordStatementCustomerConfirmation({
      workspace,
      statements: versionedStatements,
      statement: afterStatement,
      sendRecord: afterSendRecord,
      confirmationRecord,
      operationLog,
      idempotencyKey: body.idempotencyKey,
      idempotencyPayload: {
        statementId,
        sendRecordId: beforeSendRecord.sendRecordId,
        confirmationType: confirmationRecord.confirmationType,
        channel: confirmationRecord.channel,
        confirmedByCustomer: confirmationRecord.confirmedByCustomer,
        confirmedAt: body.confirmedAt ?? "",
        content: confirmationContent,
        attachmentIds,
        operatorId,
      },
    });

    return success({
      statementId,
      status: mapStatementApiStatus(transaction.statement.status),
      sendRecordId: transaction.sendRecord.sendRecordId,
      receiptStatus: transaction.sendRecord.receiptStatus,
      confirmationRecord: transaction.confirmationRecord,
      confirmationRecordId: transaction.confirmationRecord.confirmationRecordId,
      operationLogId: transaction.operationLogId,
    });
  }

  function validateCustomerConfirmationAttachments({ workspace, statementId, attachmentIds }) {
    const normalizedAttachmentIds = [
      ...new Set(
        (Array.isArray(attachmentIds) ? attachmentIds : [])
          .map((attachmentId) => String(attachmentId ?? "").trim())
          .filter(Boolean),
      ),
    ];
    for (const attachmentId of normalizedAttachmentIds) {
      const validation = validateBusinessAttachment({
        workspace,
        attachmentId,
        findAttachment,
        expectedOwnerType: "statement",
        expectedOwnerId: statementId,
        expectedPurpose: "statement_customer_confirmation",
        requireUploader: true,
        allowedFileTypes: ["image", "pdf"],
        allowedMimePrefixes: ["image/"],
        allowedMimeTypes: ["application/pdf"],
        errorCodePrefix: "STATEMENT_CONFIRMATION_ATTACHMENT",
        label: "statement customer-confirmation attachment",
      });
      if (!validation.ok) {
        return businessError(validation.statusCode, validation.errorCode, validation.message);
      }
    }
    return { attachmentIds: normalizedAttachmentIds };
  }
}

function buildStableCommandId({ prefix, scope, idempotencyKey, fallback }) {
  const key = String(idempotencyKey ?? "").trim();
  if (!key) return fallback ? fallback() : undefined;
  const digest = createHash("sha256").update(`${scope}:${key}`).digest("hex").slice(0, 24).toUpperCase();
  return `${prefix}-${digest}`;
}

function requireExpectedRevision(value) {
  const revision = Number(value);
  if (!Number.isInteger(revision) || revision < 1) {
    return { error: businessError(422, "EXPECTED_REVISION_REQUIRED", "expectedRevision 必须是当前记录的正整数版本号。") };
  }
  return { value: revision };
}

function mergeStatementPreviewLines(initialLines, persistedLines) {
  if (!Array.isArray(persistedLines) || persistedLines.length === 0) return initialLines;
  const persistedById = new Map();
  for (const line of persistedLines) {
    if (line.statementLineId) persistedById.set(`statement:${line.statementLineId}`, line);
    if (line.orderLineId) persistedById.set(`order:${line.orderLineId}`, line);
  }
  return initialLines.map((line) => {
    const persisted =
      persistedById.get(`statement:${line.statementLineId}`) ??
      persistedById.get(`order:${line.orderLineId}`);
    return persisted ? { ...line, ...persisted } : line;
  });
}

function buildStatementSummary(statement, lineCount) {
  const receivable = Number(statement.receivable ?? 0);
  const received = Number(statement.received ?? 0);
  return {
    receivable,
    received,
    variance: Number(statement.variance ?? Math.max(0, receivable - received)),
    lineCount,
  };
}

function findSendRecordById(workspace, sendRecordId) {
  return (workspace.statementSendRecords ?? []).find(
    (record) => record.sendRecordId === sendRecordId || record.id === sendRecordId,
  );
}

function findRequestedSendRecord(workspace, statementId, requestedSendRecordId) {
  const requestedId = String(requestedSendRecordId ?? "").trim();
  if (requestedId) {
    const requested = findSendRecordById(workspace, requestedId);
    return requested?.statementId === statementId ? requested : null;
  }
  return [...(workspace.statementSendRecords ?? [])]
    .filter((record) => record.statementId === statementId)
    .sort((left, right) => {
      const byTime = String(right.sentAt ?? "").localeCompare(String(left.sentAt ?? ""));
      return byTime || String(right.sendRecordId ?? "").localeCompare(String(left.sendRecordId ?? ""));
    })[0] ?? null;
}

function getAuthenticatedOperatorName(workspace, operatorId) {
  const user = (workspace.users ?? []).find((item) => (item.id ?? item.userId) === operatorId);
  return String(user?.displayName ?? user?.name ?? user?.username ?? operatorId).trim() || operatorId;
}

function success(response) {
  return { response };
}

function notFound(code) {
  return { notFound: true, code };
}

function conflict(code, message) {
  return { error: true, statusCode: 409, code, message };
}

function businessError(statusCode, code, message) {
  return { error: true, statusCode, code, message };
}
