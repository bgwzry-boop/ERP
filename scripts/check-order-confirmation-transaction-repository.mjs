import assert from "node:assert/strict";
import {
  buildConfirmOrderTransactionQuery,
  buildConfirmOrderTransactionSql,
  createLocalOrderConfirmationTransactionRepository,
  createPostgresOrderConfirmationTransactionRepository,
} from "../server/orderConfirmationTransactionRepository.mjs";

await checkLocalOrderConfirmationTransactionRepository();
await checkLocalMultiOrderConfirmationTransaction();
await checkLocalTemporaryHoldConversion();
await checkLocalShortageCancellationApplication();
await checkPostgresOrderConfirmationTransactionSqlBoundary();

console.log(
  "Order confirmation transaction repository check passed: local workspace mutation and PostgreSQL order confirmation + inventory reservation SQL are covered.",
);

async function checkLocalOrderConfirmationTransactionRepository() {
  const repository = createLocalOrderConfirmationTransactionRepository();
  const workspace = {
    orderDrafts: [buildOrderDraft()],
    originalOrders: [],
    orderLines: [],
    fulfillments: [],
    inventories: [{ id: "INV-RED-3038", reserved: 1320 }],
    operationLogs: [],
  };
  const order = buildOrder();
  const orderDraft = buildOrderDraft({ status: "已生成正式订单" });
  const orderLines = buildOrderLines();
  const productionTasks = buildProductionTasks();
  const priceSnapshots = buildPriceSnapshots();
  const fulfillmentRecords = buildFulfillmentRecords();
  const inventoryReservations = buildInventoryReservations();
  const inventoryLedgerEntries = buildInventoryLedgerEntries();
  const todos = buildTodos();
  const operationLog = buildOperationLog();
  const commandResponse = { splitConfirmed: true, orderIds: [order.orderId] };

  const transaction = await repository.confirmOrder({
    idempotencyKey: "idem-order-confirm-001",
    workspace,
    orderDraft,
    expectedDraftRevision: 1,
    order,
    orderLines,
    productionTasks,
    priceSnapshots,
    fulfillmentRecords,
    inventoryReservations,
    inventoryLedgerEntries,
    todos,
    operationLog,
    commandResponse,
  });

  assert.equal(transaction.orderDraft.revision, 2);
  assert.equal(transaction.order.orderId, "ORD-CONFIRM-001");
  assert.equal(transaction.orderLines.length, 2);
  assert.equal(transaction.productionTasks.length, 1);
  assert.equal(transaction.priceSnapshots.length, 2);
  assert.equal(transaction.fulfillmentRecords.length, 1);
  assert.equal(transaction.inventoryReservations.length, 1);
  assert.equal(transaction.inventoryLedgerEntries.length, 1);
  assert.equal(transaction.todos.length, 1);
  assert.equal(transaction.operationLogId, "LOG-ORDER-CONFIRM-001");
  assert.deepEqual(transaction.commandResponse, commandResponse);
  assert.equal(workspace.originalOrders.length, 1);
  assert.equal(workspace.orderDrafts[0].status, "已生成正式订单");
  assert.equal(workspace.orderDrafts[0].revision, 2);
  assert.equal(workspace.orderLines.length, 2);
  assert.equal(workspace.productionTasks[0].productionTaskId, "PT-ORD-CONFIRM-001-02");
  assert.equal(workspace.orderLines[0].amount, 180);
  assert.equal(workspace.fulfillments.length, 1);
  assert.equal(workspace.inventoryReservations.length, 1);
  assert.equal(workspace.inventories[0].reserved, 1820);
  assert.equal(workspace.inventoryLedgers.length, 1);
  assert.equal(workspace.todos.length, 1);
  assert.equal(workspace.operationLogs.length, 1);

  const replay = await repository.findIdempotentReplay({
    idempotencyKey: "idem-order-confirm-001",
    idempotencyPayload: undefined,
  });
  assert.deepEqual(replay, transaction);
  const repeated = await repository.confirmOrder({
    idempotencyKey: "idem-order-confirm-001",
    workspace,
    orderDraft,
    expectedDraftRevision: 1,
    order,
    orderLines,
    productionTasks,
    priceSnapshots,
    fulfillmentRecords,
    inventoryReservations,
    inventoryLedgerEntries,
    todos,
    operationLog,
    commandResponse,
  });
  assert.deepEqual(repeated, transaction);
  assert.equal(workspace.originalOrders.length, 1, "local replay must not duplicate workspace projections");
  assert.throws(
    () => repository.findIdempotentReplay({
      idempotencyKey: "idem-order-confirm-001",
      idempotencyPayload: { changed: true },
    }),
    (error) => error.code === "IDEMPOTENCY_KEY_REUSED",
  );
}

