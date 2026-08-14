import { randomUUID } from "node:crypto";

import { createPostgresPoolClient } from "../postgresPoolClient.mjs";
import { createPostgresParameterBinder } from "../postgresSqlParameters.mjs";

function releaseProjection(alias = "price_release") {
  return `jsonb_build_object(
  'id', ${alias}.id,
  'priceVersion', ${alias}.price_version,
  'effectiveFrom', ${alias}.requested_effective_from,
  'changeSummary', ${alias}.change_summary,
  'payloadSha256', ${alias}.payload_sha256,
  'bundle', ${alias}.bundle_json,
  'status', ${alias}.status,
  'createdBy', ${alias}.created_by,
  'reviewedBy', ${alias}.reviewed_by,
  'reviewedAt', ${alias}.reviewed_at,
  'publishedBy', ${alias}.published_by,
  'publishedAt', ${alias}.published_at,
  'activatedAt', ${alias}.bff_activated_at,
  'supersededAt', ${alias}.superseded_at,
  'revision', ${alias}.revision
)`;
}

export function buildFindErpPriceReleaseQuery(input) {
  const parameters = createPostgresParameterBinder();
  const condition = input.id
    ? `price_release.id = ${parameters.text(input.id)}`
    : `price_release.price_version = ${parameters.text(input.priceVersion)}`;
  return {
    text: `
SELECT CASE WHEN price_release.id IS NULL THEN NULL ELSE ${releaseProjection()} END AS result
FROM miniapp_price_releases AS price_release
WHERE ${condition}
LIMIT 1;
`.trim(),
    values: parameters.values,
  };
}

export function buildCreateErpPriceReleaseDraftQuery(input) {
  const parameters = createPostgresParameterBinder();
  return {
    text: `
INSERT INTO miniapp_price_releases (
  id, price_version, requested_effective_from, change_summary, payload_sha256,
  bundle_json, status, created_by, reviewed_at, revision, created_at, updated_at
) VALUES (
  ${parameters.text(input.id)}, ${parameters.text(input.priceVersion)},
  ${parameters.timestamp(input.effectiveFrom)}, ${parameters.text(input.changeSummary)},
  ${parameters.text(input.payloadSha256)}, ${parameters.json(input.bundle)}, 'draft',
  ${parameters.text(input.createdBy)}, NULL, 1, ${parameters.timestamp(input.now)},
  ${parameters.timestamp(input.now)}
)
RETURNING ${releaseProjection("miniapp_price_releases")} || jsonb_build_object('disposition', 'created') AS result;
`.trim(),
    values: parameters.values,
  };
}

export function buildAssertErpPriceReleaseCoverageQuery(customerIds) {
  const parameters = createPostgresParameterBinder();
  const ids = parameters.textArray(customerIds);
  return {
    text: `
WITH active_accounts AS (
  SELECT miniapp_customer_id
  FROM miniapp_customer_accounts
  WHERE status = 'active'
), supplied AS (
  SELECT unnest(${ids}) AS miniapp_customer_id
)
SELECT jsonb_build_object(
  'activeCount', (SELECT count(*) FROM active_accounts),
  'coveredActiveCount', (
    SELECT count(*) FROM active_accounts
    JOIN supplied USING (miniapp_customer_id)
  ),
  'unknownCount', (
    SELECT count(*) FROM supplied
    LEFT JOIN miniapp_customer_accounts USING (miniapp_customer_id)
    WHERE miniapp_customer_accounts.miniapp_customer_id IS NULL
  )
) AS result;
`.trim(),
    values: parameters.values,
  };
}

