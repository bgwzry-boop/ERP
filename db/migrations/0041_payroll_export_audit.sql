-- Payroll exports contain sensitive employee wage data. Every formal export is
-- permission-gated and recorded as an immutable digest-only audit event.

CREATE TABLE IF NOT EXISTS payroll_export_events (
  id TEXT PRIMARY KEY,
  payroll_run_id TEXT NOT NULL REFERENCES payroll_runs(id),
  payroll_month TEXT NOT NULL,
  revision INTEGER NOT NULL,
  run_status TEXT NOT NULL,
  file_name TEXT NOT NULL,
  content_digest TEXT NOT NULL,
  row_count INTEGER NOT NULL,
  exported_by TEXT REFERENCES users(id),
  exported_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT payroll_export_month_check CHECK (payroll_month ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  CONSTRAINT payroll_export_revision_check CHECK (revision >= 1),
  CONSTRAINT payroll_export_status_check CHECK (run_status IN ('reviewed', 'locked', 'paid')),
  CONSTRAINT payroll_export_digest_check CHECK (content_digest ~ '^[a-f0-9]{64}$'),
  CONSTRAINT payroll_export_row_count_check CHECK (row_count >= 1)
);

CREATE INDEX IF NOT EXISTS idx_payroll_export_events_run_time
  ON payroll_export_events(payroll_run_id, exported_at DESC);

CREATE OR REPLACE FUNCTION prevent_payroll_export_audit_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'payroll export audit events are immutable'
    USING ERRCODE = '23514';
END;
$$;

DROP TRIGGER IF EXISTS trg_payroll_export_audit_immutable ON payroll_export_events;
CREATE TRIGGER trg_payroll_export_audit_immutable
BEFORE UPDATE OR DELETE ON payroll_export_events
FOR EACH ROW EXECUTE FUNCTION prevent_payroll_export_audit_mutation();
