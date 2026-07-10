import assert from "node:assert/strict";
import {
  buildVoidOrderLineTransactionQuery,
  buildVoidOrderLineTransactionSql,
  createLocalOrderLineVoidTransactionRepository,
  createPostgresOrderLineVoidTransactionRepository,
} from "../server/orderLineVoidTransactionRepository.mjs";

await checkLocalWorkspaceMutation();
await checkPostgresSqlBoundary();

console.log(
  "Order line void transaction repository check passed: local workspace mutation and PostgreSQL void + reservation release SQL are covered.",
);

async function checkLocalWorkspaceMutation() {
  const workspace = {
    orderLines: [
      {
        id: "OL-V001",
        orderNo: "ORD-V001",
        customerId: "C001",
        product: "空白袋",
        size: "30*38*10",
        color: "红色",
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
        id: "FUL-V001",
        lineId: "OL-V001",
        customerId: "C001",
        method: "自提",
        goods: "空白袋 30*38 红色",
        qty: 100,
        status: "待出库",
      },
    ],
    inventories: [{ id: "INV-V001", reserved: 100 }],
    inventoryReservations: [
      {
        id: "RSV-V001",
        reservationId: "RSV-V001",
        orderLineId: "OL-V001",
        inventoryItemId: "INV-V001",
        reservedQty: 100,
        reservationType: "待提货锁定",
        status: "生效",
      },
    ],
    inventoryLedgers: [],
    orderLineChangeRecords: [],
    operationLogs: [],
  };
  const repository = createLocalOrderLineVoidTransactionRepository();
  const transaction = await repository.voidOrderLine({
    workspace,
    orderLine: buildOrderLine({ lineStatus: "已关闭", status: "已关闭" }),
    fulfillmentRecords: [buildFulfillment({ status: "已取消" })],
    inventoryReservations: [buildReservation({ reservedQty: 0, status: "已释放" })],
    inventoryAdjustments: [{ inventoryItemId: "INV-V001", reservedQtyChange: -100 }],
    inventoryLedgerEntries: [buildLedger()],
    orderLineChangeRecord: buildChangeRecord(),
    operationLog: buildOperationLog(),
  });

  assert.equal(transaction.orderLine.lineStatus, "已关闭");
  assert.equal(transaction.fulfillmentRecords[0].status, "已取消");
  assert.equal(transaction.inventoryReservations[0].status, "已释放");
  assert.equal(transaction.inventoryLedgerEntries[0].sourceType, "order_line_void");
  assert.equal(workspace.orderLines[0].status, "已关闭");
  assert.equal(workspace.fulfillments[0].status, "已取消");
  assert.equal(workspace.inventoryReservations[0].reservedQty, 0);
  assert.equal(workspace.inventories[0].reserved, 0);
  assert.equal(workspace.inventoryLedgers[0].ledgerId, "LEDGER-V001");
  assert.equal(workspace.orderLineChangeRecords[0].changeRecordId, "OLCR-V001");
  assert.equal(workspace.operationLogs[0].id, "LOG-V001");
}

