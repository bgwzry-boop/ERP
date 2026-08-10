import { randomUUID } from "node:crypto";

import { createPostgresPoolClient } from "../postgresPoolClient.mjs";
import { createPostgresParameterBinder } from "../postgresSqlParameters.mjs";
import { MiniappApiError } from "./miniappApiError.mjs";

function clean(value) {
  return String(value ?? "").trim();
}

function buildBusinessIds(receivedAt) {
  const date = new Date(receivedAt).toISOString().slice(0, 10).replaceAll("-", "");
  const suffix = randomUUID().replaceAll("-", "").slice(0, 10).toUpperCase();
  const orderId = `MP${date}${suffix}`;
  return {
    orderId,
    intakeId: `INTAKE-${suffix}`,
    draftId: `DRAFT-${orderId}`,
    todoId: `TODO-${orderId}`,
    snapshotId: `SNAP-${orderId}`,
  };
}

function desiredTimestamp(payload) {
  const date = clean(payload.desiredDate);
  const time = clean(payload.desiredTime);
  if (!date) return "";
  const candidate = `${date}T${time || "23:59"}:00+08:00`;
  return Number.isNaN(Date.parse(candidate)) ? "" : candidate;
}

function publicResponse(input, ids) {
  return {
    orderId: ids.orderId,
    intakeId: ids.intakeId,
    draftId: ids.draftId,
    status: "confirming",
    statusLabel: "工厂确认中",
    serverQuote: input.serverQuote,
    inventory: input.inventory,
    replayed: false,
  };
}

export function buildFindMiniappBindingQuery(input) {
  const parameters = createPostgresParameterBinder();
  const conditions = input.bindingId
    ? `binding.id = ${parameters.text(input.bindingId)}`
    : `binding.channel = ${parameters.text(input.channel)}
  AND binding.external_subject_fingerprint = ${parameters.text(input.externalSubjectFingerprint)}`;
  return {
    text: `
SELECT CASE WHEN binding.id IS NULL THEN NULL ELSE jsonb_build_object(
  'id', binding.id,
  'channel', binding.channel,
  'externalSubjectFingerprint', binding.external_subject_fingerprint,
  'customerId', binding.customer_id,
  'status', binding.status,
  'revision', binding.revision
) END AS result
FROM customer_channel_bindings AS binding
WHERE ${conditions}
  AND binding.status = 'active'
LIMIT 1;
`.trim(),
    values: parameters.values,
  };
}

