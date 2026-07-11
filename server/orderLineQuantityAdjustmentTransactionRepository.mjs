import { createPostgresParameterBinder } from "./postgresSqlParameters.mjs";
import { createPostgresTransactionExecutor } from "./postgresTransactionExecutor.mjs";
import {
  buildPostgresIdempotencyRequest,
  readPostgresIdempotencyReplay,
  resolveRepositoryIdempotencyKey,
} from "./idempotency.mjs";

export function createOrderLineQuantityAdjustmentTransactionRepository(options = {}) {
  const mode =
    options.mode ??
    process.env.ERP_ORDER_LINE_QUANTITY_ADJUSTMENT_TRANSACTION_STORE ??
    process.env.ERP_ORDER_STORE ??
    "local";
  if (mode === "postgres") {
    return createPostgresOrderLineQuantityAdjustmentTransactionRepository({
      databaseUrl: options.databaseUrl ?? process.env.ERP_ORDER_DATABASE_URL ?? process.env.DATABASE_URL ?? process.env.PGURL,
      queryJson: options.queryJson,
      transactionJson: options.transactionJson,
      idempotentTransactionJson: options.idempotentTransactionJson,
      postgresClient: options.postgresClient,
    });
  }
  if (mode === "local") return createLocalOrderLineQuantityAdjustmentTransactionRepository();
  throw new Error(`Unsupported order line quantity adjustment transaction repository mode: ${mode}`);
}

export function createLocalOrderLineQuantityAdjustmentTransactionRepository() {
  return {
    kind: "local_memory",

    findIdempotentReplay() {
      return null;
    },

    adjustOrderLineQuantity(input) {
      const transaction = normalizeOrderLineQuantityAdjustmentTransactionResult({
        orderLine: input.orderLine,
        fulfillmentRecords: input.fulfillmentRecords,
        priceSnapshots: input.priceSnapshots,
        inventoryReservations: input.inventoryReservations,
        inventoryLedgerEntries: input.inventoryLedgerEntries,
        statementLines: input.statementLines,
        statementRecords: input.statementRecords,
        previousQty: input.orderLineChangeRecord?.before?.originalQty,
        newQty: input.orderLineChangeRecord?.after?.originalQty,
        qtyDelta:
          toFiniteInteger(input.orderLineChangeRecord?.after?.originalQty) -
          toFiniteInteger(input.orderLineChangeRecord?.before?.originalQty),
        orderLineChangeRecordId: input.orderLineChangeRecord?.changeRecordId ?? input.orderLineChangeRecord?.id ?? "",
        operationLogId: input.operationLog?.id ?? "",
      });
      applyOrderLineQuantityAdjustmentWorkspaceMutation({
        workspace: input.workspace,
        orderLine: input.orderLine,
        fulfillmentRecords: input.fulfillmentRecords,
        priceSnapshots: input.priceSnapshots,
        inventoryReservations: input.inventoryReservations,
        inventoryAdjustments: input.inventoryAdjustments,
        inventoryLedgerEntries: input.inventoryLedgerEntries,
        statementLines: input.statementLines,
        statementRecords: input.statementRecords,
        orderLineChangeRecord: input.orderLineChangeRecord,
        operationLog: input.operationLog,
      });
      return transaction;
    },
  };
}

export function createPostgresOrderLineQuantityAdjustmentTransactionRepository(options = {}) {
  const { queryJson, idempotentTransactionJson } = createPostgresTransactionExecutor(options);

  return {
    kind: "postgres",

    async findIdempotentReplay(input) {
      const replay = await readPostgresIdempotencyReplay({
        queryJson,
        scope: "order.line.quantity.adjust",
        idempotencyKey: input.idempotencyKey,
        payload: input.idempotencyPayload,
      });
      return replay ? normalizeOrderLineQuantityAdjustmentTransactionResult(replay) : null;
    },

    async adjustOrderLineQuantity(input) {
      const query = buildAdjustOrderLineQuantityTransactionQuery(input);
      const orderLineId = input.orderLine?.orderLineId ?? input.orderLine?.id ?? "";
      const saved = normalizeOrderLineQuantityAdjustmentTransactionResult(
        await idempotentTransactionJson(
          buildPostgresIdempotencyRequest({
            scope: "order.line.quantity.adjust",
            idempotencyKey: resolveRepositoryIdempotencyKey(input.idempotencyKey, input.operationLog?.id),
            payload: input.idempotencyPayload ?? buildOrderLineQuantityAdjustmentIdempotencyPayload(input),
            operatorId: input.operationLog?.operatorId,
            targetType: "order_line",
            targetId: orderLineId,
            resourceLocks: [
              `order-line:${orderLineId}`,
              ...(input.fulfillmentRecords ?? []).map((item) => `fulfillment:${item.fulfillmentId ?? item.id ?? ""}`),
              ...(input.inventoryReservations ?? []).map((item) => `reservation:${item.reservationId ?? item.id ?? ""}`),
              ...(input.inventoryAdjustments ?? []).map((item) => `inventory:${item.inventoryItemId ?? ""}`),
              ...(input.statementRecords ?? []).map((item) => `statement:${item.statementId ?? item.id ?? ""}`),
            ],
            query,
          }),
        ),
      );
      if (!saved.orderLine) {
        throw new Error("PostgreSQL order line quantity adjustment transaction returned an invalid order line");
      }
      applyOrderLineQuantityAdjustmentWorkspaceMutation({
        workspace: input.workspace,
        orderLine: saved.orderLine,
        fulfillmentRecords: saved.fulfillmentRecords,
        priceSnapshots: saved.priceSnapshots,
        inventoryReservations: saved.inventoryReservations,
        inventoryItems: saved.inventoryItems,
        inventoryLedgerEntries: saved.inventoryLedgerEntries,
        statementLines: saved.statementLines,
        statementRecords: saved.statementRecords,
        orderLineChangeRecord: input.orderLineChangeRecord,
        operationLog: saved.operationLogId === input.operationLog?.id ? input.operationLog : null,
      });
      return saved;
    },
  };
}

function buildOrderLineQuantityAdjustmentIdempotencyPayload(input = {}) {
  return {
    orderLine: input.orderLine,
    fulfillmentRecords: input.fulfillmentRecords,
    priceSnapshots: input.priceSnapshots,
    inventoryReservations: input.inventoryReservations,
    inventoryAdjustments: input.inventoryAdjustments,
    inventoryLedgerEntries: input.inventoryLedgerEntries,
    statementLines: input.statementLines,
    statementRecords: input.statementRecords,
    orderLineChangeRecord: input.orderLineChangeRecord,
  };
}

export function buildAdjustOrderLineQuantityTransactionSql(input) {
  return buildAdjustOrderLineQuantityTransactionQuery(input).text;
}

