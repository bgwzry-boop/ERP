import { createPostgresPoolClient } from "./postgresPoolClient.mjs";
import { createPostgresParameterBinder } from "./postgresSqlParameters.mjs";
import { createPostgresTransactionExecutor } from "./postgresTransactionExecutor.mjs";
import {
  buildIdempotencyRequestHash,
  buildIdempotencyConflictError,
  buildPostgresIdempotencyRequest,
  resolveRepositoryIdempotencyKey,
} from "./idempotency.mjs";

export function createInventoryCorrectionTransactionRepository(options = {}) {
  const mode = options.mode ?? process.env.ERP_INVENTORY_CORRECTION_STORE ?? process.env.ERP_INVENTORY_STORE ?? "local";
  if (mode === "postgres") return createPostgresInventoryCorrectionTransactionRepository(options);
  if (mode === "local") return createLocalInventoryCorrectionTransactionRepository();
  throw new Error(`Unsupported inventory correction transaction repository mode: ${mode}`);
}

export function createLocalInventoryCorrectionTransactionRepository() {
  const idempotencyResults = new Map();
  return {
    kind: "local_memory",
    async getCorrectionDraft({ workspace, correctionDraftId }) {
      return findById(workspace.inventoryCorrectionDrafts, correctionDraftId, "correctionDraftId");
    },
    async createCorrectionDraft(input = {}) {
      const replay = readLocalIdempotencyResult(idempotencyResults, "inventory.correction.create", input);
      if (replay) return replay;
      applyCreateMutation(input);
      const result = {
        correctionDraft: input.correctionDraft,
        todo: input.todo,
        todoEventId: input.todoEvent?.eventId ?? "",
        operationLogId: input.operationLog?.id ?? "",
      };
      saveLocalIdempotencyResult(idempotencyResults, "inventory.correction.create", input, result);
      return result;
    },
    async linkCorrectionAttachments(input = {}) {
      const replay = readLocalIdempotencyResult(idempotencyResults, "inventory.correction.attachments.link", input);
      if (replay) return replay;
      applyLinkMutation(input);
      const result = {
        correctionDraft: input.correctionDraft,
        attachmentIds: textList(input.attachmentIds),
        operationLogId: input.operationLog?.id ?? "",
      };
      saveLocalIdempotencyResult(idempotencyResults, "inventory.correction.attachments.link", input, result);
      return result;
    },
    async confirmCorrectionDraft(input = {}) {
      const replay = readLocalIdempotencyResult(idempotencyResults, "inventory.correction.confirm", input);
      if (replay) return replay;
      applyConfirmMutation(input);
      const result = {
        correctionDraft: input.correctionDraft,
        inventoryItem: input.inventoryItem,
        inventoryLedger: input.inventoryLedger,
        todo: input.todo,
        todoEventId: input.todoEvent?.eventId ?? "",
        operationLogId: input.operationLog?.id ?? "",
      };
      saveLocalIdempotencyResult(idempotencyResults, "inventory.correction.confirm", input, result);
      return result;
    },
  };
}

function readLocalIdempotencyResult(store, scope, input) {
  const key = resolveRepositoryIdempotencyKey(input.idempotencyKey, input.operationLog?.id);
  const existing = store.get(`${scope}:${key}`);
  if (!existing) return null;
  if (existing.requestHash !== buildIdempotencyRequestHash(input.idempotencyPayload)) {
    throw buildIdempotencyConflictError();
  }
  return structuredClone(existing.result);
}

function saveLocalIdempotencyResult(store, scope, input, result) {
  const key = resolveRepositoryIdempotencyKey(input.idempotencyKey, input.operationLog?.id);
  store.set(`${scope}:${key}`, {
    requestHash: buildIdempotencyRequestHash(input.idempotencyPayload),
    result: structuredClone(result),
  });
}

