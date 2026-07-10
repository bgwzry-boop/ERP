import { createPostgresParameterBinder } from "./postgresSqlParameters.mjs";
import { createPostgresTransactionExecutor } from "./postgresTransactionExecutor.mjs";
import { buildPostgresIdempotencyRequest, resolveRepositoryIdempotencyKey } from "./idempotency.mjs";

export function createOrderConfirmationTransactionRepository(options = {}) {
  const mode =
    options.mode ??
    process.env.ERP_ORDER_CONFIRMATION_TRANSACTION_STORE ??
    process.env.ERP_ORDER_STORE ??
    "local";
  if (mode === "postgres") {
    return createPostgresOrderConfirmationTransactionRepository({
      databaseUrl: options.databaseUrl ?? process.env.ERP_ORDER_DATABASE_URL ?? process.env.DATABASE_URL ?? process.env.PGURL,
      queryJson: options.queryJson,
      transactionJson: options.transactionJson,
      idempotentTransactionJson: options.idempotentTransactionJson,
      postgresClient: options.postgresClient,
    });
  }
  if (mode === "local") return createLocalOrderConfirmationTransactionRepository();
  throw new Error(`Unsupported order confirmation transaction repository mode: ${mode}`);
}

export function createLocalOrderConfirmationTransactionRepository() {
  return {
    kind: "local_memory",

    confirmOrder(input) {
      const transaction = normalizeOrderConfirmationTransactionResult({
        order: input.order,
        orderLines: input.orderLines,
        priceSnapshots: input.priceSnapshots,
        fulfillmentRecords: input.fulfillmentRecords,
        inventoryReservations: input.inventoryReservations,
        inventoryLedgerEntries: input.inventoryLedgerEntries,
        todos: input.todos,
        operationLogId: input.operationLog?.id ?? "",
      });
      applyOrderConfirmationWorkspaceMutation({
        workspace: input.workspace,
        order: transaction.order,
        orderLines: transaction.orderLines,
        priceSnapshots: transaction.priceSnapshots,
        fulfillmentRecords: transaction.fulfillmentRecords,
        inventoryReservations: transaction.inventoryReservations,
        inventoryLedgerEntries: transaction.inventoryLedgerEntries,
        todos: transaction.todos,
        operationLog: input.operationLog,
      });
      return transaction;
    },
  };
}

export function createPostgresOrderConfirmationTransactionRepository(options = {}) {
  const { idempotentTransactionJson } = createPostgresTransactionExecutor(options);

  return {
    kind: "postgres",

    async confirmOrder(input) {
      const query = buildConfirmOrderTransactionQuery(input);
      const idempotencyRequest = buildPostgresIdempotencyRequest({
        scope: "order.confirm",
        idempotencyKey: resolveRepositoryIdempotencyKey(input.idempotencyKey, input.operationLog?.id),
        payload: input.idempotencyPayload ?? buildOrderConfirmationIdempotencyPayload(input),
        operatorId: input.operationLog?.operatorId,
        targetType: "original_order",
        targetId: input.order?.orderId ?? input.order?.id,
        resourceLocks: [
          `order-draft:${input.order?.sourceDraftId ?? ""}`,
          ...(input.inventoryReservations ?? []).map((item) => `inventory:${item.inventoryItemId ?? ""}`),
        ],
        query,
      });
      const saved = normalizeOrderConfirmationTransactionResult(await idempotentTransactionJson(idempotencyRequest));
      if (!saved.order || saved.orderLines.length === 0) {
        throw new Error("PostgreSQL order confirmation transaction returned an invalid result");
      }
      applyOrderConfirmationWorkspaceMutation({
        workspace: input.workspace,
        order: saved.order,
        orderLines: saved.orderLines,
        priceSnapshots: saved.priceSnapshots,
        fulfillmentRecords: saved.fulfillmentRecords,
        inventoryReservations: saved.inventoryReservations,
        inventoryLedgerEntries: saved.inventoryLedgerEntries,
        todos: saved.todos,
        operationLog: input.operationLog,
      });
      return saved;
    },
  };
}

function buildOrderConfirmationIdempotencyPayload(input = {}) {
  return {
    order: input.order,
    orderLines: input.orderLines,
    priceSnapshots: input.priceSnapshots,
    fulfillmentRecords: input.fulfillmentRecords,
    inventoryReservations: input.inventoryReservations,
    inventoryLedgerEntries: input.inventoryLedgerEntries,
    todos: input.todos,
  };
}

export function buildConfirmOrderTransactionSql(input) {
  return buildConfirmOrderTransactionQuery(input).text;
}

export function buildConfirmOrderTransactionQuery(input) {
  const parameters = createPostgresParameterBinder();
  return {
    text: buildConfirmOrderTransactionText(input, parameters),
    values: parameters.values,
  };
}

