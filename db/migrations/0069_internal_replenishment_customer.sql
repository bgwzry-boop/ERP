-- 负责人 2026-11-08：通货先下「补库订单」让车间做，做好入本厂成品库存，客户要货再按需出库。
-- 补库单记在内部客户「本厂补库」名下：不发货、不对外收费、不进对账单。
INSERT INTO customers (id, biz_no, name, short_name, settlement_cycle, risk_status, enabled)
VALUES ('C-INTERNAL-STOCK', 'C-INTERNAL-STOCK', '本厂补库', '补库', '不结算', '正常', true)
ON CONFLICT (id) DO NOTHING;
