import assert from "node:assert/strict";
import {
  buildAdjustOrderLineQuantityTransactionQuery,
  buildAdjustOrderLineQuantityTransactionSql,
  createLocalOrderLineQuantityAdjustmentTransactionRepository,
  createPostgresOrderLineQuantityAdjustmentTransactionRepository,
} from "../server/orderLineQuantityAdjustmentTransactionRepository.mjs";

await checkLocalWorkspaceMutation();
await checkPostgresSqlBoundary();

console.log(
  "Order line quantity adjustment transaction repository check passed: local workspace mutation and PostgreSQL quantity adjustment SQL are covered.",
);

async function checkLocalWorkspaceMutation() {
  const workspace = {
    orderLines: [
      {
        id: "OL-Q001",
        orderNo: "ORD-Q001",
        customerId: "C001",
        product: "空白袋",
        size: "30*38*10",
        color: "白色",
        handle: "普通提",
        style: "空白袋",
        print: "否",
        qty: 100,
        orderType: "现货",
        status: "待交付确认",
        fulfillment: "自提",
      },
    ],
    fulfillments: [
      {
        id: "FUL-Q001",
        lineId: "OL-Q001",
        customerId: "C001",
        method: "自提",
        goods: "空白袋 30*38 白色",
        qty: 100,
        status: "待出库",
      },
    ],
    inventories: [{ id: "INV-Q001", reserved: 100 }],
    priceSnapshots: [buildPriceSnapshot({ chargeableQty: 100, finalAmount: 200 })],
    inventoryReservations: [
      {
        id: "RSV-Q001",
        reservationId: "RSV-Q001",
        orderLineId: "OL-Q001",
        inventoryItemId: "INV-Q001",
        reservedQty: 100,
        reservationType: "待提货锁定",
        status: "生效",
      },
    ],
    inventoryLedgers: [],
    statementLines: [buildStatementLine({ chargeableQty: 100, amount: 200, finalAmount: 200 })],
    statements: [{ id: "ST-Q001", status: "待生成", receivable: 200, received: 50, variance: 150, lineIds: ["OL-Q001"] }],
    orderLineChangeRecords: [],
    operationLogs: [],
  };
  const repository = createLocalOrderLineQuantityAdjustmentTransactionRepository();
  const transaction = await repository.adjustOrderLineQuantity({
    workspace,
    orderLine: buildOrderLine({ originalQty: 80, amount: 160 }),
    fulfillmentRecords: [buildFulfillment({ expectedQty: 80 })],
    priceSnapshots: [buildPriceSnapshot({ versionNo: 1, chargeableQty: 80, finalAmount: 160 })],
    inventoryReservations: [buildReservation({ reservedQty: 80 })],
    inventoryAdjustments: [{ inventoryItemId: "INV-Q001", reservedQtyChange: -20 }],
    inventoryLedgerEntries: [buildLedger({ qtyBefore: 100, qtyChange: -20, qtyAfter: 80 })],
    statementLines: [buildStatementLine({ chargeableQty: 80, amount: 160, finalAmount: 160 })],
    statementRecords: [buildStatementRecord({ receivable: 160, received: 50, variance: 110 })],
    orderLineChangeRecord: buildChangeRecord(),
    operationLog: buildOperationLog(),
  });

  assert.equal(transaction.orderLine.originalQty, 80);
  assert.equal(transaction.previousQty, 100);
  assert.equal(transaction.newQty, 80);
  assert.equal(transaction.qtyDelta, -20);
  assert.equal(transaction.fulfillmentRecords[0].expectedQty, 80);
  assert.equal(transaction.priceSnapshots[0].finalAmount, 160);
  assert.equal(transaction.inventoryReservations[0].reservedQty, 80);
  assert.equal(transaction.inventoryLedgerEntries[0].sourceType, "order_line_quantity_adjustment");
  assert.equal(transaction.statementLines[0].finalAmount, 160);
  assert.equal(transaction.statementRecords[0].variance, 110);
  assert.equal(workspace.orderLines[0].qty, 80);
  assert.equal(workspace.orderLines[0].amount, 160);
  assert.equal(workspace.fulfillments[0].qty, 80);
  assert.equal(workspace.priceSnapshots[0].finalAmount, 160);
  assert.equal(workspace.inventoryReservations[0].reservedQty, 80);
  assert.equal(workspace.inventories[0].reserved, 80);
  assert.equal(workspace.inventoryLedgers[0].ledgerId, "LEDGER-Q001");
  assert.equal(workspace.statementLines[0].finalAmount, 160);
  assert.equal(workspace.statements[0].receivable, 160);
  assert.equal(workspace.statements[0].variance, 110);
  assert.equal(workspace.orderLineChangeRecords[0].changeRecordId, "OLCR-Q001");
  assert.equal(workspace.operationLogs[0].id, "LOG-Q001");
}

