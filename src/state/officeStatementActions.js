import {
  getStatementNextStatusForVariance,
  money,
  writeOffAllowedVarianceHandling,
} from "../domain/officeRules.js";

export function markStatementSent(statements, statementId, payload = {}) {
  return statements.map((item) => {
    if (item.id !== statementId) return item;
    const exportRecord =
      payload.exportRecord ??
      (item.exportRecords ?? []).find((record) => record.previewType === "customer_send") ??
      null;
    const sentAt = payload.sentAt ?? "今天 10:30";
    const sendRecordId = String(payload.sendRecordId ?? item.sendRecordId ?? "").trim() || `SEND-LOCAL-${item.id}`;
    return {
      ...item,
      sent: true,
      status: "已发送待回款",
      sentAt,
      sendRecordId,
      sendChannel: payload.channel ?? item.sendChannel ?? "微信",
      sendRecipient: payload.sentTo ?? item.sendRecipient ?? "客户联系人",
      sendOperator: payload.operatorName ?? item.sendOperator ?? "办公室A",
      sendRemark: payload.remark ?? item.sendRemark ?? "",
      sendExportFileName: exportRecord?.fileName ?? item.sendExportFileName ?? "",
      sendExportToken: exportRecord?.downloadToken ?? item.sendExportToken ?? "",
      sendReceiptStatus: item.sendReceiptStatus ?? "待回执",
      sendReceiptAt: item.sendReceiptAt ?? "",
      sendReceiptBy: item.sendReceiptBy ?? "",
      sendReceiptNote: item.sendReceiptNote ?? "",
      sendArchiveStatus: exportRecord?.fileName
        ? `已发送 ${payload.channel ?? item.sendChannel ?? "微信"}：${exportRecord.fileName}`
        : `已发送 ${payload.channel ?? item.sendChannel ?? "微信"}；未关联客户发送版文件`,
    };
  });
}

export function recordStatementSendReceipt(statements, statementId, payload = {}) {
  return statements.map((item) => {
    if (item.id !== statementId) return item;
    const receiptLabel = getStatementSendReceiptLabel(payload.receiptStatus);
    const receiptAt = payload.receiptAt ?? "今天 10:30";
    const receiptBy = payload.operatorName ?? item.sendOperator ?? "办公室A";
    const archiveBase = item.sendExportFileName
      ? item.sendArchiveStatus || `已发送 ${item.sendChannel || "微信"}：${item.sendExportFileName}`
      : item.sendArchiveStatus || `已发送 ${item.sendChannel || "微信"}`;
    const sendArchiveStatus = archiveBase.includes(receiptLabel) ? archiveBase : `${archiveBase}；${receiptLabel}`;
    return {
      ...item,
      sendReceiptStatus: receiptLabel,
      sendReceiptAt: receiptAt,
      sendReceiptBy: receiptBy,
      sendReceiptNote: payload.remark ?? item.sendReceiptNote ?? "",
      sendArchiveStatus,
    };
  });
}

