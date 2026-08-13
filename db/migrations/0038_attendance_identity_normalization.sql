-- Attendance provider keys are canonical lower-case identifiers. The external person id
-- remains provider-owned and case-preserving, but one provider/id pair can bind only once.

UPDATE employees
SET attendance_provider = lower(trim(attendance_provider))
WHERE attendance_provider <> lower(trim(attendance_provider));

CREATE UNIQUE INDEX IF NOT EXISTS uq_employees_attendance_identity_normalized
  ON employees(lower(attendance_provider), attendance_external_id)
  WHERE attendance_provider <> '' AND attendance_external_id <> '';
