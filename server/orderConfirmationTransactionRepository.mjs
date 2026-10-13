import { resolveStoreMode } from "./storeMode.mjs";
import { createPostgresParameterBinder } from "./postgresSqlParameters.mjs";
import { createPostgresTransactionExecutor } from "./postgresTransactionExecutor.mjs";
import {
  buildIdempotencyRequestHash,
  buildIdempotencyConflictError,
  buildPostgresIdempotencyRequest,
  readPostgresIdempotencyReplay,
  resolveRepositoryIdempotencyKey,
} from "./idempotency.mjs";
import { normalizeOrderDraft } from "./orderDraftRepository.mjs";
import { normalizeInventoryIntents } from "./inventoryIntentDomain.mjs";

export function createOrderConfirmationTransactionRepository(options = {}) {
  const mode = resolveStoreMode({
    explicitMode: options.mode,
    envKeys: ["ERP_ORDER_CONFIRMATION_TRANSACTION_STORE", "ERP_ORDER_STORE"],
    runtimeMode: options.runtimeMode,
    allowLocalFixture: options.allowLocalFixture,
  });
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
  const idempotencyResults = new Map();
  return {
    kind: "local_memory",

    findIdempotentReplay(input = {}) {
      return readLocalIdempotencyReplay(idempotencyResults, input);
    },

    confirmOrder(input) {
      const replay = readLocalIdempotencyReplay(idempotencyResults, input);
      if (replay) return replay;
      const expectedDraftRevision = toFiniteInteger(input.expectedDraftRevision);
      const currentDraft = (input.workspace?.orderDrafts ?? []).find((item) => item.id === input.orderDraft?.id);
      const currentRevision = toFiniteInteger(currentDraft?.revision ?? currentDraft?.clientRevision);
      if (!currentDraft || expectedDraftRevision < 1 || currentRevision !== expectedDraftRevision) {
        throw orderDraftConcurrencyError();
      }
      const orderDraft = buildCommittedOrderDraft(input.orderDraft, input.expectedDraftRevision);
      const inventoryReservations = normalizeInventoryReservations(input.inventoryReservations);
      const shortageCancellationIntents = normalizeInventoryIntents(input.shortageCancellationIntents);
      validateLocalTemporaryHoldConversions(input.workspace, inventoryReservations);
      const orders = normalizeOriginalOrders(input.orders ?? [input.order]);
      const transaction = normalizeOrderConfirmationTransactionResult({
        orderDraft,
        order: orders[0],
        orders,
        orderLines: input.orderLines,
        productionTasks: input.productionTasks,
        priceSnapshots: input.priceSnapshots,
        fulfillmentRecords: input.fulfillmentRecords,
        inventoryReservations,
        inventoryIntents: [
          ...buildLocalConvertedInventoryIntents(input.workspace, inventoryReservations),
          ...buildLocalAppliedShortageCancellationIntents(input.workspace, shortageCancellationIntents),
        ],
        inventoryLedgerEntries: input.inventoryLedgerEntries,
        todos: input.todos,
        operationLogId: input.operationLog?.id ?? "",
        commandResponse: input.commandResponse ?? null,
      });
      applyOrderConfirmationWorkspaceMutation({
        workspace: input.workspace,
        orderDraft: transaction.orderDraft,
        orders: transaction.orders,
        orderLines: transaction.orderLines,
        productionTasks: transaction.productionTasks,
        priceSnapshots: transaction.priceSnapshots,
        fulfillmentRecords: transaction.fulfillmentRecords,
        inventoryReservations: transaction.inventoryReservations,
        inventoryIntents: transaction.inventoryIntents,
        inventoryItems: transaction.inventoryItems,
        inventoryLedgerEntries: transaction.inventoryLedgerEntries,
        todos: transaction.todos,
        operationLog: input.operationLog,
      });
      saveLocalIdempotencyReplay(idempotencyResults, input, transaction);
      return transaction;
    },
  };
}

export function createPostgresOrderConfirmationTransactionRepository(options = {}) {
  const { queryJson, idempotentTransactionJson } = createPostgresTransactionExecutor(options);

  return {
    kind: "postgres",

    async findIdempotentReplay(input = {}) {
      const replay = await readPostgresIdempotencyReplay({
        queryJson,
        scope: "order.confirm",
        idempotencyKey: input.idempotencyKey,
        payload: input.idempotencyPayload,
      });
      return replay ? normalizeOrderConfirmationTransactionResult(replay) : null;
    },

    async confirmOrder(input) {
      const query = buildConfirmOrderTransactionQuery(input);
      const idempotencyRequest = buildPostgresIdempotencyRequest({
        scope: "order.confirm",
        idempotencyKey: resolveRepositoryIdempotencyKey(input.idempotencyKey, input.operationLog?.id),
        payload: input.idempotencyPayload ?? buildOrderConfirmationIdempotencyPayload(input),
        operatorId: input.operationLog?.operatorId,
        targetType: "original_order",
        targetId: input.orders?.[0]?.orderId ?? input.orders?.[0]?.id ?? input.order?.orderId ?? input.order?.id,
        resourceLocks: [
          ...(input.orders ?? [input.order]).map((item) => `order:${item?.orderId ?? item?.id ?? ""}`),
          `order-draft:${input.orderDraft?.id ?? input.order?.sourceDraftId ?? ""}`,
          ...(input.inventoryReservations ?? []).map((item) => `inventory:${item.inventoryItemId ?? ""}`),
          ...(input.shortageCancellationIntents ?? []).map((item) => `inventory-intent:${item.id ?? item.intentId ?? ""}`),
        ],
        query,
      });
      const saved = normalizeOrderConfirmationTransactionResult(await idempotentTransactionJson(idempotencyRequest));
      if (!saved.orderDraft || !saved.order || saved.orders.length === 0 || saved.orderLines.length === 0) {
        throw new Error("PostgreSQL order confirmation transaction returned an invalid result");
      }
      applyOrderConfirmationWorkspaceMutation({
        workspace: input.workspace,
        orderDraft: saved.orderDraft,
        orders: saved.orders,
        orderLines: saved.orderLines,
        productionTasks: saved.productionTasks,
        priceSnapshots: saved.priceSnapshots,
        fulfillmentRecords: saved.fulfillmentRecords,
        inventoryReservations: saved.inventoryReservations,
        inventoryIntents: saved.inventoryIntents,
        inventoryItems: saved.inventoryItems,
        inventoryLedgerEntries: saved.inventoryLedgerEntries,
        todos: saved.todos,
        operationLog: input.operationLog,
      });
      return saved;
    },
  };
}

