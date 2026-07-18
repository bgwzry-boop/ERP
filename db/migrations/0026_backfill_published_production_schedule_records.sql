-- Ensure every already-published production task has a durable queue record.
-- Queue reads and optimistic concurrency must reference the same persisted revision.

INSERT INTO production_schedule_records (
  id,
  biz_no,
  production_task_id,
  order_line_id,
  published_schedule_id,
  machine_id,
  queue_seq,
  schedule_status,
  source_kind,
  revision,
  sequence_updated_at,
  sequence_updated_by,
  remark,
  created_by,
  created_at,
  updated_at
)
SELECT
  'SQR-BACKFILL-' || upper(substr(md5(task.machine_id || ':' || task.id), 1, 20)),
  'SQR-BACKFILL-' || upper(substr(md5(task.machine_id || ':' || task.id), 1, 20)),
  task.id,
  task.order_line_id,
  task.published_schedule_id,
  task.machine_id,
  0,
  'active',
  'schedule_publish_backfill',
  1,
  COALESCE(task.updated_at, task.created_at, now()),
  task.created_by,
  '已发布排产记录补齐',
  task.created_by,
  COALESCE(task.created_at, now()),
  COALESCE(task.updated_at, task.created_at, now())
FROM production_tasks AS task
WHERE NULLIF(task.published_schedule_id, '') IS NOT NULL
  AND NULLIF(task.machine_id, '') IS NOT NULL
ON CONFLICT (machine_id, production_task_id) DO NOTHING;
