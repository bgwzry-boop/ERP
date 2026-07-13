import { createPostgresParameterBinder } from "./postgresSqlParameters.mjs";
import { createPostgresTransactionExecutor } from "./postgresTransactionExecutor.mjs";
import { buildPostgresIdempotencyRequest, resolveRepositoryIdempotencyKey } from "./idempotency.mjs";
import { normalizeInventoryIntent } from "./inventoryIntentDomain.mjs";

export function createInventoryIntentTransactionRepository(options = {}) {
  const mode = options.mode ?? process.env.ERP_INVENTORY_INTENT_STORE ?? process.env.ERP_ORDER_STORE ?? "local";
  if (mode === "postgres") return createPostgresInventoryIntentTransactionRepository(options);
  if (mode === "local") return createLocalInventoryIntentTransactionRepository();
  throw new Error(`Unsupported inventory intent transaction repository mode: ${mode}`);
}

export function createLocalInventoryIntentTransactionRepository() {
  return {
    kind: "local_memory",
    createTemporaryHold(input) {
      const intent = findIntent(input.workspace, input.intent?.id);
      const item = findInventoryItem(input.workspace, input.inventoryItem?.id);
      assertCreateHoldState(intent, item, input);
      const savedIntent = {
        ...intent,
        intentStatus: "临时留货-生效",
        relatedReservationId: input.reservation.reservationId,
        revision: intent.revision + 1,
        updatedAt: input.updatedAt,
      };
      const savedReservation = normalizeReservation(input.reservation);
      const savedItem = {
        ...item,
        reserved: number(item.reserved ?? item.reservedQty) + savedReservation.reservedQty,
        reservedQty: number(item.reserved ?? item.reservedQty) + savedReservation.reservedQty,
        revision: Math.max(1, number(item.revision, 1)) + 1,
      };
      applyWorkspaceMutation(input.workspace, {
        intent: savedIntent,
        reservation: savedReservation,
        inventoryItem: savedItem,
        ledger: input.inventoryLedgerEntry,
        operationLog: input.operationLog,
      });
      return buildResult(savedIntent, savedReservation, savedItem, input.inventoryLedgerEntry, input.operationLog);
    },
    releaseTemporaryHold(input) {
      const reservation = findReservation(input.workspace, input.reservationId);
      const intent = findIntent(input.workspace, reservation?.sourceIntentId);
      const item = findInventoryItem(input.workspace, reservation?.inventoryItemId);
      assertReleaseHoldState(intent, reservation, item, input);
      const releasedQty = reservation.reservedQty;
      const savedIntent = {
        ...intent,
        intentStatus: input.targetStatus,
        revision: intent.revision + 1,
        updatedAt: input.updatedAt,
      };
      const savedReservation = { ...reservation, reservedQty: 0, qty: 0, status: input.targetStatus, revision: reservation.revision + 1 };
      const savedItem = {
        ...item,
        reserved: Math.max(0, number(item.reserved ?? item.reservedQty) - releasedQty),
        reservedQty: Math.max(0, number(item.reserved ?? item.reservedQty) - releasedQty),
        revision: Math.max(1, number(item.revision, 1)) + 1,
      };
      const ledger = { ...input.inventoryLedgerEntry, qtyChange: -releasedQty };
      applyWorkspaceMutation(input.workspace, {
        intent: savedIntent,
        reservation: savedReservation,
        inventoryItem: savedItem,
        ledger,
        operationLog: input.operationLog,
      });
      return buildResult(savedIntent, savedReservation, savedItem, ledger, input.operationLog);
    },
    extendTemporaryHold(input) {
      const reservation = findReservation(input.workspace, input.reservationId);
      const intent = findIntent(input.workspace, reservation?.sourceIntentId);
      assertExtendHoldState(intent, reservation, input);
      const savedIntent = { ...intent, revision: intent.revision + 1, updatedAt: input.updatedAt };
      const savedReservation = {
        ...reservation,
        expiresAt: input.expiresAt,
        revision: reservation.revision + 1,
      };
      applyWorkspaceMutation(input.workspace, {
        intent: savedIntent,
        reservation: savedReservation,
        operationLog: input.operationLog,
      });
      return buildResult(savedIntent, savedReservation, null, null, input.operationLog);
    },
  };
}

