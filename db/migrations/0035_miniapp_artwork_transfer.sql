-- Durable ERP-side handoff for immutable clean artwork owned by a mini-program
-- order line. Intake creates the job atomically with the draft; a separate
-- worker pulls through the authenticated mini-program service, verifies the
-- digest, stores the file in ERP storage, and links it to the draft line.

CREATE TABLE IF NOT EXISTS miniapp_artwork_transfer_jobs (
  id TEXT PRIMARY KEY,
  submission_id TEXT NOT NULL REFERENCES order_intake_submissions(id),
  intake_line_id TEXT NOT NULL UNIQUE REFERENCES order_intake_lines(id),
  draft_line_id TEXT NOT NULL REFERENCES order_draft_lines(id),
  source_order_no TEXT NOT NULL,
  source_line_id TEXT NOT NULL,
  artwork_file_id TEXT NOT NULL,
  expected_file_name TEXT NOT NULL,
  expected_mime_type TEXT NOT NULL,
  expected_byte_size BIGINT NOT NULL CHECK (expected_byte_size > 0 AND expected_byte_size <= 209715200),
  expected_sha256 TEXT NOT NULL CHECK (expected_sha256 ~ '^[a-f0-9]{64}$'),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending', 'running', 'retry', 'succeeded', 'dead'
  )),
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  lease_token TEXT,
  lease_owner TEXT,
  lease_expires_at TIMESTAMPTZ,
  last_error_code TEXT,
  attachment_id TEXT REFERENCES attachments(id),
  completed_at TIMESTAMPTZ,
  dead_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (source_order_no, source_line_id, artwork_file_id),
  CONSTRAINT miniapp_artwork_transfer_error_shape
    CHECK (last_error_code IS NULL OR last_error_code ~ '^[A-Za-z0-9._:-]{1,120}$'),
  CONSTRAINT miniapp_artwork_transfer_lease_shape
    CHECK (
      (status = 'running' AND lease_token IS NOT NULL AND lease_owner IS NOT NULL AND lease_expires_at IS NOT NULL)
      OR
      (status <> 'running' AND lease_token IS NULL AND lease_owner IS NULL AND lease_expires_at IS NULL)
    ),
  CONSTRAINT miniapp_artwork_transfer_result_shape
    CHECK (
      (status = 'succeeded' AND attachment_id IS NOT NULL AND completed_at IS NOT NULL AND dead_at IS NULL)
      OR
      (status = 'dead' AND attachment_id IS NULL AND completed_at IS NULL AND dead_at IS NOT NULL)
      OR
      (status IN ('pending', 'running', 'retry') AND attachment_id IS NULL AND completed_at IS NULL AND dead_at IS NULL)
    )
);

CREATE INDEX IF NOT EXISTS idx_miniapp_artwork_transfer_due
  ON miniapp_artwork_transfer_jobs (next_attempt_at, created_at, id)
  WHERE status IN ('pending', 'retry', 'running');

CREATE INDEX IF NOT EXISTS idx_miniapp_artwork_transfer_draft
  ON miniapp_artwork_transfer_jobs (draft_line_id, status);
