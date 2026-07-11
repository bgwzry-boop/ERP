import { createPostgresParameterBinder } from "./postgresSqlParameters.mjs";
import { createPostgresTransactionExecutor } from "./postgresTransactionExecutor.mjs";
import { buildPostgresIdempotencyRequest, resolveRepositoryIdempotencyKey } from "./idempotency.mjs";

export function createFulfillmentActionTransactionRepository(options = {}) {
  const mode =
    options.mode ??
    process.env.ERP_FULFILLMENT_ACTION_TRANSACTION_STORE ??
    process.env.ERP_FULFILLMENT_STORE ??
    "local";
  if (mode === "postgres") {
    return createPostgresFulfillmentActionTransactionRepository({
      databaseUrl:
        options.databaseUrl ?? process.env.ERP_FULFILLMENT_DATABASE_URL ?? process.env.DATABASE_URL ?? process.env.PGURL,
      queryJson: options.queryJson,
      transactionJson: options.transactionJson,
      idempotentTransactionJson: options.idempotentTransactionJson,
      postgresClient: options.postgresClient,
    });
  }
  if (mode === "local") return createLocalFulfillmentActionTransactionRepository();
  throw new Error(`Unsupported fulfillment action transaction repository mode: ${mode}`);
}

export function createLocalFulfillmentActionTransactionRepository() {
  return {
    kind: "local_memory",

    recordFulfillmentAction(input) {
      const transaction = normalizeFulfillmentActionTransactionResult({
        fulfillment: input.fulfillment,
        printRecord: input.printRecord ?? null,
        fulfillmentException: input.fulfillmentException ?? null,
        inventoryReservations: input.inventoryReservations ?? [],
        inventoryLedgerEntries: input.inventoryLedgerEntries ?? [],
        statement: input.statementCandidate?.statement ?? null,
        statementLine: input.statementCandidate?.statementLine ?? null,
        todo: input.todo ?? null,
        operationLogId: input.operationLog?.id ?? "",
      });
      applyFulfillmentActionWorkspaceMutation({
        workspace: input.workspace,
        fulfillment: input.fulfillment,
        printRecord: input.printRecord ?? null,
        fulfillmentException: input.fulfillmentException ?? null,
        inventoryReservations: input.inventoryReservations ?? [],
        inventoryLedgerEntries: input.inventoryLedgerEntries ?? [],
        inventoryAdjustments: input.inventoryAdjustments ?? [],
        statement: input.statementCandidate?.statement ?? null,
        statementLine: input.statementCandidate?.statementLine ?? null,
        todo: input.todo ?? null,
        operationLog: input.operationLog,
      });
      return transaction;
    },
  };
}

export function createPostgresFulfillmentActionTransactionRepository(options = {}) {
  const { idempotentTransactionJson } = createPostgresTransactionExecutor(options);

  return {
    kind: "postgres",

    async recordFulfillmentAction(input) {
      const query = buildRecordFulfillmentActionTransactionQuery(input);
      const fulfillmentId = input.fulfillment?.fulfillmentId ?? input.fulfillment?.id ?? "";
      const idempotencyRequest = buildPostgresIdempotencyRequest({
        scope: `fulfillment.${input.operationLog?.action || "action"}`,
        idempotencyKey: resolveRepositoryIdempotencyKey(input.idempotencyKey, input.operationLog?.id),
        payload: input.idempotencyPayload ?? buildFulfillmentActionIdempotencyPayload(input),
        operatorId: input.operationLog?.operatorId,
        targetType: "fulfillment",
        targetId: fulfillmentId,
        resourceLocks: [
          `fulfillment:${fulfillmentId}`,
          ...(input.inventoryReservations ?? []).map((item) => `reservation:${item.reservationId ?? item.id ?? ""}`),
          ...(input.inventoryAdjustments ?? []).map((item) => `inventory:${item.inventoryItemId ?? ""}`),
          ...(input.statementCandidate?.statement?.id ? [`statement:${input.statementCandidate.statement.id}`] : []),
        ],
        query,
      });
      const saved = normalizeFulfillmentActionTransactionResult(await idempotentTransactionJson(idempotencyRequest));
      if (!saved.fulfillment) {
        throw new Error("PostgreSQL fulfillment action transaction returned an invalid result");
      }
      applyFulfillmentActionWorkspaceMutation({
        workspace: input.workspace,
        fulfillment: { ...input.fulfillment, ...saved.fulfillment },
        printRecord: saved.printRecord ? { ...input.printRecord, ...saved.printRecord } : null,
        fulfillmentException: saved.fulfillmentException
          ? { ...input.fulfillmentException, ...saved.fulfillmentException }
          : null,
        inventoryReservations: saved.inventoryReservations,
        inventoryLedgerEntries: saved.inventoryLedgerEntries,
        inventoryItems: saved.inventoryItems,
        statement: saved.statement
          ? {
              ...input.statementCandidate?.statement,
              ...saved.statement,
              lineIds: [
                ...new Set([
                  ...(input.statementCandidate?.statement?.lineIds ?? []),
                  ...(saved.statement.lineIds ?? []),
                ]),
              ],
            }
          : null,
        statementLine: saved.statementLine ? { ...input.statementCandidate?.statementLine, ...saved.statementLine } : null,
        todo: saved.todo ? { ...input.todo, ...saved.todo } : null,
        operationLog: saved.operationLogId === input.operationLog?.id ? input.operationLog : null,
      });
      return saved;
    },
  };
}

function buildFulfillmentActionIdempotencyPayload(input = {}) {
  return {
    action: input.operationLog?.action,
    fulfillment: input.fulfillment,
    printRecord: input.printRecord,
    fulfillmentException: input.fulfillmentException,
    inventoryReservations: input.inventoryReservations,
    inventoryLedgerEntries: input.inventoryLedgerEntries,
    inventoryAdjustments: input.inventoryAdjustments,
    statementCandidate: input.statementCandidate,
    todo: input.todo,
  };
}

export function buildRecordFulfillmentActionTransactionSql(input) {
  return buildRecordFulfillmentActionTransactionQuery(input).text;
}

export function buildRecordFulfillmentActionTransactionQuery(input) {
  const parameters = createPostgresParameterBinder();
  return {
    text: buildRecordFulfillmentActionTransactionText(input, parameters),
    values: parameters.values,
  };
}

