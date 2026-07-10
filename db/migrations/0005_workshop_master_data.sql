-- V1 core migration draft: employees, machines, assignments, and machine capacity baselines.
-- Employee accounts are not auto-enabled by import; administrators must review roles and permissions first.

CREATE TABLE IF NOT EXISTS employees (
  id TEXT PRIMARY KEY,
  biz_no TEXT NOT NULL UNIQUE,
  user_id TEXT REFERENCES users(id),
  name TEXT NOT NULL,
  role_name TEXT NOT NULL DEFAULT '',
  default_workshop TEXT NOT NULL DEFAULT '',
  default_machine_id TEXT,
  base_hourly_wage NUMERIC(14, 4) NOT NULL DEFAULT 0,
  position_allowance_hourly NUMERIC(14, 4) NOT NULL DEFAULT 0,
  wage_effective_from DATE,
  account_enabled BOOLEAN NOT NULL DEFAULT false,
  profile_status TEXT NOT NULL DEFAULT 'pending_admin_review',
  requested_enabled BOOLEAN NOT NULL DEFAULT false,
  remark TEXT NOT NULL DEFAULT '',
  created_by TEXT REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS machines (
  id TEXT PRIMARY KEY,
  biz_no TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  machine_type TEXT NOT NULL DEFAULT 'bag_making',
  workshop TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'active',
  enabled BOOLEAN NOT NULL DEFAULT true,
  settings_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by TEXT REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS employee_machine_assignments (
  id TEXT PRIMARY KEY,
  employee_id TEXT NOT NULL REFERENCES employees(id),
  machine_id TEXT NOT NULL REFERENCES machines(id),
  assignment_type TEXT NOT NULL DEFAULT 'default',
  workshop TEXT NOT NULL DEFAULT '',
  effective_from DATE,
  effective_to DATE,
  enabled BOOLEAN NOT NULL DEFAULT true,
  created_by TEXT REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(employee_id, machine_id, assignment_type, effective_from)
);

CREATE TABLE IF NOT EXISTS machine_capacity_baselines (
  id TEXT PRIMARY KEY,
  machine_id TEXT NOT NULL REFERENCES machines(id),
  size_key TEXT NOT NULL,
  daily_capacity_qty INTEGER NOT NULL DEFAULT 0,
  hourly_capacity_qty INTEGER,
  source_kind TEXT NOT NULL DEFAULT 'manual_estimate',
  confidence TEXT NOT NULL DEFAULT 'low',
  effective_from DATE,
  remark TEXT NOT NULL DEFAULT '',
  created_by TEXT REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(machine_id, size_key, source_kind, effective_from)
);

CREATE INDEX IF NOT EXISTS idx_employees_name ON employees(name);
CREATE INDEX IF NOT EXISTS idx_employees_user ON employees(user_id);
CREATE INDEX IF NOT EXISTS idx_employees_profile_status ON employees(profile_status);
CREATE INDEX IF NOT EXISTS idx_machines_workshop ON machines(workshop);
CREATE INDEX IF NOT EXISTS idx_employee_machine_assignments_employee ON employee_machine_assignments(employee_id);
CREATE INDEX IF NOT EXISTS idx_employee_machine_assignments_machine ON employee_machine_assignments(machine_id);
CREATE INDEX IF NOT EXISTS idx_machine_capacity_machine_size ON machine_capacity_baselines(machine_id, size_key);
