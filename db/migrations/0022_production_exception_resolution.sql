-- V1 production-exception follow-up: keep the supervisor/office decision on the same incident record.

ALTER TABLE production_exception_records
  ADD COLUMN IF NOT EXISTS resolution_code TEXT,
  ADD COLUMN IF NOT EXISTS resolution_note TEXT,
  ADD COLUMN IF NOT EXISTS resolved_by TEXT REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS production_exception_records_resolution_idx
  ON production_exception_records (status, resolved_at DESC, occurred_at DESC, id DESC);
