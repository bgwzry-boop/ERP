import { normalizeIntakeDeliveryMethod } from "./miniapp/miniappDeliveryMethod.mjs";
import { buildMiniappConfirmationSourceQuery } from "./miniapp/miniappConfirmationSource.mjs";
import { createPostgresPoolClient } from "./postgresPoolClient.mjs";
import { createPostgresParameterBinder } from "./postgresSqlParameters.mjs";
import { createPostgresTransactionExecutor } from "./postgresTransactionExecutor.mjs";
import { buildPostgresIdempotencyRequest, resolveRepositoryIdempotencyKey, readPostgresIdempotencyReplay, buildIdempotencyRequestHash, buildIdempotencyConflictError } from "./idempotency.mjs";
import { normalizeInventoryIntents } from "./inventoryIntentDomain.mjs";
import { resolveStoreMode } from "./storeMode.mjs";
import { localOrderPricingMaterialFacts, buildMiniappSpecialMaterialPriceQuery } from "./orderPricingMaterialSource.mjs";

export function createOrderDraftRepository(options = {}) {
  const mode = resolveStoreMode({
    explicitMode: options.mode,
    envKeys: ["ERP_ORDER_DRAFT_STORE", "ERP_ORDER_STORE"],
    runtimeMode: options.runtimeMode,
    allowLocalFixture: options.allowLocalFixture,
  });
  if (mode === "postgres") {
    return createPostgresOrderDraftRepository({
      databaseUrl: options.databaseUrl ?? process.env.ERP_ORDER_DATABASE_URL ?? process.env.DATABASE_URL ?? process.env.PGURL,
      queryJson: options.queryJson,
      transactionJson: options.transactionJson,
      idempotentTransactionJson: options.idempotentTransactionJson,
      postgresClient: options.postgresClient,
    });
  }
  if (mode === "local") return createLocalOrderDraftRepository();
  throw new Error(`Unsupported order draft repository mode: ${mode}`);
}

export function createLocalOrderDraftRepository() {
  const receipts = new WeakMap();
  return {
    kind: "local_memory",

    readSaveReceipt({ workspace, draftId, idempotencyKey, idempotencyPayload }) {
      const stored = receipts.get(workspace)?.get(`${draftId}:${idempotencyKey}`);
      if (!stored) return null;
      if (stored.hash !== buildIdempotencyRequestHash(idempotencyPayload)) throw buildIdempotencyConflictError();
      return structuredClone(stored.result);
    },

    loadState() {
      return { orderDrafts: [] };
    },

    getMiniappConfirmationSources({ workspace, draftId }) {return (workspace?.miniappConfirmationSources??[]).filter(source=>source.draftId===draftId);},

    getOrderPricingMaterialFacts({ workspace, input }) {
      return { materials: localOrderPricingMaterialFacts(workspace, input), publishedRelease: (workspace.officePricingPublishedReleases ?? [])
        .find(release => release.status === "published" && Date.parse(release.effectiveFrom) <= Date.now()) ?? null };
    },

    getOrderDraft(input) {
      return normalizeOrderDraft((input.workspace?.orderDrafts ?? []).find((item) => item.id === input.draftId));
    },

    saveOrderDraft(input) {
      const prior = this.readSaveReceipt({ ...input, draftId: input.draft?.id ?? input.draft?.draftId });
      if (prior) return prior;
      if (input.sourceHoldGuard) {
        const expected = input.sourceHoldGuard;
        const current = (input.workspace?.inventoryReservations ?? []).find(row => (row.id ?? row.reservationId) === (expected.id ?? expected.reservationId));
        if (!current || ["inventoryItemId", "customerId", "sourceIntentId", "reservedQty", "revision", "status", "reservationType", "expiresAt"].some(key => current[key] !== expected[key]) ||
          current.status !== "生效" || !(Date.parse(current.expiresAt) > Date.now())) throw orderDraftConcurrencyError();
      }
      const requestedDraft = normalizeOrderDraft(input.draft);
      const expectedRevision = Math.max(0, toInteger(input.expectedRevision ?? requestedDraft?.revision, 0));
      const currentDraft = (input.workspace?.orderDrafts ?? []).find((item) => item.id === requestedDraft?.id);
      if (["已生成正式订单", "已生成多个正式订单", "已确认"].includes(currentDraft?.status)) throw orderDraftConcurrencyError();
      if (currentDraft?.sourceChannel === "mini_program" && ["sourceChannel", "sourceMessageId", "customerId"].some(key =>
        String(requestedDraft?.[key] ?? "") !== String(currentDraft[key] ?? "")
      )) throw Object.assign(new Error("小程序草稿来源身份不可修改。"), {code:"MINIAPP_DRAFT_SOURCE_IMMUTABLE",statusCode:409});
      const currentRevision = Math.max(0, toInteger(currentDraft?.revision ?? currentDraft?.clientRevision, 0));
      if ((currentDraft && currentRevision !== expectedRevision) || (!currentDraft && expectedRevision !== 0)) {
        throw orderDraftConcurrencyError();
      }
      const draft = normalizeOrderDraft({
        ...requestedDraft,
        revision: currentRevision + 1,
        clientRevision: currentRevision + 1,
      });
      if (!draft) throw new Error("Order draft is required");
      applyOrderDraftWorkspaceMutation({
        workspace: input.workspace,
        draft,
        inventoryIntents: input.inventoryIntents,
        todos: input.todos,
        operationLog: input.operationLog,
      });
      const result = {
        draft,
        inventoryIntents: normalizeInventoryIntents(input.inventoryIntents),
        todos: normalizeTodos(input.todos),
        operationLogId: input.operationLog?.id ?? "",
      };
      if (input.idempotencyKey && input.idempotencyPayload !== undefined) {
        if (!receipts.has(input.workspace)) receipts.set(input.workspace, new Map());
        receipts.get(input.workspace).set(`${draft.id}:${input.idempotencyKey}`, { hash: buildIdempotencyRequestHash(input.idempotencyPayload), result: structuredClone(result) });
      }
      return result;
    },
  };
}