export function createPostgresInventoryIntentTransactionRepository(options = {}) {
  const { idempotentTransactionJson } = createPostgresTransactionExecutor(options);
  return {
    kind: "postgres",
    async createTemporaryHold(input) {
      return execute("inventory.intent.hold.create", input, buildCreateTemporaryHoldQuery(input));
    },
    async releaseTemporaryHold(input) {
      return execute("inventory.intent.hold.release", input, buildReleaseTemporaryHoldQuery(input));
    },
    async extendTemporaryHold(input) {
      return execute("inventory.intent.hold.extend", input, buildExtendTemporaryHoldQuery(input));
    },
  };

  async function execute(scope, input, query) {
    const result = normalizeTransactionResult(await idempotentTransactionJson(buildPostgresIdempotencyRequest({
      scope,
      idempotencyKey: resolveRepositoryIdempotencyKey(input.idempotencyKey, input.operationLog?.id),
      payload: input.idempotencyPayload ?? input,
      operatorId: input.operationLog?.operatorId,
      targetType: "inventory_intent",
      targetId: input.intent?.id ?? input.intentId ?? input.reservationId,
      resourceLocks: [
        `inventory-intent:${input.intent?.id ?? input.intentId ?? ""}`,
        `inventory-hold:${input.reservation?.reservationId ?? input.reservationId ?? ""}`,
        `inventory:${input.inventoryItem?.id ?? input.inventoryItemId ?? ""}`,
      ],
      query,
    })));
    if (!result.intent || !result.reservation) {
      throw new Error("PostgreSQL inventory intent transaction returned an invalid result");
    }
    applyWorkspaceMutation(input.workspace, result);
    return result;
  }
}

