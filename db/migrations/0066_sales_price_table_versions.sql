-- 负责人 2026-11-08 / 2026-11-12：销售价格以 ERP 为准，在「销售价格」页改价，开单自动套价。
-- 每次改价存成价格表的一个新版本（price_tables 一行），旧版本停用但保留，已下的订单按下单时的价格快照不变。
-- 补上：改价规则（加长提手按长度加价、礼品袋满量优惠、加扣子）、改价说明，以及每行的品名、分类、排序。
ALTER TABLE price_tables ADD COLUMN IF NOT EXISTS rules_json JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE price_tables ADD COLUMN IF NOT EXISTS change_summary TEXT NOT NULL DEFAULT '';
ALTER TABLE price_table_items ADD COLUMN IF NOT EXISTS label TEXT NOT NULL DEFAULT '';
ALTER TABLE price_table_items ADD COLUMN IF NOT EXISTS category TEXT NOT NULL DEFAULT '';
ALTER TABLE price_table_items ADD COLUMN IF NOT EXISTS sort_order INTEGER NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS idx_price_tables_status_version ON price_tables (status, version_no DESC);
CREATE INDEX IF NOT EXISTS idx_price_table_items_table ON price_table_items (price_table_id, sort_order);