export function createPostgresOrderDraftRepository(options = {}) {
  const postgresClient =
    options.postgresClient ??
    (options.queryJson || options.transactionJson || options.idempotentTransactionJson
      ? null
      : createPostgresPoolClient(options));
  const queryJson = options.queryJson ?? ((text, values) => postgresClient.queryJson(text, values));
  const { idempotentTransactionJson } = createPostgresTransactionExecutor({ ...options, postgresClient });

  return {
    kind: "postgres",

    async readSaveReceipt({ draftId, idempotencyKey, idempotencyPayload }) {
      const value = await readPostgresIdempotencyReplay({ queryJson, scope: `order.draft.save.${draftId}`, idempotencyKey, payload: idempotencyPayload });
      return value ? normalizeOrderDraftTransactionResult(value) : null;
    },

    async loadState() {
      const query = buildListOrderDraftsQuery();
      return { orderDrafts: normalizeOrderDrafts(await queryJson(query.text, query.values)) };
    },

    async getMiniappConfirmationSources({ draftId }) {
      const query = buildMiniappConfirmationSourceQuery(draftId);
      return queryJson(query.text, query.values);
    },

    async getOrderPricingMaterialFacts({ input }) {
      const query = buildMiniappSpecialMaterialPriceQuery(input);
      const materials = await queryJson(query.text, query.values);
      const publishedRelease = await queryJson("SELECT jsonb_build_object('id',id,'revision',revision,'specialSizePricing',bundle_json->'specialSizePricing') AS result FROM miniapp_price_releases WHERE status='published' AND requested_effective_from<=now() LIMIT 1", []);
      return { materials, publishedRelease: publishedRelease ?? null };
    },

    async getOrderDraft(input) {
      const query = buildListOrderDraftsQuery({ draftId: input.draftId });
      return normalizeOrderDrafts(await queryJson(query.text, query.values))[0] ?? null;
    },

    async saveOrderDraft(input) {
      const draft = normalizeOrderDraft(input.draft);
      if (!draft) throw new Error("Order draft is required");
      const query = buildSaveOrderDraftTransactionQuery(input);
      const saved = normalizeOrderDraftTransactionResult(
        await idempotentTransactionJson(
          buildPostgresIdempotencyRequest({
            scope: `order.draft.save.${draft.id}`,
            idempotencyKey: resolveRepositoryIdempotencyKey(input.idempotencyKey, input.operationLog?.id),
            payload: input.idempotencyPayload ?? { draft, todos: input.todos },
            operatorId: input.operationLog?.operatorId,
            targetType: "order_draft",
            targetId: draft.id,
            resourceLocks: [`order-draft:${draft.id}`],
            query,
          }),
        ),
      );
      if (!saved.draft) throw new Error("PostgreSQL order draft transaction returned an invalid result");
      applyOrderDraftWorkspaceMutation({
        workspace: input.workspace,
        draft: saved.draft,
        inventoryIntents: saved.inventoryIntents,
        todos: saved.todos.map((todo) => ({ ...(input.todos ?? []).find((item) => item.id === todo.id), ...todo })),
        operationLog: saved.operationLogId === input.operationLog?.id ? input.operationLog : null,
      });
      return saved;
    },
  };
}

