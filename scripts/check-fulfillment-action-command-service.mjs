import assert from "node:assert/strict";
import { createFulfillmentActionCommandService } from "../server/services/fulfillmentActionCommandService.mjs";

const calls = [];
const fixedNow = new Date("2026-07-11T14:00:00.000Z");
const service = createFulfillmentActionCommandService({
  businessDecisionEvidenceService: {
    prepareDecision(input) {
      return {
        ok: true,
        record: { id: `BD-${input.businessId}`, businessDecisionId: `BD-${input.businessId}` },
        attachmentLinks: [],
      };
    },
    toProjection(record) { return record; },
  },
  buildDriverDeliveryTask(_workspace, fulfillment, input = {}) {
    return {
      fulfillmentId: fulfillment.id,
      driverId: input.driverId,
      status: fulfillment.status,
      routeNo: fulfillment.routeNo ?? "",
      packageChecklist: [{ packageId: "PKG-001" }, { packageId: "PKG-002" }],
    };
  },
  buildFulfillmentActionRecord(_workspace, fulfillment, input = {}) {
    const hasActualQty = Object.prototype.hasOwnProperty.call(input, "actualQty");
    return {
      ...fulfillment,
      fulfillmentId: fulfillment.fulfillmentId ?? fulfillment.id,
      orderLineId: fulfillment.orderLineId ?? fulfillment.lineId,
      actualQty: hasActualQty ? input.actualQty : fulfillment.actualQty ?? fulfillment.qty ?? 0,
      deliveredAt: input.deliveredAt ?? fulfillment.deliveredAt ?? "",
      confirmedAt: input.confirmedAt ?? fulfillment.confirmedAt ?? "",
      confirmedBy: input.operatorId,
      revision: Number(fulfillment.revision ?? 1),
    };
  },
  buildOperationLog(_workspace, input) {
    return { id: `LOG-${input.action}`, ...input };
  },
  buildTodo(_workspace, input) {
    return { id: input.id ?? "TODO-SERVICE-001", handled: false, ...input };
  },
  confirmFulfillmentException(fulfillments, selected, modalType, payload) {
    return {
      fulfillments: fulfillments.map((item) =>
        item.id === selected.id
          ? {
              ...item,
              status: modalType === "unable" ? "无法出库" : "数量差异待处理",
              actualQty: payload.actualQty,
            }
          : item,
      ),
      todoInput: { type: modalType === "unable" ? "无法出库待处理" : "数量差异待处理", ref: selected.lineId },
    };
  },
  findCustomerName(_workspace, customerId) {
    return customerId === "C001" ? "张三服饰" : customerId;
  },
  findActiveDriverDeliveryDispatch(workspace, fulfillmentId) {
    return (
      workspace.driverDeliveryDispatches.find(
        (item) => item.fulfillmentId === fulfillmentId && item.dispatchStatus !== "已取消",
      ) ?? {}
    );
  },
  findAttachmentRecord(workspace, attachmentId) {
    return workspace.attachments.find((item) => item.attachmentId === attachmentId) ?? null;
  },
  findDriverDeliveryFulfillment(workspace, fulfillmentId) {
    return workspace.fulfillments.find((item) => item.id === fulfillmentId && item.method === "送货") ?? null;
  },
  findFulfillment(workspace, fulfillmentId) {
    return workspace.fulfillments.find((item) => item.id === fulfillmentId) ?? null;
  },
  findInventoryItem(workspace, inventoryItemId) {
    return workspace.inventories.find((item) => item.id === inventoryItemId) ?? null;
  },
  findOrderLine(workspace, orderLineId) {
    return workspace.orderLines.find((item) => item.id === orderLineId) ?? null;
  },
  async getDriverDeliveryTaskResponseProjection(_workspace, input) {
    return {
      ...input.fallbackFulfillment,
      fulfillmentId: input.fulfillmentId,
      driverId: input.operatorId,
      packageChecklist: [{ packageId: "PKG-001" }, { packageId: "PKG-002" }],
    };
  },
  getFulfillmentSortSequence() {
    return 1;
  },
  mapFulfillmentMethod(method) {
    return method === "快递快运" ? "express_ltl" : method === "送货" ? "delivery" : "pickup";
  },
  nextId(prefix, rows) {
    return `${prefix}-${String((rows ?? []).length + 1).padStart(3, "0")}`;
  },
  nextPlainId(prefix, value) {
    return `${prefix}-${String(value).replace(/[^a-z0-9]+/gi, "-")}`;
  },
  toInventoryReservationTransactionSummary(reservation) {
    return {
      reservationId: reservation.reservationId,
      reservedQty: reservation.reservedQty,
      status: reservation.status,
    };
  },
  updateFulfillmentsForAction(fulfillments, fulfillmentId, action) {
    const status = action === "标记已备货" ? "已备货" : "已交付";
    return fulfillments.map((item) => (item.id === fulfillmentId ? { ...item, status } : item));
  },
  now: () => fixedNow,
});