export function buildAdjustOrderLineQuantityTransactionQuery(input) {
  const parameters = createPostgresParameterBinder();
  return {
    text: buildAdjustOrderLineQuantityTransactionText(input, parameters),
    values: parameters.values,
  };
}

function buildAdjustOrderLineQuantityTransactionText(input, parameters) {
  const orderLine = normalizeOrderLine(input.orderLine);
  const fulfillmentRecords = normalizeFulfillmentRecords(input.fulfillmentRecords ?? []);
  const priceSnapshots = normalizePriceSnapshots(input.priceSnapshots ?? []);
  const inventoryReservations = normalizeInventoryReservations(input.inventoryReservations ?? []);
  const inventoryAdjustments = normalizeInventoryAdjustments(input.inventoryAdjustments ?? []);
  const inventoryLedgerEntries = normalizeInventoryLedgerEntries(input.inventoryLedgerEntries ?? []);
  const statementLines = normalizeStatementLines(input.statementLines ?? []);
  const statementRecords = normalizeStatementRecords(input.statementRecords ?? []);
  const orderLineChangeRecord = normalizeOrderLineChangeRecord(input.orderLineChangeRecord);
  const operationLog = normalizeOperationLogForPersistence(input.operationLog);
  if (!orderLine || !orderLineChangeRecord || !operationLog) {
    throw new Error("Order line, order line change record, and operation log are required");
  }
  const expectedOrderLineRevision = Math.max(1, toFiniteInteger(input.expectedOrderLineRevision ?? orderLine.revision));

  return `
BEGIN;
WITH locked_order_line AS MATERIALIZED (
  SELECT id, revision
  FROM order_lines
  WHERE id = ${parameters.text(orderLine.orderLineId)}
  FOR UPDATE
),
fulfillment_updates AS MATERIALIZED (
  ${buildFulfillmentUpdatesSql(fulfillmentRecords, parameters)}
),
locked_fulfillment_records AS MATERIALIZED (
  SELECT fulfillment.id, fulfillment.revision
  FROM fulfillment_records AS fulfillment
  JOIN fulfillment_updates AS updates ON updates.id = fulfillment.id
  ORDER BY fulfillment.id
  FOR UPDATE OF fulfillment
),
reservation_updates AS MATERIALIZED (
  ${buildReservationUpdatesSql(inventoryReservations, parameters)}
),
locked_inventory_reservations AS MATERIALIZED (
  SELECT reservation.id, reservation.revision, reservation.reserved_qty, reservation.status
  FROM inventory_reservations AS reservation
  JOIN reservation_updates AS updates ON updates.id = reservation.id
  ORDER BY reservation.id
  FOR UPDATE OF reservation
),
inventory_deltas AS MATERIALIZED (
  ${buildInventoryDeltasSql(inventoryAdjustments, parameters)}
),
locked_inventory_items AS MATERIALIZED (
  SELECT item.id, item.revision, item.reserved_qty, delta.reserved_qty_change
  FROM inventory_items AS item
  JOIN inventory_deltas AS delta ON delta.inventory_item_id = item.id
  ORDER BY item.id
  FOR UPDATE OF item
),
statement_line_updates AS MATERIALIZED (
  ${buildStatementLineUpdatesSql(statementLines, parameters)}
),
locked_statement_lines AS MATERIALIZED (
  SELECT line.id, line.revision, line.delivered_qty, line.chargeable_qty, line.final_amount
  FROM statement_lines AS line
  JOIN statement_line_updates AS updates ON updates.id = line.id
  ORDER BY line.id
  FOR UPDATE OF line
),
statement_updates AS MATERIALIZED (
  ${buildStatementUpdatesSql(statementRecords, parameters)}
),
locked_statements AS MATERIALIZED (
  SELECT statement.id, statement.revision
  FROM statements AS statement
  JOIN statement_updates AS updates ON updates.id = statement.id
  ORDER BY statement.id
  FOR UPDATE OF statement
),
write_guard AS MATERIALIZED (
  SELECT
    erp_require(
      EXISTS (SELECT 1 FROM locked_order_line WHERE revision = ${parameters.integer(expectedOrderLineRevision)}),
      'ERP_ORDER_LINE_CONCURRENCY_CONFLICT'
    )
    AND erp_require(
      (SELECT COUNT(*) FROM locked_fulfillment_records) = (SELECT COUNT(*) FROM fulfillment_updates)
      AND NOT EXISTS (
        SELECT 1 FROM locked_fulfillment_records AS locked
        JOIN fulfillment_updates AS updates ON updates.id = locked.id
        WHERE locked.revision <> updates.expected_revision
      ),
      'ERP_FULFILLMENT_CONCURRENCY_CONFLICT'
    )
    AND erp_require(
      (SELECT COUNT(*) FROM locked_inventory_reservations) = (SELECT COUNT(*) FROM reservation_updates)
      AND NOT EXISTS (
        SELECT 1 FROM locked_inventory_reservations AS locked
        JOIN reservation_updates AS updates ON updates.id = locked.id
        WHERE locked.revision <> updates.expected_revision
           OR locked.reserved_qty <> updates.expected_reserved_qty
           OR locked.status <> updates.expected_status
      ),
      'ERP_RESERVATION_CONCURRENCY_CONFLICT'
    )
    AND erp_require(
      (SELECT COUNT(*) FROM locked_inventory_items) = (SELECT COUNT(*) FROM inventory_deltas)
      AND NOT EXISTS (
        SELECT 1 FROM locked_inventory_items AS locked
        JOIN inventory_deltas AS delta ON delta.inventory_item_id = locked.id
        WHERE locked.revision <> delta.expected_revision
           OR locked.reserved_qty <> delta.expected_reserved_qty
           OR locked.reserved_qty + locked.reserved_qty_change < 0
      ),
      'ERP_INVENTORY_CONCURRENCY_CONFLICT'
    )
    AND erp_require(
      (SELECT COUNT(*) FROM locked_statement_lines) = (SELECT COUNT(*) FROM statement_line_updates)
      AND NOT EXISTS (
        SELECT 1 FROM locked_statement_lines AS locked
        JOIN statement_line_updates AS updates ON updates.id = locked.id
        WHERE locked.revision <> updates.expected_revision
           OR locked.delivered_qty <> updates.expected_delivered_qty
           OR locked.chargeable_qty <> updates.expected_chargeable_qty
           OR locked.final_amount <> updates.expected_final_amount
      ),
      'ERP_STATEMENT_LINE_CONCURRENCY_CONFLICT'
    )
    AND erp_require(
      (SELECT COUNT(*) FROM locked_statements) = (SELECT COUNT(*) FROM statement_updates)
      AND NOT EXISTS (
        SELECT 1 FROM locked_statements AS locked
        JOIN statement_updates AS updates ON updates.id = locked.id
        WHERE locked.revision <> updates.expected_revision
      ),
      'ERP_STATEMENT_CONCURRENCY_CONFLICT'
    ) AS ok
),
updated_order_line AS (
  UPDATE order_lines
  SET
    original_qty = ${parameters.integer(orderLine.originalQty)},
    line_status = ${parameters.text(orderLine.lineStatus)},
    exception_tags = ${parameters.textArray(orderLine.exceptionTags)},
    revision = revision + 1,
    updated_at = now()
  FROM write_guard AS guard
  WHERE id = ${parameters.text(orderLine.orderLineId)} AND guard.ok
  RETURNING ${orderLineJsonExpression("order_lines")} AS result
),
updated_fulfillment_records AS (
  ${buildUpdateFulfillmentRecordsSql(fulfillmentRecords, parameters)}
),
inserted_price_snapshots AS (
  ${buildInsertPriceSnapshotsSql(priceSnapshots, parameters)}
),
updated_inventory_reservations AS (
  ${buildUpdateInventoryReservationsSql(inventoryReservations, parameters)}
),
updated_inventory_items AS (
  ${buildUpdateInventoryItemsSql(inventoryAdjustments, parameters)}
),
inserted_inventory_ledger_entries AS (
  ${buildInsertInventoryLedgerEntriesSql(inventoryLedgerEntries, parameters)}
),
updated_statement_lines AS (
  ${buildUpdateStatementLinesSql(statementLines, parameters)}
),
updated_statement_records AS (
  ${buildUpdateStatementRecordsSql(statementRecords, parameters)}
),
inserted_order_line_change_record AS (
  INSERT INTO order_line_change_records (
    id,
    order_line_id,
    changed_fields,
    before_json,
    after_json,
    reason,
    document_reprint_required,
    changed_by,
    created_at
  ) VALUES (
    ${parameters.text(orderLineChangeRecord.changeRecordId)},
    ${parameters.text(orderLineChangeRecord.orderLineId)},
    ${parameters.textArray(orderLineChangeRecord.changedFields)},
    ${parameters.json(orderLineChangeRecord.before)},
    ${parameters.json(orderLineChangeRecord.after)},
    ${parameters.nullableText(orderLineChangeRecord.reason)},
    ${parameters.boolean(orderLineChangeRecord.documentReprintRequired)},
    ${parameters.nullableText(orderLineChangeRecord.changedBy)},
    ${parameters.timestamp(orderLineChangeRecord.createdAt)}
  )
  ON CONFLICT (id) DO UPDATE SET
    changed_fields = EXCLUDED.changed_fields,
    before_json = EXCLUDED.before_json,
    after_json = EXCLUDED.after_json,
    reason = EXCLUDED.reason,
    document_reprint_required = EXCLUDED.document_reprint_required,
    changed_by = EXCLUDED.changed_by
  RETURNING id
),
inserted_operation_log AS (
  INSERT INTO operation_logs (
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
    ${parameters.nullableText(operationLog.reason)},
    ${parameters.nullableText(operationLog.operatorId)},
    ${parameters.nullableText(operationLog.pageKey)},
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
  RETURNING id
)
SELECT json_build_object(
  'orderLine', (SELECT result FROM updated_order_line),
  'fulfillmentRecords', (SELECT COALESCE(json_agg(result ORDER BY result->>'fulfillmentId'), '[]'::json) FROM updated_fulfillment_records),
  'priceSnapshots', (SELECT COALESCE(json_agg(result ORDER BY result->>'priceSnapshotId'), '[]'::json) FROM inserted_price_snapshots),
  'inventoryReservations', (SELECT COALESCE(json_agg(result ORDER BY result->>'reservationId'), '[]'::json) FROM updated_inventory_reservations),
  'inventoryItems', (SELECT COALESCE(json_agg(result ORDER BY result->>'inventoryItemId'), '[]'::json) FROM updated_inventory_items),
  'inventoryLedgerEntries', (SELECT COALESCE(json_agg(result ORDER BY result->>'ledgerId'), '[]'::json) FROM inserted_inventory_ledger_entries),
  'statementLines', (SELECT COALESCE(json_agg(result ORDER BY result->>'statementLineId'), '[]'::json) FROM updated_statement_lines),
  'statementRecords', (SELECT COALESCE(json_agg(result ORDER BY result->>'statementId'), '[]'::json) FROM updated_statement_records),
  'previousQty', ${parameters.integer(orderLineChangeRecord.before?.originalQty)},
  'newQty', ${parameters.integer(orderLineChangeRecord.after?.originalQty ?? orderLine.originalQty)},
  'qtyDelta', ${parameters.integer(
    toFiniteInteger(orderLineChangeRecord.after?.originalQty ?? orderLine.originalQty) -
      toFiniteInteger(orderLineChangeRecord.before?.originalQty),
  )},
  'orderLineChangeRecordId', (SELECT id FROM inserted_order_line_change_record),
  'operationLogId', (SELECT id FROM inserted_operation_log)
) AS result;
COMMIT;
`.trim();
}

