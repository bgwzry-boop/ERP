import { createPostgresPoolClient } from "../postgresPoolClient.mjs";
import { createPostgresParameterBinder } from "../postgresSqlParameters.mjs";
import { buildCreateMiniappSubmissionTransaction } from "./miniappPostgresRepository.mjs";

export function buildClaimBagwinNonceQuery(input) {
  const parameters = createPostgresParameterBinder();
  return {
    text: `
WITH expired AS (
  DELETE FROM bagwin_integration_request_nonces
  WHERE expires_at < now()
), inserted AS (
  INSERT INTO bagwin_integration_request_nonces (
    key_id, nonce, request_timestamp, expires_at, created_at
  ) VALUES (
    ${parameters.text(input.keyId)}, ${parameters.text(input.nonce)},
    ${parameters.timestamp(input.requestTimestamp)}, ${parameters.timestamp(input.expiresAt)}, now()
  )
  ON CONFLICT (key_id, nonce) DO NOTHING
  RETURNING nonce
)
SELECT jsonb_build_object('claimed', EXISTS (SELECT 1 FROM inserted)) AS result;
`.trim(),
    values: parameters.values,
  };
}

export function buildFindBagwinOrderQuery(sourceOrderNo) {
  const parameters = createPostgresParameterBinder();
  return {
    text: `
SELECT CASE WHEN submission.id IS NULL THEN NULL ELSE jsonb_build_object(
  'sourceOrderNo', submission.biz_no,
  'erpOrderId', submission.id,
  'payloadSha256', submission.request_hash
) END AS result
FROM order_intake_submissions AS submission
WHERE submission.idempotency_scope = 'bagwin:orders'
  AND submission.biz_no = ${parameters.text(sourceOrderNo)}
LIMIT 1;
`.trim(),
    values: parameters.values,
  };
}

export function buildBagwinCustomerExistsQuery(customerId) {
  const parameters = createPostgresParameterBinder();
  return {
    text: `
SELECT jsonb_build_object(
  'exists', EXISTS (
    SELECT 1 FROM customers WHERE id = ${parameters.text(customerId)}
  )
) AS result;
`.trim(),
    values: parameters.values,
  };
}

export function buildBagwinCustomerMappingExistsQuery(input) {
  const parameters = createPostgresParameterBinder();
  return {
    text: `
SELECT jsonb_build_object(
  'exists', EXISTS (
    SELECT 1
    FROM miniapp_customer_accounts
    WHERE miniapp_customer_id = ${parameters.text(input.miniappCustomerId)}
      AND customer_id = ${parameters.text(input.erpCustomerId)}
      AND status = 'active'
  )
) AS result;
`.trim(),
    values: parameters.values,
  };
}

export function buildFindEffectiveBagwinPriceReleaseQuery(input) {
  const parameters = createPostgresParameterBinder();
  return {
    text: `
SELECT CASE WHEN price_release.id IS NULL THEN NULL ELSE jsonb_build_object(
  'id', price_release.id,
  'priceVersion', price_release.price_version,
  'payloadSha256', price_release.payload_sha256,
  'activatedAt', price_release.bff_activated_at,
  'supersededAt', price_release.superseded_at
) END AS result
FROM miniapp_price_releases AS price_release
WHERE price_release.price_version = ${parameters.text(input.priceVersion)}
  AND price_release.payload_sha256 = ${parameters.text(input.payloadSha256)}
  AND price_release.status IN ('published', 'superseded')
  AND price_release.bff_activated_at IS NOT NULL
  AND price_release.bff_activated_at <= ${parameters.timestamp(input.submittedAt)}
  AND (
    price_release.superseded_at IS NULL
    OR price_release.superseded_at > ${parameters.timestamp(input.submittedAt)}
  )
LIMIT 1;
`.trim(),
    values: parameters.values,
  };
}

