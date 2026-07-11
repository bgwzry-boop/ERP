-- Protect packing completion from duplicate and concurrent writes.

ALTER TABLE packing_tasks
  ADD COLUMN IF NOT EXISTS revision INTEGER NOT NULL DEFAULT 1;