export function buildListOrderDraftsQuery(options = {}) {
  const parameters = createPostgresParameterBinder();
  const draftId = cleanText(options.draftId);
  return {
    text: `
SELECT COALESCE(
  json_agg(
    draft.recognition_summary || jsonb_build_object(
      'id', draft.id,
      'draftId', draft.id,
      'sourceText', draft.source_text,
      'sourceChannel', draft.source_channel,
      'sourceMessageId', COALESCE(draft.source_message_id, ''),
      'miniappDeliveryRequests', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'sourceOrderNo', submission.biz_no,
          'sourceRevision', submission.revision,
          'status', 'customer_requested',
          'method', submission.normalized_payload_json->>'deliveryMethod',
          'desiredDate', submission.normalized_payload_json->>'desiredDate',
          'desiredTime', submission.normalized_payload_json->>'desiredTime',
          'packagingPreference', submission.normalized_payload_json->>'packagingPreference',
          'address', jsonb_build_object(
            'recipientName', submission.normalized_payload_json->'address'->>'recipientName',
            'phone', submission.normalized_payload_json->'address'->>'phone',
            'province', submission.normalized_payload_json->'address'->>'province',
            'city', submission.normalized_payload_json->'address'->>'city',
            'district', submission.normalized_payload_json->'address'->>'district',
            'detail', submission.normalized_payload_json->'address'->>'detail'
          )
        ) ORDER BY submission.id)
        FROM order_intake_submissions submission
        WHERE submission.draft_id = draft.id AND submission.customer_id = draft.customer_id
      ), '[]'::jsonb),
      'customerId', COALESCE(draft.customer_id, ''),
      'customerName', COALESCE(customer.name, draft.recognition_summary->>'customerName', ''),
      'status', draft.status,
      'revision', draft.revision,
      'clientRevision', draft.revision,
      'createdBy', COALESCE(draft.created_by, ''),
      'createdAt', draft.created_at,
      'updatedAt', draft.updated_at,
      'lines', COALESCE(lines.result, '[]'::json)
    )
    ORDER BY draft.updated_at DESC, draft.id DESC
  ),
  '[]'::json
) AS result
FROM order_drafts AS draft
LEFT JOIN customers AS customer ON customer.id = draft.customer_id
LEFT JOIN LATERAL (
  SELECT json_agg(
    line.evidence_json || jsonb_build_object(
      'id', line.id,
      'draftLineId', line.id,
      'customerId', COALESCE(draft.customer_id, ''),
      'product', COALESCE(line.product_name, ''),
      'orderType', COALESCE(line.order_type, ''),
      'size', COALESCE(line.size, ''),
      'color', COALESCE(line.bag_color, ''),
      'handle', COALESCE(line.handle_type, ''),
      'style', COALESCE(line.style, ''),
      'print', CASE WHEN line.print_flag THEN '是' ELSE '否' END,
      'printColor', COALESCE(line.print_color, ''),
      'printSide', COALESCE(line.print_side, ''),
      'handleColor', COALESCE(line.handle_color, ''),
      'qty', COALESCE(line.qty, 0),
      'fulfillment', COALESCE(line.fulfillment_method, ''),
      'latest', COALESCE(line.latest_needed_at::text, ''),
      'note', COALESCE(line.remark, ''),
      'confidence', COALESCE(line.confidence, ''),
      'recognitionEvidence', COALESCE(line.evidence_json, '{}'::jsonb)
    )
    ORDER BY line.line_seq, line.id
  ) AS result
  FROM order_draft_lines AS line
  WHERE line.order_draft_id = draft.id
) AS lines ON true
${draftId ? `WHERE draft.id = ${parameters.text(draftId)}` : ""};
`.trim(),
    values: parameters.values,
  };
}

