import assert from "node:assert/strict";
import { postgresAssertions } from "../assertions.mjs";
import { createPostgresDriverDeliveryTaskReadRepository } from "../../../server/driverDeliveryTaskReadRepository.mjs";

export async function checkDriverApi(runtime, { baseUrl, headers, driverHeaders, databaseOnlyOrderLines, postJson, getJson, assertPostgresOperationLogOperator }) {
  const { queryJson, sqlLiteral } = runtime;
  const databaseDriverTasks = await getJson(
    baseUrl,
    "/api/driver/delivery-tasks?driverId=U-DRIVER-A&status=%E5%B7%B2%E5%AE%8C%E6%88%90&pageSize=5",
    { headers: driverHeaders },
  );
  assert.equal(databaseDriverTasks.items.some((item) => item.fulfillmentId === "F002"), true);
  const databaseDriverTaskDetail = await getJson(baseUrl, "/api/driver/delivery-tasks/F002", { headers: driverHeaders });
  postgresAssertions.assertDatabaseDriverTaskDetail({ databaseDriverTaskDetail });

  const driverExceptionOccurredAt = "2026-07-02T09:40:00.000Z";
  const apiDriverException = await postJson(
    baseUrl,
    "/api/driver/delivery-tasks/F006/exception",
    {
      fulfillmentId: "F006",
      reasonCode: "customer_unavailable",
      reasonText: "客户不在",
      actualQty: 0,
      operatorId: "U-DRIVER-A",
      occurredAt: driverExceptionOccurredAt,
      remark: "postgres live driver exception check",
    },
    { headers: driverHeaders },
  );
  postgresAssertions.assertApiDriverException({ apiDriverException, driverExceptionOccurredAt });
  const persistedDriverException = queryJson(
    "SELECT json_build_object('status', f.status, 'actualQty', f.actual_qty, 'reasonCode', e.reason_code, 'reason', e.reason, 'actualQtyException', e.actual_qty, 'todoId', e.todo_id, 'occurredAt', e.occurred_at) AS result FROM fulfillment_records AS f JOIN fulfillment_exceptions AS e ON e.fulfillment_id = f.id WHERE f.id = 'F006' ORDER BY e.created_at DESC, e.id DESC LIMIT 1;",
  );
  postgresAssertions.assertPersistedDriverException({ persistedDriverException, apiDriverException, driverExceptionOccurredAt });
  const coldStartAfterDriverException = await createPostgresDriverDeliveryTaskReadRepository({ queryJson }).getDriverDeliveryTask({
    fulfillmentId: "F006",
    operatorId: "U-DRIVER-A",
  });
  postgresAssertions.assertColdStartAfterDriverException({ coldStartAfterDriverException, driverExceptionOccurredAt });

  const driverPaperReady = await getJson(baseUrl, "/api/fulfillments/F008", { headers });
  const driverPaperDocument = driverPaperReady.paperOutboundDocument;
  const driverPaperHandoff = await postJson(
    baseUrl,
    "/api/fulfillments/F008/paper-handoff",
    {
      expectedRevision: driverPaperReady.revision,
      paperOutboundDocumentId: driverPaperDocument.paperOutboundDocumentId,
      paperDocumentVersion: driverPaperDocument.documentVersion,
      paperDocumentRevision: driverPaperDocument.revision,
      note: "PostgreSQL live 纸单交库房",
      idempotencyKey: "driver-paper-handoff-f008-live-001",
    },
    { headers },
  );
  assert.equal(driverPaperHandoff.paperOutboundDocument.status, "已交库房");
  const driverBeforeWarehouseExecution = await getJson(baseUrl, "/api/fulfillments/F008", { headers });
  const handedDriverPaperDocument = driverBeforeWarehouseExecution.paperOutboundDocument;
  const driverWarehouseExecution = await postJson(
    baseUrl,
    "/api/fulfillments/F008/warehouse-execution",
    {
      expectedRevision: driverBeforeWarehouseExecution.revision,
      paperOutboundDocumentId: handedDriverPaperDocument.paperOutboundDocumentId,
      paperDocumentVersion: handedDriverPaperDocument.documentVersion,
      paperDocumentRevision: handedDriverPaperDocument.revision,
      result: "实物已出库",
      actualQty: 3000,
      physicalExecutorEmployeeId: "EMP-MD-LIVE-001",
      feedbackChannel: "纸面",
      executedAt: "2026-07-02T08:50:00.000Z",
      note: "库房按纸单完成规格和数量核对",
      idempotencyKey: "driver-warehouse-execution-f008-live-001",
    },
    { headers },
  );
  assert.equal(driverWarehouseExecution.status, "待司机装车");
  assert.equal(driverWarehouseExecution.warehouseOutboundExecution.result, "实物已出库");

  const driverLoadAt = "2026-07-02T09:05:00.000Z";
  const driverLoadRemark = "postgres live driver load check；装车核对：6/6包";
  const apiDriverLoad = await postJson(
    baseUrl,
    "/api/driver/delivery-tasks/F008/load-confirm",
    {
      fulfillmentId: "F008",
      loadedAt: driverLoadAt,
      operatorId: "U-DRIVER-A",
      checkedPackageIds: [
        "PKG-LIVE-F008-1",
        "PKG-LIVE-F008-2",
        "PKG-LIVE-F008-3",
        "PKG-LIVE-F008-4",
        "PKG-LIVE-F008-5",
        "PKG-LIVE-F008-6",
      ],
      packageCheckSummary: "6/6包",
      remark: driverLoadRemark,
    },
    { headers: driverHeaders },
  );
  postgresAssertions.assertApiDriverLoad({ apiDriverLoad, driverLoadAt, driverLoadRemark });
  const persistedDriverLoad = queryJson(
    "SELECT json_build_object('status', status, 'loadedAt', loaded_at, 'loadedBy', loaded_by, 'driverRemark', driver_remark) AS result FROM fulfillment_records WHERE id = 'F008';",
  );
  postgresAssertions.assertPersistedDriverLoad({ persistedDriverLoad, driverLoadAt, driverLoadRemark });
  const coldStartAfterDriverLoad = await createPostgresDriverDeliveryTaskReadRepository({ queryJson }).getDriverDeliveryTask({
    fulfillmentId: "F008",
    operatorId: "U-DRIVER-A",
  });
  postgresAssertions.assertColdStartAfterDriverLoad({ coldStartAfterDriverLoad, driverLoadAt, driverLoadRemark });

  const driverCompletedAt = "2026-07-02T10:20:00.000Z";
  const driverCompleteRemark = "postgres live driver complete check";
  const driverWatermarkAttachment = await postJson(
    baseUrl,
    "/api/attachments",
    {
      ownerType: "fulfillment",
      ownerId: "F008",
      purpose: "delivery_watermark_photo",
      fileType: "image",
      fileName: "driver-watermark-f008.png",
      mimeType: "image/png",
      contentRef: "p0://postgres-live/driver/F008/watermark",
      contentDataUrl: "data:image/png;base64,cG9zdGdyZXMtbGl2ZS13YXRlcm1hcms=",
      uploadedBy: "U-SPOOFED",
      idempotencyKey: "driver-watermark-f008-live-001",
      metadata: {
        watermarkId: "WM-LIVE-DRIVER-F008",
        watermarkText: "李四电商 / 厚街客户仓 / 水印 WM-LIVE-DRIVER-F008",
        watermarkCapturedAt: "2026-07-02T10:18:00.000Z",
        watermarkLocationLabel: "厚街客户仓门口",
        watermarkGeoPoint: "22.910000,113.670000",
        watermarkAddress: "厚街客户仓",
      },
    },
    { headers: driverHeaders },
  );
  assert.equal(driverWatermarkAttachment.uploadedBy, "U-DRIVER-A");
  const driverSignatureAttachment = await postJson(
    baseUrl,
    "/api/attachments",
    {
      ownerType: "fulfillment",
      ownerId: "F008",
      purpose: "signature_photo",
      fileType: "image",
      fileName: "driver-signature-f008.png",
      mimeType: "image/png",
      contentRef: "p0://postgres-live/driver/F008/signature",
      contentDataUrl: "data:image/png;base64,cG9zdGdyZXMtbGl2ZS1zaWduYXR1cmU=",
      uploadedBy: "U-SPOOFED",
      idempotencyKey: "driver-signature-f008-live-001",
    },
    { headers: driverHeaders },
  );
  const apiDriverComplete = await postJson(
    baseUrl,
    "/api/driver/delivery-tasks/F008/complete",
    {
      fulfillmentId: "F008",
      actualQty: 3000,
      operatorId: "U-DRIVER-A",
      watermarkedPhotoAttachmentId: driverWatermarkAttachment.attachmentId,
      watermarkId: "WM-LIVE-DRIVER-F008",
      watermarkText: "李四电商 / 厚街客户仓 / 水印 WM-LIVE-DRIVER-F008",
      watermarkCapturedAt: "2026-07-02T10:18:00.000Z",
      watermarkLocationLabel: "厚街客户仓门口",
      watermarkGeoPoint: "22.910000,113.670000",
      watermarkAddress: "厚街客户仓",
      watermarkOperatorId: "U-DRIVER-A",
      watermarkOperatorName: "司机A",
      signaturePhotoAttached: true,
      signaturePhotoAttachmentId: driverSignatureAttachment.attachmentId,
      receiverName: "客户仓管",
      paperNoteStatus: "已交回",
      completedAt: driverCompletedAt,
      remark: driverCompleteRemark,
    },
    { headers: driverHeaders },
  );
  postgresAssertions.assertApiDriverComplete({ apiDriverComplete, driverLoadAt, driverWatermarkAttachment, driverSignatureAttachment });
  const persistedDriverComplete = queryJson(
    "SELECT json_build_object('status', status, 'loadedAt', loaded_at, 'loadedBy', loaded_by, 'driverRemark', driver_remark, 'receiverName', receiver_name, 'paperNoteStatus', paper_note_status, 'watermarkId', watermark_id) AS result FROM fulfillment_records WHERE id = 'F008';",
  );
  postgresAssertions.assertPersistedDriverComplete({ persistedDriverComplete, driverLoadAt, driverCompleteRemark });
  const coldStartAfterDriverComplete = await createPostgresDriverDeliveryTaskReadRepository({ queryJson }).getDriverDeliveryTask({
    fulfillmentId: "F008",
    operatorId: "U-DRIVER-A",
  });
  postgresAssertions.assertColdStartAfterDriverComplete({ coldStartAfterDriverComplete, driverLoadAt, driverCompleteRemark, driverWatermarkAttachment });

  const apiDeliveryEvidenceRetake = await postJson(
    baseUrl,
    "/api/fulfillments/F008/delivery-evidence-review",
    {
      fulfillmentId: "F008",
      reviewStatus: "retake_required",
      operatorId: "U-SPOOFED",
      reviewerName: "办公室A",
      reason: "水印定位不清晰",
    },
    { headers },
  );
  postgresAssertions.assertApiDeliveryEvidenceRetake({ apiDeliveryEvidenceRetake });
  assertPostgresOperationLogOperator(queryJson, apiDeliveryEvidenceRetake.operationLogId);

  const driverRetakeSubmittedAt = "2026-07-02T10:45:00.000Z";
  const driverRetakeAttachment = await postJson(
    baseUrl,
    "/api/attachments",
    {
      ownerType: "fulfillment",
      ownerId: "F008",
      purpose: "delivery_watermark_photo",
      fileType: "image",
      fileName: "driver-watermark-f008-retake.png",
      mimeType: "image/png",
      contentRef: "p0://postgres-live/driver/F008/watermark-retake",
      contentDataUrl: "data:image/png;base64,cG9zdGdyZXMtbGl2ZS13YXRlcm1hcmstcmV0YWtl",
      uploadedBy: "U-SPOOFED",
      idempotencyKey: "driver-watermark-f008-retake-live-001",
      metadata: {
        watermarkId: "WM-LIVE-DRIVER-F008-RETAKE",
        watermarkText: "李四电商 / 厚街客户仓 / 补拍水印 WM-LIVE-DRIVER-F008-RETAKE",
        watermarkCapturedAt: driverRetakeSubmittedAt,
        watermarkLocationLabel: "厚街客户仓门口补拍",
        watermarkGeoPoint: "22.910001,113.670001",
        watermarkAddress: "厚街客户仓",
      },
    },
    { headers: driverHeaders },
  );
  const apiDriverEvidenceResubmission = await postJson(
    baseUrl,
    "/api/driver/delivery-tasks/F008/complete",
    {
      fulfillmentId: "F008",
      operatorId: "U-DRIVER-A",
      watermarkedPhotoAttachmentId: driverRetakeAttachment.attachmentId,
      watermarkId: "WM-LIVE-DRIVER-F008-RETAKE",
      watermarkText: "李四电商 / 厚街客户仓 / 补拍水印 WM-LIVE-DRIVER-F008-RETAKE",
      watermarkCapturedAt: driverRetakeSubmittedAt,
      watermarkLocationLabel: "厚街客户仓门口补拍",
      watermarkGeoPoint: "22.910001,113.670001",
      watermarkAddress: "厚街客户仓",
      completedAt: driverRetakeSubmittedAt,
      remark: "postgres live driver retake evidence check",
    },
    { headers: driverHeaders },
  );
  postgresAssertions.assertApiDriverEvidenceResubmission({ apiDriverEvidenceResubmission, apiDeliveryEvidenceRetake, driverRetakeAttachment });
  const persistedDriverEvidenceResubmission = queryJson(
    `SELECT json_build_object(
      'status', f.status,
      'watermarkedPhotoAttachmentId', f.watermarked_photo_attachment_id,
      'watermarkId', f.watermark_id,
      'reviewStatus', f.delivery_evidence_review_status,
      'reviewedAt', f.delivery_evidence_reviewed_at,
      'issueReason', f.delivery_evidence_issue_reason,
      'todoStatus', t.status,
      'todoHandledBy', t.handled_by,
      'todoHandledAt', t.handled_at,
      'todoHandlingResult', t.handling_result
    ) AS result
    FROM fulfillment_records AS f
    LEFT JOIN todos AS t ON t.id = ${sqlLiteral(apiDeliveryEvidenceRetake.todoId)}
    WHERE f.id = 'F008';`,
  );
  postgresAssertions.assertPersistedDriverEvidenceResubmission({ persistedDriverEvidenceResubmission, driverRetakeAttachment, driverRetakeSubmittedAt });
  const coldStartAfterDriverEvidenceResubmission = await createPostgresDriverDeliveryTaskReadRepository({ queryJson }).getDriverDeliveryTask({
    fulfillmentId: "F008",
    operatorId: "U-DRIVER-A",
  });
  postgresAssertions.assertColdStartAfterDriverEvidenceResubmission({ coldStartAfterDriverEvidenceResubmission, driverRetakeAttachment });

  const apiDeviceFieldTest = await postJson(
    baseUrl,
    "/api/driver/delivery-tasks/F002/device-field-tests",
    {
      recordId: "DQA-LIVE-API-F002",
      fulfillmentId: "F002",
      orderLineId: "ORD-0629-002-01",
      driverId: "U-DRIVER-A",
      operatorId: "U-DRIVER-A",
      operatorName: "司机A",
      checkedAt: "2026-07-02T11:20:00.000Z",
      deviceLabel: "iPhone 15 Pro",
      browserLabel: "Safari 17",
      userAgent: "Mozilla/5.0 Safari/604.1",
      language: "zh-CN",
      checks: [
        { key: "camera_permission", status: "passed" },
        { key: "watermark_photo", status: "passed" },
        { key: "package_label_scan", status: "failed" },
        { key: "geolocation", status: "blocked" },
        { key: "file_upload", status: "untested" },
        { key: "navigation", status: "untested" },
      ],
      packageLabelScanSample: {
        sampleId: "DPLS-LIVE-API-F002-PKG-1",
        fulfillmentId: "F002",
        expectedPackageId: "PKG-LIVE-F002-1",
        scannedText: "PKG-LIVE-F002-404",
        matchedPackageId: "",
        method: "camera",
        result: "not_found",
        message: "api live package label mismatch sample",
        checkedAt: "2026-07-02T11:19:59.000Z",
      },
      note: "api live cold-start field test",
    },
    { headers: driverHeaders },
  );
  assert.equal(apiDeviceFieldTest.record.recordId, "DQA-LIVE-API-F002");
  assert.equal(apiDeviceFieldTest.record.summary.label, "通过 2/6，异常 2");
  assert.equal(apiDeviceFieldTest.record.packageLabelScanSample.scannedText, "PKG-LIVE-F002-404");
  assert.equal(apiDeviceFieldTest.task.deviceFieldTestRecord.recordId, "DQA-LIVE-API-F002");
  assert.equal(apiDeviceFieldTest.task.deviceFieldTestRecord.packageLabelScanSample.result, "not_found");
  assert.equal(apiDeviceFieldTest.task.deviceFieldTestSummary.label, "通过 2/6，异常 2");
  assert.ok(apiDeviceFieldTest.operationLogId);
  const apiPersistedDeviceFieldTest = queryJson(
    "SELECT json_build_object('recordId', id, 'summary', summary_json->>'label', 'sampleResult', summary_json->'packageLabelScanSample'->>'result', 'operationLogId', operation_log_id) AS result FROM driver_device_field_tests WHERE id = 'DQA-LIVE-API-F002';",
  );
  assert.equal(apiPersistedDeviceFieldTest.recordId, "DQA-LIVE-API-F002");
  assert.equal(apiPersistedDeviceFieldTest.summary, "通过 2/6，异常 2");
  assert.equal(apiPersistedDeviceFieldTest.sampleResult, "not_found");
  assert.equal(apiPersistedDeviceFieldTest.operationLogId, apiDeviceFieldTest.operationLogId);
  const coldStartDriverTaskReadRepository = createPostgresDriverDeliveryTaskReadRepository({ queryJson });
  const coldStartDeviceFieldTask = await coldStartDriverTaskReadRepository.getDriverDeliveryTask({
    fulfillmentId: "F002",
    operatorId: "U-DRIVER-A",
  });
  assert.equal(coldStartDeviceFieldTask.deviceFieldTestRecord.recordId, "DQA-LIVE-API-F002");
  assert.equal(coldStartDeviceFieldTask.deviceFieldTestRecord.packageLabelScanSample.scannedText, "PKG-LIVE-F002-404");
  assert.equal(coldStartDeviceFieldTask.deviceFieldTestSummary.label, "通过 2/6，异常 2");
  assert.equal(databaseOnlyOrderLines.items[0].amount, 273);
}