function readLocalIdempotencyReplay(store, input = {}) {
  const key = resolveRepositoryIdempotencyKey(input.idempotencyKey, input.operationLog?.id);
  const existing = store.get(`order.confirm:${key}`);
  if (!existing) return null;
  if (existing.requestHash !== buildIdempotencyRequestHash(input.idempotencyPayload)) {
    throw buildIdempotencyConflictError();
  }
  return structuredClone(existing.result);
}

function saveLocalIdempotencyReplay(store, input, result) {
  const key = resolveRepositoryIdempotencyKey(input.idempotencyKey, input.operationLog?.id);
  store.set(`order.confirm:${key}`, {
    requestHash: buildIdempotencyRequestHash(input.idempotencyPayload),
    result: structuredClone(result),
  });
}

function buildOrderConfirmationIdempotencyPayload(input = {}) {
  return {
    orderDraft: input.orderDraft,
    expectedDraftRevision: input.expectedDraftRevision,
    order: input.order,
    orders: input.orders,
    orderLines: input.orderLines,
    productionTasks: input.productionTasks,
    priceSnapshots: input.priceSnapshots,
    fulfillmentRecords: input.fulfillmentRecords,
    inventoryReservations: input.inventoryReservations,
    shortageCancellationIntents: input.shortageCancellationIntents,
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
  const orderDraft = normalizeOrderDraft(input.orderDraft);
  const expectedDraftRevision = toFiniteInteger(input.expectedDraftRevision);
  const orders = normalizeOriginalOrders(input.orders ?? [input.order]);
  const order = orders[0] ?? null;
  const orderLines = normalizeOrderLines(input.orderLines ?? [], order?.orderId);
  const productionTasks = normalizeProductionTasks(input.productionTasks ?? [], orderLines);
  const priceSnapshots = normalizePriceSnapshots(input.priceSnapshots ?? [], orderLines);
  const fulfillmentRecords = normalizeFulfillmentRecords(input.fulfillmentRecords ?? []);
  const inventoryReservations = normalizeInventoryReservations(input.inventoryReservations ?? []);
  const inventoryIntentConversions = inventoryReservations.filter((reservation) => reservation.convertFromTemporaryHold);
  const shortageCancellationIntents = normalizeInventoryIntents(input.shortageCancellationIntents ?? []);
  const inventoryLedgerEntries = normalizeInventoryLedgerEntries(input.inventoryLedgerEntries ?? []);
  const todos = normalizeTodos(input.todos ?? []);
  const operationLog = normalizeOperationLogForPersistence(input.operationLog);
  if (!orderDraft || expectedDraftRevision < 1 || orders.length === 0 || orderLines.length === 0 || !operationLog) {
    throw new Error("Order draft, expected draft revision, orders, order lines, and operation log are required for order confirmation transaction");
  }
  if (orders.some((item) => item.sourceDraftId !== orderDraft.id)) {
    throw new Error("Every formal order source draft must match the confirmed order draft");
  }
  const orderIds = new Set(orders.map((item) => item.orderId));
  if (orderLines.some((line) => !orderIds.has(line.orderId))) {
    throw new Error("Every formal order line must belong to an order in the same confirmation transaction");
  }
  return `
BEGIN;
WITH locked_order_draft AS MATERIALIZED (
  SELECT id, revision
  FROM order_drafts
  WHERE id = ${parameters.text(orderDraft.id)}
  FOR UPDATE
),
order_draft_write_guard AS MATERIALIZED (
  SELECT erp_require(
    EXISTS (
      SELECT 1
      FROM locked_order_draft
      WHERE revision = ${parameters.integer(expectedDraftRevision)}
    ),
    'ERP_ORDER_DRAFT_CONCURRENCY_CONFLICT'
  ) AS ok
),
miniapp_artwork_write_guard AS MATERIALIZED (
  SELECT erp_require(
    NOT EXISTS (
      SELECT 1
      FROM order_intake_submissions AS submission
      JOIN miniapp_artwork_transfer_jobs AS artwork_job
        ON artwork_job.submission_id = submission.id
      WHERE submission.draft_id = ${parameters.text(orderDraft.id)}
        AND artwork_job.status <> 'succeeded'
    ),
    'ERP_MINIAPP_ARTWORK_NOT_READY'
  ) AS ok
),
updated_order_draft AS (
  UPDATE order_drafts AS draft
  SET source_text = ${parameters.text(orderDraft.sourceText)},
      source_channel = ${parameters.text(orderDraft.sourceChannel)},
      source_message_id = ${parameters.nullableText(orderDraft.sourceMessageId)},
      customer_id = ${parameters.nullableText(orderDraft.customerId)},
      status = ${parameters.text(orderDraft.status)},
      recognition_summary = draft.recognition_summary || ${parameters.json({
        customerName: orderDraft.customerName,
        generatedOrderNo: order.orderId,
        generatedOrderNos: orders.map((item) => item.orderId),
      })},
      revision = draft.revision + 1,
      updated_at = now()
  FROM order_draft_write_guard AS guard
  CROSS JOIN miniapp_artwork_write_guard AS artwork_guard
  WHERE draft.id = ${parameters.text(orderDraft.id)}
    AND guard.ok AND artwork_guard.ok
  RETURNING draft.id, ${orderDraftJsonExpression("draft")} AS result
),
deleted_order_draft_lines AS (
  DELETE FROM order_draft_lines
  WHERE order_draft_id = (SELECT id FROM updated_order_draft)
  RETURNING id
),
order_draft_line_replace_guard AS MATERIALIZED (
  SELECT COUNT(*) AS deleted_count
  FROM deleted_order_draft_lines
),
inserted_order_draft_lines AS (
  ${buildInsertOrderDraftLinesSql(orderDraft, parameters)}
),
inventory_deltas AS MATERIALIZED (
  ${buildInventoryReservationDeltasSql(inventoryReservations, parameters)}
),
temporary_hold_inputs AS MATERIALIZED (
  ${buildTemporaryHoldConversionsSql(inventoryIntentConversions, parameters)}
),
locked_temporary_holds AS MATERIALIZED (
  SELECT reservation.*
  FROM inventory_reservations AS reservation
  JOIN temporary_hold_inputs AS conversion ON conversion.reservation_id = reservation.id
  ORDER BY reservation.id
  FOR UPDATE OF reservation
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
  ) AS inventory_ok,
  erp_require(
    (SELECT COUNT(*) FROM locked_temporary_holds) = (SELECT COUNT(*) FROM temporary_hold_inputs)
      AND NOT EXISTS (
        SELECT 1
        FROM locked_temporary_holds AS reservation
        JOIN temporary_hold_inputs AS conversion ON conversion.reservation_id = reservation.id
        WHERE reservation.reservation_type <> '临时留货'
          OR reservation.status <> '生效'
          OR reservation.expires_at IS NULL
          OR reservation.expires_at <= now()
      ),
    'ERP_TEMPORARY_HOLD_CONVERSION_CONFLICT'
  ) AS hold_ok
),
inserted_orders AS (
  ${buildInsertOriginalOrdersSql(orders, parameters)}
),
inserted_order_lines AS (
  ${buildInsertOrderLinesSql(orderLines, parameters)}
),
inserted_production_tasks AS (
  ${buildInsertProductionTasksSql(productionTasks, parameters)}
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
updated_temporary_hold_intents AS (
  ${buildConvertInventoryIntentsSql(inventoryIntentConversions)}
),
updated_shortage_cancellation_intents AS (
  ${buildApplyShortageCancellationIntentsSql(shortageCancellationIntents, parameters)}
),
updated_inventory_intents AS (
  SELECT result FROM updated_temporary_hold_intents
  UNION ALL
  SELECT result FROM updated_shortage_cancellation_intents
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
),
business_id_write_guard AS MATERIALIZED (
  SELECT erp_require(
    (SELECT COUNT(*) FROM inserted_orders) = ${parameters.integer(orders.length)}
      AND (SELECT COUNT(*) FROM inserted_order_draft_lines) = ${parameters.integer(orderDraft.lines.length)}
      AND (SELECT COUNT(*) FROM inserted_order_lines) = ${parameters.integer(orderLines.length)}
      AND (SELECT COUNT(*) FROM inserted_production_tasks) = ${parameters.integer(productionTasks.length)}
      AND (SELECT COUNT(*) FROM inserted_price_snapshots) = ${parameters.integer(priceSnapshots.length)}
      AND (SELECT COUNT(*) FROM inserted_fulfillment_records) = ${parameters.integer(fulfillmentRecords.length)}
      AND (SELECT COUNT(*) FROM inserted_inventory_reservations) = ${parameters.integer(inventoryReservations.length)}
      AND (SELECT COUNT(*) FROM updated_inventory_intents) = ${parameters.integer(inventoryIntentConversions.length + shortageCancellationIntents.length)}
      AND (SELECT COUNT(*) FROM inserted_inventory_ledger_entries) = ${parameters.integer(inventoryLedgerEntries.length)}
      AND (SELECT COUNT(*) FROM inserted_todos) = ${parameters.integer(todos.length)}
      AND (SELECT COUNT(*) FROM inserted_operation_log) = 1,
    'ERP_ORDER_CONFIRMATION_ID_CONCURRENCY_CONFLICT'
  ) AS ok
)
SELECT json_build_object(
  'orderDraft', (SELECT result::jsonb || jsonb_build_object(
    'lines', (SELECT COALESCE(json_agg(result ORDER BY result->>'id'), '[]'::json) FROM inserted_order_draft_lines)
  ) FROM updated_order_draft),
  'order', (SELECT result FROM inserted_orders ORDER BY result->>'orderId' LIMIT 1),
  'orders', (SELECT COALESCE(json_agg(result ORDER BY result->>'orderId'), '[]'::json) FROM inserted_orders),
  'orderLines', (SELECT COALESCE(json_agg(result ORDER BY result->>'orderLineId'), '[]'::json) FROM inserted_order_lines),
  'productionTasks', (SELECT COALESCE(json_agg(result ORDER BY result->>'productionTaskId'), '[]'::json) FROM inserted_production_tasks),
  'priceSnapshots', (SELECT COALESCE(json_agg(result ORDER BY result->>'orderLineId'), '[]'::json) FROM inserted_price_snapshots),
  'fulfillmentRecords', (SELECT COALESCE(json_agg(result ORDER BY result->>'fulfillmentId'), '[]'::json) FROM inserted_fulfillment_records),
  'inventoryReservations', (SELECT COALESCE(json_agg(result ORDER BY result->>'reservationId'), '[]'::json) FROM inserted_inventory_reservations),
  'inventoryIntents', (SELECT COALESCE(json_agg(result ORDER BY result->>'intentId'), '[]'::json) FROM updated_inventory_intents),
  'inventoryItems', (SELECT COALESCE(json_agg(result ORDER BY result->>'inventoryItemId'), '[]'::json) FROM updated_inventory_items),
  'inventoryLedgerEntries', (SELECT COALESCE(json_agg(result ORDER BY result->>'ledgerId'), '[]'::json) FROM inserted_inventory_ledger_entries),
  'todos', (SELECT COALESCE(json_agg(result ORDER BY result->>'id'), '[]'::json) FROM inserted_todos),
  'operationLogId', (SELECT id FROM inserted_operation_log),
  'commandResponse', ${parameters.json(input.commandResponse ?? null)},
  'writeGuard', (SELECT inventory_ok AND hold_ok FROM inventory_write_guard),
  'draftWriteGuard', (SELECT ok FROM order_draft_write_guard),
  'miniappArtworkWriteGuard', (SELECT ok FROM miniapp_artwork_write_guard),
  'businessIdWriteGuard', (SELECT ok FROM business_id_write_guard)
) AS result;
COMMIT;
`.trim();
}

export function normalizeOrderConfirmationTransactionResult(value) {
  if (!value || typeof value !== "object") {
    return {
      orderDraft: null,
      order: null,
      orders: [],
      orderLines: [],
      productionTasks: [],
      priceSnapshots: [],
      fulfillmentRecords: [],
      inventoryReservations: [],
      inventoryIntents: [],
      inventoryItems: [],
      inventoryLedgerEntries: [],
      todos: [],
      operationLogId: "",
      commandResponse: null,
    };
  }
  const orders = normalizeOriginalOrders(value.orders ?? value.original_orders ?? [value.order]);
  const order = orders[0] ?? normalizeOriginalOrder(value.order);
  const orderLines = normalizeOrderLines(value.orderLines ?? value.order_lines ?? [], order?.orderId);
  return {
    orderDraft: normalizeOrderDraft(value.orderDraft ?? value.order_draft),
    order,
    orders: orders.length ? orders : order ? [order] : [],
    orderLines,
    productionTasks: normalizeProductionTasks(value.productionTasks ?? value.production_tasks ?? [], orderLines),
    priceSnapshots: normalizePriceSnapshots(value.priceSnapshots ?? value.price_snapshots ?? [], orderLines),
    fulfillmentRecords: normalizeFulfillmentRecords(value.fulfillmentRecords ?? value.fulfillment_records ?? []),
    inventoryReservations: normalizeInventoryReservations(value.inventoryReservations ?? value.inventory_reservations ?? []),
    inventoryIntents: normalizeInventoryIntents(value.inventoryIntents ?? value.inventory_intents ?? []),
    inventoryItems: normalizeInventoryItems(value.inventoryItems ?? value.inventory_items ?? []),
    inventoryLedgerEntries: normalizeInventoryLedgerEntries(value.inventoryLedgerEntries ?? value.inventory_ledger_entries ?? []),
    todos: normalizeTodos(value.todos ?? []),
    operationLogId: String(value.operationLogId ?? value.operation_log_id ?? "").trim(),
    commandResponse: value.commandResponse ?? value.command_response ?? null,
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

export function normalizeOriginalOrders(orders) {
  if (!Array.isArray(orders)) return [];
  return orders.map(normalizeOriginalOrder).filter(Boolean);
}

export function normalizeOrderLines(lines, fallbackOrderId = "") {
  if (!Array.isArray(lines)) return [];
  return lines.map((line) => normalizeOrderLine(line, fallbackOrderId)).filter(Boolean);
}

function normalizeProductionTasks(tasks, orderLines = []) {
  if (!Array.isArray(tasks)) return [];
  return tasks.map((task) => {
    if (!task || typeof task !== "object") return null;
    const productionTaskId = String(task.productionTaskId ?? task.id ?? "").trim();
    const orderLineId = String(task.orderLineId ?? task.order_line_id ?? task.lineId ?? "").trim();
    const orderLine = orderLines.find((line) => line.orderLineId === orderLineId);
    if (!productionTaskId || !orderLineId || !orderLine) return null;
    return {
      productionTaskId,
      bizNo: String(task.bizNo ?? task.biz_no ?? productionTaskId).trim() || productionTaskId,
      orderLineId,
      taskType: String(task.taskType ?? task.task_type ?? "制袋").trim() || "制袋",
      machineId: String(task.machineId ?? task.machine_id ?? "").trim(),
      plannedQty: toFiniteInteger(task.plannedQty ?? task.planned_qty ?? orderLine.originalQty),
      taskStatus: String(task.taskStatus ?? task.task_status ?? task.status ?? "待开始").trim() || "待开始",
      publishedScheduleId: String(task.publishedScheduleId ?? task.published_schedule_id ?? "").trim(),
      revision: Math.max(1, toFiniteInteger(task.revision ?? 1)),
      createdBy: String(task.createdBy ?? task.created_by ?? orderLine.createdBy ?? "").trim(),
      createdAt: String(task.createdAt ?? task.created_at ?? new Date().toISOString()).trim(),
    };
  }).filter(Boolean);
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
  const sourceIntentId = String(record.sourceIntentId ?? record.source_intent_id ?? "").trim();
  if (!reservationId || !orderLineId || !inventoryItemId) return null;
  return {
    reservationId,
    orderLineId,
    sourceIntentId,
    customerId: String(record.customerId ?? record.customer_id ?? "").trim(),
    sourceMessageId: String(record.sourceMessageId ?? record.source_message_id ?? "").trim(),
    inventoryItemId,
    reservedQty: toFiniteInteger(record.reservedQty ?? record.reserved_qty ?? record.qty),
    inventoryDeltaQty: toFiniteInteger(record.inventoryDeltaQty ?? record.inventory_delta_qty ?? record.reservedQty ?? record.reserved_qty ?? record.qty),
    reservationType: String(record.reservationType ?? record.reservation_type ?? "出库占用").trim() || "出库占用",
    status: String(record.status ?? "生效").trim() || "生效",
    expiresAt: String(record.expiresAt ?? record.expires_at ?? "").trim(),
    metadata: normalizeObject(record.metadata ?? record.metadata_json),
    convertFromTemporaryHold: Boolean(record.convertFromTemporaryHold ?? record.convert_from_temporary_hold),
    revision: Math.max(1, toFiniteInteger(record.revision ?? 1)),
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
  orderDraft,
  orders = [],
  orderLines,
  productionTasks = [],
  priceSnapshots = [],
  fulfillmentRecords,
  inventoryReservations,
  inventoryIntents = [],
  inventoryItems = [],
  inventoryLedgerEntries,
  todos,
  operationLog,
}) {
  if (orderDraft) {
    workspace.orderDrafts = [
      orderDraft,
      ...(workspace.orderDrafts ?? []).filter((item) => item.id !== orderDraft.id),
    ];
  }
  workspace.originalOrders = workspace.originalOrders ?? [];
  if (orders.length) {
    const savedOrderIds = new Set(orders.map((order) => order.orderId));
    workspace.originalOrders = [
      ...orders,
      ...workspace.originalOrders.filter((item) => !savedOrderIds.has(item.orderId)),
    ];
  }
  workspace.orderLines = [
    ...orderLines.map(toWorkspaceOrderLine),
    ...(workspace.orderLines ?? []).filter((item) => !orderLines.some((line) => line.orderLineId === item.id)),
  ];
  workspace.productionTasks = [
    ...productionTasks.map(toWorkspaceProductionTask),
    ...(workspace.productionTasks ?? []).filter(
      (item) => !productionTasks.some((task) => task.productionTaskId === (item.productionTaskId ?? item.id)),
    ),
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
  if (inventoryItems.length > 0) {
    applyWorkspaceInventoryItems(workspace, inventoryItems);
  } else {
    applyWorkspaceInventoryReservations(workspace, inventoryReservations);
  }
  workspace.inventoryReservations = [
    ...inventoryReservations.map(toWorkspaceInventoryReservation),
    ...(workspace.inventoryReservations ?? []).filter(
      (item) => !inventoryReservations.some((record) => record.reservationId === item.id),
    ),
  ];
  workspace.inventoryIntents = [
    ...inventoryIntents,
    ...(workspace.inventoryIntents ?? []).filter(
      (item) => !inventoryIntents.some((intent) => intent.id === item.id),
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

function toWorkspaceProductionTask(task) {
  return {
    id: task.productionTaskId,
    productionTaskId: task.productionTaskId,
    bizNo: task.bizNo,
    orderLineId: task.orderLineId,
    lineId: task.orderLineId,
    taskType: task.taskType,
    machineId: task.machineId,
    plannedQty: task.plannedQty,
    qty: task.plannedQty,
    taskStatus: task.taskStatus,
    status: task.taskStatus,
    publishedScheduleId: task.publishedScheduleId,
    revision: task.revision,
    createdBy: task.createdBy,
    createdAt: task.createdAt,
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
      .reduce((sum, reservation) => sum + Number(reservation.inventoryDeltaQty ?? reservation.reservedQty ?? 0), 0);
    if (!reservedQty) return inventory;
    return { ...inventory, reserved: Number(inventory.reserved ?? 0) + reservedQty };
  });
}

function validateLocalTemporaryHoldConversions(workspace, reservations) {
  for (const conversion of reservations.filter((reservation) => reservation.convertFromTemporaryHold)) {
    const existing = (workspace.inventoryReservations ?? []).find(
      (reservation) => (reservation.id ?? reservation.reservationId) === conversion.reservationId,
    );
    const intent = (workspace.inventoryIntents ?? []).find(
      (record) => (record.id ?? record.intentId) === conversion.sourceIntentId,
    );
    if (!existing || existing.reservationType !== "临时留货" || existing.status !== "生效"
      || existing.sourceIntentId !== conversion.sourceIntentId
      || existing.inventoryItemId !== conversion.inventoryItemId
      || Number(existing.reservedQty ?? existing.qty) !== conversion.reservedQty
      || (existing.expiresAt && Date.parse(existing.expiresAt) <= Date.now())
      || intent?.intentStatus !== "临时留货-生效") {
      const error = new Error("The temporary hold changed before order confirmation.");
      error.statusCode = 409;
      error.code = "TEMPORARY_HOLD_CONVERSION_CONFLICT";
      throw error;
    }
  }
}

function buildLocalConvertedInventoryIntents(workspace, reservations) {
  return reservations
    .filter((reservation) => reservation.convertFromTemporaryHold)
    .map((reservation) => {
      const intent = (workspace.inventoryIntents ?? []).find(
        (record) => (record.id ?? record.intentId) === reservation.sourceIntentId,
      );
      if (!intent) return null;
      return {
        ...intent,
        id: intent.id ?? intent.intentId,
        intentId: intent.id ?? intent.intentId,
        intentStatus: "已转订单",
        relatedOrderLineId: reservation.orderLineId,
        revision: Number(intent.revision ?? 1) + 1,
        updatedAt: new Date().toISOString(),
      };
    })
    .filter(Boolean);
}

function buildLocalAppliedShortageCancellationIntents(workspace, requestedIntents) {
  return requestedIntents.map((requested) => {
    const current = (workspace.inventoryIntents ?? []).find(
      (record) => (record.id ?? record.intentId) === requested.id,
    );
    if (!current
      || current.intentType !== "shortage_cancellation"
      || current.intentStatus === "库存不足取消-已应用"
      || Number(current.revision ?? 1) + 1 !== Number(requested.revision ?? 0)) {
      const error = new Error("The shortage cancellation changed before order confirmation.");
      error.statusCode = 409;
      error.code = "SHORTAGE_CANCELLATION_CONFLICT";
      throw error;
    }
    return {
      ...current,
      ...requested,
      id: current.id ?? current.intentId,
      intentId: current.id ?? current.intentId,
      intentStatus: "库存不足取消-已应用",
      revision: Number(current.revision ?? 1) + 1,
      updatedAt: requested.updatedAt ?? new Date().toISOString(),
    };
  });
}

function normalizeInventoryItems(records) {
  if (!Array.isArray(records)) return [];
  return records
    .map((record) => {
      const inventoryItemId = String(record?.inventoryItemId ?? record?.inventory_item_id ?? record?.id ?? "").trim();
      if (!inventoryItemId) return null;
      return {
        inventoryItemId,
        id: inventoryItemId,
        reservedQty: toFiniteInteger(record.reservedQty ?? record.reserved_qty),
        revision: Math.max(1, toFiniteInteger(record.revision)),
      };
    })
    .filter(Boolean);
}

function applyWorkspaceInventoryItems(workspace, inventoryItems) {
  if (!Array.isArray(workspace.inventories) || inventoryItems.length === 0) return;
  const byId = new Map(normalizeInventoryItems(inventoryItems).map((item) => [item.inventoryItemId, item]));
  workspace.inventories = workspace.inventories.map((inventory) => {
    const saved = byId.get(inventory.id ?? inventory.inventoryItemId);
    if (!saved) return inventory;
    return {
      ...inventory,
      reserved: saved.reservedQty,
      reservedQty: saved.reservedQty,
      revision: saved.revision,
    };
  });
}

function toWorkspaceInventoryReservation(record) {
  return {
    id: record.reservationId,
    reservationId: record.reservationId,
    orderLineId: record.orderLineId,
    sourceIntentId: record.sourceIntentId,
    customerId: record.customerId,
    sourceMessageId: record.sourceMessageId,
    inventoryItemId: record.inventoryItemId,
    qty: record.reservedQty,
    reservedQty: record.reservedQty,
    inventoryDeltaQty: record.inventoryDeltaQty,
    reservationType: record.reservationType,
    status: record.status,
    expiresAt: record.expiresAt,
    metadata: record.metadata,
    convertFromTemporaryHold: record.convertFromTemporaryHold,
    revision: record.revision,
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

function buildInsertOriginalOrdersSql(orders, parameters) {
  const values = orders.map((order) => `(
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
  )`).join(",\n");
  return `INSERT INTO original_orders (
    id, biz_no, source_draft_id, customer_id, customer_snapshot,
    source_text, summary_status, created_by, created_at, updated_at
  ) VALUES
${values}
  ON CONFLICT (id) DO NOTHING
  RETURNING ${orderJsonExpression("original_orders")} AS result`;
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
ON CONFLICT (id) DO NOTHING
RETURNING ${orderLineJsonExpression("order_lines")} AS result`;
}

function buildInsertProductionTasksSql(tasks, parameters) {
  if (tasks.length === 0) return "SELECT NULL::json AS result WHERE false";
  const values = tasks
    .map(
      (task) => `(
    ${parameters.text(task.productionTaskId)},
    ${parameters.text(task.bizNo)},
    ${parameters.text(task.orderLineId)},
    ${parameters.text(task.taskType)},
    ${parameters.nullableText(task.machineId)},
    ${parameters.integer(task.plannedQty)},
    ${parameters.text(task.taskStatus)},
    ${parameters.nullableText(task.publishedScheduleId)},
    ${parameters.integer(task.revision)},
    ${parameters.nullableText(task.createdBy)},
    ${parameters.timestamp(task.createdAt)},
    now()
  )`,
    )
    .join(",\n");
  return `INSERT INTO production_tasks (
  id,
  biz_no,
  order_line_id,
  task_type,
  machine_id,
  planned_qty,
  task_status,
  published_schedule_id,
  revision,
  created_by,
  created_at,
  updated_at
) SELECT task_values.*
FROM (VALUES
${values}
) AS task_values(
  id,
  biz_no,
  order_line_id,
  task_type,
  machine_id,
  planned_qty,
  task_status,
  published_schedule_id,
  revision,
  created_by,
  created_at,
  updated_at
)
CROSS JOIN (SELECT COUNT(*) AS inserted_count FROM inserted_order_lines) AS order_line_dependency
ON CONFLICT (id) DO NOTHING
RETURNING ${productionTaskJsonExpression("production_tasks")} AS result`;
}

function buildInsertOrderDraftLinesSql(orderDraft, parameters) {
  if (orderDraft.lines.length === 0) return "SELECT NULL::jsonb AS result WHERE false";
  const values = orderDraft.lines
    .map(
      (line, index) => `(
    ${parameters.text(line.id)},
    ${parameters.integer(index + 1)},
    ${parameters.nullableText(line.product)},
    ${parameters.nullableText(line.print === "是" ? "custom_print" : "stock")},
    ${parameters.nullableText(line.size)},
    ${parameters.nullableText(line.color)},
    ${parameters.nullableText(line.handle)},
    ${parameters.nullableText(line.style)},
    ${parameters.boolean(line.print === "是")},
    ${parameters.nullableText(line.printColor)},
    ${parameters.nullableText(line.printSide)},
    ${parameters.nullableText(line.handleColor)},
    ${parameters.nullableInteger(line.qty)},
    ${parameters.nullableText(line.fulfillment)},
    ${parameters.nullableTimestamp(normalizeOptionalTimestamp(line.latest))}::timestamptz,
    ${parameters.nullableText(line.note)},
    ${parameters.nullableText(line.confidence)},
    ${parameters.textArray(line.missingFields)},
    ${parameters.json(line)}
  )`,
    )
    .join(",\n");
  return `INSERT INTO order_draft_lines (
  id,
  order_draft_id,
  line_seq,
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
  qty,
  fulfillment_method,
  latest_needed_at,
  remark,
  confidence,
  missing_fields,
  evidence_json,
  created_at,
  updated_at
)
SELECT
  lines.id,
  draft.id,
  lines.line_seq,
  lines.product_name,
  lines.order_type,
  lines.size,
  lines.bag_color,
  lines.handle_type,
  lines.style,
  lines.print_flag,
  lines.print_color,
  lines.print_side,
  lines.handle_color,
  lines.qty,
  lines.fulfillment_method,
  lines.latest_needed_at,
  lines.remark,
  lines.confidence,
  lines.missing_fields,
  lines.evidence_json,
  now(),
  now()
FROM (VALUES
${values}
) AS lines(
  id, line_seq, product_name, order_type, size, bag_color, handle_type, style, print_flag,
  print_color, print_side, handle_color, qty, fulfillment_method, latest_needed_at, remark,
  confidence, missing_fields, evidence_json
)
CROSS JOIN (SELECT id FROM updated_order_draft) AS draft
CROSS JOIN order_draft_line_replace_guard AS replace_guard
ON CONFLICT (id) DO NOTHING
RETURNING evidence_json || jsonb_build_object('id', id, 'draftLineId', id) AS result`;
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
ON CONFLICT (id) DO NOTHING
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
ON CONFLICT (id) DO NOTHING
RETURNING ${fulfillmentRecordJsonExpression("fulfillment_records")} AS result`;
}

function buildInsertInventoryReservationsSql(records, parameters) {
  if (records.length === 0) return "SELECT NULL::json AS result WHERE false";
  const values = records
    .map(
      (record) => `(
    ${parameters.text(record.reservationId)},
    ${parameters.text(record.orderLineId)},
    ${parameters.nullableText(record.sourceIntentId)},
    ${parameters.nullableText(record.customerId)},
    ${parameters.nullableText(record.sourceMessageId)},
    ${parameters.text(record.inventoryItemId)},
    ${parameters.integer(record.reservedQty)},
    ${parameters.text(record.reservationType)},
    ${parameters.text(record.status)},
    ${parameters.nullableTimestamp(record.expiresAt)},
    ${parameters.json(record.metadata)},
    ${parameters.integer(record.revision)},
    ${parameters.nullableText(record.createdBy)},
    ${parameters.timestamp(record.createdAt)},
    now()
  )`,
    )
    .join(",\n");
  return `INSERT INTO inventory_reservations (
  id,
  order_line_id,
  source_intent_id,
  customer_id,
  source_message_id,
  inventory_item_id,
  reserved_qty,
  reservation_type,
  status,
  expires_at,
  metadata_json,
  revision,
  created_by,
  created_at,
  updated_at
  )
SELECT
  reservation_values.id,
  reservation_values.order_line_id,
  reservation_values.source_intent_id,
  reservation_values.customer_id,
  reservation_values.source_message_id,
  reservation_values.inventory_item_id,
  reservation_values.reserved_qty,
  reservation_values.reservation_type,
  reservation_values.status,
  reservation_values.expires_at,
  reservation_values.metadata_json,
  reservation_values.revision,
  reservation_values.created_by,
  reservation_values.created_at,
  reservation_values.updated_at
FROM (VALUES
${values}
) AS reservation_values(
  id, order_line_id, source_intent_id, customer_id, source_message_id, inventory_item_id,
  reserved_qty, reservation_type, status, expires_at, metadata_json, revision,
  created_by, created_at, updated_at
)
CROSS JOIN inventory_write_guard AS guard
WHERE guard.inventory_ok AND guard.hold_ok
ON CONFLICT (id) DO UPDATE SET
  order_line_id = EXCLUDED.order_line_id,
  reservation_type = EXCLUDED.reservation_type,
  status = EXCLUDED.status,
  expires_at = NULL,
  metadata_json = inventory_reservations.metadata_json || EXCLUDED.metadata_json,
  revision = inventory_reservations.revision + 1,
  updated_at = now()
WHERE inventory_reservations.reservation_type = '临时留货'
  AND inventory_reservations.status = '生效'
  AND inventory_reservations.source_intent_id = EXCLUDED.source_intent_id
  AND inventory_reservations.inventory_item_id = EXCLUDED.inventory_item_id
  AND inventory_reservations.reserved_qty = EXCLUDED.reserved_qty
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
WHERE item.id = delta.inventory_item_id AND guard.inventory_ok AND guard.hold_ok
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
    .map((record) => `(${parameters.text(record.inventoryItemId)}, ${parameters.integer(record.inventoryDeltaQty)})`)
    .join(",\n");
  return `SELECT inventory_item_id, SUM(reserved_qty)::integer AS reserved_qty
FROM (VALUES
${values}
) AS raw(inventory_item_id, reserved_qty)
GROUP BY inventory_item_id
HAVING SUM(reserved_qty) <> 0`;
}

function buildTemporaryHoldConversionsSql(records, parameters) {
  if (records.length === 0) {
    return `SELECT NULL::text AS reservation_id, NULL::text AS source_intent_id,
      NULL::text AS inventory_item_id, 0::integer AS reserved_qty, NULL::text AS order_line_id
      WHERE false`;
  }
  const values = records.map((record) => `(
    ${parameters.text(record.reservationId)},
    ${parameters.text(record.sourceIntentId)},
    ${parameters.text(record.inventoryItemId)},
    ${parameters.integer(record.reservedQty)},
    ${parameters.text(record.orderLineId)}
  )`).join(",\n");
  return `SELECT * FROM (VALUES
${values}
) AS conversion(reservation_id, source_intent_id, inventory_item_id, reserved_qty, order_line_id)`;
}

function buildConvertInventoryIntentsSql(records) {
  if (records.length === 0) return "SELECT NULL::json AS result WHERE false";
  return `UPDATE inventory_intents AS intent
SET intent_status = '已转订单',
    related_order_line_id = conversion.order_line_id,
    revision = intent.revision + 1,
    updated_at = now()
FROM temporary_hold_inputs AS conversion
JOIN inserted_inventory_reservations AS saved
  ON saved.result->>'reservationId' = conversion.reservation_id
WHERE intent.id = conversion.source_intent_id
  AND intent.intent_status = '临时留货-生效'
RETURNING ${inventoryIntentJsonExpression("intent")} AS result`;
}

function buildApplyShortageCancellationIntentsSql(records, parameters) {
  if (records.length === 0) return "SELECT NULL::json AS result WHERE false";
  const values = records.map((intent) => `(
    ${parameters.text(intent.id)},
    ${parameters.integer(Math.max(1, Number(intent.revision ?? 1) - 1))},
    ${parameters.json(intent.candidate)}
  )`).join(",\n");
  return `UPDATE inventory_intents AS intent
SET intent_status = '库存不足取消-已应用',
    candidate_json = applied.candidate_json,
    revision = intent.revision + 1,
    updated_at = now()
FROM (VALUES
${values}
) AS applied(intent_id, expected_revision, candidate_json)
WHERE intent.id = applied.intent_id
  AND intent.intent_type = 'shortage_cancellation'
  AND intent.revision = applied.expected_revision
  AND intent.intent_status <> '库存不足取消-已应用'
RETURNING ${inventoryIntentJsonExpression("intent")} AS result`;
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
ON CONFLICT (id) DO NOTHING
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
ON CONFLICT (id) DO NOTHING
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
ON CONFLICT (id) DO NOTHING
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

function buildCommittedOrderDraft(value, expectedRevision) {
  const draft = normalizeOrderDraft(value);
  const revision = toFiniteInteger(expectedRevision);
  if (!draft || revision < 1) throw orderDraftConcurrencyError();
  return normalizeOrderDraft({
    ...draft,
    revision: revision + 1,
    clientRevision: revision + 1,
  });
}

function orderDraftConcurrencyError() {
  const error = new Error("The order draft changed before confirmation could be committed.");
  error.statusCode = 409;
  error.code = "BUSINESS_WRITE_CONFLICT";
  return error;
}

function orderDraftJsonExpression(alias) {
  return `json_build_object(
    'id', ${alias}.id,
    'draftId', ${alias}.id,
    'bizNo', ${alias}.biz_no,
    'sourceText', ${alias}.source_text,
    'sourceChannel', ${alias}.source_channel,
    'sourceMessageId', COALESCE(${alias}.source_message_id, ''),
    'customerId', COALESCE(${alias}.customer_id, ''),
    'customerName', COALESCE(${alias}.recognition_summary->>'customerName', ''),
    'generatedOrderNo', COALESCE(${alias}.recognition_summary->>'generatedOrderNo', ''),
    'status', ${alias}.status,
    'revision', ${alias}.revision,
    'clientRevision', ${alias}.revision,
    'createdBy', COALESCE(${alias}.created_by, ''),
    'createdAt', ${alias}.created_at,
    'updatedAt', ${alias}.updated_at
  )`;
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

function productionTaskJsonExpression(alias) {
  return `json_build_object(
    'productionTaskId', ${alias}.id,
    'bizNo', ${alias}.biz_no,
    'orderLineId', ${alias}.order_line_id,
    'taskType', ${alias}.task_type,
    'machineId', COALESCE(${alias}.machine_id, ''),
    'plannedQty', ${alias}.planned_qty,
    'taskStatus', ${alias}.task_status,
    'publishedScheduleId', COALESCE(${alias}.published_schedule_id, ''),
    'revision', ${alias}.revision,
    'createdBy', COALESCE(${alias}.created_by, ''),
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
    'sourceIntentId', ${alias}.source_intent_id,
    'customerId', ${alias}.customer_id,
    'sourceMessageId', ${alias}.source_message_id,
    'inventoryItemId', ${alias}.inventory_item_id,
    'reservedQty', ${alias}.reserved_qty,
    'reservationType', ${alias}.reservation_type,
    'status', ${alias}.status,
    'expiresAt', ${alias}.expires_at,
    'metadata', ${alias}.metadata_json,
    'revision', ${alias}.revision,
    'createdBy', ${alias}.created_by,
    'createdAt', ${alias}.created_at
  )`;
}

function inventoryIntentJsonExpression(alias) {
  return `json_build_object(
    'intentId', ${alias}.id,
    'sourceDraftId', ${alias}.source_draft_id,
    'sourceMessageId', ${alias}.source_message_id,
    'conversationId', ${alias}.conversation_id,
    'customerId', ${alias}.customer_id,
    'intentType', ${alias}.intent_type,
    'intentStatus', ${alias}.intent_status,
    'sourceText', ${alias}.source_text,
    'candidate', ${alias}.candidate_json,
    'cancellationScope', ${alias}.cancellation_scope,
    'relatedReservationId', ${alias}.related_reservation_id,
    'relatedOrderLineId', ${alias}.related_order_line_id,
    'revision', ${alias}.revision,
    'createdBy', ${alias}.created_by,
    'createdAt', ${alias}.created_at,
    'updatedAt', ${alias}.updated_at
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

function normalizeOptionalTimestamp(value) {
  const text = String(value ?? "").trim();
  if (!text || Number.isNaN(Date.parse(text))) return "";
  return new Date(text).toISOString();
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
