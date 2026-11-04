-- P2-04 换模工单（负责人 2026-11-04）：办公室或管理看订单安排换模（哪台机、什么时候、换成什么），
-- 技工收到工单，换好后拍最终试做的袋子上传就算完成。沿用设备任务：新增任务类型「换模」和
-- 两个状态「待换模 / 换模中」；「换成什么」记在 fault_category，换模时间记在 due_at。
DO $$
DECLARE constraint_row RECORD;
BEGIN
  FOR constraint_row IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'maintenance_tasks'::regclass AND contype = 'c'
      AND (pg_get_constraintdef(oid) LIKE '%task_type%' OR pg_get_constraintdef(oid) LIKE '%status%')
  LOOP
    EXECUTE format('ALTER TABLE maintenance_tasks DROP CONSTRAINT %I', constraint_row.conname);
  END LOOP;
END $$;

ALTER TABLE maintenance_tasks
  ADD CONSTRAINT maintenance_tasks_task_type_check
    CHECK (task_type IN ('设备报修', '日常巡检', '预防维护', '换模')),
  ADD CONSTRAINT maintenance_tasks_status_check
    CHECK (status IN ('待检查', '待处理', '待维护', '处理中', '已恢复', '等待配件', '需要停机', '转办公室协调', '已完成', '待换模', '换模中')),
  ADD CONSTRAINT maintenance_tasks_mold_change_status_check
    CHECK (task_type <> '换模' OR status IN ('待换模', '换模中', '已完成'));

-- A mold change happens at a time (12:00 / 18:30 breaks, or any time) or "after order X is done" on
-- that machine. The office sees when the technician started and finished.
ALTER TABLE maintenance_tasks
  ADD COLUMN IF NOT EXISTS after_production_task_id TEXT,
  ADD COLUMN IF NOT EXISTS after_production_task_label TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ;

ALTER TABLE maintenance_tasks
  ADD CONSTRAINT maintenance_tasks_mold_change_when_check
    CHECK (task_type <> '换模' OR due_at IS NOT NULL OR after_production_task_id IS NOT NULL);
