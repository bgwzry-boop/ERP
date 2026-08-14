import { createPostgresPoolClient } from "../postgresPoolClient.mjs";
import { createPostgresParameterBinder } from "../postgresSqlParameters.mjs";

function safeLimit(value) {
  return Math.max(1, Math.min(20, Math.trunc(Number(value ?? 4))));
}

export function buildClaimMiniappArtworkTransfersQuery(input) {
  const parameters = createPostgresParameterBinder();
  return {
    text: `
WITH candidates AS MATERIALIZED (
  SELECT job.id
  FROM miniapp_artwork_transfer_jobs AS job
  WHERE (
    job.status IN ('pending', 'retry') AND job.next_attempt_at <= ${parameters.timestamp(input.now)}
  ) OR (
    job.status = 'running' AND job.lease_expires_at <= ${parameters.timestamp(input.now)}
  )
  ORDER BY job.next_attempt_at, job.created_at, job.id
  FOR UPDATE SKIP LOCKED
  LIMIT ${parameters.integer(safeLimit(input.limit))}
),
claimed AS (
  UPDATE miniapp_artwork_transfer_jobs AS job
  SET status = 'running',
      attempt_count = job.attempt_count + 1,
      lease_token = ${parameters.text(input.leaseToken)},
      lease_owner = ${parameters.text(input.workerId)},
      lease_expires_at = ${parameters.timestamp(input.leaseExpiresAt)},
      last_error_code = NULL,
      updated_at = ${parameters.timestamp(input.now)}
  FROM candidates
  WHERE job.id = candidates.id
  RETURNING job.*
)
SELECT COALESCE(jsonb_agg(jsonb_build_object(
  'jobId', claimed.id,
  'submissionId', claimed.submission_id,
  'intakeLineId', claimed.intake_line_id,
  'draftLineId', claimed.draft_line_id,
  'sourceOrderNo', claimed.source_order_no,
  'sourceLineId', claimed.source_line_id,
  'artwork', jsonb_build_object(
    'fileId', claimed.artwork_file_id,
    'fileName', claimed.expected_file_name,
    'mimeType', claimed.expected_mime_type,
    'byteSize', claimed.expected_byte_size,
    'sha256', claimed.expected_sha256
  ),
  'attempt', claimed.attempt_count,
  'leaseToken', claimed.lease_token
) ORDER BY claimed.created_at, claimed.id), '[]'::jsonb) AS result
FROM claimed;
`.trim(),
    values: parameters.values,
  };
}

export function buildCompleteMiniappArtworkTransferQuery(input) {
  const parameters = createPostgresParameterBinder();
  const attachmentId = `${input.jobId}-ATT`;
  const linkId = `${input.jobId}-LINK`;
  return {
    text: `
BEGIN;
WITH locked_job AS MATERIALIZED (
  SELECT *
  FROM miniapp_artwork_transfer_jobs
  WHERE id = ${parameters.text(input.jobId)}
    AND status = 'running'
    AND lease_token = ${parameters.text(input.leaseToken)}
  FOR UPDATE
),
inserted_attachment AS (
  INSERT INTO attachments (
    id, file_name, file_type, purpose, mime_type, file_size_bytes, has_content,
    storage_provider, storage_key, content_digest, uploaded_at, metadata_json,
    status, updated_at
  )
  SELECT ${parameters.text(attachmentId)}, locked_job.expected_file_name,
         ${parameters.text(input.fileType)}, 'miniapp_print_artwork',
         locked_job.expected_mime_type, locked_job.expected_byte_size, true,
         ${parameters.text(input.storageProvider)}, ${parameters.text(input.storageKey)},
         locked_job.expected_sha256, ${parameters.timestamp(input.now)},
         jsonb_build_object(
           'source', 'miniapp',
           'sourceOrderNo', locked_job.source_order_no,
           'sourceLineId', locked_job.source_line_id,
           'artworkFileId', locked_job.artwork_file_id,
           'verifiedSha256', locked_job.expected_sha256
         ), 'uploaded', ${parameters.timestamp(input.now)}
  FROM locked_job
  ON CONFLICT (id) DO UPDATE SET
    storage_provider = EXCLUDED.storage_provider,
    storage_key = EXCLUDED.storage_key,
    updated_at = EXCLUDED.updated_at
  WHERE attachments.content_digest = EXCLUDED.content_digest
    AND attachments.file_size_bytes = EXCLUDED.file_size_bytes
    AND attachments.mime_type = EXCLUDED.mime_type
  RETURNING id
),
inserted_link AS (
  INSERT INTO attachment_links (id, attachment_id, owner_type, owner_id, purpose, created_at)
  SELECT ${parameters.text(linkId)}, inserted_attachment.id, 'order_draft_line',
         locked_job.draft_line_id, 'print_artwork', ${parameters.timestamp(input.now)}
  FROM inserted_attachment
  CROSS JOIN locked_job
  ON CONFLICT (attachment_id, owner_type, owner_id, purpose) DO UPDATE SET
    created_at = attachment_links.created_at
  RETURNING attachment_id
),
updated_job AS (
  UPDATE miniapp_artwork_transfer_jobs AS job
  SET status = 'succeeded', attachment_id = inserted_link.attachment_id,
      completed_at = ${parameters.timestamp(input.now)}, dead_at = NULL,
      lease_token = NULL, lease_owner = NULL, lease_expires_at = NULL,
      last_error_code = NULL, updated_at = ${parameters.timestamp(input.now)}
  FROM inserted_link
  WHERE job.id = ${parameters.text(input.jobId)}
    AND job.lease_token = ${parameters.text(input.leaseToken)}
  RETURNING job.id, job.attachment_id
),
closed_failure_todo AS (
  UPDATE todos
  SET status = '已处理', handled_at = ${parameters.timestamp(input.now)},
      handling_result = '稿件已自动补传', updated_at = ${parameters.timestamp(input.now)}
  WHERE ref_type = 'miniapp_artwork_transfer'
    AND ref_id = ${parameters.text(input.jobId)}
    AND EXISTS (SELECT 1 FROM updated_job)
  RETURNING id
)
SELECT CASE WHEN updated_job.id IS NULL THEN NULL ELSE jsonb_build_object(
  'jobId', updated_job.id,
  'attachmentId', updated_job.attachment_id
) END AS result
FROM updated_job;
COMMIT;
`.trim(),
    values: parameters.values,
  };
}