export function buildCreateTemporaryHoldQuery(input) {
  const intent = normalizeInventoryIntent(input.intent);
  const reservation = normalizeReservation(input.reservation);
  const inventoryItemId = cleanText(input.inventoryItem?.id ?? input.inventoryItemId);
  if (!intent || !reservation || !inventoryItemId) throw new Error("Intent, reservation, and inventory item are required");
  const parameters = createPostgresParameterBinder();
  const operationLog = normalizeOperationLog(input.operationLog);
  const ledger = normalizeLedger(input.inventoryLedgerEntry);
  return {
    text: `BEGIN;
WITH locked_intent AS MATERIALIZED (
  SELECT * FROM inventory_intents WHERE id = ${parameters.text(intent.id)} FOR UPDATE
),
locked_inventory AS MATERIALIZED (
  SELECT * FROM inventory_items WHERE id = ${parameters.text(inventoryItemId)} FOR UPDATE
),
write_guard AS MATERIALIZED (
  SELECT erp_require(
    EXISTS (
      SELECT 1 FROM locked_intent
      WHERE revision = ${parameters.integer(input.expectedRevision)}
        AND intent_type = 'temporary_hold'
        AND intent_status IN ('临时留货-待确认', '待创建留货')
    )
    AND EXISTS (
      SELECT 1 FROM locked_inventory
      WHERE on_hand_qty - reserved_qty - waiting_pickup_locked_qty - pending_handling_qty >= ${parameters.integer(reservation.reservedQty)}
    )
    AND NOT EXISTS (
      SELECT 1 FROM inventory_reservations
      WHERE source_intent_id = ${parameters.text(intent.id)} AND status = '生效'
    ),
    'ERP_TEMPORARY_HOLD_CONFLICT'
  ) AS ok
),
inserted_reservation AS (
  INSERT INTO inventory_reservations (
    id, order_line_id, source_intent_id, customer_id, source_message_id, inventory_item_id,
    reserved_qty, reservation_type, status, expires_at, metadata_json, revision,
    created_by, created_at, updated_at
  )
  SELECT
    ${parameters.text(reservation.reservationId)}, NULL, ${parameters.text(intent.id)},
    ${parameters.nullableText(intent.customerId)}, ${parameters.text(intent.sourceMessageId)},
    ${parameters.text(inventoryItemId)}, ${parameters.integer(reservation.reservedQty)},
    '临时留货', '生效', ${parameters.timestamp(reservation.expiresAt)},
    ${parameters.json(reservation.metadata)}, 1, ${parameters.nullableText(reservation.createdBy)},
    ${parameters.timestamp(reservation.createdAt)}, now()
  FROM write_guard WHERE ok
  ON CONFLICT (id) DO NOTHING
  RETURNING ${reservationJson("inventory_reservations")} AS result
),
updated_inventory AS (
  UPDATE inventory_items AS item
  SET reserved_qty = item.reserved_qty + ${parameters.integer(reservation.reservedQty)},
      revision = item.revision + 1,
      updated_at = now()
  FROM write_guard
  WHERE item.id = ${parameters.text(inventoryItemId)} AND write_guard.ok
    AND (SELECT COUNT(*) FROM inserted_reservation) = 1
  RETURNING ${inventoryJson("item")} AS result
),
updated_intent AS (
  UPDATE inventory_intents AS intent_row
  SET intent_status = '临时留货-生效',
      related_reservation_id = ${parameters.text(reservation.reservationId)},
      revision = intent_row.revision + 1,
      updated_at = ${parameters.timestamp(input.updatedAt)}
  FROM write_guard
  WHERE intent_row.id = ${parameters.text(intent.id)} AND write_guard.ok
    AND (SELECT COUNT(*) FROM inserted_reservation) = 1
  RETURNING ${intentJson("intent_row")} AS result
),
inserted_ledger AS (
  ${insertLedgerSql(ledger, parameters, "updated_inventory")}
),
inserted_log AS (
  ${insertOperationLogSql(operationLog, parameters, "updated_intent")}
),
result_guard AS MATERIALIZED (
  SELECT erp_require(
    (SELECT COUNT(*) FROM inserted_reservation) = 1
      AND (SELECT COUNT(*) FROM updated_inventory) = 1
      AND (SELECT COUNT(*) FROM updated_intent) = 1
      AND (SELECT COUNT(*) FROM inserted_ledger) = 1
      AND (SELECT COUNT(*) FROM inserted_log) = 1,
    'ERP_TEMPORARY_HOLD_WRITE_CONFLICT'
  ) AS ok
)
SELECT json_build_object(
  'intent', (SELECT result FROM updated_intent),
  'reservation', (SELECT result FROM inserted_reservation),
  'inventoryItem', (SELECT result FROM updated_inventory),
  'ledger', (SELECT result FROM inserted_ledger),
  'operationLogId', (SELECT id FROM inserted_log),
  'writeGuard', (SELECT ok FROM result_guard)
) AS result;
COMMIT;`,
    values: parameters.values,
  };
}

