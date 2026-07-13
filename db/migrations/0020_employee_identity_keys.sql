-- Formal employee numbers are stable account and audit identities.
-- Keep the stored spelling, but prevent case-only duplicates and unsafe login-derived identifiers.

ALTER TABLE employees
  ADD CONSTRAINT employees_id_format_check
  CHECK (id ~ '^[A-Za-z0-9][A-Za-z0-9_-]{0,31}$') NOT VALID;

ALTER TABLE employees VALIDATE CONSTRAINT employees_id_format_check;

CREATE UNIQUE INDEX IF NOT EXISTS ux_employees_id_case_insensitive
  ON employees (lower(id));