async function checkPostgresSqlBoundary() {
  const calls = [];
  let persistedResponse = null;
  const repository = createPostgresOrderLineQuantityAdjustmentTransactionRepository({
    postgresClient: {
      queryJson() {
        return persistedResponse
          ? { requestHash: calls[0].requestHash, response: persistedResponse }
          : null;
      },
      idempotentTransactionJson(request) {
        calls.push(request);
        persistedResponse = {
          orderLine: buildOrderLine({ originalQty: 120, amount: 240, revision: 2 }),
          fulfillmentRecords: [buildFulfillment({ expectedQty: 120, revision: 2 })],
          priceSnapshots: [buildPriceSnapshot({ versionNo: 2, chargeableQty: 120, finalAmount: 240 })],
          inventoryReservations: [buildReservation({ reservedQty: 120, revision: 2 })],
          inventoryItems: [{ inventoryItemId: "INV-Q001", reservedQty: 120, revision: 2 }],
          inventoryLedgerEntries: [buildLedger({ qtyBefore: 100, qtyChange: 20, qtyAfter: 120, reason: "O'Brien changed qty" })],
          statementLines: [buildStatementLine({ chargeableQty: 120, amount: 240, finalAmount: 240, revision: 2 })],
          statementRecords: [buildStatementRecord({ receivable: 240, received: 50, variance: 190, revision: 2 })],
          previousQty: 100,
          newQty: 120,
          qtyDelta: 20,
          orderLineChangeRecordId: "OLCR-Q001",
          operationLogId: "LOG-Q001",
        };
        return persistedResponse;
      },
    },
  });
  const transaction = await repository.adjustOrderLineQuantity({
    workspace: {},
    idempotencyKey: "qty-adjust-OL-Q001",
    idempotencyPayload: { orderLineId: "OL-Q001", newQty: 120, reason: "O'Brien changed qty" },
    expectedOrderLineRevision: 1,
    orderLine: buildOrderLine({ originalQty: 120, amount: 240, revision: 1 }),
    fulfillmentRecords: [buildFulfillment({ expectedQty: 120 })],
    priceSnapshots: [buildPriceSnapshot({ versionNo: 2, chargeableQty: 120, finalAmount: 240 })],
    inventoryReservations: [buildReservation({ reservedQty: 120 })],
    inventoryAdjustments: [
      { inventoryItemId: "INV-Q001", reservedQtyChange: 20, expectedRevision: 1, expectedReservedQty: 100 },
    ],
    inventoryLedgerEntries: [buildLedger({ qtyBefore: 100, qtyChange: 20, qtyAfter: 120, reason: "O'Brien changed qty" })],
    statementLines: [buildStatementLine({ chargeableQty: 120, amount: 240, finalAmount: 240 })],
    statementRecords: [buildStatementRecord({ receivable: 240, received: 50, variance: 190 })],
    orderLineChangeRecord: buildChangeRecord({ reason: "O'Brien changed qty" }),
    operationLog: buildOperationLog({ reason: "O'Brien changed qty" }),
  });

  assert.equal(transaction.orderLine.originalQty, 120);
  assert.equal(transaction.priceSnapshots[0].finalAmount, 240);
  assert.equal(transaction.statementRecords[0].receivable, 240);
  assert.equal(calls[0].scope, "order.line.quantity.adjust");
  assert.equal(calls[0].idempotencyKey, "qty-adjust-OL-Q001");
  assert.match(calls[0].requestHash, /^[a-f0-9]{64}$/);
  assert.deepEqual(calls[0].resourceLocks, [
    "fulfillment:FUL-Q001",
    "idempotency:order.line.quantity.adjust:qty-adjust-OL-Q001",
    "inventory:INV-Q001",
    "order-line:OL-Q001",
    "reservation:RSV-Q001",
    "statement:ST-Q001",
  ]);
  assert.match(calls[0].text, /UPDATE order_lines/);
  assert.match(calls[0].text, /original_qty = \$\d+::integer/);
  assert.match(calls[0].text, /FOR UPDATE/);
  assert.match(calls[0].text, /ERP_ORDER_LINE_CONCURRENCY_CONFLICT/);
  assert.match(calls[0].text, /ERP_FULFILLMENT_CONCURRENCY_CONFLICT/);
  assert.match(calls[0].text, /ERP_RESERVATION_CONCURRENCY_CONFLICT/);
  assert.match(calls[0].text, /ERP_INVENTORY_CONCURRENCY_CONFLICT/);
  assert.match(calls[0].text, /ERP_STATEMENT_LINE_CONCURRENCY_CONFLICT/);
  assert.match(calls[0].text, /ERP_STATEMENT_CONCURRENCY_CONFLICT/);
  assert.match(calls[0].text, /revision = revision \+ 1/);
  assert.match(calls[0].text, /UPDATE fulfillment_records/);
  assert.match(calls[0].text, /expected_qty = updates.expected_qty/);
  assert.match(calls[0].text, /INSERT INTO price_snapshots/);
  assert.match(calls[0].text, /UPDATE inventory_reservations/);
  assert.match(calls[0].text, /UPDATE inventory_items AS item/);
  assert.match(calls[0].text, /INSERT INTO inventory_ledger_entries/);
  assert.match(calls[0].text, /UPDATE statement_lines AS line/);
  assert.match(calls[0].text, /UPDATE statements AS statement/);
  assert.match(calls[0].text, /INSERT INTO order_line_change_records/);
  assert.match(calls[0].text, /INSERT INTO operation_logs/);
  assert.doesNotMatch(calls[0].text, /O''Brien changed qty/);
  assert.ok(calls[0].values.includes("O'Brien changed qty"));
  assert.match(calls[0].text, /COMMIT/);

  const replay = await repository.findIdempotentReplay({
    idempotencyKey: "qty-adjust-OL-Q001",
    idempotencyPayload: { orderLineId: "OL-Q001", newQty: 120, reason: "O'Brien changed qty" },
  });
  assert.equal(replay.previousQty, 100);
  assert.equal(replay.newQty, 120);
  assert.equal(replay.operationLogId, "LOG-Q001");
  await assert.rejects(
    () =>
      repository.findIdempotentReplay({
        idempotencyKey: "qty-adjust-OL-Q001",
        idempotencyPayload: { orderLineId: "OL-Q001", newQty: 121, reason: "O'Brien changed qty" },
      }),
    (error) => error?.code === "IDEMPOTENCY_KEY_REUSED" && error?.statusCode === 409,
  );

  const directInput = {
    orderLine: buildOrderLine({ originalQty: 90 }),
    expectedOrderLineRevision: 1,
    fulfillmentRecords: [],
    priceSnapshots: [],
    inventoryReservations: [],
    inventoryAdjustments: [],
    inventoryLedgerEntries: [],
    statementLines: [],
    statementRecords: [],
    orderLineChangeRecord: buildChangeRecord(),
    operationLog: buildOperationLog(),
  };
  const directQuery = buildAdjustOrderLineQuantityTransactionQuery(directInput);
  const directSql = buildAdjustOrderLineQuantityTransactionSql(directInput);
  assert.equal(directQuery.text, directSql);
  assert.ok(directQuery.values.length > 15);
  assert.match(directSql, /SELECT NULL::json AS result WHERE false/);
  assert.match(directSql, /'orderLine'/);
}

