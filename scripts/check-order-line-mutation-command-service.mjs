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

await checkExecutedFulfillmentProtection();
await checkVoidCommand();
await checkQuantityAdjustmentCommand();
await checkReplayBeforeTerminalStateValidation();
await checkValidationAndInventoryFailures();

console.log(
  "Order-line mutation command service checks passed: validation, authenticated identity, inventory/statement snapshots, transaction inputs, and replay ordering are covered.",
);

async function checkVoidCommand() {
  const workspace = buildWorkspace();
  workspace.statementLines = [];
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

for (const newQty of [6.9, '6.9', Number.MAX_SAFE_INTEGER + 1, -1, Infinity]) {
 const workspace=buildWorkspace(), before=JSON.stringify(workspace), count=calls.quantity.length;
 const result=await service.adjustOrderLineQuantity({workspace,orderLineId:'OL-001',body:{newQty},operatorId:'U-OFFICE-A'});
 assert.equal(result.statusCode,422,`Must reject invalid requested quantity ${newQty} without rounding`);
 assert.equal(calls.quantity.length,count);
 assert.equal(JSON.stringify(workspace),before);
}
console.log('PASS invalid quantity adjustments are rejected before finance/inventory persistence.');

{
 const unbilled=buildWorkspace();unbilled.statementLines=[];
 const voidResult=await service.voidOrderLine({workspace:unbilled,orderLineId:'OL-001',operatorId:'U-OFFICE-A',body:{voidedAt:'1999-01-01T00:00:00Z'}});assert.ok(voidResult.response);
 const voidInput=calls.void.at(-1);
 assert.equal(voidInput.orderLine.voidedAt,'2026-07-11T12:00:00.000Z');
 assert.equal(voidInput.orderLineChangeRecord.createdAt,'2026-07-11T12:00:00.000Z');
 await service.adjustOrderLineQuantity({workspace:buildWorkspace(),orderLineId:'OL-001',operatorId:'U-OFFICE-A',body:{newQty:6,adjustedAt:'2099-01-01T00:00:00Z'}});
 const quantityInput=calls.quantity.at(-1);
 assert.equal(quantityInput.orderLineChangeRecord.createdAt,'2026-07-11T12:00:00.000Z');
 assert.equal(quantityInput.priceSnapshots[0].createdAt,'2026-07-11T12:00:00.000Z');
}
console.log('PASS order void/quantity adjustment audit timestamps use server clock despite client-supplied dates.');

{
 const workspace=buildWorkspace();
 Object.assign(workspace.priceSnapshots[0],{bagPrice:0.1234,printPrice:0.0567,chargeableQty:10,finalAmount:1.80,amount:1.80});
 const result=await service.adjustOrderLineQuantity({workspace,orderLineId:'OL-001',operatorId:'U-OFFICE-A',body:{newQty:6}});
 assert.equal(result.response.priceSnapshot.bagPrice,0.1234);
 assert.equal(result.response.priceSnapshot.printPrice,0.0567);
 assert.equal(result.response.priceSnapshot.finalAmount,1.08);
}
console.log('PASS four-decimal locked component rates survive quantity change while total rounds to cents.');

for (const values of [{bagPrice:-0.1},{printPrice:-0.1},{finalAmount:NaN},{otherFee:Infinity},{chargeableQty:0},{finalAmount:1e12}]) {
 const workspace=buildWorkspace();Object.assign(workspace.priceSnapshots[0],values);
 const count=calls.quantity.length;
 const result=await service.adjustOrderLineQuantity({workspace,orderLineId:'OL-001',operatorId:'U-OFFICE-A',body:{newQty:6}});
 assert.equal(result.code,'ORDER_LINE_PRICE_INVALID',JSON.stringify(values));
 assert.equal(calls.quantity.length,count);
}

for (const reverse of [false,true]) {
 const workspace=buildWorkspace();
 workspace.priceSnapshots.push({...workspace.priceSnapshots[0],id:'PS-OTHER',priceSnapshotId:'PS-OTHER',snapshotType:'quantity_adjustment',versionNo:7,bagPrice:0.5,finalAmount:5});
 if(reverse)workspace.priceSnapshots.reverse();
 const count=calls.quantity.length;
 const result=await service.adjustOrderLineQuantity({workspace,orderLineId:'OL-001',operatorId:'U-OFFICE-A',body:{newQty:6}});
 assert.equal(result.code,'ORDER_LINE_PRICE_SOURCE_AMBIGUOUS');assert.equal(calls.quantity.length,count);
}

for (const collection of ['fulfillments','statementLines']) {
 const workspace=buildWorkspace();workspace[collection].push({...workspace[collection][0],id:'SECOND-SPLIT'});
 const count=calls.quantity.length;
 const result=await service.adjustOrderLineQuantity({workspace,orderLineId:'OL-001',operatorId:'U-OFFICE-A',body:{newQty:6}});
 assert.equal(result.code,'ORDER_LINE_SPLIT_ALLOCATION_REQUIRED');assert.equal(calls.quantity.length,count);
}

async function checkExecutedFulfillmentProtection() {
  for (const facts of [
    {status: '配送中'}, {status: '已出库'}, {status: '已拉走'}, {status: '已完成'},
    {status: '待出库', physicalOutboundAt: '2026-09-11T00:00:00Z'},
    {status: '待出库', loadedAt: '2026-09-11T00:00:00Z'},
    {status: '待出库', finalDeliveryAt: '2026-09-11T00:00:00Z'},
    {status: '待出库', deliveredAt: '2026-09-11T00:00:00Z'},
  ]) {
    const workspace = buildWorkspace();
    Object.assign(workspace.fulfillments[0], facts);
    const before = JSON.stringify(workspace);
    const writes = calls.void.length + calls.quantity.length;
    const cancelled = await service.voidOrderLine({workspace, orderLineId: 'OL-001', operatorId:'U-OFFICE-A', body:{idempotencyKey:'blocked-void'}});
    assert.equal(cancelled.code, 'ORDER_LINE_NOT_VOIDABLE', JSON.stringify(facts));
    const adjusted = await service.adjustOrderLineQuantity({workspace, orderLineId:'OL-001', operatorId:'U-OFFICE-A', body:{newQty:6,idempotencyKey:'blocked-quantity'}});
    assert.equal(adjusted.code, 'ORDER_LINE_QUANTITY_NOT_ADJUSTABLE', JSON.stringify(facts));
    assert.equal(calls.void.length + calls.quantity.length, writes);
    assert.equal(JSON.stringify(workspace), before);
  }
}

// Unknown financial facts must not be converted into a valid zero-price adjustment.
for (const amount of [undefined,null,'', '   ', false, true, NaN]) {
 const workspace=buildWorkspace();workspace.priceSnapshots=[];workspace.orderLines[0].amount=amount;
 const writes=calls.quantity.length;
 for (const method of ['previewOrderLineQuantity','adjustOrderLineQuantity']) {
   const result=await service[method]({workspace,orderLineId:'OL-001',operatorId:'U-OFFICE-A',body:{newQty:6}});
   assert.equal(result.code,'ORDER_LINE_PRICE_INVALID',String(amount));
 }
 assert.equal(calls.quantity.length,writes);
}
{
 const workspace=buildWorkspace();workspace.priceSnapshots[0].chargeableQty=8;
 const result=await service.adjustOrderLineQuantity({workspace,orderLineId:'OL-001',operatorId:'U-OFFICE-A',body:{newQty:6}});
 assert.equal(result.code,'ORDER_LINE_BILLING_ALLOCATION_REQUIRED');
}
for(const method of ['previewOrderLineQuantity','adjustOrderLineQuantity','voidOrderLine']){
 const workspace=buildWorkspace();workspace.priceSnapshots[0].sourceEvidence={officePricingGroup:{memberCount:2,groupId:'GROUP-A'}};
 const result=await service[method]({workspace,orderLineId:'OL-001',operatorId:'U-OFFICE-A',body:{newQty:6}});
 assert.equal(result.code,'ORDER_PRINT_GROUP_REQUOTE_REQUIRED');
}
console.log('PASS unknown amount, partial/gift billing and multi-member print groups cannot silently become ordinary zero-price or single-line edits.');

{
 const workspace=buildWorkspace();const writes=calls.void.length;
 const result=await service.voidOrderLine({workspace,orderLineId:'OL-001',operatorId:'U-OFFICE-A',body:{}});
 assert.equal(result.code,'ORDER_LINE_HAS_STATEMENT');assert.equal(calls.void.length,writes);
}
{
 const workspace=buildWorkspace();workspace.inventoryReservations=[];workspace.statementLines=[];
 workspace.productionTasks=[{id:'PROD-PENDING',orderLineId:'OL-001',plannedQty:10,taskStatus:'待排产'}];
 const result=await service.adjustOrderLineQuantity({workspace,orderLineId:'OL-001',operatorId:'U-OFFICE-A',body:{newQty:20}});
 assert.ok(result.response);assert.equal(calls.quantity.at(-1).orderLine.originalQty,20);assert.equal(calls.quantity.at(-1).inventoryAdjustments.length,0);
}
console.log('PASS billed orders cannot be ordinarily voided; unstarted full-production orders can increase without fabricated finished stock.');