await checkLegacyDirectFulfillmentActionsAreBlocked();
await checkPaperHandoffAndWarehouseQuantityMismatch();
await checkWarehousePhysicalOutboundAndDriverFinalDelivery();
await checkPickupAndExpressPhysicalOutboundFinalDelivery();
await checkExceptionCreation();
await checkCancellationRelease();
await checkEvidenceReview();
await checkValidationAndLegacyGuard();
await checkDispatchCommand();
await checkDriverAssignmentAndLoad();
await checkDriverCompletionAndRetake();
await checkDriverException();

console.log(
  "Fulfillment action command service checks passed: paper handoff, warehouse execution, driver final delivery, revision conflicts, office identity, dispatch, evidence, and inventory boundaries are covered.",
);

async function checkLegacyDirectFulfillmentActionsAreBlocked() {
  const workspace = buildWorkspace();
  const prepared = await service.updateFulfillmentStatus({ workspace, fulfillmentId: "FUL-001", action: "标记已备货" });
  assert.equal(prepared.statusCode, 409);
  assert.equal(prepared.code, "FULFILLMENT_WAREHOUSE_EXECUTION_REQUIRED");

  const missingConfirmation = await service.updateFulfillmentStatus({
    workspace,
    fulfillmentId: "FUL-001",
    action: "完成出库/交付",
    body: { expectedRevision: 1 },
    operatorId: "U-OFFICE-A",
  });
  assert.equal(missingConfirmation.statusCode, 422);
  assert.equal(missingConfirmation.code, "FULFILLMENT_FINAL_CONFIRMATION_REQUIRED");

  const beforePhysicalOutbound = await service.updateFulfillmentStatus({
    workspace,
    fulfillmentId: "FUL-001",
    action: "完成出库/交付",
    body: { expectedRevision: 1, confirmedFinalDelivery: true },
    operatorId: "U-OFFICE-A",
  });
  assert.equal(beforePhysicalOutbound.statusCode, 409);
  assert.equal(beforePhysicalOutbound.code, "FULFILLMENT_PHYSICAL_OUTBOUND_REQUIRED");
}

async function checkPaperHandoffAndWarehouseQuantityMismatch() {
  const workspace = buildPaperReadyWorkspace({ qty: 500 });
  workspace.inventories[0] = { ...workspace.inventories[0], inStock: 600, reserved: 500 };
  workspace.inventoryReservations[0] = { ...workspace.inventoryReservations[0], reservedQty: 500 };
  workspace.orderLines[0] = { ...workspace.orderLines[0], qty: 500, amount: 180 };
  const handoff = await service.handoffPaperOutboundDocument({
    workspace,
    fulfillmentId: "FUL-001",
    body: {
      expectedRevision: 1,
      paperOutboundDocumentId: "POD-001",
      paperDocumentVersion: 1,
      paperDocumentRevision: 1,
      note: "纸单交库房",
      operatorId: "U-SPOOFED",
    },
    operatorId: "U-OFFICE-A",
  });
  assert.equal(handoff.response.status, "待库房备货");
  assert.equal(workspace.paperOutboundDocuments[0].status, "已交库房");
  assert.equal(workspace.paperOutboundDocuments[0].handedToWarehouseBy, "U-OFFICE-A");

  const mismatch = await service.recordWarehouseOutboundExecution({
    workspace,
    fulfillmentId: "FUL-001",
    body: {
      expectedRevision: workspace.fulfillments[0].revision,
      paperOutboundDocumentId: "POD-001",
      paperDocumentVersion: 1,
      paperDocumentRevision: workspace.paperOutboundDocuments[0].revision,
      result: "数量不符",
      actualQty: 430,
      physicalExecutorEmployeeId: "ERP-0008",
      feedbackChannel: "纸面",
      executedAt: fixedNow.toISOString(),
      authenticatedOperatorId: "U-SPOOFED",
      note: "纸单 500 个，只找到 430 个",
    },
    operatorId: "U-OFFICE-A",
  });
  assert.equal(mismatch.response.status, "数量差异待处理");
  assert.equal(mismatch.response.statementCandidate, false);
  const input = calls.at(-1);
  assert.deepEqual(input.inventoryLedgerEntries, []);
  assert.deepEqual(input.inventoryReservations, []);
  assert.equal(input.warehouseOutboundExecution.actualQty, 430);
  assert.equal(input.warehouseOutboundExecution.physicalExecutorEmployeeId, "ERP-0008");
  assert.equal(input.warehouseOutboundExecution.authenticatedOperatorId, "U-OFFICE-A");
  assert.equal(input.todo.type, "数量差异待处理");

  const resolved = await service.resolveFulfillmentQuantityVariance({
    workspace,
    fulfillmentId: "FUL-001",
    body: {
      expectedRevision: workspace.fulfillments[0].revision,
      resolutionResult: "按实际数量出库",
      delegatedDecision: { decisionMakerEmployeeId: "ERP-MOTHER" },
      idempotencyKey: "fulfillment-variance-resolution-001",
    },
    operatorId: "U-OFFICE-A",
    actionPermissions: ["business_decision.record_delegated", "fulfillment.quantity_variance.record_delegated"],
  });
  assert.equal(resolved.response.fulfillment.status, "差异已确认待重新出库");
  assert.equal(resolved.response.quantityVarianceResolution.actualQty, 430);
  assert.equal(resolved.response.inventoryChanged, false);
  assert.equal(resolved.response.statementChanged, false);

  const stale = await service.recordWarehouseOutboundExecution({
    workspace,
    fulfillmentId: "FUL-001",
    body: {
      expectedRevision: 1,
      paperOutboundDocumentId: "POD-001",
      paperDocumentVersion: 1,
      paperDocumentRevision: workspace.paperOutboundDocuments[0].revision,
      result: "已备货",
      physicalExecutorEmployeeId: "ERP-0008",
      feedbackChannel: "当面",
      executedAt: fixedNow.toISOString(),
    },
    operatorId: "U-OFFICE-B",
  });
  assert.equal(stale.statusCode, 409);
  assert.equal(stale.code, "BUSINESS_WRITE_CONFLICT");
}