function buildRecordFulfillmentActionTransactionText(input, parameters) {
  const fulfillment = normalizeFulfillmentRecord(input.fulfillment);
  const printRecord = normalizePrintRecord(input.printRecord, input.operationLog?.operatorId);
  const fulfillmentException = normalizeFulfillmentException(input.fulfillmentException, input.operationLog?.operatorId);
  const inventoryReservations = normalizeInventoryReservations(input.inventoryReservations ?? []);
  const inventoryLedgerEntries = normalizeInventoryLedgerEntries(input.inventoryLedgerEntries ?? []);
  const inventoryAdjustments = normalizeInventoryAdjustments(input.inventoryAdjustments ?? []);
  const statementCandidate = normalizeStatementCandidate(input.statementCandidate);
  const todo = normalizeTodoForPersistence(input.todo, input.operationLog?.operatorId);
  const operationLog = normalizeOperationLogForPersistence(input.operationLog);
  if (!fulfillment || !operationLog) {
    throw new Error("Fulfillment and operation log are required for fulfillment action transaction");
  }

  return `
BEGIN;
WITH locked_fulfillment AS MATERIALIZED (
  SELECT id, revision
  FROM fulfillment_records
  WHERE id = ${parameters.text(fulfillment.fulfillmentId)}
  FOR UPDATE
),
reservation_updates AS MATERIALIZED (
  ${buildInventoryReservationUpdatesSql(inventoryReservations, parameters)}
),
locked_inventory_reservations AS MATERIALIZED (
  SELECT reservation.id
  FROM inventory_reservations AS reservation
  JOIN reservation_updates AS updates ON updates.id = reservation.id
  ORDER BY reservation.id
  FOR UPDATE OF reservation
),
inventory_deltas AS MATERIALIZED (
  ${buildInventoryAdjustmentDeltasSql(inventoryAdjustments, parameters)}
),
locked_inventory_items AS MATERIALIZED (
  SELECT
    item.id,
    item.on_hand_qty,
    item.reserved_qty,
    delta.on_hand_qty_change,
    delta.reserved_qty_change
  FROM inventory_items AS item
  JOIN inventory_deltas AS delta ON delta.inventory_item_id = item.id
  ORDER BY item.id
  FOR UPDATE OF item
),
fulfillment_write_guard AS MATERIALIZED (
  SELECT erp_require(
    (SELECT COUNT(*) FROM locked_fulfillment WHERE revision = ${parameters.integer(fulfillment.revision)}) = 1,
    'ERP_FULFILLMENT_CONCURRENCY_CONFLICT'
  ) AS ok
),
reservation_write_guard AS MATERIALIZED (
  SELECT erp_require(
    (SELECT COUNT(*) FROM locked_inventory_reservations) = (SELECT COUNT(*) FROM reservation_updates),
    'ERP_RESERVATION_CONCURRENCY_CONFLICT'
  ) AS ok
),
inventory_write_guard AS MATERIALIZED (
  SELECT erp_require(
    (SELECT COUNT(*) FROM locked_inventory_items) = (SELECT COUNT(*) FROM inventory_deltas)
      AND NOT EXISTS (
        SELECT 1
        FROM locked_inventory_items
        WHERE on_hand_qty + on_hand_qty_change < 0
           OR reserved_qty + reserved_qty_change < 0
      ),
    'ERP_INVENTORY_CONCURRENCY_CONFLICT'
  ) AS ok
),
updated_fulfillment AS (
  UPDATE fulfillment_records
  SET
    biz_no = ${parameters.text(fulfillment.bizNo)},
    customer_snapshot = ${parameters.json(fulfillment.customerSnapshot)},
    method = ${parameters.text(fulfillment.method)},
    expected_qty = ${parameters.integer(fulfillment.expectedQty)},
    actual_qty = ${parameters.nullableInteger(fulfillment.actualQty)},
    status = ${parameters.text(fulfillment.status)},
    latest_needed_at = COALESCE(${parameters.nullableTimestamp(fulfillment.latestNeededAt)}, latest_needed_at),
    delivered_at = COALESCE(${parameters.nullableTimestamp(fulfillment.deliveredAt)}, delivered_at),
    confirmed_at = COALESCE(${parameters.nullableTimestamp(fulfillment.confirmedAt)}, confirmed_at),
    confirmed_by = COALESCE(${parameters.nullableText(fulfillment.confirmedBy)}, confirmed_by),
    loaded_at = COALESCE(${parameters.nullableTimestamp(fulfillment.loadedAt)}, loaded_at),
    loaded_by = COALESCE(${parameters.nullableText(fulfillment.loadedBy)}, loaded_by),
    driver_remark = COALESCE(NULLIF(${parameters.text(fulfillment.driverRemark)}, ''), driver_remark),
    receiver_name = COALESCE(NULLIF(${parameters.text(fulfillment.receiverName)}, ''), receiver_name),
    paper_note_status = COALESCE(NULLIF(${parameters.text(fulfillment.paperNoteStatus)}, ''), paper_note_status),
    watermarked_photo_attached = ${parameters.boolean(fulfillment.watermarkedPhotoAttached)},
    watermarked_photo_attachment_id = ${parameters.text(fulfillment.watermarkedPhotoAttachmentId)},
    watermarked_photo_url = ${parameters.text(fulfillment.watermarkedPhotoUrl)},
    watermark_id = ${parameters.text(fulfillment.watermarkId)},
    watermark_text = ${parameters.text(fulfillment.watermarkText)},
    watermark_captured_at = ${parameters.nullableTimestamp(fulfillment.watermarkCapturedAt)},
    watermark_location_label = ${parameters.text(fulfillment.watermarkLocationLabel)},
    watermark_geo_point = ${parameters.text(fulfillment.watermarkGeoPoint)},
    watermark_address = ${parameters.text(fulfillment.watermarkAddress)},
    watermark_operator_id = ${parameters.nullableText(fulfillment.watermarkOperatorId)},
    watermark_operator_name = ${parameters.text(fulfillment.watermarkOperatorName)},
    signature_photo_attached = ${parameters.boolean(fulfillment.signaturePhotoAttached)},
    signature_photo_attachment_id = ${parameters.text(fulfillment.signaturePhotoAttachmentId)},
    delivery_evidence_review_status = ${parameters.text(fulfillment.deliveryEvidenceReviewStatus)},
    delivery_evidence_reviewed_at = ${parameters.nullableTimestamp(fulfillment.deliveryEvidenceReviewedAt)},
    delivery_evidence_reviewed_by = ${parameters.text(fulfillment.deliveryEvidenceReviewedBy)},
    delivery_evidence_reviewed_by_user_id = ${parameters.nullableText(fulfillment.deliveryEvidenceReviewedByUserId)},
    delivery_evidence_issue_reason = ${parameters.text(fulfillment.deliveryEvidenceIssueReason)},
    delivery_evidence_review_remark = ${parameters.text(fulfillment.deliveryEvidenceReviewRemark)},
    delivery_evidence_review_updated_at = ${parameters.nullableTimestamp(fulfillment.deliveryEvidenceReviewUpdatedAt)},
    revision = fulfillment_records.revision + 1,
    updated_at = now()
  FROM locked_fulfillment AS locked, fulfillment_write_guard AS guard
  WHERE fulfillment_records.id = locked.id AND guard.ok
  RETURNING ${fulfillmentJsonExpression("fulfillment_records")} AS result
),
inserted_print_record AS (
  ${buildInsertPrintRecordSql(printRecord, parameters)}
),
inserted_todo AS (
  ${buildInsertTodoSql(todo, parameters)}
),
inserted_fulfillment_exception AS (
  ${buildInsertFulfillmentExceptionSql(fulfillmentException, parameters)}
),
updated_inventory_reservations AS (
  ${buildUpdateInventoryReservationsSql(inventoryReservations)}
),
updated_inventory_items AS (
  ${buildUpdateInventoryItemsSql(inventoryAdjustments)}
),
inserted_inventory_ledger_entries AS (
  ${buildInsertInventoryLedgerEntriesSql(inventoryLedgerEntries, parameters)}
),
upserted_statement AS (
  ${buildUpsertStatementSql(statementCandidate?.statement, statementCandidate?.statementLine, parameters)}
),
inserted_statement_line AS (
  ${buildInsertStatementLineSql(statementCandidate?.statementLine, parameters)}
),
inserted_operation_log AS (
  ${buildInsertOperationLogSql(operationLog, parameters)}
)
SELECT json_build_object(
  'fulfillment', (SELECT result FROM updated_fulfillment),
  'printRecord', (SELECT result FROM inserted_print_record),
  'fulfillmentException', (SELECT result FROM inserted_fulfillment_exception),
  'inventoryReservations', (SELECT COALESCE(json_agg(result ORDER BY result->>'reservationId'), '[]'::json) FROM updated_inventory_reservations),
  'inventoryItems', (SELECT COALESCE(json_agg(result ORDER BY result->>'inventoryItemId'), '[]'::json) FROM updated_inventory_items),
  'inventoryLedgerEntries', (SELECT COALESCE(json_agg(result ORDER BY result->>'ledgerId'), '[]'::json) FROM inserted_inventory_ledger_entries),
  'statement', (SELECT result FROM upserted_statement),
  'statementLine', (SELECT result FROM inserted_statement_line),
  'todo', (SELECT result FROM inserted_todo),
  'operationLogId', (SELECT id FROM inserted_operation_log),
  'writeGuard', (
    SELECT fulfillment_guard.ok AND reservation_guard.ok AND inventory_guard.ok
    FROM fulfillment_write_guard AS fulfillment_guard,
         reservation_write_guard AS reservation_guard,
         inventory_write_guard AS inventory_guard
  )
) AS result;
COMMIT;
`.trim();
}