function buildConfirmOrderTransactionText(input, parameters) {
  const order = normalizeOriginalOrder(input.order);
  const orderLines = normalizeOrderLines(input.orderLines ?? [], order?.orderId);
  const priceSnapshots = normalizePriceSnapshots(input.priceSnapshots ?? [], orderLines);
  const fulfillmentRecords = normalizeFulfillmentRecords(input.fulfillmentRecords ?? []);
  const inventoryReservations = normalizeInventoryReservations(input.inventoryReservations ?? []);
  const inventoryLedgerEntries = normalizeInventoryLedgerEntries(input.inventoryLedgerEntries ?? []);
  const todos = normalizeTodos(input.todos ?? []);
  const operationLog = normalizeOperationLogForPersistence(input.operationLog);
  if (!order || orderLines.length === 0 || !operationLog) {
    throw new Error("Order, order lines, and operation log are required for order confirmation transaction");
  }
  return `
BEGIN;
WITH inventory_deltas AS MATERIALIZED (
  ${buildInventoryReservationDeltasSql(inventoryReservations, parameters)}
),
locked_inventory_items AS MATERIALIZED (
  SELECT item.id, item.on_hand_qty, item.reserved_qty, delta.reserved_qty AS requested_qty
  FROM inventory_items AS item
  JOIN inventory_deltas AS delta ON delta.inventory_item_id = item.id
  ORDER BY item.id
  FOR UPDATE OF item
),
inventory_write_guard AS MATERIALIZED (
  SELECT erp_require(
    (SELECT COUNT(*) FROM locked_inventory_items) = (SELECT COUNT(*) FROM inventory_deltas)
      AND NOT EXISTS (
        SELECT 1
        FROM locked_inventory_items
        WHERE on_hand_qty - reserved_qty < requested_qty
      ),
    'ERP_INVENTORY_CONCURRENCY_CONFLICT'
  ) AS ok
),
inserted_order AS (
  INSERT INTO original_orders (
    id,
    biz_no,
    source_draft_id,
    customer_id,
    customer_snapshot,
    source_text,
    summary_status,
    created_by,
    created_at,
    updated_at
  ) VALUES (
    ${parameters.text(order.orderId)},
    ${parameters.text(order.bizNo)},
    ${parameters.nullableText(order.sourceDraftId)},
    ${parameters.text(order.customerId)},
    ${parameters.json(order.customerSnapshot)},
    ${parameters.text(order.sourceText)},
    ${parameters.text(order.summaryStatus)},
    ${parameters.nullableText(order.createdBy)},
    ${parameters.timestamp(order.createdAt)},
    now()
  )
  ON CONFLICT (id) DO UPDATE SET
    biz_no = EXCLUDED.biz_no,
    customer_id = EXCLUDED.customer_id,
    customer_snapshot = EXCLUDED.customer_snapshot,
    source_text = EXCLUDED.source_text,
    summary_status = EXCLUDED.summary_status,
    updated_at = now()
  RETURNING ${orderJsonExpression("original_orders")} AS result
),
inserted_order_lines AS (
  ${buildInsertOrderLinesSql(orderLines, parameters)}
),
inserted_price_snapshots AS (
  ${buildInsertPriceSnapshotsSql(priceSnapshots, parameters)}
),
inserted_fulfillment_records AS (
  ${buildInsertFulfillmentRecordsSql(fulfillmentRecords, parameters)}
),
inserted_inventory_reservations AS (
  ${buildInsertInventoryReservationsSql(inventoryReservations, parameters)}
),
updated_inventory_items AS (
  ${buildUpdateInventoryItemsSql(inventoryReservations)}
),
inserted_inventory_ledger_entries AS (
  ${buildInsertInventoryLedgerEntriesSql(inventoryLedgerEntries, parameters)}
),
inserted_todos AS (
  ${buildInsertTodosSql(todos, parameters)}
),
inserted_operation_log AS (
  ${buildInsertOperationLogSql(operationLog, parameters)}
)
SELECT json_build_object(
  'order', (SELECT result FROM inserted_order),
  'orderLines', (SELECT COALESCE(json_agg(result ORDER BY result->>'orderLineId'), '[]'::json) FROM inserted_order_lines),
  'priceSnapshots', (SELECT COALESCE(json_agg(result ORDER BY result->>'orderLineId'), '[]'::json) FROM inserted_price_snapshots),
  'fulfillmentRecords', (SELECT COALESCE(json_agg(result ORDER BY result->>'fulfillmentId'), '[]'::json) FROM inserted_fulfillment_records),
  'inventoryReservations', (SELECT COALESCE(json_agg(result ORDER BY result->>'reservationId'), '[]'::json) FROM inserted_inventory_reservations),
  'inventoryLedgerEntries', (SELECT COALESCE(json_agg(result ORDER BY result->>'ledgerId'), '[]'::json) FROM inserted_inventory_ledger_entries),
  'todos', (SELECT COALESCE(json_agg(result ORDER BY result->>'id'), '[]'::json) FROM inserted_todos),
  'operationLogId', (SELECT id FROM inserted_operation_log),
  'writeGuard', (SELECT ok FROM inventory_write_guard)
) AS result;
COMMIT;
`.trim();
}

export function normalizeOrderConfirmationTransactionResult(value) {
  if (!value || typeof value !== "object") {
    return {
      order: null,
      orderLines: [],
      priceSnapshots: [],
      fulfillmentRecords: [],
      inventoryReservations: [],
      inventoryLedgerEntries: [],
      todos: [],
      operationLogId: "",
    };
  }
  const order = normalizeOriginalOrder(value.order);
  const orderLines = normalizeOrderLines(value.orderLines ?? value.order_lines ?? [], order?.orderId);
  return {
    order,
    orderLines,
    priceSnapshots: normalizePriceSnapshots(value.priceSnapshots ?? value.price_snapshots ?? [], orderLines),
    fulfillmentRecords: normalizeFulfillmentRecords(value.fulfillmentRecords ?? value.fulfillment_records ?? []),
    inventoryReservations: normalizeInventoryReservations(value.inventoryReservations ?? value.inventory_reservations ?? []),
    inventoryLedgerEntries: normalizeInventoryLedgerEntries(value.inventoryLedgerEntries ?? value.inventory_ledger_entries ?? []),
    todos: normalizeTodos(value.todos ?? []),
    operationLogId: String(value.operationLogId ?? value.operation_log_id ?? "").trim(),
  };
}

export function normalizeOriginalOrder(order) {
  if (!order || typeof order !== "object") return null;
  const orderId = String(order.orderId ?? order.id ?? "").trim();
  const customerId = String(order.customerId ?? order.customer_id ?? "").trim();
  if (!orderId || !customerId) return null;
  return {
    orderId,
    bizNo: String(order.bizNo ?? order.biz_no ?? orderId).trim() || orderId,
    sourceDraftId: String(order.sourceDraftId ?? order.source_draft_id ?? "").trim(),
    customerId,
    customerSnapshot: normalizeObject(order.customerSnapshot ?? order.customer_snapshot),
    sourceText: String(order.sourceText ?? order.source_text ?? "").trim(),
    summaryStatus: String(order.summaryStatus ?? order.summary_status ?? "处理中").trim() || "处理中",
    createdBy: String(order.createdBy ?? order.created_by ?? "").trim(),
    createdAt: String(order.createdAt ?? order.created_at ?? new Date().toISOString()).trim(),
  };
}

export function normalizeOrderLines(lines, fallbackOrderId = "") {
  if (!Array.isArray(lines)) return [];
  return lines.map((line) => normalizeOrderLine(line, fallbackOrderId)).filter(Boolean);
}