export function buildCreateMiniappSubmissionTransaction(input, ids = buildBusinessIds(input.receivedAt)) {
  const parameters = createPostgresParameterBinder();
  const response = publicResponse(input, ids);
  const scope = parameters.text(input.idempotencyScope);
  const key = parameters.text(input.idempotencyKey);
  const requestHash = parameters.text(input.requestHash);
  const bindingId = parameters.text(input.bindingId);
  const customerId = parameters.text(input.customerId);
  const receivedAt = parameters.timestamp(input.receivedAt);
  const externalSubmissionId = parameters.text(input.externalSubmissionId);
  const rawPayload = parameters.json(input.rawPayload);
  const normalizedPayload = parameters.json(input.normalizedPayload);
  const responseJson = parameters.json(response);
  const draftSummary = parameters.json({
    source: "mini_program",
    intakeId: ids.intakeId,
    lineCount: input.normalizedPayload.lines.length,
    serverQuote: input.serverQuote,
    inventory: input.inventory,
  });
  const latestNeededAt = parameters.nullableTimestamp(desiredTimestamp(input.normalizedPayload));
  const lineSql = input.normalizedPayload.lines.map((line, index) => {
    const seq = index + 1;
    const draftLineId = `${ids.draftId}-${String(seq).padStart(2, "0")}`;
    const intakeLineId = `${ids.intakeId}-${String(seq).padStart(2, "0")}`;
    const printFlag = Boolean(line.artworkToken || line.printContent || line.printColor || /print/i.test(line.productType));
    const remark = [line.specialRequirements.join("、"), line.specialRequirementNote].filter(Boolean).join("；");
    return {
      draft: `(
  ${parameters.text(draftLineId)}, ${parameters.text(ids.draftId)}, ${parameters.integer(seq)},
  ${parameters.nullableText(line.productName || line.productType)}, ${parameters.nullableText(line.productType)},
  ${parameters.nullableText(line.size)}, ${parameters.nullableText(line.color)}, ${parameters.nullableText(line.handle || line.handleId)},
  ${parameters.nullableText(line.patternName || line.patternId)}, ${parameters.boolean(printFlag)},
  ${parameters.nullableText(line.printColor)}, ${parameters.nullableText(line.printSideMode || line.printSide)},
  ${parameters.nullableText(line.handleColor)}, ${parameters.integer(line.quantity)},
  ${parameters.nullableText(input.normalizedPayload.deliveryMethod)}, ${latestNeededAt}, ${parameters.nullableText(remark)},
  'structured', ARRAY[]::text[], ${parameters.json({ source: "mini_program", clientLineId: line.clientLineId, normalizedLine: line })},
  ${receivedAt}, ${receivedAt}
)`,
      intake: `(
  ${parameters.text(intakeLineId)}, ${parameters.text(line.clientLineId)}, ${parameters.integer(seq)},
  ${parameters.text(line.productType)}, ${parameters.text(line.size)}, ${parameters.text(line.colorId)}, ${parameters.text(line.handleId)},
  ${parameters.text(line.productName || line.productType)}, ${parameters.text(line.size)}, ${parameters.text(line.color)}, ${parameters.text(line.handle || line.handleId)},
  ${parameters.json(input.rawPayload.lines[index] || {})}, ${parameters.json(line)}, ${parameters.text(draftLineId)}, 'mapped', '',
  ${receivedAt}, ${receivedAt}
)`,
    };
  });
  const draftValues = lineSql.map((line) => line.draft).join(",\n");
  const intakeValues = lineSql.map((line) => line.intake).join(",\n");

  return {
    ids,
    text: `
BEGIN;
WITH intake_lock AS MATERIALIZED (
  SELECT pg_advisory_xact_lock(hashtextextended(${scope} || ':' || ${key}, 0)) AS locked
),
existing AS MATERIALIZED (
  SELECT submission.id, submission.request_hash, submission.public_response_json
  FROM order_intake_submissions AS submission
  CROSS JOIN intake_lock
  WHERE submission.idempotency_scope = ${scope}
    AND submission.idempotency_key = ${key}
  FOR UPDATE
),
request_guard AS MATERIALIZED (
  SELECT erp_require(
    NOT EXISTS (SELECT 1 FROM existing)
      OR EXISTS (SELECT 1 FROM existing WHERE request_hash = ${requestHash}),
    'ERP_MINIAPP_IDEMPOTENCY_CONFLICT'
  ) AS valid
),
new_request AS MATERIALIZED (
  SELECT 1 AS ready
  FROM request_guard
  WHERE NOT EXISTS (SELECT 1 FROM existing)
),
inserted_draft AS (
  INSERT INTO order_drafts (
    id, biz_no, source_text, source_channel, source_message_id, customer_id, status,
    recognition_summary, revision, created_by, created_at, updated_at
  )
  SELECT
    ${parameters.text(ids.draftId)}, ${parameters.text(ids.draftId)}, ${parameters.text("小程序结构化订单提交")},
    'mini_program', ${externalSubmissionId}, ${customerId}, '待审核', ${draftSummary}, 1, NULL, ${receivedAt}, ${receivedAt}
  FROM new_request
  RETURNING id
),
inserted_draft_lines AS (
  INSERT INTO order_draft_lines (
    id, order_draft_id, line_seq, product_name, order_type, size, bag_color, handle_type, style,
    print_flag, print_color, print_side, handle_color, qty, fulfillment_method, latest_needed_at,
    remark, confidence, missing_fields, evidence_json, created_at, updated_at
  )
  SELECT values_row.*
  FROM (VALUES
${draftValues}
  ) AS values_row(
    id, order_draft_id, line_seq, product_name, order_type, size, bag_color, handle_type, style,
    print_flag, print_color, print_side, handle_color, qty, fulfillment_method, latest_needed_at,
    remark, confidence, missing_fields, evidence_json, created_at, updated_at
  )
  CROSS JOIN inserted_draft
  RETURNING id
),
inserted_todo AS (
  INSERT INTO todos (
    id, biz_no, type, ref_type, ref_id, priority, status, summary, created_by, created_at, updated_at
  )
  SELECT
    ${parameters.text(ids.todoId)}, ${parameters.text(ids.todoId)}, '小程序订单待确认', 'order_draft', ${parameters.text(ids.draftId)},
    '普通', '未处理', ${parameters.text(`小程序订单 ${ids.orderId} 待核对价格、库存与交期`)}, NULL, ${receivedAt}, ${receivedAt}
  FROM inserted_draft
  RETURNING id
),
inserted_submission AS (
  INSERT INTO order_intake_submissions (
    id, biz_no, source_channel, binding_id, external_submission_id, idempotency_scope, idempotency_key,
    request_hash, raw_payload_json, normalized_payload_json, customer_id, status, draft_id,
    public_response_json, received_at, processed_at, revision, created_at, updated_at
  )
  SELECT
    ${parameters.text(ids.intakeId)}, ${parameters.text(ids.orderId)}, 'mini_program', ${bindingId}, ${externalSubmissionId},
    ${scope}, ${key}, ${requestHash}, ${rawPayload}, ${normalizedPayload}, ${customerId}, 'draft_created',
    ${parameters.text(ids.draftId)}, ${responseJson}, ${receivedAt}, ${receivedAt}, 1, ${receivedAt}, ${receivedAt}
  FROM inserted_draft
  CROSS JOIN inserted_todo
  WHERE (SELECT count(*) FROM inserted_draft_lines) = ${parameters.integer(input.normalizedPayload.lines.length)}
  RETURNING id, public_response_json
),
inserted_intake_lines AS (
  INSERT INTO order_intake_lines (
    id, submission_id, client_line_id, line_seq, external_product_type, external_size_id,
    external_color_id, external_handle_id, product_name_snapshot, size_snapshot, color_snapshot,
    handle_snapshot, raw_line_json, normalized_line_json, draft_line_id, mapping_status, mapping_detail,
    created_at, updated_at
  )
  SELECT
    values_row.id, inserted_submission.id, values_row.client_line_id, values_row.line_seq,
    values_row.external_product_type, values_row.external_size_id, values_row.external_color_id,
    values_row.external_handle_id, values_row.product_name_snapshot, values_row.size_snapshot,
    values_row.color_snapshot, values_row.handle_snapshot, values_row.raw_line_json,
    values_row.normalized_line_json, values_row.draft_line_id, values_row.mapping_status,
    values_row.mapping_detail, values_row.created_at, values_row.updated_at
  FROM (VALUES
${intakeValues}
  ) AS values_row(
    id, client_line_id, line_seq, external_product_type, external_size_id,
    external_color_id, external_handle_id, product_name_snapshot, size_snapshot, color_snapshot,
    handle_snapshot, raw_line_json, normalized_line_json, draft_line_id, mapping_status, mapping_detail,
    created_at, updated_at
  )
  CROSS JOIN inserted_submission
  RETURNING id
),
inserted_snapshot AS (
  INSERT INTO order_intake_snapshots (
    id, submission_id, snapshot_type, quote_snapshot_json, inventory_snapshot_json,
    delivery_snapshot_json, price_version, authoritative, captured_at, created_at
  )
  SELECT
    ${parameters.text(ids.snapshotId)}, inserted_submission.id, 'customer_submit', ${parameters.json(input.serverQuote)},
    ${parameters.json(input.inventory)}, ${parameters.json({
      deliveryMethod: input.normalizedPayload.deliveryMethod,
      desiredDate: input.normalizedPayload.desiredDate,
      desiredTime: input.normalizedPayload.desiredTime,
      addressId: input.normalizedPayload.addressId,
      address: input.normalizedPayload.address,
      packagingPreference: input.normalizedPayload.packagingPreference,
    })}, ${parameters.text(input.serverQuote.priceVersion)}, false, ${receivedAt}, ${receivedAt}
  FROM inserted_submission
  WHERE (SELECT count(*) FROM inserted_intake_lines) = ${parameters.integer(input.normalizedPayload.lines.length)}
  RETURNING id
)
SELECT CASE
  WHEN existing.id IS NOT NULL THEN existing.public_response_json || '{"replayed": true}'::jsonb
  ELSE inserted_submission.public_response_json
END AS result
FROM request_guard
LEFT JOIN existing ON true
LEFT JOIN inserted_submission ON true
LEFT JOIN inserted_snapshot ON true;
COMMIT;
`.trim(),
    values: parameters.values,
  };
}

