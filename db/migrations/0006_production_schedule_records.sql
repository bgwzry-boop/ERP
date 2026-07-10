-- V1 scheduling migration draft: formal schedule records for machine queue ordering.
-- These records persist office/manual queue sequence decisions; they do not create inventory,
-- reservations, packing tasks, workshop reports, or shift attendance records.

CREATE TABLE IF NOT EXISTS production_schedule_records (
  id TEXT PRIMARY KEY,
  biz_no TEXT NOT NULL UNIQUE,
  production_task_id TEXT NOT NULL REFERENCES production_tasks(id),
  order_line_id TEXT REFERENCES order_lines(id),
  published_schedule_id TEXT NOT NULL DEFAULT '',
  machine_id TEXT NOT NULL,
  queue_seq INTEGER NOT NULL DEFAULT 0,
  schedule_status TEXT NOT NULL DEFAULT 'active',
  source_kind TEXT NOT NULL DEFAULT 'manual_resequence',
  planned_start_at TIMESTAMPTZ,
  planned_end_at TIMESTAMPTZ,
  sequence_updated_at TIMESTAMPTZ,
  sequence_updated_by TEXT REFERENCES users(id),
  remark TEXT NOT NULL DEFAULT '',
  created_by TEXT REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(machine_id, production_task_id)
);

CREATE INDEX IF NOT EXISTS idx_production_schedule_records_machine_seq
  ON production_schedule_records(machine_id, queue_seq, id);
CREATE INDEX IF NOT EXISTS idx_production_schedule_records_task
  ON production_schedule_records(production_task_id);
CREATE INDEX IF NOT EXISTS idx_production_schedule_records_status
  ON production_schedule_records(schedule_status);
