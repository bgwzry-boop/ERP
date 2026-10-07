import assert from "node:assert/strict";
import { postgresAssertions } from "../assertions.mjs";
import { assertStatementXlsxWorkbook } from "../../xlsxTestUtils.mjs";

export async function checkStatementApi(runtime, { baseUrl, headers, scheduleHeaders, postJson, getJson, getBinary }) {
  const { queryJson, runPsql, sqlLiteral } = runtime;
  const statementPreviewBody = {
    templateId: "tpl-p0-statement-customer-send",
    previewType: "customer_send",
    operatorId: "U-SPOOFED",
  };
  const statementPreviewHeaders = { ...headers, "idempotency-key": "statement-preview-api-live-001" };
  const preview = await postJson(
    baseUrl,
    "/api/statements/ST-0629-001/preview",
    statementPreviewBody,
    { headers: statementPreviewHeaders },
  );
  const replayedPreview = await postJson(
    baseUrl,
    "/api/statements/ST-0629-001/preview",
    statementPreviewBody,
    { headers: statementPreviewHeaders },
  );
  assert.equal(replayedPreview.downloadToken, preview.downloadToken);
  assert.equal(replayedPreview.operationLogId, preview.operationLogId);
  assert.equal(preview.statementId, "ST-0629-001");
  assert.ok(preview.downloadToken);
  assert.ok(preview.lines.length >= 1);
  assert.equal(
    queryJson(
      `SELECT json_build_object('downloadToken', download_token, 'operationLogId', operation_log_id, 'contentLength', length(content_text)) AS result FROM statement_export_files WHERE statement_id = 'ST-0629-001' AND download_token = ${sqlLiteral(
        preview.downloadToken,
      )};`,
    ).downloadToken,
    preview.downloadToken,
  );
  assert.equal(
    Number(runPsql("SELECT COUNT(*) FROM statement_lines WHERE statement_id = 'ST-0629-001';", { capture: true }).trim()),
    preview.lines.length,
  );
  assert.equal(
    queryJson(
      `SELECT json_build_object('createdBy', created_by) AS result FROM statement_export_files WHERE download_token = ${sqlLiteral(
        preview.downloadToken,
      )};`,
    ).createdBy,
    "U-OFFICE-A",
  );
  assert.equal(
    Number(
      runPsql(
        `SELECT COUNT(*) FROM statement_export_files WHERE download_token = ${sqlLiteral(preview.downloadToken)};`,
        { capture: true },
      ).trim(),
    ),
    1,
  );
  assert.equal(
    queryJson(
      "SELECT json_build_object('orderLineId', order_line_id, 'chargeableQty', chargeable_qty, 'amount', amount) AS result FROM statement_lines WHERE statement_id = 'ST-0629-001' ORDER BY id LIMIT 1;",
    ).orderLineId,
    preview.lines[0].orderLineId,
  );
  const exportedWorkbook = await getBinary(baseUrl, `/api/statements/ST-0629-001/exports/${preview.downloadToken}`, {
    headers,
  });
  assert.equal(exportedWorkbook.contentType, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  assertStatementXlsxWorkbook(exportedWorkbook.bytes, { templateVersion: "p0-statement-xlsx-v1" });
  const exportList = await getJson(baseUrl, "/api/statements/ST-0629-001/exports", { headers });
  postgresAssertions.assertExportList({ exportList, preview });

  const statementSendExpectedRevision = Number(
    queryJson("SELECT json_build_object('revision', revision) AS result FROM statements WHERE id = 'ST-0629-001';").revision,
  );
  const statementSendBody = {
    expectedRevision: statementSendExpectedRevision,
    channel: "wechat",
    sentTo: "张三服饰财务",
    sentAt: "2026-07-01T10:35:00.000Z",
    operatorId: "U-SPOOFED",
    operatorName: "伪造人员",
    remark: "postgres live statement send route",
  };
  const statementSendHeaders = { ...headers, "idempotency-key": "statement-send-api-live-001" };
  const markedSent = await postJson(
    baseUrl,
    "/api/statements/ST-0629-001/mark-sent",
    statementSendBody,
    { headers: statementSendHeaders },
  );
  const replayedMarkedSent = await postJson(
    baseUrl,
    "/api/statements/ST-0629-001/mark-sent",
    statementSendBody,
    { headers: statementSendHeaders },
  );
  postgresAssertions.assertReplayedMarkedSent({ replayedMarkedSent, markedSent });
  const sentStatement = queryJson(
    "SELECT json_build_object('status', status, 'lastSentAt', last_sent_at) AS result FROM statements WHERE id = 'ST-0629-001';",
  );
  assert.equal(sentStatement.status, "已发送待回款");
  assert.equal(
    queryJson("SELECT json_build_object('exportFileId', export_file_id, 'sentTo', sent_to, 'sentBy', sent_by) AS result FROM statement_send_records WHERE statement_id = 'ST-0629-001' ORDER BY sent_at DESC LIMIT 1;").exportFileId,
    preview.downloadToken,
  );
  assert.equal(
    queryJson(`SELECT json_build_object('sentBy', sent_by) AS result FROM statement_send_records WHERE id = ${sqlLiteral(markedSent.sendRecordId)};`).sentBy,
    "U-OFFICE-A",
  );
  assert.equal(
    Number(
      runPsql("SELECT COUNT(*) FROM operation_logs WHERE target_type = 'statement' AND target_id = 'ST-0629-001' AND action = 'mark_statement_sent';", {
        capture: true,
      }).trim(),
    ),
    1,
  );

  const statementReceiptExpectedRevision = Number(
    queryJson(
      `SELECT json_build_object('revision', revision) AS result FROM statement_send_records WHERE id = ${sqlLiteral(markedSent.sendRecordId)};`,
    ).revision,
  );
  const statementReceiptBody = {
    expectedRevision: statementReceiptExpectedRevision,
    sendRecordId: markedSent.sendRecordId,
    receiptStatus: "read",
    receiptAt: "2026-07-01T11:05:00.000Z",
    operatorId: "U-SPOOFED",
    remark: "postgres live customer read receipt route",
  };
  const statementReceiptHeaders = { ...headers, "idempotency-key": "statement-receipt-api-live-001" };
  const sendReceipt = await postJson(
    baseUrl,
    "/api/statements/ST-0629-001/send-receipt",
    statementReceiptBody,
    { headers: statementReceiptHeaders },
  );
  const replayedSendReceipt = await postJson(
    baseUrl,
    "/api/statements/ST-0629-001/send-receipt",
    statementReceiptBody,
    { headers: statementReceiptHeaders },
  );
  assert.equal(replayedSendReceipt.operationLogId, sendReceipt.operationLogId);
  assert.equal(sendReceipt.sendRecordId, markedSent.sendRecordId);
  assert.equal(sendReceipt.receiptStatus, "read");
  assert.ok(sendReceipt.operationLogId);
  assert.equal(
    queryJson("SELECT json_build_object('receiptStatus', receipt_status, 'receiptBy', receipt_by) AS result FROM statement_send_records WHERE id = " + sqlLiteral(markedSent.sendRecordId) + ";").receiptStatus,
    "read",
  );
  assert.equal(
    queryJson("SELECT json_build_object('receiptBy', receipt_by) AS result FROM statement_send_records WHERE id = " + sqlLiteral(markedSent.sendRecordId) + ";").receiptBy,
    "U-OFFICE-A",
  );

  const statementConfirmationAttachment = await postJson(
    baseUrl,
    "/api/attachments",
    {
      ownerType: "statement",
      ownerId: "ST-0629-001",
      purpose: "statement_customer_confirmation",
      fileType: "image",
      fileName: "statement-confirmation-live-route.png",
      mimeType: "image/png",
      contentRef: "p0://statement-customer-confirmation/ST-0629-001/live-route",
      contentDataUrl: "data:image/png;base64,c3RhdGVtZW50LWNvbmZpcm1hdGlvbi1saXZl",
      uploadedBy: "U-SPOOFED",
      idempotencyKey: "statement-confirmation-attachment-api-live-001",
    },
    { headers },
  );
  assert.equal(statementConfirmationAttachment.uploadedBy, "U-OFFICE-A");
  const statementConfirmationExpectedRevision = Number(
    queryJson("SELECT json_build_object('revision', revision) AS result FROM statements WHERE id = 'ST-0629-001';").revision,
  );
  const statementConfirmationBody = {
    expectedRevision: statementConfirmationExpectedRevision,
    sendRecordId: markedSent.sendRecordId,
    confirmationType: "customer_reply",
    channel: "wechat",
    confirmedByCustomer: "张三服饰财务",
    confirmedAt: "2026-07-01T11:15:00.000Z",
    content: "postgres live customer confirmed statement route",
    attachmentIds: [statementConfirmationAttachment.attachmentId],
    operatorId: "U-SPOOFED",
    operatorName: "伪造人员",
    remark: "postgres live customer confirmation route",
  };
  const statementConfirmationHeaders = { ...headers, "idempotency-key": "statement-confirmation-api-live-001" };
  const customerConfirmation = await postJson(
    baseUrl,
    "/api/statements/ST-0629-001/customer-confirmation",
    statementConfirmationBody,
    { headers: statementConfirmationHeaders },
  );
  const replayedCustomerConfirmation = await postJson(
    baseUrl,
    "/api/statements/ST-0629-001/customer-confirmation",
    statementConfirmationBody,
    { headers: statementConfirmationHeaders },
  );
  assert.equal(replayedCustomerConfirmation.confirmationRecordId, customerConfirmation.confirmationRecordId);
  assert.equal(replayedCustomerConfirmation.operationLogId, customerConfirmation.operationLogId);
  assert.equal(customerConfirmation.status, "客户已确认");
  assert.equal(customerConfirmation.sendRecordId, markedSent.sendRecordId);
  assert.equal(customerConfirmation.receiptStatus, "confirmed");
  assert.equal(customerConfirmation.confirmationRecord.content, "postgres live customer confirmed statement route");
  assert.equal(customerConfirmation.confirmationRecord.attachmentIds[0], statementConfirmationAttachment.attachmentId);
  assert.ok(customerConfirmation.operationLogId);
  assert.equal(
    queryJson("SELECT json_build_object('status', status) AS result FROM statements WHERE id = 'ST-0629-001';").status,
    "客户已确认",
  );
  assert.equal(
    queryJson(
      "SELECT json_build_object('content', content, 'attachmentIds', attachment_ids_json) AS result FROM statement_confirmation_records WHERE id = " +
        sqlLiteral(customerConfirmation.confirmationRecordId) +
        ";",
    ).attachmentIds[0],
    statementConfirmationAttachment.attachmentId,
  );
  assert.equal(
    queryJson(
      "SELECT json_build_object('recordedBy', recorded_by) AS result FROM statement_confirmation_records WHERE id = " +
        sqlLiteral(customerConfirmation.confirmationRecordId) +
        ";",
    ).recordedBy,
    "U-OFFICE-A",
  );

  const statementPaymentAttachment = await postJson(
    baseUrl,
    "/api/attachments",
    {
      ownerType: "statement",
      ownerId: "ST-0629-001",
      purpose: "payment_screenshot",
      fileType: "image",
      fileName: "statement-payment-live-route.png",
      mimeType: "image/png",
      contentRef: "p0://payment-screenshot/ST-0629-001/live-route",
      contentDataUrl: "data:image/png;base64,c3RhdGVtZW50LXBheW1lbnQtbGl2ZQ==",
      uploadedBy: "U-SPOOFED",
      idempotencyKey: "statement-payment-attachment-api-live-001",
    },
    { headers },
  );
  assert.equal(statementPaymentAttachment.uploadedBy, "U-OFFICE-A");
  const statementPaymentExpectedRevision = Number(
    queryJson("SELECT json_build_object('revision', revision) AS result FROM statements WHERE id = 'ST-0629-001';").revision,
  );
  const payment = await postJson(
    baseUrl,
    "/api/statements/ST-0629-001/payments",
    {
      expectedRevision: statementPaymentExpectedRevision,
      amount: 273,
      paidAt: "2026-07-01T10:30:00.000Z",
      method: "wechat",
      operatorId: "U-OFFICE-A",
      attachmentIds: [statementPaymentAttachment.attachmentId],
      remark: "postgres live payment route",
    },
    { headers },
  );
  postgresAssertions.assertPayment({ payment, statementPaymentAttachment });

  const paymentCount = Number(
    runPsql("SELECT COUNT(*) FROM payment_records WHERE statement_id = 'ST-0629-001' AND amount = 273;", {
      capture: true,
    }).trim(),
  );
  assert.equal(paymentCount, 1);
  const statementAfterPayment = queryJson(
    "SELECT json_build_object('status', status, 'received', received_amount, 'variance', variance_amount) AS result FROM statements WHERE id = 'ST-0629-001';",
  );
  assert.equal(statementAfterPayment.status, "收款待确认");
  assert.equal(Number(statementAfterPayment.received), 273);
  assert.equal(Number(statementAfterPayment.variance), 0);
  assert.equal(
    Number(
      runPsql("SELECT COUNT(*) FROM operation_logs WHERE target_type = 'statement' AND target_id = 'ST-0629-001' AND action = 'record_statement_payment';", {
        capture: true,
      }).trim(),
    ),
    1,
  );

  const statementVarianceExpectedRevision = Number(
    queryJson("SELECT json_build_object('revision', revision) AS result FROM statements WHERE id = 'ST-0629-002';").revision,
  );
  const variance = await postJson(
    baseUrl,
    "/api/statements/ST-0629-002/variance",
    {
      expectedRevision: statementVarianceExpectedRevision,
      varianceAmount: 28000,
      handlingResult: "carry_to_debt",
      reason: "未收差额转欠款",
      directDecisionContent: { summary: "负责人确认差额转欠款" },
      operatorId: "U-SPOOFED",
    },
    { headers: scheduleHeaders },
  );
  postgresAssertions.assertVariance({ variance });
  const varianceStatement = queryJson(
    "SELECT json_build_object('status', status, 'variance', variance_amount) AS result FROM statements WHERE id = 'ST-0629-002';",
  );
  assert.equal(varianceStatement.status, "有欠款");
  assert.equal(Number(runPsql("SELECT COUNT(*) FROM variance_records WHERE statement_id = 'ST-0629-002';", { capture: true }).trim()), 1);

  const writeOff = await postJson(
    baseUrl,
    "/api/statements/ST-0629-002/write-off",
    {
      expectedRevision: variance.statementRevision,
      confirmReason: "确认差额转欠款",
      directDecisionContent: { summary: "负责人确认欠款核销" },
      operatorId: "U-SPOOFED",
    },
    { headers: scheduleHeaders },
  );
  assert.equal(writeOff.status, "已确认欠款");
  assert.equal(writeOff.debtAmount, 28000);
  assert.equal(
    queryJson("SELECT json_build_object('status', status, 'variance', variance_amount) AS result FROM statements WHERE id = 'ST-0629-002';").status,
    "已确认欠款",
  );
  assert.equal(
    Number(
      runPsql("SELECT COUNT(*) FROM operation_logs WHERE target_type = 'statement' AND target_id = 'ST-0629-002' AND action = 'write_off_statement';", {
        capture: true,
      }).trim(),
    ),
    1,
  );
  return { preview };
}