export function normalizeOrderLineQuantityAdjustmentTransactionResult(value) {
  if (!value || typeof value !== "object") {
    return {
      orderLine: null,
      fulfillmentRecords: [],
      priceSnapshots: [],
      inventoryReservations: [],
      inventoryItems: [],
      inventoryLedgerEntries: [],
      statementLines: [],
      statementRecords: [],
      previousQty: 0,
      newQty: 0,
      qtyDelta: 0,
      orderLineChangeRecordId: "",
      operationLogId: "",
    };
  }
  return {
    orderLine: value.orderLine ? normalizeOrderLine(value.orderLine) : null,
    fulfillmentRecords: normalizeFulfillmentRecords(value.fulfillmentRecords ?? value.fulfillment_records ?? []),
    priceSnapshots: normalizePriceSnapshots(value.priceSnapshots ?? value.price_snapshots ?? []),
    inventoryReservations: normalizeInventoryReservations(value.inventoryReservations ?? value.inventory_reservations ?? []),
    inventoryItems: normalizeInventoryItems(value.inventoryItems ?? value.inventory_items ?? []),
    inventoryLedgerEntries: normalizeInventoryLedgerEntries(value.inventoryLedgerEntries ?? value.inventory_ledger_entries ?? []),
    statementLines: normalizeStatementLines(value.statementLines ?? value.statement_lines ?? []),
    statementRecords: normalizeStatementRecords(value.statementRecords ?? value.statement_records ?? []),
    previousQty: toFiniteInteger(value.previousQty ?? value.previous_qty),
    newQty: toFiniteInteger(value.newQty ?? value.new_qty ?? value.orderLine?.originalQty ?? value.order_line?.original_qty),
    qtyDelta: toFiniteInteger(value.qtyDelta ?? value.qty_delta),
    orderLineChangeRecordId: String(value.orderLineChangeRecordId ?? value.order_line_change_record_id ?? "").trim(),
    operationLogId: String(value.operationLogId ?? value.operation_log_id ?? "").trim(),
  };
}

