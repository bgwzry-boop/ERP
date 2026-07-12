import { createPostgresPoolClient } from "./postgresPoolClient.mjs";
import { createPostgresParameterBinder } from "./postgresSqlParameters.mjs";
import { createPostgresTransactionExecutor } from "./postgresTransactionExecutor.mjs";
import { buildPostgresIdempotencyRequest, resolveRepositoryIdempotencyKey } from "./idempotency.mjs";

export function createOrderDraftRepository(options = {}) {
  const mode = options.mode ?? process.env.ERP_ORDER_DRAFT_STORE ?? process.env.ERP_ORDER_STORE ?? "local";
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
  return {
    kind: "local_memory",

    loadState() {
      return { orderDrafts: [] };
    },

    getOrderDraft(input) {
      return normalizeOrderDraft((input.workspace?.orderDrafts ?? []).find((item) => item.id === input.draftId));
    },

    saveOrderDraft(input) {
      const requestedDraft = normalizeOrderDraft(input.draft);
      const expectedRevision = Math.max(0, toInteger(input.expectedRevision ?? requestedDraft?.revision, 0));
      const currentDraft = (input.workspace?.orderDrafts ?? []).find((item) => item.id === requestedDraft?.id);
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
        todos: input.todos,
        operationLog: input.operationLog,
      });
      return {
        draft,
        todos: normalizeTodos(input.todos),
        operationLogId: input.operationLog?.id ?? "",
      };
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

    async loadState() {
      const query = buildListOrderDraftsQuery();
      return { orderDrafts: normalizeOrderDrafts(await queryJson(query.text, query.values)) };
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
      'confidence', COALESCE(line.confidence, '')
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
  const operationLog = normalizeOperationLog(input.operationLog);
  if (!draft || !operationLog) throw new Error("Order draft and operation log are required");
  const expectedRevision = Math.max(0, Number(input.expectedRevision ?? draft.revision) || 0);
  const parameters = createPostgresParameterBinder();
  const lineSql = buildInsertDraftLinesSql(draft, parameters);
  const todoSql = buildInsertTodosSql(todos, parameters);
  const operationLogSql = buildInsertOperationLogSql(operationLog, parameters);

  return {
    text: `
BEGIN;
WITH locked_draft AS MATERIALIZED (
  SELECT id, revision
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
  WHERE ${parameters.integer(expectedRevision)} = 0
    OR EXISTS (SELECT 1 FROM locked_draft WHERE revision = ${parameters.integer(expectedRevision)})
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

function buildInsertDraftLinesSql(draft, parameters) {
  if (draft.lines.length === 0) return "SELECT NULL::json AS result WHERE false";
  const values = draft.lines
    .map((line, index) => `(
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
  if (!value || typeof value !== "object") return { draft: null, todos: [], operationLogId: "" };
  return {
    draft: normalizeOrderDraft(value.draft),
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
    lines: (Array.isArray(value.lines) ? value.lines : []).map(normalizeDraftLine).filter(Boolean),
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

function applyOrderDraftWorkspaceMutation({ workspace, draft, todos, operationLog }) {
  if (!workspace) return;
  workspace.orderDrafts = upsertById(workspace.orderDrafts ?? [], draft);
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
