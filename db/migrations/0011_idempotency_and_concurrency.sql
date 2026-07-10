-- Production write safety: replay protection and revision columns for high-risk business rows.

CREATE TABLE IF NOT EXISTS operation_idempotency_keys (
  scope TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  response_json JSONB NOT NULL,
  operator_id TEXT,
  target_type TEXT NOT NULL DEFAULT '',
  target_id TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '30 days'),
  PRIMARY KEY(scope, idempotency_key),
  CHECK (char_length(idempotency_key) BETWEEN 8 AND 128),
  CHECK (char_length(request_hash) = 64)
);

CREATE INDEX IF NOT EXISTS idx_operation_idempotency_expires
  ON operation_idempotency_keys(expires_at);

CREATE INDEX IF NOT EXISTS idx_operation_idempotency_target
  ON operation_idempotency_keys(target_type, target_id, completed_at DESC);

CREATE OR REPLACE FUNCTION erp_require(condition BOOLEAN, message TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT condition THEN
    RAISE EXCEPTION '%', message USING ERRCODE = 'P0001';
  END IF;
  RETURN TRUE;
END;
$$;

ALTER TABLE inventory_items
  ADD COLUMN IF NOT EXISTS revision INTEGER NOT NULL DEFAULT 1;

ALTER TABLE fulfillment_records
  ADD COLUMN IF NOT EXISTS revision INTEGER NOT NULL DEFAULT 1;

ALTER TABLE statements
  ADD COLUMN IF NOT EXISTS revision INTEGER NOT NULL DEFAULT 1;

ALTER TABLE raw_material_inbounds
  ADD COLUMN IF NOT EXISTS revision INTEGER NOT NULL DEFAULT 1;

ALTER TABLE print_jobs
  ADD COLUMN IF NOT EXISTS revision INTEGER NOT NULL DEFAULT 1;

ALTER TABLE printer_devices
  ADD COLUMN IF NOT EXISTS revision INTEGER NOT NULL DEFAULT 1;

ALTER TABLE driver_delivery_dispatches
  ADD COLUMN IF NOT EXISTS revision INTEGER NOT NULL DEFAULT 1;