export function createPostgresInventoryCorrectionTransactionRepository(options = {}) {
  const databaseUrl = options.databaseUrl;
  const postgresClient =
    options.postgresClient ?? (options.queryJson || options.transactionJson ? null : createPostgresPoolClient({ databaseUrl }));
  const queryJson = options.queryJson ?? ((text, values) => postgresClient.queryJson(text, values));
  const { idempotentTransactionJson } = createPostgresTransactionExecutor({ ...options, databaseUrl, postgresClient });

  return {
    kind: "postgres",
    async getCorrectionDraft({ correctionDraftId }) {
      const query = buildGetInventoryCorrectionDraftQuery(correctionDraftId);
      return normalizeCorrectionDraft(await queryJson(query.text, query.values));
    },
    async createCorrectionDraft(input = {}) {
      const query = buildCreateInventoryCorrectionDraftTransactionQuery(input);
      const result = normalizeCreateResult(
        await idempotentTransactionJson(
          buildPostgresIdempotencyRequest({
            scope: "inventory.correction.create",
            idempotencyKey: resolveRepositoryIdempotencyKey(input.idempotencyKey, input.operationLog?.id),
            payload: input.idempotencyPayload ?? { correctionDraft: input.correctionDraft },
            operatorId: input.operationLog?.operatorId,
            targetType: "inventory_correction",
            targetId: input.correctionDraft?.correctionDraftId ?? input.correctionDraft?.id,
            resourceLocks: [
              `inventory-item:${input.correctionDraft?.inventoryItemId ?? ""}`,
              `inventory-correction:${input.correctionDraft?.correctionDraftId ?? input.correctionDraft?.id ?? ""}`,
              `todo:${input.todo?.id ?? ""}`,
            ],
            query,
          }),
        ),
        input,
      );
      if (!result.correctionDraft || !result.todo) throw new Error("PostgreSQL correction draft create returned invalid data");
      applyCreateMutation({
        ...input,
        correctionDraft: result.correctionDraft,
        todo: result.todo,
        todoEvent: result.todoEventId === input.todoEvent?.eventId ? input.todoEvent : null,
        operationLog: result.operationLogId === input.operationLog?.id ? input.operationLog : null,
      });
      return result;
    },
    async linkCorrectionAttachments(input = {}) {
      const query = buildLinkInventoryCorrectionAttachmentsTransactionQuery(input);
      const result = normalizeLinkResult(
        await idempotentTransactionJson(
          buildPostgresIdempotencyRequest({
            scope: "inventory.correction.attachments.link",
            idempotencyKey: resolveRepositoryIdempotencyKey(input.idempotencyKey, input.operationLog?.id),
            payload: input.idempotencyPayload ?? {
              correctionDraft: input.correctionDraft,
              attachmentIds: input.attachmentIds,
            },
            operatorId: input.operationLog?.operatorId,
            targetType: "inventory_correction",
            targetId: input.correctionDraft?.correctionDraftId ?? input.correctionDraft?.id,
            resourceLocks: [
              `inventory-correction:${input.correctionDraft?.correctionDraftId ?? input.correctionDraft?.id ?? ""}`,
              ...textList(input.attachmentIds).map((attachmentId) => `attachment:${attachmentId}`),
            ],
            query,
          }),
        ),
        input,
      );
      if (!result.correctionDraft) throw new Error("PostgreSQL correction attachment link returned invalid data");
      applyLinkMutation({
        ...input,
        correctionDraft: result.correctionDraft,
        operationLog: result.operationLogId === input.operationLog?.id ? input.operationLog : null,
      });
      return result;
    },
    async confirmCorrectionDraft(input = {}) {
      const query = buildConfirmInventoryCorrectionDraftTransactionQuery(input);
      const result = normalizeConfirmResult(
        await idempotentTransactionJson(
          buildPostgresIdempotencyRequest({
            scope: "inventory.correction.confirm",
            idempotencyKey: resolveRepositoryIdempotencyKey(input.idempotencyKey, input.operationLog?.id),
            payload: input.idempotencyPayload ?? { correctionDraft: input.correctionDraft, inventoryLedger: input.inventoryLedger },
            operatorId: input.operationLog?.operatorId,
            targetType: "inventory_correction",
            targetId: input.correctionDraft?.correctionDraftId ?? input.correctionDraft?.id,
            resourceLocks: [
              `inventory-item:${input.correctionDraft?.inventoryItemId ?? ""}`,
              `inventory-correction:${input.correctionDraft?.correctionDraftId ?? input.correctionDraft?.id ?? ""}`,
              `todo:${input.todo?.id ?? ""}`,
            ],
            query,
          }),
        ),
        input,
      );
      if (!result.correctionDraft || !result.inventoryItem || !result.inventoryLedger) {
        throw new Error("PostgreSQL correction draft confirmation returned invalid data");
      }
      applyConfirmMutation({
        ...input,
        correctionDraft: result.correctionDraft,
        inventoryItem: result.inventoryItem,
        inventoryLedger: result.inventoryLedger,
        todo: result.todo,
        todoEvent: result.todoEventId === input.todoEvent?.eventId ? input.todoEvent : null,
        operationLog: result.operationLogId === input.operationLog?.id ? input.operationLog : null,
      });
      return result;
    },
  };
}

