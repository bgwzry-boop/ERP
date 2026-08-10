-- Customer mini-program intake boundary.
-- External submissions become reviewable ERP drafts; they never create formal orders directly.

CREATE TABLE IF NOT EXISTS customer_channel_bindings (
  id TEXT PRIMARY KEY,
  channel TEXT NOT NULL,
  external_subject_fingerprint TEXT NOT NULL,
  external_subject_ciphertext TEXT NOT NULL DEFAULT '',
  customer_id TEXT NOT NULL REFERENCES customers(id),
  status TEXT NOT NULL DEFAULT 'pending',
  verified_by TEXT REFERENCES users(id),
  verified_at TIMESTAMPTZ,
  revoked_by TEXT REFERENCES users(id),
  revoked_at TIMESTAMPTZ,
  revoke_reason TEXT NOT NULL DEFAULT '',
  revision INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(channel, external_subject_fingerprint),
  CHECK (status IN ('pending', 'active', 'revoked')),
  CHECK (char_length(external_subject_fingerprint) = 64)
);

CREATE TABLE IF NOT EXISTS miniapp_sessions (
  id TEXT PRIMARY KEY,
  binding_id TEXT NOT NULL REFERENCES customer_channel_bindings(id),
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ,
  CHECK (char_length(token_hash) = 64)
);

CREATE TABLE IF NOT EXISTS order_intake_submissions (
  id TEXT PRIMARY KEY,
  biz_no TEXT NOT NULL UNIQUE,
  source_channel TEXT NOT NULL,
  binding_id TEXT REFERENCES customer_channel_bindings(id),
  external_submission_id TEXT NOT NULL,
  idempotency_scope TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  raw_payload_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  normalized_payload_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  customer_id TEXT NOT NULL REFERENCES customers(id),
  status TEXT NOT NULL DEFAULT 'received',
  draft_id TEXT REFERENCES order_drafts(id),
  public_response_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  rejection_code TEXT NOT NULL DEFAULT '',
  rejection_detail TEXT NOT NULL DEFAULT '',
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed_at TIMESTAMPTZ,
  revision INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(source_channel, binding_id, external_submission_id),
  UNIQUE(idempotency_scope, idempotency_key),
  CHECK (char_length(idempotency_key) BETWEEN 8 AND 128),
  CHECK (char_length(request_hash) = 64),
  CHECK (status IN ('received', 'validating', 'draft_created', 'office_review', 'confirmed', 'returned', 'rejected'))
);

CREATE TABLE IF NOT EXISTS order_intake_lines (
  id TEXT PRIMARY KEY,
  submission_id TEXT NOT NULL REFERENCES order_intake_submissions(id),
  client_line_id TEXT NOT NULL,
  line_seq INTEGER NOT NULL,
  external_product_type TEXT NOT NULL DEFAULT '',
  external_size_id TEXT NOT NULL DEFAULT '',
  external_color_id TEXT NOT NULL DEFAULT '',
  external_handle_id TEXT NOT NULL DEFAULT '',
  product_name_snapshot TEXT NOT NULL DEFAULT '',
  size_snapshot TEXT NOT NULL DEFAULT '',
  color_snapshot TEXT NOT NULL DEFAULT '',
  handle_snapshot TEXT NOT NULL DEFAULT '',
  raw_line_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  normalized_line_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  draft_line_id TEXT REFERENCES order_draft_lines(id),
  mapping_status TEXT NOT NULL DEFAULT 'pending',
  mapping_detail TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(submission_id, client_line_id),
  UNIQUE(submission_id, line_seq),
  CHECK (line_seq > 0),
  CHECK (mapping_status IN ('pending', 'mapped', 'needs_review', 'rejected'))
);

CREATE TABLE IF NOT EXISTS order_intake_snapshots (
  id TEXT PRIMARY KEY,
  submission_id TEXT NOT NULL REFERENCES order_intake_submissions(id),
  snapshot_type TEXT NOT NULL,
  quote_snapshot_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  inventory_snapshot_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  delivery_snapshot_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  price_version TEXT NOT NULL DEFAULT '',
  authoritative BOOLEAN NOT NULL DEFAULT false,
  captured_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(submission_id, snapshot_type),
  CHECK (authoritative = false)
);

CREATE INDEX IF NOT EXISTS idx_customer_channel_bindings_customer
  ON customer_channel_bindings(customer_id, status);

CREATE INDEX IF NOT EXISTS idx_miniapp_sessions_binding_expiry
  ON miniapp_sessions(binding_id, expires_at DESC);

CREATE INDEX IF NOT EXISTS idx_order_intake_submissions_customer
  ON order_intake_submissions(customer_id, received_at DESC);

CREATE INDEX IF NOT EXISTS idx_order_intake_submissions_draft
  ON order_intake_submissions(draft_id);

CREATE INDEX IF NOT EXISTS idx_order_intake_lines_submission
  ON order_intake_lines(submission_id, line_seq);