export function normalizeFulfillmentActionTransactionResult(value) {
  if (!value || typeof value !== "object") {
    return {
      fulfillment: null,
      printRecord: null,
      fulfillmentException: null,
      inventoryReservations: [],
      inventoryItems: [],
      inventoryLedgerEntries: [],
      statement: null,
      statementLine: null,
      todo: null,
      operationLogId: "",
    };
  }
  return {
    fulfillment: value.fulfillment ? normalizeFulfillmentRecord(value.fulfillment) : null,
    printRecord: value.printRecord ? normalizePrintRecord(value.printRecord) : null,
    fulfillmentException: value.fulfillmentException ? normalizeFulfillmentException(value.fulfillmentException) : null,
    inventoryReservations: normalizeInventoryReservations(value.inventoryReservations ?? value.inventory_reservations ?? []),
    inventoryItems: normalizeInventoryItems(value.inventoryItems ?? value.inventory_items ?? []),
    inventoryLedgerEntries: normalizeInventoryLedgerEntries(value.inventoryLedgerEntries ?? value.inventory_ledger_entries ?? []),
    statement: normalizeStatement(value.statement),
    statementLine: normalizeStatementLine(value.statementLine ?? value.statement_line),
    todo: value.todo ? normalizeTodoForPersistence(value.todo) : null,
    operationLogId: String(value.operationLogId ?? value.operation_log_id ?? ""),
  };
}

function applyFulfillmentActionWorkspaceMutation(input) {
  const workspace = input.workspace;
  if (!workspace) return;
  workspace.fulfillments = upsertById(workspace.fulfillments ?? [], toWorkspaceFulfillment(input.fulfillment));
  if (input.printRecord) {
    workspace.printRecords = upsertById(workspace.printRecords ?? [], input.printRecord, getPrintRecordId);
  }
  if (input.fulfillmentException) {
    workspace.fulfillmentExceptions = upsertById(
      workspace.fulfillmentExceptions ?? [],
      toWorkspaceFulfillmentException(input.fulfillmentException),
    );
  }
  if (Array.isArray(input.inventoryItems)) {
    applyWorkspaceInventoryItems(workspace, input.inventoryItems);
  } else {
    applyWorkspaceInventoryAdjustments(workspace, input.inventoryAdjustments ?? []);
  }
  for (const reservation of normalizeInventoryReservations(input.inventoryReservations ?? [])) {
    workspace.inventoryReservations = upsertById(
      workspace.inventoryReservations ?? [],
      toWorkspaceInventoryReservation(reservation),
    );
  }
  for (const ledgerEntry of normalizeInventoryLedgerEntries(input.inventoryLedgerEntries ?? [])) {
    workspace.inventoryLedgers = upsertById(workspace.inventoryLedgers ?? [], toWorkspaceInventoryLedgerEntry(ledgerEntry));
  }
  if (input.statement) {
    workspace.statements = upsertById(workspace.statements ?? [], input.statement);
  }
  if (input.statementLine) {
    workspace.statementLines = upsertById(workspace.statementLines ?? [], input.statementLine);
  }
  if (input.todo) {
    workspace.todos = upsertById(workspace.todos ?? [], input.todo);
  }
  if (input.operationLog) {
    workspace.operationLogs = upsertById(workspace.operationLogs ?? [], input.operationLog);
  }
}

function upsertById(rows, row, getId = (value) => value?.id) {
  if (!row) return rows;
  const id = getId(row);
  if (!id) return rows;
  const index = rows.findIndex((item) => getId(item) === id);
  if (index < 0) return [row, ...rows];
  return rows.map((item, itemIndex) => (itemIndex === index ? { ...item, ...row } : item));
}

function toWorkspaceFulfillment(fulfillment) {
  if (!fulfillment) return null;
  const normalized = normalizeFulfillmentRecord(fulfillment);
  return {
    ...fulfillment,
    id: normalized.fulfillmentId,
    lineId: fulfillment.lineId ?? normalized.orderLineId,
    customerId: normalized.customerId,
    method: normalized.method,
    qty: normalized.expectedQty,
    actualQty: normalized.actualQty,
    status: normalized.status,
    latest: fulfillment.latest ?? normalized.latestNeededAt,
    deliveredAt: fulfillment.deliveredAt ?? normalized.deliveredAt,
    confirmedAt: fulfillment.confirmedAt ?? normalized.confirmedAt,
    confirmedBy: fulfillment.confirmedBy ?? normalized.confirmedBy,
    loadedAt: fulfillment.loadedAt ?? normalized.loadedAt,
    loadedBy: fulfillment.loadedBy ?? normalized.loadedBy,
    driverRemark: fulfillment.driverRemark ?? normalized.driverRemark,
    receiverName: fulfillment.receiverName ?? normalized.receiverName,
    paperNoteStatus: fulfillment.paperNoteStatus ?? normalized.paperNoteStatus,
    watermarkedPhotoAttached: normalized.watermarkedPhotoAttached,
    watermarkedPhotoAttachmentId: normalized.watermarkedPhotoAttachmentId,
    watermarkedPhotoUrl: normalized.watermarkedPhotoUrl,
    watermarkId: normalized.watermarkId,
    watermarkText: normalized.watermarkText,
    watermarkCapturedAt: normalized.watermarkCapturedAt,
    watermarkLocationLabel: normalized.watermarkLocationLabel,
    watermarkGeoPoint: normalized.watermarkGeoPoint,
    watermarkAddress: normalized.watermarkAddress,
    watermarkOperatorId: normalized.watermarkOperatorId,
    watermarkOperatorName: normalized.watermarkOperatorName,
    signaturePhotoAttached: normalized.signaturePhotoAttached,
    signaturePhotoAttachmentId: normalized.signaturePhotoAttachmentId,
    deliveryEvidenceReviewStatus: normalized.deliveryEvidenceReviewStatus,
    deliveryEvidenceReviewedAt: normalized.deliveryEvidenceReviewedAt,
    deliveryEvidenceReviewedBy: normalized.deliveryEvidenceReviewedBy,
    deliveryEvidenceReviewedByUserId: normalized.deliveryEvidenceReviewedByUserId,
    deliveryEvidenceIssueReason: normalized.deliveryEvidenceIssueReason,
    deliveryEvidenceReviewRemark: normalized.deliveryEvidenceReviewRemark,
    deliveryEvidenceReviewUpdatedAt: normalized.deliveryEvidenceReviewUpdatedAt,
    revision: normalized.revision,
  };
}

