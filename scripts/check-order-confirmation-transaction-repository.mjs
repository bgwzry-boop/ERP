import assert from "node:assert/strict";
import {
  buildConfirmOrderTransactionQuery,
  buildConfirmOrderTransactionSql,
  createLocalOrderConfirmationTransactionRepository,
  createPostgresOrderConfirmationTransactionRepository,
} from "../server/orderConfirmationTransactionRepository.mjs";

await checkLocalOrderConfirmationTransactionRepository();
await checkPostgresOrderConfirmationTransactionSqlBoundary();

console.log(
  "Order confirmation transaction repository check passed: local workspace mutation and PostgreSQL order confirmation + inventory reservation SQL are covered.",
);

async function checkLocalOrderConfirmationTransactionRepository() {
  const repository = createLocalOrderConfirmationTransactionRepository();
  const workspace = {
    originalOrders: [],
    orderLines: [],
    fulfillments: [],
    inventories: [{ id: "INV-RED-3038", reserved: 1320 }],
    operationLogs: [],
  };
  const order = buildOrder();
  const orderLines = buildOrderLines();
  const priceSnapshots = buildPriceSnapshots();
  const fulfillmentRecords = buildFulfillmentRecords();
  const inventoryReservations = buildInventoryReservations();
  const inventoryLedgerEntries = buildInventoryLedgerEntries();
  const todos = buildTodos();
  const operationLog = buildOperationLog();

  const transaction = await repository.confirmOrder({
    workspace,
    order,
    orderLines,
    priceSnapshots,
    fulfillmentRecords,
    inventoryReservations,
    inventoryLedgerEntries,
    todos,
    operationLog,
  });

  assert.equal(transaction.order.orderId, "ORD-CONFIRM-001");
  assert.equal(transaction.orderLines.length, 2);
  assert.equal(transaction.priceSnapshots.length, 2);
  assert.equal(transaction.fulfillmentRecords.length, 1);
  assert.equal(transaction.inventoryReservations.length, 1);
  assert.equal(transaction.inventoryLedgerEntries.length, 1);
  assert.equal(transaction.todos.length, 1);
  assert.equal(transaction.operationLogId, "LOG-ORDER-CONFIRM-001");
  assert.equal(workspace.originalOrders.length, 1);
  assert.equal(workspace.orderLines.length, 2);
  assert.equal(workspace.orderLines[0].amount, 180);
  assert.equal(workspace.fulfillments.length, 1);
  assert.equal(workspace.inventoryReservations.length, 1);
  assert.equal(workspace.inventories[0].reserved, 1820);
  assert.equal(workspace.inventoryLedgers.length, 1);
  assert.equal(workspace.todos.length, 1);
  assert.equal(workspace.operationLogs.length, 1);
}

async function checkPostgresOrderConfirmationTransactionSqlBoundary() {
  const calls = [];
  const order = buildOrder({ sourceText: "O'Brien 30*38 红色 500个" });
  const orderLines = buildOrderLines();
  const priceSnapshots = buildPriceSnapshots();
  const fulfillmentRecords = buildFulfillmentRecords();
  const inventoryReservations = buildInventoryReservations();
  const inventoryLedgerEntries = buildInventoryLedgerEntries();
  const todos = buildTodos();
  const operationLog = buildOperationLog();
  const repository = createPostgresOrderConfirmationTransactionRepository({
    postgresClient: {
      async transactionJson(text, values) {
        calls.push({ text, values });
        return {
          order,
          orderLines,
          priceSnapshots,
          fulfillmentRecords,
          inventoryReservations,
          inventoryLedgerEntries,
          todos,
          operationLogId: operationLog.id,
        };
      },
    },
  });
  const workspace = { originalOrders: [], orderLines: [], fulfillments: [], operationLogs: [] };

  const transaction = await repository.confirmOrder({
    workspace,
    order,
    orderLines,
    priceSnapshots,
    fulfillmentRecords,
    inventoryReservations,
    inventoryLedgerEntries,
    todos,
    operationLog,
  });

  assert.equal(transaction.orderLines[0].orderId, "ORD-CONFIRM-001");
  assert.equal(workspace.orderLines.length, 2);
  assert.equal(workspace.fulfillments.length, 1);

  const { text, values } = calls[0];
  const sql = text;
  assert.match(sql, /^BEGIN;/);
  assert.match(sql, /INSERT INTO original_orders/);
  assert.match(sql, /INSERT INTO order_lines/);
  assert.match(sql, /INSERT INTO price_snapshots/);
  assert.match(sql, /INSERT INTO fulfillment_records/);
  assert.match(sql, /INSERT INTO inventory_reservations/);
  assert.match(sql, /UPDATE inventory_items AS item/);
  assert.match(sql, /INSERT INTO inventory_ledger_entries/);
  assert.match(sql, /INSERT INTO todos/);
  assert.match(sql, /INSERT INTO operation_logs/);
  assert.match(sql, /COMMIT;/);
  assert.match(sql, /\$1::text/);
  assert.match(sql, /\$\d+::jsonb/);
  assert.match(sql, /\$\d+::text\[\]/);
  assert.doesNotMatch(sql, /O''Brien|库存不足/);
  assert.ok(values.includes("O'Brien 30*38 红色 500个"));
  assert.ok(values.some((value) => Array.isArray(value) && value.includes("库存不足")));

  const directSql = buildConfirmOrderTransactionSql({
    order,
    orderLines,
    priceSnapshots,
    fulfillmentRecords,
    inventoryReservations,
    inventoryLedgerEntries,
    todos,
    operationLog,
  });
  assert.match(directSql, /'orderLines'/);
  assert.match(directSql, /'priceSnapshots'/);
  assert.match(directSql, /'fulfillmentRecords'/);
  assert.match(directSql, /'inventoryReservations'/);
  assert.match(directSql, /'inventoryLedgerEntries'/);
  assert.match(directSql, /'todos'/);

  const directQuery = buildConfirmOrderTransactionQuery({
    order,
    orderLines,
    priceSnapshots,
    fulfillmentRecords,
    inventoryReservations,
    inventoryLedgerEntries,
    todos,
    operationLog,
  });
  assert.equal(directQuery.text, directSql);
  assert.ok(directQuery.values.length > 80);
  assert.ok(directQuery.values.includes("O'Brien 30*38 红色 500个"));
}