export function buildReleaseTemporaryHoldQuery(input) {
  const parameters = createPostgresParameterBinder();
  const operationLog = normalizeOperationLog(input.operationLog);
  const ledger = normalizeLedger(input.inventoryLedgerEntry);
  const targetStatus = input.targetStatus === "已过期" ? "已过期" : "已取消";
  return {
    text: `BEGIN;
WITH locked_reservation AS MATERIALIZED (
  SELECT * FROM inventory_reservations
  WHERE id = ${parameters.text(input.reservationId)}
  FOR UPDATE
),
locked_intent AS MATERIALIZED (
  SELECT intent_row.* FROM inventory_intents AS intent_row
  JOIN locked_reservation AS reservation ON reservation.source_intent_id = intent_row.id
  FOR UPDATE OF intent_row
),
locked_inventory AS MATERIALIZED (
  SELECT item.* FROM inventory_items AS item
  JOIN locked_reservation AS reservation ON reservation.inventory_item_id = item.id
  FOR UPDATE OF item
),
write_guard AS MATERIALIZED (
  SELECT erp_require(
    EXISTS (
      SELECT 1 FROM locked_reservation
      WHERE reservation_type = '临时留货' AND status = '生效' AND reserved_qty > 0
    )
    AND EXISTS (
      SELECT 1 FROM locked_intent
      WHERE revision = ${parameters.integer(input.expectedRevision)} AND intent_status = '临时留货-生效'
    )
    AND EXISTS (
      SELECT 1 FROM locked_inventory AS item
      JOIN locked_reservation AS reservation ON reservation.inventory_item_id = item.id
      WHERE item.reserved_qty >= reservation.reserved_qty
    ),
    'ERP_TEMPORARY_HOLD_RELEASE_CONFLICT'
  ) AS ok
),
updated_reservation AS (
  UPDATE inventory_reservations AS reservation
  SET reserved_qty = 0, status = ${parameters.text(targetStatus)}, revision = reservation.revision + 1, updated_at = now()
  FROM write_guard
  WHERE reservation.id = ${parameters.text(input.reservationId)} AND write_guard.ok
  RETURNING ${reservationJson("reservation")} AS result
),
updated_inventory AS (
  UPDATE inventory_items AS item
  SET reserved_qty = GREATEST(0, item.reserved_qty - reservation.reserved_qty),
      revision = item.revision + 1,
      updated_at = now()
  FROM locked_reservation AS reservation, write_guard
  WHERE item.id = reservation.inventory_item_id AND write_guard.ok
    AND (SELECT COUNT(*) FROM updated_reservation) = 1
  RETURNING ${inventoryJson("item")} AS result
),
updated_intent AS (
  UPDATE inventory_intents AS intent_row
  SET intent_status = ${parameters.text(targetStatus)}, revision = intent_row.revision + 1,
      updated_at = ${parameters.timestamp(input.updatedAt)}
  FROM locked_reservation AS reservation, write_guard
  WHERE intent_row.id = reservation.source_intent_id AND write_guard.ok
    AND (SELECT COUNT(*) FROM updated_reservation) = 1
  RETURNING ${intentJson("intent_row")} AS result
),
inserted_ledger AS (
  INSERT INTO inventory_ledger_entries (
    id, inventory_item_id, change_type, qty_before, qty_change, qty_after,
    source_type, source_id, operator_id, confirmed_by, occurred_at, created_at, reason, remark
  )
  SELECT
    ${parameters.text(ledger.ledgerId)}, reservation.inventory_item_id, ${parameters.text(ledger.changeType)},
    item.reserved_qty, -reservation.reserved_qty, item.reserved_qty - reservation.reserved_qty,
    ${parameters.text(ledger.sourceType)}, ${parameters.text(ledger.sourceId)},
    ${parameters.nullableText(ledger.operatorId)}, ${parameters.nullableText(ledger.confirmedBy)},
    ${parameters.timestamp(ledger.occurredAt)}, ${parameters.timestamp(ledger.createdAt)},
    ${parameters.nullableText(ledger.reason)}, ${parameters.nullableText(ledger.remark)}
  FROM locked_reservation AS reservation
  JOIN locked_inventory AS item ON item.id = reservation.inventory_item_id
  CROSS JOIN updated_intent
  ON CONFLICT (id) DO NOTHING
  RETURNING ${ledgerJson("inventory_ledger_entries")} AS result
),
inserted_log AS (
  ${insertOperationLogSql(operationLog, parameters, "updated_intent")}
),
result_guard AS MATERIALIZED (
  SELECT erp_require(
    (SELECT COUNT(*) FROM updated_reservation) = 1
      AND (SELECT COUNT(*) FROM updated_inventory) = 1
      AND (SELECT COUNT(*) FROM updated_intent) = 1
      AND (SELECT COUNT(*) FROM inserted_ledger) = 1
      AND (SELECT COUNT(*) FROM inserted_log) = 1,
    'ERP_TEMPORARY_HOLD_RELEASE_WRITE_CONFLICT'
  ) AS ok
)
SELECT json_build_object(
  'intent', (SELECT result FROM updated_intent),
  'reservation', (SELECT result FROM updated_reservation),
  'inventoryItem', (SELECT result FROM updated_inventory),
  'ledger', (SELECT result FROM inserted_ledger),
  'operationLogId', (SELECT id FROM inserted_log),
  'writeGuard', (SELECT ok FROM result_guard)
) AS result;
COMMIT;`,
    values: parameters.values,
  };
}