function applyOrderLineQuantityAdjustmentWorkspaceMutation(input) {
  const workspace = input.workspace;
  if (!workspace) return;
  const orderLine = toWorkspaceOrderLine(input.orderLine);
  if (orderLine) {
    workspace.orderLines = upsertById(workspace.orderLines ?? [], orderLine);
  }
  const fulfillmentRecords = (input.fulfillmentRecords ?? []).map(toWorkspaceFulfillment).filter(Boolean);
  for (const fulfillment of fulfillmentRecords) {
    workspace.fulfillments = upsertById(workspace.fulfillments ?? [], fulfillment);
  }
  const priceSnapshots = normalizePriceSnapshots(input.priceSnapshots ?? []);
  for (const snapshot of priceSnapshots) {
    workspace.priceSnapshots = upsertById(workspace.priceSnapshots ?? [], toWorkspacePriceSnapshot(snapshot));
  }
  const inventoryReservations = (input.inventoryReservations ?? []).map(toWorkspaceInventoryReservation).filter(Boolean);
  for (const reservation of inventoryReservations) {
    workspace.inventoryReservations = upsertById(workspace.inventoryReservations ?? [], reservation);
  }
  if (Array.isArray(input.inventoryItems) && input.inventoryItems.length > 0) {
    applyWorkspaceInventoryItems(workspace, input.inventoryItems);
  } else {
    applyWorkspaceInventoryAdjustments(workspace, input.inventoryAdjustments ?? []);
  }
  const inventoryLedgerEntries = (input.inventoryLedgerEntries ?? []).map(toWorkspaceInventoryLedgerEntry).filter(Boolean);
  for (const ledger of inventoryLedgerEntries) {
    workspace.inventoryLedgers = upsertById(workspace.inventoryLedgers ?? [], ledger);
  }
  const statementLines = normalizeStatementLines(input.statementLines ?? []);
  for (const line of statementLines) {
    workspace.statementLines = upsertById(workspace.statementLines ?? [], toWorkspaceStatementLine(line), (value) => value?.id ?? value?.statementLineId);
  }
  const statementRecords = normalizeStatementRecords(input.statementRecords ?? []);
  for (const statement of statementRecords) {
    workspace.statements = upsertById(workspace.statements ?? [], toWorkspaceStatementRecord(statement));
  }
  if (input.orderLineChangeRecord) {
    workspace.orderLineChangeRecords = upsertById(workspace.orderLineChangeRecords ?? [], {
      id: input.orderLineChangeRecord.changeRecordId ?? input.orderLineChangeRecord.id,
      ...input.orderLineChangeRecord,
    });
  }
  if (input.operationLog) {
    workspace.operationLogs = upsertById(workspace.operationLogs ?? [], input.operationLog);
  }
}

function normalizeInventoryItems(records) {
  if (!Array.isArray(records)) return [];
  return records
    .map((record) => {
      const inventoryItemId = String(record?.inventoryItemId ?? record?.id ?? "").trim();
      if (!inventoryItemId) return null;
      return {
        inventoryItemId,
        id: inventoryItemId,
        reservedQty: toFiniteInteger(record.reservedQty ?? record.reserved_qty),
        revision: Math.max(1, toFiniteInteger(record.revision ?? 1)),
      };
    })
    .filter(Boolean);
}

function applyWorkspaceInventoryItems(workspace, inventoryItems) {
  if (!Array.isArray(workspace.inventories)) return;
  const byId = new Map(normalizeInventoryItems(inventoryItems).map((item) => [item.inventoryItemId, item]));
  workspace.inventories = workspace.inventories.map((inventory) => {
    const saved = byId.get(inventory.id);
    return saved ? { ...inventory, reserved: saved.reservedQty, revision: saved.revision } : inventory;
  });
}

function applyWorkspaceInventoryAdjustments(workspace, inventoryAdjustments) {
  const adjustments = normalizeInventoryAdjustments(inventoryAdjustments);
  if (!Array.isArray(workspace.inventories) || adjustments.length === 0) return;
  workspace.inventories = workspace.inventories.map((inventory) => {
    const reservedQtyChange = adjustments
      .filter((adjustment) => adjustment.inventoryItemId === inventory.id)
      .reduce((sum, adjustment) => sum + adjustment.reservedQtyChange, 0);
    if (!reservedQtyChange) return inventory;
    return {
      ...inventory,
      reserved: Math.max(0, Number(inventory.reserved ?? 0) + reservedQtyChange),
    };
  });
}

function normalizeOrderLine(record) {
  if (!record || typeof record !== "object") return null;
  const orderLineId = String(record.orderLineId ?? record.id ?? "").trim();
  const orderId = String(record.orderId ?? record.order_id ?? record.orderNo ?? "").trim();
  const customerId = String(record.customerId ?? record.customer_id ?? "").trim();
  if (!orderLineId || !orderId || !customerId) return null;
  return {
    orderLineId,
    id: orderLineId,
    bizNo: String(record.bizNo ?? record.biz_no ?? record.lineNo ?? orderLineId).trim() || orderLineId,
    orderId,
    customerId,
    productName: String(record.productName ?? record.product ?? "").trim(),
    orderType: String(record.orderType ?? record.order_type ?? "现货").trim() || "现货",
    size: String(record.size ?? "").trim(),
    bagColor: String(record.bagColor ?? record.bag_color ?? record.color ?? "").trim(),
    handleType: String(record.handleType ?? record.handle_type ?? record.handle ?? "").trim(),
    style: String(record.style ?? "").trim(),
    printFlag: Boolean(record.printFlag ?? record.print === "是"),
    printColor: String(record.printColor ?? record.print_color ?? "").trim(),
    printSide: String(record.printSide ?? record.print_side ?? "").trim(),
    handleColor: String(record.handleColor ?? record.handle_color ?? "").trim(),
    originalQty: toFiniteInteger(record.originalQty ?? record.original_qty ?? record.qty),
    latestNeededAt: record.latestNeededAt ?? record.latest_needed_at ?? record.latest ?? "",
    fulfillmentMethod: String(record.fulfillmentMethod ?? record.fulfillment_method ?? record.fulfillment ?? "待确认").trim(),
    lineStatus: String(record.lineStatus ?? record.line_status ?? record.status ?? "待确认").trim() || "待确认",
    exceptionTags: normalizeTextArray(record.exceptionTags ?? record.exception_tags ?? record.exceptions ?? []),
    revision: Math.max(1, toFiniteInteger(record.revision ?? 1)),
    createdBy: String(record.createdBy ?? record.created_by ?? "").trim(),
    createdAt: record.createdAt ?? record.created_at ?? new Date().toISOString(),
    closedAt: record.closedAt ?? record.closed_at ?? "",
    voidedAt: record.voidedAt ?? record.voided_at ?? "",
    voidedBy: String(record.voidedBy ?? record.voided_by ?? "").trim(),
    voidReason: String(record.voidReason ?? record.void_reason ?? "").trim(),
  };
}

