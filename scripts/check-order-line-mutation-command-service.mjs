import assert from "node:assert/strict";
import { createOrderLineMutationCommandService } from "../server/services/orderLineMutationCommandService.mjs";

const calls = { void: [], quantity: [] };
const service = createOrderLineMutationCommandService({
  buildOperationLog(_workspace, input) {
    return { id: `LOG-${input.action}`, ...input };
  },
  findInventoryItem(workspace, inventoryItemId) {
    return (workspace.inventories ?? []).find((item) => item.id === inventoryItemId) ?? null;
  },
  findOrderLine(workspace, orderLineId) {
    return (workspace.orderLines ?? []).find((item) => item.id === orderLineId) ?? null;
  },
  nextPlainId(prefix, value) {
    return `${prefix}-${String(value).replace(/[^a-z0-9]+/gi, "-")}`;
  },
  summarizeOrderLineForChange(orderLine) {
    return {
      orderLineId: orderLine.id ?? orderLine.orderLineId,
      originalQty: Number(orderLine.qty ?? orderLine.originalQty ?? 0),
      lineStatus: orderLine.status ?? orderLine.lineStatus,
      voidReason: orderLine.voidReason ?? "",
    };
  },
  toInventoryQuantitySnapshot(inventoryItem) {
    return {
      available:
        Number(inventoryItem.inStock ?? 0) -
        Number(inventoryItem.reserved ?? 0) -
        Number(inventoryItem.locked ?? 0) -
        Number(inventoryItem.pending ?? 0),
    };
  },
  toInventoryReservationTransactionSummary(reservation) {
    return {
      reservationId: reservation.reservationId,
      qty: Number(reservation.reservedQty ?? 0),
      status: reservation.status === "已释放" ? "released" : "active",
    };
  },
  now: () => new Date("2026-07-11T12:00:00.000Z"),
});

await checkVoidCommand();
await checkQuantityAdjustmentCommand();
await checkReplayBeforeTerminalStateValidation();
await checkValidationAndInventoryFailures();

console.log(
  "Order-line mutation command service checks passed: validation, authenticated identity, inventory/statement snapshots, transaction inputs, and replay ordering are covered.",
);

async function checkVoidCommand() {
  const workspace = buildWorkspace();
  const result = await service.voidOrderLine({
    workspace,
    orderLineId: "OL-001",
    operatorId: "U-OFFICE-A",
    body: {
      idempotencyKey: "void-command-001",
      reason: "order_cancelled",
      operatorId: "U-SPOOFED",
    },
  });

  assert.equal(result.response.status, "已关闭");
  assert.equal(result.response.releasedReservations[0].status, "released");
  assert.equal(result.response.inventoryLedgerIds.length, 1);
  const input = calls.void.at(-1);
  assert.equal(input.expectedOrderLineRevision, 3);
  assert.equal(input.idempotencyPayload.operatorId, "U-OFFICE-A");
  assert.equal(input.orderLine.voidedBy, "U-OFFICE-A");
  assert.equal(input.orderLine.voidReason, "客户取消订单");
  assert.equal(input.fulfillmentRecords[0].confirmedBy, "U-OFFICE-A");
  assert.deepEqual(input.inventoryAdjustments[0], {
    inventoryItemId: "INV-001",
    reservedQtyChange: -10,
    expectedRevision: 5,
    expectedReservedQty: 10,
  });
  assert.equal(input.inventoryReservations[0].expectedRevision, undefined);
  assert.equal(input.inventoryReservations[0].revision, 4);
  assert.equal(input.inventoryReservations[0].expectedReservedQty, 10);
  assert.equal(input.inventoryReservations[0].expectedStatus, "生效");
  assert.equal(input.inventoryLedgerEntries[0].operatorId, "U-OFFICE-A");
  assert.equal(input.operationLog.operatorId, "U-OFFICE-A");
  assert.equal(input.orderLineChangeRecord.changedBy, "U-OFFICE-A");
}