export function buildExtendTemporaryHoldQuery(input) {
  const parameters = createPostgresParameterBinder();
  const operationLog = normalizeOperationLog(input.operationLog);
  return {
    text: `BEGIN;
WITH locked_reservation AS MATERIALIZED (
  SELECT * FROM inventory_reservations WHERE id = ${parameters.text(input.reservationId)} FOR UPDATE
),
locked_intent AS MATERIALIZED (
  SELECT intent_row.* FROM inventory_intents AS intent_row
  JOIN locked_reservation AS reservation ON reservation.source_intent_id = intent_row.id
  FOR UPDATE OF intent_row
),
write_guard AS MATERIALIZED (
  SELECT erp_require(
    EXISTS (SELECT 1 FROM locked_reservation WHERE reservation_type = '临时留货' AND status = '生效')
      AND EXISTS (
        SELECT 1 FROM locked_intent
        WHERE revision = ${parameters.integer(input.expectedRevision)} AND intent_status = '临时留货-生效'
      ),
    'ERP_TEMPORARY_HOLD_EXTEND_CONFLICT'
  ) AS ok
),
updated_reservation AS (
  UPDATE inventory_reservations AS reservation
  SET expires_at = ${parameters.timestamp(input.expiresAt)}, revision = reservation.revision + 1, updated_at = now()
  FROM write_guard
  WHERE reservation.id = ${parameters.text(input.reservationId)} AND write_guard.ok
  RETURNING ${reservationJson("reservation")} AS result
),
updated_intent AS (
  UPDATE inventory_intents AS intent_row
  SET revision = intent_row.revision + 1, updated_at = ${parameters.timestamp(input.updatedAt)}
  FROM locked_reservation AS reservation, write_guard
  WHERE intent_row.id = reservation.source_intent_id AND write_guard.ok
    AND (SELECT COUNT(*) FROM updated_reservation) = 1
  RETURNING ${intentJson("intent_row")} AS result
),
inserted_log AS (
  ${insertOperationLogSql(operationLog, parameters, "updated_intent")}
),
result_guard AS MATERIALIZED (
  SELECT erp_require(
    (SELECT COUNT(*) FROM updated_reservation) = 1
      AND (SELECT COUNT(*) FROM updated_intent) = 1
      AND (SELECT COUNT(*) FROM inserted_log) = 1,
    'ERP_TEMPORARY_HOLD_EXTEND_WRITE_CONFLICT'
  ) AS ok
)
SELECT json_build_object(
  'intent', (SELECT result FROM updated_intent),
  'reservation', (SELECT result FROM updated_reservation),
  'inventoryItem', NULL,
  'ledger', NULL,
  'operationLogId', (SELECT id FROM inserted_log),
  'writeGuard', (SELECT ok FROM result_guard)
) AS result;
COMMIT;`,
    values: parameters.values,
  };
}

function assertCreateHoldState(intent, item, input) {
  if (!intent || !item) throw conflict("TEMPORARY_HOLD_NOT_FOUND");
  if (intent.revision !== input.expectedRevision || intent.intentType !== "temporary_hold"
    || !["临时留货-待确认", "待创建留货"].includes(intent.intentStatus)) {
    throw conflict("TEMPORARY_HOLD_CONFLICT");
  }
  if (findActiveIntentReservation(input.workspace, intent.id)) throw conflict("TEMPORARY_HOLD_ALREADY_ACTIVE");
  const available = number(item.onHandQty ?? item.inStock) - number(item.reserved ?? item.reservedQty)
    - number(item.waitingPickupLockedQty ?? item.locked) - number(item.pendingHandlingQty ?? item.pending);
  if (available < number(input.reservation?.reservedQty)) throw conflict("TEMPORARY_HOLD_INVENTORY_SHORTAGE");
}

