-- V1 production exception records: trace the incident and follow-up without changing inventory or settlement.

CREATE TABLE IF NOT EXISTS production_exception_records (
  id TEXT PRIMARY KEY,
  biz_no TEXT NOT NULL UNIQUE,
  production_task_id TEXT NOT NULL REFERENCES production_tasks(id),
  order_line_id TEXT NOT NULL REFERENCES order_lines(id),
  process_type TEXT NOT NULL,
  machine_id TEXT,
  operator_id TEXT REFERENCES users(id),
  exception_type TEXT NOT NULL,
  continuation_mode TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT '待生产确认',
  estimated_loss_qty INTEGER NOT NULL DEFAULT 0 CHECK (estimated_loss_qty >= 0),
  affects_delivery BOOLEAN NOT NULL DEFAULT false,
  remark TEXT,
  evidence_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS production_exception_records_task_occurred_idx
  ON production_exception_records (production_task_id, occurred_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS production_exception_records_status_occurred_idx
  ON production_exception_records (status, occurred_at DESC, id DESC);