export function buildReviewErpPriceReleaseQuery(input) {
  const parameters = createPostgresParameterBinder();
  const releaseId = parameters.text(input.releaseId);
  const reviewedBy = parameters.text(input.reviewedBy);
  const now = parameters.timestamp(input.now);
  return {
    text: `
WITH target AS MATERIALIZED (
  SELECT * FROM miniapp_price_releases WHERE id = ${releaseId} FOR UPDATE
), guard AS MATERIALIZED (
  SELECT erp_require(
    EXISTS (SELECT 1 FROM target WHERE status = 'draft' AND created_by <> ${reviewedBy}),
    'ERP_PRICE_RELEASE_REVIEW_CONFLICT'
  ) AS valid
), updated AS (
  UPDATE miniapp_price_releases
  SET status = 'reviewed', reviewed_by = ${reviewedBy}, reviewed_at = ${now},
      revision = revision + 1, updated_at = ${now}
  FROM guard
  WHERE id = ${releaseId}
  RETURNING miniapp_price_releases.*
)
SELECT ${releaseProjection("updated")} AS result FROM updated;
`.trim(),
    values: parameters.values,
  };
}

export function buildPublishErpPriceReleaseQuery(input) {
  const parameters = createPostgresParameterBinder();
  const releaseId = parameters.text(input.releaseId);
  const publishedBy = parameters.text(input.publishedBy);
  const now = parameters.timestamp(input.now);
  const jobId = parameters.text(input.jobId);
  return {
    text: `
WITH target AS MATERIALIZED (
  SELECT * FROM miniapp_price_releases WHERE id = ${releaseId} FOR UPDATE
), guard AS MATERIALIZED (
  SELECT erp_require(
    EXISTS (SELECT 1 FROM target WHERE status = 'reviewed'),
    'ERP_PRICE_RELEASE_PUBLISH_CONFLICT'
  ) AS valid
), updated AS (
  UPDATE miniapp_price_releases
  SET status = 'delivering', published_by = ${publishedBy}, published_at = ${now},
      revision = revision + 1, updated_at = ${now}
  FROM guard
  WHERE id = ${releaseId}
  RETURNING miniapp_price_releases.*
), inserted_job AS (
  INSERT INTO miniapp_price_release_delivery_jobs (
    id, release_id, status, attempt_count, next_attempt_at, created_at, updated_at
  )
  SELECT ${jobId}, updated.id, 'pending', 0, ${now}, ${now}, ${now}
  FROM updated
  RETURNING id
)
SELECT ${releaseProjection("updated")} || jsonb_build_object(
  'deliveryJobId', inserted_job.id
) AS result
FROM updated CROSS JOIN inserted_job;
`.trim(),
    values: parameters.values,
  };
}

export function createPostgresErpPriceReleaseRepository(options = {}) {
  const postgresClient = options.postgresClient || createPostgresPoolClient(options);
  const queryJson = options.queryJson || ((text, values) => postgresClient.queryJson(text, values));
  const transactionJson = options.transactionJson || ((text, values) => postgresClient.transactionJson(text, values));

  return Object.freeze({
    async findByPriceVersion(priceVersion) {
      const query = buildFindErpPriceReleaseQuery({ priceVersion });
      return queryJson(query.text, query.values);
    },
    async findById(id) {
      const query = buildFindErpPriceReleaseQuery({ id });
      return queryJson(query.text, query.values);
    },
    async createDraft(input) {
      const query = buildCreateErpPriceReleaseDraftQuery({
        ...input,
        id: `MPR-${randomUUID()}`,
      });
      return transactionJson(query.text, query.values);
    },
    async assertActiveCustomerCoverage(customerIds) {
      const query = buildAssertErpPriceReleaseCoverageQuery(customerIds);
      const result = await queryJson(query.text, query.values);
      if (!result || result.activeCount < 1 || result.unknownCount !== 0 ||
          result.coveredActiveCount !== result.activeCount || customerIds.length !== result.activeCount) {
        const error = new Error("ERP mini-program active customer price coverage is incomplete.");
        error.statusCode = 409;
        error.code = "ERP_PRICE_RELEASE_CUSTOMER_COVERAGE_INCOMPLETE";
        throw error;
      }
      return result;
    },
    async markReviewed(input) {
      const query = buildReviewErpPriceReleaseQuery(input);
      return transactionJson(query.text, query.values);
    },
    async enqueuePublication(input) {
      const query = buildPublishErpPriceReleaseQuery({
        ...input,
        jobId: `MPRJ-${randomUUID()}`,
      });
      return transactionJson(query.text, query.values);
    },
  });
}