export function buildSaveOrderDraftTransactionSql(input) {
  return buildSaveOrderDraftTransactionQuery(input).text;
}

export function buildSaveOrderDraftTransactionQuery(input) {
  const draft = normalizeOrderDraft(input.draft);
  const todos = normalizeTodos(input.todos);
  const inventoryIntents = normalizeInventoryIntents(input.inventoryIntents);
  const operationLog = normalizeOperationLog(input.operationLog);
  if (!draft || !operationLog) throw new Error("Order draft and operation log are required");
  const expectedRevision = Math.max(0, Number(input.expectedRevision ?? draft.revision) || 0);
  const parameters = createPostgresParameterBinder();
  const lineSql = buildInsertDraftLinesSql(draft, parameters);
  const todoSql = buildInsertTodosSql(todos, parameters);
  const inventoryIntentSql = buildInsertInventoryIntentsSql(inventoryIntents, parameters);
  const operationLogSql = buildInsertOperationLogSql(operationLog, parameters);

  const hold = input.sourceHoldGuard;
  const holdGuardSql = hold ? `
locked_source_hold AS MATERIALIZED (
  SELECT * FROM inventory_reservations WHERE id = ${parameters.text(hold.id ?? hold.reservationId)} FOR UPDATE
),
source_hold_guard AS MATERIALIZED (
  SELECT erp_require(EXISTS (
    SELECT 1 FROM locked_source_hold
    WHERE status = '生效' AND reservation_type = '临时留货'
      AND inventory_item_id = ${parameters.text(hold.inventoryItemId)}
      AND customer_id = ${parameters.text(hold.customerId)}
      AND source_intent_id = ${parameters.text(hold.sourceIntentId)}
      AND reserved_qty = ${parameters.integer(hold.reservedQty)}
      AND revision = ${parameters.integer(hold.revision)}
      AND expires_at = ${parameters.timestamp(hold.expiresAt)}
      AND expires_at > clock_timestamp()
  ), 'ERP_ORDER_DRAFT_CONCURRENCY_CONFLICT') AS ok
),` : "source_hold_guard AS MATERIALIZED (SELECT true AS ok),";

  return {
    text: `
BEGIN;
WITH ${holdGuardSql}
locked_draft AS MATERIALIZED (
  SELECT id, revision, status
  FROM order_drafts
  WHERE id = ${parameters.text(draft.id)}
  FOR UPDATE
),
upserted_draft AS (
  INSERT INTO order_drafts (
    id,
    biz_no,
    source_text,
    source_channel,
    source_message_id,
    customer_id,
    status,
    recognition_summary,
    revision,
    created_by,
    created_at,
    updated_at
  )
  SELECT
    ${parameters.text(draft.id)},
    ${parameters.text(draft.bizNo)},
    ${parameters.text(draft.sourceText)},
    ${parameters.text(draft.sourceChannel)},
    ${parameters.nullableText(draft.sourceMessageId)},
    ${parameters.nullableText(draft.customerId)},
    ${parameters.text(draft.status)},
    ${parameters.json({ customerName: draft.customerName, recognitionContext: draft.recognitionContext ?? null })},
    1,
    ${parameters.nullableText(draft.createdBy)},
    ${parameters.timestamp(draft.createdAt)},
    ${parameters.timestamp(draft.updatedAt)}
  FROM source_hold_guard
  WHERE source_hold_guard.ok AND (${parameters.integer(expectedRevision)} = 0
    OR EXISTS (SELECT 1 FROM locked_draft WHERE revision = ${parameters.integer(expectedRevision)} AND status NOT IN ('已生成正式订单','已生成多个正式订单','已确认')))
  ON CONFLICT (id) DO UPDATE SET
    source_text = EXCLUDED.source_text,
    source_channel = EXCLUDED.source_channel,
    source_message_id = EXCLUDED.source_message_id,
    customer_id = EXCLUDED.customer_id,
    status = EXCLUDED.status,
    recognition_summary = EXCLUDED.recognition_summary,
    revision = order_drafts.revision + 1,
    updated_at = EXCLUDED.updated_at
  WHERE order_drafts.revision = ${parameters.integer(expectedRevision)}
    AND order_drafts.status NOT IN ('已生成正式订单','已生成多个正式订单','已确认')
  RETURNING order_drafts.id AS id, json_build_object(
    'id', order_drafts.id,
    'draftId', order_drafts.id,
    'sourceText', order_drafts.source_text,
    'sourceChannel', order_drafts.source_channel,
    'sourceMessageId', COALESCE(order_drafts.source_message_id, ''),
    'customerId', COALESCE(order_drafts.customer_id, ''),
    'customerName', order_drafts.recognition_summary->>'customerName',
    'recognitionContext', order_drafts.recognition_summary->'recognitionContext',
    'status', order_drafts.status,
    'revision', order_drafts.revision,
    'clientRevision', order_drafts.revision,
    'createdBy', COALESCE(order_drafts.created_by, ''),
    'createdAt', order_drafts.created_at,
    'updatedAt', order_drafts.updated_at
  ) AS result
),
draft_write_guard AS MATERIALIZED (
  SELECT erp_require(
    (SELECT COUNT(*) FROM upserted_draft) = 1,
    'ERP_ORDER_DRAFT_CONCURRENCY_CONFLICT'
  ) AS ok
),
deleted_draft_lines AS (
  DELETE FROM order_draft_lines
  WHERE order_draft_id = (SELECT id FROM upserted_draft)
  RETURNING id
),
draft_line_replacement_guard AS MATERIALIZED (
  SELECT COUNT(*) AS deleted_count
  FROM deleted_draft_lines
),
inserted_draft_lines AS (
  ${lineSql}
),
inserted_inventory_intents AS (
  ${inventoryIntentSql}
),
inserted_todos AS (
  ${todoSql}
),
inserted_operation_log AS (
  ${operationLogSql}
)
SELECT json_build_object(
  'draft', (SELECT result FROM upserted_draft)::jsonb || jsonb_build_object(
    'lines', (SELECT COALESCE(json_agg(result ORDER BY result->>'id'), '[]'::json) FROM inserted_draft_lines)
  ),
  'inventoryIntents', (SELECT COALESCE(json_agg(result ORDER BY result->>'intentId'), '[]'::json) FROM inserted_inventory_intents),
  'todos', (SELECT COALESCE(json_agg(result ORDER BY result->>'id'), '[]'::json) FROM inserted_todos),
  'operationLogId', (SELECT id FROM inserted_operation_log),
  'writeGuard', (SELECT ok FROM draft_write_guard),
  'deletedLineCount', (SELECT COUNT(*) FROM deleted_draft_lines)
) AS result;
COMMIT;
`.trim(),
    values: parameters.values,
  };
}

