-- V1 core migration draft: master data import review queue, confirmation plans, and execution records.
-- The detailed workbook-derived payload is stored as JSONB while common lookup fields stay indexed.

CREATE TABLE IF NOT EXISTS master_data_import_review_drafts (
  id TEXT PRIMARY KEY,
  status TEXT NOT NULL DEFAULT '',
  file_name TEXT NOT NULL DEFAULT '',
  requested_by TEXT NOT NULL DEFAULT '',
  checked_at TIMESTAMPTZ,
  payload_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS master_data_import_confirmation_plans (
  id TEXT PRIMARY KEY,
  draft_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT '',
  file_name TEXT NOT NULL DEFAULT '',
  created_by TEXT NOT NULL DEFAULT '',
  operation_log_id TEXT REFERENCES operation_logs(id),
  last_execution_id TEXT NOT NULL DEFAULT '',
  last_execution_status TEXT NOT NULL DEFAULT '',
  last_execution_at TIMESTAMPTZ,
  payload_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS master_data_import_executions (
  id TEXT PRIMARY KEY,
  plan_id TEXT NOT NULL,
  draft_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT '',
  file_name TEXT NOT NULL DEFAULT '',
  requested_by TEXT NOT NULL DEFAULT '',
  requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  official_writer_kind TEXT NOT NULL DEFAULT '',
  operation_log_id TEXT REFERENCES operation_logs(id),
  payload_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_master_data_import_review_drafts_status ON master_data_import_review_drafts(status);
CREATE INDEX IF NOT EXISTS idx_master_data_import_review_drafts_created_at ON master_data_import_review_drafts(created_at);
CREATE INDEX IF NOT EXISTS idx_master_data_import_confirmation_plans_draft ON master_data_import_confirmation_plans(draft_id);
CREATE INDEX IF NOT EXISTS idx_master_data_import_confirmation_plans_status ON master_data_import_confirmation_plans(status);
CREATE INDEX IF NOT EXISTS idx_master_data_import_confirmation_plans_created_at ON master_data_import_confirmation_plans(created_at);
CREATE INDEX IF NOT EXISTS idx_master_data_import_executions_plan ON master_data_import_executions(plan_id);
CREATE INDEX IF NOT EXISTS idx_master_data_import_executions_draft ON master_data_import_executions(draft_id);
CREATE INDEX IF NOT EXISTS idx_master_data_import_executions_status ON master_data_import_executions(status);
CREATE INDEX IF NOT EXISTS idx_master_data_import_executions_requested_at ON master_data_import_executions(requested_at);
