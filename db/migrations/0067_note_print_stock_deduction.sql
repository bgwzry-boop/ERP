-- 负责人 2026-11-08：送货单 / 自提单打印出来（办公室确认已打印）就扣成品库存，库房拿单装包送货不再扣第二次。
-- 线上库存不够时，出库工看过实物确认有货才能打；没扣上的写在说明里，提醒盘点修正。
ALTER TABLE fulfillment_records ADD COLUMN IF NOT EXISTS stock_deducted_at TIMESTAMPTZ;
ALTER TABLE fulfillment_records ADD COLUMN IF NOT EXISTS stock_deduction_note TEXT NOT NULL DEFAULT '';
