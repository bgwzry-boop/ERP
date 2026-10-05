import { resolveStoreMode } from "./storeMode.mjs";
import { createPostgresParameterBinder } from "./postgresSqlParameters.mjs";
import { createPostgresTransactionExecutor } from "./postgresTransactionExecutor.mjs";

export function createInventoryReservationReleaseTransactionRepository(options = {}) {
  const mode = resolveStoreMode({
    explicitMode: options.mode,
    envKeys: ["ERP_INVENTORY_RESERVATION_RELEASE_TRANSACTION_STORE", "ERP_INVENTORY_STORE"],
    runtimeMode: options.runtimeMode,
    allowLocalFixture: options.allowLocalFixture,
  });
  if (mode === "postgres") {
    return createPostgresInventoryReservationReleaseTransactionRepository({
      databaseUrl: options.databaseUrl ?? process.env.ERP_INVENTORY_DATABASE_URL ?? process.env.DATABASE_URL ?? process.env.PGURL,
      queryJson: options.queryJson,
      transactionJson: options.transactionJson,
      postgresClient: options.postgresClient,
    });
  }
  if (mode === "local") return createLocalInventoryReservationReleaseTransactionRepository();
  throw new Error(`Unsupported inventory reservation release transaction repository mode: ${mode}`);
}

export function createLocalInventoryReservationReleaseTransactionRepository() {
  return {
    kind: "local_memory",

    releaseReservation(input) {
      const transaction = normalizeInventoryReservationReleaseTransactionResult({
        reservation: input.reservation,
        inventoryLedgerEntry: input.inventoryLedgerEntry,
        operationLogId: input.operationLog?.id ?? "",
      });
      applyInventoryReservationReleaseWorkspaceMutation({
        workspace: input.workspace,
        reservation: transaction.reservation,
        inventoryAdjustment: input.inventoryAdjustment,
        inventoryLedgerEntry: transaction.inventoryLedgerEntry,
        operationLog: input.operationLog,
      });
      return transaction;
    },
  };
}

export function createPostgresInventoryReservationReleaseTransactionRepository(options = {}) {
  const { transactionJson } = createPostgresTransactionExecutor(options);

  return {
    kind: "postgres",

    async releaseReservation(input) {
      const query = buildReleaseInventoryReservationTransactionQuery(input);
      const saved = normalizeInventoryReservationReleaseTransactionResult(
        await transactionJson(query.text, query.values),
      );
      if (!saved.reservation) {
        throw new Error("PostgreSQL inventory reservation release transaction returned an invalid result");
      }
      applyInventoryReservationReleaseWorkspaceMutation({
        workspace: input.workspace,
        reservation: saved.reservation,
        inventoryAdjustment: input.inventoryAdjustment,
        inventoryLedgerEntry: saved.inventoryLedgerEntry,
        operationLog: input.operationLog,
      });
      return saved;
    },
  };
}

export function buildReleaseInventoryReservationTransactionSql(input) {
  return buildReleaseInventoryReservationTransactionQuery(input).text;
}

export function buildReleaseInventoryReservationTransactionQuery(input) {
  const parameters = createPostgresParameterBinder();
  return {
    text: buildReleaseInventoryReservationTransactionText(input, parameters),
    values: parameters.values,
  };
}