async function checkWarehousePhysicalOutboundAndDriverFinalDelivery() {
  const workspace = buildPaperReadyWorkspace({ method: "送货", status: "待出库" });
  await handoffCurrentPaperDocument(workspace);
  const physicalOutbound = await service.recordWarehouseOutboundExecution({
    workspace,
    fulfillmentId: "FUL-001",
    body: warehouseExecutionBody(workspace, { result: "实物已出库", actualQty: 100 }),
    operatorId: "U-OFFICE-A",
  });
  assert.equal(physicalOutbound.response.status, "待司机装车");
  assert.equal(physicalOutbound.response.statementCandidate, false);
  assert.equal(calls.at(-1).inventoryLedgerEntries.length, 1);
  assert.equal(calls.at(-1).inventoryLedgerEntries[0].sourceType, "warehouse_physical_outbound");

  const loaded = await service.confirmDriverDeliveryLoaded({
    workspace,
    fulfillmentId: "FUL-001",
    body: { checkedPackageIds: ["PKG-001", "PKG-002"], operatorId: "U-SPOOFED" },
    operatorId: "U-DRIVER-A",
  });
  assert.equal(loaded.response.status, "配送中");

  const completed = await service.completeDriverDelivery({
    workspace,
    fulfillmentId: "FUL-001",
    body: {
      actualQty: 100,
      watermarkedPhotoAttachmentId: "ATT-WM-001",
      signaturePhotoAttachmentId: "ATT-SIGN-001",
      receiverName: "客户仓管",
    },
    operatorId: "U-DRIVER-A",
  });
  assert.equal(completed.response.statementCandidate, true);
  assert.equal(calls.at(-1).inventoryLedgerEntries.length, 0);
  assert.equal(calls.at(-1).fulfillment.finalDeliveryStatus, "已交付");
}

async function checkPickupAndExpressPhysicalOutboundFinalDelivery() {
  for (const method of ["自提", "快递快运"]) {
    const workspace = buildPaperReadyWorkspace({ method });
    await handoffCurrentPaperDocument(workspace);
    const physicalOutbound = await service.recordWarehouseOutboundExecution({
      workspace,
      fulfillmentId: "FUL-001",
      body: warehouseExecutionBody(workspace, { result: "实物已出库", actualQty: 100 }),
      operatorId: "U-OFFICE-A",
    });
    assert.equal(physicalOutbound.response.status, method === "自提" ? "待确认自提交付" : "待承运方拉走");
    assert.equal(physicalOutbound.response.statementCandidate, false);
    assert.equal(calls.at(-1).inventoryLedgerEntries.length, 1);
    assert.equal(calls.at(-1).statementCandidate, undefined);

    const finalDelivery = await service.updateFulfillmentStatus({
      workspace,
      fulfillmentId: "FUL-001",
      action: method === "自提" ? "完成出库/交付" : "确认已拉走",
      body: {
        expectedRevision: workspace.fulfillments[0].revision,
        confirmedFinalDelivery: true,
        idempotencyKey: `final-delivery-${method}`,
      },
      operatorId: "U-OFFICE-A",
    });
    assert.equal(finalDelivery.response.status, "已交付");
    assert.equal(finalDelivery.response.statementCandidate, true);
    assert.equal(finalDelivery.response.inventoryDeductionMode, "already_deducted_at_physical_outbound");
    assert.deepEqual(calls.at(-1).inventoryLedgerEntries ?? [], []);
    assert.equal(calls.at(-1).fulfillment.finalDeliveryStatus, "已交付");
  }
}