export function buildGetInventoryCorrectionDraftQuery(correctionDraftId) {
  const parameters = createPostgresParameterBinder();
  return {
    text: `SELECT ${correctionDraftJsonExpression("inventory_correction_drafts")} AS result
FROM inventory_correction_drafts
WHERE id = ${parameters.text(correctionDraftId)};`,
    values: parameters.values,
  };
}

export function buildCreateInventoryCorrectionDraftTransactionQuery(input = {}) {
  const draft = normalizeCorrectionDraft(input.correctionDraft);
  const inventoryItem = normalizeInventoryItem(input.inventoryItem);
  const todo = normalizeTodo(input.todo);
  const todoEvent = normalizeTodoEvent(input.todoEvent);
  const operationLog = normalizeOperationLog(input.operationLog);
  if (!draft || !inventoryItem || !todo || !todoEvent || !operationLog) {
    throw new Error("Inventory correction draft, inventory, todo, event, and operation log are required");
  }
  const parameters = createPostgresParameterBinder();
  return {
    text: `
BEGIN;
WITH locked_inventory AS MATERIALIZED (
  SELECT id, on_hand_qty, revision
  FROM inventory_items
  WHERE id = ${parameters.text(inventoryItem.id)}
  FOR UPDATE
),
inventory_guard AS MATERIALIZED (
  SELECT erp_require(
    EXISTS (
      SELECT 1 FROM locked_inventory
      WHERE on_hand_qty = ${parameters.integer(draft.expectedQty)}
        AND revision = ${parameters.integer(inventoryItem.revision)}
    ),
    'ERP_INVENTORY_CORRECTION_CREATE_CONCURRENCY_CONFLICT'
  ) AS ok
),
inserted_todo AS (
  ${buildInsertTodoSql(todo, parameters)}
),
inserted_draft AS (
  INSERT INTO inventory_correction_drafts (
    id, biz_no, inventory_item_id, expected_qty, actual_qty, delta_qty, reason,
    status, revision, todo_id, remark, attachment_ids, created_by, created_at, updated_at
  )
  SELECT
    ${parameters.text(draft.id)}, ${parameters.text(draft.bizNo)}, ${parameters.text(draft.inventoryItemId)},
    ${parameters.integer(draft.expectedQty)}, ${parameters.integer(draft.actualQty)}, ${parameters.integer(draft.deltaQty)},
    ${parameters.text(draft.reason)}, ${parameters.text(draft.status)}, ${parameters.integer(draft.revision)},
    ${parameters.text(draft.todoId)}, ${parameters.text(draft.remark)}, ${parameters.json(draft.attachmentIds)},
    ${parameters.nullableText(draft.createdBy)}, ${parameters.timestamp(draft.createdAt)}, ${parameters.timestamp(draft.updatedAt)}
  FROM inserted_todo, inventory_guard AS guard
  WHERE guard.ok
  ON CONFLICT (id) DO NOTHING
  RETURNING ${correctionDraftJsonExpression("inventory_correction_drafts")} AS result
),
inserted_todo_event AS (
  ${buildInsertTodoEventSql(todoEvent, "inserted_draft", parameters)}
),
inserted_operation_log AS (
  ${buildInsertOperationLogSql(operationLog, "inserted_draft", parameters)}
)
SELECT json_build_object(
  'correctionDraft', (SELECT result FROM inserted_draft),
  'todo', (SELECT result FROM inserted_todo),
  'todoEventId', (SELECT id FROM inserted_todo_event),
  'operationLogId', (SELECT id FROM inserted_operation_log)
) AS result;
COMMIT;
`.trim(),
    values: parameters.values,
  };
}