async function checkPostgresSqlBoundary() {
  const calls = [];
  const repository = createPostgresOrderLineVoidTransactionRepository({
    postgresClient: {
      transactionJson(text, values) {
        calls.push({ text, values });
        return {
          orderLine: buildOrderLine({ lineStatus: "已关闭", status: "已关闭", voidReason: "O'Brien cancelled" }),
          fulfillmentRecords: [buildFulfillment({ status: "已取消" })],
          inventoryReservations: [buildReservation({ reservedQty: 0, status: "已释放" })],
          inventoryLedgerEntries: [buildLedger({ reason: "O'Brien cancelled" })],
          orderLineChangeRecordId: "OLCR-V001",
          operationLogId: "LOG-V001",
        };
      },
    },
  });
  const transaction = await repository.voidOrderLine({
    workspace: {},
    orderLine: buildOrderLine({ lineStatus: "已关闭", status: "已关闭", voidReason: "O'Brien cancelled" }),
    fulfillmentRecords: [buildFulfillment({ status: "已取消" })],
    inventoryReservations: [buildReservation({ reservedQty: 0, status: "已释放" })],
    inventoryAdjustments: [{ inventoryItemId: "INV-V001", reservedQtyChange: -100 }],
    inventoryLedgerEntries: [buildLedger({ reason: "O'Brien cancelled" })],
    orderLineChangeRecord: buildChangeRecord({ reason: "O'Brien cancelled" }),
    operationLog: buildOperationLog({ reason: "O'Brien cancelled" }),
  });

  assert.equal(transaction.orderLine.lineStatus, "已关闭");
  assert.match(calls[0].text, /UPDATE order_lines/);
  assert.match(calls[0].text, /UPDATE fulfillment_records/);
  assert.match(calls[0].text, /UPDATE inventory_reservations/);
  assert.match(calls[0].text, /UPDATE inventory_items AS item/);
  assert.match(calls[0].text, /INSERT INTO inventory_ledger_entries/);
  assert.match(calls[0].text, /INSERT INTO order_line_change_records/);
  assert.match(calls[0].text, /INSERT INTO operation_logs/);
  assert.doesNotMatch(calls[0].text, /O''Brien cancelled/);
  assert.ok(calls[0].values.includes("O'Brien cancelled"));
  assert.match(calls[0].text, /COMMIT/);

  const directInput = {
    orderLine: buildOrderLine({ lineStatus: "已关闭", status: "已关闭" }),
    fulfillmentRecords: [],
    inventoryReservations: [],
    inventoryAdjustments: [],
    inventoryLedgerEntries: [],
    orderLineChangeRecord: buildChangeRecord(),
    operationLog: buildOperationLog(),
  };
  const directQuery = buildVoidOrderLineTransactionQuery(directInput);
  const directSql = buildVoidOrderLineTransactionSql(directInput);
  assert.equal(directQuery.text, directSql);
  assert.ok(directQuery.values.length > 15);
  assert.match(directSql, /SELECT NULL::json AS result WHERE false/);
  assert.match(directSql, /'orderLine'/);
}

function buildOrderLine(overrides = {}) {
  return {
    orderLineId: "OL-V001",
    id: "OL-V001",
    bizNo: "ORD-V001-01",
    orderId: "ORD-V001",
    customerId: "C001",
    productName: "空白袋",
    orderType: "现货",
    size: "30*38*10",
    bagColor: "红色",
    handleType: "普通提",
    style: "空白袋",
    printFlag: false,
    originalQty: 100,
    fulfillmentMethod: "自提",
    lineStatus: "待交付确认",
    exceptionTags: [],
    voidedBy: "U-OFFICE-A",
    voidReason: "客户取消订单",
    ...overrides,
  };
}

function buildFulfillment(overrides = {}) {
  return {
    fulfillmentId: "FUL-V001",
    id: "FUL-V001",
    bizNo: "FUL-V001",
    orderLineId: "OL-V001",
    customerId: "C001",
    method: "自提",
    expectedQty: 100,
    status: "待出库",
    confirmedBy: "U-OFFICE-A",
    ...overrides,
  };
}

function buildReservation(overrides = {}) {
  return {
    reservationId: "RSV-V001",
    id: "RSV-V001",
    orderLineId: "OL-V001",
    inventoryItemId: "INV-V001",
    reservedQty: 100,
    reservationType: "待提货锁定",
    status: "生效",
    createdBy: "U-OFFICE-A",
    ...overrides,
  };
}

function buildLedger(overrides = {}) {
  return {
    ledgerId: "LEDGER-V001",
    inventoryItemId: "INV-V001",
    changeType: "释放占用",
    qtyBefore: 100,
    qtyChange: -100,
    qtyAfter: 0,
    sourceType: "order_line_void",
    sourceId: "OL-V001",
    operatorId: "U-OFFICE-A",
    confirmedBy: "U-OFFICE-A",
    reason: "客户取消订单",
    remark: "订单作废释放占用 100",
    ...overrides,
  };
}

function buildChangeRecord(overrides = {}) {
  return {
    changeRecordId: "OLCR-V001",
    orderLineId: "OL-V001",
    changedFields: ["line_status", "void_reason", "inventory_reservation"],
    before: { lineStatus: "待交付确认" },
    after: { lineStatus: "已关闭" },
    reason: "客户取消订单",
    documentReprintRequired: true,
    changedBy: "U-OFFICE-A",
    ...overrides,
  };
}

function buildOperationLog(overrides = {}) {
  return {
    id: "LOG-V001",
    targetType: "order_line",
    targetId: "OL-V001",
    action: "void_order_line",
    before: { lineStatus: "待交付确认" },
    after: { lineStatus: "已关闭" },
    reason: "客户取消订单",
    operatorId: "U-OFFICE-A",
    pageKey: "api",
    ...overrides,
  };
}
