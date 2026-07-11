-- Protect statement communication updates from stale or duplicate writes.

ALTER TABLE statement_send_records
  ADD COLUMN IF NOT EXISTS revision INTEGER NOT NULL DEFAULT 1;