async function checkQuantityAdjustmentCommand() {
  const workspace = buildWorkspace();
  const result = await service.adjustOrderLineQuantity({
    workspace,
    orderLineId: "OL-001",
    operatorId: "U-OFFICE-A",
    body: {
      idempotencyKey: "qty-command-001",
      newQty: 6,
      reason: "customer_change",
      operatorId: "U-SPOOFED",
    },
  });

  assert.equal(result.response.previousQty, 10);
  assert.equal(result.response.newQty, 6);
  assert.equal(result.response.qtyDelta, -4);
  assert.equal(result.response.priceSnapshot.finalAmount, 2.04);
  assert.equal(result.response.adjustedReservations[0].qty, 6);
  const input = calls.quantity.at(-1);
  assert.equal(input.expectedOrderLineRevision, 3);
  assert.equal(input.idempotencyPayload.operatorId, "U-OFFICE-A");
  assert.equal(input.orderLine.qty, 6);
  assert.equal(input.orderLine.amount, 2.04);
  assert.equal(input.fulfillmentRecords[0].expectedQty, 6);
  assert.equal(input.fulfillmentRecords[0].confirmedBy, "U-OFFICE-A");
  assert.deepEqual(input.inventoryAdjustments[0], {
    inventoryItemId: "INV-001",
    reservedQtyChange: -4,
    expectedRevision: 5,
    expectedReservedQty: 10,
  });
  assert.equal(input.inventoryReservations[0].expectedReservedQty, 10);
  assert.equal(input.statementLines[0].chargeableQty, 6);
  assert.equal(input.statementLines[0].expectedRevision, 2);
  assert.equal(input.statementLines[0].expectedFinalAmount, 3.4);
  assert.equal(input.statementRecords[0].receivable, 2.04);
  assert.equal(input.statementRecords[0].revision, 7);
  assert.equal(input.priceSnapshots[0].createdBy, "U-OFFICE-A");
  assert.equal(input.operationLog.operatorId, "U-OFFICE-A");
}

async function checkReplayBeforeTerminalStateValidation() {
  const workspace = buildWorkspace();
  workspace.orderLines[0].status = "已关闭";
  workspace.orderLines[0].lineStatus = "已关闭";
  workspace.orderLineVoidTransactionRepository.findIdempotentReplay = async () => ({
    orderLine: { orderLineId: "OL-001", lineStatus: "已关闭" },
    fulfillmentRecords: [],
    inventoryReservations: [],
    inventoryLedgerEntries: [],
    orderLineChangeRecordId: "OLCR-REPLAY",
    operationLogId: "LOG-REPLAY",
  });
  const replay = await service.voidOrderLine({
    workspace,
    orderLineId: "OL-001",
    body: { idempotencyKey: "void-command-replay-001" },
    operatorId: "U-OFFICE-A",
  });
  assert.equal(replay.response.operationLogId, "LOG-REPLAY");

  workspace.orderLineQuantityAdjustmentTransactionRepository.findIdempotentReplay = async () => ({
    orderLine: { orderLineId: "OL-001", lineStatus: "待出库", originalQty: 6 },
    fulfillmentRecords: [],
    priceSnapshots: [{ finalAmount: 2.04 }],
    inventoryReservations: [],
    inventoryLedgerEntries: [],
    statementLines: [],
    statementRecords: [],
    previousQty: 10,
    newQty: 6,
    qtyDelta: -4,
    orderLineChangeRecordId: "OLCR-QTY-REPLAY",
    operationLogId: "LOG-QTY-REPLAY",
  });
  const quantityReplay = await service.adjustOrderLineQuantity({
    workspace,
    orderLineId: "OL-001",
    body: { idempotencyKey: "qty-command-replay-001", newQty: 6 },
    operatorId: "U-OFFICE-A",
  });
  assert.equal(quantityReplay.response.previousQty, 10);
  assert.equal(quantityReplay.response.operationLogId, "LOG-QTY-REPLAY");
}