function normalizeFulfillmentRecords(records) {
  if (!Array.isArray(records)) return [];
  return records.map(normalizeFulfillmentRecord).filter(Boolean);
}

function normalizeFulfillmentRecord(record) {
  if (!record || typeof record !== "object") return null;
  const fulfillmentId = String(record.fulfillmentId ?? record.id ?? "").trim();
  const orderLineId = String(record.orderLineId ?? record.order_line_id ?? record.lineId ?? "").trim();
  const customerId = String(record.customerId ?? record.customer_id ?? "").trim();
  if (!fulfillmentId || !orderLineId || !customerId) return null;
  return {
    fulfillmentId,
    id: fulfillmentId,
    bizNo: String(record.bizNo ?? record.biz_no ?? fulfillmentId).trim() || fulfillmentId,
    orderLineId,
    customerId,
    customerSnapshot: normalizeObject(record.customerSnapshot ?? record.customer_snapshot),
    method: String(record.method ?? "待确认").trim() || "待确认",
    expectedQty: toFiniteInteger(record.expectedQty ?? record.expected_qty ?? record.qty),
    actualQty: record.actualQty ?? record.actual_qty ?? null,
    status: String(record.status ?? "待出库").trim() || "待出库",
    revision: Math.max(1, toFiniteInteger(record.revision ?? 1)),
    latestNeededAt: record.latestNeededAt ?? record.latest_needed_at ?? record.latest ?? "",
    confirmedBy: String(record.confirmedBy ?? record.confirmed_by ?? "").trim(),
    createdBy: String(record.createdBy ?? record.created_by ?? "").trim(),
    createdAt: record.createdAt ?? record.created_at ?? new Date().toISOString(),
  };
}

function normalizePriceSnapshots(records) {
  if (!Array.isArray(records)) return [];
  return records.map(normalizePriceSnapshot).filter(Boolean);
}

function normalizePriceSnapshot(record) {
  if (!record || typeof record !== "object") return null;
  const priceSnapshotId = String(record.priceSnapshotId ?? record.id ?? "").trim();
  const orderLineId = String(record.orderLineId ?? record.order_line_id ?? "").trim();
  if (!priceSnapshotId || !orderLineId) return null;
  return {
    priceSnapshotId,
    id: priceSnapshotId,
    orderLineId,
    snapshotType: String(record.snapshotType ?? record.snapshot_type ?? "quantity_adjustment").trim() || "quantity_adjustment",
    versionNo: toFiniteInteger(record.versionNo ?? record.version_no ?? 1),
    bagPrice: toFiniteNumber(record.bagPrice ?? record.bag_price ?? 0),
    printPrice: toFiniteNumber(record.printPrice ?? record.print_price ?? 0),
    otherFee: toFiniteNumber(record.otherFee ?? record.other_fee ?? 0),
    adjustmentAmount: toFiniteNumber(record.adjustmentAmount ?? record.adjustment_amount ?? 0),
    chargeableQty: toFiniteInteger(record.chargeableQty ?? record.chargeable_qty ?? 0),
    finalAmount: toFiniteNumber(record.finalAmount ?? record.final_amount ?? record.amount ?? 0),
    overrideReason: String(record.overrideReason ?? record.override_reason ?? "").trim(),
    createdBy: String(record.createdBy ?? record.created_by ?? "").trim(),
    createdAt: record.createdAt ?? record.created_at ?? new Date().toISOString(),
  };
}

function normalizeInventoryReservations(records) {
  if (!Array.isArray(records)) return [];
  return records.map(normalizeInventoryReservation).filter(Boolean);
}

function normalizeInventoryReservation(record) {
  if (!record || typeof record !== "object") return null;
  const reservationId = String(record.reservationId ?? record.id ?? "").trim();
  const orderLineId = String(record.orderLineId ?? record.order_line_id ?? "").trim();
  const inventoryItemId = String(record.inventoryItemId ?? record.inventory_item_id ?? "").trim();
  if (!reservationId || !orderLineId || !inventoryItemId) return null;
  return {
    reservationId,
    id: reservationId,
    orderLineId,
    inventoryItemId,
    reservedQty: toFiniteInteger(record.reservedQty ?? record.reserved_qty ?? record.qty),
    reservationType: String(record.reservationType ?? record.reservation_type ?? "出库占用").trim() || "出库占用",
    status: String(record.status ?? "生效").trim() || "生效",
    revision: Math.max(1, toFiniteInteger(record.revision ?? 1)),
    expectedReservedQty: toFiniteInteger(record.expectedReservedQty ?? record.expected_reserved_qty),
    expectedStatus: String(record.expectedStatus ?? record.expected_status ?? "生效").trim() || "生效",
    expiresAt: record.expiresAt ?? record.expires_at ?? "",
    createdBy: String(record.createdBy ?? record.created_by ?? "").trim(),
    createdAt: record.createdAt ?? record.created_at ?? new Date().toISOString(),
  };
}

function normalizeInventoryAdjustments(records) {
  if (!Array.isArray(records)) return [];
  const byInventoryItemId = new Map();
  for (const adjustment of records.map(normalizeInventoryAdjustment).filter(Boolean)) {
    const existing = byInventoryItemId.get(adjustment.inventoryItemId);
    if (!existing) {
      byInventoryItemId.set(adjustment.inventoryItemId, adjustment);
      continue;
    }
    if (
      existing.expectedRevision !== adjustment.expectedRevision ||
      existing.expectedReservedQty !== adjustment.expectedReservedQty
    ) {
      throw new Error(`Conflicting inventory snapshots for ${adjustment.inventoryItemId}`);
    }
    existing.reservedQtyChange += adjustment.reservedQtyChange;
  }
  return [...byInventoryItemId.values()];
}

function normalizeInventoryAdjustment(record) {
  if (!record || typeof record !== "object") return null;
  const inventoryItemId = String(record.inventoryItemId ?? record.inventory_item_id ?? "").trim();
  if (!inventoryItemId) return null;
  return {
    inventoryItemId,
    reservedQtyChange: toFiniteInteger(record.reservedQtyChange ?? record.reserved_qty_change ?? 0),
    expectedRevision: Math.max(1, toFiniteInteger(record.expectedRevision ?? record.expected_revision ?? 1)),
    expectedReservedQty: toFiniteInteger(record.expectedReservedQty ?? record.expected_reserved_qty),
  };
}

function normalizeInventoryLedgerEntries(records) {
  if (!Array.isArray(records)) return [];
  return records.map(normalizeInventoryLedgerEntry).filter(Boolean);
}

