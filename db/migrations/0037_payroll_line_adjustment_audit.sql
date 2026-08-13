-- Immutable audit trail for accountant-entered payroll adjustments.
-- Payroll line values remain the current snapshot; every change keeps its before/after values and reason.

CREATE TABLE IF NOT EXISTS payroll_line_adjustments (
  id TEXT PRIMARY KEY,
  payroll_line_id TEXT NOT NULL REFERENCES payroll_lines(id) ON DELETE CASCADE,
  payroll_run_id TEXT NOT NULL REFERENCES payroll_runs(id) ON DELETE CASCADE,
  employee_id TEXT NOT NULL REFERENCES employees(id),
  performance_award NUMERIC(14, 2) NOT NULL DEFAULT 0,
  leave_deduction NUMERIC(14, 2) NOT NULL DEFAULT 0,
  other_deduction NUMERIC(14, 2) NOT NULL DEFAULT 0,
  reason TEXT NOT NULL,
  previous_values_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  new_values_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  changed_by TEXT REFERENCES users(id),
  changed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_payroll_line_adjustments_line_time
  ON payroll_line_adjustments(payroll_line_id, changed_at DESC);

CREATE INDEX IF NOT EXISTS idx_payroll_line_adjustments_employee_time
  ON payroll_line_adjustments(employee_id, changed_at DESC);