export function buildLinkInventoryCorrectionAttachmentsTransactionQuery(input = {}) {
  const draft = normalizeCorrectionDraft(input.correctionDraft);
  const attachmentIds = textList(input.attachmentIds);
  const operationLog = normalizeOperationLog(input.operationLog);
  if (!draft || !attachmentIds.length || !operationLog) {
    throw new Error("Inventory correction draft, attachment IDs, and operation log are required");
  }
  const parameters = createPostgresParameterBinder();
  const expectedDraftRevision = Math.max(1, draft.revision - 1);
  return {
    text: `
BEGIN;
WITH requested_attachment_ids AS MATERIALIZED (
  SELECT DISTINCT value AS attachment_id
  FROM jsonb_array_elements_text(${parameters.json(attachmentIds)}::jsonb)
),
locked_draft AS MATERIALIZED (
  SELECT id, status, revision, attachment_ids
  FROM inventory_correction_drafts
  WHERE id = ${parameters.text(draft.id)}
  FOR UPDATE
),
valid_attachment_ids AS MATERIALIZED (
  SELECT requested.attachment_id
  FROM requested_attachment_ids AS requested
  JOIN attachments AS attachment ON attachment.id = requested.attachment_id
  JOIN attachment_links AS link
    ON link.attachment_id = attachment.id
   AND link.owner_type = 'inventory_correction'
   AND link.owner_id = ${parameters.text(draft.id)}
   AND link.purpose = 'inventory_correction_evidence'
  WHERE attachment.purpose = 'inventory_correction_evidence'
    AND attachment.status = 'uploaded'
    AND attachment.has_content = true
    AND attachment.uploaded_by IS NOT NULL
    AND attachment.file_type IN ('image', 'pdf')
    AND (attachment.mime_type LIKE 'image/%' OR attachment.mime_type = 'application/pdf')
),
write_guard AS MATERIALIZED (
  SELECT erp_require(
    EXISTS (
      SELECT 1 FROM locked_draft
      WHERE status = '待确认生效' AND revision = ${parameters.integer(expectedDraftRevision)}
    )
    AND (SELECT COUNT(*) FROM requested_attachment_ids) = ${parameters.integer(attachmentIds.length)}
    AND (SELECT COUNT(*) FROM valid_attachment_ids) = ${parameters.integer(attachmentIds.length)},
    'ERP_INVENTORY_CORRECTION_ATTACHMENT_LINK_CONFLICT'
  ) AS ok
),
updated_draft AS (
  UPDATE inventory_correction_drafts
  SET attachment_ids = ${parameters.json(attachmentIds)}::jsonb,
      revision = inventory_correction_drafts.revision + 1,
      updated_at = ${parameters.timestamp(draft.updatedAt)}
  FROM locked_draft, write_guard AS guard
  WHERE inventory_correction_drafts.id = locked_draft.id AND guard.ok
  RETURNING ${correctionDraftJsonExpression("inventory_correction_drafts")} AS result
),
inserted_operation_log AS (
  ${buildInsertOperationLogSql(operationLog, "updated_draft", parameters)}
)
SELECT json_build_object(
  'correctionDraft', (SELECT result FROM updated_draft),
  'attachmentIds', ${parameters.json(attachmentIds)}::jsonb,
  'operationLogId', (SELECT id FROM inserted_operation_log)
) AS result;
COMMIT;
`.trim(),
    values: parameters.values,
  };
}