export function recordStatementCustomerConfirmation(statements, statementId, payload = {}) {
  return statements.map((item) => {
    if (item.id !== statementId) return item;
    const receiptLabel = getStatementSendReceiptLabel("confirmed");
    const confirmedAt = payload.confirmedAt ?? "今天 10:30";
    const confirmedByCustomer = payload.confirmedByCustomer ?? payload.confirmedBy ?? item.sendRecipient ?? "客户联系人";
    const content = String(payload.content ?? payload.remark ?? "客户回复确认无误").trim() || "客户回复确认无误";
    const rawAttachmentIds = Array.isArray(payload.attachmentIds)
      ? payload.attachmentIds.map((attachmentId) => String(attachmentId ?? "").trim()).filter(Boolean)
      : [];
    const attachmentFiles = mergeStatementAttachmentFiles(
      item.customerConfirmationAttachmentFiles ?? [],
      (payload.attachmentFiles ?? payload.customerConfirmationAttachmentFiles ?? []).map(normalizePaymentAttachmentFile),
    );
    const attachmentIds = uniqueStringList([
      ...rawAttachmentIds,
      ...attachmentFiles.map((file) => file.attachmentId),
    ]);
    const archiveBase = item.sendExportFileName
      ? item.sendArchiveStatus || `已发送 ${item.sendChannel || "微信"}：${item.sendExportFileName}`
      : item.sendArchiveStatus || `已发送 ${item.sendChannel || "微信"}`;
    const withReceipt = archiveBase.includes(receiptLabel) ? archiveBase : `${archiveBase}；${receiptLabel}`;
    const sendArchiveStatus = withReceipt.includes("客户确认") ? withReceipt : `${withReceipt}；客户确认`;
    return {
      ...item,
      status: "客户已确认",
      customerConfirmationStatus: "客户已确认",
      customerConfirmedAt: confirmedAt,
      customerConfirmedBy: confirmedByCustomer,
      customerConfirmationContent: content,
      customerConfirmationChannel: payload.channel ?? item.sendChannel ?? "微信",
      customerConfirmationAttachmentIds: attachmentIds,
      customerConfirmationAttachmentFiles: attachmentFiles,
      customerConfirmationRecordId: payload.confirmationRecordId ?? item.customerConfirmationRecordId ?? "",
      sendReceiptStatus: receiptLabel,
      sendReceiptAt: confirmedAt,
      sendReceiptBy: payload.operatorName ?? item.sendReceiptBy ?? item.sendOperator ?? "办公室A",
      sendReceiptNote: content,
      sendArchiveStatus,
    };
  });
}

export function getStatementSendReceiptLabel(status) {
  if (status === "delivered") return "已送达";
  if (status === "read") return "客户已读";
  if (status === "confirmed") return "客户已确认";
  if (status === "no_response") return "未回复";
  return "待回执";
}

export function getStatementWriteOffBlocker(statement, blockingAmount) {
  if (statement.receivable > 0 && statement.received <= 0) return "还未登记实收金额，不能确认核销。";
  if (blockingAmount > 0 && !statement.varianceHandling) return "当前仍有差额，需先选择未收差额、抹零、账单有误或多笔付款待齐。";
  if (blockingAmount > 0 && !writeOffAllowedVarianceHandling.includes(statement.varianceHandling)) return `${statement.varianceHandling} 还不是可核销结果，需补款或完成账单调整后再核销。`;
  return "";
}

export function confirmStatementWriteOff(statements, statement, blockingAmount) {
  const nextStatus = blockingAmount > 0 && statement.varianceHandling === "未收差额转欠款" ? "已确认欠款" : "已核销";
  return {
    statements: statements.map((item) =>
      item.id === statement.id
        ? {
            ...item,
            status: nextStatus,
            variance: nextStatus === "已核销" ? 0 : blockingAmount,
            writeOffAt: "今天 10:30",
          }
        : item,
    ),
    toast: nextStatus === "已核销" ? "已确认核销，记录收款确认权限账号：办公室A。" : "已确认本期并转为欠款，仍会在欠款/差额筛选中保留。",
  };
}

export function confirmStatementPayment(statements, statement, payload) {
  const amount = Number(payload.amount || 0);
  const variance = Math.max(0, statement.receivable - amount);
  const attachmentFiles = (payload.paymentAttachmentFiles ?? []).map(normalizePaymentAttachmentFile);
  const attachmentLabel = buildPaymentAttachmentLabel(attachmentFiles, payload.attachmentIds ?? []);
  return {
    statements: statements.map((item) =>
      item.id === statement.id
        ? {
            ...item,
            received: amount,
            variance,
            status: variance > 0 ? "差额待确认" : "收款待确认",
            revision: Number(payload.statementRevision ?? item.revision ?? 0),
            paymentNote: payload.reason,
            paymentAttachmentIds: payload.attachmentIds ?? [],
            paymentAttachmentFiles: attachmentFiles,
            paymentEvidenceStatus: attachmentLabel,
            varianceHandling: "",
            varianceHandledAt: "",
          }
        : item,
    ),
    todoInput:
      variance > 0
        ? {
            type: "收款差额待确认",
            customerId: statement.customerId,
            ref: statement.id,
            refType: "statement",
            refId: statement.id,
            summary: `应收 ${money(statement.receivable)}，实收 ${money(amount)}，差额 ${money(variance)}`,
            latest: "本期",
            urgency: "异常",
            impact: "需确认未收差额、抹零、账单有误或多笔付款待齐",
          }
        : null,
    toast: variance > 0 ? "已登记实收金额，少付进入差额待确认。" : "已登记实收金额，等待有收款确认权限账号核销。",
  };
}