async function checkLocalMultiOrderConfirmationTransaction() {
  const repository = createLocalOrderConfirmationTransactionRepository();
  const workspace = {
    orderDrafts: [buildOrderDraft()],
    originalOrders: [],
    orderLines: [],
    productionTasks: [],
    priceSnapshots: [],
    fulfillments: [],
    inventories: [],
    inventoryReservations: [],
    inventoryLedgers: [],
    todos: [],
    operationLogs: [],
  };
  const firstOrder = buildOrder();
  const secondOrder = {
    ...buildOrder(),
    orderId: "ORD-CONFIRM-002",
    bizNo: "ORD-CONFIRM-002",
  };
  const [firstLine, secondSourceLine] = buildOrderLines();
  const secondLine = {
    ...secondSourceLine,
    id: "ORD-CONFIRM-002-01",
    orderNo: "ORD-CONFIRM-002",
    fulfillment: "送货",
  };
  const transaction = await repository.confirmOrder({
    workspace,
    orderDraft: buildOrderDraft({ status: "已生成多个正式订单" }),
    expectedDraftRevision: 1,
    order: firstOrder,
    orders: [firstOrder, secondOrder],
    orderLines: [firstLine, secondLine],
    productionTasks: [],
    priceSnapshots: [],
    fulfillmentRecords: [],
    inventoryReservations: [],
    inventoryLedgerEntries: [],
    todos: [],
    operationLog: buildOperationLog(),
  });
  assert.deepEqual(transaction.orders.map((order) => order.orderId), ["ORD-CONFIRM-001", "ORD-CONFIRM-002"]);
  assert.equal(workspace.originalOrders.length, 2);
  assert.equal(workspace.orderLines.length, 2);
  assert.deepEqual(new Set(workspace.orderLines.map((line) => line.orderNo)), new Set(["ORD-CONFIRM-001", "ORD-CONFIRM-002"]));

  const query = buildConfirmOrderTransactionQuery({
    orderDraft: buildOrderDraft({ status: "已生成多个正式订单" }),
    expectedDraftRevision: 1,
    order: firstOrder,
    orders: [firstOrder, secondOrder],
    orderLines: [firstLine, secondLine],
    productionTasks: [],
    priceSnapshots: [],
    fulfillmentRecords: [],
    inventoryReservations: [],
    inventoryLedgerEntries: [],
    todos: [],
    operationLog: buildOperationLog(),
  });
  assert.match(query.text, /inserted_orders AS/);
  assert.match(query.text, /'orders'/);
  assert.ok(query.values.includes("ORD-CONFIRM-002"));
}