function normalizeInventoryLedgerEntry(record) {
  if (!record || typeof record !== "object") return null;
  const ledgerId = String(record.ledgerId ?? record.id ?? "").trim();
  const inventoryItemId = String(record.inventoryItemId ?? record.inventory_item_id ?? "").trim();
  if (!ledgerId || !inventoryItemId) return null;
  return {
    ledgerId,
    id: ledgerId,
    inventoryItemId,
    changeType: String(record.changeType ?? record.change_type ?? "订单改量").trim() || "订单改量",
    qtyBefore: toFiniteInteger(record.qtyBefore ?? record.qty_before ?? 0),
    qtyChange: toFiniteInteger(record.qtyChange ?? record.qty_change ?? 0),
    qtyAfter: toFiniteInteger(record.qtyAfter ?? record.qty_after ?? 0),
    sourceType: String(record.sourceType ?? record.source_type ?? "order_line_quantity_adjustment").trim() || "order_line_quantity_adjustment",
    sourceId: String(record.sourceId ?? record.source_id ?? "").trim(),
    operatorId: String(record.operatorId ?? record.operator_id ?? "").trim(),
    confirmedBy: String(record.confirmedBy ?? record.confirmed_by ?? "").trim(),
    occurredAt: record.occurredAt ?? record.occurred_at ?? new Date().toISOString(),
    createdAt: record.createdAt ?? record.created_at ?? new Date().toISOString(),
    reason: String(record.reason ?? "").trim(),
    remark: String(record.remark ?? "").trim(),
  };
}

function normalizeStatementLines(records) {
  if (!Array.isArray(records)) return [];
  return records.map(normalizeStatementLine).filter(Boolean);
}

function normalizeStatementLine(record) {
  if (!record || typeof record !== "object") return null;
  const statementLineId = String(record.statementLineId ?? record.id ?? "").trim();
  const statementId = String(record.statementId ?? record.statement_id ?? "").trim();
  const orderLineId = String(record.orderLineId ?? record.order_line_id ?? "").trim();
  if (!statementLineId || !statementId || !orderLineId) return null;
  return {
    statementLineId,
    id: statementLineId,
    statementId,
    orderLineId,
    fulfillmentId: String(record.fulfillmentId ?? record.fulfillment_id ?? "").trim(),
    deliveredQty: toFiniteInteger(record.deliveredQty ?? record.delivered_qty ?? 0),
    chargeableQty: toFiniteInteger(record.chargeableQty ?? record.chargeable_qty ?? 0),
    freeQty: toFiniteInteger(record.freeQty ?? record.free_qty ?? 0),
    amount: toFiniteNumber(record.amount ?? 0),
    adjustmentAmount: toFiniteNumber(record.adjustmentAmount ?? record.adjustment_amount ?? 0),
    finalAmount: toFiniteNumber(record.finalAmount ?? record.final_amount ?? record.amount ?? 0),
    revision: Math.max(1, toFiniteInteger(record.revision ?? 1)),
    expectedRevision: Math.max(1, toFiniteInteger(record.expectedRevision ?? record.expected_revision ?? record.revision ?? 1)),
    expectedDeliveredQty: toFiniteInteger(record.expectedDeliveredQty ?? record.expected_delivered_qty),
    expectedChargeableQty: toFiniteInteger(record.expectedChargeableQty ?? record.expected_chargeable_qty),
    expectedFinalAmount: toFiniteNumber(record.expectedFinalAmount ?? record.expected_final_amount),
    createdAt: record.createdAt ?? record.created_at ?? new Date().toISOString(),
  };
}

function normalizeStatementRecords(records) {
  if (!Array.isArray(records)) return [];
  return records.map(normalizeStatementRecord).filter(Boolean);
}

function normalizeStatementRecord(record) {
  if (!record || typeof record !== "object") return null;
  const statementId = String(record.statementId ?? record.id ?? "").trim();
  if (!statementId) return null;
  return {
    statementId,
    id: statementId,
    status: String(record.status ?? "").trim(),
    receivable: toFiniteNumber(record.receivable ?? record.receivableAmount ?? record.receivable_amount ?? 0),
    received: toFiniteNumber(record.received ?? record.receivedAmount ?? record.received_amount ?? 0),
    variance: toFiniteNumber(record.variance ?? record.varianceAmount ?? record.variance_amount ?? 0),
    revision: Math.max(1, toFiniteInteger(record.revision ?? 1)),
  };
}

