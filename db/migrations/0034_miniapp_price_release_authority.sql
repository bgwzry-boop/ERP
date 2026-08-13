-- ERP-owned customer price publication ledger and reliable delivery boundary.
-- A mini-program order may only claim an authoritative locked price after its
-- version and digest have been matched to this ledger for the submit instant.

CREATE TABLE IF NOT EXISTS miniapp_customer_accounts (
  miniapp_customer_id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL UNIQUE REFERENCES customers(id),
  status TEXT NOT NULL DEFAULT 'active',
  created_by TEXT REFERENCES users(id),
  verified_by TEXT REFERENCES users(id),
  verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (miniapp_customer_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'),
  CHECK (status IN ('active', 'disabled'))
);

CREATE INDEX IF NOT EXISTS idx_miniapp_customer_accounts_customer
  ON miniapp_customer_accounts (customer_id, status);

CREATE TABLE IF NOT EXISTS miniapp_price_releases (
  id TEXT PRIMARY KEY,
  price_version TEXT NOT NULL UNIQUE,
  requested_effective_from TIMESTAMPTZ NOT NULL,
  change_summary TEXT NOT NULL,
  payload_sha256 TEXT NOT NULL,
  bundle_json JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  created_by TEXT NOT NULL REFERENCES users(id),
  reviewed_by TEXT REFERENCES users(id),
  reviewed_at TIMESTAMPTZ,
  published_by TEXT REFERENCES users(id),
  published_at TIMESTAMPTZ,
  bff_activated_at TIMESTAMPTZ,
  superseded_at TIMESTAMPTZ,
  rejection_code TEXT NOT NULL DEFAULT '',
  revision INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (status IN ('draft', 'reviewed', 'delivering', 'published', 'superseded', 'rejected')),
  CHECK (char_length(trim(change_summary)) BETWEEN 1 AND 500),
  CHECK (payload_sha256 ~ '^[a-f0-9]{64}$'),
  CHECK (jsonb_typeof(bundle_json) = 'object'),
  CHECK (reviewed_by IS NULL OR reviewed_by <> created_by),
  CHECK (
    (status = 'draft' AND reviewed_by IS NULL AND reviewed_at IS NULL)
    OR (status <> 'draft' AND reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL)
  ),
  CHECK (bff_activated_at IS NULL OR published_at IS NOT NULL),
  CHECK (superseded_at IS NULL OR bff_activated_at IS NOT NULL)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_miniapp_price_releases_one_published
  ON miniapp_price_releases ((status))
  WHERE status = 'published';

CREATE INDEX IF NOT EXISTS idx_miniapp_price_releases_effective
  ON miniapp_price_releases (requested_effective_from DESC, reviewed_at DESC);

CREATE TABLE IF NOT EXISTS miniapp_price_release_delivery_jobs (
  id TEXT PRIMARY KEY,
  release_id TEXT NOT NULL UNIQUE REFERENCES miniapp_price_releases(id),
  status TEXT NOT NULL DEFAULT 'pending',
  attempt_count INTEGER NOT NULL DEFAULT 0,
  next_attempt_at TIMESTAMPTZ NOT NULL,
  lease_owner TEXT,
  lease_token TEXT,
  lease_expires_at TIMESTAMPTZ,
  last_error_code TEXT NOT NULL DEFAULT '',
  last_response_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  completed_at TIMESTAMPTZ,
  dead_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (status IN ('pending', 'running', 'waiting_activation', 'retry', 'succeeded', 'dead')),
  CHECK (attempt_count >= 0),
  CHECK (jsonb_typeof(last_response_json) = 'object'),
  CHECK (
    (status = 'running' AND lease_owner IS NOT NULL AND lease_token IS NOT NULL AND lease_expires_at IS NOT NULL)
    OR (status <> 'running')
  )
);

CREATE INDEX IF NOT EXISTS idx_miniapp_price_release_delivery_due
  ON miniapp_price_release_delivery_jobs (status, next_attempt_at, created_at);

ALTER TABLE order_intake_snapshots
  ADD COLUMN IF NOT EXISTS price_release_id TEXT REFERENCES miniapp_price_releases(id),
  ADD COLUMN IF NOT EXISTS price_release_sha256 TEXT NOT NULL DEFAULT '';

ALTER TABLE order_intake_snapshots
  DROP CONSTRAINT IF EXISTS order_intake_snapshots_authoritative_check;

ALTER TABLE order_intake_snapshots
  ADD CONSTRAINT order_intake_snapshots_authoritative_lock_check CHECK (
    (authoritative = false AND price_release_id IS NULL AND price_release_sha256 = '')
    OR
    (authoritative = true AND price_release_id IS NOT NULL AND
     price_release_sha256 ~ '^[a-f0-9]{64}$')
  );

CREATE INDEX IF NOT EXISTS idx_order_intake_snapshots_price_release
  ON order_intake_snapshots (price_release_id)
  WHERE price_release_id IS NOT NULL;