async function checkLocalTemporaryHoldConversion() {
  const repository = createLocalOrderConfirmationTransactionRepository();
  const intent = {
    id: "INT-HOLD-CONFIRM",
    sourceDraftId: "DRAFT-CONFIRM-001",
    sourceMessageId: "MSG-HOLD-CONFIRM",
    conversationId: "GROUP-001",
    customerId: "C001",
    intentType: "temporary_hold",
    intentStatus: "临时留货-生效",
    sourceText: "有的话给我留500个",
    candidate: {},
    relatedReservationId: "HOLD-CONFIRM-001",
    revision: 2,
    createdAt: "2026-07-02T09:00:00.000Z",
    updatedAt: "2026-07-02T09:00:00.000Z",
  };
  const activeHold = {
    id: "HOLD-CONFIRM-001",
    reservationId: "HOLD-CONFIRM-001",
    sourceIntentId: intent.id,
    customerId: "C001",
    sourceMessageId: intent.sourceMessageId,
    inventoryItemId: "INV-RED-3038",
    reservedQty: 500,
    qty: 500,
    reservationType: "临时留货",
    status: "生效",
    expiresAt: "2099-07-12T11:30:00.000Z",
    revision: 1,
    createdBy: "U-OFFICE-A",
  };
  const workspace = {
    orderDrafts: [buildOrderDraft()],
    originalOrders: [],
    orderLines: [],
    productionTasks: [],
    priceSnapshots: [],
    fulfillments: [],
    inventories: [{ id: "INV-RED-3038", reserved: 1320 }],
    inventoryIntents: [intent],
    inventoryReservations: [activeHold],
    inventoryLedgers: [],
    todos: [],
    operationLogs: [],
  };
  const convertedReservation = {
    ...activeHold,
    orderLineId: "ORD-CONFIRM-001-01",
    reservationType: "待提货锁定",
    expiresAt: "",
    inventoryDeltaQty: 0,
    convertFromTemporaryHold: true,
    metadata: { convertedFromTemporaryHold: true },
  };
  const transaction = await repository.confirmOrder({
    workspace,
    orderDraft: buildOrderDraft({ status: "已生成正式订单" }),
    expectedDraftRevision: 1,
    order: buildOrder(),
    orderLines: buildOrderLines(),
    productionTasks: buildProductionTasks(),
    priceSnapshots: buildPriceSnapshots(),
    fulfillmentRecords: buildFulfillmentRecords(),
    inventoryReservations: [convertedReservation],
    inventoryLedgerEntries: [{
      ...buildInventoryLedgerEntries()[0],
      ledgerId: "LEDGER-HOLD-CONVERT-001",
      changeType: "临时留货转订单占用",
      qtyChange: 0,
      qtyAfter: 1320,
    }],
    todos: buildTodos(),
    operationLog: buildOperationLog(),
  });

  assert.equal(transaction.inventoryReservations[0].reservationId, activeHold.id);
  assert.equal(transaction.inventoryIntents[0].intentStatus, "已转订单");
  assert.equal(workspace.inventories[0].reserved, 1320, "hold conversion must not reserve inventory twice");
  assert.equal(workspace.inventoryReservations[0].reservationType, "待提货锁定");
  assert.equal(workspace.inventoryIntents[0].relatedOrderLineId, "ORD-CONFIRM-001-01");

  const query = buildConfirmOrderTransactionQuery({
    orderDraft: buildOrderDraft({ status: "已生成正式订单" }),
    expectedDraftRevision: 1,
    order: buildOrder(),
    orderLines: buildOrderLines(),
    productionTasks: buildProductionTasks(),
    priceSnapshots: buildPriceSnapshots(),
    fulfillmentRecords: buildFulfillmentRecords(),
    inventoryReservations: [convertedReservation],
    inventoryLedgerEntries: [],
    todos: buildTodos(),
    operationLog: buildOperationLog(),
  });
  assert.match(query.text, /locked_temporary_holds/);
  assert.match(query.text, /ERP_TEMPORARY_HOLD_CONVERSION_CONFLICT/);
  assert.match(query.text, /intent_status = '已转订单'/);
  assert.ok(query.values.includes(0), "conversion must persist a zero inventory delta");
}