function buildReleaseInventoryReservationTransactionText(input, parameters) {
  const reservation = normalizeInventoryReservation(input.reservation);
  const inventoryAdjustment = normalizeInventoryAdjustment(input.inventoryAdjustment);
  const inventoryLedgerEntry = normalizeInventoryLedgerEntry(input.inventoryLedgerEntry);
  const operationLog = normalizeOperationLogForPersistence(input.operationLog);
  if (!reservation || !inventoryAdjustment || !inventoryLedgerEntry || !operationLog) {
    throw new Error("Reservation, inventory adjustment, inventory ledger entry, and operation log are required");
  }

  return `
BEGIN;
WITH updated_inventory_reservation AS (
  UPDATE inventory_reservations
  SET
    reserved_qty = ${parameters.integer(reservation.reservedQty)},
    status = ${parameters.text(reservation.status)},
    updated_at = now()
  WHERE id = ${parameters.text(reservation.reservationId)}
  RETURNING ${inventoryReservationJsonExpression("inventory_reservations")} AS result
),
updated_inventory_item AS (
  UPDATE inventory_items AS item
  SET
    reserved_qty = GREATEST(0, item.reserved_qty + ${parameters.integer(inventoryAdjustment.reservedQtyChange)}),
    updated_at = now()
  WHERE item.id = ${parameters.text(inventoryAdjustment.inventoryItemId)}
  RETURNING json_build_object(
    'inventoryItemId', item.id,
    'reservedQty', item.reserved_qty
  ) AS result
),
inserted_inventory_ledger_entry AS (
  INSERT INTO inventory_ledger_entries (
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
  ) VALUES (
    ${parameters.text(inventoryLedgerEntry.ledgerId)},
    ${parameters.text(inventoryLedgerEntry.inventoryItemId)},
    ${parameters.text(inventoryLedgerEntry.changeType)},
    ${parameters.integer(inventoryLedgerEntry.qtyBefore)},
    ${parameters.integer(inventoryLedgerEntry.qtyChange)},
    ${parameters.integer(inventoryLedgerEntry.qtyAfter)},
    ${parameters.text(inventoryLedgerEntry.sourceType)},
    ${parameters.text(inventoryLedgerEntry.sourceId)},
    ${parameters.nullableText(inventoryLedgerEntry.operatorId)},
    ${parameters.nullableText(inventoryLedgerEntry.confirmedBy)},
    ${parameters.timestamp(inventoryLedgerEntry.occurredAt)},
    ${parameters.timestamp(inventoryLedgerEntry.createdAt)},
    ${parameters.nullableText(inventoryLedgerEntry.reason)},
    ${parameters.nullableText(inventoryLedgerEntry.remark)}
  )
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
  RETURNING ${inventoryLedgerJsonExpression("inventory_ledger_entries")} AS result
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
  'reservation', (SELECT result FROM updated_inventory_reservation),
  'inventoryLedgerEntry', (SELECT result FROM inserted_inventory_ledger_entry),
  'operationLogId', (SELECT id FROM inserted_operation_log)
) AS result;
COMMIT;
`.trim();
}

export function normalizeInventoryReservationReleaseTransactionResult(value) {
  if (!value || typeof value !== "object") {
    return { reservation: null, inventoryLedgerEntry: null, operationLogId: "" };
  }
  return {
    reservation: value.reservation ? normalizeInventoryReservation(value.reservation) : null,
    inventoryLedgerEntry: value.inventoryLedgerEntry
      ? normalizeInventoryLedgerEntry(value.inventoryLedgerEntry)
      : null,
    operationLogId: String(value.operationLogId ?? value.operation_log_id ?? "").trim(),
  };
}

function applyInventoryReservationReleaseWorkspaceMutation(input) {
  const workspace = input.workspace;
  if (!workspace) return;
  workspace.inventoryReservations = upsertById(
    workspace.inventoryReservations ?? [],
    toWorkspaceInventoryReservation(input.reservation),
  );
  applyWorkspaceInventoryAdjustment(workspace, input.inventoryAdjustment);
  if (input.inventoryLedgerEntry) {
    workspace.inventoryLedgers = upsertById(
      workspace.inventoryLedgers ?? [],
      toWorkspaceInventoryLedgerEntry(input.inventoryLedgerEntry),
    );
  }
  if (input.operationLog) {
    workspace.operationLogs = upsertById(workspace.operationLogs ?? [], input.operationLog);
  }
}

