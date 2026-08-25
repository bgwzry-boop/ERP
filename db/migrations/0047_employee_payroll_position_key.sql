-- Employees reference one stable payroll position. Rates remain versioned in
-- payroll_policy_versions.policy_json and are snapshotted into payroll lines.
-- Legacy per-employee wage columns stay readable during migration only.

ALTER TABLE employees
  ADD COLUMN payroll_position_key TEXT NOT NULL DEFAULT '';

ALTER TABLE employees
  ADD CONSTRAINT employees_payroll_position_key_format_check CHECK (
    payroll_position_key = ''
    OR payroll_position_key ~ '^[A-Z0-9][A-Z0-9_-]{0,63}$'
  );

CREATE INDEX idx_employees_payroll_position_key
  ON employees(payroll_position_key)
  WHERE payroll_position_key <> '';

COMMENT ON COLUMN employees.payroll_position_key IS
  'Stable payroll-position key; rate and hourly/daily mode are resolved from the effective versioned payroll policy.';