function buildOrderLine(overrides = {}) {
  return {
    orderLineId: "OL-Q001",
    id: "OL-Q001",
    bizNo: "ORD-Q001-01",
    orderId: "ORD-Q001",
    customerId: "C001",
    productName: "空白袋",
    orderType: "现货",
    size: "30*38*10",
    bagColor: "白色",
    handleType: "普通提",
    style: "空白袋",
    printFlag: false,
    originalQty: 100,
    fulfillmentMethod: "自提",
    lineStatus: "待交付确认",
    exceptionTags: [],
    revision: 1,
    ...overrides,
  };
}

function buildFulfillment(overrides = {}) {
  return {
    fulfillmentId: "FUL-Q001",
    id: "FUL-Q001",
    bizNo: "FUL-Q001",
    orderLineId: "OL-Q001",
    customerId: "C001",
    method: "自提",
    expectedQty: 100,
    status: "待出库",
    confirmedBy: "U-OFFICE-A",
    revision: 1,
    ...overrides,
  };
}

function buildPriceSnapshot(overrides = {}) {
  return {
    priceSnapshotId: "PS-Q001-QTY-1",
    orderLineId: "OL-Q001",
    snapshotType: "quantity_adjustment",
    versionNo: 1,
    bagPrice: 2,
    printPrice: 0,
    otherFee: 0,
    adjustmentAmount: 0,
    chargeableQty: 100,
    finalAmount: 200,
    overrideReason: "订单改量 100 -> 80，按原订单单价重算",
    createdBy: "U-OFFICE-A",
    ...overrides,
  };
}

