-- 负责人 2026-11-08：送货单/自提单由办公室电脑上的针式打印机打（EPSON LQ-615KII，驱动已在办公室装好调好）。
-- 网页走浏览器打印：点打印 → 浏览器打印窗口选针式打印机 → 打完办公室在屏幕上确认「已打印」，系统才记已打印。
-- 测试站库里还没有自提单/送货单的打印模板和这台打印机，补上；已经有的不动。
INSERT INTO print_templates (id, template_key, template_type, name)
VALUES
  ('tpl-p0-pickup-note', 'p0.pickup-note', 'pickup_note', '自提单'),
  ('tpl-p0-delivery-note', 'p0.delivery-note', 'delivery_note', '送货单')
ON CONFLICT DO NOTHING;

INSERT INTO printer_devices (
  id, biz_no, name, device_type, status, connection_type, connection_uri, driver_name,
  supported_document_types, default_document_types,
  paper_width_mm, paper_height_mm, paper_name, is_continuous, dpi, default_copies, settings_json
)
VALUES (
  'PRN-DOT-A', 'PRN-DOT-A', 'EPSON LQ-615KII 针式单据打印机', 'dot_matrix', 'active', 'browser_download',
  'browser://office-dot-matrix', 'EPSON LQ-610KII/615KII / ESC-P-K',
  ARRAY['outbound_note', 'pickup_note', 'delivery_note'], ARRAY['outbound_note', 'pickup_note', 'delivery_note'],
  241, 140, '三联二等分连续针式纸', true, 180, 1,
  jsonb_build_object(
    'driverMode', 'browser_download',
    'note', '办公室电脑浏览器打印，打完由办公室确认已打印。'
  )
)
ON CONFLICT DO NOTHING;
