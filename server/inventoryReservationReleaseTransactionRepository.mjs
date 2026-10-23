import { resolveStoreMode } from "./storeMode.mjs";
import {
  buildPostgresIdempotencyRequest,
  resolveRepositoryIdempotencyKey,
  readPostgresIdempotencyReplay,
  buildIdempotencyRequestHash,
  buildIdempotencyConflictError,
  normalizeIdempotencyKey,
} from "./idempotency.mjs";
import { createPostgresParameterBinder } from "./postgresSqlParameters.mjs";
import { createPostgresTransactionExecutor } from "./postgresTransactionExecutor.mjs";

const releaseScope = "inventory.reservation.release";

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
      idempotentTransactionJson: options.idempotentTransactionJson,
      postgresClient: options.postgresClient,
    });
  }
  if (mode === "local") return createLocalInventoryReservationReleaseTransactionRepository();
  throw new Error(`Unsupported inventory reservation release transaction repository mode: ${mode}`);
}

export function createLocalInventoryReservationReleaseTransactionRepository() {
  const receipts = new Map();
  function readReplay({ idempotencyKey: suppliedKey, idempotencyPayload }) {
    const idempotencyKey = normalizeIdempotencyKey(suppliedKey);
    if (!idempotencyKey || !receipts.has(idempotencyKey)) return null;
    const saved = receipts.get(idempotencyKey);
    if (saved.hash !== buildIdempotencyRequestHash(idempotencyPayload)) throw buildIdempotencyConflictError();
    return structuredClone(saved.result);
  }
  return {
    readReplay,
    kind: "local_memory",

    releaseReservation(input) {
      const replay = readReplay(input);
      if (replay) return replay;
      assertReleaseInput(input, true);
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
      const idempotencyKey = normalizeIdempotencyKey(input.idempotencyKey);
      if (idempotencyKey) receipts.set(idempotencyKey, {
        hash: buildIdempotencyRequestHash(input.idempotencyPayload),
        result: structuredClone(transaction),
      });
      return transaction;
    },
  };
}