export function buildListMiniappOrdersQuery(input = {}) {
  const parameters = createPostgresParameterBinder();
  const customerId = parameters.text(input.customerId);
  const orderIdFilter = input.orderId ? `AND submission.biz_no = ${parameters.text(input.orderId)}` : "";
  return {
    text: `
SELECT COALESCE(jsonb_agg(
  jsonb_build_object(
    'id', submission.biz_no,
    'createdAt', submission.received_at,
    'status', COALESCE(submission.public_response_json->>'status', 'confirming'),
    'statusLabel', COALESCE(submission.public_response_json->>'statusLabel', '工厂确认中'),
    'amount', COALESCE((submission.public_response_json->'serverQuote'->>'amount')::numeric, 0),
    'deliveryMethod', COALESCE(submission.normalized_payload_json->>'deliveryMethod', ''),
    'desiredDate', COALESCE(submission.normalized_payload_json->>'desiredDate', ''),
    'desiredTime', COALESCE(submission.normalized_payload_json->>'desiredTime', ''),
    'lines', COALESCE(submission.normalized_payload_json->'lines', '[]'::jsonb),
    'progressNote', '价格、库存与交期正在复核'
  ) ORDER BY submission.received_at DESC, submission.id DESC
), '[]'::jsonb) AS result
FROM order_intake_submissions AS submission
WHERE submission.customer_id = ${customerId}
  AND submission.source_channel = 'mini_program'
  ${orderIdFilter};
`.trim(),
    values: parameters.values,
  };
}