function normalizeOrderLine(line, fallbackOrderId = "") {
  if (!line || typeof line !== "object") return null;
  const orderLineId = String(line.orderLineId ?? line.id ?? "").trim();
  const orderId = String(line.orderId ?? line.order_id ?? line.orderNo ?? fallbackOrderId ?? "").trim();
  const customerId = String(line.customerId ?? line.customer_id ?? "").trim();
  if (!orderLineId || !orderId || !customerId) return null;
  return {
    orderLineId,
    bizNo: String(line.bizNo ?? line.biz_no ?? orderLineId).trim() || orderLineId,
    orderId,
    customerId,
    productName: String(line.productName ?? line.product_name ?? line.product ?? "空白袋").trim() || "空白袋",
    orderType: String(line.orderType ?? line.order_type ?? "stock").trim() || "stock",
    size: String(line.size ?? "待确认").trim() || "待确认",
    bagColor: String(line.bagColor ?? line.bag_color ?? line.color ?? "").trim(),
    handleType: String(line.handleType ?? line.handle_type ?? line.handle ?? "").trim(),
    style: String(line.style ?? "空白袋").trim() || "空白袋",
    printFlag: Boolean(line.printFlag ?? line.print_flag ?? line.print === "是"),
    printColor: String(line.printColor ?? line.print_color ?? "").trim(),
    printSide: String(line.printSide ?? line.print_side ?? "").trim(),
    handleColor: String(line.handleColor ?? line.handle_color ?? "").trim(),
    originalQty: toFiniteInteger(line.originalQty ?? line.original_qty ?? line.qty),
    latestNeededAt: String(line.latestNeededAt ?? line.latest_needed_at ?? line.latest ?? "").trim(),
    fulfillmentMethod: String(line.fulfillmentMethod ?? line.fulfillment_method ?? line.fulfillment ?? "待确认").trim() || "待确认",
    lineStatus: String(line.lineStatus ?? line.line_status ?? line.status ?? "待确认").trim() || "待确认",
    exceptionTags: Array.isArray(line.exceptionTags)
      ? line.exceptionTags
      : Array.isArray(line.exceptions)
        ? line.exceptions
        : Array.isArray(line.exception_tags)
          ? line.exception_tags
          : [],
    createdBy: String(line.createdBy ?? line.created_by ?? "").trim(),
    createdAt: String(line.createdAt ?? line.created_at ?? new Date().toISOString()).trim(),
    amount: toFiniteNumber(line.amount ?? 0),
    inventory: String(line.inventory ?? "").trim(),
    note: String(line.note ?? "").trim(),
  };
}

export function normalizePriceSnapshots(snapshots, orderLines = []) {
  if (!Array.isArray(snapshots)) return [];
  return snapshots.map((snapshot) => normalizePriceSnapshot(snapshot, orderLines)).filter(Boolean);
}

function normalizePriceSnapshot(snapshot, orderLines = []) {
  if (!snapshot || typeof snapshot !== "object") return null;
  const orderLineId = String(snapshot.orderLineId ?? snapshot.order_line_id ?? "").trim();
  if (!orderLineId) return null;
  const line = orderLines.find((item) => item.orderLineId === orderLineId);
  const priceSnapshotId = String(snapshot.priceSnapshotId ?? snapshot.id ?? `PS-${orderLineId}`).trim();
  return {
    priceSnapshotId,
    orderLineId,
    snapshotType: String(snapshot.snapshotType ?? snapshot.snapshot_type ?? "order_confirm").trim() || "order_confirm",
    versionNo: toFiniteInteger(snapshot.versionNo ?? snapshot.version_no ?? 1),
    bagPrice: toFiniteNumber(snapshot.bagPrice ?? snapshot.bag_price ?? 0),
    printPrice: toFiniteNumber(snapshot.printPrice ?? snapshot.print_price ?? 0),
    otherFee: toFiniteNumber(snapshot.otherFee ?? snapshot.other_fee ?? 0),
    adjustmentAmount: toFiniteNumber(snapshot.adjustmentAmount ?? snapshot.adjustment_amount ?? 0),
    chargeableQty: toFiniteInteger(snapshot.chargeableQty ?? snapshot.chargeable_qty ?? line?.originalQty ?? 0),
    finalAmount: toFiniteNumber(snapshot.finalAmount ?? snapshot.final_amount ?? snapshot.amount ?? 0),
    overrideReason: String(snapshot.overrideReason ?? snapshot.override_reason ?? "").trim(),
    createdBy: String(snapshot.createdBy ?? snapshot.created_by ?? line?.createdBy ?? "").trim(),
    createdAt: String(snapshot.createdAt ?? snapshot.created_at ?? new Date().toISOString()).trim(),
  };
}

export function normalizeFulfillmentRecords(records) {
  if (!Array.isArray(records)) return [];
  return records.map((record) => normalizeFulfillmentRecord(record)).filter(Boolean);
}

function normalizeFulfillmentRecord(record) {
  if (!record || typeof record !== "object") return null;
  const fulfillmentId = String(record.fulfillmentId ?? record.id ?? "").trim();
  const orderLineId = String(record.orderLineId ?? record.order_line_id ?? record.lineId ?? "").trim();
  const customerId = String(record.customerId ?? record.customer_id ?? "").trim();
  if (!fulfillmentId || !orderLineId || !customerId) return null;
  return {
    fulfillmentId,
    bizNo: String(record.bizNo ?? record.biz_no ?? fulfillmentId).trim() || fulfillmentId,
    orderLineId,
    customerId,
    customerSnapshot: normalizeObject(record.customerSnapshot ?? record.customer_snapshot),
    method: String(record.method ?? "待确认").trim() || "待确认",
    expectedQty: toFiniteInteger(record.expectedQty ?? record.expected_qty ?? record.qty),
    actualQty: record.actualQty ?? record.actual_qty,
    status: String(record.status ?? "待出库").trim() || "待出库",
    latestNeededAt: String(record.latestNeededAt ?? record.latest_needed_at ?? record.latest ?? "").trim(),
    createdBy: String(record.createdBy ?? record.created_by ?? "").trim(),
    createdAt: String(record.createdAt ?? record.created_at ?? new Date().toISOString()).trim(),
    goods: String(record.goods ?? "").trim(),
    packages: String(record.packages ?? "").trim(),
    zone: String(record.zone ?? "").trim(),
    source: String(record.source ?? "").trim(),
  };
}

export function normalizeInventoryReservations(records) {
  if (!Array.isArray(records)) return [];
  return records.map((record) => normalizeInventoryReservation(record)).filter(Boolean);
}

