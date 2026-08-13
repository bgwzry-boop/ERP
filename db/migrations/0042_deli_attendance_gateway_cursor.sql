-- The Deli comprehensive check-in API is incremental-only. Persist the official
-- next_id together with a minimal redacted punch cache so ERP read-only precheck
-- and the subsequent formal import can query the same half-open time range.

CREATE TABLE IF NOT EXISTS deli_attendance_gateway_cursors (
  provider TEXT PRIMARY KEY,
  next_id BIGINT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT deli_attendance_gateway_cursor_provider_required CHECK (provider ~ '^[a-z0-9][a-z0-9_-]{0,63}$'),
  CONSTRAINT deli_attendance_gateway_cursor_nonnegative CHECK (next_id >= 0)
);

CREATE TABLE IF NOT EXISTS deli_attendance_gateway_punches (
  provider TEXT NOT NULL,
  external_punch_id TEXT NOT NULL,
  external_employee_id TEXT NOT NULL,
  punched_at TIMESTAMPTZ NOT NULL,
  local_work_date DATE NOT NULL,
  event_type TEXT NOT NULL,
  raw_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (provider, external_punch_id),
  CONSTRAINT deli_attendance_gateway_provider_required CHECK (provider ~ '^[a-z0-9][a-z0-9_-]{0,63}$'),
  CONSTRAINT deli_attendance_gateway_external_punch_required CHECK (length(btrim(external_punch_id)) > 0),
  CONSTRAINT deli_attendance_gateway_external_employee_required CHECK (length(btrim(external_employee_id)) > 0),
  CONSTRAINT deli_attendance_gateway_raw_object CHECK (jsonb_typeof(raw_payload) = 'object')
);

CREATE INDEX IF NOT EXISTS idx_deli_attendance_gateway_punch_time
  ON deli_attendance_gateway_punches(provider, punched_at, external_punch_id);

CREATE OR REPLACE FUNCTION prevent_deli_attendance_gateway_punch_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'Deli attendance gateway punch evidence is immutable'
    USING ERRCODE = '23514';
END;
$$;

DROP TRIGGER IF EXISTS trg_deli_attendance_gateway_punch_immutable
  ON deli_attendance_gateway_punches;
CREATE TRIGGER trg_deli_attendance_gateway_punch_immutable
BEFORE UPDATE OR DELETE ON deli_attendance_gateway_punches
FOR EACH ROW EXECUTE FUNCTION prevent_deli_attendance_gateway_punch_mutation();
