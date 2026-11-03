-- Owner decision 2026-11-03: workers confirm their online payslip on the phone,
-- replacing the 工资确认签名 column of the paper wage book.
CREATE TABLE IF NOT EXISTS payroll_payslip_acknowledgements (
  id TEXT PRIMARY KEY,
  payroll_line_id TEXT NOT NULL UNIQUE REFERENCES payroll_lines(id),
  payroll_run_id TEXT NOT NULL REFERENCES payroll_runs(id),
  employee_id TEXT NOT NULL REFERENCES employees(id),
  payroll_month TEXT NOT NULL,
  revision INTEGER NOT NULL,
  net_wage NUMERIC(14, 2) NOT NULL,
  payable_now NUMERIC(14, 2) NOT NULL,
  acknowledged_by TEXT REFERENCES users(id),
  acknowledged_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT payslip_ack_month_check CHECK (payroll_month ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  CONSTRAINT payslip_ack_revision_check CHECK (revision >= 1)
);
CREATE INDEX IF NOT EXISTS idx_payslip_ack_employee ON payroll_payslip_acknowledgements(employee_id, payroll_month);
