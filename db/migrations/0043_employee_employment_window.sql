-- Persist the employment end boundary used by historical attendance and payroll.
-- A departed employee must remain eligible for the final payroll month while
-- future hires must not block an earlier closed month.

ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS departed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS departed_by TEXT,
  ADD COLUMN IF NOT EXISTS departure_reason TEXT NOT NULL DEFAULT '';

WITH latest_departures AS (
  SELECT DISTINCT ON (target_id)
    target_id,
    occurred_at,
    operator_id,
    COALESCE(reason, '') AS reason
  FROM operation_logs
  WHERE target_type = 'master_data_employee_departure'
    AND action = 'master_data_employee_departed'
  ORDER BY target_id, occurred_at DESC, id DESC
)
UPDATE employees
SET
  departed_at = COALESCE(employees.departed_at, latest_departures.occurred_at, employees.updated_at, now()),
  departed_by = COALESCE(employees.departed_by, latest_departures.operator_id),
  departure_reason = CASE
    WHEN btrim(employees.departure_reason) <> '' THEN employees.departure_reason
    WHEN btrim(latest_departures.reason) <> '' THEN latest_departures.reason
    ELSE COALESCE(employees.remark, '')
  END
FROM latest_departures
WHERE employees.id = latest_departures.target_id
  AND lower(employees.profile_status) IN ('departed', 'left', 'retired', 'inactive_employee');

UPDATE employees
SET
  departed_at = COALESCE(departed_at, updated_at, now()),
  departure_reason = CASE
    WHEN btrim(departure_reason) <> '' THEN departure_reason
    ELSE COALESCE(remark, '')
  END
WHERE lower(profile_status) IN ('departed', 'left', 'retired', 'inactive_employee')
  AND departed_at IS NULL;

ALTER TABLE employees
  DROP CONSTRAINT IF EXISTS employees_departure_boundary_required,
  ADD CONSTRAINT employees_departure_boundary_required CHECK (
    lower(profile_status) NOT IN ('departed', 'left', 'retired', 'inactive_employee')
    OR departed_at IS NOT NULL
  );

CREATE INDEX IF NOT EXISTS idx_employees_employment_window
  ON employees(hire_date, departed_at)
  WHERE profile_status <> 'merged_duplicate';