async function checkExceptionCreation() {
  const workspace = buildWorkspace();
  const result = await service.createFulfillmentException({
    workspace,
    fulfillmentId: "FUL-001",
    body: { exceptionType: "quantity_mismatch", actualQty: 90, reasonCode: "short_qty", operatorId: "U-SPOOFED" },
    operatorId: "U-OFFICE-A",
  });
  assert.equal(result.response.status, "数量差异待处理");
  assert.equal(result.response.todoType, "数量差异待处理");
  const input = calls.at(-1);
  assert.equal(input.fulfillmentException.actualQty, 90);
  assert.equal(input.fulfillmentException.reportedBy, "U-OFFICE-A");
  assert.equal(input.todo.createdBy, "U-OFFICE-A");
  assert.equal(input.idempotencyPayload.operatorId, "U-OFFICE-A");
}

async function checkCancellationRelease() {
  const workspace = buildWorkspace();
  const result = await service.cancelFulfillment({
    workspace,
    fulfillmentId: "FUL-001",
    body: { reason: "customer_cancelled", operatorId: "U-SPOOFED" },
    operatorId: "U-OFFICE-A",
  });
  assert.equal(result.response.status, "已取消");
  assert.equal(result.response.releasedReservations[0].status, "已释放");
  const input = calls.at(-1);
  assert.equal(input.fulfillment.cancelReason, "客户取消出库");
  assert.deepEqual(input.inventoryAdjustments[0], { inventoryItemId: "INV-001", reservedQtyChange: -100 });
  assert.equal(input.inventoryLedgerEntries[0].operatorId, "U-OFFICE-A");
}

async function checkEvidenceReview() {
  const workspace = buildWorkspace({ method: "送货", watermarkedPhotoAttached: true, driverId: "U-DRIVER-A" });
  const rejected = await service.reviewDeliveryEvidence({
    workspace,
    fulfillmentId: "FUL-001",
    body: { reviewStatus: "retake_required", reason: "照片模糊", operatorId: "U-SPOOFED" },
    operatorId: "U-OFFICE-A",
  });
  assert.equal(rejected.response.reviewStatus, "需重拍");
  assert.equal(rejected.response.todoType, "照片待重拍");
  assert.equal(rejected.response.task.driverId, "U-DRIVER-A");
  assert.equal(calls.at(-1).fulfillment.deliveryEvidenceReviewedByUserId, "U-OFFICE-A");
  assert.equal(calls.at(-1).idempotencyPayload.operatorId, "U-OFFICE-A");

  const approvedWorkspace = buildWorkspace({ method: "送货", watermarkedPhotoAttached: true });
  const approved = await service.reviewDeliveryEvidence({
    workspace: approvedWorkspace,
    fulfillmentId: "FUL-001",
    body: { reviewStatus: "approved" },
    operatorId: "U-OFFICE-A",
  });
  assert.equal(approved.response.reviewStatus, "已复核");
  assert.equal(approved.response.todoId, "");
  assert.equal(calls.at(-1).todo, null);
}

async function checkValidationAndLegacyGuard() {
  const missing = await service.cancelFulfillment({
    workspace: buildWorkspace(),
    fulfillmentId: "FUL-MISSING",
    body: {},
    operatorId: "U-OFFICE-A",
  });
  assert.equal(missing.notFound, true);

  const mismatch = await service.cancelFulfillment({
    workspace: buildWorkspace(),
    fulfillmentId: "FUL-001",
    body: { fulfillmentId: "FUL-OTHER" },
    operatorId: "U-OFFICE-A",
  });
  assert.equal(mismatch.statusCode, 422);

  const legacyWorkspace = buildWorkspace({ status: "待出库" });
  legacyWorkspace.inventoryReservations = [];
  legacyWorkspace.orderLines[0].orderType = "定制印刷";
  const movements = service.buildInventoryMovements(
    legacyWorkspace,
    { ...legacyWorkspace.fulfillments[0], status: "已交付" },
    { actualQty: 100, allowUnreservedInventoryDeduction: true },
  );
  assert.equal(movements.error.code, "LEGACY_FULFILLMENT_NOT_STOCK_LINE");
}