export function buildFailMiniappArtworkTransferQuery(input) {
  const parameters = createPostgresParameterBinder();
  const retry = Boolean(input.retryAt);
  return {
    text: `
BEGIN;
WITH updated_job AS (
  UPDATE miniapp_artwork_transfer_jobs AS job
  SET status = ${parameters.text(retry ? "retry" : "dead")},
      next_attempt_at = ${parameters.timestamp(input.retryAt || input.now)},
      last_error_code = ${parameters.text(input.errorCode)},
      dead_at = ${parameters.nullableTimestamp(retry ? null : input.now)},
      lease_token = NULL, lease_owner = NULL, lease_expires_at = NULL,
      updated_at = ${parameters.timestamp(input.now)}
  WHERE job.id = ${parameters.text(input.jobId)}
    AND job.status = 'running'
    AND job.lease_token = ${parameters.text(input.leaseToken)}
  RETURNING job.*
),
inserted_todo AS (
  INSERT INTO todos (
    id, biz_no, type, ref_type, ref_id, priority, status, summary,
    created_by, created_at, updated_at
  )
  SELECT ${parameters.text(`TODO-${input.jobId}`)}, ${parameters.text(`TODO-${input.jobId}`)},
         '小程序稿件传输失败', 'miniapp_artwork_transfer', updated_job.id,
         '高', '未处理',
         '小程序订单 ' || updated_job.source_order_no || ' 的稿件传输失败，正式确认已阻止',
         NULL, ${parameters.timestamp(input.now)}, ${parameters.timestamp(input.now)}
  FROM updated_job
  WHERE updated_job.status = 'dead'
  ON CONFLICT (id) DO UPDATE SET
    summary = EXCLUDED.summary,
    status = '未处理',
    handled_at = NULL,
    handling_result = NULL,
    updated_at = EXCLUDED.updated_at
  RETURNING id
)
SELECT CASE WHEN updated_job.id IS NULL THEN NULL ELSE jsonb_build_object(
  'jobId', updated_job.id,
  'status', updated_job.status,
  'todoId', (SELECT id FROM inserted_todo LIMIT 1)
) END AS result
FROM updated_job;
COMMIT;
`.trim(),
    values: parameters.values,
  };
}

export function createPostgresMiniappArtworkTransferRepository(options = {}) {
  const database = options.database ?? createPostgresPoolClient({
    databaseUrl: options.databaseUrl,
    pool: options.pool,
  });
  return Object.freeze({
    claim(input) {
      const query = buildClaimMiniappArtworkTransfersQuery(input);
      return database.transactionJson(query.text, query.values).then((value) => Array.isArray(value) ? value : []);
    },
    complete(input) {
      const query = buildCompleteMiniappArtworkTransferQuery(input);
      return database.transactionJson(query.text, query.values);
    },
    fail(input) {
      const query = buildFailMiniappArtworkTransferQuery(input);
      return database.transactionJson(query.text, query.values);
    },
  });
}
