-- P2-02 (owner 2026-11-04): silk-screen printers pick their own tasks, because they sequence by ink
-- colour (white first, black and multi-colour at the end). A claimed task shows who took it and
-- goes onto the printer's machine; the printer or the office can release it while it is not started.
ALTER TABLE production_tasks
  ADD COLUMN IF NOT EXISTS claimed_by_user_id TEXT REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS claimed_by_name TEXT,
  ADD COLUMN IF NOT EXISTS claimed_at TIMESTAMPTZ;

ALTER TABLE production_tasks
  ADD CONSTRAINT production_tasks_claim_check CHECK (
    (claimed_by_user_id IS NULL AND claimed_at IS NULL)
    OR (claimed_by_user_id IS NOT NULL AND claimed_at IS NOT NULL AND task_type = '丝印')
  );

CREATE INDEX IF NOT EXISTS idx_production_tasks_silk_screen_pool
  ON production_tasks (task_type, task_status) WHERE task_type = '丝印';