async function checkDispatchCommand() {
  const workspace = buildWorkspace({ method: "送货" });
  workspace.driverDeliveryDispatches[0].revision = 3;
  const result = await service.upsertDriverDispatch({
    workspace,
    fulfillmentId: "FUL-001",
    body: {
      driverId: "U-DRIVER-A",
      routeDate: "2026-07-12",
      routeNo: "虎门线-A",
      routeSequence: 2,
      plannedDepartureAt: "2026-07-12T08:30:00.000Z",
      operatorId: "U-SPOOFED",
    },
    operatorId: "U-OFFICE-A",
  });
  assert.equal(result.response.dispatch.revision, 3);
  assert.equal(result.response.task.driverId, "U-DRIVER-A");
  const input = calls.at(-1);
  assert.equal(input.kind, "driver_dispatch");
  assert.equal(input.dispatch.assignedBy, "U-OFFICE-A");
  assert.equal(input.idempotencyPayload.operatorId, "U-OFFICE-A");

  const conflictingId = await service.upsertDriverDispatch({
    workspace,
    fulfillmentId: "FUL-001",
    body: {
      dispatchId: "DDIS-OTHER",
      driverId: "U-DRIVER-A",
      routeDate: "2026-07-12",
      routeNo: "虎门线-A",
      routeSequence: 2,
    },
    operatorId: "U-OFFICE-A",
  });
  assert.equal(conflictingId.code, "DRIVER_DISPATCH_ID_CONFLICT");
}

async function checkDriverAssignmentAndLoad() {
  const noPhysicalOutboundWorkspace = buildWorkspace({ method: "送货", status: "待司机装车" });
  const blockedBeforeWarehouseOutbound = await service.confirmDriverDeliveryLoaded({
    workspace: noPhysicalOutboundWorkspace,
    fulfillmentId: "FUL-001",
    body: { checkedPackageIds: ["PKG-001", "PKG-002"] },
    operatorId: "U-DRIVER-A",
  });
  assert.equal(blockedBeforeWarehouseOutbound.code, "DRIVER_DELIVERY_WAREHOUSE_OUTBOUND_REQUIRED");

  const workspace = buildWorkspace({
    method: "送货",
    status: "待司机装车",
    physicalOutboundAt: fixedNow.toISOString(),
    physicalExecutorEmployeeId: "ERP-0008",
  });
  const denied = await service.confirmDriverDeliveryLoaded({
    workspace,
    fulfillmentId: "FUL-001",
    body: { checkedPackageIds: ["PKG-001", "PKG-002"] },
    operatorId: "U-DRIVER-B",
  });
  assert.equal(denied.notFound, true);

  const incomplete = await service.confirmDriverDeliveryLoaded({
    workspace,
    fulfillmentId: "FUL-001",
    body: { checkedPackageIds: ["PKG-001"] },
    operatorId: "U-DRIVER-A",
  });
  assert.equal(incomplete.code, "DRIVER_PACKAGE_CHECK_INCOMPLETE");

  const loaded = await service.confirmDriverDeliveryLoaded({
    workspace,
    fulfillmentId: "FUL-001",
    body: {
      checkedPackageIds: ["PKG-001", "PKG-002"],
      operatorId: "U-SPOOFED",
      remark: "装车核对完成",
    },
    operatorId: "U-DRIVER-A",
  });
  assert.equal(loaded.response.status, "配送中");
  const input = calls.at(-1);
  assert.equal(input.fulfillment.loadedBy, "U-DRIVER-A");
  assert.equal(input.idempotencyPayload.operatorId, "U-DRIVER-A");
  assert.deepEqual(input.operationLog.after.checkedPackageIds, ["PKG-001", "PKG-002"]);
}