function normalizeInventoryReservation(record) {
  if (!record || typeof record !== "object") return null;
  const reservationId = String(record.reservationId ?? record.id ?? "").trim();
  const orderLineId = String(record.orderLineId ?? record.order_line_id ?? "").trim();
  const inventoryItemId = String(record.inventoryItemId ?? record.inventory_item_id ?? "").trim();
  if (!reservationId || !orderLineId || !inventoryItemId) return null;
  return {
    reservationId,
    orderLineId,
    inventoryItemId,
    reservedQty: toFiniteInteger(record.reservedQty ?? record.reserved_qty ?? record.qty),
    reservationType: String(record.reservationType ?? record.reservation_type ?? "出库占用").trim() || "出库占用",
    status: String(record.status ?? "生效").trim() || "生效",
    expiresAt: String(record.expiresAt ?? record.expires_at ?? "").trim(),
    createdBy: String(record.createdBy ?? record.created_by ?? "").trim(),
    createdAt: String(record.createdAt ?? record.created_at ?? new Date().toISOString()).trim(),
  };
}

export function normalizeInventoryLedgerEntries(records) {
  if (!Array.isArray(records)) return [];
  return records.map((record) => normalizeInventoryLedgerEntry(record)).filter(Boolean);
}

function normalizeInventoryLedgerEntry(record) {
  if (!record || typeof record !== "object") return null;
  const ledgerId = String(record.ledgerId ?? record.id ?? "").trim();
  const inventoryItemId = String(record.inventoryItemId ?? record.inventory_item_id ?? "").trim();
  if (!ledgerId || !inventoryItemId) return null;
  return {
    ledgerId,
    inventoryItemId,
    changeType: String(record.changeType ?? record.change_type ?? "订单占用").trim() || "订单占用",
    qtyBefore: toFiniteInteger(record.qtyBefore ?? record.qty_before ?? 0),
    qtyChange: toFiniteInteger(record.qtyChange ?? record.qty_change ?? record.reservedQty ?? 0),
    qtyAfter: toFiniteInteger(record.qtyAfter ?? record.qty_after ?? 0),
    sourceType: String(record.sourceType ?? record.source_type ?? "order_confirm").trim() || "order_confirm",
    sourceId: String(record.sourceId ?? record.source_id ?? "").trim(),
    operatorId: String(record.operatorId ?? record.operator_id ?? "").trim(),
    confirmedBy: String(record.confirmedBy ?? record.confirmed_by ?? "").trim(),
    occurredAt: String(record.occurredAt ?? record.occurred_at ?? new Date().toISOString()).trim(),
    createdAt: String(record.createdAt ?? record.created_at ?? new Date().toISOString()).trim(),
    reason: String(record.reason ?? "").trim(),
    remark: String(record.remark ?? "").trim(),
  };
}

export function normalizeTodos(records) {
  if (!Array.isArray(records)) return [];
  return records.map((record) => normalizeTodo(record)).filter(Boolean);
}

function normalizeTodo(record) {
  if (!record || typeof record !== "object") return null;
  const id = String(record.id ?? record.todoId ?? record.todo_id ?? "").trim();
  const type = String(record.type ?? "").trim();
  if (!id || !type) return null;
  const refId = String(record.refId ?? record.ref_id ?? record.ref ?? "").trim();
  return {
    id,
    bizNo: String(record.bizNo ?? record.biz_no ?? id).trim() || id,
    type,
    refType: String(record.refType ?? record.ref_type ?? inferTodoRefType(record)).trim() || "order_line",
    refId,
    priority: String(record.priority ?? mapTodoPriority(record.urgency) ?? "普通").trim() || "普通",
    status: String(record.status ?? (record.handled ? "已处理" : "未处理")).trim() || "未处理",
    summary: String(record.summary ?? "").trim(),
    dueAt: String(record.dueAt ?? record.due_at ?? record.latestNeededAt ?? record.latest ?? "").trim(),
    remindAt: String(record.remindAt ?? record.remind_at ?? "").trim(),
    handledBy: String(record.handledBy ?? record.handled_by ?? "").trim(),
    handledAt: String(record.handledAt ?? record.handled_at ?? "").trim(),
    handlingResult: String(record.handlingResult ?? record.handling_result ?? "").trim(),
    createdBy: String(record.createdBy ?? record.created_by ?? "").trim(),
    createdAt: String(record.createdAt ?? record.created_at ?? new Date().toISOString()).trim(),
    customerId: String(record.customerId ?? record.customer_id ?? "").trim(),
    ref: String(record.ref ?? refId).trim(),
    latest: String(record.latest ?? "").trim(),
    urgency: String(record.urgency ?? "").trim(),
    impact: String(record.impact ?? "").trim(),
    wait: String(record.wait ?? "刚刚").trim() || "刚刚",
    handled: Boolean(record.handled),
  };
}

function applyOrderConfirmationWorkspaceMutation({
  workspace,
  order,
  orderLines,
  priceSnapshots = [],
  fulfillmentRecords,
  inventoryReservations,
  inventoryLedgerEntries,
  todos,
  operationLog,
}) {
  workspace.originalOrders = workspace.originalOrders ?? [];
  if (order) {
    workspace.originalOrders = [order, ...workspace.originalOrders.filter((item) => item.orderId !== order.orderId)];
  }
  workspace.orderLines = [
    ...orderLines.map(toWorkspaceOrderLine),
    ...(workspace.orderLines ?? []).filter((item) => !orderLines.some((line) => line.orderLineId === item.id)),
  ];
  workspace.priceSnapshots = [
    ...priceSnapshots.map(toWorkspacePriceSnapshot),
    ...(workspace.priceSnapshots ?? []).filter(
      (item) => !priceSnapshots.some((snapshot) => snapshot.priceSnapshotId === item.id || snapshot.priceSnapshotId === item.priceSnapshotId),
    ),
  ];
  workspace.fulfillments = [
    ...fulfillmentRecords.map(toWorkspaceFulfillment),
    ...(workspace.fulfillments ?? []).filter(
      (item) => !fulfillmentRecords.some((record) => record.fulfillmentId === item.id),
    ),
  ];
  applyWorkspaceInventoryReservations(workspace, inventoryReservations);
  workspace.inventoryReservations = [
    ...inventoryReservations.map(toWorkspaceInventoryReservation),
    ...(workspace.inventoryReservations ?? []).filter(
      (item) => !inventoryReservations.some((record) => record.reservationId === item.id),
    ),
  ];
  workspace.inventoryLedgers = [
    ...inventoryLedgerEntries.map(toWorkspaceInventoryLedgerEntry),
    ...(workspace.inventoryLedgers ?? []).filter(
      (item) => !inventoryLedgerEntries.some((record) => record.ledgerId === item.id || record.ledgerId === item.ledgerId),
    ),
  ];
  workspace.todos = [
    ...todos.map(toWorkspaceTodo),
    ...(workspace.todos ?? []).filter((item) => !todos.some((todo) => todo.id === item.id)),
  ];
  if (operationLog) {
    workspace.operationLogs = workspace.operationLogs ?? [];
    workspace.operationLogs.unshift(operationLog);
  }
}