function assertReleaseHoldState(intent, reservation, item, input) {
  if (!intent || !reservation || !item) throw conflict("TEMPORARY_HOLD_NOT_FOUND");
  if (intent.revision !== input.expectedRevision || intent.intentStatus !== "临时留货-生效"
    || reservation.reservationType !== "临时留货" || reservation.status !== "生效" || reservation.reservedQty <= 0) {
    throw conflict("TEMPORARY_HOLD_RELEASE_CONFLICT");
  }
}

function assertExtendHoldState(intent, reservation, input) {
  if (!intent || !reservation) throw conflict("TEMPORARY_HOLD_NOT_FOUND");
  if (intent.revision !== input.expectedRevision || intent.intentStatus !== "临时留货-生效"
    || reservation.reservationType !== "临时留货" || reservation.status !== "生效") {
    throw conflict("TEMPORARY_HOLD_EXTEND_CONFLICT");
  }
}

function normalizeTransactionResult(value) {
  if (!value || typeof value !== "object") return {};
  return {
    intent: normalizeInventoryIntent(value.intent),
    reservation: normalizeReservation(value.reservation),
    inventoryItem: normalizeInventoryItem(value.inventoryItem ?? value.inventory_item),
    ledger: normalizeLedger(value.ledger),
    operationLogId: cleanText(value.operationLogId ?? value.operation_log_id),
  };
}

function normalizeReservation(value) {
  if (!value || typeof value !== "object") return null;
  const reservationId = cleanText(value.reservationId ?? value.id);
  const sourceIntentId = cleanText(value.sourceIntentId ?? value.source_intent_id);
  const inventoryItemId = cleanText(value.inventoryItemId ?? value.inventory_item_id);
  if (!reservationId || !sourceIntentId || !inventoryItemId) return null;
  return {
    ...value,
    id: reservationId,
    reservationId,
    orderLineId: cleanText(value.orderLineId ?? value.order_line_id),
    sourceIntentId,
    customerId: cleanText(value.customerId ?? value.customer_id),
    sourceMessageId: cleanText(value.sourceMessageId ?? value.source_message_id),
    inventoryItemId,
    reservedQty: Math.max(0, number(value.reservedQty ?? value.reserved_qty ?? value.qty)),
    qty: Math.max(0, number(value.reservedQty ?? value.reserved_qty ?? value.qty)),
    reservationType: cleanText(value.reservationType ?? value.reservation_type) || "临时留货",
    status: cleanText(value.status) || "生效",
    expiresAt: normalizeTimestamp(value.expiresAt ?? value.expires_at),
    metadata: object(value.metadata ?? value.metadata_json),
    revision: Math.max(1, number(value.revision, 1)),
    createdBy: cleanText(value.createdBy ?? value.created_by),
    createdAt: normalizeTimestamp(value.createdAt ?? value.created_at),
  };
}

function normalizeInventoryItem(value) {
  if (!value || typeof value !== "object") return null;
  const id = cleanText(value.id ?? value.inventoryItemId ?? value.inventory_item_id);
  if (!id) return null;
  return {
    ...value,
    id,
    inventoryItemId: id,
    reserved: number(value.reserved ?? value.reservedQty ?? value.reserved_qty),
    reservedQty: number(value.reserved ?? value.reservedQty ?? value.reserved_qty),
    revision: Math.max(1, number(value.revision, 1)),
  };
}

function normalizeLedger(value) {
  if (!value || typeof value !== "object") return null;
  const ledgerId = cleanText(value.ledgerId ?? value.id);
  if (!ledgerId) return null;
  return {
    ...value,
    id: ledgerId,
    ledgerId,
    inventoryItemId: cleanText(value.inventoryItemId ?? value.inventory_item_id),
    changeType: cleanText(value.changeType ?? value.change_type),
    qtyBefore: number(value.qtyBefore ?? value.qty_before),
    qtyChange: number(value.qtyChange ?? value.qty_change),
    qtyAfter: number(value.qtyAfter ?? value.qty_after),
    sourceType: cleanText(value.sourceType ?? value.source_type),
    sourceId: cleanText(value.sourceId ?? value.source_id),
    operatorId: cleanText(value.operatorId ?? value.operator_id),
    confirmedBy: cleanText(value.confirmedBy ?? value.confirmed_by),
    occurredAt: normalizeTimestamp(value.occurredAt ?? value.occurred_at),
    createdAt: normalizeTimestamp(value.createdAt ?? value.created_at),
    reason: cleanText(value.reason),
    remark: cleanText(value.remark),
  };
}