async function checkDriverCompletionAndRetake() {
  const workspace = buildWorkspace({
    method: "送货",
    status: "配送中",
    physicalOutboundAt: fixedNow.toISOString(),
    physicalExecutorEmployeeId: "ERP-0008",
  });
  const missingAttachment = await service.completeDriverDelivery({
    workspace,
    fulfillmentId: "FUL-001",
    body: { watermarkedPhotoAttachmentId: "ATT-NOT-FOUND" },
    operatorId: "U-DRIVER-A",
  });
  assert.equal(missingAttachment.code, "DELIVERY_EVIDENCE_ATTACHMENT_NOT_FOUND");

  for (const [attachmentId, expectedCode] of [
    ["ATT-WM-WRONG-OWNER", "DELIVERY_EVIDENCE_ATTACHMENT_OWNER_MISMATCH"],
    ["ATT-WM-WRONG-PURPOSE", "DELIVERY_EVIDENCE_ATTACHMENT_PURPOSE_MISMATCH"],
    ["ATT-WM-WRONG-UPLOADER", "DELIVERY_EVIDENCE_ATTACHMENT_UPLOADER_MISMATCH"],
  ]) {
    const blocked = await service.completeDriverDelivery({
      workspace,
      fulfillmentId: "FUL-001",
      body: { watermarkedPhotoAttachmentId: attachmentId },
      operatorId: "U-DRIVER-A",
    });
    assert.equal(blocked.code, expectedCode);
  }

  const missingSignature = await service.completeDriverDelivery({
    workspace,
    fulfillmentId: "FUL-001",
    body: {
      watermarkedPhotoAttachmentId: "ATT-WM-001",
      signaturePhotoAttached: true,
    },
    operatorId: "U-DRIVER-A",
  });
  assert.equal(missingSignature.code, "SIGNATURE_PHOTO_ATTACHMENT_REQUIRED");

  const completed = await service.completeDriverDelivery({
    workspace,
    fulfillmentId: "FUL-001",
    body: {
      actualQty: 100,
      watermarkedPhotoAttachmentId: "ATT-WM-001",
      signaturePhotoAttached: true,
      signaturePhotoAttachmentId: "ATT-SIGN-001",
      watermarkOperatorId: "U-SPOOFED",
      receiverName: "客户仓管",
      operatorId: "U-SPOOFED",
    },
    operatorId: "U-DRIVER-A",
  });
  assert.equal(completed.response.status, "已完成");
  const input = calls.at(-1);
  assert.equal(input.fulfillment.watermarkOperatorId, "U-DRIVER-A");
  assert.equal(input.fulfillment.signaturePhotoAttachmentId, "ATT-SIGN-001");
  assert.equal(input.idempotencyPayload.operatorId, "U-DRIVER-A");
  assert.deepEqual(input.inventoryLedgerEntries, []);

  const notLoadedWorkspace = buildWorkspace({ method: "送货", status: "待出库" });
  const notLoaded = await service.completeDriverDelivery({
    workspace: notLoadedWorkspace,
    fulfillmentId: "FUL-001",
    body: { watermarkedPhotoAttachmentId: "ATT-WM-002" },
    operatorId: "U-DRIVER-A",
  });
  assert.equal(notLoaded.code, "DRIVER_DELIVERY_NOT_LOADED");

  const retakeWorkspace = buildWorkspace({
    method: "送货",
    status: "已交付",
    deliveryEvidenceReviewStatus: "需重拍",
    deliveredAt: "2026-07-11T13:00:00.000Z",
  });
  retakeWorkspace.todos.push({
    id: "TODO-RETAKE-001",
    type: "照片待重拍",
    ref: "OL-001",
    handled: false,
  });
  const retake = await service.completeDriverDelivery({
    workspace: retakeWorkspace,
    fulfillmentId: "FUL-001",
    body: { watermarkedPhotoAttachmentId: "ATT-WM-RETAKE" },
    operatorId: "U-DRIVER-A",
  });
  assert.equal(retake.response.evidenceResubmission, true);
  assert.equal(retake.response.inventoryDeductionMode, "skipped_delivery_evidence_resubmission");
  assert.deepEqual(calls.at(-1).inventoryLedgerEntries, []);
  assert.equal(calls.at(-1).todo.handledBy, "U-DRIVER-A");
}

async function checkDriverException() {
  const workspace = buildWorkspace({ method: "送货", status: "配送中" });
  const result = await service.reportDriverDeliveryException({
    workspace,
    fulfillmentId: "FUL-001",
    body: {
      reasonCode: "customer_unavailable",
      reasonText: "客户不在",
      actualQty: 0,
      operatorId: "U-SPOOFED",
    },
    operatorId: "U-DRIVER-A",
  });
  assert.equal(result.response.status, "送货异常");
  assert.equal(result.response.todoType, "送货异常待处理");
  const input = calls.at(-1);
  assert.equal(input.fulfillmentException.reportedBy, "U-DRIVER-A");
  assert.equal(input.todo.createdBy, "U-DRIVER-A");
  assert.equal(input.idempotencyPayload.operatorId, "U-DRIVER-A");
}

async function handoffCurrentPaperDocument(workspace) {
  const document = workspace.paperOutboundDocuments[0];
  const result = await service.handoffPaperOutboundDocument({
    workspace,
    fulfillmentId: "FUL-001",
    body: {
      expectedRevision: workspace.fulfillments[0].revision,
      paperOutboundDocumentId: document.paperOutboundDocumentId,
      paperDocumentVersion: document.documentVersion,
      paperDocumentRevision: document.revision,
    },
    operatorId: "U-OFFICE-A",
  });
  assert.equal(result.response.status, "待库房备货");
  return result;
}