export function updateStatementPaymentAttachmentPreview(statements, statementId, attachmentId, payload = {}) {
  return statements.map((item) => {
    if (item.id !== statementId) return item;
    const nextFiles = (item.paymentAttachmentFiles ?? []).map((file) =>
      file.attachmentId === attachmentId
        ? normalizePaymentAttachmentFile({
            ...file,
            ...payload,
            attachmentId,
            hasContent: payload.previewDataUrl ? true : file.hasContent,
          })
        : normalizePaymentAttachmentFile(file),
    );
    return {
      ...item,
      paymentAttachmentFiles: nextFiles,
      paymentEvidenceStatus: buildPaymentAttachmentLabel(nextFiles, item.paymentAttachmentIds ?? []),
    };
  });
}

export function updateStatementCustomerConfirmationAttachmentPreview(statements, statementId, attachmentId, payload = {}) {
  return statements.map((item) => {
    if (item.id !== statementId) return item;
    const nextFiles = (item.customerConfirmationAttachmentFiles ?? []).map((file) =>
      file.attachmentId === attachmentId
        ? normalizePaymentAttachmentFile({
            ...file,
            ...payload,
            attachmentId,
            hasContent: payload.previewDataUrl ? true : file.hasContent,
          })
        : normalizePaymentAttachmentFile(file),
    );
    return {
      ...item,
      customerConfirmationAttachmentFiles: nextFiles,
      customerConfirmationAttachmentIds: uniqueStringList([
        ...(item.customerConfirmationAttachmentIds ?? []),
        ...nextFiles.map((file) => file.attachmentId),
      ]),
    };
  });
}

export function syncStatementPaymentAttachments(statements, statementId, attachmentFiles = []) {
  const nextAttachmentFiles = attachmentFiles.map(normalizePaymentAttachmentFile).filter((file) => file.attachmentId || file.fileName);
  return statements.map((item) => {
    if (item.id !== statementId || !nextAttachmentFiles.length) return item;
    const existingFiles = (item.paymentAttachmentFiles ?? []).map(normalizePaymentAttachmentFile);
    const mergedFiles = [...nextAttachmentFiles];
    existingFiles.forEach((existingFile) => {
      const index = mergedFiles.findIndex((file) => file.attachmentId && file.attachmentId === existingFile.attachmentId);
      if (index >= 0) {
        mergedFiles[index] = normalizePaymentAttachmentFile({
          ...mergedFiles[index],
          previewDataUrl: existingFile.previewDataUrl || mergedFiles[index].previewDataUrl,
          previewStatus: existingFile.previewStatus || mergedFiles[index].previewStatus,
          contentType: existingFile.contentType || mergedFiles[index].contentType,
          contentDisposition: existingFile.contentDisposition || mergedFiles[index].contentDisposition,
          source: existingFile.source || mergedFiles[index].source,
        });
      } else {
        mergedFiles.push(existingFile);
      }
    });
    const mergedAttachmentIds = mergedFiles.map((file) => file.attachmentId).filter(Boolean);
    return {
      ...item,
      paymentAttachmentIds: mergedAttachmentIds,
      paymentAttachmentFiles: mergedFiles,
      paymentEvidenceStatus: buildPaymentAttachmentLabel(mergedFiles, mergedAttachmentIds),
    };
  });
}