function toWorkspaceOrderLine(line) {
  return {
    id: line.orderLineId,
    orderNo: line.orderId,
    lineNo: line.orderLineId.split("-").at(-1) ?? "",
    customerId: line.customerId,
    product: line.productName,
    size: line.size,
    color: line.bagColor,
    handle: line.handleType,
    style: line.style,
    print: line.printFlag ? "是" : "否",
    qty: line.originalQty,
    orderType: line.orderType,
    status: line.lineStatus,
    fulfillment: line.fulfillmentMethod,
    latest: line.latestNeededAt || "待确认",
    amount: line.amount,
    exceptions: line.exceptionTags,
    inventory: line.inventory,
    printSide: line.printSide,
    printColor: line.printColor,
    note: line.note,
    handleColor: line.handleColor,
  };
}

function toWorkspacePriceSnapshot(snapshot) {
  return {
    id: snapshot.priceSnapshotId,
    priceSnapshotId: snapshot.priceSnapshotId,
    orderLineId: snapshot.orderLineId,
    snapshotType: snapshot.snapshotType,
    versionNo: snapshot.versionNo,
    bagPrice: snapshot.bagPrice,
    printPrice: snapshot.printPrice,
    otherFee: snapshot.otherFee,
    adjustmentAmount: snapshot.adjustmentAmount,
    chargeableQty: snapshot.chargeableQty,
    finalAmount: snapshot.finalAmount,
    amount: snapshot.finalAmount,
    overrideReason: snapshot.overrideReason,
    createdBy: snapshot.createdBy,
    createdAt: snapshot.createdAt,
  };
}

function toWorkspaceFulfillment(record) {
  return {
    id: record.fulfillmentId,
    method: record.method,
    customerId: record.customerId,
    lineId: record.orderLineId,
    goods: record.goods,
    qty: record.expectedQty,
    packages: record.packages,
    status: record.status,
    latest: record.latestNeededAt || "待确认",
    zone: record.zone,
    source: record.source || "正式订单占用",
    printed: record.status === "已交付",
  };
}

function applyWorkspaceInventoryReservations(workspace, inventoryReservations) {
  if (!Array.isArray(workspace.inventories) || inventoryReservations.length === 0) return;
  workspace.inventories = workspace.inventories.map((inventory) => {
    const reservedQty = inventoryReservations
      .filter((reservation) => reservation.inventoryItemId === inventory.id)
      .reduce((sum, reservation) => sum + Number(reservation.reservedQty ?? 0), 0);
    if (!reservedQty) return inventory;
    return { ...inventory, reserved: Number(inventory.reserved ?? 0) + reservedQty };
  });
}

function toWorkspaceInventoryReservation(record) {
  return {
    id: record.reservationId,
    reservationId: record.reservationId,
    orderLineId: record.orderLineId,
    inventoryItemId: record.inventoryItemId,
    qty: record.reservedQty,
    reservedQty: record.reservedQty,
    reservationType: record.reservationType,
    status: record.status,
    expiresAt: record.expiresAt,
    createdBy: record.createdBy,
    createdAt: record.createdAt,
  };
}

function toWorkspaceInventoryLedgerEntry(record) {
  return {
    id: record.ledgerId,
    ledgerId: record.ledgerId,
    inventoryItemId: record.inventoryItemId,
    changeType: record.changeType,
    qtyBefore: record.qtyBefore,
    qtyChange: record.qtyChange,
    qtyAfter: record.qtyAfter,
    sourceType: record.sourceType,
    sourceId: record.sourceId,
    operatorId: record.operatorId,
    confirmedBy: record.confirmedBy,
    occurredAt: record.occurredAt,
    createdAt: record.createdAt,
    reason: record.reason,
    remark: record.remark,
  };
}

function toWorkspaceTodo(todo) {
  return {
    id: todo.id,
    type: todo.type,
    customerId: todo.customerId,
    ref: todo.ref || todo.refId,
    summary: todo.summary,
    wait: todo.wait || "刚刚",
    latest: todo.latest,
    urgency: todo.urgency,
    impact: todo.impact,
    handled: todo.status === "已处理" || todo.handled,
    handledBy: todo.handledBy,
    handledAt: todo.handledAt,
    createdBy: todo.createdBy,
    createdAt: todo.createdAt,
  };
}

function buildInsertOrderLinesSql(orderLines, parameters) {
  const values = orderLines
    .map(
      (line) => `(
    ${parameters.text(line.orderLineId)},
    ${parameters.text(line.bizNo)},
    ${parameters.text(line.orderId)},
    ${parameters.text(line.customerId)},
    ${parameters.text(line.productName)},
    ${parameters.text(line.orderType)},
    ${parameters.text(line.size)},
    ${parameters.nullableText(line.bagColor)},
    ${parameters.nullableText(line.handleType)},
    ${parameters.text(line.style)},
    ${parameters.boolean(line.printFlag)},
    ${parameters.nullableText(line.printColor)},
    ${parameters.nullableText(line.printSide)},
    ${parameters.nullableText(line.handleColor)},
    ${parameters.integer(line.originalQty)},
    ${parameters.nullableTimestamp(line.latestNeededAt)},
    ${parameters.text(line.fulfillmentMethod)},
    ${parameters.text(line.lineStatus)},
    ${parameters.textArray(line.exceptionTags)},
    ${parameters.nullableText(line.createdBy)},
    ${parameters.timestamp(line.createdAt)},
    now()
  )`,
    )
    .join(",\n");
  return `INSERT INTO order_lines (
  id,
  biz_no,
  order_id,
  customer_id,
  product_name,
  order_type,
  size,
  bag_color,
  handle_type,
  style,
  print_flag,
  print_color,
  print_side,
  handle_color,
  original_qty,
  latest_needed_at,
  fulfillment_method,
  line_status,
  exception_tags,
  created_by,
  created_at,
  updated_at
) VALUES
${values}
ON CONFLICT (id) DO UPDATE SET
  order_id = EXCLUDED.order_id,
  customer_id = EXCLUDED.customer_id,
  product_name = EXCLUDED.product_name,
  order_type = EXCLUDED.order_type,
  size = EXCLUDED.size,
  bag_color = EXCLUDED.bag_color,
  handle_type = EXCLUDED.handle_type,
  style = EXCLUDED.style,
  print_flag = EXCLUDED.print_flag,
  print_color = EXCLUDED.print_color,
  print_side = EXCLUDED.print_side,
  handle_color = EXCLUDED.handle_color,
  original_qty = EXCLUDED.original_qty,
  latest_needed_at = EXCLUDED.latest_needed_at,
  fulfillment_method = EXCLUDED.fulfillment_method,
  line_status = EXCLUDED.line_status,
  exception_tags = EXCLUDED.exception_tags,
  updated_at = now()
RETURNING ${orderLineJsonExpression("order_lines")} AS result`;
}