function buildReservation(overrides = {}) {
  return {
    reservationId: "RSV-Q001",
    id: "RSV-Q001",
    orderLineId: "OL-Q001",
    inventoryItemId: "INV-Q001",
    reservedQty: 100,
    reservationType: "待提货锁定",
    status: "生效",
    createdBy: "U-OFFICE-A",
    revision: 1,
    expectedRevision: 1,
    expectedReservedQty: 100,
    expectedStatus: "生效",
    ...overrides,
  };
}

function buildStatementLine(overrides = {}) {
  return {
    statementLineId: "SL-Q001",
    id: "SL-Q001",
    statementId: "ST-Q001",
    orderLineId: "OL-Q001",
    fulfillmentId: "FUL-Q001",
    deliveredQty: 100,
    chargeableQty: 100,
    freeQty: 0,
    amount: 200,
    adjustmentAmount: 0,
    finalAmount: 200,
    revision: 1,
    expectedRevision: 1,
    expectedDeliveredQty: 100,
    expectedChargeableQty: 100,
    expectedFinalAmount: 200,
    ...overrides,
  };
}

function buildStatementRecord(overrides = {}) {
  return {
    statementId: "ST-Q001",
    id: "ST-Q001",
    status: "待生成",
    receivable: 200,
    received: 50,
    variance: 150,
    revision: 1,
    ...overrides,
  };
}

function buildLedger(overrides = {}) {
  return {
    ledgerId: "LEDGER-Q001",
    inventoryItemId: "INV-Q001",
    changeType: "订单改量释放占用",
    qtyBefore: 100,
    qtyChange: -20,
    qtyAfter: 80,
    sourceType: "order_line_quantity_adjustment",
    sourceId: "OL-Q001",
    operatorId: "U-OFFICE-A",
    confirmedBy: "U-OFFICE-A",
    reason: "客户改量",
    remark: "订单改量 100 -> 80，释放占用 20",
    ...overrides,
  };
}

function buildChangeRecord(overrides = {}) {
  return {
    changeRecordId: "OLCR-Q001",
    orderLineId: "OL-Q001",
    changedFields: ["original_qty", "fulfillment_expected_qty", "inventory_reservation"],
    before: { originalQty: 100 },
    after: { originalQty: 80 },
    reason: "客户改量",
    documentReprintRequired: true,
    changedBy: "U-OFFICE-A",
    ...overrides,
  };
}

function buildOperationLog(overrides = {}) {
  return {
    id: "LOG-Q001",
    targetType: "order_line",
    targetId: "OL-Q001",
    action: "adjust_order_line_quantity",
    before: { originalQty: 100 },
    after: { originalQty: 80 },
    reason: "客户改量",
    operatorId: "U-OFFICE-A",
    pageKey: "api",
    ...overrides,
  };
}