export function syncStatementCustomerConfirmationAttachments(statements, statementId, attachmentFiles = []) {
  const nextAttachmentFiles = attachmentFiles.map(normalizePaymentAttachmentFile).filter((file) => file.attachmentId || file.fileName);
  return statements.map((item) => {
    if (item.id !== statementId || !nextAttachmentFiles.length) return item;
    const mergedFiles = mergeStatementAttachmentFiles(item.customerConfirmationAttachmentFiles ?? [], nextAttachmentFiles);
    return {
      ...item,
      customerConfirmationAttachmentIds: uniqueStringList([
        ...(item.customerConfirmationAttachmentIds ?? []),
        ...mergedFiles.map((file) => file.attachmentId),
      ]),
      customerConfirmationAttachmentFiles: mergedFiles,
    };
  });
}

export function confirmStatementVariance(statements, statement, blockingAmount, payload, hasOpenVarianceTodo) {
  return {
    statements: statements.map((item) =>
      item.id === statement.id
        ? {
            ...item,
            status: getStatementNextStatusForVariance(payload.reason),
            variance: blockingAmount,
            varianceHandling: payload.reason,
            varianceHandledAt: "今天 10:30",
          }
        : item,
    ),
    todoInput:
      blockingAmount > 0 && !hasOpenVarianceTodo
        ? {
            type: "收款差额待确认",
            customerId: statement.customerId,
            ref: statement.id,
            refType: "statement",
            refId: statement.id,
            summary: `差额 ${money(blockingAmount)}，处理结果：${payload.reason}`,
            latest: "本期",
            urgency: payload.reason === "抹零/减免已审批" ? "关注" : "异常",
            impact: "影响核销、欠款和客户沟通",
          }
        : null,
    toast: `已记录差额处理结果：${payload.reason}。${writeOffAllowedVarianceHandling.includes(payload.reason) ? "可进入确认核销判断。" : "暂不能直接核销。"}`,
  };
}

export function recordStatementExport(statements, statement, payload = {}) {
  const versionCount = Number(statement.exportVersionCount ?? 0) + 1;
  const fileName = payload.fileName || `statement-${statement.id}.xlsx`;
  const record = normalizeStatementExportRecord(
    {
      statementId: statement.id,
      previewType: payload.previewType ?? "internal_archive",
      downloadToken: payload.downloadToken ?? "",
      operationLogId: payload.operationLogId ?? "",
      fileName,
      contentType:
        payload.contentType ?? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      createdAt: payload.exportedAt ?? "今天 10:30",
      source: payload.source ?? "后端 API 文件",
      templateId: payload.templateId ?? "",
      templateVersion: payload.templateVersion ?? "",
      workbookFormat: payload.workbookFormat ?? "",
      worksheetNames: payload.worksheetNames ?? [],
    },
    statement,
  );
  const exportRecords = [record, ...(statement.exportRecords ?? [])];
  return statements.map((item) =>
    item.id === statement.id
      ? {
          ...item,
          exportVersionCount: versionCount,
          lastExportFileName: fileName,
          lastExportAt: record.createdAt,
          lastExportSource: payload.source ?? "后端 API 文件",
          lastExportToken: payload.downloadToken ?? "",
          lastExportType: payload.previewType ?? "internal_archive",
          exportRecords,
          exportArchiveStatus: `已生成 ${versionCount} 版：${fileName}`,
        }
      : item,
  );
}

export function syncStatementExportRecords(statements, statement, records = [], payload = {}) {
  const exportRecords = records.map((record) => normalizeStatementExportRecord(record, statement));
  const latest = exportRecords[0];
  return statements.map((item) =>
    item.id === statement.id
      ? {
          ...item,
          exportRecords,
          exportVersionCount: exportRecords.length,
          lastExportFileName: latest?.fileName ?? "",
          lastExportAt: latest?.createdAt ?? "",
          lastExportSource: latest?.source ?? payload.source ?? "后端 API 文件",
          lastExportToken: latest?.downloadToken ?? "",
          lastExportType: latest?.previewType ?? "",
          exportArchiveStatus: latest
            ? `已生成 ${exportRecords.length} 版：${latest.fileName}`
            : "未生成导出文件",
        }
      : item,
  );
}