function buildInsertInventoryIntentsSql(intents, parameters) {
  if (intents.length === 0) return "SELECT NULL::json AS result WHERE false";
  const values = intents.map((intent) => `(
    ${parameters.text(intent.id)},
    ${parameters.text(intent.sourceMessageId)},
    ${parameters.text(intent.conversationId)},
    ${parameters.nullableText(intent.customerId)},
    ${parameters.text(intent.intentType)},
    ${parameters.text(intent.intentStatus)},
    ${parameters.text(intent.sourceText)},
    ${parameters.json(intent.candidate)},
    ${parameters.nullableText(intent.cancellationScope)},
    ${parameters.integer(intent.revision)},
    ${parameters.nullableText(intent.createdBy)},
    ${parameters.timestamp(intent.createdAt)},
    ${parameters.timestamp(intent.updatedAt)}
  )`).join(",\n");
  return `INSERT INTO inventory_intents (
  id, source_draft_id, source_message_id, conversation_id, customer_id, intent_type,
  intent_status, source_text, candidate_json, cancellation_scope, revision,
  created_by, created_at, updated_at
)
SELECT
  intent_values.id, draft.id, intent_values.source_message_id, intent_values.conversation_id,
  intent_values.customer_id, intent_values.intent_type, intent_values.intent_status,
  intent_values.source_text, intent_values.candidate_json, intent_values.cancellation_scope,
  intent_values.revision, intent_values.created_by, intent_values.created_at, intent_values.updated_at
FROM (VALUES
${values}
) AS intent_values(
  id, source_message_id, conversation_id, customer_id, intent_type, intent_status,
  source_text, candidate_json, cancellation_scope, revision, created_by, created_at, updated_at
)
CROSS JOIN (SELECT id FROM upserted_draft) AS draft
ON CONFLICT (id) DO UPDATE SET
  intent_status = EXCLUDED.intent_status,
  source_text = EXCLUDED.source_text,
  candidate_json = EXCLUDED.candidate_json,
  cancellation_scope = EXCLUDED.cancellation_scope,
  revision = CASE
    WHEN inventory_intents.intent_status IS DISTINCT FROM EXCLUDED.intent_status
      OR inventory_intents.candidate_json IS DISTINCT FROM EXCLUDED.candidate_json
      OR inventory_intents.cancellation_scope IS DISTINCT FROM EXCLUDED.cancellation_scope
    THEN inventory_intents.revision + 1
    ELSE inventory_intents.revision
  END,
  updated_at = EXCLUDED.updated_at
WHERE inventory_intents.intent_status NOT IN ('临时留货-生效', '已转订单', '已过期', '已取消')
RETURNING json_build_object(
  'intentId', id,
  'sourceDraftId', source_draft_id,
  'sourceMessageId', source_message_id,
  'conversationId', conversation_id,
  'customerId', customer_id,
  'intentType', intent_type,
  'intentStatus', intent_status,
  'sourceText', source_text,
  'candidate', candidate_json,
  'cancellationScope', cancellation_scope,
  'relatedReservationId', related_reservation_id,
  'relatedOrderLineId', related_order_line_id,
  'revision', revision,
  'createdBy', created_by,
  'createdAt', created_at,
  'updatedAt', updated_at
) AS result`;
}