function toWorkspaceFulfillmentException(fulfillmentException) {
  const normalized = normalizeFulfillmentException(fulfillmentException);
  if (!normalized) return null;
  return {
    ...fulfillmentException,
    id: fulfillmentException.id ?? normalized.exceptionId,
    exceptionId: normalized.exceptionId,
    fulfillmentId: normalized.fulfillmentId,
    exceptionType: normalized.exceptionType,
    expectedQty: normalized.expectedQty,
    actualQty: normalized.actualQty,
    reasonCode: normalized.reasonCode,
    reason: normalized.reason,
    status: normalized.status,
    todoId: normalized.todoId,
    reportedBy: normalized.reportedBy,
    occurredAt: normalized.occurredAt,
  };
}

function toWorkspaceInventoryReservation(record) {
  const normalized = normalizeInventoryReservation(record);
  if (!normalized) return null;
  return {
    ...record,
    id: normalized.reservationId,
    reservationId: normalized.reservationId,
    orderLineId: normalized.orderLineId,
    inventoryItemId: normalized.inventoryItemId,
    qty: normalized.reservedQty,
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
  return {
    ...record,
    id: normalized.ledgerId,
    ledgerId: normalized.ledgerId,
    inventoryItemId: normalized.inventoryItemId,
    changeType: normalized.changeType,
    qtyBefore: normalized.qtyBefore,
    qtyChange: normalized.qtyChange,
    qtyAfter: normalized.qtyAfter,
    sourceType: normalized.sourceType,
    sourceId: normalized.sourceId,
    operatorId: normalized.operatorId,
    confirmedBy: normalized.confirmedBy,
    occurredAt: normalized.occurredAt,
    createdAt: normalized.createdAt,
    reason: normalized.reason,
    remark: normalized.remark,
  };
}

function applyWorkspaceInventoryAdjustments(workspace, inventoryAdjustments) {
  const adjustments = normalizeInventoryAdjustments(inventoryAdjustments);
  if (!Array.isArray(workspace.inventories) || adjustments.length === 0) return;
  workspace.inventories = workspace.inventories.map((inventory) => {
    const matchingAdjustments = adjustments.filter((adjustment) => adjustment.inventoryItemId === inventory.id);
    if (matchingAdjustments.length === 0) return inventory;
    const onHandDelta = matchingAdjustments.reduce((sum, adjustment) => sum + adjustment.onHandQtyChange, 0);
    const reservedDelta = matchingAdjustments.reduce((sum, adjustment) => sum + adjustment.reservedQtyChange, 0);
    return {
      ...inventory,
      inStock: Math.max(0, Number(inventory.inStock ?? 0) + onHandDelta),
      reserved: Math.max(0, Number(inventory.reserved ?? 0) + reservedDelta),
    };
  });
}

function applyWorkspaceInventoryItems(workspace, inventoryItems) {
  const committedItems = new Map(normalizeInventoryItems(inventoryItems).map((item) => [item.inventoryItemId, item]));
  if (!Array.isArray(workspace.inventories) || committedItems.size === 0) return;
  workspace.inventories = workspace.inventories.map((inventory) => {
    const committed = committedItems.get(inventory.id ?? inventory.inventoryItemId);
    if (!committed) return inventory;
    return {
      ...inventory,
      inStock: committed.onHandQty,
      reserved: committed.reservedQty,
      revision: committed.revision,
    };
  });
}

function normalizeFulfillmentRecord(record) {
  if (!record || typeof record !== "object") return null;
  const fulfillmentId = String(record.fulfillmentId ?? record.id ?? "").trim();
  if (!fulfillmentId) return null;
  return {
    fulfillmentId,
    bizNo: String(record.bizNo ?? record.biz_no ?? fulfillmentId).trim() || fulfillmentId,
    orderLineId: String(record.orderLineId ?? record.order_line_id ?? record.lineId ?? "").trim(),
    customerId: String(record.customerId ?? record.customer_id ?? "").trim(),
    customerSnapshot: normalizeObject(record.customerSnapshot ?? record.customer_snapshot),
    method: String(record.method ?? "").trim(),
    expectedQty: toFiniteInteger(record.expectedQty ?? record.expected_qty ?? record.qty),
    actualQty: optionalInteger(record.actualQty ?? record.actual_qty),
    status: String(record.status ?? "").trim(),
    latestNeededAt: record.latestNeededAt ?? record.latest_needed_at ?? record.latest ?? "",
    deliveredAt: record.deliveredAt ?? record.delivered_at ?? "",
    confirmedAt: record.confirmedAt ?? record.confirmed_at ?? "",
    confirmedBy: String(record.confirmedBy ?? record.confirmed_by ?? "").trim(),
    loadedAt: record.loadedAt ?? record.loaded_at ?? "",
    loadedBy: String(record.loadedBy ?? record.loaded_by ?? "").trim(),
    driverRemark: String(record.driverRemark ?? record.driver_remark ?? "").trim(),
    receiverName: String(record.receiverName ?? record.receiver_name ?? "").trim(),
    paperNoteStatus: String(record.paperNoteStatus ?? record.paper_note_status ?? "").trim(),
    watermarkedPhotoAttached: record.watermarkedPhotoAttached === true || record.watermarked_photo_attached === true,
    watermarkedPhotoAttachmentId: String(record.watermarkedPhotoAttachmentId ?? record.watermarked_photo_attachment_id ?? "").trim(),
    watermarkedPhotoUrl: String(record.watermarkedPhotoUrl ?? record.watermarked_photo_url ?? "").trim(),
    watermarkId: String(record.watermarkId ?? record.watermark_id ?? "").trim(),
    watermarkText: String(record.watermarkText ?? record.watermark_text ?? "").trim(),
    watermarkCapturedAt: record.watermarkCapturedAt ?? record.watermark_captured_at ?? "",
    watermarkLocationLabel: String(record.watermarkLocationLabel ?? record.watermark_location_label ?? "").trim(),
    watermarkGeoPoint: String(record.watermarkGeoPoint ?? record.watermark_geo_point ?? "").trim(),
    watermarkAddress: String(record.watermarkAddress ?? record.watermark_address ?? "").trim(),
    watermarkOperatorId: String(record.watermarkOperatorId ?? record.watermark_operator_id ?? "").trim(),
    watermarkOperatorName: String(record.watermarkOperatorName ?? record.watermark_operator_name ?? "").trim(),
    signaturePhotoAttached: record.signaturePhotoAttached === true || record.signature_photo_attached === true,
    signaturePhotoAttachmentId: String(record.signaturePhotoAttachmentId ?? record.signature_photo_attachment_id ?? "").trim(),
    deliveryEvidenceReviewStatus: String(record.deliveryEvidenceReviewStatus ?? record.delivery_evidence_review_status ?? "").trim(),
    deliveryEvidenceReviewedAt: record.deliveryEvidenceReviewedAt ?? record.delivery_evidence_reviewed_at ?? "",
    deliveryEvidenceReviewedBy: String(record.deliveryEvidenceReviewedBy ?? record.delivery_evidence_reviewed_by ?? "").trim(),
    deliveryEvidenceReviewedByUserId: String(
      record.deliveryEvidenceReviewedByUserId ?? record.delivery_evidence_reviewed_by_user_id ?? "",
    ).trim(),
    deliveryEvidenceIssueReason: String(record.deliveryEvidenceIssueReason ?? record.delivery_evidence_issue_reason ?? "").trim(),
    deliveryEvidenceReviewRemark: String(record.deliveryEvidenceReviewRemark ?? record.delivery_evidence_review_remark ?? "").trim(),
    deliveryEvidenceReviewUpdatedAt: record.deliveryEvidenceReviewUpdatedAt ?? record.delivery_evidence_review_updated_at ?? "",
    revision: Math.max(1, toFiniteInteger(record.revision ?? 1)),
    createdBy: String(record.createdBy ?? record.created_by ?? "").trim(),
    createdAt: record.createdAt ?? record.created_at ?? "",
  };
}

function normalizeInventoryReservations(records) {
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
    expiresAt: record.expiresAt ?? record.expires_at ?? "",
    createdBy: String(record.createdBy ?? record.created_by ?? "").trim(),
    createdAt: record.createdAt ?? record.created_at ?? new Date().toISOString(),
  };
}