function buildInsertPriceSnapshotsSql(priceSnapshots, parameters) {
  if (priceSnapshots.length === 0) return "SELECT NULL::json AS result WHERE false";
  const values = priceSnapshots
    .map(
      (snapshot) => `(
    ${parameters.text(snapshot.priceSnapshotId)},
    ${parameters.text(snapshot.orderLineId)},
    ${parameters.text(snapshot.snapshotType)},
    ${parameters.integer(snapshot.versionNo)},
    ${parameters.number(snapshot.bagPrice)},
    ${parameters.number(snapshot.printPrice)},
    ${parameters.number(snapshot.otherFee)},
    ${parameters.number(snapshot.adjustmentAmount)},
    ${parameters.integer(snapshot.chargeableQty)},
    ${parameters.number(snapshot.finalAmount)},
    ${parameters.nullableText(snapshot.overrideReason)},
    ${parameters.nullableText(snapshot.createdBy)},
    ${parameters.timestamp(snapshot.createdAt)}
  )`,
    )
    .join(",\n");
  return `INSERT INTO price_snapshots (
  id,
  order_line_id,
  snapshot_type,
  version_no,
  bag_price,
  print_price,
  other_fee,
  adjustment_amount,
  chargeable_qty,
  final_amount,
  override_reason,
  created_by,
  created_at
) VALUES
${values}
ON CONFLICT (id) DO UPDATE SET
  bag_price = EXCLUDED.bag_price,
  print_price = EXCLUDED.print_price,
  other_fee = EXCLUDED.other_fee,
  adjustment_amount = EXCLUDED.adjustment_amount,
  chargeable_qty = EXCLUDED.chargeable_qty,
  final_amount = EXCLUDED.final_amount,
  override_reason = EXCLUDED.override_reason
RETURNING ${priceSnapshotJsonExpression("price_snapshots")} AS result`;
}

function buildInsertFulfillmentRecordsSql(records, parameters) {
  if (records.length === 0) return "SELECT NULL::json AS result WHERE false";
  const values = records
    .map(
      (record) => `(
    ${parameters.text(record.fulfillmentId)},
    ${parameters.text(record.bizNo)},
    ${parameters.text(record.orderLineId)},
    ${parameters.text(record.customerId)},
    ${parameters.json(record.customerSnapshot)},
    ${parameters.text(record.method)},
    ${parameters.integer(record.expectedQty)},
    ${parameters.nullableInteger(record.actualQty)},
    ${parameters.text(record.status)},
    ${parameters.nullableTimestamp(record.latestNeededAt)},
    ${parameters.nullableText(record.createdBy)},
    ${parameters.timestamp(record.createdAt)},
    now()
  )`,
    )
    .join(",\n");
  return `INSERT INTO fulfillment_records (
  id,
  biz_no,
  order_line_id,
  customer_id,
  customer_snapshot,
  method,
  expected_qty,
  actual_qty,
  status,
  latest_needed_at,
  created_by,
  created_at,
  updated_at
) VALUES
${values}
ON CONFLICT (id) DO UPDATE SET
  order_line_id = EXCLUDED.order_line_id,
  customer_id = EXCLUDED.customer_id,
  customer_snapshot = EXCLUDED.customer_snapshot,
  method = EXCLUDED.method,
  expected_qty = EXCLUDED.expected_qty,
  actual_qty = EXCLUDED.actual_qty,
  status = EXCLUDED.status,
  latest_needed_at = EXCLUDED.latest_needed_at,
  updated_at = now()
RETURNING ${fulfillmentRecordJsonExpression("fulfillment_records")} AS result`;
}

function buildInsertInventoryReservationsSql(records, parameters) {
  if (records.length === 0) return "SELECT NULL::json AS result WHERE false";
  const values = records
    .map(
      (record) => `(
    ${parameters.text(record.reservationId)},
    ${parameters.text(record.orderLineId)},
    ${parameters.text(record.inventoryItemId)},
    ${parameters.integer(record.reservedQty)},
    ${parameters.text(record.reservationType)},
    ${parameters.text(record.status)},
    ${parameters.nullableTimestamp(record.expiresAt)},
    ${parameters.nullableText(record.createdBy)},
    ${parameters.timestamp(record.createdAt)},
    now()
  )`,
    )
    .join(",\n");
  return `INSERT INTO inventory_reservations (
  id,
  order_line_id,
  inventory_item_id,
  reserved_qty,
  reservation_type,
  status,
  expires_at,
  created_by,
  created_at,
  updated_at
) VALUES
${values}
ON CONFLICT (id) DO UPDATE SET
  order_line_id = EXCLUDED.order_line_id,
  inventory_item_id = EXCLUDED.inventory_item_id,
  reserved_qty = EXCLUDED.reserved_qty,
  reservation_type = EXCLUDED.reservation_type,
  status = EXCLUDED.status,
  expires_at = EXCLUDED.expires_at,
  updated_at = now()
RETURNING ${inventoryReservationJsonExpression("inventory_reservations")} AS result`;
}

