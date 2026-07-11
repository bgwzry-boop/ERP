-- Protect production schedule publishing and queue edits from stale or duplicate writes.

ALTER TABLE production_schedule_records
  ADD COLUMN IF NOT EXISTS revision INTEGER NOT NULL DEFAULT 1;