function normalizeInventoryLedgerEntries(records) {
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
    changeType: String(record.changeType ?? record.change_type ?? "出库扣减").trim() || "出库扣减",
    qtyBefore: toFiniteInteger(record.qtyBefore ?? record.qty_before ?? 0),
    qtyChange: toFiniteInteger(record.qtyChange ?? record.qty_change ?? 0),
    qtyAfter: toFiniteInteger(record.qtyAfter ?? record.qty_after ?? 0),
    sourceType: String(record.sourceType ?? record.source_type ?? "fulfillment_complete").trim() || "fulfillment_complete",
    sourceId: String(record.sourceId ?? record.source_id ?? "").trim(),
    operatorId: String(record.operatorId ?? record.operator_id ?? "").trim(),
    confirmedBy: String(record.confirmedBy ?? record.confirmed_by ?? "").trim(),
    occurredAt: record.occurredAt ?? record.occurred_at ?? new Date().toISOString(),
    createdAt: record.createdAt ?? record.created_at ?? new Date().toISOString(),
    reason: String(record.reason ?? "").trim(),
    remark: String(record.remark ?? "").trim(),
  };
}

function normalizeInventoryAdjustments(records) {
  if (!Array.isArray(records)) return [];
  return records.map((record) => normalizeInventoryAdjustment(record)).filter(Boolean);
}

function normalizeInventoryItems(records) {
  if (!Array.isArray(records)) return [];
  return records
    .map((record) => {
      const inventoryItemId = String(record?.inventoryItemId ?? record?.inventory_item_id ?? record?.id ?? "").trim();
      if (!inventoryItemId) return null;
      return {
        inventoryItemId,
        onHandQty: toFiniteInteger(record.onHandQty ?? record.on_hand_qty ?? record.inStock ?? 0),
        reservedQty: toFiniteInteger(record.reservedQty ?? record.reserved_qty ?? record.reserved ?? 0),
        revision: Math.max(1, toFiniteInteger(record.revision ?? 1)),
      };
    })
    .filter(Boolean);
}

function normalizeInventoryAdjustment(record) {
  if (!record || typeof record !== "object") return null;
  const inventoryItemId = String(record.inventoryItemId ?? record.inventory_item_id ?? "").trim();
  if (!inventoryItemId) return null;
  return {
    inventoryItemId,
    onHandQtyChange: toFiniteInteger(record.onHandQtyChange ?? record.on_hand_qty_change ?? 0),
    reservedQtyChange: toFiniteInteger(record.reservedQtyChange ?? record.reserved_qty_change ?? 0),
  };
}

function normalizePrintRecord(record, fallbackOperatorId = "") {
  if (!record || typeof record !== "object") return null;
  const printRecordId = String(record.printRecordId ?? record.id ?? "").trim();
  if (!printRecordId) return null;
  const status = String(record.status ?? "").trim() || "previewed";
  const printAction = String(record.printAction ?? record.print_action ?? "first_print").trim() || "first_print";
  const operatorId = String(record.operatorId ?? record.printedBy ?? record.printed_by ?? fallbackOperatorId ?? "").trim();
  const printDeviceSnapshot = normalizeObject(
    record.printDeviceSnapshot ?? record.printerDeviceSnapshot ?? record.printer_device_snapshot,
  );
  return {
    printRecordId,
    bizNo: String(record.bizNo ?? record.biz_no ?? printRecordId).trim() || printRecordId,
    targetType: String(record.targetType ?? record.target_type ?? "fulfillment").trim() || "fulfillment",
    targetId: String(record.targetId ?? record.target_id ?? "").trim(),
    templateId: String(record.templateId ?? record.template_id ?? "").trim(),
    printDeviceId: String(record.printDeviceId ?? record.printerDeviceId ?? record.printer_device_id ?? "").trim(),
    printDeviceName: String(record.printDeviceName ?? record.printerDeviceName ?? printDeviceSnapshot.name ?? "").trim(),
    printDeviceSnapshot,
    batchNo: String(record.batchNo ?? record.batch_no ?? "").trim(),
    status,
    printAction,
    operatorId,
    printedBy: operatorId,
    printedAt: record.printedAt ?? record.printed_at ?? (["printed", "reprinted"].includes(status) ? new Date().toISOString() : ""),
    previousPrintRecordId: String(record.previousPrintRecordId ?? record.previous_print_record_id ?? "").trim(),
    reprintReason: String(record.reprintReason ?? record.reprint_reason ?? "").trim(),
    voidReason: String(record.voidReason ?? record.void_reason ?? "").trim(),
    relatedPrintRecordId: String(record.relatedPrintRecordId ?? record.replacedById ?? record.replaced_by_id ?? "").trim(),
    voidedBy: String(record.voidedBy ?? record.voided_by ?? "").trim(),
    voidedAt: record.voidedAt ?? record.voided_at ?? "",
    createdAt: record.createdAt ?? record.created_at ?? new Date().toISOString(),
  };
}