function normalizeOrderLineChangeRecord(record) {
  if (!record || typeof record !== "object") return null;
  const changeRecordId = String(record.changeRecordId ?? record.id ?? "").trim();
  const orderLineId = String(record.orderLineId ?? record.order_line_id ?? "").trim();
  if (!changeRecordId || !orderLineId) return null;
  return {
    changeRecordId,
    id: changeRecordId,
    orderLineId,
    changedFields: normalizeTextArray(record.changedFields ?? record.changed_fields ?? []),
    before: normalizeObject(record.before ?? record.before_json),
    after: normalizeObject(record.after ?? record.after_json),
    reason: String(record.reason ?? "").trim(),
    documentReprintRequired: Boolean(record.documentReprintRequired ?? record.document_reprint_required ?? false),
    changedBy: String(record.changedBy ?? record.changed_by ?? "").trim(),
    createdAt: record.createdAt ?? record.created_at ?? new Date().toISOString(),
  };
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

function toWorkspaceOrderLine(record) {
  const line = normalizeOrderLine(record);
  if (!line) return null;
  return {
    ...record,
    id: line.orderLineId,
    orderNo: record.orderNo ?? line.orderId,
    lineNo: record.lineNo ?? line.bizNo,
    customerId: line.customerId,
    product: record.product ?? line.productName,
    size: line.size,
    color: record.color ?? line.bagColor,
    handle: record.handle ?? line.handleType,
    style: line.style,
    print: record.print ?? (line.printFlag ? "是" : "否"),
    qty: line.originalQty,
    orderType: line.orderType,
    status: line.lineStatus,
    fulfillment: record.fulfillment ?? line.fulfillmentMethod,
    latest: record.latest ?? line.latestNeededAt,
    exceptions: line.exceptionTags,
    revision: line.revision,
  };
}

function toWorkspaceFulfillment(record) {
  const fulfillment = normalizeFulfillmentRecord(record);
  if (!fulfillment) return null;
  return {
    ...record,
    id: fulfillment.fulfillmentId,
    lineId: fulfillment.orderLineId,
    customerId: fulfillment.customerId,
    method: fulfillment.method,
    qty: fulfillment.expectedQty,
    status: fulfillment.status,
    latest: record.latest ?? fulfillment.latestNeededAt,
    revision: fulfillment.revision,
  };
}

function toWorkspacePriceSnapshot(record) {
  const snapshot = normalizePriceSnapshot(record);
  if (!snapshot) return null;
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

function toWorkspaceInventoryReservation(record) {
  const reservation = normalizeInventoryReservation(record);
  if (!reservation) return null;
  return {
    id: reservation.reservationId,
    reservationId: reservation.reservationId,
    orderLineId: reservation.orderLineId,
    inventoryItemId: reservation.inventoryItemId,
    qty: reservation.reservedQty,
    reservedQty: reservation.reservedQty,
    reservationType: reservation.reservationType,
    status: reservation.status,
    revision: reservation.revision,
    expiresAt: reservation.expiresAt,
    createdBy: reservation.createdBy,
    createdAt: reservation.createdAt,
  };
}

function toWorkspaceInventoryLedgerEntry(record) {
  const ledger = normalizeInventoryLedgerEntry(record);
  if (!ledger) return null;
  return { id: ledger.ledgerId, ...ledger };
}

function toWorkspaceStatementLine(record) {
  const line = normalizeStatementLine(record);
  if (!line) return null;
  return {
    id: line.statementLineId,
    statementLineId: line.statementLineId,
    statementId: line.statementId,
    orderLineId: line.orderLineId,
    fulfillmentId: line.fulfillmentId,
    deliveredQty: line.deliveredQty,
    chargeableQty: line.chargeableQty,
    freeQty: line.freeQty,
    amount: line.amount,
    adjustmentAmount: line.adjustmentAmount,
    finalAmount: line.finalAmount,
    revision: line.revision,
    createdAt: line.createdAt,
  };
}

function toWorkspaceStatementRecord(record) {
  const statement = normalizeStatementRecord(record);
  if (!statement) return null;
  return {
    id: statement.statementId,
    statementId: statement.statementId,
    status: statement.status,
    receivable: statement.receivable,
    received: statement.received,
    variance: statement.variance,
    revision: statement.revision,
  };
}

function buildUpdateFulfillmentRecordsSql(records, _parameters) {
  if (records.length === 0) return "SELECT NULL::json AS result WHERE false";
  return `UPDATE fulfillment_records AS fulfillment
SET
  expected_qty = updates.expected_qty,
  status = updates.status,
  confirmed_by = COALESCE(updates.confirmed_by, fulfillment.confirmed_by),
  revision = fulfillment.revision + 1,
  updated_at = now()
FROM fulfillment_updates AS updates, write_guard AS guard
WHERE fulfillment.id = updates.id AND guard.ok
RETURNING ${fulfillmentRecordJsonExpression("fulfillment")} AS result`;
}

function buildInsertPriceSnapshotsSql(records, parameters) {
  if (records.length === 0) return "SELECT NULL::json AS result WHERE false";
  const values = records
    .map(
      (record) => `(
    ${parameters.text(record.priceSnapshotId)},
    ${parameters.text(record.orderLineId)},
    ${parameters.text(record.snapshotType)},
    ${parameters.integer(record.versionNo)},
    ${parameters.number(record.bagPrice)},
    ${parameters.number(record.printPrice)},
    ${parameters.number(record.otherFee)},
    ${parameters.number(record.adjustmentAmount)},
    ${parameters.integer(record.chargeableQty)},
    ${parameters.number(record.finalAmount)},
    ${parameters.nullableText(record.overrideReason)},
    ${parameters.nullableText(record.createdBy)},
    ${parameters.timestamp(record.createdAt)}
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
) SELECT input.*
FROM (VALUES
${values}
) AS input(
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
)
CROSS JOIN write_guard AS guard
WHERE guard.ok
ON CONFLICT (order_line_id, snapshot_type, version_no) DO UPDATE SET
  bag_price = EXCLUDED.bag_price,
  print_price = EXCLUDED.print_price,
  other_fee = EXCLUDED.other_fee,
  adjustment_amount = EXCLUDED.adjustment_amount,
  chargeable_qty = EXCLUDED.chargeable_qty,
  final_amount = EXCLUDED.final_amount,
  override_reason = EXCLUDED.override_reason
RETURNING ${priceSnapshotJsonExpression("price_snapshots")} AS result`;
}

function buildUpdateInventoryReservationsSql(records, _parameters) {
  if (records.length === 0) return "SELECT NULL::json AS result WHERE false";
  return `UPDATE inventory_reservations AS reservation
SET
  reserved_qty = updates.reserved_qty,
  status = updates.status,
  revision = reservation.revision + 1,
  updated_at = now()
FROM reservation_updates AS updates, write_guard AS guard
WHERE reservation.id = updates.id AND guard.ok
RETURNING ${inventoryReservationJsonExpression("reservation")} AS result`;
}

function buildUpdateInventoryItemsSql(records, _parameters) {
  if (records.length === 0) return "SELECT NULL::json AS result WHERE false";
  return `UPDATE inventory_items AS item
SET
  reserved_qty = item.reserved_qty + delta.reserved_qty_change,
  revision = item.revision + 1,
  updated_at = now()
FROM inventory_deltas AS delta, write_guard AS guard
WHERE item.id = delta.inventory_item_id AND guard.ok
RETURNING json_build_object(
  'inventoryItemId', item.id,
  'reservedQty', item.reserved_qty,
  'revision', item.revision
) AS result`;
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

function buildUpdateStatementLinesSql(records, _parameters) {
  if (records.length === 0) return "SELECT NULL::json AS result WHERE false";
  return `UPDATE statement_lines AS line
SET
  delivered_qty = updates.delivered_qty,
  chargeable_qty = updates.chargeable_qty,
  free_qty = updates.free_qty,
  amount = updates.amount,
  adjustment_amount = updates.adjustment_amount,
  final_amount = updates.final_amount,
  revision = line.revision + 1
FROM statement_line_updates AS updates, write_guard AS guard
WHERE line.id = updates.id AND guard.ok
RETURNING ${statementLineJsonExpression("line")} AS result`;
}

function buildUpdateStatementRecordsSql(records, _parameters) {
  if (records.length === 0) return "SELECT NULL::json AS result WHERE false";
  return `UPDATE statements AS statement
SET
  status = COALESCE(NULLIF(updates.status, ''), statement.status),
  receivable_amount = updates.receivable_amount,
  received_amount = updates.received_amount,
  variance_amount = updates.variance_amount,
  revision = statement.revision + 1,
  updated_at = now()
FROM statement_updates AS updates, write_guard AS guard
WHERE statement.id = updates.id AND guard.ok
RETURNING ${statementRecordJsonExpression("statement")} AS result`;
}

function buildFulfillmentUpdatesSql(records, parameters) {
  if (records.length === 0) {
    return "SELECT NULL::text AS id, NULL::integer AS expected_qty, NULL::text AS status, NULL::text AS confirmed_by, NULL::integer AS expected_revision WHERE false";
  }
  const values = records.map((record) => `(
    ${parameters.text(record.fulfillmentId)},
    ${parameters.integer(record.expectedQty)},
    ${parameters.text(record.status)},
    ${parameters.nullableText(record.confirmedBy)},
    ${parameters.integer(record.revision)}
  )`).join(",\n");
  return `SELECT * FROM (VALUES\n${values}\n) AS updates(id, expected_qty, status, confirmed_by, expected_revision)`;
}

function buildReservationUpdatesSql(records, parameters) {
  if (records.length === 0) {
    return "SELECT NULL::text AS id, NULL::integer AS reserved_qty, NULL::text AS status, NULL::integer AS expected_revision, NULL::integer AS expected_reserved_qty, NULL::text AS expected_status WHERE false";
  }
  const values = records.map((record) => `(
    ${parameters.text(record.reservationId)},
    ${parameters.integer(record.reservedQty)},
    ${parameters.text(record.status)},
    ${parameters.integer(record.revision)},
    ${parameters.integer(record.expectedReservedQty)},
    ${parameters.text(record.expectedStatus)}
  )`).join(",\n");
  return `SELECT * FROM (VALUES\n${values}\n) AS updates(id, reserved_qty, status, expected_revision, expected_reserved_qty, expected_status)`;
}

function buildInventoryDeltasSql(records, parameters) {
  if (records.length === 0) {
    return "SELECT NULL::text AS inventory_item_id, NULL::integer AS reserved_qty_change, NULL::integer AS expected_revision, NULL::integer AS expected_reserved_qty WHERE false";
  }
  const values = records.map((record) => `(
    ${parameters.text(record.inventoryItemId)},
    ${parameters.integer(record.reservedQtyChange)},
    ${parameters.integer(record.expectedRevision)},
    ${parameters.integer(record.expectedReservedQty)}
  )`).join(",\n");
  return `SELECT * FROM (VALUES\n${values}\n) AS delta(inventory_item_id, reserved_qty_change, expected_revision, expected_reserved_qty)`;
}

function buildStatementLineUpdatesSql(records, parameters) {
  if (records.length === 0) {
    return "SELECT NULL::text AS id, NULL::integer AS delivered_qty, NULL::integer AS chargeable_qty, NULL::integer AS free_qty, NULL::numeric AS amount, NULL::numeric AS adjustment_amount, NULL::numeric AS final_amount, NULL::integer AS expected_revision, NULL::integer AS expected_delivered_qty, NULL::integer AS expected_chargeable_qty, NULL::numeric AS expected_final_amount WHERE false";
  }
  const values = records.map((record) => `(
    ${parameters.text(record.statementLineId)},
    ${parameters.integer(record.deliveredQty)},
    ${parameters.integer(record.chargeableQty)},
    ${parameters.integer(record.freeQty)},
    ${parameters.number(record.amount)},
    ${parameters.number(record.adjustmentAmount)},
    ${parameters.number(record.finalAmount)},
    ${parameters.integer(record.expectedRevision)},
    ${parameters.integer(record.expectedDeliveredQty)},
    ${parameters.integer(record.expectedChargeableQty)},
    ${parameters.number(record.expectedFinalAmount)}
  )`).join(",\n");
  return `SELECT * FROM (VALUES\n${values}\n) AS updates(id, delivered_qty, chargeable_qty, free_qty, amount, adjustment_amount, final_amount, expected_revision, expected_delivered_qty, expected_chargeable_qty, expected_final_amount)`;
}

function buildStatementUpdatesSql(records, parameters) {
  if (records.length === 0) {
    return "SELECT NULL::text AS id, NULL::text AS status, NULL::numeric AS receivable_amount, NULL::numeric AS received_amount, NULL::numeric AS variance_amount, NULL::integer AS expected_revision WHERE false";
  }
  const values = records.map((record) => `(
    ${parameters.text(record.statementId)},
    ${parameters.nullableText(record.status)},
    ${parameters.number(record.receivable)},
    ${parameters.number(record.received)},
    ${parameters.number(record.variance)},
    ${parameters.integer(record.revision)}
  )`).join(",\n");
  return `SELECT * FROM (VALUES\n${values}\n) AS updates(id, status, receivable_amount, received_amount, variance_amount, expected_revision)`;
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
    'revision', ${alias}.revision,
    'createdBy', ${alias}.created_by,
    'createdAt', ${alias}.created_at,
    'closedAt', ${alias}.closed_at,
    'voidedAt', ${alias}.voided_at,
    'voidedBy', ${alias}.voided_by,
    'voidReason', ${alias}.void_reason
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
    'revision', ${alias}.revision,
    'latestNeededAt', ${alias}.latest_needed_at,
    'confirmedBy', ${alias}.confirmed_by,
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

function inventoryReservationJsonExpression(alias) {
  return `json_build_object(
    'reservationId', ${alias}.id,
    'orderLineId', ${alias}.order_line_id,
    'inventoryItemId', ${alias}.inventory_item_id,
    'reservedQty', ${alias}.reserved_qty,
    'reservationType', ${alias}.reservation_type,
    'status', ${alias}.status,
    'revision', ${alias}.revision,
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

function statementLineJsonExpression(alias) {
  return `json_build_object(
    'statementLineId', ${alias}.id,
    'statementId', ${alias}.statement_id,
    'orderLineId', ${alias}.order_line_id,
    'fulfillmentId', ${alias}.fulfillment_id,
    'deliveredQty', ${alias}.delivered_qty,
    'chargeableQty', ${alias}.chargeable_qty,
    'freeQty', ${alias}.free_qty,
    'amount', ${alias}.amount,
    'adjustmentAmount', ${alias}.adjustment_amount,
    'finalAmount', ${alias}.final_amount,
    'revision', ${alias}.revision,
    'createdAt', ${alias}.created_at
  )`;
}

function statementRecordJsonExpression(alias) {
  return `json_build_object(
    'statementId', ${alias}.id,
    'status', ${alias}.status,
    'receivable', ${alias}.receivable_amount,
    'received', ${alias}.received_amount,
    'variance', ${alias}.variance_amount,
    'revision', ${alias}.revision
  )`;
}

function upsertById(rows, row, getId = (value) => value?.id) {
  if (!row) return rows;
  const id = getId(row);
  if (!id) return rows;
  const index = rows.findIndex((item) => getId(item) === id);
  if (index < 0) return [row, ...rows];
  return rows.map((item, itemIndex) => (itemIndex === index ? { ...item, ...row } : item));
}

function normalizeTextArray(value) {
  if (Array.isArray(value)) return value.map((item) => String(item ?? "").trim()).filter(Boolean);
  if (typeof value === "string" && value.trim()) return [value.trim()];
  return [];
}

function normalizeObject(value) {
  if (value && typeof value === "object" && !Array.isArray(value)) return value;
  return {};
}

function toFiniteInteger(value) {
  const number = Math.trunc(Number(value ?? 0));
  return Number.isFinite(number) ? number : 0;
}

function toFiniteNumber(value) {
  const number = Number(value ?? 0);
  return Number.isFinite(number) ? number : 0;
}
