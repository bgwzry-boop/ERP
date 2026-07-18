export function buildAttachment({ attachmentId, ownerId, uploadedBy }) {
  return {
    attachmentId,
    ownerType: "statement",
    ownerId,
    fileType: "image",
    purpose: "payment_screenshot",
    url: `/api/attachments/${attachmentId}/content`,
    status: "uploaded",
    uploadedBy,
    uploadedAt: "2026-07-01T10:30:00.000Z",
    fileName: "payment-proof-postgres-live.png",
    contentRef: `p0://payment-screenshot/${ownerId}/postgres-live`,
    mimeType: "image/png",
    fileSize: 13,
    contentDataUrl: "",
    storageProvider: "local_fs",
    storageKey: `attachments/${attachmentId}/payment-proof-postgres-live.png`,
    contentDigest: "a".repeat(64),
    thumbnailStorageKey: "",
    thumbnailUrl: "",
    signedUrlExpiresAt: "",
    hasContent: true,
    remark: "postgres live check",
  };
}

export function buildAccessLog({ logId, attachmentId, operatorId, operationLogId }) {
  return {
    logId,
    attachmentId,
    operationLogId,
    action: "attachment_content_read",
    operatorId,
    accessMode: "permission",
    deliveryMode: "api_permission",
    storageProvider: "local_fs",
    storageKey: `attachments/${attachmentId}/payment-proof-postgres-live.png`,
    ownerType: "statement",
    ownerId: "ST-LIVE-REPO-001",
    purpose: "payment_screenshot",
    fileName: "payment-proof-postgres-live.png",
    contentType: "image/png",
    expiresAt: "",
    metadata: { check: "postgres-live" },
    occurredAt: "2026-07-01T10:30:00.000Z",
  };
}

export function buildPaymentRecord({ paymentRecordId, statementId, customerId, operatorId, amount = 273 }) {
  return {
    paymentRecordId,
    bizNo: paymentRecordId,
    statementId,
    customerId,
    amount,
    paidAt: "2026-07-01T10:30:00.000Z",
    method: "wechat",
    status: "recorded",
    attachmentIds: ["ATT-PAY-LIVE-001"],
    operatorId,
    remark: "postgres live payment repository",
  };
}

export function buildStatement({ id, customerId, status, received = 0, variance = 273, revision = 1 }) {
  return {
    id,
    customerId,
    status,
    receivable: 273,
    received,
    variance,
    revision,
  };
}

export function buildTodo({ todoId, statementId }) {
  return {
    id: todoId,
    type: "收款差额待确认",
    customerId: "C-LIVE-REPO",
    ref: statementId,
    summary: "应收 273，实收 200，差额 73",
    latest: "本期",
    urgency: "异常",
    impact: "需确认未收差额",
  };
}

export function buildOperationLog({ logId, action = "record_statement_payment", before, after }) {
  const reasonByAction = {
    record_statement_payment: "postgres live payment transaction",
    handle_statement_variance: "未收差额转欠款",
    write_off_statement: "未收差额转欠款",
    mark_statement_sent: "客户发送版对账单已发送",
  };
  return {
    id: logId,
    targetType: "statement",
    targetId: after.id,
    action,
    before,
    after,
    reason: reasonByAction[action] ?? "postgres live statement action",
    operatorId: "U-FINANCE-A",
    pageKey: "api",
    occurredAt: "2026-07-01T10:30:00.000Z",
    createdAt: "2026-07-01T10:30:00.000Z",
  };
}

export function buildVarianceRecord({ varianceRecordId, statementId, amount, operatorId }) {
  return {
    varianceRecordId,
    statementId,
    paymentRecordId: "",
    amount,
    handlingResult: "carry_to_debt",
    reason: "未收差额转欠款",
    status: "recorded",
    attachmentId: "",
    operatorId,
  };
}

export function buildSendRecord({ sendRecordId, statementId, exportFileId, operatorId }) {
  return {
    sendRecordId,
    statementId,
    channel: "wechat",
    sentTo: "客户财务",
    exportFileId,
    includePaymentQr: false,
    sentBy: operatorId,
    sentAt: "2026-07-01T10:35:00.000Z",
    remark: "postgres live statement send transaction",
    receiptStatus: "pending",
    receiptAt: "",
    receiptBy: "",
    receiptNote: "",
    revision: 1,
  };
}

export function buildStatementExportFile({ statementId, downloadToken, operationLogId }) {
  return {
    exportFileId: downloadToken,
    statementId,
    previewType: "customer_send",
    downloadToken,
    operationLogId,
    fileName: `statement-${statementId}.xlsx`,
    contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    content: Buffer.from("Postgres Export Live XLSX").toString("base64"),
    contentEncoding: "base64",
    storageProvider: "database",
    storageKey: "",
    contentDigest: "",
    createdBy: "U-FINANCE-A",
    createdAt: "2026-07-02T10:30:00.000Z",
    metadata: { lineCount: 1, receivable: 273, contentEncoding: "base64" },
  };
}

export function buildStatementExportLines({ statementId, orderLineId, fulfillmentId }) {
  return [
    {
      statementLineId: `${statementId}-001`,
      statementId,
      orderLineId,
      fulfillmentId,
      deliveredQty: 273,
      chargeableQty: 273,
      freeQty: 0,
      amount: 273,
      adjustmentAmount: 0,
      finalAmount: 273,
      createdAt: "2026-07-02T10:30:00.000Z",
    },
  ];
}
