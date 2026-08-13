-- Employee profile, attendance identity, and payroll workflow.
-- The ERP employee id is the only canonical identity. Attendance provider ids are external mappings.

ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS birth_date DATE,
  ADD COLUMN IF NOT EXISTS hire_date DATE,
  ADD COLUMN IF NOT EXISTS attendance_provider TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS attendance_external_id TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS attendance_mapping_updated_by TEXT,
  ADD COLUMN IF NOT EXISTS attendance_mapping_updated_at TIMESTAMPTZ;

CREATE UNIQUE INDEX IF NOT EXISTS uq_employees_attendance_identity
  ON employees(attendance_provider, attendance_external_id)
  WHERE attendance_provider <> '' AND attendance_external_id <> '';

CREATE TABLE IF NOT EXISTS attendance_import_batches (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  range_start TIMESTAMPTZ NOT NULL,
  range_end TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'completed',
  fetched_count INTEGER NOT NULL DEFAULT 0,
  imported_count INTEGER NOT NULL DEFAULT 0,
  duplicate_count INTEGER NOT NULL DEFAULT 0,
  unmatched_count INTEGER NOT NULL DEFAULT 0,
  issue_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  requested_by TEXT REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS attendance_punches (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  external_punch_id TEXT NOT NULL,
  employee_id TEXT REFERENCES employees(id),
  external_employee_id TEXT NOT NULL,
  punched_at TIMESTAMPTZ NOT NULL,
  local_work_date DATE NOT NULL,
  event_type TEXT NOT NULL DEFAULT 'punch',
  source_hash TEXT NOT NULL DEFAULT '',
  raw_payload_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  import_batch_id TEXT REFERENCES attendance_import_batches(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(provider, external_punch_id)
);

CREATE INDEX IF NOT EXISTS idx_attendance_punches_employee_date
  ON attendance_punches(employee_id, local_work_date, punched_at);
CREATE INDEX IF NOT EXISTS idx_attendance_punches_external_identity
  ON attendance_punches(provider, external_employee_id, punched_at);

CREATE TABLE IF NOT EXISTS attendance_day_reviews (
  id TEXT PRIMARY KEY,
  employee_id TEXT NOT NULL REFERENCES employees(id),
  work_date DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  explanation TEXT NOT NULL DEFAULT '',
  adjusted_work_minutes INTEGER,
  evidence_attachment_ids_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  reviewed_by TEXT REFERENCES users(id),
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(employee_id, work_date)
);

CREATE TABLE IF NOT EXISTS payroll_policy_versions (
  id TEXT PRIMARY KEY,
  version_label TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  effective_from DATE NOT NULL,
  effective_to DATE,
  policy_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  integrity_digest TEXT NOT NULL DEFAULT '',
  created_by TEXT REFERENCES users(id),
  reviewed_by TEXT REFERENCES users(id),
  reviewed_at TIMESTAMPTZ,
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_payroll_policy_published_effective_from
  ON payroll_policy_versions(effective_from)
  WHERE status = 'published';

CREATE TABLE IF NOT EXISTS payroll_runs (
  id TEXT PRIMARY KEY,
  payroll_month TEXT NOT NULL,
  policy_version_id TEXT REFERENCES payroll_policy_versions(id),
  status TEXT NOT NULL DEFAULT 'draft',
  revision INTEGER NOT NULL DEFAULT 1,
  generated_by TEXT REFERENCES users(id),
  generated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  reviewed_by TEXT REFERENCES users(id),
  reviewed_at TIMESTAMPTZ,
  locked_by TEXT REFERENCES users(id),
  locked_at TIMESTAMPTZ,
  paid_by TEXT REFERENCES users(id),
  paid_at TIMESTAMPTZ,
  payment_reference TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(payroll_month, revision)
);

CREATE TABLE IF NOT EXISTS payroll_lines (
  id TEXT PRIMARY KEY,
  payroll_run_id TEXT NOT NULL REFERENCES payroll_runs(id) ON DELETE CASCADE,
  employee_id TEXT NOT NULL REFERENCES employees(id),
  attendance_work_minutes INTEGER NOT NULL DEFAULT 0,
  base_wage NUMERIC(14, 2) NOT NULL DEFAULT 0,
  position_allowance NUMERIC(14, 2) NOT NULL DEFAULT 0,
  seniority_award NUMERIC(14, 2) NOT NULL DEFAULT 0,
  performance_award NUMERIC(14, 2) NOT NULL DEFAULT 0,
  overtime_wage NUMERIC(14, 2) NOT NULL DEFAULT 0,
  leave_deduction NUMERIC(14, 2) NOT NULL DEFAULT 0,
  other_deduction NUMERIC(14, 2) NOT NULL DEFAULT 0,
  gross_wage NUMERIC(14, 2) NOT NULL DEFAULT 0,
  net_wage NUMERIC(14, 2) NOT NULL DEFAULT 0,
  calculation_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(payroll_run_id, employee_id)
);

CREATE INDEX IF NOT EXISTS idx_payroll_runs_month_status
  ON payroll_runs(payroll_month, status, revision DESC);
CREATE INDEX IF NOT EXISTS idx_payroll_lines_employee
  ON payroll_lines(employee_id, payroll_run_id);