export function createPostgresMiniappRepository(options = {}) {
  const postgresClient = options.postgresClient || (options.queryJson || options.transactionJson ? null : createPostgresPoolClient(options));
  const queryJson = options.queryJson || ((text, values) => postgresClient.queryJson(text, values));
  const transactionJson = options.transactionJson || ((text, values) => postgresClient.transactionJson(text, values));

  return {
    kind: "postgres",
    async findActiveBinding(input) {
      const query = buildFindMiniappBindingQuery(input);
      return queryJson(query.text, query.values);
    },
    async getActiveBinding(bindingId) {
      const query = buildFindMiniappBindingQuery({ bindingId });
      return queryJson(query.text, query.values);
    },
    async createSubmissionWithDraft(input) {
      const query = buildCreateMiniappSubmissionTransaction(input);
      try {
        return await transactionJson(query.text, query.values);
      } catch (error) {
        if (/ERP_MINIAPP_IDEMPOTENCY_CONFLICT/.test(String(error?.message || ""))) {
          throw new MiniappApiError(409, "IDEMPOTENCY_KEY_REUSED", "本次提交内容已经变化，请返回确认页后重新提交");
        }
        throw error;
      }
    },
    async listOrdersForCustomer(customerId) {
      const query = buildListMiniappOrdersQuery({ customerId });
      return queryJson(query.text, query.values);
    },
    async getOrderForCustomer(customerId, orderId) {
      const query = buildListMiniappOrdersQuery({ customerId, orderId });
      const orders = await queryJson(query.text, query.values);
      return Array.isArray(orders) ? orders[0] || null : null;
    },
  };
}