function warehouseExecutionBody(workspace, overrides = {}) {
  const document = workspace.paperOutboundDocuments[0];
  return {
    expectedRevision: workspace.fulfillments[0].revision,
    paperOutboundDocumentId: document.paperOutboundDocumentId,
    paperDocumentVersion: document.documentVersion,
    paperDocumentRevision: document.revision,
    physicalExecutorEmployeeId: "ERP-0008",
    feedbackChannel: "当面",
    executedAt: fixedNow.toISOString(),
    ...overrides,
  };
}

function buildPaperReadyWorkspace(overrides = {}) {
  const workspace = buildWorkspace(overrides);
  workspace.fulfillments[0] = {
    ...workspace.fulfillments[0],
    paperOutboundStatus: "已打印待交库房",
    paperOutboundDocumentId: "POD-001",
    legacyStateReviewRequired: false,
  };
  workspace.printRecords = [{
    id: "PR-POD-001",
    printRecordId: "PR-POD-001",
    targetType: "fulfillment",
    targetId: "FUL-001",
    status: "printed",
    operatorId: "U-OFFICE-A",
    printedAt: fixedNow.toISOString(),
  }];
  workspace.paperOutboundDocuments = [{
    id: "POD-001",
    paperOutboundDocumentId: "POD-001",
    fulfillmentId: "FUL-001",
    printRecordId: "PR-POD-001",
    documentType: "outbound_note",
    documentVersion: 1,
    status: "待打印确认",
    revision: 1,
    createdAt: fixedNow.toISOString(),
    updatedAt: fixedNow.toISOString(),
  }];
  return workspace;
}