function normalizeFulfillmentException(record, fallbackOperatorId = "") {
  if (!record || typeof record !== "object") return null;
  const exceptionId = String(record.exceptionId ?? record.id ?? "").trim();
  if (!exceptionId) return null;
  const reasonCode = String(record.reasonCode ?? record.reason_code ?? "").trim();
  const reasonText = String(record.reasonText ?? record.reason ?? "").trim() || reasonCode || "other";
  return {
    exceptionId,
    fulfillmentId: String(record.fulfillmentId ?? record.fulfillment_id ?? "").trim(),
    exceptionType: String(record.exceptionType ?? record.exception_type ?? "quantity_mismatch").trim(),
    expectedQty: optionalInteger(record.expectedQty ?? record.expected_qty),
    actualQty: optionalInteger(record.actualQty ?? record.actual_qty),
    reasonCode: reasonCode || reasonText,
    reason: reasonText,
    status: String(record.status ?? "").trim() || "待办公室处理",
    todoId: String(record.todoId ?? record.todo_id ?? "").trim(),
    reportedBy: String(record.reportedBy ?? record.reported_by ?? fallbackOperatorId ?? "").trim(),
    occurredAt: record.occurredAt ?? record.occurred_at ?? record.createdAt ?? record.created_at ?? new Date().toISOString(),
    createdAt: record.createdAt ?? record.created_at ?? new Date().toISOString(),
  };
}

function normalizeStatementCandidate(candidate) {
  if (!candidate || typeof candidate !== "object") return null;
  const statement = normalizeStatement(candidate.statement);
  if (!statement) return null;
  return {
    statement,
    statementLine: normalizeStatementLine(candidate.statementLine),
    alreadyLinked: candidate.alreadyLinked === true,
  };
}

function normalizeStatement(record) {
  if (!record || typeof record !== "object") return null;
  const id = String(record.id ?? record.statementId ?? record.statement_id ?? "").trim();
  const customerId = String(record.customerId ?? record.customer_id ?? "").trim();
  if (!id || !customerId) return null;
  const period = String(record.period ?? "").trim();
  const periodDates = period.match(/(\d{4}-\d{2}-\d{2}|\d{2}-\d{2}).*?(\d{4}-\d{2}-\d{2}|\d{2}-\d{2})/);
  const createdAtMs = Date.parse(String(record.createdAt ?? record.created_at ?? ""));
  const fallbackYear = Number.isFinite(createdAtMs) ? new Date(createdAtMs).getUTCFullYear() : new Date().getUTCFullYear();
  const periodStart = normalizeStatementDate(record.periodStart ?? record.period_start ?? periodDates?.[1], fallbackYear);
  const periodEnd = normalizeStatementDate(record.periodEnd ?? record.period_end ?? periodDates?.[2], fallbackYear);
  return {
    ...record,
    id,
    statementId: id,
    bizNo: String(record.bizNo ?? record.biz_no ?? id).trim() || id,
    customerId,
    periodStart,
    periodEnd,
    period: period || `${periodStart} 至 ${periodEnd}`,
    status: String(record.status ?? "待生成").trim() || "待生成",
    receivable: toFiniteNumber(record.receivable ?? record.receivableAmount ?? record.receivable_amount, 0),
    received: toFiniteNumber(record.received ?? record.receivedAmount ?? record.received_amount, 0),
    variance: toFiniteNumber(record.variance ?? record.varianceAmount ?? record.variance_amount, 0),
    lineIds: Array.isArray(record.lineIds) ? [...record.lineIds] : [],
    sent: record.sent === true,
    createdBy: String(record.createdBy ?? record.created_by ?? "").trim(),
    createdAt: record.createdAt ?? record.created_at ?? new Date().toISOString(),
  };
}

function normalizeStatementLine(record) {
  if (!record || typeof record !== "object") return null;
  const id = String(record.id ?? record.statementLineId ?? record.statement_line_id ?? "").trim();
  const statementId = String(record.statementId ?? record.statement_id ?? "").trim();
  const orderLineId = String(record.orderLineId ?? record.order_line_id ?? "").trim();
  if (!id || !statementId || !orderLineId) return null;
  return {
    ...record,
    id,
    statementLineId: id,
    statementId,
    orderLineId,
    fulfillmentId: String(record.fulfillmentId ?? record.fulfillment_id ?? "").trim(),
    deliveredQty: toFiniteInteger(record.deliveredQty ?? record.delivered_qty, 0),
    chargeableQty: toFiniteInteger(record.chargeableQty ?? record.chargeable_qty, 0),
    freeQty: toFiniteInteger(record.freeQty ?? record.free_qty, 0),
    amount: toFiniteNumber(record.amount, 0),
    adjustmentAmount: toFiniteNumber(record.adjustmentAmount ?? record.adjustment_amount, 0),
    finalAmount: toFiniteNumber(record.finalAmount ?? record.final_amount ?? record.amount, 0),
    createdAt: record.createdAt ?? record.created_at ?? new Date().toISOString(),
  };
}

