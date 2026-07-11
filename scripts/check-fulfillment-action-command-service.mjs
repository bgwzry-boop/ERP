import assert from "node:assert/strict";
import { createFulfillmentActionCommandService } from "../server/services/fulfillmentActionCommandService.mjs";

const calls = [];
const fixedNow = new Date("2026-07-11T14:00:00.000Z");
const service = createFulfillmentActionCommandService({
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
    return { fulfillmentId: input.fulfillmentId, driverId: input.operatorId };
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

console.log(
  "Fulfillment action command service checks passed: prepared/complete/pickup, reservation deduction/release, exceptions, evidence review, validation, and authenticated identity are covered.",
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
      calls.push(input);
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
  return workspace;
}