function normalizeOperationLog(value) {
  if (!value || typeof value !== "object" || !cleanText(value.id)) throw new Error("Operation log is required");
  return {
    id: cleanText(value.id),
    targetType: cleanText(value.targetType),
    targetId: cleanText(value.targetId),
    action: cleanText(value.action),
    before: value.before ?? null,
    after: value.after ?? null,
    reason: cleanText(value.reason),
    operatorId: cleanText(value.operatorId),
    pageKey: cleanText(value.pageKey) || "api",
    occurredAt: normalizeTimestamp(value.occurredAt),
    createdAt: normalizeTimestamp(value.createdAt),
  };
}

function insertLedgerSql(ledger, parameters, dependency) {
  if (!ledger) throw new Error("Inventory ledger is required");
  return `INSERT INTO inventory_ledger_entries (
    id, inventory_item_id, change_type, qty_before, qty_change, qty_after,
    source_type, source_id, operator_id, confirmed_by, occurred_at, created_at, reason, remark
  )
  SELECT
    ${parameters.text(ledger.ledgerId)}, ${parameters.text(ledger.inventoryItemId)}, ${parameters.text(ledger.changeType)},
    ${parameters.integer(ledger.qtyBefore)}, ${parameters.integer(ledger.qtyChange)}, ${parameters.integer(ledger.qtyAfter)},
    ${parameters.text(ledger.sourceType)}, ${parameters.text(ledger.sourceId)},
    ${parameters.nullableText(ledger.operatorId)}, ${parameters.nullableText(ledger.confirmedBy)},
    ${parameters.timestamp(ledger.occurredAt)}, ${parameters.timestamp(ledger.createdAt)},
    ${parameters.nullableText(ledger.reason)}, ${parameters.nullableText(ledger.remark)}
  FROM ${dependency}
  ON CONFLICT (id) DO NOTHING
  RETURNING ${ledgerJson("inventory_ledger_entries")} AS result`;
}

function insertOperationLogSql(log, parameters, dependency) {
  return `INSERT INTO operation_logs (
    id, target_type, target_id, action, before_json, after_json, reason,
    operator_id, page_key, occurred_at, created_at
  )
  SELECT
    ${parameters.text(log.id)}, ${parameters.text(log.targetType)}, ${parameters.text(log.targetId)},
    ${parameters.text(log.action)}, ${parameters.json(log.before)}, ${parameters.json(log.after)},
    ${parameters.text(log.reason)}, ${parameters.nullableText(log.operatorId)}, ${parameters.text(log.pageKey)},
    ${parameters.timestamp(log.occurredAt)}, ${parameters.timestamp(log.createdAt)}
  FROM ${dependency}
  ON CONFLICT (id) DO NOTHING
  RETURNING id`;
}

function intentJson(alias) {
  return `json_build_object(
    'intentId', ${alias}.id, 'sourceDraftId', ${alias}.source_draft_id,
    'sourceMessageId', ${alias}.source_message_id, 'conversationId', ${alias}.conversation_id,
    'customerId', ${alias}.customer_id, 'intentType', ${alias}.intent_type,
    'intentStatus', ${alias}.intent_status, 'sourceText', ${alias}.source_text,
    'candidate', ${alias}.candidate_json, 'cancellationScope', ${alias}.cancellation_scope,
    'relatedReservationId', ${alias}.related_reservation_id,
    'relatedOrderLineId', ${alias}.related_order_line_id, 'revision', ${alias}.revision,
    'createdBy', ${alias}.created_by, 'createdAt', ${alias}.created_at, 'updatedAt', ${alias}.updated_at
  )`;
}

