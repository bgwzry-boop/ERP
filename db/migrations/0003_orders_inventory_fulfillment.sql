-- V1 core migration draft: order, inventory, production, packing, fulfillment, and printing.
-- Source quantities stay separated: ordered, reserved, produced, packed, delivered, and chargeable.

CREATE TABLE IF NOT EXISTS order_drafts (
  id TEXT PRIMARY KEY,
  biz_no TEXT NOT NULL UNIQUE,
  source_text TEXT NOT NULL,
  source_channel TEXT NOT NULL DEFAULT 'manual',
  source_message_id TEXT,
  customer_id TEXT REFERENCES customers(id),
  status TEXT NOT NULL DEFAULT '待审核',
  recognition_summary JSONB NOT NULL DEFAULT '{}'::jsonb,
  revision INTEGER NOT NULL DEFAULT 1,
  created_by TEXT REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS order_draft_lines (
  id TEXT PRIMARY KEY,
  order_draft_id TEXT NOT NULL REFERENCES order_drafts(id),
  line_seq INTEGER NOT NULL,
  product_name TEXT,
  order_type TEXT,
  size TEXT,
  bag_color TEXT,
  handle_type TEXT,
  style TEXT,
  print_flag BOOLEAN NOT NULL DEFAULT false,
  print_color TEXT,
  print_side TEXT,
  handle_color TEXT,
  qty INTEGER,
  fulfillment_method TEXT,
  latest_needed_at TIMESTAMPTZ,
  remark TEXT,
  confidence TEXT,
  missing_fields TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  evidence_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(order_draft_id, line_seq)
);

CREATE TABLE IF NOT EXISTS original_orders (
  id TEXT PRIMARY KEY,
  biz_no TEXT NOT NULL UNIQUE,
  source_draft_id TEXT REFERENCES order_drafts(id),
  customer_id TEXT NOT NULL REFERENCES customers(id),
  customer_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  source_text TEXT,
  summary_status TEXT NOT NULL DEFAULT '待确认',
  created_by TEXT REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  voided_at TIMESTAMPTZ,
  voided_by TEXT REFERENCES users(id),
  void_reason TEXT
);

CREATE TABLE IF NOT EXISTS order_lines (
  id TEXT PRIMARY KEY,
  biz_no TEXT NOT NULL UNIQUE,
  order_id TEXT NOT NULL REFERENCES original_orders(id),
  customer_id TEXT NOT NULL REFERENCES customers(id),
  product_name TEXT NOT NULL,
  order_type TEXT NOT NULL,
  size TEXT NOT NULL,
  bag_color TEXT,
  handle_type TEXT,
  style TEXT,
  print_flag BOOLEAN NOT NULL DEFAULT false,
  print_color TEXT,
  print_side TEXT,
  handle_color TEXT,
  original_qty INTEGER NOT NULL,
  latest_needed_at TIMESTAMPTZ,
  fulfillment_method TEXT NOT NULL DEFAULT '待确认',
  line_status TEXT NOT NULL DEFAULT '待确认',
  exception_tags TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  revision INTEGER NOT NULL DEFAULT 1,
  created_by TEXT REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  closed_at TIMESTAMPTZ,
  voided_at TIMESTAMPTZ,
  voided_by TEXT REFERENCES users(id),
  void_reason TEXT
);

CREATE TABLE IF NOT EXISTS order_line_change_records (
  id TEXT PRIMARY KEY,
  order_line_id TEXT NOT NULL REFERENCES order_lines(id),
  changed_fields TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  before_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  after_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  reason TEXT,
  document_reprint_required BOOLEAN NOT NULL DEFAULT false,
  changed_by TEXT REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS price_snapshots (
  id TEXT PRIMARY KEY,
  order_line_id TEXT NOT NULL REFERENCES order_lines(id),
  snapshot_type TEXT NOT NULL DEFAULT 'order_confirm',
  version_no INTEGER NOT NULL DEFAULT 1,
  price_table_id TEXT REFERENCES price_tables(id),
  price_version INTEGER,
  bag_price NUMERIC(14, 4) NOT NULL DEFAULT 0,
  print_price NUMERIC(14, 4) NOT NULL DEFAULT 0,
  other_fee NUMERIC(14, 2) NOT NULL DEFAULT 0,
  adjustment_amount NUMERIC(14, 2) NOT NULL DEFAULT 0,
  chargeable_qty INTEGER NOT NULL,
  final_amount NUMERIC(14, 2) NOT NULL DEFAULT 0,
  override_reason TEXT,
  created_by TEXT REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(order_line_id, snapshot_type, version_no)
);

CREATE TABLE IF NOT EXISTS inventory_items (
  id TEXT PRIMARY KEY,
  inventory_key TEXT NOT NULL UNIQUE,
  size TEXT NOT NULL,
  standard_color_id TEXT REFERENCES standard_colors(id),
  handle_type TEXT NOT NULL,
  style TEXT NOT NULL,
  zone TEXT NOT NULL DEFAULT '未分区',
  inventory_state TEXT NOT NULL DEFAULT '仓库已清点',
  on_hand_qty INTEGER NOT NULL DEFAULT 0,
  reserved_qty INTEGER NOT NULL DEFAULT 0,
  waiting_pickup_locked_qty INTEGER NOT NULL DEFAULT 0,
  pending_handling_qty INTEGER NOT NULL DEFAULT 0,
  trust_level TEXT NOT NULL DEFAULT '已清点',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(size, standard_color_id, handle_type, style, zone, inventory_state)
);

CREATE TABLE IF NOT EXISTS inventory_reservations (
  id TEXT PRIMARY KEY,
  order_line_id TEXT NOT NULL REFERENCES order_lines(id),
  inventory_item_id TEXT NOT NULL REFERENCES inventory_items(id),
  reserved_qty INTEGER NOT NULL,
  reservation_type TEXT NOT NULL DEFAULT '出库占用',
  status TEXT NOT NULL DEFAULT '生效',
  expires_at TIMESTAMPTZ,
  created_by TEXT REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS inventory_ledger_entries (
  id TEXT PRIMARY KEY,
  inventory_item_id TEXT NOT NULL REFERENCES inventory_items(id),
  change_type TEXT NOT NULL,
  qty_before INTEGER NOT NULL,
  qty_change INTEGER NOT NULL,
  qty_after INTEGER NOT NULL,
  source_type TEXT NOT NULL,
  source_id TEXT NOT NULL,
  operator_id TEXT REFERENCES users(id),
  confirmed_by TEXT REFERENCES users(id),
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  reason TEXT,
  remark TEXT
);

CREATE TABLE IF NOT EXISTS inventory_correction_drafts (
  id TEXT PRIMARY KEY,
  biz_no TEXT NOT NULL UNIQUE,
  inventory_item_id TEXT NOT NULL REFERENCES inventory_items(id),
  expected_qty INTEGER,
  actual_qty INTEGER NOT NULL,
  delta_qty INTEGER NOT NULL,
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT '待确认生效',
  revision INTEGER NOT NULL DEFAULT 1,
  created_by TEXT REFERENCES users(id),
  confirmed_by TEXT REFERENCES users(id),
  confirmed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS production_tasks (
  id TEXT PRIMARY KEY,
  biz_no TEXT NOT NULL UNIQUE,
  order_line_id TEXT NOT NULL REFERENCES order_lines(id),
  task_type TEXT NOT NULL,
  machine_id TEXT,
  planned_qty INTEGER NOT NULL,
  task_status TEXT NOT NULL DEFAULT '待开始',
  published_schedule_id TEXT,
  created_by TEXT REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS workshop_reports (
  id TEXT PRIMARY KEY,
  production_task_id TEXT REFERENCES production_tasks(id),
  order_line_id TEXT NOT NULL REFERENCES order_lines(id),
  process_type TEXT NOT NULL,
  machine_id TEXT,
  operator_id TEXT REFERENCES users(id),
  qualified_qty INTEGER NOT NULL DEFAULT 0,
  exception_qty INTEGER NOT NULL DEFAULT 0,
  machine_count INTEGER,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  remark TEXT,
  evidence_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS packing_tasks (
  id TEXT PRIMARY KEY,
  biz_no TEXT NOT NULL UNIQUE,
  order_line_id TEXT NOT NULL REFERENCES order_lines(id),
  planned_qty INTEGER NOT NULL,
  actual_packed_qty INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT '待打包',
  created_by TEXT REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS fulfillment_records (
  id TEXT PRIMARY KEY,
  biz_no TEXT NOT NULL UNIQUE,
  order_line_id TEXT NOT NULL REFERENCES order_lines(id),
  customer_id TEXT NOT NULL REFERENCES customers(id),
  customer_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  method TEXT NOT NULL,
  expected_qty INTEGER NOT NULL,
  actual_qty INTEGER,
  status TEXT NOT NULL DEFAULT '待出库',
  latest_needed_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  confirmed_at TIMESTAMPTZ,
  confirmed_by TEXT REFERENCES users(id),
  loaded_at TIMESTAMPTZ,
  loaded_by TEXT REFERENCES users(id),
  driver_remark TEXT NOT NULL DEFAULT '',
  receiver_name TEXT NOT NULL DEFAULT '',
  paper_note_status TEXT NOT NULL DEFAULT '',
  watermarked_photo_attached BOOLEAN NOT NULL DEFAULT false,
  watermarked_photo_attachment_id TEXT NOT NULL DEFAULT '',
  watermarked_photo_url TEXT NOT NULL DEFAULT '',
  watermark_id TEXT NOT NULL DEFAULT '',
  watermark_text TEXT NOT NULL DEFAULT '',
  watermark_captured_at TIMESTAMPTZ,
  watermark_location_label TEXT NOT NULL DEFAULT '',
  watermark_geo_point TEXT NOT NULL DEFAULT '',
  watermark_address TEXT NOT NULL DEFAULT '',
  watermark_operator_id TEXT REFERENCES users(id),
  watermark_operator_name TEXT NOT NULL DEFAULT '',
  signature_photo_attached BOOLEAN NOT NULL DEFAULT false,
  signature_photo_attachment_id TEXT NOT NULL DEFAULT '',
  delivery_evidence_review_status TEXT NOT NULL DEFAULT '',
  delivery_evidence_reviewed_at TIMESTAMPTZ,
  delivery_evidence_reviewed_by TEXT NOT NULL DEFAULT '',
  delivery_evidence_reviewed_by_user_id TEXT REFERENCES users(id),
  delivery_evidence_issue_reason TEXT NOT NULL DEFAULT '',
  delivery_evidence_review_remark TEXT NOT NULL DEFAULT '',
  delivery_evidence_review_updated_at TIMESTAMPTZ,
  created_by TEXT REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS driver_delivery_dispatches (
  id TEXT PRIMARY KEY,
  biz_no TEXT NOT NULL UNIQUE,
  fulfillment_id TEXT NOT NULL REFERENCES fulfillment_records(id),
  driver_id TEXT REFERENCES users(id),
  route_date DATE,
  route_batch_no TEXT NOT NULL DEFAULT '',
  stop_sequence INTEGER NOT NULL DEFAULT 0,
  dispatch_status TEXT NOT NULL DEFAULT '已派单',
  planned_departure_at TIMESTAMPTZ,
  assigned_by TEXT REFERENCES users(id),
  assigned_at TIMESTAMPTZ,
  remark TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS driver_device_field_tests (
  id TEXT PRIMARY KEY,
  biz_no TEXT NOT NULL UNIQUE,
  fulfillment_id TEXT NOT NULL REFERENCES fulfillment_records(id),
  order_line_id TEXT REFERENCES order_lines(id),
  driver_id TEXT REFERENCES users(id),
  operator_id TEXT REFERENCES users(id),
  operator_name TEXT NOT NULL DEFAULT '',
  checked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  device_label TEXT NOT NULL DEFAULT '',
  browser_label TEXT NOT NULL DEFAULT '',
  user_agent TEXT NOT NULL DEFAULT '',
  language TEXT NOT NULL DEFAULT '',
  checks_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  summary_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  note TEXT NOT NULL DEFAULT '',
  operation_log_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS print_templates (
  id TEXT PRIMARY KEY,
  template_key TEXT NOT NULL UNIQUE,
  template_type TEXT NOT NULL,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  template_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by TEXT REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS printer_devices (
  id TEXT PRIMARY KEY,
  biz_no TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  device_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  connection_type TEXT NOT NULL DEFAULT 'system_printer',
  connection_uri TEXT,
  driver_name TEXT,
  supported_document_types TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  default_document_types TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  paper_width_mm NUMERIC(10,2) NOT NULL DEFAULT 0,
  paper_height_mm NUMERIC(10,2) NOT NULL DEFAULT 0,
  paper_name TEXT,
  is_continuous BOOLEAN NOT NULL DEFAULT false,
  dpi INTEGER NOT NULL DEFAULT 203,
  default_copies INTEGER NOT NULL DEFAULT 1,
  darkness INTEGER NOT NULL DEFAULT 0,
  speed INTEGER NOT NULL DEFAULT 0,
  cutter_enabled BOOLEAN NOT NULL DEFAULT false,
  settings_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by TEXT REFERENCES users(id),
  updated_by TEXT REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS print_records (
  id TEXT PRIMARY KEY,
  biz_no TEXT NOT NULL UNIQUE,
  target_type TEXT NOT NULL,
  target_id TEXT NOT NULL,
  template_id TEXT REFERENCES print_templates(id),
  printer_device_id TEXT REFERENCES printer_devices(id),
  printer_device_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  batch_no TEXT,
  print_action TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT '预览',
  void_reason TEXT,
  replaced_by_id TEXT REFERENCES print_records(id),
  printed_by TEXT REFERENCES users(id),
  printed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS print_jobs (
  id TEXT PRIMARY KEY,
  biz_no TEXT NOT NULL UNIQUE,
  print_record_id TEXT REFERENCES print_records(id),
  target_type TEXT NOT NULL,
  target_id TEXT NOT NULL,
  document_type TEXT NOT NULL,
  template_id TEXT REFERENCES print_templates(id),
  printer_device_id TEXT REFERENCES printer_devices(id),
  printer_device_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  driver_mode TEXT NOT NULL DEFAULT 'preview_only',
  job_status TEXT NOT NULL DEFAULT 'queued',
  attempt_no INTEGER NOT NULL DEFAULT 1,
  source_print_job_id TEXT REFERENCES print_jobs(id),
  requested_by TEXT REFERENCES users(id),
  queued_at TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  error_code TEXT,
  error_message TEXT,
  payload_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  operation_log_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS printer_device_field_tests (
  id TEXT PRIMARY KEY,
  biz_no TEXT NOT NULL UNIQUE,
  printer_device_id TEXT NOT NULL REFERENCES printer_devices(id),
  print_job_id TEXT REFERENCES print_jobs(id),
  document_type TEXT NOT NULL DEFAULT '',
  operator_id TEXT REFERENCES users(id),
  operator_name TEXT NOT NULL DEFAULT '',
  checked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  device_label TEXT NOT NULL DEFAULT '',
  driver_label TEXT NOT NULL DEFAULT '',
  paper_label TEXT NOT NULL DEFAULT '',
  checks_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  summary_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  note TEXT NOT NULL DEFAULT '',
  operation_log_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS print_batch_records (
  id TEXT PRIMARY KEY,
  biz_no TEXT NOT NULL UNIQUE,
  action TEXT NOT NULL DEFAULT '批量打印标签',
  result_label TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'printed',
  todo_ids TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  todo_refs TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  total_task_count INTEGER NOT NULL DEFAULT 0,
  total_label_count INTEGER NOT NULL DEFAULT 0,
  printed_label_count INTEGER NOT NULL DEFAULT 0,
  pending_label_count INTEGER NOT NULL DEFAULT 0,
  printed_package_ids TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  pending_package_ids TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  print_packages_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  printed_packages_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  pending_packages_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  summary TEXT NOT NULL DEFAULT '',
  operation_log_id TEXT,
  operator_id TEXT REFERENCES users(id),
  operator_name TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS packages (
  id TEXT PRIMARY KEY,
  biz_no TEXT NOT NULL UNIQUE,
  order_line_id TEXT NOT NULL REFERENCES order_lines(id),
  fulfillment_id TEXT REFERENCES fulfillment_records(id),
  package_seq INTEGER NOT NULL DEFAULT 1,
  package_count INTEGER NOT NULL DEFAULT 1,
  packed_qty INTEGER NOT NULL,
  label_print_record_id TEXT REFERENCES print_records(id),
  status TEXT NOT NULL DEFAULT '待打印标签',
  created_by TEXT REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS fulfillment_exceptions (
  id TEXT PRIMARY KEY,
  fulfillment_id TEXT NOT NULL REFERENCES fulfillment_records(id),
  exception_type TEXT NOT NULL,
  expected_qty INTEGER,
  actual_qty INTEGER,
  reason_code TEXT NOT NULL DEFAULT 'other',
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT '待办公室处理',
  todo_id TEXT,
  reported_by TEXT REFERENCES users(id),
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_order_drafts_status ON order_drafts(status);
CREATE INDEX IF NOT EXISTS idx_order_drafts_customer ON order_drafts(customer_id);
CREATE INDEX IF NOT EXISTS idx_original_orders_customer_status ON original_orders(customer_id, summary_status);
CREATE INDEX IF NOT EXISTS idx_order_lines_customer ON order_lines(customer_id);
CREATE INDEX IF NOT EXISTS idx_order_lines_status ON order_lines(line_status);
CREATE INDEX IF NOT EXISTS idx_order_lines_fulfillment ON order_lines(fulfillment_method);
CREATE INDEX IF NOT EXISTS idx_order_lines_latest_needed ON order_lines(latest_needed_at);
CREATE INDEX IF NOT EXISTS idx_inventory_items_state ON inventory_items(inventory_state);
CREATE INDEX IF NOT EXISTS idx_inventory_items_trust ON inventory_items(trust_level);
CREATE INDEX IF NOT EXISTS idx_inventory_reservations_line ON inventory_reservations(order_line_id);
CREATE INDEX IF NOT EXISTS idx_inventory_reservations_item_status ON inventory_reservations(inventory_item_id, status);
CREATE INDEX IF NOT EXISTS idx_inventory_ledger_item ON inventory_ledger_entries(inventory_item_id);
CREATE INDEX IF NOT EXISTS idx_inventory_ledger_source ON inventory_ledger_entries(source_type, source_id);
CREATE INDEX IF NOT EXISTS idx_fulfillment_method_status ON fulfillment_records(method, status);
CREATE INDEX IF NOT EXISTS idx_fulfillment_latest_needed ON fulfillment_records(latest_needed_at);
CREATE INDEX IF NOT EXISTS idx_fulfillment_delivery_evidence_review ON fulfillment_records(method, delivery_evidence_review_status);
CREATE INDEX IF NOT EXISTS idx_driver_dispatch_driver_date_sequence ON driver_delivery_dispatches(driver_id, route_date, stop_sequence);
CREATE INDEX IF NOT EXISTS idx_driver_dispatch_fulfillment_status ON driver_delivery_dispatches(fulfillment_id, dispatch_status);
CREATE INDEX IF NOT EXISTS idx_driver_device_field_tests_fulfillment_checked ON driver_device_field_tests(fulfillment_id, checked_at DESC);
CREATE INDEX IF NOT EXISTS idx_driver_device_field_tests_driver_checked ON driver_device_field_tests(driver_id, checked_at DESC);
CREATE INDEX IF NOT EXISTS idx_packages_fulfillment ON packages(fulfillment_id);
CREATE INDEX IF NOT EXISTS idx_packages_order_line ON packages(order_line_id);
CREATE INDEX IF NOT EXISTS idx_packages_status ON packages(status);
CREATE INDEX IF NOT EXISTS idx_printer_devices_status ON printer_devices(status, device_type);
CREATE INDEX IF NOT EXISTS idx_printer_devices_documents ON printer_devices USING GIN(supported_document_types);
CREATE INDEX IF NOT EXISTS idx_print_records_target ON print_records(target_type, target_id);
CREATE INDEX IF NOT EXISTS idx_print_jobs_status ON print_jobs(job_status, created_at);
CREATE INDEX IF NOT EXISTS idx_print_jobs_record ON print_jobs(print_record_id);
CREATE INDEX IF NOT EXISTS idx_print_jobs_target ON print_jobs(target_type, target_id);
CREATE INDEX IF NOT EXISTS idx_print_jobs_device ON print_jobs(printer_device_id, job_status);
CREATE INDEX IF NOT EXISTS idx_printer_device_field_tests_device_checked ON printer_device_field_tests(printer_device_id, checked_at DESC);
CREATE INDEX IF NOT EXISTS idx_printer_device_field_tests_job ON printer_device_field_tests(print_job_id);
CREATE INDEX IF NOT EXISTS idx_print_batch_records_status ON print_batch_records(status, created_at);
CREATE INDEX IF NOT EXISTS idx_print_batch_records_todo_ids ON print_batch_records USING GIN(todo_ids);