export function buildBagwinOrderStatusQuery({ sourceOrderNo, erpOrderId }) {
  const parameters = createPostgresParameterBinder();
  const source = parameters.text(sourceOrderNo);
  const erpId = parameters.text(erpOrderId);
  return {
    text: `
WITH target AS (
  SELECT submission.*
  FROM order_intake_submissions AS submission
  WHERE submission.idempotency_scope = 'bagwin:orders'
    AND submission.biz_no = ${source}
    AND submission.id = ${erpId}
  LIMIT 1
), formal_orders AS (
  SELECT original.*
  FROM original_orders AS original
  JOIN target ON original.source_draft_id = target.draft_id
), formal_lines AS (
  SELECT line.*
  FROM order_lines AS line
  JOIN formal_orders AS original ON original.id = line.order_id
), status_facts AS (
  SELECT
    COALESCE((SELECT jsonb_agg(DISTINCT original.summary_status) FROM formal_orders AS original), '[]'::jsonb) AS order_statuses,
    COALESCE((SELECT jsonb_agg(DISTINCT line.line_status) FROM formal_lines AS line), '[]'::jsonb) AS line_statuses,
    COALESCE((
      SELECT jsonb_agg(DISTINCT task.task_status)
      FROM production_tasks AS task
      JOIN formal_lines AS line ON line.id = task.order_line_id
    ), '[]'::jsonb) AS production_statuses,
    COALESCE((
      SELECT jsonb_agg(DISTINCT fulfillment.status)
      FROM fulfillment_records AS fulfillment
      JOIN formal_lines AS line ON line.id = fulfillment.order_line_id
    ), '[]'::jsonb) AS fulfillment_statuses,
    (SELECT min(line.latest_needed_at) FROM formal_lines AS line) AS expected_at
)
SELECT CASE WHEN target.id IS NULL THEN NULL ELSE jsonb_build_object(
  'sourceOrderNo', target.biz_no,
  'erpOrderId', target.id,
  'payloadSha256', target.request_hash,
  'intakeStatus', target.status,
  'draftStatus', COALESCE(draft.status, ''),
  'formalOrderCount', (SELECT count(*) FROM formal_orders),
  'orderStatuses', status_facts.order_statuses,
  'lineStatuses', status_facts.line_statuses,
  'productionStatuses', status_facts.production_statuses,
  'fulfillmentStatuses', status_facts.fulfillment_statuses,
  'expectedAt', status_facts.expected_at,
  'observedAt', greatest(target.updated_at, COALESCE(draft.updated_at, target.updated_at), now())
) END AS result
FROM target
LEFT JOIN order_drafts AS draft ON draft.id = target.draft_id
CROSS JOIN status_facts;
`.trim(),
    values: parameters.values,
  };
}

export function buildBagwinReconciliationExportQuery({ from, to, limit = 20_001 }) {
  const parameters = createPostgresParameterBinder();
  const windowFrom = parameters.timestamp(from instanceof Date ? from.toISOString() : from);
  const windowTo = parameters.timestamp(to instanceof Date ? to.toISOString() : to);
  const rowLimit = parameters.integer(limit);
  return {
    text: `
WITH targets AS MATERIALIZED (
  SELECT submission.*
  FROM order_intake_submissions AS submission
  WHERE submission.idempotency_scope = 'bagwin:orders'
    AND (submission.raw_payload_json->>'submittedAt')::timestamptz >= ${windowFrom}
    AND (submission.raw_payload_json->>'submittedAt')::timestamptz < ${windowTo}
  ORDER BY (submission.raw_payload_json->>'submittedAt')::timestamptz, submission.biz_no
  LIMIT ${rowLimit}
), export_rows AS (
  SELECT jsonb_build_object(
    'sourceOrderNo', target.biz_no,
    'sourceSubmittedAt', target.raw_payload_json->>'submittedAt',
    'erpOrderId', target.id,
    'payloadSha256', target.request_hash,
    'intakeStatus', target.status,
    'draftStatus', COALESCE(draft.status, ''),
    'formalOrderCount', (
      SELECT count(*)
      FROM original_orders AS original
      WHERE original.source_draft_id = target.draft_id
    ),
    'lineStatuses', COALESCE((
      SELECT jsonb_agg(DISTINCT line.line_status)
      FROM original_orders AS original
      JOIN order_lines AS line ON line.order_id = original.id
      WHERE original.source_draft_id = target.draft_id
    ), '[]'::jsonb),
    'productionStatuses', COALESCE((
      SELECT jsonb_agg(DISTINCT task.task_status)
      FROM original_orders AS original
      JOIN order_lines AS line ON line.order_id = original.id
      JOIN production_tasks AS task ON task.order_line_id = line.id
      WHERE original.source_draft_id = target.draft_id
    ), '[]'::jsonb),
    'fulfillmentStatuses', COALESCE((
      SELECT jsonb_agg(DISTINCT fulfillment.status)
      FROM original_orders AS original
      JOIN order_lines AS line ON line.order_id = original.id
      JOIN fulfillment_records AS fulfillment ON fulfillment.order_line_id = line.id
      WHERE original.source_draft_id = target.draft_id
    ), '[]'::jsonb),
    'expectedAt', (
      SELECT min(line.latest_needed_at)
      FROM original_orders AS original
      JOIN order_lines AS line ON line.order_id = original.id
      WHERE original.source_draft_id = target.draft_id
    ),
    'observedAt', greatest(target.updated_at, COALESCE(draft.updated_at, target.updated_at), now()),
    'confirmedAmount', (
      SELECT sum(latest_price.final_amount)
      FROM original_orders AS original
      JOIN order_lines AS line ON line.order_id = original.id
      JOIN LATERAL (
        SELECT snapshot.final_amount
        FROM price_snapshots AS snapshot
        WHERE snapshot.order_line_id = line.id
        ORDER BY snapshot.version_no DESC, snapshot.created_at DESC, snapshot.id DESC
        LIMIT 1
      ) AS latest_price ON true
      WHERE original.source_draft_id = target.draft_id
    ),
    'lines', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'skuId', NULLIF(intake_line.normalized_line_json->>'skuId', ''),
        'quantity', (intake_line.normalized_line_json->>'quantity')::integer
      ) ORDER BY intake_line.line_seq)
      FROM order_intake_lines AS intake_line
      WHERE intake_line.submission_id = target.id
    ), '[]'::jsonb)
  ) AS item
  FROM targets AS target
  LEFT JOIN order_drafts AS draft ON draft.id = target.draft_id
)
SELECT jsonb_build_object(
  'sourceOrderCount', (SELECT count(*) FROM targets),
  'orders', COALESCE((SELECT jsonb_agg(item) FROM export_rows), '[]'::jsonb)
) AS result;
`.trim(),
    values: parameters.values,
  };
}