function buildInsertDraftLinesSql(draft, parameters) {
  if (draft.lines.length === 0) return "SELECT NULL::json AS result WHERE false";
  const values = draft.lines
    .map((line, index) => `(
    ${parameters.text(line.id)},
    ${parameters.integer(index + 1)},
    ${parameters.nullableText(line.product)},
    ${parameters.nullableText(line.orderType)},
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
  )`)
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
CROSS JOIN (SELECT id FROM upserted_draft) AS draft
CROSS JOIN draft_line_replacement_guard AS replacement_guard
RETURNING evidence_json || jsonb_build_object('id', id, 'draftLineId', id) AS result`;
}

function buildInsertTodosSql(todos, parameters) {
  if (todos.length === 0) return "SELECT NULL::json AS result WHERE false";
  const values = todos
    .map((todo) => `(
    ${parameters.text(todo.id)},
    ${parameters.text(todo.bizNo)},
    ${parameters.text(todo.type)},
    ${parameters.text(todo.refType)},
    ${parameters.text(todo.refId)},
    ${parameters.text(todo.priority)},
    ${parameters.text(todo.status)},
    ${parameters.text(todo.summary)},
    ${parameters.nullableTimestamp(normalizeOptionalTimestamp(todo.dueAt))}::timestamptz,
    ${parameters.nullableTimestamp(normalizeOptionalTimestamp(todo.remindAt))}::timestamptz,
    ${parameters.nullableText(todo.createdBy)}
  )`)
    .join(",\n");
  return `INSERT INTO todos (
  id, biz_no, type, ref_type, ref_id, priority, status, summary, due_at, remind_at, created_by, created_at, updated_at
)
SELECT todo_values.*, now(), now()
FROM (VALUES
${values}
) AS todo_values(id, biz_no, type, ref_type, ref_id, priority, status, summary, due_at, remind_at, created_by)
CROSS JOIN draft_write_guard AS guard
WHERE guard.ok
ON CONFLICT (id) DO UPDATE SET
  type = EXCLUDED.type,
  ref_type = EXCLUDED.ref_type,
  ref_id = EXCLUDED.ref_id,
  priority = EXCLUDED.priority,
  status = EXCLUDED.status,
  summary = EXCLUDED.summary,
  due_at = EXCLUDED.due_at,
  remind_at = EXCLUDED.remind_at,
  updated_at = now()
RETURNING json_build_object(
  'id', id,
  'bizNo', biz_no,
  'type', type,
  'refType', ref_type,
  'refId', ref_id,
  'priority', priority,
  'status', status,
  'summary', summary,
  'dueAt', due_at,
  'remindAt', remind_at,
  'createdBy', created_by,
  'createdAt', created_at
) AS result`;
}

function buildInsertOperationLogSql(operationLog, parameters) {
  return `INSERT INTO operation_logs (
  id, target_type, target_id, action, before_json, after_json, reason, operator_id, page_key, occurred_at, created_at
) SELECT
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
FROM draft_write_guard AS guard
WHERE guard.ok
ON CONFLICT (id) DO NOTHING
RETURNING id`;
}

export function normalizeOrderDraftTransactionResult(value) {
  if (!value || typeof value !== "object") return { draft: null, inventoryIntents: [], todos: [], operationLogId: "" };
  return {
    draft: normalizeOrderDraft(value.draft),
    inventoryIntents: normalizeInventoryIntents(value.inventoryIntents ?? value.inventory_intents),
    todos: normalizeTodos(value.todos),
    operationLogId: cleanText(value.operationLogId ?? value.operation_log_id),
  };
}

export function normalizeOrderDrafts(value) {
  return (Array.isArray(value) ? value : []).map((item) => normalizeOrderDraft(item)).filter(Boolean);
}

export function normalizeOrderDraft(value) {
  if (!value || typeof value !== "object") return null;
  const id = cleanText(value.id ?? value.draftId ?? value.draft_id);
  if (!id) return null;
  const revision = Math.max(0, toInteger(value.revision ?? value.clientRevision, 0));
  const createdAt = normalizeTimestamp(value.createdAt ?? value.created_at, new Date().toISOString());
  return {
    ...value,
    id,
    draftId: id,
    bizNo: cleanText(value.bizNo ?? value.biz_no) || id,
    sourceText: cleanText(value.sourceText ?? value.source_text),
    sourceChannel: cleanText(value.sourceChannel ?? value.source_channel) || "manual",
    sourceMessageId: cleanText(value.sourceMessageId ?? value.source_message_id),
    customerId: cleanText(value.customerId ?? value.customer_id),
    customerName: cleanText(value.customerName ?? value.customer_name),
    status: cleanText(value.status) || "待审核",
    revision,
    clientRevision: Math.max(1, toInteger(value.clientRevision ?? revision, revision || 1)),
    lines: (Array.isArray(value.lines) ? value.lines : []).map(line=>normalizeDraftLine(line && ["mini_program","wechat_mini_program"].includes(value.sourceChannel??value.source_channel) ? {...line,fulfillment:normalizeIntakeDeliveryMethod(line.fulfillment??line.fulfillmentMethod)}:line)).filter(Boolean),
    createdBy: cleanText(value.createdBy ?? value.created_by),
    createdAt,
    updatedAt: normalizeTimestamp(value.updatedAt ?? value.updated_at, createdAt),
  };
}

function normalizeDraftLine(value) {
  if (!value || typeof value !== "object") return null;
  const id = cleanText(value.id ?? value.draftLineId ?? value.draft_line_id);
  if (!id) return null;
  return {
    ...value,
    id,
    customerId: cleanText(value.customerId ?? value.customer_id),
    customer: cleanText(value.customer ?? value.customerName),
    product: cleanText(value.product ?? value.productName),
    size: cleanText(value.size),
    color: cleanText(value.color ?? value.bagColor),
    handle: cleanText(value.handle ?? value.handleType),
    style: cleanText(value.style),
    print: value.print === "是" || value.printFlag === true ? "是" : "否",
    printColor: cleanText(value.printColor),
    printSide: cleanText(value.printSide),
    handleColor: cleanText(value.handleColor),
    qty: Math.max(0, toInteger(value.qty, 0)),
    fulfillment: cleanText(value.fulfillment ?? value.fulfillmentMethod),
    latest: cleanText(value.latest ?? value.latestNeededAt),
    note: cleanText(value.note ?? value.customerNote ?? value.officeNote),
    confidence: cleanText(value.confidence),
    missingFields: Array.isArray(value.missingFields) ? value.missingFields.map(cleanText).filter(Boolean) : [],
  };
}

function normalizeTodos(value) {
  return (Array.isArray(value) ? value : []).map(normalizeTodo).filter(Boolean);
}

function normalizeTodo(value) {
  if (!value || typeof value !== "object") return null;
  const id = cleanText(value.id ?? value.todoId);
  if (!id) return null;
  return {
    ...value,
    id,
    bizNo: cleanText(value.bizNo ?? value.biz_no) || id,
    type: cleanText(value.type),
    refType: cleanText(value.refType ?? value.ref_type) || "order_draft",
    refId: cleanText(value.refId ?? value.ref_id ?? value.ref),
    priority: cleanText(value.priority ?? value.urgency) || "普通",
    status: cleanText(value.status) || (value.handled ? "已处理" : "未处理"),
    summary: cleanText(value.summary),
    dueAt: cleanText(value.dueAt ?? value.due_at ?? value.latest),
    remindAt: cleanText(value.remindAt ?? value.remind_at),
    createdBy: cleanText(value.createdBy ?? value.created_by),
    createdAt: normalizeTimestamp(value.createdAt ?? value.created_at, new Date().toISOString()),
  };
}

function normalizeOperationLog(value) {
  if (!value || typeof value !== "object") return null;
  const id = cleanText(value.id);
  if (!id) return null;
  return {
    id,
    targetType: cleanText(value.targetType ?? value.target_type),
    targetId: cleanText(value.targetId ?? value.target_id),
    action: cleanText(value.action),
    before: value.before ?? null,
    after: value.after ?? null,
    reason: cleanText(value.reason),
    operatorId: cleanText(value.operatorId ?? value.operator_id),
    pageKey: cleanText(value.pageKey ?? value.page_key) || "api",
    occurredAt: normalizeTimestamp(value.occurredAt ?? value.occurred_at, new Date().toISOString()),
    createdAt: normalizeTimestamp(value.createdAt ?? value.created_at, new Date().toISOString()),
  };
}

function applyOrderDraftWorkspaceMutation({ workspace, draft, inventoryIntents, todos, operationLog }) {
  if (!workspace) return;
  workspace.orderDrafts = upsertById(workspace.orderDrafts ?? [], draft);
  for (const intent of normalizeInventoryIntents(inventoryIntents)) {
    workspace.inventoryIntents = upsertById(workspace.inventoryIntents ?? [], intent);
  }
  for (const todo of normalizeTodos(todos)) workspace.todos = upsertById(workspace.todos ?? [], todo);
  if (operationLog) workspace.operationLogs = upsertById(workspace.operationLogs ?? [], operationLog);
}

function upsertById(rows, row) {
  if (!row?.id) return rows;
  const index = rows.findIndex((item) => item.id === row.id);
  if (index < 0) return [row, ...rows];
  return rows.map((item, itemIndex) => (itemIndex === index ? { ...item, ...row } : item));
}

function normalizeOptionalTimestamp(value) {
  const text = cleanText(value);
  if (!text || Number.isNaN(Date.parse(text))) return "";
  return new Date(text).toISOString();
}

function normalizeTimestamp(value, fallback) {
  const date = new Date(value ?? "");
  if (!Number.isNaN(date.getTime())) return date.toISOString();
  return fallback;
}

function toInteger(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.trunc(number) : fallback;
}

function cleanText(value) {
  return String(value ?? "").trim();
}

function orderDraftConcurrencyError() {
  const error = new Error("The order draft changed before this save could be committed.");
  error.statusCode = 409;
  error.code = "BUSINESS_WRITE_CONFLICT";
  return error;
}