export function buildConfirmInventoryCorrectionDraftTransactionQuery(input = {}) {
  const draft = normalizeCorrectionDraft(input.correctionDraft);
  const inventoryItem = normalizeInventoryItem(input.inventoryItem);
  const ledger = normalizeInventoryLedger(input.inventoryLedger);
  const todo = normalizeTodo(input.todo);
  const todoEvent = normalizeTodoEvent(input.todoEvent);
  const operationLog = normalizeOperationLog(input.operationLog);
  if (!draft || !inventoryItem || !ledger || !todo || !todoEvent || !operationLog) {
    throw new Error("Confirmed correction draft, inventory, ledger, todo, event, and operation log are required");
  }
  const parameters = createPostgresParameterBinder();
  const expectedDraftRevision = Math.max(1, draft.revision - 1);
  const expectedInventoryRevision = Math.max(1, inventoryItem.revision - 1);
  return {
    text: `
BEGIN;
WITH locked_draft AS MATERIALIZED (
  SELECT id, status, revision, expected_qty, actual_qty, todo_id
  FROM inventory_correction_drafts
  WHERE id = ${parameters.text(draft.id)}
  FOR UPDATE
),
locked_inventory AS MATERIALIZED (
  SELECT id, on_hand_qty, revision
  FROM inventory_items
  WHERE id = ${parameters.text(inventoryItem.id)}
  FOR UPDATE
),
locked_todo AS MATERIALIZED (
  SELECT id FROM todos WHERE id = ${parameters.text(todo.id)} FOR UPDATE
),
write_guard AS MATERIALIZED (
  SELECT erp_require(
    EXISTS (
      SELECT 1 FROM locked_draft
      WHERE status = '待确认生效' AND revision = ${parameters.integer(expectedDraftRevision)}
        AND expected_qty = ${parameters.integer(ledger.qtyBefore)}
    )
    AND EXISTS (
      SELECT 1 FROM locked_inventory
      WHERE on_hand_qty = ${parameters.integer(ledger.qtyBefore)}
        AND revision = ${parameters.integer(expectedInventoryRevision)}
    )
    AND (SELECT COUNT(*) FROM locked_todo) = 1,
    'ERP_INVENTORY_CORRECTION_CONFIRM_CONCURRENCY_CONFLICT'
  ) AS ok
),
updated_inventory AS (
  UPDATE inventory_items
  SET on_hand_qty = ${parameters.integer(ledger.qtyAfter)}, revision = inventory_items.revision + 1, updated_at = ${parameters.timestamp(draft.updatedAt)}
  FROM locked_inventory, write_guard AS guard
  WHERE inventory_items.id = locked_inventory.id AND guard.ok
  RETURNING ${inventoryItemJsonExpression("inventory_items")} AS result
),
updated_draft AS (
  UPDATE inventory_correction_drafts
  SET status = ${parameters.text(draft.status)}, revision = inventory_correction_drafts.revision + 1,
      confirmed_by = ${parameters.nullableText(draft.confirmedBy)}, confirmed_at = ${parameters.nullableTimestamp(draft.confirmedAt)},
      updated_at = ${parameters.timestamp(draft.updatedAt)}
  FROM locked_draft, write_guard AS guard
  WHERE inventory_correction_drafts.id = locked_draft.id AND guard.ok
  RETURNING ${correctionDraftJsonExpression("inventory_correction_drafts")} AS result
),
inserted_ledger AS (
  INSERT INTO inventory_ledger_entries (
    id, inventory_item_id, change_type, qty_before, qty_change, qty_after, source_type, source_id,
    operator_id, confirmed_by, occurred_at, created_at, reason, remark
  )
  SELECT
    ${parameters.text(ledger.ledgerId)}, ${parameters.text(ledger.inventoryItemId)}, ${parameters.text(ledger.changeType)},
    ${parameters.integer(ledger.qtyBefore)}, ${parameters.integer(ledger.qtyChange)}, ${parameters.integer(ledger.qtyAfter)},
    ${parameters.text(ledger.sourceType)}, ${parameters.text(ledger.sourceId)}, ${parameters.nullableText(ledger.operatorId)},
    ${parameters.nullableText(ledger.confirmedBy)}, ${parameters.timestamp(ledger.occurredAt)}, ${parameters.timestamp(ledger.createdAt)},
    ${parameters.text(ledger.reason)}, ${parameters.text(ledger.remark)}
  FROM updated_inventory, updated_draft
  ON CONFLICT (id) DO NOTHING
  RETURNING ${inventoryLedgerJsonExpression("inventory_ledger_entries")} AS result
),
updated_todo AS (
  UPDATE todos
  SET status = ${parameters.text(todo.status)}, handled_by = ${parameters.nullableText(todo.handledBy)},
      handled_at = ${parameters.nullableTimestamp(todo.handledAt)}, handling_result = ${parameters.nullableText(todo.handlingResult)},
      updated_at = ${parameters.timestamp(todo.updatedAt)}
  FROM locked_todo, updated_draft
  WHERE todos.id = locked_todo.id
  RETURNING ${todoJsonExpression("todos")} AS result
),
inserted_todo_event AS (
  ${buildInsertTodoEventSql(todoEvent, "updated_todo", parameters)}
),
inserted_operation_log AS (
  ${buildInsertOperationLogSql(operationLog, "updated_draft", parameters)}
)
SELECT json_build_object(
  'correctionDraft', (SELECT result FROM updated_draft),
  'inventoryItem', (SELECT result FROM updated_inventory),
  'inventoryLedger', (SELECT result FROM inserted_ledger),
  'todo', (SELECT result FROM updated_todo),
  'todoEventId', (SELECT id FROM inserted_todo_event),
  'operationLogId', (SELECT id FROM inserted_operation_log)
) AS result;
COMMIT;
`.trim(),
    values: parameters.values,
  };
}

function buildInsertTodoSql(todo, parameters) {
  return `INSERT INTO todos (
    id, biz_no, type, ref_type, ref_id, priority, status, summary, due_at, remind_at,
    handled_by, handled_at, handling_result, created_by, created_at, updated_at
  ) VALUES (
    ${parameters.text(todo.id)}, ${parameters.text(todo.bizNo)}, ${parameters.text(todo.type)}, ${parameters.text(todo.refType)},
    ${parameters.text(todo.refId)}, ${parameters.text(todo.priority)}, ${parameters.text(todo.status)}, ${parameters.text(todo.summary)},
    ${parameters.nullableTimestamp(todo.dueAt)}, ${parameters.nullableTimestamp(todo.remindAt)}, ${parameters.nullableText(todo.handledBy)},
    ${parameters.nullableTimestamp(todo.handledAt)}, ${parameters.nullableText(todo.handlingResult)}, ${parameters.nullableText(todo.createdBy)},
    ${parameters.timestamp(todo.createdAt)}, ${parameters.timestamp(todo.updatedAt)}
  ) ON CONFLICT (id) DO NOTHING
  RETURNING ${todoJsonExpression("todos")} AS result`;
}

