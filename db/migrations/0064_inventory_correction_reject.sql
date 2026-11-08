-- 2026-11-07：盘点差异需要"驳回"这条留痕路径。
-- 负责人口径：登记差异不改库存；审核通过才修正库存；驳回同样不动库存，但要留人和时间。
ALTER TABLE inventory_correction_drafts
  ADD COLUMN IF NOT EXISTS rejected_by TEXT REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS rejected_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reject_reason TEXT;