export function createPostgresInventoryReservationReleaseTransactionRepository(options = {}) {
  const { queryJson, idempotentTransactionJson } = createPostgresTransactionExecutor(options);
  function assertIdempotentExecutor(input) {
    if (input.idempotencyKey && (options.queryJson || options.transactionJson) && !options.idempotentTransactionJson && !options.postgresClient?.idempotentTransactionJson) {
      const error = new Error("Reservation release requires an atomic idempotent transaction executor.");
      error.code = "INVENTORY_RELEASE_IDEMPOTENCY_UNAVAILABLE";
      error.statusCode = 503;
      throw error;
    }
  }

  return {
    kind: "postgres",
    readReplay(input) {
      assertIdempotentExecutor(input);
      return readPostgresIdempotencyReplay({queryJson, scope: releaseScope, idempotencyKey: input.idempotencyKey, payload: input.idempotencyPayload});
    },

    async releaseReservation(input) {
      assertIdempotentExecutor(input);
      const query = buildReleaseInventoryReservationTransactionQuery(input);
      const saved = normalizeInventoryReservationReleaseTransactionResult(
        await idempotentTransactionJson(buildPostgresIdempotencyRequest({
          scope: releaseScope,
          idempotencyKey: resolveRepositoryIdempotencyKey(input.idempotencyKey, input.operationLog?.id),
          payload: input.idempotencyPayload ?? {reservation: input.reservation, inventoryAdjustment: input.inventoryAdjustment, operatorId: input.operationLog?.operatorId},
          operatorId: input.operationLog?.operatorId,
          targetType: "inventory_reservation", targetId: input.reservation?.reservationId,
          resourceLocks: [`inventory-reservation:${input.reservation?.reservationId}`, `inventory:${input.reservation?.inventoryItemId}`], query,
        })),
      );
      if (!saved.reservation) {
        throw new Error("PostgreSQL inventory reservation release transaction returned an invalid result");
      }
      // A concurrent identical request can replay inside the transaction after the
      // initial replay lookup. Its receipt must not apply the same cache delta twice.
      if (saved.operationLogId !== input.operationLog?.id
        || (input.workspace?.operationLogs ?? []).some((row) => row.id === saved.operationLogId)) return saved;
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
  assertReleaseInput(input);
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
WITH locked_reservation AS MATERIALIZED (
  SELECT * FROM inventory_reservations WHERE id = ${parameters.text(reservation.reservationId)} FOR UPDATE
), locked_inventory AS MATERIALIZED (
  SELECT * FROM inventory_items WHERE id = ${parameters.text(inventoryAdjustment.inventoryItemId)} FOR UPDATE
), release_guard AS MATERIALIZED (
  SELECT erp_require(COALESCE((SELECT
    r.order_line_id = ${parameters.text(reservation.orderLineId)}
    AND r.inventory_item_id = ${parameters.text(reservation.inventoryItemId)}
    AND r.reserved_qty = ${parameters.integer(reservation.reservedQty - inventoryAdjustment.reservedQtyChange)}
    AND r.status IN ('生效', 'active', 'reserved', '部分释放', 'partially_released')
    AND r.reservation_type <> '临时留货'
    AND i.reserved_qty = ${parameters.integer(inventoryLedgerEntry.qtyBefore)}
    AND i.reserved_qty >= r.reserved_qty
    FROM locked_reservation r CROSS JOIN locked_inventory i), false), 'ERP_INVENTORY_RESERVATION_RELEASE_CONFLICT') AS ok
), updated_inventory_reservation AS (
  UPDATE inventory_reservations
  SET
    reserved_qty = ${parameters.integer(reservation.reservedQty)},
    status = ${parameters.text(reservation.status)},
    updated_at = now()
  FROM release_guard
  WHERE id = ${parameters.text(reservation.reservationId)} AND release_guard.ok
  RETURNING ${inventoryReservationJsonExpression("inventory_reservations")} AS result
),
updated_inventory_item AS (
  UPDATE inventory_items AS item
  SET
    reserved_qty = item.reserved_qty + ${parameters.integer(inventoryAdjustment.reservedQtyChange)},
    updated_at = now()
  FROM release_guard
  WHERE item.id = ${parameters.text(inventoryAdjustment.inventoryItemId)} AND release_guard.ok
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
  RETURNING id
)
SELECT json_build_object(
  'reservation', (SELECT result FROM updated_inventory_reservation),
  'inventoryLedgerEntry', (SELECT result FROM inserted_inventory_ledger_entry),
  'operationLogId', (SELECT id FROM inserted_operation_log)
) AS result FROM release_guard WHERE release_guard.ok;
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

function assertReleaseInput(input, checkWorkspace = false) {
  const reservation = input.reservation;
  const adjustment = input.inventoryAdjustment;
  const ledger = input.inventoryLedgerEntry;
  const remaining = Number(reservation?.reservedQty);
  const change = Number(adjustment?.reservedQtyChange);
  const prior = remaining - change;
  const totalBefore = Number(ledger?.qtyBefore);
  const fail = () => { throw Object.assign(new Error("库存占用释放数据已变化或数量不一致，请刷新核对。"), { code: "ERP_INVENTORY_RESERVATION_RELEASE_CONFLICT", statusCode: 409 }); };
  if (![remaining, change, prior, totalBefore, Number(ledger?.qtyAfter)].every(Number.isSafeInteger) || remaining < 0 || change >= 0 || totalBefore < prior || ledger.qtyChange !== change || ledger.qtyAfter !== totalBefore + change || adjustment.inventoryItemId !== reservation.inventoryItemId || ledger.inventoryItemId !== reservation.inventoryItemId || reservation.status !== (remaining > 0 ? "部分释放" : "已释放")) fail();
  if (!checkWorkspace) return;
  const current = (input.workspace?.inventoryReservations ?? []).find((row) => (row.reservationId ?? row.id) === (reservation.reservationId ?? reservation.id));
  const inventory = (input.workspace?.inventories ?? []).find((row) => row.id === reservation.inventoryItemId);
  if (!current || !inventory || current.orderLineId !== reservation.orderLineId || current.inventoryItemId !== reservation.inventoryItemId || Number(current.reservedQty ?? current.qty) !== prior || !["生效", "active", "reserved", "部分释放", "partially_released"].includes(current.status) || current.reservationType === "临时留货" || Number(inventory.reserved) !== totalBefore) fail();
  if ((input.workspace.inventoryLedgers ?? []).some((row) => (row.ledgerId ?? row.id) === (ledger.ledgerId ?? ledger.id)) || (input.workspace.operationLogs ?? []).some((row) => row.id === input.operationLog?.id)) fail();
}
