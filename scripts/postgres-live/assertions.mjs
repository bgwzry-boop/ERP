import assert from "node:assert/strict";

export function assertMigrationApplied(name, applied) {
  if (!applied) throw new Error(`migration not applied: ${name}`);
}

export function assertMigratedSchema(tableCount) {
  assert.ok(tableCount >= 52, `expected migrated PostgreSQL database to have at least 52 tables, got ${tableCount}`);
}

export const postgresAssertions = Object.freeze({
  assertPersistedRuntimeUser({ persistedRuntimeUser, liveRuntimePassword }) {
  assert.deepEqual(persistedRuntimeUser.roles, ["technical_operations"]);
    assert.equal(persistedRuntimeUser.loginEnabled, true);
    assert.notEqual(persistedRuntimeUser.passwordHash, liveRuntimePassword);
    assert.match(persistedRuntimeUser.passwordHash, /^runtime-password-v2\./);
    assert.equal(persistedRuntimeUser.passwordExpiresAt, "2026-10-10T00:00:00.000Z");
  },
  assertRestartedMasterDataSnapshot({ restartedMasterDataSnapshot }) {
  assert.equal(restartedMasterDataSnapshot.customerNotes.find((item) => item.id === "CN-MD-LIVE-001")?.content, "主数据导入备注");
    assert.equal(restartedMasterDataSnapshot.colorAliases.find((item) => item.id === "CALIAS-MD-LIVE-001")?.standardColorId, "SC-MD-LIVE-001");
    assert.equal(restartedMasterDataSnapshot.sizeSpecs.find((item) => item.id === "SIZE-MD-LIVE-001")?.displayName, "30*38*10");
    assert.equal(restartedMasterDataSnapshot.finishedGoodsStyles.find((item) => item.id === "STYLE-MD-LIVE-001")?.name, "空白袋");
    assert.equal(restartedMasterDataSnapshot.priceTables.find((item) => item.id === "PT-MD-LIVE-001")?.name, "主数据导入价格表");
    assert.equal(restartedMasterDataSnapshot.priceTableItems.find((item) => item.id === "PTI-MD-LIVE-001")?.bagPrice, 0.34);
    assert.equal(restartedMasterDataSnapshot.machines.find((item) => item.id === "MACH-MD-LIVE-001")?.name, "主数据导入制袋机");
    assert.equal(restartedMasterDataSnapshot.employees.find((item) => item.id === "EMP-MD-LIVE-001")?.profileStatus, "pending_admin_review");
    assert.equal(restartedMasterDataSnapshot.employeeMachineAssignments.find((item) => item.id === "EMA-MD-LIVE-001")?.machineId, "MACH-MD-LIVE-001");
    assert.equal(restartedMasterDataSnapshot.machineCapacityBaselines.find((item) => item.id === "MCB-MD-LIVE-001")?.dailyCapacityQty, 12000);
  },
  assertReleaseLedgerRead({ releaseLedgerRead }) {
  assert.equal(releaseLedgerRead.total, 1);
    assert.equal(releaseLedgerRead.items[0].ledgerId, "LEDGER-LIVE-RELEASE-001");
    assert.equal(releaseLedgerRead.items[0].changeType, "释放占用");
    assert.equal(releaseLedgerRead.items[0].qtyChange, -15);
    assert.equal(releaseLedgerRead.items[0].colorName, "红色");
  },
  assertPackingCompletion({ packingCompletion }) {
  assert.equal(packingCompletion.packingTask.status, "已完成");
    assert.equal(packingCompletion.packages.length, 2);
    assert.equal(packingCompletion.inventoryLedgerEntries[0].qtyChange, 0);
    assert.equal(packingCompletion.todo.refType, "order_line");
    assert.equal(packingCompletion.todoEvent.eventType, "todo_source:packing_completed");
  },
  assertFulfillmentRepair({ fulfillmentRepair, fulfillmentRepairRecord }) {
  assert.equal(fulfillmentRepair.todo.handled, true);
    assert.equal(fulfillmentRepair.labelTodo.refId, fulfillmentRepairRecord.fulfillmentId);
    assert.equal(fulfillmentRepair.fulfillment.actualQty, 80);
    assert.equal(fulfillmentRepair.packages.length, 2);
    assert.ok(fulfillmentRepair.packages.every((record) => record.fulfillmentId === fulfillmentRepairRecord.fulfillmentId));
  },
  assertColdStartProductionDetail({ coldStartProductionDetail }) {
  assert.equal(coldStartProductionDetail.productionTask.taskStatus, "已完成");
    assert.equal(coldStartProductionDetail.latestReport.machineCount, 8888);
    assert.equal(coldStartProductionDetail.latestReport.machineCountAffectsInventory, false);
    assert.equal(coldStartProductionDetail.inventoryLedgerEntries.length, 2);
    assert.equal(coldStartProductionDetail.reservations[0].qty, 80);
  },
  assertColdStartPackingDetail({ coldStartPackingDetail }) {
  assert.equal(coldStartPackingDetail.packingTask.status, "已完成");
    assert.equal(coldStartPackingDetail.packages.length, 2);
    assert.equal(coldStartPackingDetail.fulfillment.fulfillmentId, "F-REPAIR-OL-LIVE-PROD-001");
    assert.equal(coldStartPackingDetail.inventoryLedgerEntries[0].sourceType, "packing_complete");
    assert.equal(coldStartPackingDetail.inventoryDeducted, false);
  },
  assertDeliveryEvidenceAction({ deliveryEvidenceAction }) {
  assert.equal(deliveryEvidenceAction.fulfillment.watermarkedPhotoAttachmentId, "ATT-LIVE-DELIVERY-WM-001");
    assert.equal(deliveryEvidenceAction.fulfillment.deliveryEvidenceReviewStatus, "需重拍");
    assert.equal(deliveryEvidenceAction.todo.id, "T-LIVE-DELIVERY-EVIDENCE-RETAKE-001");
  },
  assertHealth({ health, v1PersistencePostgresRepositoryOptionKeys }) {
  assert.equal(health.seed.orderPoolReadRepository, "postgres");
    assert.equal(health.seed.driverDeliveryDispatchRepository, "postgres");
    assert.equal(health.seed.driverDeviceFieldTestRepository, "postgres");
    assert.equal(health.seed.driverDeliveryTaskReadRepository, "postgres");
    assert.equal(health.seed.inventoryLedgerReadRepository, "postgres");
    assert.equal(health.seed.inventoryIntentTransactionRepository, "postgres");
    assert.equal(health.seed.productionPackingTransactionRepository, "postgres");
    assert.equal(health.seed.productionPackingReadRepository, "postgres");
    assert.equal(health.seed.productionScheduleRecordRepository, "postgres");
    assert.equal(health.seed.printBatchRepository, "postgres");
    assert.equal(health.seed.todoActionRepository, "postgres");
    assert.equal(health.seed.inventoryCorrectionTransactionRepository, "postgres");
    assert.equal(health.seed.productionFinishedGoodsPhotoTransactionRepository, "postgres");
    assert.equal(health.seed.printDeviceRepository, "postgres");
    assert.equal(health.seed.printJobRepository, "postgres");
    assert.equal(health.seed.printerDeviceFieldTestRepository, "postgres");
    assert.equal(health.seed.masterDataImportReviewRepository, "postgres");
    assert.equal(health.seed.masterDataImportTransactionRepository, "postgres");
    assert.equal(health.seed.runtimeIdentityRepository, "postgres");
    assert.equal(health.seed.v1PersistenceProfile.repositoryProfile, "postgres");
    assert.equal(
      health.seed.v1PersistenceProfile.postgresRepositoryDefaultsApplied +
        health.seed.v1PersistenceProfile.postgresRepositoryDefaultsSkipped,
      v1PersistencePostgresRepositoryOptionKeys.length,
    );
    assert.equal(health.seed.orderDraftRepository, "postgres");
    assert.equal(health.seed.v1PersistenceProfile.unsupportedRepositoryCount, 0);
    assert.equal(health.seed.v1PersistenceProfile.connectionStringExposed, false);
    assert.equal(health.seed.statementExportObjectStorage, "local_fs");
    assert.equal(health.seed.printDriverAdapter, "guarded_adapter");
  },
  assertRestartedPendingEmployeeReviews({ restartedPendingEmployeeReviews }) {
  assert.equal(restartedPendingEmployeeReviews.total, 1);
    assert.equal(restartedPendingEmployeeReviews.items[0].name, "主数据导入员工");
    assert.equal(restartedPendingEmployeeReviews.items[0].status, "pending_admin_review");
    assert.equal(restartedPendingEmployeeReviews.items[0].defaultMachineId, "MACH-MD-LIVE-001");
    assert.equal(restartedPendingEmployeeReviews.readiness.requiredRoleCount, 8);
    assert.equal(restartedPendingEmployeeReviews.readiness.roles.length, 8);
    assert.equal(restartedPendingEmployeeReviews.readiness.ready, false);
    assert.equal(
      JSON.stringify(restartedPendingEmployeeReviews.readiness).includes(restartedPendingEmployeeReviews.items[0].loginName),
      false,
    );
  },
  assertFixedMachineAssignment({ fixedMachineAssignment }) {
  assert.equal(fixedMachineAssignment.employeeAccountReview.assignmentMode, "fixed_machine");
    assert.equal(fixedMachineAssignment.employeeAccountReview.defaultMachineId, "BAG-03");
    assert.equal(fixedMachineAssignment.employeeAccountReview.assignmentUpdatedBy, "U-MANAGER-A");
  },
  assertReplayedApiScheduleResequence({ replayedApiScheduleResequence, apiScheduleResequence, liveManagerRuntimeUserId }) {
  assert.equal(replayedApiScheduleResequence.operationLogId, apiScheduleResequence.operationLogId);
    assert.equal(replayedApiScheduleResequence.updatedAt, apiScheduleResequence.updatedAt);
    assert.equal(replayedApiScheduleResequence.updatedBy, liveManagerRuntimeUserId);
  },
  assertTodoAction({ todoAction }) {
  assert.equal(todoAction.todo.handled, true);
    assert.equal(todoAction.todo.handledBy, "U-OFFICE-A");
    assert.equal(todoAction.todo.notifiedBy, "U-OFFICE-A");
    assert.equal(todoAction.todo.notificationStatus, "已通知客户");
  },
  assertTodoReferenceRepair({ todoReferenceRepair }) {
  assert.equal(todoReferenceRepair.todo.referenceStatus, "valid");
    assert.equal(todoReferenceRepair.todo.refId, "ORD-0629-001-01");
    assert.equal(todoReferenceRepair.todo.referenceRepair.beforeRefId, "T-LIVE-IDEMPOTENCY-002");
    assert.ok(todoReferenceRepair.operationLogId);
  },
  assertCustomerPendingAction({ customerPendingAction }) {
  assert.equal(customerPendingAction.todo.handled, false);
    assert.equal(customerPendingAction.todo.status, "open");
    assert.equal(customerPendingAction.todo.reminder, "等待客户回复");
  },
  assertPersistedCustomerPending({ persistedCustomerPending }) {
  assert.equal(persistedCustomerPending.status, "未处理");
    assert.equal(persistedCustomerPending.reminder, "等待客户回复");
    assert.equal(persistedCustomerPending.handledBy, null);
  },
  assertPrintDriverConfig({ printDriverConfig }) {
  assert.equal(printDriverConfig.printDriverAdapter.kind, "guarded_adapter");
    assert.equal(printDriverConfig.printDriverAdapter.systemPrinterCommandConfigured, false);
    assert.equal(printDriverConfig.printDriverAdapter.systemPrinterCommandArgsConfigured, true);
    assert.equal(printDriverConfig.printDriverAdapter.systemPrinterCommandTimeoutMs, 5000);
    assert.equal(printDriverConfig.printDriverAdapter.realDispatchAvailable, false);
  },
  assertDatabaseOnlyOrderLines({ databaseOnlyOrderLines }) {
  assert.equal(databaseOnlyOrderLines.total, 1);
    assert.equal(databaseOnlyOrderLines.items[0].id, "OL-LIVE-CONFIRM-001");
    assert.equal(databaseOnlyOrderLines.items[0].orderNo, "ORD-LIVE-CONFIRM-001");
    assert.equal(databaseOnlyOrderLines.items[0].customerName, "Postgres 仓储测试客户");
  },
  assertDatabaseInventoryLedgers({ databaseInventoryLedgers }) {
  assert.equal(databaseInventoryLedgers.total, 1);
    assert.equal(databaseInventoryLedgers.items[0].ledgerId, "LEDGER-LIVE-CONFIRM-001");
    assert.equal(databaseInventoryLedgers.items[0].changeType, "订单占用");
    assert.equal(databaseInventoryLedgers.items[0].qtyChange, 25);
    assert.equal(databaseInventoryLedgers.items[0].colorName, "红色");
  },
  assertCreatedCorrection({ createdCorrection }) {
  assert.equal(createdCorrection.inventoryItemId, "INV-LIVE-CORRECTION-001");
    assert.equal(createdCorrection.qtyBefore.onHand, 600);
    assert.equal(createdCorrection.requestedQtyAfter.onHand, 585);
  },
  assertLinkedCorrectionAttachment({ linkedCorrectionAttachment, correctionAttachment }) {
  assert.deepEqual(linkedCorrectionAttachment.attachmentIds, [correctionAttachment.attachmentId]);
    assert.equal(linkedCorrectionAttachment.revision, 2);
    assert.ok(linkedCorrectionAttachment.operationLogId);
  },
  assertConfirmedCorrection({ confirmedCorrection }) {
  assert.equal(confirmedCorrection.qtyBefore.onHand, 600);
    assert.equal(confirmedCorrection.qtyAfter.onHand, 585);
    assert.equal(confirmedCorrection.ledger.qtyChange, -15);
    assert.equal(confirmedCorrection.ledger.operatorId, "U-MANAGER-A");
    assert.equal(confirmedCorrection.todo.handledBy, "U-MANAGER-A");
  },
  assertUploadedPhoto({ uploadedPhoto, photoAttachment }) {
  assert.equal(uploadedPhoto.finishedGoodsPhoto.status, "待确认");
    assert.equal(uploadedPhoto.finishedGoodsPhoto.uploadedBy, "U-WORKSHOP-A");
    assert.equal(uploadedPhoto.finishedGoodsPhoto.fileName, photoAttachment.fileName);
  },
  assertReviewedPhoto({ reviewedPhoto }) {
  assert.equal(reviewedPhoto.finishedGoodsPhoto.status, "已接受");
    assert.equal(reviewedPhoto.finishedGoodsPhoto.reviewedBy, "U-OFFICE-A");
    assert.equal(reviewedPhoto.todo.type, "待通知客户");
  },
  assertDatabaseDriverTaskDetail({ databaseDriverTaskDetail }) {
  assert.equal(databaseDriverTaskDetail.task.status, "已完成");
    assert.equal(databaseDriverTaskDetail.task.routeDate, "2026-07-02");
    assert.equal(databaseDriverTaskDetail.task.routeNo, "虎门线-A");
    assert.equal(databaseDriverTaskDetail.task.routeSequence, 2);
    assert.equal(databaseDriverTaskDetail.task.watermarkedPhotoAttachmentId, "ATT-LIVE-DELIVERY-WM-001");
    assert.equal(databaseDriverTaskDetail.task.deliveryEvidenceReviewStatus, "需重拍");
    assert.equal(databaseDriverTaskDetail.task.packageChecklist[0].packageId, "PKG-LIVE-F002-1");
    assert.equal(databaseDriverTaskDetail.task.packageChecklist[0].quantityText, "400个");
  },
  assertApiDriverException({ apiDriverException, driverExceptionOccurredAt }) {
  assert.equal(apiDriverException.status, "送货异常");
    assert.equal(apiDriverException.todoType, "送货异常待处理");
    assert.equal(apiDriverException.task.status, "送货异常");
    assert.equal(apiDriverException.task.exceptionReasonCode, "customer_unavailable");
    assert.equal(apiDriverException.task.exceptionReason, "客户不在");
    assert.equal(new Date(apiDriverException.task.exceptionOccurredAt).toISOString(), driverExceptionOccurredAt);
    assert.ok(apiDriverException.todoId);
    assert.ok(apiDriverException.operationLogId);
  },
  assertPersistedDriverException({ persistedDriverException, apiDriverException, driverExceptionOccurredAt }) {
  assert.equal(persistedDriverException.status, "送货异常");
    assert.equal(persistedDriverException.actualQty, 0);
    assert.equal(persistedDriverException.reasonCode, "customer_unavailable");
    assert.equal(persistedDriverException.reason, "客户不在");
    assert.equal(persistedDriverException.actualQtyException, 0);
    assert.equal(persistedDriverException.todoId, apiDriverException.todoId);
    assert.equal(new Date(persistedDriverException.occurredAt).toISOString(), driverExceptionOccurredAt);
  },
  assertColdStartAfterDriverException({ coldStartAfterDriverException, driverExceptionOccurredAt }) {
  assert.equal(coldStartAfterDriverException.status, "送货异常");
    assert.equal(coldStartAfterDriverException.exceptionReasonCode, "customer_unavailable");
    assert.equal(coldStartAfterDriverException.exceptionReason, "客户不在");
    assert.equal(new Date(coldStartAfterDriverException.exceptionOccurredAt).toISOString(), driverExceptionOccurredAt);
  },
  assertApiDriverLoad({ apiDriverLoad, driverLoadAt, driverLoadRemark }) {
  assert.equal(apiDriverLoad.status, "配送中");
    assert.equal(new Date(apiDriverLoad.task.loadedAt).toISOString(), driverLoadAt);
    assert.equal(apiDriverLoad.task.loadedBy, "U-DRIVER-A");
    assert.equal(apiDriverLoad.task.driverRemark, driverLoadRemark);
    assert.equal(apiDriverLoad.task.routeSequence, 3);
    assert.equal(apiDriverLoad.task.packageChecklist.length, 6);
    assert.ok(apiDriverLoad.operationLogId);
  },
  assertPersistedDriverLoad({ persistedDriverLoad, driverLoadAt, driverLoadRemark }) {
  assert.equal(persistedDriverLoad.status, "配送中");
    assert.equal(new Date(persistedDriverLoad.loadedAt).toISOString(), driverLoadAt);
    assert.equal(persistedDriverLoad.loadedBy, "U-DRIVER-A");
    assert.equal(persistedDriverLoad.driverRemark, driverLoadRemark);
  },
  assertColdStartAfterDriverLoad({ coldStartAfterDriverLoad, driverLoadAt, driverLoadRemark }) {
  assert.equal(coldStartAfterDriverLoad.status, "配送中");
    assert.equal(new Date(coldStartAfterDriverLoad.loadedAt).toISOString(), driverLoadAt);
    assert.equal(coldStartAfterDriverLoad.loadedBy, "U-DRIVER-A");
    assert.equal(coldStartAfterDriverLoad.driverRemark, driverLoadRemark);
  },
  assertApiDriverComplete({ apiDriverComplete, driverLoadAt, driverWatermarkAttachment, driverSignatureAttachment }) {
  assert.equal(apiDriverComplete.status, "已完成");
    assert.equal(apiDriverComplete.task.status, "已完成");
    assert.equal(new Date(apiDriverComplete.task.loadedAt).toISOString(), driverLoadAt);
    assert.equal(apiDriverComplete.task.receiverName, "客户仓管");
    assert.equal(apiDriverComplete.task.paperNoteStatus, "已交回");
    assert.equal(apiDriverComplete.task.watermarkedPhotoAttachmentId, driverWatermarkAttachment.attachmentId);
    assert.equal(apiDriverComplete.task.signaturePhotoAttachmentId, driverSignatureAttachment.attachmentId);
    assert.equal(apiDriverComplete.inventoryDeductionMode, "already_physical_outbound");
    assert.ok(apiDriverComplete.operationLogId);
  },
  assertPersistedDriverComplete({ persistedDriverComplete, driverLoadAt, driverCompleteRemark }) {
  assert.equal(persistedDriverComplete.status, "已交付");
    assert.equal(new Date(persistedDriverComplete.loadedAt).toISOString(), driverLoadAt);
    assert.equal(persistedDriverComplete.loadedBy, "U-DRIVER-A");
    assert.equal(persistedDriverComplete.driverRemark, driverCompleteRemark);
    assert.equal(persistedDriverComplete.receiverName, "客户仓管");
    assert.equal(persistedDriverComplete.paperNoteStatus, "已交回");
    assert.equal(persistedDriverComplete.watermarkId, "WM-LIVE-DRIVER-F008");
  },
  assertColdStartAfterDriverComplete({ coldStartAfterDriverComplete, driverLoadAt, driverCompleteRemark, driverWatermarkAttachment }) {
  assert.equal(coldStartAfterDriverComplete.status, "已完成");
    assert.equal(new Date(coldStartAfterDriverComplete.loadedAt).toISOString(), driverLoadAt);
    assert.equal(coldStartAfterDriverComplete.loadedBy, "U-DRIVER-A");
    assert.equal(coldStartAfterDriverComplete.driverRemark, driverCompleteRemark);
    assert.equal(coldStartAfterDriverComplete.receiverName, "客户仓管");
    assert.equal(coldStartAfterDriverComplete.paperNoteStatus, "已交回");
    assert.equal(coldStartAfterDriverComplete.watermarkedPhotoAttachmentId, driverWatermarkAttachment.attachmentId);
  },
  assertApiDeliveryEvidenceRetake({ apiDeliveryEvidenceRetake }) {
  assert.equal(apiDeliveryEvidenceRetake.reviewStatus, "需重拍");
    assert.equal(apiDeliveryEvidenceRetake.todoType, "照片待重拍");
    assert.equal(apiDeliveryEvidenceRetake.task.deliveryEvidenceReviewStatus, "需重拍");
    assert.ok(apiDeliveryEvidenceRetake.todoId);
    assert.ok(apiDeliveryEvidenceRetake.operationLogId);
  },
  assertApiDriverEvidenceResubmission({ apiDriverEvidenceResubmission, apiDeliveryEvidenceRetake, driverRetakeAttachment }) {
  assert.equal(apiDriverEvidenceResubmission.status, "已完成");
    assert.equal(apiDriverEvidenceResubmission.evidenceResubmission, true);
    assert.equal(apiDriverEvidenceResubmission.retakeTodoId, apiDeliveryEvidenceRetake.todoId);
    assert.equal(apiDriverEvidenceResubmission.inventoryDeductionMode, "skipped_delivery_evidence_resubmission");
    assert.equal(apiDriverEvidenceResubmission.inventoryLedgerIds.length, 0);
    assert.equal(apiDriverEvidenceResubmission.task.deliveryEvidenceReviewStatus, "待复核");
    assert.equal(apiDriverEvidenceResubmission.task.deliveryEvidenceIssueReason, "");
    assert.equal(apiDriverEvidenceResubmission.task.watermarkedPhotoAttachmentId, driverRetakeAttachment.attachmentId);
    assert.ok(apiDriverEvidenceResubmission.operationLogId);
  },
  assertPersistedDriverEvidenceResubmission({ persistedDriverEvidenceResubmission, driverRetakeAttachment, driverRetakeSubmittedAt }) {
  assert.equal(persistedDriverEvidenceResubmission.status, "已交付");
    assert.equal(persistedDriverEvidenceResubmission.watermarkedPhotoAttachmentId, driverRetakeAttachment.attachmentId);
    assert.equal(persistedDriverEvidenceResubmission.watermarkId, "WM-LIVE-DRIVER-F008-RETAKE");
    assert.equal(persistedDriverEvidenceResubmission.reviewStatus, "待复核");
    assert.equal(persistedDriverEvidenceResubmission.reviewedAt, null);
    assert.equal(persistedDriverEvidenceResubmission.issueReason, "");
    assert.equal(persistedDriverEvidenceResubmission.todoStatus, "已处理");
    assert.equal(persistedDriverEvidenceResubmission.todoHandledBy, "U-DRIVER-A");
    assert.equal(new Date(persistedDriverEvidenceResubmission.todoHandledAt).toISOString(), driverRetakeSubmittedAt);
    assert.equal(persistedDriverEvidenceResubmission.todoHandlingResult, "司机已补拍送达水印照片，待办公室复核");
  },
  assertColdStartAfterDriverEvidenceResubmission({ coldStartAfterDriverEvidenceResubmission, driverRetakeAttachment }) {
  assert.equal(coldStartAfterDriverEvidenceResubmission.status, "已完成");
    assert.equal(coldStartAfterDriverEvidenceResubmission.deliveryEvidenceReviewStatus, "待复核");
    assert.equal(coldStartAfterDriverEvidenceResubmission.deliveryEvidenceIssueReason, "");
    assert.equal(coldStartAfterDriverEvidenceResubmission.watermarkedPhotoAttachmentId, driverRetakeAttachment.attachmentId);
  },
  assertDatabaseOnlyOrderLineDetail({ databaseOnlyOrderLineDetail }) {
  assert.equal(databaseOnlyOrderLineDetail.orderLine.id, "OL-LIVE-CONFIRM-001");
    assert.equal(databaseOnlyOrderLineDetail.originalOrder.orderId, "ORD-LIVE-CONFIRM-001");
    assert.equal(databaseOnlyOrderLineDetail.priceSnapshot.orderLineId, "OL-LIVE-CONFIRM-001");
    assert.ok(databaseOnlyOrderLineDetail.inventory.length >= 1);
    assert.ok(databaseOnlyOrderLineDetail.fulfillment.length >= 1);
    assert.ok(Array.isArray(databaseOnlyOrderLineDetail.operationLogs));
  },
  assertCreated({ created }) {
  assert.equal(created.ownerId, "ST-LIVE-API-001");
    assert.equal(created.storageProvider, "local_fs");
    assert.equal(created.storageKeyStored, true);
    assert.equal(Object.hasOwn(created, "storageKey"), false);
    assert.equal(Object.hasOwn(created, "thumbnailStorageKey"), false);
    assert.equal(created.deduplicated, false);
    assert.ok(created.operationLogId);
  },
  assertDuplicateCreated({ duplicateCreated, created }) {
  assert.equal(duplicateCreated.attachmentId, created.attachmentId);
    assert.equal(duplicateCreated.duplicateOfAttachmentId, created.attachmentId);
    assert.equal(duplicateCreated.deduplicated, true);
    assert.notEqual(duplicateCreated.operationLogId, created.operationLogId);
  },
  assertListed({ listed, created }) {
  assert.equal(listed.total, 1);
    assert.equal(listed.items[0].attachmentId, created.attachmentId);
    assert.equal(listed.items[0].storageKeyStored, true);
    assert.equal(Object.hasOwn(listed.items[0], "storageKey"), false);
  },
  assertAccessUrl({ accessUrl, created }) {
  assert.equal(accessUrl.attachmentId, created.attachmentId);
    assert.equal(accessUrl.storageProvider, "local_fs");
    assert.equal(accessUrl.storageKeyStored, true);
    assert.equal(Object.hasOwn(accessUrl, "storageKey"), false);
    assert.ok(accessUrl.operationLogId);
  },
  assertAccessLogs({ accessLogs }) {
  assert.equal(accessLogs.total, 2);
    assert.deepEqual(
      accessLogs.items.map((item) => item.action).sort(),
      ["attachment_access_url_created", "attachment_content_read"],
    );
    assert.equal(accessLogs.items.every((item) => item.storageKeyStored === true), true);
    assert.equal(accessLogs.items.some((item) => Object.hasOwn(item, "storageKey")), false);
  },
  assertQueuedDrafts({ queuedDrafts }) {
  assert.equal(queuedDrafts.queueBatch.summary.queueItemCount, 5);
    assert.equal(queuedDrafts.queueBatch.summary.orderDraftCount, 2);
    assert.equal(queuedDrafts.queueBatch.summary.intentDraftCount, 3);
    assert.deepEqual(
      queuedDrafts.drafts.filter((item) => item.kind === "order_draft").map((item) => item.lines.length),
      [2, 2],
    );
  },
  assertQueuedDraftList({ queuedDraftList }) {
  assert.equal(queuedDraftList.total, 5);
    assert.equal(queuedDraftList.summary.orderDraftCount, 2);
    assert.equal(queuedDraftList.summary.intentDraftCount, 3);
  },
  assertTemporaryHold({ temporaryHold, holdIntent }) {
  assert.equal(temporaryHold.intent.intentStatus, "临时留货-生效");
    assert.equal(temporaryHold.hold.reservedQty, 5);
    assert.equal(temporaryHold.hold.sourceIntentId, holdIntent.intentId);
  },
  assertConfirmedOrder({ confirmedOrder }) {
  assert.ok(confirmedOrder.orderId);
    assert.equal(confirmedOrder.orderLines.length, 1);
    assert.equal(confirmedOrder.reservations.length, 1);
    assert.equal(confirmedOrder.fulfillmentTasks.length, 1);
  },
  assertColdConfirmedDraft({ coldConfirmedDraft }) {
  assert.equal(coldConfirmedDraft.status, "已生成正式订单");
    assert.equal(coldConfirmedDraft.revision, 2);
    assert.equal(coldConfirmedDraft.lines.length, 1);
  },
  assertRestartedAssignedEmployeeReview({ restartedAssignedEmployeeReview }) {
  assert.equal(restartedAssignedEmployeeReview.total, 1);
    assert.equal(restartedAssignedEmployeeReview.items[0].assignmentMode, "fixed_machine");
    assert.equal(restartedAssignedEmployeeReview.items[0].defaultWorkshop, "1号车间");
    assert.equal(restartedAssignedEmployeeReview.items[0].defaultMachineId, "BAG-03");
    assert.equal(restartedAssignedEmployeeReview.items[0].assignmentUpdatedBy, "U-MANAGER-A");
  },
  assertApiProduction({ apiProductionReport }) {
  assert.equal(apiProductionReport.status, "已完成");
    assert.equal(apiProductionReport.orderLineStatus, "待打包");
    assert.equal(apiProductionReport.qualifiedQty, 1000);
    assert.equal(apiProductionReport.machineCount, 1888);
    assert.equal(apiProductionReport.machineCountAffectsInventory, false);
    assert.equal(apiProductionReport.capacityCalibrationCreated, true);
    assert.equal(apiProductionReport.capacityCalibration.sourceKind, "production_report");
    assert.equal(apiProductionReport.capacityCalibration.dailyCapacityQty, 1000);
    assert.equal(apiProductionReport.inventoryLedgerIds.length, 2);
    assert.ok(apiProductionReport.packingTaskId);
  },
  assertApiPackingComplete({ apiPackingComplete }) {
  assert.equal(apiPackingComplete.status, "已完成");
    assert.equal(apiPackingComplete.actualPackedQty, 1000);
    assert.equal(apiPackingComplete.packageIds.length, 3);
    assert.equal(apiPackingComplete.orderLineStatus, "待打印标签");
    assert.equal(apiPackingComplete.inventoryDeducted, false);
    assert.equal(apiPackingComplete.inventoryLedgerIds.length, 1);
  },
  assertApiProduction2({ apiProductionDetail, apiProductionReport }) {
  assert.equal(apiProductionDetail.productionTaskId, apiProductionReport.productionTaskId);
    assert.equal(apiProductionDetail.latestReport.machineCount, 1888);
    assert.equal(apiProductionDetail.latestReport.machineCountAffectsInventory, false);
    assert.equal(apiProductionDetail.inventoryLedgerEntries.length, 2);
    assert.equal(apiProductionDetail.packingTask.packingTaskId, apiProductionReport.packingTaskId);
  },
  assertApiPackingDetail({ apiPackingDetail }) {
  assert.equal(apiPackingDetail.packingTask.status, "已完成");
    assert.equal(apiPackingDetail.packages.length, 3);
    assert.equal(apiPackingDetail.inventoryLedgerEntries.length, 1);
    assert.equal(apiPackingDetail.inventoryDeducted, false);
  },
  assertApiTrustedPrintInitial({ apiTrustedPrintRequest, apiTrustedPrintInitialStatus }) {
  assert.equal(apiTrustedPrintRequest.printRecord.status, "submitted");
    assert.equal(apiTrustedPrintRequest.printJob.jobStatus, "queued");
    assert.equal(apiTrustedPrintRequest.nextStatus, apiTrustedPrintInitialStatus);
    assert.equal(apiTrustedPrintRequest.physicalPrintConfirmed, false);
  },
  assertApiDispatchedPrintJob({ apiDispatchedPrintJob }) {
  assert.equal(apiDispatchedPrintJob.printJob.jobStatus, "failed");
    assert.equal(apiDispatchedPrintJob.dispatchResult.errorCode, "SYSTEM_PRINTER_ADAPTER_NOT_CONFIGURED");
    assert.ok(apiDispatchedPrintJob.operationLogId);
  },
  assertApiFailedPrintJob({ apiFailedPrintJob }) {
  assert.equal(apiFailedPrintJob.printJob.jobStatus, "failed");
    assert.equal(apiFailedPrintJob.printJob.errorCode, "LIVE_API_DRIVER_TIMEOUT");
    assert.ok(apiFailedPrintJob.operationLogId);
  },
  assertApiRetryPrintJob({ apiRetryPrintJob }) {
  assert.equal(apiRetryPrintJob.sourcePrintJob.printJobId, "PJ-LIVE-API-001");
    assert.equal(apiRetryPrintJob.printJob.sourcePrintJobId, "PJ-LIVE-API-001");
    assert.equal(apiRetryPrintJob.printJob.attemptNo, 2);
    assert.equal(apiRetryPrintJob.printJob.jobStatus, "queued");
  },
  assertApiDriverStatusPrintJob({ apiDriverStatusPrintJob }) {
  assert.equal(apiDriverStatusPrintJob.printJob.jobStatus, "printed");
    assert.equal(apiDriverStatusPrintJob.printJob.finishedAt, "2026-07-02T10:32:00.000Z");
    assert.equal(apiDriverStatusPrintJob.driverStatusEvent.driverStatus, "completed");
    assert.equal(apiDriverStatusPrintJob.driverStatusEvent.operatorId, "U-PRINT-DRIVER-A");
    assert.ok(apiDriverStatusPrintJob.operationLogId);
  },
  assertApiPrintBatch({ apiPrintBatch }) {
  assert.equal(apiPrintBatch.printBatchRecord.printBatchId, "PB-LIVE-API-001");
    assert.equal(apiPrintBatch.printBatchRecord.pendingPackageIds[0], "PKG-LIVE-API-PRINT-003");
    assert.equal(apiPrintBatch.printBatchRecord.operatorId, "U-OFFICE-A");
    assert.equal(apiPrintBatch.printBatchRecord.operatorName, "办公室A");
    assert.ok(apiPrintBatch.operationLogId);
  },
  assertApiVoidedOrderLine({ apiVoidedOrderLine, voidCandidateOrder }) {
  assert.equal(apiVoidedOrderLine.status, "已关闭");
    assert.equal(apiVoidedOrderLine.releasedReservations[0].status, "released");
    assert.equal(apiVoidedOrderLine.releasedReservations[0].qty, 0);
    assert.ok(apiVoidedOrderLine.canceledFulfillmentIds.includes(voidCandidateOrder.fulfillmentTasks[0].fulfillmentId));
    assert.equal(apiVoidedOrderLine.inventoryLedgerIds.length, 1);
    assert.ok(apiVoidedOrderLine.orderLineChangeRecordId);
    assert.ok(apiVoidedOrderLine.operationLogId);
  },
  assertApiDecreasedOrderLine({ apiDecreasedOrderLine, quantityCandidateOrder }) {
  assert.equal(apiDecreasedOrderLine.previousQty, 10);
    assert.equal(apiDecreasedOrderLine.newQty, 6);
    assert.equal(apiDecreasedOrderLine.qtyDelta, -4);
    assert.equal(apiDecreasedOrderLine.priceSnapshot.chargeableQty, 6);
    assert.equal(apiDecreasedOrderLine.priceSnapshot.finalAmount, 2.04);
    assert.equal(apiDecreasedOrderLine.adjustedReservations[0].qty, 6);
    assert.equal(apiDecreasedOrderLine.adjustedReservations[0].status, "active");
    assert.ok(apiDecreasedOrderLine.adjustedFulfillmentIds.includes(quantityCandidateOrder.fulfillmentTasks[0].fulfillmentId));
    assert.equal(apiDecreasedOrderLine.inventoryLedgerIds.length, 1);
    assert.ok(apiDecreasedOrderLine.orderLineChangeRecordId);
    assert.ok(apiDecreasedOrderLine.operationLogId);
  },
  assertApiIncreasedOrderLine({ apiIncreasedOrderLine }) {
  assert.equal(apiIncreasedOrderLine.previousQty, 6);
    assert.equal(apiIncreasedOrderLine.newQty, 8);
    assert.equal(apiIncreasedOrderLine.qtyDelta, 2);
    assert.equal(apiIncreasedOrderLine.priceSnapshot.chargeableQty, 8);
    assert.equal(apiIncreasedOrderLine.priceSnapshot.finalAmount, 2.72);
    assert.equal(apiIncreasedOrderLine.adjustedReservations[0].qty, 8);
    assert.equal(apiIncreasedOrderLine.adjustedReservations[0].status, "active");
    assert.equal(apiIncreasedOrderLine.inventoryLedgerIds.length, 1);
  },
  assertApiCancelledFulfillment({ apiCancelledFulfillment }) {
  assert.equal(apiCancelledFulfillment.status, "已取消");
    assert.equal(apiCancelledFulfillment.releasedReservations[0].qty, 0);
    assert.equal(apiCancelledFulfillment.releasedReservations[0].status, "released");
    assert.equal(apiCancelledFulfillment.inventoryLedgerIds.length, 1);
    assert.ok(apiCancelledFulfillment.operationLogId);
  },
  assertExportList({ exportList, preview }) {
  assert.ok(exportList.total >= 1);
    assert.equal(exportList.items[0].downloadToken, preview.downloadToken);
    assert.equal(exportList.items[0].storageProvider, "local_fs");
    assert.equal(exportList.items[0].storageKeyStored, true);
    assert.equal(exportList.items[0].content, undefined);
  },
  assertReplayedMarkedSent({ replayedMarkedSent, markedSent }) {
  assert.equal(replayedMarkedSent.sendRecordId, markedSent.sendRecordId);
    assert.equal(replayedMarkedSent.operationLogId, markedSent.operationLogId);
    assert.equal(markedSent.status, "已发送");
    assert.ok(markedSent.sendRecordId);
  },
  assertPayment({ payment, statementPaymentAttachment }) {
  assert.equal(payment.payment.statementId, "ST-0629-001");
    assert.equal(payment.payment.customerId, "C001");
    assert.equal(payment.payment.attachmentIds[0], statementPaymentAttachment.attachmentId);
    assert.equal(payment.statementStatus, "收款待确认");
  },
  assertVariance({ variance }) {
  assert.equal(variance.statementStatus, "有欠款");
    assert.equal(variance.debtAmount, 28000);
    assert.equal(variance.varianceRecord.statementId, "ST-0629-002");
  },
  assertRestartedTodoAction({ restartedTodoAction }) {
  assert.equal(restartedTodoAction?.handledBy, "U-OFFICE-A");
    assert.equal(restartedTodoAction?.notifiedBy, "U-OFFICE-A");
    assert.equal(restartedTodoAction?.notificationStatus, "已通知客户");
    assert.equal(restartedTodoAction?.notificationCopyText, "PostgreSQL 待办持久化验证");
  },
  assertRestartedCustomerPending({ restartedCustomerPending }) {
  assert.equal(restartedCustomerPending?.handled, false);
    assert.equal(restartedCustomerPending?.reminder, "等待客户回复");
    assert.equal(restartedCustomerPending?.lastAction, "客户待确认");
    assert.equal(restartedCustomerPending?.refId, "ORD-0629-001-01");
    assert.equal(restartedCustomerPending?.referenceStatus, "valid");
    assert.equal(restartedCustomerPending?.referenceRepair?.beforeRefId, "T-LIVE-IDEMPOTENCY-002");
  },
  assertRestartedCorrectionDetail({ restartedCorrectionDetail, confirmedCorrection }) {
  assert.equal(restartedCorrectionDetail.status, "已确认生效");
    assert.equal(restartedCorrectionDetail.qtyBefore.onHand, 600);
    assert.equal(restartedCorrectionDetail.requestedQtyAfter.onHand, 585);
    assert.equal(restartedCorrectionDetail.ledger.ledgerId, confirmedCorrection.ledger.ledgerId);
    assert.equal(restartedCorrectionDetail.operatorId, "U-WAREHOUSE-A");
    assert.equal(restartedCorrectionDetail.confirmedBy, "U-MANAGER-A");
  },
  assertFormalConcurrentPersisted({ formalConcurrentPersisted }) {
  assert.equal(Number(formalConcurrentPersisted.eventCount), 1);
    assert.equal(Number(formalConcurrentPersisted.logCount), 1);
    assert.equal(Number(formalConcurrentPersisted.idempotencyCount), 1);
  },
});
