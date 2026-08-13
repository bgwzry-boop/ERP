-- Separate the immutable account-departure audit timestamp from the employee's
-- actual final work date used by attendance and payroll.

ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS departure_effective_date DATE;

UPDATE employees
SET departure_effective_date = (departed_at AT TIME ZONE 'Asia/Shanghai')::DATE
WHERE lower(profile_status) IN ('departed', 'left', 'retired', 'inactive_employee')
  AND departure_effective_date IS NULL
  AND departed_at IS NOT NULL;

ALTER TABLE employees
  DROP CONSTRAINT IF EXISTS employees_departure_effective_date_required,
  ADD CONSTRAINT employees_departure_effective_date_required CHECK (
    lower(profile_status) NOT IN ('departed', 'left', 'retired', 'inactive_employee')
    OR departure_effective_date IS NOT NULL
  ),
  DROP CONSTRAINT IF EXISTS employees_departure_effective_date_after_hire,
  ADD CONSTRAINT employees_departure_effective_date_after_hire CHECK (
    departure_effective_date IS NULL
    OR hire_date IS NULL
    OR departure_effective_date >= hire_date
  );

CREATE INDEX IF NOT EXISTS idx_employees_payroll_employment_window
  ON employees(hire_date, departure_effective_date)
  WHERE profile_status <> 'merged_duplicate';