function buildInsertTodoEventSql(event, dependency, parameters) {
  return `INSERT INTO todo_events (id, todo_id, event_type, event_payload, operator_id, occurred_at, created_at)
  SELECT ${parameters.text(event.eventId)}, ${parameters.text(event.todoId)}, ${parameters.text(event.eventType)},
    ${parameters.json(event.eventPayload)}, ${parameters.nullableText(event.operatorId)},
    ${parameters.timestamp(event.occurredAt)}, ${parameters.timestamp(event.createdAt)}
  FROM ${dependency}
  ON CONFLICT (id) DO NOTHING
  RETURNING id`;
}

function buildInsertOperationLogSql(log, dependency, parameters) {
  return `INSERT INTO operation_logs (
    id, target_type, target_id, action, before_json, after_json, reason, operator_id, page_key, occurred_at, created_at
  )
  SELECT ${parameters.text(log.id)}, ${parameters.text(log.targetType)}, ${parameters.text(log.targetId)}, ${parameters.text(log.action)},
    ${parameters.json(log.before)}, ${parameters.json(log.after)}, ${parameters.text(log.reason)}, ${parameters.nullableText(log.operatorId)},
    ${parameters.text(log.pageKey)}, ${parameters.timestamp(log.occurredAt)}, ${parameters.timestamp(log.createdAt)}
  FROM ${dependency}
  ON CONFLICT (id) DO NOTHING
  RETURNING id`;
}

function normalizeCreateResult(value, input) {
  return {
    correctionDraft: mergeRecord(input.correctionDraft, normalizeCorrectionDraft(value?.correctionDraft)),
    todo: mergeTodo(input.todo, value?.todo),
    todoEventId: text(value?.todoEventId),
    operationLogId: text(value?.operationLogId),
  };
}

function normalizeConfirmResult(value, input) {
  return {
    correctionDraft: mergeRecord(input.correctionDraft, normalizeCorrectionDraft(value?.correctionDraft)),
    inventoryItem: mergeRecord(input.inventoryItem, normalizeInventoryItem(value?.inventoryItem)),
    inventoryLedger: normalizeInventoryLedger(value?.inventoryLedger),
    todo: value?.todo ? mergeTodo(input.todo, value.todo) : null,
    todoEventId: text(value?.todoEventId),
    operationLogId: text(value?.operationLogId),
  };
}

function normalizeLinkResult(value, input) {
  const correctionDraft = mergeRecord(input.correctionDraft, normalizeCorrectionDraft(value?.correctionDraft));
  return {
    correctionDraft,
    attachmentIds: textList(value?.attachmentIds ?? correctionDraft?.attachmentIds ?? input.attachmentIds),
    operationLogId: text(value?.operationLogId),
  };
}

function normalizeCorrectionDraft(value) {
  if (!value || typeof value !== "object") return null;
  const id = text(value.correctionDraftId ?? value.id);
  if (!id) return null;
  const expectedQty = integer(value.expectedQty ?? value.expected_qty);
  const actualQty = integer(value.actualQty ?? value.actual_qty);
  return {
    ...value,
    id,
    correctionDraftId: id,
    bizNo: text(value.bizNo ?? value.biz_no) || id,
    inventoryItemId: text(value.inventoryItemId ?? value.inventory_item_id),
    expectedQty,
    actualQty,
    deltaQty: integer(value.deltaQty ?? value.delta_qty, actualQty - expectedQty),
    reason: text(value.reason),
    remark: text(value.remark),
    attachmentIds: textList(value.attachmentIds ?? value.attachment_ids),
    status: text(value.status) || "待确认生效",
    revision: Math.max(1, integer(value.revision, 1)),
    todoId: text(value.todoId ?? value.todo_id),
    createdBy: text(value.createdBy ?? value.created_by ?? value.operatorId),
    confirmedBy: text(value.confirmedBy ?? value.confirmed_by),
    confirmedAt: timestamp(value.confirmedAt ?? value.confirmed_at),
    createdAt: timestamp(value.createdAt ?? value.created_at) || new Date().toISOString(),
    updatedAt: timestamp(value.updatedAt ?? value.updated_at) || new Date().toISOString(),
    qtyBefore: value.qtyBefore ?? { onHand: expectedQty },
    requestedQtyAfter: value.requestedQtyAfter ?? { onHand: actualQty },
  };
}