async function checkValidationAndInventoryFailures() {
  const workspace = buildWorkspace();
  const mismatch = await service.voidOrderLine({
    workspace,
    orderLineId: "OL-001",
    body: { orderLineId: "OL-OTHER" },
    operatorId: "U-OFFICE-A",
  });
  assert.equal(mismatch.statusCode, 422);
  assert.equal(mismatch.code, "VALIDATION_ERROR");

  const invalidQty = await service.adjustOrderLineQuantity({
    workspace,
    orderLineId: "OL-001",
    body: { newQty: 0 },
    operatorId: "U-OFFICE-A",
  });
  assert.equal(invalidQty.statusCode, 422);

  const unchangedQty = await service.adjustOrderLineQuantity({
    workspace,
    orderLineId: "OL-001",
    body: { newQty: 10 },
    operatorId: "U-OFFICE-A",
  });
  assert.equal(unchangedQty.code, "ORDER_LINE_QUANTITY_UNCHANGED");

  workspace.inventoryReservations = [];
  const missingReservation = await service.adjustOrderLineQuantity({
    workspace,
    orderLineId: "OL-001",
    body: { newQty: 11 },
    operatorId: "U-OFFICE-A",
  });
  assert.equal(missingReservation.code, "ORDER_LINE_RESERVATION_REQUIRED_FOR_QUANTITY_INCREASE");
}

function buildWorkspace() {
  return {
    orderLines: [
      {
        id: "OL-001",
        orderLineId: "OL-001",
        orderNo: "ORD-001",
        customerId: "C001",
        qty: 10,
        originalQty: 10,
        amount: 3.4,
        status: "待出库",
        lineStatus: "待出库",
        revision: 3,
        exceptionTags: [],
      },
    ],
    fulfillments: [
      {
        id: "FUL-001",
        fulfillmentId: "FUL-001",
        lineId: "OL-001",
        orderLineId: "OL-001",
        qty: 10,
        expectedQty: 10,
        status: "待出库",
        revision: 2,
      },
    ],
    inventories: [{ id: "INV-001", inStock: 100, reserved: 10, locked: 0, pending: 0, revision: 5 }],
    inventoryReservations: [
      {
        id: "RSV-001",
        reservationId: "RSV-001",
        orderLineId: "OL-001",
        inventoryItemId: "INV-001",
        reservedQty: 10,
        qty: 10,
        status: "生效",
        revision: 4,
      },
    ],
    priceSnapshots: [
      {
        id: "PS-001",
        priceSnapshotId: "PS-001",
        orderLineId: "OL-001",
        snapshotType: "confirmation",
        versionNo: 1,
        bagPrice: 0.34,
        printPrice: 0,
        otherFee: 0,
        adjustmentAmount: 0,
        chargeableQty: 10,
        finalAmount: 3.4,
        createdAt: "2026-07-10T10:00:00.000Z",
      },
    ],
    statementLines: [
      {
        id: "SL-001",
        statementLineId: "SL-001",
        statementId: "ST-001",
        orderLineId: "OL-001",
        deliveredQty: 10,
        chargeableQty: 10,
        finalAmount: 3.4,
        revision: 2,
      },
    ],
    statements: [{ id: "ST-001", status: "待生成", receivable: 3.4, received: 0, revision: 7 }],
    orderLineChangeRecords: [],
    operationLogs: [],
    orderLineVoidTransactionRepository: {
      async findIdempotentReplay() {
        return null;
      },
      async voidOrderLine(input) {
        calls.void.push(input);
        return {
          orderLine: input.orderLine,
          fulfillmentRecords: input.fulfillmentRecords,
          inventoryReservations: input.inventoryReservations,
          inventoryLedgerEntries: input.inventoryLedgerEntries,
          orderLineChangeRecordId: input.orderLineChangeRecord.changeRecordId,
          operationLogId: input.operationLog.id,
        };
      },
    },
    orderLineQuantityAdjustmentTransactionRepository: {
      async findIdempotentReplay() {
        return null;
      },
      async adjustOrderLineQuantity(input) {
        calls.quantity.push(input);
        return {
          orderLine: input.orderLine,
          fulfillmentRecords: input.fulfillmentRecords,
          priceSnapshots: input.priceSnapshots,
          inventoryReservations: input.inventoryReservations,
          inventoryLedgerEntries: input.inventoryLedgerEntries,
          statementLines: input.statementLines,
          statementRecords: input.statementRecords,
          previousQty: input.orderLineChangeRecord.before.originalQty,
          newQty: input.orderLineChangeRecord.after.originalQty,
          qtyDelta: input.orderLineChangeRecord.after.qtyDelta,
          orderLineChangeRecordId: input.orderLineChangeRecord.changeRecordId,
          operationLogId: input.operationLog.id,
        };
      },
    },
  };
}