function reservationJson(alias) {
  return `json_build_object(
    'reservationId', ${alias}.id, 'orderLineId', ${alias}.order_line_id,
    'sourceIntentId', ${alias}.source_intent_id, 'customerId', ${alias}.customer_id,
    'sourceMessageId', ${alias}.source_message_id, 'inventoryItemId', ${alias}.inventory_item_id,
    'reservedQty', ${alias}.reserved_qty, 'reservationType', ${alias}.reservation_type,
    'status', ${alias}.status, 'expiresAt', ${alias}.expires_at,
    'metadata', ${alias}.metadata_json, 'revision', ${alias}.revision,
    'createdBy', ${alias}.created_by, 'createdAt', ${alias}.created_at
  )`;
}

function inventoryJson(alias) {
  return `json_build_object('inventoryItemId', ${alias}.id, 'reservedQty', ${alias}.reserved_qty, 'revision', ${alias}.revision)`;
}

function ledgerJson(alias) {
  return `json_build_object(
    'ledgerId', ${alias}.id, 'inventoryItemId', ${alias}.inventory_item_id,
    'changeType', ${alias}.change_type, 'qtyBefore', ${alias}.qty_before,
    'qtyChange', ${alias}.qty_change, 'qtyAfter', ${alias}.qty_after,
    'sourceType', ${alias}.source_type, 'sourceId', ${alias}.source_id,
    'operatorId', ${alias}.operator_id, 'confirmedBy', ${alias}.confirmed_by,
    'occurredAt', ${alias}.occurred_at, 'createdAt', ${alias}.created_at,
    'reason', ${alias}.reason, 'remark', ${alias}.remark
  )`;
}

function buildResult(intent, reservation, inventoryItem, ledger, operationLog) {
  return { intent, reservation, inventoryItem, ledger, operationLogId: operationLog?.id ?? "" };
}

function applyWorkspaceMutation(workspace, mutation) {
  if (!workspace) return;
  if (mutation.intent) workspace.inventoryIntents = upsert(workspace.inventoryIntents ?? [], mutation.intent);
  if (mutation.reservation) workspace.inventoryReservations = upsert(workspace.inventoryReservations ?? [], mutation.reservation);
  if (mutation.inventoryItem) workspace.inventories = upsert(workspace.inventories ?? [], mutation.inventoryItem);
  if (mutation.ledger) workspace.inventoryLedgers = upsert(workspace.inventoryLedgers ?? [], mutation.ledger);
  if (mutation.operationLog) workspace.operationLogs = upsert(workspace.operationLogs ?? [], mutation.operationLog);
}

function upsert(rows, row) {
  const id = cleanText(row?.id ?? row?.inventoryItemId ?? row?.ledgerId);
  if (!id) return rows;
  const index = rows.findIndex((item) => cleanText(item.id ?? item.inventoryItemId ?? item.ledgerId) === id);
  if (index < 0) return [row, ...rows];
  return rows.map((item, itemIndex) => itemIndex === index ? { ...item, ...row } : item);
}

function findIntent(workspace, id) {
  return normalizeInventoryIntent((workspace?.inventoryIntents ?? []).find((item) => item.id === id));
}

function findReservation(workspace, id) {
  return normalizeReservation((workspace?.inventoryReservations ?? []).find((item) => (item.id ?? item.reservationId) === id));
}

function findInventoryItem(workspace, id) {
  return normalizeInventoryItem((workspace?.inventories ?? []).find((item) => (item.id ?? item.inventoryItemId) === id));
}

function findActiveIntentReservation(workspace, intentId) {
  return (workspace?.inventoryReservations ?? []).find((item) => item.sourceIntentId === intentId && item.status === "生效");
}

function conflict(code) {
  const error = new Error(code);
  error.code = code;
  error.statusCode = 409;
  return error;
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function number(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : fallback;
}

function normalizeTimestamp(value) {
  const date = new Date(value ?? "");
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
}

function cleanText(value) {
  return String(value ?? "").trim();
}