function normalizeInventoryItem(value) {
  if (!value || typeof value !== "object") return null;
  const id = text(value.id ?? value.inventoryItemId);
  if (!id) return null;
  return {
    ...value,
    id,
    inventoryItemId: id,
    inventoryKey: text(value.inventoryKey ?? value.inventory_key) || id,
    onHandQty: integer(value.onHandQty ?? value.on_hand_qty ?? value.inStock),
    inStock: integer(value.onHandQty ?? value.on_hand_qty ?? value.inStock),
    reservedQty: integer(value.reservedQty ?? value.reserved_qty ?? value.reserved),
    waitingPickupLockedQty: integer(value.waitingPickupLockedQty ?? value.waiting_pickup_locked_qty ?? value.locked),
    pendingHandlingQty: integer(value.pendingHandlingQty ?? value.pending_handling_qty ?? value.pending),
    revision: Math.max(1, integer(value.revision, 1)),
  };
}

function normalizeInventoryLedger(value) {
  if (!value || typeof value !== "object") return null;
  const ledgerId = text(value.ledgerId ?? value.id);
  if (!ledgerId) return null;
  return {
    ...value,
    ledgerId,
    inventoryItemId: text(value.inventoryItemId ?? value.inventory_item_id),
    changeType: text(value.changeType ?? value.change_type) || "correction",
    qtyBefore: integer(value.qtyBefore ?? value.qty_before),
    qtyChange: integer(value.qtyChange ?? value.qty_change),
    qtyAfter: integer(value.qtyAfter ?? value.qty_after),
    sourceType: text(value.sourceType ?? value.source_type) || "inventory_correction",
    sourceId: text(value.sourceId ?? value.source_id),
    operatorId: text(value.operatorId ?? value.operator_id),
    confirmedBy: text(value.confirmedBy ?? value.confirmed_by),
    occurredAt: timestamp(value.occurredAt ?? value.occurred_at) || new Date().toISOString(),
    createdAt: timestamp(value.createdAt ?? value.created_at) || new Date().toISOString(),
    reason: text(value.reason),
    remark: text(value.remark),
  };
}

function normalizeTodo(value) {
  if (!value || typeof value !== "object") return null;
  const id = text(value.id ?? value.todoId);
  if (!id) return null;
  return {
    ...value,
    id,
    todoId: id,
    bizNo: text(value.bizNo) || id,
    refType: text(value.refType) || "inventory_correction",
    refId: text(value.refId ?? value.ref),
    priority: text(value.priority ?? value.urgency) || "普通",
    status: value.handled ? "已处理" : text(value.status) || "未处理",
    dueAt: timestamp(value.dueAt) || "",
    remindAt: timestamp(value.remindAt) || "",
    handledBy: text(value.handledBy),
    handledAt: timestamp(value.handledAt),
    handlingResult: text(value.handlingResult),
    createdBy: text(value.createdBy),
    createdAt: timestamp(value.createdAt) || new Date().toISOString(),
    updatedAt: timestamp(value.updatedAt) || new Date().toISOString(),
  };
}

function normalizeTodoEvent(value) {
  if (!value || typeof value !== "object" || !value.eventId || !value.todoId) return null;
  return { ...value, eventPayload: value.eventPayload ?? {}, occurredAt: timestamp(value.occurredAt), createdAt: timestamp(value.createdAt) };
}

function normalizeOperationLog(value) {
  if (!value || typeof value !== "object" || !value.id) return null;
  return { ...value, pageKey: text(value.pageKey) || "api", occurredAt: timestamp(value.occurredAt), createdAt: timestamp(value.createdAt) };
}

function correctionDraftJsonExpression(alias) {
  return `json_build_object(
    'correctionDraftId', ${alias}.id, 'bizNo', ${alias}.biz_no, 'inventoryItemId', ${alias}.inventory_item_id,
    'expectedQty', ${alias}.expected_qty, 'actualQty', ${alias}.actual_qty, 'deltaQty', ${alias}.delta_qty,
    'reason', ${alias}.reason, 'remark', ${alias}.remark, 'attachmentIds', ${alias}.attachment_ids,
    'status', ${alias}.status, 'revision', ${alias}.revision, 'todoId', ${alias}.todo_id,
    'createdBy', ${alias}.created_by, 'confirmedBy', ${alias}.confirmed_by, 'confirmedAt', ${alias}.confirmed_at,
    'createdAt', ${alias}.created_at, 'updatedAt', ${alias}.updated_at
  )`;
}