async function checkPostgresOrderConfirmationTransactionSqlBoundary() {
  const calls = [];
  const order = buildOrder({ sourceText: "O'Brien 30*38 红色 500个" });
  const orderDraft = buildOrderDraft({ sourceText: "O'Brien 30*38 红色 500个", status: "已生成正式订单" });
  const orderLines = buildOrderLines();
  const productionTasks = buildProductionTasks();
  const priceSnapshots = buildPriceSnapshots();
  const fulfillmentRecords = buildFulfillmentRecords();
  const inventoryReservations = buildInventoryReservations();
  const inventoryLedgerEntries = buildInventoryLedgerEntries();
  const todos = buildTodos();
  const operationLog = buildOperationLog();
  const repository = createPostgresOrderConfirmationTransactionRepository({
    postgresClient: {
      async idempotentTransactionJson(request) {
        calls.push(request);
        return {
          orderDraft: { ...orderDraft, revision: 2, clientRevision: 2 },
          order,
          orderLines,
          productionTasks,
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
  const workspace = { orderDrafts: [buildOrderDraft()], originalOrders: [], orderLines: [], fulfillments: [], operationLogs: [] };

  const transaction = await repository.confirmOrder({
    idempotencyKey: "idem-order-confirm-001",
    workspace,
    orderDraft,
    expectedDraftRevision: 1,
    order,
    orderLines,
    productionTasks,
    priceSnapshots,
    fulfillmentRecords,
    inventoryReservations,
    inventoryLedgerEntries,
    todos,
    operationLog,
  });

  assert.equal(transaction.orderDraft.revision, 2);
  assert.equal(transaction.orderLines[0].orderId, "ORD-CONFIRM-001");
  assert.equal(workspace.orderDrafts[0].revision, 2);
  assert.equal(workspace.orderLines.length, 2);
  assert.equal(workspace.productionTasks.length, 1);
  assert.equal(workspace.fulfillments.length, 1);

  const { text, values } = calls[0];
  const sql = text;
  assert.equal(calls[0].scope, "order.confirm");
  assert.equal(calls[0].idempotencyKey, "idem-order-confirm-001");
  assert.ok(calls[0].resourceLocks.includes("order-draft:DRAFT-CONFIRM-001"));
  assert.ok(calls[0].resourceLocks.includes("order:ORD-CONFIRM-001"));
  assert.ok(calls[0].resourceLocks.includes("inventory:INV-RED-3038"));
  assert.match(sql, /^BEGIN;/);
  assert.match(sql, /FROM order_drafts[\s\S]*FOR UPDATE/);
  assert.match(sql, /ERP_ORDER_DRAFT_CONCURRENCY_CONFLICT/);
  assert.match(sql, /ERP_ORDER_CONFIRMATION_ID_CONCURRENCY_CONFLICT/);
  assert.match(sql, /business_id_write_guard/);
  assert.match(sql, /ON CONFLICT \(id\) DO NOTHING/);
  assert.match(sql, /UPDATE order_drafts AS draft/);
  assert.match(sql, /DELETE FROM order_draft_lines/);
  assert.match(sql, /INSERT INTO order_draft_lines/);
  assert.match(sql, /INSERT INTO original_orders/);
  assert.match(sql, /INSERT INTO order_lines/);
  assert.match(sql, /INSERT INTO production_tasks/);
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
    orderDraft,
    expectedDraftRevision: 1,
    order,
    orderLines,
    productionTasks,
    priceSnapshots,
    fulfillmentRecords,
    inventoryReservations,
    inventoryLedgerEntries,
    todos,
    operationLog,
  });
  assert.match(directSql, /'orderDraft'/);
  assert.match(directSql, /'orderLines'/);
  assert.match(directSql, /'productionTasks'/);
  assert.match(directSql, /'priceSnapshots'/);
  assert.match(directSql, /'fulfillmentRecords'/);
  assert.match(directSql, /'inventoryReservations'/);
  assert.match(directSql, /'inventoryLedgerEntries'/);
  assert.match(directSql, /'todos'/);

  const directQuery = buildConfirmOrderTransactionQuery({
    orderDraft,
    expectedDraftRevision: 1,
    order,
    orderLines,
    productionTasks,
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

async function checkLocalShortageCancellationApplication() {
  const repository = createLocalOrderConfirmationTransactionRepository();
  const currentIntent = buildShortageCancellationIntent();
  const workspace = {
    orderDrafts: [buildOrderDraft()],
    originalOrders: [],
    orderLines: [],
    productionTasks: [],
    priceSnapshots: [],
    fulfillments: [],
    inventories: [{ id: "INV-RED-3038", reserved: 1320 }],
    inventoryIntents: [currentIntent],
    inventoryReservations: [],
    inventoryLedgers: [],
    todos: [],
    operationLogs: [],
  };
  const appliedIntent = {
    ...currentIntent,
    intentStatus: "库存不足取消-已应用",
    candidate: {
      ...currentIntent.candidate,
      appliedDraftLineIds: ["DRAFT-CONFIRM-001-02"],
      continuedDraftLineIds: ["DRAFT-CONFIRM-001-01"],
      generatedOrderId: "ORD-CONFIRM-001",
    },
    revision: 2,
  };
  const activeLine = buildOrderLines()[0];
  const transaction = await repository.confirmOrder({
    workspace,
    orderDraft: buildOrderDraft({ status: "已生成正式订单（部分缺货取消）" }),
    expectedDraftRevision: 1,
    order: buildOrder(),
    orderLines: [activeLine],
    productionTasks: [],
    priceSnapshots: [buildPriceSnapshots()[0]],
    fulfillmentRecords: buildFulfillmentRecords(),
    inventoryReservations: buildInventoryReservations(),
    shortageCancellationIntents: [appliedIntent],
    inventoryLedgerEntries: buildInventoryLedgerEntries(),
    todos: [],
    operationLog: buildOperationLog(),
  });
  assert.equal(transaction.orderLines.length, 1);
  assert.equal(transaction.inventoryIntents[0].intentStatus, "库存不足取消-已应用");
  assert.deepEqual(transaction.inventoryIntents[0].candidate.appliedDraftLineIds, ["DRAFT-CONFIRM-001-02"]);
  assert.equal(workspace.orderLines.some((line) => line.id === "ORD-CONFIRM-001-02"), false);
  assert.equal(workspace.fulfillments.length, 1);

  const query = buildConfirmOrderTransactionQuery({
    orderDraft: buildOrderDraft({ status: "已生成正式订单（部分缺货取消）" }),
    expectedDraftRevision: 1,
    order: buildOrder(),
    orderLines: [activeLine],
    productionTasks: [],
    priceSnapshots: [buildPriceSnapshots()[0]],
    fulfillmentRecords: buildFulfillmentRecords(),
    inventoryReservations: buildInventoryReservations(),
    shortageCancellationIntents: [appliedIntent],
    inventoryLedgerEntries: buildInventoryLedgerEntries(),
    todos: [],
    operationLog: buildOperationLog(),
  });
  assert.match(query.text, /updated_shortage_cancellation_intents/);
  assert.match(query.text, /intent_type = 'shortage_cancellation'/);
  assert.match(query.text, /intent_status = '库存不足取消-已应用'/);
  assert.ok(query.values.some((value) => String(value).includes("DRAFT-CONFIRM-001-02")));
}

function buildOrder(overrides = {}) {
  return {
    orderId: "ORD-CONFIRM-001",
    bizNo: "ORD-CONFIRM-001",
    sourceDraftId: "DRAFT-CONFIRM-001",
    customerId: "C001",
    customerSnapshot: { name: "张三服饰" },
    sourceText: overrides.sourceText ?? "张三服饰 30*38 红色 500个",
    summaryStatus: "处理中",
    createdBy: "U-OFFICE-A",
    createdAt: "2026-07-02T10:30:00.000Z",
  };
}

function buildOrderDraft(overrides = {}) {
  return {
    id: "DRAFT-CONFIRM-001",
    draftId: "DRAFT-CONFIRM-001",
    bizNo: "DRAFT-CONFIRM-001",
    sourceText: "张三服饰 30*38 红色 500个",
    sourceChannel: "manual",
    sourceMessageId: "MSG-CONFIRM-001",
    customerId: "C001",
    customerName: "张三服饰",
    status: "待审核",
    revision: 1,
    clientRevision: 1,
    createdBy: "U-OFFICE-A",
    createdAt: "2026-07-02T10:20:00.000Z",
    updatedAt: "2026-07-02T10:20:00.000Z",
    lines: [
      {
        id: "DRAFT-CONFIRM-001-01",
        customerId: "C001",
        customer: "张三服饰",
        product: "空白袋",
        size: "30*38*10",
        color: "红色",
        handle: "普通提",
        style: "空白袋",
        print: "否",
        qty: 500,
        fulfillment: "自提",
        latest: "待确认",
        inventory: "可用",
      },
      {
        id: "DRAFT-CONFIRM-001-02",
        customerId: "C001",
        customer: "张三服饰",
        product: "空白袋",
        size: "30*38*10",
        color: "黑色",
        handle: "普通提",
        style: "空白袋",
        print: "否",
        qty: 100,
        fulfillment: "自提",
        latest: "待确认",
        inventory: "缺货",
      },
    ],
    ...overrides,
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

function buildProductionTasks() {
  return [
    {
      productionTaskId: "PT-ORD-CONFIRM-001-02",
      orderLineId: "ORD-CONFIRM-001-02",
      taskType: "制袋",
      machineId: "BAG-01",
      plannedQty: 100,
      taskStatus: "待排产",
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

function buildShortageCancellationIntent() {
  return {
    id: "INT-SHORTAGE-CANCEL-CONFIRM",
    intentId: "INT-SHORTAGE-CANCEL-CONFIRM",
    sourceDraftId: "DRAFT-CONFIRM-001",
    sourceMessageId: "MSG-SHORTAGE-CANCEL-CONFIRM",
    conversationId: "GROUP-001",
    customerId: "C001",
    intentType: "shortage_cancellation",
    intentStatus: "库存不足取消-已关联草稿明细",
    sourceText: "黑色没货不要了，红色继续",
    candidate: {
      relatedDraftLineIds: ["DRAFT-CONFIRM-001-02"],
      requiresReview: false,
      targetBasis: "explicit_spec",
    },
    cancellationScope: "shortage_lines_only",
    revision: 1,
    createdBy: "U-OFFICE-A",
    createdAt: "2026-07-02T10:25:00.000Z",
    updatedAt: "2026-07-02T10:25:00.000Z",
  };
}