function applyWorkspaceInventoryAdjustment(workspace, inventoryAdjustment) {
  const normalized = normalizeInventoryAdjustment(inventoryAdjustment);
  if (!normalized || !Array.isArray(workspace.inventories)) return;
  workspace.inventories = workspace.inventories.map((inventory) => {
    if (inventory.id !== normalized.inventoryItemId) return inventory;
    return {
      ...inventory,
      reserved: Math.max(0, Number(inventory.reserved ?? 0) + normalized.reservedQtyChange),
    };
  });
}

function upsertById(rows, row, getId = (value) => value?.id) {
  if (!row) return rows;
  const id = getId(row);
  if (!id) return rows;
  const index = rows.findIndex((item) => getId(item) === id);
  if (index < 0) return [row, ...rows];
  return rows.map((item, itemIndex) => (itemIndex === index ? { ...item, ...row } : item));
}

function toWorkspaceInventoryReservation(record) {
  const normalized = normalizeInventoryReservation(record);
  if (!normalized) return null;
  return {
    id: normalized.reservationId,
    reservationId: normalized.reservationId,
    orderLineId: normalized.orderLineId,
    inventoryItemId: normalized.inventoryItemId,
    reservedQty: normalized.reservedQty,
    reservationType: normalized.reservationType,
    status: normalized.status,
    expiresAt: normalized.expiresAt,
    createdBy: normalized.createdBy,
    createdAt: normalized.createdAt,
  };
}

function toWorkspaceInventoryLedgerEntry(record) {
  const normalized = normalizeInventoryLedgerEntry(record);
  if (!normalized) return null;
  return { id: normalized.ledgerId, ...normalized };
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
    status: String(record.status ?? "").trim() || "生效",
    expiresAt: record.expiresAt ?? record.expires_at ?? "",
    createdBy: String(record.createdBy ?? record.created_by ?? "").trim(),
    createdAt: record.createdAt ?? record.created_at ?? new Date().toISOString(),
  };
}

function normalizeInventoryAdjustment(record) {
  if (!record || typeof record !== "object") return null;
  const inventoryItemId = String(record.inventoryItemId ?? record.inventory_item_id ?? "").trim();
  if (!inventoryItemId) return null;
  return {
    inventoryItemId,
    reservedQtyChange: toFiniteInteger(record.reservedQtyChange ?? record.reserved_qty_change ?? 0),
  };
}

function normalizeInventoryLedgerEntry(record) {
  if (!record || typeof record !== "object") return null;
  const ledgerId = String(record.ledgerId ?? record.id ?? "").trim();
  const inventoryItemId = String(record.inventoryItemId ?? record.inventory_item_id ?? "").trim();
  if (!ledgerId || !inventoryItemId) return null;
  return {
    ledgerId,
    inventoryItemId,
    changeType: String(record.changeType ?? record.change_type ?? "释放占用").trim() || "释放占用",
    qtyBefore: toFiniteInteger(record.qtyBefore ?? record.qty_before ?? 0),
    qtyChange: toFiniteInteger(record.qtyChange ?? record.qty_change ?? 0),
    qtyAfter: toFiniteInteger(record.qtyAfter ?? record.qty_after ?? 0),
    sourceType: String(record.sourceType ?? record.source_type ?? "inventory_reservation_release").trim() || "inventory_reservation_release",
    sourceId: String(record.sourceId ?? record.source_id ?? "").trim(),
    operatorId: String(record.operatorId ?? record.operator_id ?? "").trim(),
    confirmedBy: String(record.confirmedBy ?? record.confirmed_by ?? "").trim(),
    occurredAt: record.occurredAt ?? record.occurred_at ?? new Date().toISOString(),
    createdAt: record.createdAt ?? record.created_at ?? new Date().toISOString(),
    reason: String(record.reason ?? "").trim(),
    remark: String(record.remark ?? "").trim(),
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

function toFiniteInteger(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.trunc(number) : 0;
}
