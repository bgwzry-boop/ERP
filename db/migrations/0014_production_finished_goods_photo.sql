-- Persist finished-goods photo review state and protect concurrent task writes.

ALTER TABLE production_tasks
  ADD COLUMN IF NOT EXISTS revision INTEGER NOT NULL DEFAULT 1;

ALTER TABLE production_tasks
  ADD COLUMN IF NOT EXISTS finished_goods_photo JSONB NOT NULL DEFAULT '{}'::jsonb;