function buildUpdateInventoryItemsSql(records) {
  if (records.length === 0) return "SELECT NULL::json AS result WHERE false";
  return `UPDATE inventory_items AS item
SET
  reserved_qty = item.reserved_qty + delta.reserved_qty,
  revision = item.revision + 1,
  updated_at = now()
FROM inventory_deltas AS delta, inventory_write_guard AS guard
WHERE item.id = delta.inventory_item_id AND guard.ok
RETURNING json_build_object(
  'inventoryItemId', item.id,
  'reservedQty', item.reserved_qty,
  'revision', item.revision
) AS result`;
}

function buildInventoryReservationDeltasSql(records, parameters) {
  if (records.length === 0) {
    return "SELECT NULL::text AS inventory_item_id, 0::integer AS reserved_qty WHERE false";
  }
  const values = records
    .map((record) => `(${parameters.text(record.inventoryItemId)}, ${parameters.integer(record.reservedQty)})`)
    .join(",\n");
  return `SELECT inventory_item_id, SUM(reserved_qty)::integer AS reserved_qty
FROM (VALUES
${values}
) AS raw(inventory_item_id, reserved_qty)
GROUP BY inventory_item_id`;
}

function buildInsertInventoryLedgerEntriesSql(records, parameters) {
  if (records.length === 0) return "SELECT NULL::json AS result WHERE false";
  const values = records
    .map(
      (record) => `(
    ${parameters.text(record.ledgerId)},
    ${parameters.text(record.inventoryItemId)},
    ${parameters.text(record.changeType)},
    ${parameters.integer(record.qtyBefore)},
    ${parameters.integer(record.qtyChange)},
    ${parameters.integer(record.qtyAfter)},
    ${parameters.text(record.sourceType)},
    ${parameters.text(record.sourceId)},
    ${parameters.nullableText(record.operatorId)},
    ${parameters.nullableText(record.confirmedBy)},
    ${parameters.timestamp(record.occurredAt)},
    ${parameters.timestamp(record.createdAt)},
    ${parameters.nullableText(record.reason)},
    ${parameters.nullableText(record.remark)}
  )`,
    )
    .join(",\n");
  return `INSERT INTO inventory_ledger_entries (
  id,
  inventory_item_id,
  change_type,
  qty_before,
  qty_change,
  qty_after,
  source_type,
  source_id,
  operator_id,
  confirmed_by,
  occurred_at,
  created_at,
  reason,
  remark
) VALUES
${values}
ON CONFLICT (id) DO UPDATE SET
  inventory_item_id = EXCLUDED.inventory_item_id,
  change_type = EXCLUDED.change_type,
  qty_before = EXCLUDED.qty_before,
  qty_change = EXCLUDED.qty_change,
  qty_after = EXCLUDED.qty_after,
  source_type = EXCLUDED.source_type,
  source_id = EXCLUDED.source_id,
  reason = EXCLUDED.reason,
  remark = EXCLUDED.remark
RETURNING ${inventoryLedgerJsonExpression("inventory_ledger_entries")} AS result`;
}

function buildInsertTodosSql(records, parameters) {
  if (records.length === 0) return "SELECT NULL::json AS result WHERE false";
  const values = records
    .map(
      (todo) => `(
    ${parameters.text(todo.id)},
    ${parameters.text(todo.bizNo)},
    ${parameters.text(todo.type)},
    ${parameters.text(todo.refType)},
    ${parameters.text(todo.refId)},
    ${parameters.text(todo.priority)},
    ${parameters.text(todo.status)},
    ${parameters.nullableText(todo.summary)},
    ${parameters.nullableTimestamp(todo.dueAt)},
    ${parameters.nullableTimestamp(todo.remindAt)},
    ${parameters.nullableText(todo.handledBy)},
    ${parameters.nullableTimestamp(todo.handledAt)},
    ${parameters.nullableText(todo.handlingResult)},
    ${parameters.nullableText(todo.createdBy)},
    ${parameters.timestamp(todo.createdAt)},
    now()
  )`,
    )
    .join(",\n");
  return `INSERT INTO todos (
  id,
  biz_no,
  type,
  ref_type,
  ref_id,
  priority,
  status,
  summary,
  due_at,
  remind_at,
  handled_by,
  handled_at,
  handling_result,
  created_by,
  created_at,
  updated_at
) VALUES
${values}
ON CONFLICT (id) DO UPDATE SET
  type = EXCLUDED.type,
  ref_type = EXCLUDED.ref_type,
  ref_id = EXCLUDED.ref_id,
  priority = EXCLUDED.priority,
  status = EXCLUDED.status,
  summary = EXCLUDED.summary,
  due_at = EXCLUDED.due_at,
  remind_at = EXCLUDED.remind_at,
  handled_by = EXCLUDED.handled_by,
  handled_at = EXCLUDED.handled_at,
  handling_result = EXCLUDED.handling_result,
  updated_at = now()
RETURNING ${todoJsonExpression("todos")} AS result`;
}

function buildInsertOperationLogSql(operationLog, parameters) {
  return `INSERT INTO operation_logs (
  id,
  target_type,
  target_id,
  action,
  before_json,
  after_json,
  reason,
  operator_id,
  page_key,
  occurred_at,
  created_at
) VALUES (
  ${parameters.text(operationLog.id)},
  ${parameters.text(operationLog.targetType)},
  ${parameters.text(operationLog.targetId)},
  ${parameters.text(operationLog.action)},
  ${parameters.json(operationLog.before)},
  ${parameters.json(operationLog.after)},
  ${parameters.text(operationLog.reason)},
  ${parameters.nullableText(operationLog.operatorId)},
  ${parameters.text(operationLog.pageKey)},
  ${parameters.timestamp(operationLog.occurredAt)},
  ${parameters.timestamp(operationLog.createdAt)}
)
ON CONFLICT (id) DO UPDATE SET
  target_type = EXCLUDED.target_type,
  target_id = EXCLUDED.target_id,
  action = EXCLUDED.action,
  before_json = EXCLUDED.before_json,
  after_json = EXCLUDED.after_json,
  reason = EXCLUDED.reason,
  operator_id = EXCLUDED.operator_id,
  page_key = EXCLUDED.page_key
RETURNING id`;
}

