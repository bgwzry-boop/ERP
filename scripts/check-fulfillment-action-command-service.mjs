import assert from "node:assert/strict";
import { createFulfillmentActionCommandService } from "../server/services/fulfillmentActionCommandService.mjs";

const calls = [];
const fixedNow = new Date("2026-07-11T14:00:00.000Z");
const service = createFulfillmentActionCommandService({
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
    return {
      ...fulfillment,
      fulfillmentId: fulfillment.fulfillmentId ?? fulfillment.id,
      orderLineId: fulfillment.orderLineId ?? fulfillment.lineId,
      actualQty: Number(input.actualQty ?? fulfillment.actualQty ?? fulfillment.qty ?? 0),
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
  hasDriverWatermarkEvidence(value) {
    return Boolean(value.watermarkedPhotoAttached || value.watermarkedPhotoAttachmentId);
  },
  isReleasableInventoryReservation(reservation) {
    return ["生效", "active", "reserved", "部分释放", "partially_released"].includes(reservation.status);
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
  normalizeDeliveryEvidenceReviewStatus(value) {
    if (["approved", "reviewed", "已复核"].includes(value)) return "已复核";
    if (["rejected", "retake_required", "需重拍"].includes(value)) return "需重拍";
    return "";
  },
  normalizeTimestamp(value, fallback) {
    return value || fallback;
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

await checkPreparedWithoutInventoryDeduction();
await checkCompletedReservationDeduction();
await checkExpressPickupGuard();
await checkExceptionCreation();
await checkCancellationRelease();
await checkEvidenceReview();
await checkValidationAndLegacyGuard();
await checkDispatchCommand();
await checkDriverAssignmentAndLoad();
await checkDriverCompletionAndRetake();
await checkDriverException();

console.log(
  "Fulfillment action command service checks passed: office actions, dispatch, driver assignment/load/complete/retake/exception, inventory movements, evidence review, and authenticated identity are covered.",
);

async function checkPreparedWithoutInventoryDeduction() {
  const workspace = buildWorkspace();
  const result = await service.updateFulfillmentStatus({
    workspace,
    fulfillmentId: "FUL-001",
    action: "标记已备货",
    body: { actualQty: 80, operatorId: "U-SPOOFED" },
    operatorId: "U-OFFICE-A",
  });
  assert.equal(result.response.status, "已备货");
  assert.equal(result.response.inventoryDeductionMode, "not_delivered");
  const input = calls.at(-1);
  assert.deepEqual(input.inventoryLedgerEntries, []);
  assert.equal(input.idempotencyPayload.operatorId, "U-OFFICE-A");
  assert.equal(input.operationLog.operatorId, "U-OFFICE-A");
}

async function checkCompletedReservationDeduction() {
  const workspace = buildWorkspace();
  const result = await service.updateFulfillmentStatus({
    workspace,
    fulfillmentId: "FUL-001",
    action: "完成出库/交付",
    body: { actualQty: 80, idempotencyKey: "complete-service-001", operatorId: "U-SPOOFED" },
    operatorId: "U-OFFICE-A",
  });
  assert.equal(result.response.status, "已交付");
  assert.equal(result.response.statementCandidate, true);
  assert.equal(result.response.inventoryDeductionMode, "reservation");
  const input = calls.at(-1);
  assert.equal(input.fulfillment.deliveredAt, fixedNow.toISOString());
  assert.equal(input.fulfillment.confirmedAt, fixedNow.toISOString());
  assert.equal(input.inventoryReservations[0].status, "已出库");
  assert.deepEqual(input.inventoryAdjustments[0], {
    inventoryItemId: "INV-001",
    onHandQtyChange: -80,
    reservedQtyChange: -100,
  });
  assert.equal(input.inventoryLedgerEntries[0].operatorId, "U-OFFICE-A");
  assert.equal(input.inventoryLedgerEntries[0].qtyAfter, 120);
}

async function checkExpressPickupGuard() {
  const workspace = buildWorkspace({ method: "快递快运", status: "待出库", printed: false });
  const blocked = await service.updateFulfillmentStatus({
    workspace,
    fulfillmentId: "FUL-001",
    action: "确认已拉走",
    body: {},
    operatorId: "U-OFFICE-A",
  });
  assert.equal(blocked.statusCode, 409);
  assert.equal(blocked.code, "FULFILLMENT_PRINT_NOT_CONFIRMED");

  workspace.fulfillments[0].printed = true;
  workspace.fulfillments[0].status = "待确认拉走";
  const completed = await service.updateFulfillmentStatus({
    workspace,
    fulfillmentId: "FUL-001",
    action: "确认已拉走",
    body: { actualQty: 100 },
    operatorId: "U-OFFICE-A",
  });
  assert.equal(completed.response.status, "已交付");
  assert.equal(calls.at(-1).operationLog.action, "confirm_fulfillment_pickup");
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
  const workspace = buildWorkspace({ method: "送货", status: "待出库" });
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
  const workspace = buildWorkspace({ method: "送货", status: "配送中" });
  const completed = await service.completeDriverDelivery({
    workspace,
    fulfillmentId: "FUL-001",
    body: {
      actualQty: 100,
      watermarkedPhotoAttachmentId: "ATT-WM-001",
      watermarkOperatorId: "U-SPOOFED",
      receiverName: "客户仓管",
      operatorId: "U-SPOOFED",
    },
    operatorId: "U-DRIVER-A",
  });
  assert.equal(completed.response.status, "已完成");
  const input = calls.at(-1);
  assert.equal(input.fulfillment.watermarkOperatorId, "U-DRIVER-A");
  assert.equal(input.idempotencyPayload.operatorId, "U-DRIVER-A");
  assert.equal(input.inventoryLedgerEntries[0].operatorId, "U-DRIVER-A");

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
    todos: [],
    operationLogs: [],
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
        orderType: "现货",
        print: "否",
        size: "30*38",
        color: "白色",
        handle: "普通提",
        style: "空白袋",
      },
    ],
  };
  workspace.fulfillmentActionTransactionRepository = {
    async recordFulfillmentAction(input) {
      calls.push({ ...input, kind: "fulfillment_action" });
      const index = workspace.fulfillments.findIndex((item) => item.id === input.fulfillment.fulfillmentId);
      if (index >= 0) workspace.fulfillments[index] = { ...workspace.fulfillments[index], ...input.fulfillment };
      return {
        fulfillment: input.fulfillment,
        fulfillmentException: input.fulfillmentException ?? null,
        todo: input.todo ?? null,
        inventoryReservations: input.inventoryReservations ?? [],
        inventoryLedgerEntries: input.inventoryLedgerEntries ?? [],
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
