export const postgresLiveBusinessSeedSql = `
INSERT INTO users (id, login_name, display_name, department)
VALUES
  ('U-OFFICE-A', 'office.a', '办公室A', 'office'),
  ('U-FINANCE-A', 'finance.a', '财务A', 'finance'),
  ('U-WAREHOUSE-A', 'warehouse.a', '仓库A', 'warehouse'),
  ('U-MANAGER-A', 'manager.a', '管理A', 'management'),
  ('U-WORKSHOP-A', 'workshop.a', '车间A', 'workshop'),
  ('U-DRIVER-A', 'driver.a', '司机A', 'driver'),
  ('U-PRINT-DRIVER-A', 'print.driver.a', '打印驱动服务账号A', 'system')
ON CONFLICT (id) DO UPDATE SET
  login_name = EXCLUDED.login_name,
  display_name = EXCLUDED.display_name,
  department = EXCLUDED.department,
  updated_at = now();

INSERT INTO employees (id, biz_no, name, role_name)
VALUES ('EMP-LIVE-MANAGER-001', '031', '负责人', '管理')
ON CONFLICT (id) DO UPDATE SET
  biz_no = EXCLUDED.biz_no,
  name = EXCLUDED.name,
  role_name = EXCLUDED.role_name,
  updated_at = now();

INSERT INTO business_decision_authorizations (
  id, employee_id, decision_scope, max_amount, active_from, status,
  authorization_note, revision
)
VALUES
  ('AUTH-STMT-VARIANCE-LIVE', 'EMP-LIVE-MANAGER-001', 'statement_variance', 50000, '2026-01-01T00:00:00.000Z', 'active', 'PostgreSQL live statement variance fixture', 1),
  ('AUTH-STMT-WRITEOFF-LIVE', 'EMP-LIVE-MANAGER-001', 'statement_write_off', 50000, '2026-01-01T00:00:00.000Z', 'active', 'PostgreSQL live statement write-off fixture', 1),
  ('AUTH-SCHEDULE-LIVE', 'EMP-LIVE-MANAGER-001', 'production_schedule', NULL, '2026-01-01T00:00:00.000Z', 'active', 'PostgreSQL live production schedule fixture', 1)
ON CONFLICT (id) DO UPDATE SET
  employee_id = EXCLUDED.employee_id,
  decision_scope = EXCLUDED.decision_scope,
  max_amount = EXCLUDED.max_amount,
  active_from = EXCLUDED.active_from,
  status = EXCLUDED.status,
  authorization_note = EXCLUDED.authorization_note,
  revision = EXCLUDED.revision,
  updated_at = now();

INSERT INTO machines (id, biz_no, name, machine_type, workshop, status, enabled, created_by)
VALUES
  ('BAG-03', 'BAG-03', 'API live 制袋机', 'bag_making', '1号车间', 'active', true, 'U-OFFICE-A'),
  ('BAG-LIVE-WORKSHOP-02', 'BAG-LIVE-WORKSHOP-02', 'PostgreSQL live 二号车间制袋机', 'bag_making', '2号车间', 'active', true, 'U-OFFICE-A')
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  machine_type = EXCLUDED.machine_type,
  workshop = EXCLUDED.workshop,
  status = EXCLUDED.status,
  enabled = EXCLUDED.enabled,
  updated_at = now();

INSERT INTO print_templates (id, template_key, template_type, name, created_by)
VALUES
  ('tpl-p0-fulfillment', 'p0.fulfillment', 'fulfillment', 'P0 出库交付单据', 'U-OFFICE-A'),
  ('tpl-p0-pickup-note', 'p0.pickup-note', 'pickup_note', 'P0 自提出库单', 'U-OFFICE-A'),
  ('tpl-p0-delivery-note', 'p0.delivery-note', 'delivery_note', 'P0 送货单', 'U-OFFICE-A'),
  ('tpl-p0-express-label', 'p0.express-label', 'fulfillment_label', 'P0 快运标签', 'U-OFFICE-A'),
  ('tpl-p0-express-ltl-label', 'p0.express-ltl-label', 'fulfillment_label', 'P0 快递快运包裹标签', 'U-OFFICE-A')
ON CONFLICT (id) DO UPDATE SET
  template_key = EXCLUDED.template_key,
  template_type = EXCLUDED.template_type,
  name = EXCLUDED.name,
  updated_at = now();

INSERT INTO customers (id, biz_no, name, short_name, settlement_cycle, created_by)
VALUES
  ('C001', 'CUST-LIVE-001', '张三服饰', '张三服饰', '7天一结', 'U-OFFICE-A'),
  ('C002', 'CUST-LIVE-002', '李四电商', '李四电商', '15天一结', 'U-OFFICE-A'),
  ('C004', 'CUST-LIVE-004', '美的空调网店', '美的空调', '月结', 'U-OFFICE-A'),
  ('C010', 'CUST-LIVE-010', '月结客户', '月结客户', '月结', 'U-OFFICE-A'),
  ('C-LIVE-REPO', 'CUST-LIVE-REPO', 'Postgres 仓储测试客户', 'PG仓储', '7天一结', 'U-OFFICE-A')
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  short_name = EXCLUDED.short_name,
  settlement_cycle = EXCLUDED.settlement_cycle,
  updated_at = now();

INSERT INTO standard_colors (id, color_key, name)
VALUES
  ('SC-RED', 'red', '红色'),
  ('SC-WHITE', 'white', '白色')
ON CONFLICT (id) DO UPDATE SET
  color_key = EXCLUDED.color_key,
  name = EXCLUDED.name,
  updated_at = now();

INSERT INTO inventory_items (
  id,
  inventory_key,
  size,
  standard_color_id,
  handle_type,
  style,
  zone,
  inventory_state,
  on_hand_qty,
  reserved_qty,
  waiting_pickup_locked_qty,
  pending_handling_qty,
  trust_level
) VALUES
  ('30*38*10-红色-普通提-空白袋-A区-30*38', '30*38*10|红色|普通提|空白袋|A区-30*38|仓库已清点', '30*38*10', 'SC-RED', '普通提', '空白袋', 'A区-30*38', '仓库已清点', 2480, 1320, 120, 0, '已清点'),
  ('30*38*10-白色-普通提-空白袋-待快运区', '30*38*10|白色|普通提|空白袋|待快运区|待提货锁定', '30*38*10', 'SC-WHITE', '普通提', '空白袋', '待快运区', '待提货锁定', 1005, 0, 1005, 0, '已清点'),
  ('25*32*10-白色-加长提-空白袋-B区-服装', '25*32*10|白色|加长提|空白袋|B区-服装|仓库已清点', '25*32*10', 'SC-WHITE', '加长提', '空白袋', 'B区-服装', '仓库已清点', 2100, 1200, 0, 0, '已清点'),
  ('INV-LIVE-CONFIRM-001', 'live-confirm|红色|普通提|空白袋|A区', '30*38*10', 'SC-RED', '普通提', '空白袋', 'A区', '仓库已清点', 1000, 10, 0, 0, '已清点'),
  ('INV-LIVE-PROD-001', 'live-production|白色|普通提|空白袋|生产完成区', '30*38*10', 'SC-WHITE', '普通提', '空白袋', '生产完成区', '仓库已清点', 20, 0, 0, 0, '已清点'),
  ('INV-LIVE-CORRECTION-001', 'live-correction|白色|普通提|空白袋|盘点区', '30*38*10', 'SC-WHITE', '普通提', '空白袋', '盘点区', '仓库已清点', 600, 25, 5, 0, '已清点')
ON CONFLICT (id) DO UPDATE SET
  inventory_key = EXCLUDED.inventory_key,
  size = EXCLUDED.size,
  standard_color_id = EXCLUDED.standard_color_id,
  handle_type = EXCLUDED.handle_type,
  style = EXCLUDED.style,
  zone = EXCLUDED.zone,
  inventory_state = EXCLUDED.inventory_state,
  on_hand_qty = EXCLUDED.on_hand_qty,
  reserved_qty = EXCLUDED.reserved_qty,
  waiting_pickup_locked_qty = EXCLUDED.waiting_pickup_locked_qty,
  pending_handling_qty = EXCLUDED.pending_handling_qty,
  trust_level = EXCLUDED.trust_level,
  updated_at = now();

INSERT INTO order_drafts (
  id, biz_no, source_text, source_channel, customer_id, status, recognition_summary, revision, created_by
) VALUES
  ('DRAFT-LIVE-CONFIRM-001', 'DRAFT-LIVE-CONFIRM-001', 'Postgres live order confirmation', 'manual', 'C-LIVE-REPO', '待审核', '{"customerName":"Postgres 仓储测试客户"}'::jsonb, 1, 'U-FINANCE-A'),
  ('DRAFT-LIVE-CANCEL-001', 'DRAFT-LIVE-CANCEL-001', 'Postgres live partial shortage cancellation', 'wechat_group', 'C-LIVE-REPO', '待审核', '{"customerName":"Postgres 仓储测试客户"}'::jsonb, 1, 'U-FINANCE-A'),
  ('DRAFT-LIVE-SPLIT-001', 'DRAFT-LIVE-SPLIT-001', 'Postgres live atomic split confirmation', 'wechat_group', 'C-LIVE-REPO', '待审核', '{"customerName":"Postgres 仓储测试客户"}'::jsonb, 1, 'U-FINANCE-A'),
  ('DRAFT-LIVE-QTY-001', 'DRAFT-LIVE-QTY-001', 'Postgres live quantity order confirmation', 'manual', 'C-LIVE-REPO', '待审核', '{"customerName":"Postgres 仓储测试客户"}'::jsonb, 1, 'U-FINANCE-A')
ON CONFLICT (id) DO UPDATE SET
  source_text = EXCLUDED.source_text,
  customer_id = EXCLUDED.customer_id,
  status = EXCLUDED.status,
  recognition_summary = EXCLUDED.recognition_summary,
  revision = EXCLUDED.revision,
  updated_at = now();

INSERT INTO inventory_intents (
  id, source_draft_id, source_message_id, conversation_id, customer_id,
  intent_type, intent_status, source_text, candidate_json, cancellation_scope,
  revision, created_by
) VALUES (
  'INT-LIVE-CANCEL-001', 'DRAFT-LIVE-CANCEL-001', 'MSG-LIVE-CANCEL-001',
  'GROUP-LIVE-CANCEL-001', 'C-LIVE-REPO', 'shortage_cancellation',
  '库存不足取消-已关联草稿明细', '白色缺货不要了，红色继续',
  '{"relatedDraftLineIds":["DRAFT-LIVE-CANCEL-001-02"],"targetBasis":"explicit_spec"}'::jsonb,
  'shortage_lines_only', 1, 'U-FINANCE-A'
)
ON CONFLICT (id) DO UPDATE SET
  intent_status = EXCLUDED.intent_status,
  candidate_json = EXCLUDED.candidate_json,
  revision = EXCLUDED.revision,
  updated_at = now();

INSERT INTO original_orders (id, biz_no, customer_id, customer_snapshot, summary_status, created_by)
VALUES
  ('ORD-0629-001', 'ORD-0629-001', 'C001', '{"name":"张三服饰"}'::jsonb, '待出库', 'U-OFFICE-A'),
  ('ORD-0629-002', 'ORD-0629-002', 'C002', '{"name":"李四电商"}'::jsonb, '已备货', 'U-OFFICE-A'),
  ('ORD-0629-003', 'ORD-0629-003', 'C004', '{"name":"美的空调网店"}'::jsonb, '生产中', 'U-OFFICE-A'),
  ('ORD-0629-009', 'ORD-0629-009', 'C010', '{"name":"月结客户"}'::jsonb, '待送货', 'U-OFFICE-A'),
  ('ORD-0629-015', 'ORD-0629-015', 'C001', '{"name":"张三服饰"}'::jsonb, '待对账', 'U-OFFICE-A'),
  ('ORD-0629-022', 'ORD-0629-022', 'C002', '{"name":"李四电商"}'::jsonb, '丝印中', 'U-OFFICE-A'),
  ('ORD-LIVE-PROD-001', 'ORD-LIVE-PROD-001', 'C-LIVE-REPO', '{"name":"Postgres 仓储测试客户"}'::jsonb, '生产中', 'U-OFFICE-A'),
  ('ORD-LIVE-REPO-001', 'ORD-LIVE-REPO-001', 'C-LIVE-REPO', '{"name":"Postgres 仓储测试客户"}'::jsonb, '待对账', 'U-OFFICE-A')
ON CONFLICT (id) DO UPDATE SET
  customer_id = EXCLUDED.customer_id,
  customer_snapshot = EXCLUDED.customer_snapshot,
  summary_status = EXCLUDED.summary_status,
  updated_at = now();

INSERT INTO order_lines (
  id,
  biz_no,
  order_id,
  customer_id,
  product_name,
  order_type,
  size,
  bag_color,
  handle_type,
  style,
  original_qty,
  fulfillment_method,
  line_status,
  created_by
) VALUES
  ('ORD-0629-001-01', 'ORD-0629-001-01', 'ORD-0629-001', 'C001', '空白袋', '现货有货', '30*38*10', '红色', '普通提', '空白袋', 500, '自提', '待出库', 'U-OFFICE-A'),
  ('ORD-0629-002-01', 'ORD-0629-002-01', 'ORD-0629-002', 'C002', '服装店白袋', '现货有货', '25*32*10', '白色', '加长提', '空白袋', 1200, '送货', '已备货', 'U-OFFICE-A'),
  ('ORD-0629-003-01', 'ORD-0629-003-01', 'ORD-0629-003', 'C004', '美的空调', '定制印刷', '30*38*10', '白色', '普通提', '空白袋', 1000, '快递快运', '制袋中', 'U-OFFICE-A'),
  ('ORD-0629-009-01', 'ORD-0629-009-01', 'ORD-0629-009', 'C010', '月结客户活动袋', '定制印刷', '35*41', '白色', '普通提', '空白袋', 2000, '送货', '待送货', 'U-OFFICE-A'),
  ('ORD-0629-015-01', 'ORD-0629-015-01', 'ORD-0629-015', 'C001', '空白袋', '现货有货', '25*32*10', '红色', '普通提', '空白袋', 300, '自提', '待对账', 'U-OFFICE-A'),
  ('ORD-0629-022-01', 'ORD-0629-022-01', 'ORD-0629-022', 'C002', '外卖活动袋', '定制印刷', '40*30*10', '黄色', '普通提', '空白袋', 3000, '送货', '丝印中', 'U-OFFICE-A'),
  ('OL-LIVE-PROD-001', 'OL-LIVE-PROD-001', 'ORD-LIVE-PROD-001', 'C-LIVE-REPO', 'Postgres 生产报工', '定制印刷', '30*38*10', '白色', '普通提', '空白袋', 80, '快递快运', '制袋中', 'U-OFFICE-A'),
  ('OL-LIVE-EXPORT-LINE-001', 'OL-LIVE-EXPORT-LINE-001', 'ORD-LIVE-REPO-001', 'C-LIVE-REPO', 'Postgres Export Live', '现货有货', '30*38*10', '白色', '普通提', '空白袋', 273, '自提', '待对账', 'U-OFFICE-A')
ON CONFLICT (id) DO UPDATE SET
  order_id = EXCLUDED.order_id,
  customer_id = EXCLUDED.customer_id,
  product_name = EXCLUDED.product_name,
  original_qty = EXCLUDED.original_qty,
  fulfillment_method = EXCLUDED.fulfillment_method,
  line_status = EXCLUDED.line_status,
  updated_at = now();

INSERT INTO fulfillment_records (
  id,
  biz_no,
  order_line_id,
  customer_id,
  customer_snapshot,
  method,
  expected_qty,
  actual_qty,
  status,
  created_by
) VALUES
  ('F001', 'F001', 'ORD-0629-001-01', 'C001', '{"name":"张三服饰"}'::jsonb, '自提', 500, 500, '待出库', 'U-OFFICE-A'),
  ('F002', 'F002', 'ORD-0629-002-01', 'C002', '{"name":"李四电商"}'::jsonb, '送货', 1200, 1200, '已备货', 'U-OFFICE-A'),
  ('F006', 'F006', 'ORD-0629-009-01', 'C010', '{"name":"月结客户"}'::jsonb, '送货', 2000, 2000, '待送货', 'U-OFFICE-A'),
  ('F008', 'F008', 'ORD-0629-022-01', 'C002', '{"name":"李四电商"}'::jsonb, '送货', 3000, 3000, '待出库', 'U-OFFICE-A'),
  ('F-LIVE-EXPORT-001', 'F-LIVE-EXPORT-001', 'OL-LIVE-EXPORT-LINE-001', 'C-LIVE-REPO', '{"name":"Postgres 仓储测试客户"}'::jsonb, '自提', 273, 273, '待对账', 'U-OFFICE-A')
ON CONFLICT (id) DO UPDATE SET
  order_line_id = EXCLUDED.order_line_id,
  customer_id = EXCLUDED.customer_id,
  expected_qty = EXCLUDED.expected_qty,
  actual_qty = EXCLUDED.actual_qty,
  status = EXCLUDED.status,
  updated_at = now();

INSERT INTO driver_delivery_dispatches (
  id,
  biz_no,
  fulfillment_id,
  driver_id,
  route_date,
  route_batch_no,
  stop_sequence,
  dispatch_status,
  planned_departure_at,
  assigned_by,
  assigned_at,
  remark
) VALUES
  (
    'DDIS-LIVE-F002-001',
    'DDIS-LIVE-F002-001',
    'F002',
    'U-DRIVER-A',
    '2026-07-02',
    '虎门线-A',
    2,
    '已派单',
    '2026-07-02T08:30:00.000Z',
    'U-OFFICE-A',
    '2026-07-02T08:00:00.000Z',
    '办公室测试派单顺序'
  ),
  (
    'DDIS-LIVE-F008-001',
    'DDIS-LIVE-F008-001',
    'F008',
    'U-DRIVER-A',
    '2026-07-02',
    '虎门线-A',
    3,
    '已派单',
    '2026-07-02T08:40:00.000Z',
    'U-OFFICE-A',
    '2026-07-02T08:05:00.000Z',
    '司机动作字段冷启动测试派单'
  ),
  (
    'DDIS-LIVE-F006-001',
    'DDIS-LIVE-F006-001',
    'F006',
    'U-DRIVER-A',
    '2026-07-02',
    '虎门线-A',
    4,
    '已派单',
    '2026-07-02T08:50:00.000Z',
    'U-OFFICE-A',
    '2026-07-02T08:10:00.000Z',
    '司机异常上报冷启动测试派单'
  )
ON CONFLICT (id) DO UPDATE SET
  driver_id = EXCLUDED.driver_id,
  route_date = EXCLUDED.route_date,
  route_batch_no = EXCLUDED.route_batch_no,
  stop_sequence = EXCLUDED.stop_sequence,
  dispatch_status = EXCLUDED.dispatch_status,
  planned_departure_at = EXCLUDED.planned_departure_at,
  assigned_by = EXCLUDED.assigned_by,
  assigned_at = EXCLUDED.assigned_at,
  remark = EXCLUDED.remark,
  updated_at = now();

INSERT INTO packages (
  id,
  biz_no,
  order_line_id,
  fulfillment_id,
  package_seq,
  package_count,
  packed_qty,
  label_print_record_id,
  status,
  created_by
) VALUES
  ('PKG-LIVE-F002-1', 'PKG-LIVE-F002-1', 'ORD-0629-002-01', 'F002', 1, 3, 400, NULL, '已打印', 'U-OFFICE-A'),
  ('PKG-LIVE-F002-2', 'PKG-LIVE-F002-2', 'ORD-0629-002-01', 'F002', 2, 3, 400, NULL, '已打印', 'U-OFFICE-A'),
  ('PKG-LIVE-F002-3', 'PKG-LIVE-F002-3', 'ORD-0629-002-01', 'F002', 3, 3, 400, NULL, '已打印', 'U-OFFICE-A'),
  ('PKG-LIVE-F006-1', 'PKG-LIVE-F006-1', 'ORD-0629-009-01', 'F006', 1, 2, 1000, NULL, '已打印', 'U-OFFICE-A'),
  ('PKG-LIVE-F006-2', 'PKG-LIVE-F006-2', 'ORD-0629-009-01', 'F006', 2, 2, 1000, NULL, '已打印', 'U-OFFICE-A'),
  ('PKG-LIVE-F008-1', 'PKG-LIVE-F008-1', 'ORD-0629-022-01', 'F008', 1, 6, 500, NULL, '已打印', 'U-OFFICE-A'),
  ('PKG-LIVE-F008-2', 'PKG-LIVE-F008-2', 'ORD-0629-022-01', 'F008', 2, 6, 500, NULL, '已打印', 'U-OFFICE-A'),
  ('PKG-LIVE-F008-3', 'PKG-LIVE-F008-3', 'ORD-0629-022-01', 'F008', 3, 6, 500, NULL, '已打印', 'U-OFFICE-A'),
  ('PKG-LIVE-F008-4', 'PKG-LIVE-F008-4', 'ORD-0629-022-01', 'F008', 4, 6, 500, NULL, '已打印', 'U-OFFICE-A'),
  ('PKG-LIVE-F008-5', 'PKG-LIVE-F008-5', 'ORD-0629-022-01', 'F008', 5, 6, 500, NULL, '已打印', 'U-OFFICE-A'),
  ('PKG-LIVE-F008-6', 'PKG-LIVE-F008-6', 'ORD-0629-022-01', 'F008', 6, 6, 500, NULL, '已打印', 'U-OFFICE-A')
ON CONFLICT (id) DO UPDATE SET
  fulfillment_id = EXCLUDED.fulfillment_id,
  package_seq = EXCLUDED.package_seq,
  package_count = EXCLUDED.package_count,
  packed_qty = EXCLUDED.packed_qty,
  label_print_record_id = EXCLUDED.label_print_record_id,
  status = EXCLUDED.status,
  updated_at = now();

INSERT INTO statements (
  id,
  biz_no,
  customer_id,
  period_start,
  period_end,
  status,
  receivable_amount,
  received_amount,
  variance_amount,
  created_by
) VALUES
  ('ST-0629-001', 'ST-LIVE-API-001', 'C001', '2026-06-22', '2026-06-29', '待生成', 273, 0, 273, 'U-OFFICE-A'),
  ('ST-0629-002', 'ST-LIVE-API-002', 'C002', '2026-06-15', '2026-06-29', '差额待确认', 108000, 80000, 28000, 'U-OFFICE-A'),
  ('ST-0629-005', 'ST-LIVE-API-005', 'C010', '2026-06-01', '2026-06-29', '有欠款', 1510, 0, 5300, 'U-OFFICE-A'),
  ('ST-LIVE-REPO-001', 'ST-LIVE-REPO-001', 'C-LIVE-REPO', '2026-06-22', '2026-06-29', '待生成', 273, 0, 273, 'U-OFFICE-A'),
  ('ST-LIVE-VAR-001', 'ST-LIVE-VAR-001', 'C-LIVE-REPO', '2026-06-22', '2026-06-29', '差额待确认', 273, 200, 73, 'U-OFFICE-A'),
  ('ST-LIVE-SEND-001', 'ST-LIVE-SEND-001', 'C-LIVE-REPO', '2026-06-22', '2026-06-29', '待生成', 273, 0, 273, 'U-OFFICE-A')
ON CONFLICT (id) DO UPDATE SET
  customer_id = EXCLUDED.customer_id,
  status = EXCLUDED.status,
  receivable_amount = EXCLUDED.receivable_amount,
  received_amount = EXCLUDED.received_amount,
  variance_amount = EXCLUDED.variance_amount,
  updated_at = now();

INSERT INTO statement_lines (
  id,
  statement_id,
  order_line_id,
  fulfillment_id,
  delivered_qty,
  chargeable_qty,
  free_qty,
  amount,
  adjustment_amount,
  final_amount
) VALUES
  ('ST-0629-001-001', 'ST-0629-001', 'ORD-0629-001-01', 'F001', 500, 500, 0, 180, 0, 180),
  ('ST-0629-001-002', 'ST-0629-001', 'ORD-0629-015-01', NULL, 300, 300, 0, 93, 0, 93)
ON CONFLICT (id) DO UPDATE SET
  statement_id = EXCLUDED.statement_id,
  order_line_id = EXCLUDED.order_line_id,
  fulfillment_id = EXCLUDED.fulfillment_id,
  delivered_qty = EXCLUDED.delivered_qty,
  chargeable_qty = EXCLUDED.chargeable_qty,
  free_qty = EXCLUDED.free_qty,
  amount = EXCLUDED.amount,
  adjustment_amount = EXCLUDED.adjustment_amount,
  final_amount = EXCLUDED.final_amount;
`;

export function seedPostgresLiveBusinessRows({ runPsql } = {}) {
  if (typeof runPsql !== "function") {
    throw new TypeError("seedPostgresLiveBusinessRows requires runPsql(sql).");
  }

  return runPsql(postgresLiveBusinessSeedSql);
}