function normalizeOperationLogForPersistence(operationLog) {
  if (!operationLog || typeof operationLog !== "object") return null;
  const id = String(operationLog.id ?? "").trim();
  if (!id) return null;
  return {
    id,
    targetType: String(operationLog.targetType ?? operationLog.target_type ?? "").trim(),
    targetId: String(operationLog.targetId ?? operationLog.target_id ?? "").trim(),
    action: String(operationLog.action ?? "").trim(),
    before: operationLog.before ?? null,
    after: operationLog.after ?? null,
    reason: String(operationLog.reason ?? "").trim(),
    operatorId: String(operationLog.operatorId ?? operationLog.operator_id ?? "").trim(),
    pageKey: String(operationLog.pageKey ?? operationLog.page_key ?? "api").trim() || "api",
    occurredAt: operationLog.occurredAt ?? new Date().toISOString(),
    createdAt: operationLog.createdAt ?? new Date().toISOString(),
  };
}

function orderJsonExpression(alias) {
  return `json_build_object(
    'orderId', ${alias}.id,
    'bizNo', ${alias}.biz_no,
    'sourceDraftId', ${alias}.source_draft_id,
    'customerId', ${alias}.customer_id,
    'customerSnapshot', ${alias}.customer_snapshot,
    'sourceText', ${alias}.source_text,
    'summaryStatus', ${alias}.summary_status,
    'createdBy', ${alias}.created_by,
    'createdAt', ${alias}.created_at
  )`;
}

function orderLineJsonExpression(alias) {
  return `json_build_object(
    'orderLineId', ${alias}.id,
    'bizNo', ${alias}.biz_no,
    'orderId', ${alias}.order_id,
    'customerId', ${alias}.customer_id,
    'productName', ${alias}.product_name,
    'orderType', ${alias}.order_type,
    'size', ${alias}.size,
    'bagColor', ${alias}.bag_color,
    'handleType', ${alias}.handle_type,
    'style', ${alias}.style,
    'printFlag', ${alias}.print_flag,
    'printColor', ${alias}.print_color,
    'printSide', ${alias}.print_side,
    'handleColor', ${alias}.handle_color,
    'originalQty', ${alias}.original_qty,
    'latestNeededAt', ${alias}.latest_needed_at,
    'fulfillmentMethod', ${alias}.fulfillment_method,
    'lineStatus', ${alias}.line_status,
    'exceptionTags', ${alias}.exception_tags,
    'createdBy', ${alias}.created_by,
    'createdAt', ${alias}.created_at
  )`;
}

function priceSnapshotJsonExpression(alias) {
  return `json_build_object(
    'priceSnapshotId', ${alias}.id,
    'orderLineId', ${alias}.order_line_id,
    'snapshotType', ${alias}.snapshot_type,
    'versionNo', ${alias}.version_no,
    'bagPrice', ${alias}.bag_price,
    'printPrice', ${alias}.print_price,
    'otherFee', ${alias}.other_fee,
    'adjustmentAmount', ${alias}.adjustment_amount,
    'chargeableQty', ${alias}.chargeable_qty,
    'finalAmount', ${alias}.final_amount,
    'overrideReason', ${alias}.override_reason,
    'createdBy', ${alias}.created_by,
    'createdAt', ${alias}.created_at
  )`;
}

function fulfillmentRecordJsonExpression(alias) {
  return `json_build_object(
    'fulfillmentId', ${alias}.id,
    'bizNo', ${alias}.biz_no,
    'orderLineId', ${alias}.order_line_id,
    'customerId', ${alias}.customer_id,
    'customerSnapshot', ${alias}.customer_snapshot,
    'method', ${alias}.method,
    'expectedQty', ${alias}.expected_qty,
    'actualQty', ${alias}.actual_qty,
    'status', ${alias}.status,
    'latestNeededAt', ${alias}.latest_needed_at,
    'createdBy', ${alias}.created_by,
    'createdAt', ${alias}.created_at
  )`;
}

function inventoryReservationJsonExpression(alias) {
  return `json_build_object(
    'reservationId', ${alias}.id,
    'orderLineId', ${alias}.order_line_id,
    'inventoryItemId', ${alias}.inventory_item_id,
    'reservedQty', ${alias}.reserved_qty,
    'reservationType', ${alias}.reservation_type,
    'status', ${alias}.status,
    'expiresAt', ${alias}.expires_at,
    'createdBy', ${alias}.created_by,
    'createdAt', ${alias}.created_at
  )`;
}

function inventoryLedgerJsonExpression(alias) {
  return `json_build_object(
    'ledgerId', ${alias}.id,
    'inventoryItemId', ${alias}.inventory_item_id,
    'changeType', ${alias}.change_type,
    'qtyBefore', ${alias}.qty_before,
    'qtyChange', ${alias}.qty_change,
    'qtyAfter', ${alias}.qty_after,
    'sourceType', ${alias}.source_type,
    'sourceId', ${alias}.source_id,
    'operatorId', ${alias}.operator_id,
    'confirmedBy', ${alias}.confirmed_by,
    'occurredAt', ${alias}.occurred_at,
    'createdAt', ${alias}.created_at,
    'reason', ${alias}.reason,
    'remark', ${alias}.remark
  )`;
}

function todoJsonExpression(alias) {
  return `json_build_object(
    'id', ${alias}.id,
    'bizNo', ${alias}.biz_no,
    'type', ${alias}.type,
    'refType', ${alias}.ref_type,
    'refId', ${alias}.ref_id,
    'priority', ${alias}.priority,
    'status', ${alias}.status,
    'summary', ${alias}.summary,
    'dueAt', ${alias}.due_at,
    'remindAt', ${alias}.remind_at,
    'handledBy', ${alias}.handled_by,
    'handledAt', ${alias}.handled_at,
    'handlingResult', ${alias}.handling_result,
    'createdBy', ${alias}.created_by,
    'createdAt', ${alias}.created_at
  )`;
}

function normalizeObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value;
}

function mapTodoPriority(value) {
  const map = {
    急: "urgent",
    今天: "urgent",
    异常: "exception",
    关注: "management_watch",
    普通: "normal",
  };
  return map[String(value ?? "").trim()] ?? String(value ?? "").trim() ?? "normal";
}

function inferTodoRefType(todo) {
  const ref = String(todo.ref ?? todo.refId ?? todo.ref_id ?? "").trim();
  if (ref.startsWith("ST-")) return "statement";
  if (ref.startsWith("DRAFT")) return "order_draft";
  if (ref.startsWith("F")) return "fulfillment";
  return "order_line";
}

function toFiniteInteger(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.trunc(number);
}

function toFiniteNumber(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return number;
}
