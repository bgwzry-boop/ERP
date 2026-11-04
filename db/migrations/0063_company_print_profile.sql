-- P2-07 出库单打印样式（负责人 2026-11-04）：送货单/自提单抬头的公司名、联系人、电话、工厂地址和底部说明，
-- 由办公室在「打印与设备 → 单据抬头」里自己改。沿用已有的 print_templates 表存这一条设置，
-- 只补上并发修改要用的 revision 和修改人。
ALTER TABLE print_templates ADD COLUMN IF NOT EXISTS revision INTEGER NOT NULL DEFAULT 1;
ALTER TABLE print_templates ADD COLUMN IF NOT EXISTS updated_by TEXT REFERENCES users(id);

INSERT INTO print_templates (id, template_key, template_type, name, status, template_payload)
VALUES (
  'tpl-company-print-profile',
  'company.print-profile',
  'company_profile',
  '单据抬头',
  'active',
  jsonb_build_object(
    'companyName', '河北禄兴包装制品有限公司',
    'contactName', '',
    'address', '河北邢台宁晋河渠镇大召村',
    'phone', '17367893639',
    'footerNote', '以上货品请核对数量，如有质量问题，请在三个工作日内通知本公司，逾期恕不负责。'
  )
)
ON CONFLICT (id) DO NOTHING;
