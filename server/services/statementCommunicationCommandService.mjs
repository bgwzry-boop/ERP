import { captureStatementExportSnapshot } from "./statementExportSnapshotService.mjs";
import { closedStatementPaymentStatuses } from "../../shared/statementPaymentPolicy.js";
import { createHash, randomUUID } from "node:crypto";
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
    const idempotencyPayload = { statementId, previewType, templateId, operatorId };
    const replay = await workspace.statementExportRepository.findExportReplay?.({ workspace, idempotencyKey: body.idempotencyKey, idempotencyPayload });
    if (replay) return previewResponse(replay.exportFile, replay.operationLogId);
    const expectedStatementSnapshot = captureStatementExportSnapshot(workspace, statementId);
    const initialLines = buildStatementPreviewLines(workspace, statement, { persistedOnly: true });
    const downloadToken = buildStableCommandId({
      prefix: "DL",
      scope: `statement-preview:${statementId}:${previewType}:${operatorId}`,
      idempotencyKey: body.idempotencyKey,
      fallback: () => `DL-${randomUUID()}`,
    });
    const operationLog = buildOperationLog(workspace, {
      id: buildStableCommandId({
        prefix: "LOG",
        scope: `statement-preview-log:${statementId}:${previewType}:${operatorId}`,
        idempotencyKey: body.idempotencyKey,
        fallback: () => `LOG-EXPORT-${randomUUID()}`,
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
    if (existingExport) return previewResponse(existingExport, existingExport.operationLogId);
    if (!expectedStatementSnapshot) return conflict("STATEMENT_EXPORT_SNAPSHOT_CONFLICT", "账单版本缺失，请刷新账单后重新生成。");
    const invalid = validateExportLines(statement, initialLines);
    if (invalid) return invalid;
    const summary = buildStatementSummary(statement, initialLines.length);
    const exportFile = await storeStatementExportFile(
        workspace,
        buildStatementExportFile(workspace, statement, {
          previewType,
          summary,
          accountingSnapshot: expectedStatementSnapshot,
          lines: initialLines,
          downloadToken,
          operationLogId: operationLog.id,
          createdBy: operatorId,
          createdAt: now(),
          templateId,
        }),
      );
    const transaction = await workspace.statementExportRepository.createExportFile({
      workspace,
      exportFile,
      expectedStatementSnapshot,
      statementLines: initialLines,
      operationLog,
      idempotencyKey: body.idempotencyKey,
      idempotencyPayload,
    });
    return previewResponse(transaction.exportFile, transaction.operationLogId);
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
      ...(closedStatementPaymentStatuses.includes(before.status) ? { status: before.status } : {}),
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
      ...(closedStatementPaymentStatuses.includes(beforeStatement.status) ? { status: beforeStatement.status } : {}),
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

// New files must use finalized accounting facts. Replays retain their saved snapshot.
function validateExportLines(statement, lines) {
  const reject = (message) => businessError(422, "STATEMENT_EXPORT_ACCOUNTING_INCOMPLETE", message);
  if (!Array.isArray(lines) || !lines.length) return reject("账单缺少持久明细，请先完成账单生成与复核。");
  const receivable = moneyCents(statement.receivable);
  if (receivable === null || receivable < 0) return reject("账单应收金额未确认，请先复核。");
  let total = 0;
  const identities = new Set();
  for (const line of lines) {
    if (!line.statementLineId || identities.has(line.statementLineId) || line.statementId !== statement.id) {
      return reject("账单明细归属或编号异常，请先复核。");
    }
    identities.add(line.statementLineId);
    const quantities = [line.deliveredQty, line.chargeableQty, line.freeQty];
    if (quantities.some(value => !Number.isSafeInteger(value) || value < 0)
      || line.deliveredQty !== line.chargeableQty + line.freeQty) {
      return reject("账单实交、计费与赠送数量未确认或不一致，请先复核。");
    }
    const amount = moneyCents(line.amount);
    const adjustment = moneyCents(line.adjustmentAmount);
    const final = moneyCents(line.finalAmount);
    if (amount === null || adjustment === null || final === null || amount < 0 || final < 0
      || amount + adjustment !== final) return reject("账单明细金额或调整金额未确认，请先复核。");
    total += final;
    if (!Number.isSafeInteger(total)) return reject("账单金额超出可核算范围。");
  }
  if (total !== receivable) return reject("账单明细合计与应收金额不一致，请先复核。");
  return null;
}

function moneyCents(value) {
  if (typeof value !== "number" && typeof value !== "string") return null;
  if (typeof value === "string" && !value.trim()) return null;
  const scaled = Number(value) * 100;
  const cents = Math.round(scaled);
  return Number.isSafeInteger(cents) && Math.abs(scaled - cents) < 0.000001 ? cents : null;
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

function previewResponse(exportFile, operationLogId) {
  const snapshot = exportFile.metadata?.statementPreviewSnapshot;
  if (!snapshot) return conflict("STATEMENT_EXPORT_PREVIEW_SNAPSHOT_MISSING", "历史导出缺少可复核的预览快照，请下载原文件或生成新版本。");
  return success({ statementId: exportFile.statementId, previewType: exportFile.previewType,
    templateId: exportFile.metadata?.templateId ?? "", templateVersion: exportFile.metadata?.templateVersion ?? "",
    summary: structuredClone(snapshot.summary), lines: structuredClone(snapshot.lines), downloadToken: exportFile.downloadToken, operationLogId });
}