function buildWorkspace(overrides = {}) {
  const fulfillment = {
    id: "FUL-001",
    fulfillmentId: "FUL-001",
    lineId: "OL-001",
    orderLineId: "OL-001",
    customerId: "C001",
    goods: "定制袋 30*38 白印黑",
    method: "自提",
    qty: 100,
    status: "待出库",
    revision: 1,
    ...overrides,
  };
  const workspace = {
    fulfillments: [fulfillment],
    driverDeliveryDispatches: [
      {
        id: "DDIS-001",
        dispatchId: "DDIS-001",
        fulfillmentId: "FUL-001",
        driverId: "U-DRIVER-A",
        routeDate: "2026-07-11",
        routeNo: "虎门线-A",
        routeSequence: 1,
        stopSequence: 1,
        dispatchStatus: "已派单",
        revision: 1,
        createdAt: "2026-07-11T08:00:00.000Z",
      },
    ],
    fulfillmentExceptions: [],
    employees: [{ id: "ERP-0008", employeeId: "ERP-0008", name: "郭青格" }],
    paperOutboundDocuments: [],
    warehouseOutboundExecutions: [],
    printRecords: [],
    todos: [],
    operationLogs: [],
    businessDecisionRecords: [],
    fulfillmentQuantityVarianceResolutions: [],
    attachmentLinks: [],
    inventories: [
      {
        id: "INV-001",
        size: "30*38",
        color: "白色",
        handle: "普通提",
        style: "空白袋",
        inStock: 200,
        reserved: 100,
        locked: 0,
        state: "可用",
      },
    ],
    inventoryReservations: [
      {
        id: "RES-001",
        reservationId: "RES-001",
        orderLineId: "OL-001",
        inventoryItemId: "INV-001",
        reservedQty: 100,
        status: "生效",
      },
    ],
    orderLines: [
      {
        id: "OL-001",
        customerId: "C001",
        orderType: "现货",
        print: "否",
        qty: 100,
        amount: 36,
        size: "30*38",
        color: "白色",
        handle: "普通提",
        style: "空白袋",
      },
    ],
    statements: [
      {
        id: "ST-C001-OPEN",
        customerId: "C001",
        status: "待生成",
        receivable: 10,
        received: 0,
        variance: 0,
        period: "2026-07-01 至 2026-07-11",
        lineIds: [],
        sent: false,
      },
    ],
    statementLines: [],
    attachments: [
      buildDeliveryEvidenceAttachment("ATT-WM-001", "delivery_watermark_photo"),
      buildDeliveryEvidenceAttachment("ATT-WM-002", "delivery_watermark_photo"),
      buildDeliveryEvidenceAttachment("ATT-WM-RETAKE", "delivery_watermark_photo"),
      buildDeliveryEvidenceAttachment("ATT-SIGN-001", "signature_photo"),
      buildDeliveryEvidenceAttachment("ATT-WM-WRONG-OWNER", "delivery_watermark_photo", {
        ownerId: "FUL-OTHER",
      }),
      buildDeliveryEvidenceAttachment("ATT-WM-WRONG-PURPOSE", "signature_photo"),
      buildDeliveryEvidenceAttachment("ATT-WM-WRONG-UPLOADER", "delivery_watermark_photo", {
        uploadedBy: "U-DRIVER-B",
      }),
    ],
  };
  workspace.fulfillmentActionTransactionRepository = {
    async recordFulfillmentAction(input) {
      calls.push({ ...input, kind: "fulfillment_action" });
      const index = workspace.fulfillments.findIndex((item) => item.id === input.fulfillment.fulfillmentId);
      const savedFulfillment = {
        ...input.fulfillment,
        revision: Number(input.fulfillment.revision ?? 1) + 1,
      };
      if (index >= 0) workspace.fulfillments[index] = { ...workspace.fulfillments[index], ...savedFulfillment };
      if (input.paperOutboundDocument) {
        const documentIndex = workspace.paperOutboundDocuments.findIndex(
          (item) => item.paperOutboundDocumentId === input.paperOutboundDocument.paperOutboundDocumentId,
        );
        if (documentIndex >= 0) workspace.paperOutboundDocuments[documentIndex] = input.paperOutboundDocument;
        else workspace.paperOutboundDocuments.push(input.paperOutboundDocument);
      }
      if (input.warehouseOutboundExecution) {
        workspace.warehouseOutboundExecutions.push(input.warehouseOutboundExecution);
      }
      if (input.fulfillmentException) {
        const exceptionId = input.fulfillmentException.exceptionId ?? input.fulfillmentException.id;
        workspace.fulfillmentExceptions = [
          input.fulfillmentException,
          ...workspace.fulfillmentExceptions.filter((item) => (item.exceptionId ?? item.id) !== exceptionId),
        ];
      }
      if (input.todo) {
        workspace.todos = [input.todo, ...workspace.todos.filter((item) => item.id !== input.todo.id)];
      }
      if (input.quantityVarianceResolution) {
        workspace.fulfillmentQuantityVarianceResolutions.unshift(input.quantityVarianceResolution);
      }
      if (input.statementCandidate?.statement) {
        workspace.statements = workspace.statements.map((item) =>
          item.id === input.statementCandidate.statement.id ? input.statementCandidate.statement : item,
        );
      }
      if (input.statementCandidate?.statementLine) workspace.statementLines.push(input.statementCandidate.statementLine);
      return {
        fulfillment: savedFulfillment,
        paperOutboundDocument: input.paperOutboundDocument ?? null,
        warehouseOutboundExecution: input.warehouseOutboundExecution ?? null,
        fulfillmentException: input.fulfillmentException ?? null,
        todo: input.todo ?? null,
        quantityVarianceResolution: input.quantityVarianceResolution ?? null,
        businessDecision: input.decisionRecord ?? null,
        inventoryReservations: input.inventoryReservations ?? [],
        inventoryLedgerEntries: input.inventoryLedgerEntries ?? [],
        statement: input.statementCandidate?.statement ?? null,
        statementLine: input.statementCandidate?.statementLine ?? null,
        operationLogId: input.operationLog.id,
      };
    },
  };
  workspace.driverDeliveryDispatchRepository = {
    async upsertDriverDeliveryDispatch(input) {
      calls.push({ ...input, kind: "driver_dispatch" });
      const index = workspace.driverDeliveryDispatches.findIndex(
        (item) => item.dispatchId === input.dispatch.dispatchId,
      );
      if (index >= 0) workspace.driverDeliveryDispatches[index] = input.dispatch;
      else workspace.driverDeliveryDispatches.unshift(input.dispatch);
      return { dispatch: input.dispatch, operationLogId: input.operationLog.id };
    },
  };
  workspace.driverDeliveryTaskReadRepository = {
    async getDriverDeliveryTask({ fulfillmentId, operatorId }) {
      const current = workspace.fulfillments.find((item) => item.id === fulfillmentId);
      const dispatch = workspace.driverDeliveryDispatches.find(
        (item) => item.fulfillmentId === fulfillmentId && item.dispatchStatus !== "已取消",
      );
      if (!current || dispatch?.driverId !== operatorId) return null;
      return {
        ...current,
        fulfillmentId,
        driverId: operatorId,
        routeNo: dispatch.routeNo,
        routeSequence: dispatch.routeSequence,
        packageChecklist: [{ packageId: "PKG-001" }, { packageId: "PKG-002" }],
      };
    },
  };
  return workspace;
}

function buildDeliveryEvidenceAttachment(attachmentId, purpose, overrides = {}) {
  return {
    attachmentId,
    ownerType: "fulfillment",
    ownerId: "FUL-001",
    purpose,
    fileType: "image",
    mimeType: "image/png",
    hasContent: true,
    status: "uploaded",
    uploadedBy: "U-DRIVER-A",
    url: `/api/attachments/${attachmentId}/content`,
    metadata: {},
    ...overrides,
  };
}