function normalizeStatementExportRecord(record, statement) {
  return {
    statementId: record.statementId ?? statement.id,
    previewType: record.previewType ?? "internal_archive",
    downloadToken: record.downloadToken ?? "",
    operationLogId: record.operationLogId ?? "",
    fileName: record.fileName ?? `statement-${statement.id}.xlsx`,
    contentType: record.contentType ?? "",
    createdAt: record.createdAt ?? "今天 10:30",
    source: record.source ?? "后端 API 文件",
    templateId: record.templateId ?? "",
    templateVersion: record.templateVersion ?? "",
    workbookFormat: record.workbookFormat ?? "",
    worksheetNames: Array.isArray(record.worksheetNames) ? record.worksheetNames : [],
  };
}

function normalizePaymentAttachmentFile(file) {
  return {
    attachmentId: file?.attachmentId ?? "",
    fileName: file?.fileName ?? "",
    mimeType: file?.mimeType ?? "",
    fileSize: Number.isFinite(file?.fileSize) ? file.fileSize : undefined,
    hasContent: Boolean(file?.hasContent || file?.previewDataUrl),
    url: file?.url ?? "",
    uploadedBy: file?.uploadedBy ?? "",
    uploadedAt: file?.uploadedAt ?? "",
    storageProvider: file?.storageProvider ?? "",
    storageKey: file?.storageKey ?? "",
    contentDigest: file?.contentDigest ?? "",
    source: file?.source ?? "",
    previewDataUrl: file?.previewDataUrl ?? "",
    previewStatus: file?.previewStatus ?? (file?.previewDataUrl ? "已加载预览" : file?.hasContent ? "可读取内容" : "待上传内容"),
    contentType: file?.contentType ?? file?.mimeType ?? "",
    contentDisposition: file?.contentDisposition ?? "",
    contentSource: file?.contentSource ?? "",
  };
}

function mergeStatementAttachmentFiles(existingFiles = [], nextFiles = []) {
  const merged = (Array.isArray(existingFiles) ? existingFiles : []).map(normalizePaymentAttachmentFile);
  (Array.isArray(nextFiles) ? nextFiles : []).map(normalizePaymentAttachmentFile).forEach((file) => {
    if (!file.attachmentId && !file.fileName) return;
    const index = merged.findIndex((item) => item.attachmentId && item.attachmentId === file.attachmentId);
    if (index >= 0) {
      merged[index] = normalizePaymentAttachmentFile({
        ...merged[index],
        ...file,
        previewDataUrl: file.previewDataUrl || merged[index].previewDataUrl,
        previewStatus: file.previewStatus || merged[index].previewStatus,
        contentType: file.contentType || merged[index].contentType,
        contentDisposition: file.contentDisposition || merged[index].contentDisposition,
        contentSource: file.contentSource || merged[index].contentSource,
        source: file.source || merged[index].source,
      });
    } else {
      merged.push(file);
    }
  });
  return merged;
}

function uniqueStringList(values) {
  return [...new Set((Array.isArray(values) ? values : []).map((value) => String(value ?? "").trim()).filter(Boolean))];
}

function buildPaymentAttachmentLabel(attachmentFiles, attachmentIds) {
  if (attachmentFiles.length) {
    const names = attachmentFiles.map((file) => file.fileName).filter(Boolean).join("、");
    return names ? `已登记 ${attachmentFiles.length} 张付款截图：${names}` : `已登记 ${attachmentFiles.length} 张付款截图`;
  }
  if (attachmentIds.length) return `已登记 ${attachmentIds.length} 张付款截图`;
  return "未登记付款截图";
}
