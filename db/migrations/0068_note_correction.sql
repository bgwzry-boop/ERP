-- 负责人 2026-11-12「作废重打」：送货单 / 自提单打出来以后（含已拉走、已入对账单）发现有错，作废重打。
-- 对账单已经发给客户的，改单后记下改单时间，页面提示「改单后要重新发给客户」，直到再次发送。
ALTER TABLE statements ADD COLUMN IF NOT EXISTS corrected_after_send_at TIMESTAMPTZ;
