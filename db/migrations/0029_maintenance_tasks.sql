BEGIN;

CREATE TABLE IF NOT EXISTS maintenance_tasks (
  id TEXT PRIMARY KEY,
  biz_no TEXT NOT NULL UNIQUE,
  machine_id TEXT NOT NULL,
  machine_name_snapshot TEXT NOT NULL,
  task_type TEXT NOT NULL,
  fault_category TEXT NOT NULL,
  priority TEXT NOT NULL DEFAULT '普通',
  status TEXT NOT NULL,
  summary TEXT NOT NULL,
  due_at TIMESTAMPTZ,
  finding TEXT NOT NULL DEFAULT '',
  action_taken TEXT NOT NULL DEFAULT '',
  photo_attachment_ids_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  assigned_technician_employee_id TEXT,
  actual_technician_employee_id TEXT,
  completed_at TIMESTAMPTZ,
  created_by TEXT REFERENCES users(id),
  updated_by TEXT REFERENCES users(id),
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (task_type IN ('设备报修', '日常巡检', '预防维护')),
  CHECK (priority IN ('普通', '今天', '本周', '异常')),
  CHECK (status IN ('待检查', '待处理', '待维护', '处理中', '已恢复', '等待配件', '需要停机', '转办公室协调', '已完成')),
  CHECK (jsonb_typeof(photo_attachment_ids_json) = 'array')
);

CREATE INDEX IF NOT EXISTS idx_maintenance_tasks_open
  ON maintenance_tasks (status, priority, due_at, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_maintenance_tasks_machine
  ON maintenance_tasks (machine_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_maintenance_tasks_technician
  ON maintenance_tasks (assigned_technician_employee_id, status, updated_at DESC);

COMMIT;