function bagwinBusinessIds(sourceOrderNo) {
  return {
    orderId: sourceOrderNo,
    intakeId: `INTAKE-${sourceOrderNo}`,
    draftId: `DRAFT-${sourceOrderNo}`,
    todoId: `TODO-${sourceOrderNo}`,
    snapshotId: `SNAP-${sourceOrderNo}`,
  };
}

export function buildCreateBagwinOrderTransaction(input) {
  return buildCreateMiniappSubmissionTransaction({
    sourceOrderNo: input.sourceOrderNo,
    bindingId: null,
    customerId: input.customerId,
    externalSubmissionId: input.sourceOrderNo,
    idempotencyScope: "bagwin:orders",
    idempotencyKey: input.sourceOrderNo,
    requestHash: input.payloadSha256,
    rawPayload: input.rawPayload,
    normalizedPayload: input.normalizedPayload,
    serverQuote: input.serverQuote,
    inventory: input.inventory,
    receivedAt: input.receivedAt,
  }, bagwinBusinessIds(input.sourceOrderNo));
}

export function createPostgresBagwinErpIntegrationRepository(options = {}) {
  const postgresClient = options.postgresClient || createPostgresPoolClient(options);
  const queryJson = options.queryJson || ((text, values) => postgresClient.queryJson(text, values));
  const transactionJson = options.transactionJson || ((text, values) => postgresClient.transactionJson(text, values));

  return Object.freeze({
    kind: "postgres",
    async claim(input) {
      const query = buildClaimBagwinNonceQuery(input);
      const result = await queryJson(query.text, query.values);
      return result?.claimed === true;
    },
    async findBySourceOrderNo(sourceOrderNo) {
      const query = buildFindBagwinOrderQuery(sourceOrderNo);
      return queryJson(query.text, query.values);
    },
    async customerExists(customerId) {
      const query = buildBagwinCustomerExistsQuery(customerId);
      const result = await queryJson(query.text, query.values);
      return result?.exists === true;
    },
    async customerMappingExists(input) {
      const query = buildBagwinCustomerMappingExistsQuery(input);
      const result = await queryJson(query.text, query.values);
      return result?.exists === true;
    },
    async findEffectivePriceRelease(input) {
      const query = buildFindEffectiveBagwinPriceReleaseQuery(input);
      return queryJson(query.text, query.values);
    },
    async createOrderIntake(input) {
      const query = buildCreateBagwinOrderTransaction(input);
      const response = await transactionJson(query.text, query.values);
      return {
        sourceOrderNo: input.sourceOrderNo,
        erpOrderId: query.ids.intakeId,
        payloadSha256: input.payloadSha256,
        disposition: response?.replayed === true ? "existing" : "created",
      };
    },
    async getStatus(input) {
      const query = buildBagwinOrderStatusQuery(input);
      return queryJson(query.text, query.values);
    },
    async exportReconciliation(input) {
      const query = buildBagwinReconciliationExportQuery(input);
      return queryJson(query.text, query.values);
    },
  });
}
