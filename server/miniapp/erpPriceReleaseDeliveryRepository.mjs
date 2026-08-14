import { createPostgresPoolClient } from "../postgresPoolClient.mjs";
import { createPostgresParameterBinder } from "../postgresSqlParameters.mjs";

export function buildClaimErpPriceReleaseDeliveriesQuery(input) {
  const parameters = createPostgresParameterBinder();
  const now = parameters.timestamp(input.now);
  const leaseExpiresAt = parameters.timestamp(input.leaseExpiresAt);
  const workerId = parameters.text(input.workerId);
  const leaseTokenPrefix = String(input.leaseTokenPrefix ?? "");
  return {
    text: `
WITH candidates AS MATERIALIZED (
  SELECT job.id
  FROM miniapp_price_release_delivery_jobs AS job
  JOIN miniapp_price_releases AS price_release ON price_release.id = job.release_id
  WHERE price_release.status = 'delivering'
    AND job.attempt_count < ${parameters.integer(input.maxAttempts)}
    AND (
      (job.status IN ('pending', 'retry', 'waiting_activation') AND job.next_attempt_at <= ${now})
      OR (job.status = 'running' AND job.lease_expires_at <= ${now})
    )
  ORDER BY job.next_attempt_at, job.created_at, job.id
  FOR UPDATE OF job SKIP LOCKED
  LIMIT ${parameters.integer(input.limit)}
), claimed AS (
  UPDATE miniapp_price_release_delivery_jobs AS job
  SET status = 'running', attempt_count = attempt_count + 1,
      lease_owner = ${workerId}, lease_token = ${parameters.text(leaseTokenPrefix)} || job.id,
      lease_expires_at = ${leaseExpiresAt}, last_error_code = '', updated_at = ${now}
  FROM candidates
  WHERE job.id = candidates.id
  RETURNING job.*
)
SELECT jsonb_build_object(
  'claims', COALESCE(jsonb_agg(jsonb_build_object(
    'jobId', claimed.id,
    'releaseId', price_release.id,
    'priceVersion', price_release.price_version,
    'payloadSha256', price_release.payload_sha256,
    'bundle', price_release.bundle_json,
    'attempt', claimed.attempt_count,
    'leaseToken', claimed.lease_token
  ) ORDER BY claimed.created_at, claimed.id), '[]'::jsonb)
) AS result
FROM claimed
JOIN miniapp_price_releases AS price_release ON price_release.id = claimed.release_id;
`.trim(),
    values: parameters.values,
  };
}

export function buildMarkErpPriceReleaseWaitingQuery(input) {
  const parameters = createPostgresParameterBinder();
  return {
    text: `
WITH updated AS (
  UPDATE miniapp_price_release_delivery_jobs
  SET status = 'waiting_activation', next_attempt_at = ${parameters.timestamp(input.nextAttemptAt)},
      lease_owner = NULL, lease_token = NULL, lease_expires_at = NULL,
      last_response_json = ${parameters.json(input.acknowledgement)}, updated_at = ${parameters.timestamp(input.now)}
  WHERE id = ${parameters.text(input.jobId)} AND status = 'running'
    AND lease_token = ${parameters.text(input.leaseToken)}
  RETURNING id
)
SELECT jsonb_build_object('updated', EXISTS (SELECT 1 FROM updated)) AS result;
`.trim(),
    values: parameters.values,
  };
}

export function buildMarkErpPriceReleaseDeliveredQuery(input) {
  const parameters = createPostgresParameterBinder();
  const jobId = parameters.text(input.jobId);
  const releaseId = parameters.text(input.releaseId);
  const leaseToken = parameters.text(input.leaseToken);
  const activatedAt = parameters.timestamp(input.activatedAt);
  const now = parameters.timestamp(input.now);
  return {
    text: `
WITH target_job AS MATERIALIZED (
  SELECT * FROM miniapp_price_release_delivery_jobs
  WHERE id = ${jobId} AND release_id = ${releaseId} AND status = 'running'
    AND lease_token = ${leaseToken}
  FOR UPDATE
), target_release AS MATERIALIZED (
  SELECT * FROM miniapp_price_releases
  WHERE id = ${releaseId} AND status = 'delivering'
  FOR UPDATE
), valid AS MATERIALIZED (
  SELECT 1 FROM target_job CROSS JOIN target_release
), superseded AS (
  UPDATE miniapp_price_releases
  SET status = 'superseded', superseded_at = ${activatedAt}, updated_at = ${now},
      revision = revision + 1
  WHERE status = 'published' AND id <> ${releaseId} AND EXISTS (SELECT 1 FROM valid)
  RETURNING id
), published AS (
  UPDATE miniapp_price_releases
  SET status = 'published', bff_activated_at = ${activatedAt}, updated_at = ${now},
      revision = revision + 1
  WHERE id = ${releaseId} AND EXISTS (SELECT 1 FROM valid)
  RETURNING id
), completed AS (
  UPDATE miniapp_price_release_delivery_jobs
  SET status = 'succeeded', completed_at = ${now}, next_attempt_at = ${now},
      lease_owner = NULL, lease_token = NULL, lease_expires_at = NULL,
      last_response_json = ${parameters.json(input.acknowledgement)}, updated_at = ${now}
  WHERE id = ${jobId} AND EXISTS (SELECT 1 FROM published)
  RETURNING id
)
SELECT jsonb_build_object('updated', EXISTS (SELECT 1 FROM completed)) AS result;
`.trim(),
    values: parameters.values,
  };
}

export function buildMarkErpPriceReleaseDeliveryFailedQuery(input) {
  const parameters = createPostgresParameterBinder();
  const terminal = input.retryAt ? "retry" : "dead";
  return {
    text: `
WITH updated AS (
  UPDATE miniapp_price_release_delivery_jobs
  SET status = '${terminal}', next_attempt_at = ${parameters.timestamp(input.retryAt || input.now)},
      lease_owner = NULL, lease_token = NULL, lease_expires_at = NULL,
      last_error_code = ${parameters.text(input.errorCode)},
      dead_at = ${input.retryAt ? "NULL" : parameters.timestamp(input.now)},
      updated_at = ${parameters.timestamp(input.now)}
  WHERE id = ${parameters.text(input.jobId)} AND status = 'running'
    AND lease_token = ${parameters.text(input.leaseToken)}
  RETURNING id
)
SELECT jsonb_build_object('updated', EXISTS (SELECT 1 FROM updated)) AS result;
`.trim(),
    values: parameters.values,
  };
}

export function createPostgresErpPriceReleaseDeliveryRepository(options = {}) {
  const postgresClient = options.postgresClient || createPostgresPoolClient(options);
  const transactionJson = options.transactionJson || ((text, values) => postgresClient.transactionJson(text, values));
  return Object.freeze({
    async claim(input) {
      const query = buildClaimErpPriceReleaseDeliveriesQuery(input);
      const result = await transactionJson(query.text, query.values);
      return Array.isArray(result?.claims) ? result.claims : [];
    },
    async markWaiting(input) {
      const query = buildMarkErpPriceReleaseWaitingQuery(input);
      return (await transactionJson(query.text, query.values))?.updated === true;
    },
    async markDelivered(input) {
      const query = buildMarkErpPriceReleaseDeliveredQuery(input);
      return (await transactionJson(query.text, query.values))?.updated === true;
    },
    async markFailed(input) {
      const query = buildMarkErpPriceReleaseDeliveryFailedQuery(input);
      return (await transactionJson(query.text, query.values))?.updated === true;
    },
  });
}
