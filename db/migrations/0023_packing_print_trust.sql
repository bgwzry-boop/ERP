-- Bind fulfillment-label trust to the exact fulfillment and package versions that were printed.
-- Historical records intentionally stay untrusted until a new current-version print is completed.

ALTER TABLE packages
  ADD COLUMN IF NOT EXISTS revision INTEGER NOT NULL DEFAULT 1;

ALTER TABLE print_records
  ADD COLUMN IF NOT EXISTS fulfillment_revision INTEGER;

ALTER TABLE print_records
  ADD COLUMN IF NOT EXISTS package_snapshot_json JSONB NOT NULL DEFAULT '[]'::jsonb;

CREATE INDEX IF NOT EXISTS print_records_fulfillment_trust_idx
  ON print_records (target_type, target_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS packages_fulfillment_revision_idx
  ON packages (fulfillment_id, revision, id);