function inventoryItemJsonExpression(alias) {
  return `json_build_object(
    'inventoryItemId', ${alias}.id, 'inventoryKey', ${alias}.inventory_key, 'onHandQty', ${alias}.on_hand_qty,
    'reservedQty', ${alias}.reserved_qty, 'waitingPickupLockedQty', ${alias}.waiting_pickup_locked_qty,
    'pendingHandlingQty', ${alias}.pending_handling_qty, 'revision', ${alias}.revision
  )`;
}

function inventoryLedgerJsonExpression(alias) {
  return `json_build_object(
    'ledgerId', ${alias}.id, 'inventoryItemId', ${alias}.inventory_item_id, 'changeType', ${alias}.change_type,
    'qtyBefore', ${alias}.qty_before, 'qtyChange', ${alias}.qty_change, 'qtyAfter', ${alias}.qty_after,
    'sourceType', ${alias}.source_type, 'sourceId', ${alias}.source_id, 'operatorId', ${alias}.operator_id,
    'confirmedBy', ${alias}.confirmed_by, 'occurredAt', ${alias}.occurred_at, 'createdAt', ${alias}.created_at,
    'reason', ${alias}.reason, 'remark', ${alias}.remark
  )`;
}

function todoJsonExpression(alias) {
  return `json_build_object(
    'todoId', ${alias}.id, 'bizNo', ${alias}.biz_no, 'type', ${alias}.type, 'refType', ${alias}.ref_type,
    'refId', ${alias}.ref_id, 'priority', ${alias}.priority, 'status', ${alias}.status, 'summary', ${alias}.summary,
    'dueAt', ${alias}.due_at, 'remindAt', ${alias}.remind_at, 'handledBy', ${alias}.handled_by,
    'handledAt', ${alias}.handled_at, 'handlingResult', ${alias}.handling_result, 'createdBy', ${alias}.created_by,
    'createdAt', ${alias}.created_at, 'updatedAt', ${alias}.updated_at
  )`;
}

function applyCreateMutation({ workspace, correctionDraft, todo, todoEvent, operationLog }) {
  workspace.inventoryCorrectionDrafts = upsert(workspace.inventoryCorrectionDrafts, correctionDraft, "correctionDraftId");
  workspace.todos = upsert(workspace.todos, todo, "id");
  if (todoEvent) workspace.todoEvents = upsert(workspace.todoEvents, todoEvent, "eventId");
  if (operationLog) workspace.operationLogs = upsert(workspace.operationLogs, operationLog, "id");
}

function applyLinkMutation({ workspace, correctionDraft, operationLog }) {
  workspace.inventoryCorrectionDrafts = upsert(workspace.inventoryCorrectionDrafts, correctionDraft, "correctionDraftId");
  if (operationLog) workspace.operationLogs = upsert(workspace.operationLogs, operationLog, "id");
}

function applyConfirmMutation({ workspace, correctionDraft, inventoryItem, inventoryLedger, todo, todoEvent, operationLog }) {
  workspace.inventoryCorrectionDrafts = upsert(workspace.inventoryCorrectionDrafts, correctionDraft, "correctionDraftId");
  workspace.inventories = upsert(workspace.inventories, inventoryItem, "id");
  workspace.inventoryLedgers = upsert(workspace.inventoryLedgers, inventoryLedger, "ledgerId");
  if (todo) workspace.todos = upsert(workspace.todos, todo, "id");
  if (todoEvent) workspace.todoEvents = upsert(workspace.todoEvents, todoEvent, "eventId");
  if (operationLog) workspace.operationLogs = upsert(workspace.operationLogs, operationLog, "id");
}

function upsert(rows = [], record, key) {
  const id = text(record?.[key] ?? record?.id);
  return [record, ...(rows ?? []).filter((item) => text(item?.[key] ?? item?.id) !== id)];
}

function findById(rows = [], id, key) {
  return (rows ?? []).find((item) => text(item?.[key] ?? item?.id) === text(id)) ?? null;
}

function mergeTodo(projected, canonical) {
  const normalized = normalizeTodo(canonical);
  return normalized ? { ...projected, ...normalized, id: normalized.todoId, ref: normalized.refId, handled: normalized.status === "已处理" } : null;
}

function mergeRecord(projected, canonical) {
  return canonical ? { ...projected, ...canonical } : null;
}

function array(value) {
  return Array.isArray(value) ? value : [];
}

function textList(value) {
  return [...new Set(array(value).map(text).filter(Boolean))];
}

function integer(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.trunc(number) : fallback;
}

function timestamp(value) {
  const source = text(value);
  return source && !Number.isNaN(Date.parse(source)) ? new Date(source).toISOString() : "";
}

function text(value) {
  return String(value ?? "").trim();
}