function normalizeStatementDate(value, fallbackYear) {
  const text = String(value ?? "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  if (/^\d{2}-\d{2}$/.test(text)) return `${fallbackYear}-${text}`;
  return `${fallbackYear}-01-01`;
}

function normalizeTodoForPersistence(todo, fallbackOperatorId = "") {
  if (!todo || typeof todo !== "object") return null;
  const id = String(todo.id ?? "").trim();
  if (!id) return null;
  return {
    id,
    bizNo: String(todo.bizNo ?? todo.biz_no ?? id).trim() || id,
    type: String(todo.type ?? "").trim(),
    refType: String(todo.refType ?? todo.ref_type ?? inferTodoRefType(todo)).trim(),
    refId: String(todo.refId ?? todo.ref_id ?? todo.ref ?? "").trim(),
    priority: mapTodoPriority(todo.priority ?? todo.urgency),
    status: String(todo.status ?? "未处理").trim() || "未处理",
    summary: String(todo.summary ?? "").trim(),
    dueAt: todo.dueAt ?? todo.due_at ?? todo.latest ?? "",
    remindAt: todo.remindAt ?? todo.remind_at ?? "",
    handledBy: String(todo.handledBy ?? todo.handled_by ?? "").trim(),
    handledAt: todo.handledAt ?? todo.handled_at ?? "",
    handlingResult: String(todo.handlingResult ?? todo.handling_result ?? "").trim(),
    createdBy: String(todo.createdBy ?? todo.created_by ?? fallbackOperatorId ?? "").trim(),
    createdAt: todo.createdAt ?? todo.created_at ?? new Date().toISOString(),
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

function buildUpdateInventoryReservationsSql(records) {
  if (records.length === 0) return "SELECT NULL::json AS result WHERE false";
  return `UPDATE inventory_reservations AS reservation
SET
  reserved_qty = updates.reserved_qty,
  status = updates.status,
  updated_at = now()
FROM reservation_updates AS updates, reservation_write_guard AS guard
WHERE reservation.id = updates.id AND guard.ok
RETURNING ${inventoryReservationJsonExpression("reservation")} AS result`;
}

function buildUpdateInventoryItemsSql(records) {
  if (records.length === 0) return "SELECT NULL::json AS result WHERE false";
  return `UPDATE inventory_items AS item
SET
  on_hand_qty = item.on_hand_qty + delta.on_hand_qty_change,
  reserved_qty = item.reserved_qty + delta.reserved_qty_change,
  revision = item.revision + 1,
  updated_at = now()
FROM inventory_deltas AS delta, inventory_write_guard AS guard
WHERE item.id = delta.inventory_item_id AND guard.ok
RETURNING json_build_object(
  'inventoryItemId', item.id,
  'onHandQty', item.on_hand_qty,
  'reservedQty', item.reserved_qty,
  'revision', item.revision
) AS result`;
}

function buildInventoryReservationUpdatesSql(records, parameters) {
  if (records.length === 0) {
    return "SELECT NULL::text AS id, 0::integer AS reserved_qty, NULL::text AS status WHERE false";
  }
  const values = records
    .map(
      (record) => `(${parameters.text(record.reservationId)}, ${parameters.integer(record.reservedQty)}, ${parameters.text(record.status)})`,
    )
    .join(",\n");
  return `SELECT id, reserved_qty, status
FROM (VALUES
${values}
) AS updates(id, reserved_qty, status)`;
}

function buildInventoryAdjustmentDeltasSql(records, parameters) {
  if (records.length === 0) {
    return "SELECT NULL::text AS inventory_item_id, 0::integer AS on_hand_qty_change, 0::integer AS reserved_qty_change WHERE false";
  }
  const values = records
    .map(
      (record) =>
        `(${parameters.text(record.inventoryItemId)}, ${parameters.integer(record.onHandQtyChange)}, ${parameters.integer(record.reservedQtyChange)})`,
    )
    .join(",\n");
  return `SELECT
  inventory_item_id,
  SUM(on_hand_qty_change)::integer AS on_hand_qty_change,
  SUM(reserved_qty_change)::integer AS reserved_qty_change
FROM (VALUES
${values}
) AS raw(inventory_item_id, on_hand_qty_change, reserved_qty_change)
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

function buildInsertPrintRecordSql(printRecord, parameters) {
  if (!printRecord) return "SELECT NULL::json AS result WHERE false";
  return `INSERT INTO print_records (
  id,
  biz_no,
  target_type,
  target_id,
  template_id,
  printer_device_id,
  printer_device_snapshot,
  batch_no,
  print_action,
  status,
  void_reason,
  replaced_by_id,
  printed_by,
  printed_at,
  created_at
) VALUES (
  ${parameters.text(printRecord.printRecordId)},
  ${parameters.text(printRecord.bizNo)},
  ${parameters.text(printRecord.targetType)},
  ${parameters.text(printRecord.targetId)},
  ${parameters.nullableText(printRecord.templateId)},
  ${parameters.nullableText(printRecord.printDeviceId)},
  ${parameters.json(printRecord.printDeviceSnapshot)},
  ${parameters.nullableText(printRecord.batchNo)},
  ${parameters.text(printRecord.printAction)},
  ${parameters.text(printRecord.status)},
  ${parameters.nullableText(printRecord.voidReason)},
  ${parameters.nullableText(printRecord.relatedPrintRecordId)},
  ${parameters.nullableText(printRecord.printedBy)},
  ${parameters.nullableTimestamp(printRecord.printedAt)},
  ${parameters.timestamp(printRecord.createdAt)}
)
ON CONFLICT (id) DO UPDATE SET
  target_type = EXCLUDED.target_type,
  target_id = EXCLUDED.target_id,
  template_id = EXCLUDED.template_id,
  printer_device_id = EXCLUDED.printer_device_id,
  printer_device_snapshot = EXCLUDED.printer_device_snapshot,
  batch_no = EXCLUDED.batch_no,
  print_action = EXCLUDED.print_action,
  status = EXCLUDED.status,
  void_reason = EXCLUDED.void_reason,
  replaced_by_id = EXCLUDED.replaced_by_id,
  printed_by = EXCLUDED.printed_by,
  printed_at = EXCLUDED.printed_at
RETURNING ${printRecordJsonExpression("print_records")} AS result`;
}

function buildInsertFulfillmentExceptionSql(fulfillmentException, parameters) {
  if (!fulfillmentException) return "SELECT NULL::json AS result WHERE false";
  return `INSERT INTO fulfillment_exceptions (
  id,
  fulfillment_id,
  exception_type,
  expected_qty,
  actual_qty,
  reason_code,
  reason,
  status,
  todo_id,
  reported_by,
  occurred_at,
  created_at,
  updated_at
) VALUES (
  ${parameters.text(fulfillmentException.exceptionId)},
  ${parameters.text(fulfillmentException.fulfillmentId)},
  ${parameters.text(fulfillmentException.exceptionType)},
  ${parameters.nullableInteger(fulfillmentException.expectedQty)},
  ${parameters.nullableInteger(fulfillmentException.actualQty)},
  ${parameters.text(fulfillmentException.reasonCode)},
  ${parameters.text(fulfillmentException.reason)},
  ${parameters.text(fulfillmentException.status)},
  ${parameters.nullableText(fulfillmentException.todoId)},
  ${parameters.nullableText(fulfillmentException.reportedBy)},
  ${parameters.timestamp(fulfillmentException.occurredAt)},
  ${parameters.timestamp(fulfillmentException.createdAt)},
  now()
)
ON CONFLICT (id) DO UPDATE SET
  exception_type = EXCLUDED.exception_type,
  expected_qty = EXCLUDED.expected_qty,
  actual_qty = EXCLUDED.actual_qty,
  reason_code = EXCLUDED.reason_code,
  reason = EXCLUDED.reason,
  status = EXCLUDED.status,
  todo_id = EXCLUDED.todo_id,
  reported_by = EXCLUDED.reported_by,
  occurred_at = EXCLUDED.occurred_at,
  updated_at = now()
RETURNING ${fulfillmentExceptionJsonExpression("fulfillment_exceptions")} AS result`;
}

function buildInsertTodoSql(todo, parameters) {
  if (!todo) return "SELECT NULL::json AS result WHERE false";
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
) VALUES (
  ${parameters.text(todo.id)},
  ${parameters.text(todo.bizNo)},
  ${parameters.text(todo.type)},
  ${parameters.text(todo.refType)},
  ${parameters.text(todo.refId)},
  ${parameters.text(todo.priority)},
  ${parameters.text(todo.status)},
  ${parameters.text(todo.summary)},
  ${parameters.nullableTimestamp(todo.dueAt)},
  ${parameters.nullableTimestamp(todo.remindAt)},
  ${parameters.nullableText(todo.handledBy)},
  ${parameters.nullableTimestamp(todo.handledAt)},
  ${parameters.nullableText(todo.handlingResult)},
  ${parameters.nullableText(todo.createdBy)},
  ${parameters.timestamp(todo.createdAt)},
  now()
)
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

function buildUpsertStatementSql(statement, statementLine, parameters) {
  if (!statement) return "SELECT NULL::text AS id, NULL::json AS result WHERE false";
  const receivableIncrement = statementLine
    ? `CASE WHEN EXISTS (
      SELECT 1 FROM statement_lines WHERE order_line_id = ${parameters.text(statementLine.orderLineId)}
    ) THEN 0 ELSE ${parameters.number(statementLine.finalAmount)} END`
    : "0";
  return `INSERT INTO statements (
  id,
  biz_no,
  customer_id,
  period_start,
  period_end,
  status,
  receivable_amount,
  received_amount,
  variance_amount,
  created_by,
  created_at,
  updated_at
) VALUES (
  ${parameters.text(statement.id)},
  ${parameters.text(statement.bizNo)},
  ${parameters.text(statement.customerId)},
  ${parameters.text(statement.periodStart)}::date,
  ${parameters.text(statement.periodEnd)}::date,
  ${parameters.text(statement.status)},
  ${receivableIncrement},
  ${parameters.number(statement.received)},
  ${parameters.number(statement.variance)},
  ${parameters.nullableText(statement.createdBy)},
  ${parameters.timestamp(statement.createdAt)},
  now()
)
ON CONFLICT (id) DO UPDATE SET
  receivable_amount = statements.receivable_amount + EXCLUDED.receivable_amount,
  updated_at = CASE WHEN EXCLUDED.receivable_amount <> 0 THEN now() ELSE statements.updated_at END
RETURNING id, ${statementJsonExpression("statements")} AS result`;
}

function buildInsertStatementLineSql(statementLine, parameters) {
  if (!statementLine) return "SELECT NULL::json AS result WHERE false";
  return `INSERT INTO statement_lines (
  id,
  statement_id,
  order_line_id,
  fulfillment_id,
  delivered_qty,
  chargeable_qty,
  free_qty,
  amount,
  adjustment_amount,
  final_amount,
  created_at
)
SELECT
  ${parameters.text(statementLine.id)},
  upserted_statement.id,
  ${parameters.text(statementLine.orderLineId)},
  ${parameters.nullableText(statementLine.fulfillmentId)},
  ${parameters.integer(statementLine.deliveredQty)},
  ${parameters.integer(statementLine.chargeableQty)},
  ${parameters.integer(statementLine.freeQty)},
  ${parameters.number(statementLine.amount)},
  ${parameters.number(statementLine.adjustmentAmount)},
  ${parameters.number(statementLine.finalAmount)},
  ${parameters.timestamp(statementLine.createdAt)}
FROM upserted_statement
WHERE NOT EXISTS (
  SELECT 1 FROM statement_lines WHERE order_line_id = ${parameters.text(statementLine.orderLineId)}
)
RETURNING ${statementLineJsonExpression("statement_lines")} AS result`;
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

function fulfillmentJsonExpression(alias) {
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
    'deliveredAt', ${alias}.delivered_at,
    'confirmedAt', ${alias}.confirmed_at,
    'confirmedBy', ${alias}.confirmed_by,
    'loadedAt', ${alias}.loaded_at,
    'loadedBy', ${alias}.loaded_by,
    'driverRemark', ${alias}.driver_remark,
    'receiverName', ${alias}.receiver_name,
    'paperNoteStatus', ${alias}.paper_note_status,
    'watermarkedPhotoAttached', ${alias}.watermarked_photo_attached,
    'watermarkedPhotoAttachmentId', ${alias}.watermarked_photo_attachment_id,
    'watermarkedPhotoUrl', ${alias}.watermarked_photo_url,
    'watermarkId', ${alias}.watermark_id,
    'watermarkText', ${alias}.watermark_text,
    'watermarkCapturedAt', ${alias}.watermark_captured_at,
    'watermarkLocationLabel', ${alias}.watermark_location_label,
    'watermarkGeoPoint', ${alias}.watermark_geo_point,
    'watermarkAddress', ${alias}.watermark_address,
    'watermarkOperatorId', ${alias}.watermark_operator_id,
    'watermarkOperatorName', ${alias}.watermark_operator_name,
    'signaturePhotoAttached', ${alias}.signature_photo_attached,
    'signaturePhotoAttachmentId', ${alias}.signature_photo_attachment_id,
    'deliveryEvidenceReviewStatus', ${alias}.delivery_evidence_review_status,
    'deliveryEvidenceReviewedAt', ${alias}.delivery_evidence_reviewed_at,
    'deliveryEvidenceReviewedBy', ${alias}.delivery_evidence_reviewed_by,
    'deliveryEvidenceReviewedByUserId', ${alias}.delivery_evidence_reviewed_by_user_id,
    'deliveryEvidenceIssueReason', ${alias}.delivery_evidence_issue_reason,
    'deliveryEvidenceReviewRemark', ${alias}.delivery_evidence_review_remark,
    'deliveryEvidenceReviewUpdatedAt', ${alias}.delivery_evidence_review_updated_at,
    'revision', ${alias}.revision,
    'createdBy', ${alias}.created_by,
    'createdAt', ${alias}.created_at
  )`;
}

function printRecordJsonExpression(alias) {
  return `json_build_object(
    'printRecordId', ${alias}.id,
    'bizNo', ${alias}.biz_no,
    'targetType', ${alias}.target_type,
    'targetId', ${alias}.target_id,
    'templateId', ${alias}.template_id,
    'printDeviceId', ${alias}.printer_device_id,
    'printDeviceSnapshot', ${alias}.printer_device_snapshot,
    'batchNo', ${alias}.batch_no,
    'status', ${alias}.status,
    'printAction', ${alias}.print_action,
    'operatorId', ${alias}.printed_by,
    'printedAt', ${alias}.printed_at,
    'voidReason', ${alias}.void_reason,
    'relatedPrintRecordId', ${alias}.replaced_by_id,
    'createdAt', ${alias}.created_at
  )`;
}

function fulfillmentExceptionJsonExpression(alias) {
  return `json_build_object(
    'exceptionId', ${alias}.id,
    'fulfillmentId', ${alias}.fulfillment_id,
    'exceptionType', ${alias}.exception_type,
    'expectedQty', ${alias}.expected_qty,
    'actualQty', ${alias}.actual_qty,
    'reasonCode', ${alias}.reason_code,
    'reason', ${alias}.reason,
    'status', ${alias}.status,
    'todoId', ${alias}.todo_id,
    'reportedBy', ${alias}.reported_by,
    'occurredAt', ${alias}.occurred_at,
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

function statementJsonExpression(alias) {
  return `json_build_object(
    'id', ${alias}.id,
    'statementId', ${alias}.id,
    'customerId', ${alias}.customer_id,
    'periodStart', ${alias}.period_start,
    'periodEnd', ${alias}.period_end,
    'period', CONCAT(${alias}.period_start::text, ' 至 ', ${alias}.period_end::text),
    'status', ${alias}.status,
    'receivable', ${alias}.receivable_amount,
    'received', ${alias}.received_amount,
    'variance', ${alias}.variance_amount,
    'lineIds', (SELECT COALESCE(json_agg(line.order_line_id ORDER BY line.created_at, line.id), '[]'::json) FROM statement_lines AS line WHERE line.statement_id = ${alias}.id),
    'createdBy', ${alias}.created_by,
    'createdAt', ${alias}.created_at
  )`;
}

function statementLineJsonExpression(alias) {
  return `json_build_object(
    'id', ${alias}.id,
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
    'createdAt', ${alias}.created_at
  )`;
}


function normalizeObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value;
}

function getPrintRecordId(value) {
  return value?.printRecordId ?? value?.id;
}

function inferTodoRefType(todo) {
  const ref = String(todo.ref ?? todo.refId ?? todo.ref_id ?? "").trim();
  if (ref.startsWith("ST-")) return "statement";
  if (ref.startsWith("DRAFT")) return "order_draft";
  if (ref.startsWith("F")) return "fulfillment";
  return "order_line";
}

function mapTodoPriority(value) {
  const map = {
    急: "urgent",
    今天: "urgent",
    异常: "exception",
    关注: "management_watch",
    普通: "normal",
  };
  return map[String(value ?? "").trim()] ?? String(value ?? "normal").trim() ?? "normal";
}

function optionalInteger(value) {
  if (value === null || value === undefined || value === "") return null;
  return toFiniteInteger(value);
}

function toFiniteInteger(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.trunc(number);
}

function toFiniteNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}
