import assert from "node:assert/strict";
import { postgresAssertions } from "../assertions.mjs";

export async function checkInventoryApi({
  baseUrl, headers, queryJson, runPsql, sqlLiteral, getJson, postJson,
}) {
  const databaseInventoryLedgers = await getJson(
    baseUrl,
    "/api/inventory/ledger-entries?inventoryItemId=INV-LIVE-CONFIRM-001&sourceType=order_confirm&sourceId=OL-LIVE-CONFIRM-001&pageSize=5",
    { headers },
  );
  postgresAssertions.assertDatabaseInventoryLedgers({ databaseInventoryLedgers });

  const correctionCreateBody = {
    inventoryItemId: "INV-LIVE-CORRECTION-001",
    expectedQty: 600,
    actualQty: 585,
    reason: "cycle_count",
    remark: "PostgreSQL live correction",
    operatorId: "U-SPOOFED",
    idempotencyKey: "inventory-correction-create-live-001",
  };
  const correctionWarehouseHeaders = { "x-erp-user-id": "U-WAREHOUSE-A" };
  const correctionManagerHeaders = { "x-erp-user-id": "U-MANAGER-A" };
  const createdCorrection = await postJson(baseUrl, "/api/inventory/correction-drafts", correctionCreateBody, {
    headers: correctionWarehouseHeaders,
  });
  postgresAssertions.assertCreatedCorrection({ createdCorrection });
  const replayedCorrectionCreate = await postJson(baseUrl, "/api/inventory/correction-drafts", correctionCreateBody, {
    headers: correctionWarehouseHeaders,
  });
  assert.equal(replayedCorrectionCreate.correctionDraftId, createdCorrection.correctionDraftId);
  assert.equal(replayedCorrectionCreate.operationLogId, createdCorrection.operationLogId);
  const persistedOpenCorrection = queryJson(
    `SELECT json_build_object('status', status, 'createdBy', created_by, 'todoId', todo_id, 'actualQty', actual_qty) AS result FROM inventory_correction_drafts WHERE id = ${sqlLiteral(createdCorrection.correctionDraftId)};`,
  );
  assert.equal(persistedOpenCorrection.status, "待确认生效");
  assert.equal(persistedOpenCorrection.createdBy, "U-WAREHOUSE-A");
  assert.equal(persistedOpenCorrection.todoId, createdCorrection.todoId);
  assert.equal(persistedOpenCorrection.actualQty, 585);
  assert.equal(
    Number(runPsql("SELECT on_hand_qty FROM inventory_items WHERE id = 'INV-LIVE-CORRECTION-001';", { capture: true }).trim()),
    600,
  );

  const correctionAttachment = await postJson(
    baseUrl,
    "/api/attachments",
    {
      ownerType: "inventory_correction",
      ownerId: createdCorrection.correctionDraftId,
      fileType: "image",
      purpose: "inventory_correction_evidence",
      fileName: "postgres-live-inventory-count.jpg",
      contentRef: `p0://postgres-live/inventory-correction/${createdCorrection.correctionDraftId}/count.jpg`,
      mimeType: "image/jpeg",
      contentDataUrl: "data:image/jpeg;base64,cG9zdGdyZXMtbGl2ZS1pbnZlbnRvcnktY291bnQ=",
      uploadedBy: "U-SPOOFED",
      idempotencyKey: "inventory-correction-attachment-live-001",
    },
    { headers: correctionWarehouseHeaders },
  );
  assert.equal(correctionAttachment.uploadedBy, "U-WAREHOUSE-A");
  const correctionAttachmentLinkBody = {
    correctionDraftId: createdCorrection.correctionDraftId,
    attachmentIds: [correctionAttachment.attachmentId],
    remark: "PostgreSQL live inventory count evidence",
    idempotencyKey: "inventory-correction-attachment-link-live-001",
  };
  const linkedCorrectionAttachment = await postJson(
    baseUrl,
    `/api/inventory/correction-drafts/${createdCorrection.correctionDraftId}/attachments`,
    correctionAttachmentLinkBody,
    { headers: correctionWarehouseHeaders },
  );
  postgresAssertions.assertLinkedCorrectionAttachment({ linkedCorrectionAttachment, correctionAttachment });
  const replayedCorrectionAttachmentLink = await postJson(
    baseUrl,
    `/api/inventory/correction-drafts/${createdCorrection.correctionDraftId}/attachments`,
    correctionAttachmentLinkBody,
    { headers: correctionWarehouseHeaders },
  );
  assert.equal(replayedCorrectionAttachmentLink.operationLogId, linkedCorrectionAttachment.operationLogId);
  const persistedCorrectionAttachment = queryJson(
    `SELECT json_build_object('attachmentIds', attachment_ids, 'revision', revision) AS result FROM inventory_correction_drafts WHERE id = ${sqlLiteral(createdCorrection.correctionDraftId)};`,
  );
  assert.deepEqual(persistedCorrectionAttachment.attachmentIds, [correctionAttachment.attachmentId]);
  assert.equal(persistedCorrectionAttachment.revision, 2);

  const correctionConfirmBody = {
    correctionDraftId: createdCorrection.correctionDraftId,
    approvalReason: "PostgreSQL live manager approval",
    operatorId: "U-SPOOFED",
    idempotencyKey: "inventory-correction-confirm-live-001",
  };
  const confirmedCorrection = await postJson(
    baseUrl,
    `/api/inventory/correction-drafts/${createdCorrection.correctionDraftId}/confirm`,
    correctionConfirmBody,
    { headers: correctionManagerHeaders },
  );
  postgresAssertions.assertConfirmedCorrection({ confirmedCorrection });
  const replayedCorrectionConfirm = await postJson(
    baseUrl,
    `/api/inventory/correction-drafts/${createdCorrection.correctionDraftId}/confirm`,
    correctionConfirmBody,
    { headers: correctionManagerHeaders },
  );
  assert.equal(replayedCorrectionConfirm.ledger.ledgerId, confirmedCorrection.ledger.ledgerId);
  assert.equal(replayedCorrectionConfirm.operationLogId, confirmedCorrection.operationLogId);
  assert.equal(
    Number(runPsql("SELECT on_hand_qty FROM inventory_items WHERE id = 'INV-LIVE-CORRECTION-001';", { capture: true }).trim()),
    585,
  );
  assert.equal(
    Number(
      runPsql(
        `SELECT COUNT(*) FROM inventory_ledger_entries WHERE source_id = ${sqlLiteral(createdCorrection.correctionDraftId)};`,
        { capture: true },
      ).trim(),
    ),
    1,
  );
  assert.equal(
    Number(
      runPsql(`SELECT COUNT(*) FROM todo_events WHERE todo_id = ${sqlLiteral(createdCorrection.todoId)};`, {
        capture: true,
      }).trim(),
    ),
    2,
  );

  const workshopHeaders = { "x-erp-user-id": "U-WORKSHOP-A" };
  const wrongOwnerPhotoAttachment = await postJson(
    baseUrl,
    "/api/attachments",
    {
      ownerType: "production_task",
      ownerId: "PT-LIVE-PROD-OTHER",
      fileType: "image",
      purpose: "finished_goods_photo",
      fileName: "postgres-live-finished-goods-wrong-owner.png",
      contentRef: "p0://postgres-live/production/PT-LIVE-PROD-OTHER/finished-goods.png",
      mimeType: "image/png",
      contentDataUrl: "data:image/png;base64,cG9zdGdyZXMtbGl2ZS13cm9uZy1vd25lcg==",
      uploadedBy: "U-SPOOFED",
      idempotencyKey: "production-photo-wrong-owner-live-001",
    },
    { headers: workshopHeaders },
  );
  const blockedWrongOwnerPhoto = await postJson(
    baseUrl,
    "/api/production-tasks/PT-LIVE-PROD-001/finished-goods-photo",
    {
      productionTaskId: "PT-LIVE-PROD-001",
      orderLineId: "OL-LIVE-PROD-001",
      attachmentId: wrongOwnerPhotoAttachment.attachmentId,
      idempotencyKey: "production-photo-wrong-owner-upload-live-001",
    },
    { expectedStatus: 422, headers: workshopHeaders },
  );
  assert.equal(blockedWrongOwnerPhoto.code, "FINISHED_GOODS_PHOTO_ATTACHMENT_OWNER_MISMATCH");
  const photoAttachment = await postJson(
    baseUrl,
    "/api/attachments",
    {
      ownerType: "production_task",
      ownerId: "PT-LIVE-PROD-001",
      fileType: "image",
      purpose: "finished_goods_photo",
      fileName: "postgres-live-finished-goods.png",
      contentRef: "p0://postgres-live/production/PT-LIVE-PROD-001/finished-goods.png",
      mimeType: "image/png",
      fileSize: 68,
      contentDataUrl: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=",
      uploadedBy: "U-SPOOFED",
      operatorId: "U-SPOOFED",
      idempotencyKey: "production-photo-attachment-live-001",
    },
    { headers: workshopHeaders },
  );
  assert.equal(photoAttachment.uploadedBy, "U-WORKSHOP-A");
  const photoUploadBody = {
    productionTaskId: "PT-LIVE-PROD-001",
    orderLineId: "OL-LIVE-PROD-001",
    attachmentId: photoAttachment.attachmentId,
    fileName: "spoofed-postgres-live-finished-goods.png",
    operatorId: "U-SPOOFED",
    idempotencyKey: "production-photo-upload-live-001",
  };
  const uploadedPhoto = await postJson(
    baseUrl,
    "/api/production-tasks/PT-LIVE-PROD-001/finished-goods-photo",
    photoUploadBody,
    { headers: workshopHeaders },
  );
  postgresAssertions.assertUploadedPhoto({ uploadedPhoto, photoAttachment });
  const replayedPhotoUpload = await postJson(
    baseUrl,
    "/api/production-tasks/PT-LIVE-PROD-001/finished-goods-photo",
    photoUploadBody,
    { headers: workshopHeaders },
  );
  assert.equal(replayedPhotoUpload.operationLogId, uploadedPhoto.operationLogId);
  const photoReviewBody = {
    productionTaskId: "PT-LIVE-PROD-001",
    orderLineId: "OL-LIVE-PROD-001",
    reviewStatus: "已接受",
    reason: "PostgreSQL live accepted",
    operatorId: "U-SPOOFED",
    idempotencyKey: "production-photo-review-live-001",
  };
  const reviewedPhoto = await postJson(
    baseUrl,
    "/api/production-tasks/PT-LIVE-PROD-001/finished-goods-photo-review",
    photoReviewBody,
    { headers },
  );
  postgresAssertions.assertReviewedPhoto({ reviewedPhoto });
  const replayedPhotoReview = await postJson(
    baseUrl,
    "/api/production-tasks/PT-LIVE-PROD-001/finished-goods-photo-review",
    photoReviewBody,
    { headers },
  );
  assert.equal(replayedPhotoReview.operationLogId, reviewedPhoto.operationLogId);
  const persistedPhoto = queryJson(
    "SELECT json_build_object('photo', finished_goods_photo, 'revision', revision) AS result FROM production_tasks WHERE id = 'PT-LIVE-PROD-001';",
  );
  assert.equal(persistedPhoto.photo.status, "已接受");
  assert.equal(persistedPhoto.photo.uploadedBy, "U-WORKSHOP-A");
  assert.equal(persistedPhoto.photo.reviewedBy, "U-OFFICE-A");
  assert.equal(
    Number(runPsql("SELECT COUNT(*) FROM operation_logs WHERE target_id = 'PT-LIVE-PROD-001' AND action IN ('upload_finished_goods_photo', 'accept_finished_goods_photo');", { capture: true }).trim()),
    2,
  );
  assert.equal(
    Number(runPsql(`SELECT COUNT(*) FROM todo_events WHERE todo_id = ${sqlLiteral(reviewedPhoto.todo.todoId)};`, { capture: true }).trim()),
    1,
  );
  assert.equal(
    Number(
      runPsql(
        `SELECT COUNT(*) FROM operation_logs WHERE target_type = 'inventory_correction' AND target_id = ${sqlLiteral(createdCorrection.correctionDraftId)};`,
        { capture: true },
      ).trim(),
    ),
    4,
  );
  return { correctionManagerHeaders, createdCorrection, correctionConfirmBody, confirmedCorrection,
    photoAttachment, photoReviewBody, reviewedPhoto };
}