function buildOrder(overrides = {}) {
  return {
    orderId: "ORD-CONFIRM-001",
    bizNo: "ORD-CONFIRM-001",
    sourceDraftId: "",
    customerId: "C001",
    customerSnapshot: { name: "张三服饰" },
    sourceText: overrides.sourceText ?? "张三服饰 30*38 红色 500个",
    summaryStatus: "处理中",
    createdBy: "U-OFFICE-A",
    createdAt: "2026-07-02T10:30:00.000Z",
  };
}

function buildOrderLines() {
  return [
    {
      id: "ORD-CONFIRM-001-01",
      orderNo: "ORD-CONFIRM-001",
      customerId: "C001",
      product: "空白袋",
      orderType: "现货有货",
      size: "30*38*10",
      color: "红色",
      handle: "普通提",
      style: "空白袋",
      print: "否",
      qty: 500,
      fulfillment: "自提",
      status: "待出库",
      amount: 180,
      inventory: "可用",
      exceptions: [],
      createdBy: "U-OFFICE-A",
    },
    {
      id: "ORD-CONFIRM-001-02",
      orderNo: "ORD-CONFIRM-001",
      customerId: "C001",
      product: "空白袋",
      orderType: "现货缺货",
      size: "30*38*10",
      color: "黑色",
      handle: "普通提",
      style: "空白袋",
      print: "否",
      qty: 100,
      fulfillment: "自提",
      status: "缺货待处理",
      amount: 36,
      inventory: "缺货",
      exceptions: ["库存不足"],
      createdBy: "U-OFFICE-A",
    },
  ];
}

function buildPriceSnapshots() {
  return [
    {
      orderLineId: "ORD-CONFIRM-001-01",
      bagPrice: 0.28,
      printPrice: 0,
      otherFee: 0,
      amount: 180,
      priceVersion: "P0-SYNTHETIC",
      chargeableQty: 500,
      createdBy: "U-OFFICE-A",
    },
    {
      orderLineId: "ORD-CONFIRM-001-02",
      bagPrice: 0.28,
      printPrice: 0,
      otherFee: 0,
      amount: 36,
      priceVersion: "P0-SYNTHETIC",
      chargeableQty: 100,
      createdBy: "U-OFFICE-A",
    },
  ];
}

function buildFulfillmentRecords() {
  return [
    {
      id: "F-CONFIRM-001",
      lineId: "ORD-CONFIRM-001-01",
      customerId: "C001",
      method: "自提",
      qty: 500,
      status: "待出库",
      latest: "待确认",
      goods: "30*38 红色空白袋",
      packages: "2包",
      zone: "按库存推荐",
      source: "正式订单占用",
      createdBy: "U-OFFICE-A",
    },
  ];
}

function buildInventoryReservations() {
  return [
    {
      reservationId: "RSV-ORD-CONFIRM-001-01",
      orderLineId: "ORD-CONFIRM-001-01",
      inventoryItemId: "INV-RED-3038",
      reservedQty: 500,
      reservationType: "待提货锁定",
      status: "生效",
      createdBy: "U-OFFICE-A",
    },
  ];
}

function buildInventoryLedgerEntries() {
  return [
    {
      ledgerId: "LEDGER-RSV-ORD-CONFIRM-001-01",
      inventoryItemId: "INV-RED-3038",
      changeType: "订单占用",
      qtyBefore: 1320,
      qtyChange: 500,
      qtyAfter: 1820,
      sourceType: "order_confirm",
      sourceId: "ORD-CONFIRM-001-01",
      operatorId: "U-OFFICE-A",
      confirmedBy: "U-OFFICE-A",
      reason: "订单确认占用库存",
      remark: "待提货锁定",
    },
  ];
}

function buildTodos() {
  return [
    {
      id: "T-ORDER-CONFIRM-001",
      type: "缺货待处理",
      customerId: "C001",
      ref: "ORD-CONFIRM-001",
      summary: "30*38*10 黑色 100 个缺货，需客户确认等待或改量",
      wait: "刚刚",
      latest: "今天",
      urgency: "异常",
      impact: "影响出库承诺",
      createdBy: "U-OFFICE-A",
    },
  ];
}

function buildOperationLog() {
  return {
    id: "LOG-ORDER-CONFIRM-001",
    targetType: "order_draft",
    targetId: "DRAFT-CONFIRM-001",
    action: "confirm_order_draft",
    before: null,
    after: { orderNo: "ORD-CONFIRM-001", lineCount: 2 },
    reason: "",
    operatorId: "U-OFFICE-A",
    pageKey: "api",
    occurredAt: "2026-07-02T10:30:00.000Z",
    createdAt: "2026-07-02T10:30:00.000Z",
  };
}
