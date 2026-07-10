-- V1 core migration draft: statements, payments, todos, attachments, audit, after-sales, and responsibility clues.

CREATE TABLE IF NOT EXISTS statements (
  id TEXT PRIMARY KEY,
  biz_no TEXT NOT NULL UNIQUE,
  customer_id TEXT NOT NULL REFERENCES customers(id),
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  status TEXT NOT NULL DEFAULT '待生成',
  receivable_amount NUMERIC(14, 2) NOT NULL DEFAULT 0,
  received_amount NUMERIC(14, 2) NOT NULL DEFAULT 0,
  variance_amount NUMERIC(14, 2) NOT NULL DEFAULT 0,
  last_sent_at TIMESTAMPTZ,
  settled_at TIMESTAMPTZ,
  created_by TEXT REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS statement_lines (
  id TEXT PRIMARY KEY,
  statement_id TEXT NOT NULL REFERENCES statements(id),
  order_line_id TEXT NOT NULL REFERENCES order_lines(id),
  fulfillment_id TEXT REFERENCES fulfillment_records(id),
  delivered_qty INTEGER NOT NULL DEFAULT 0,
  chargeable_qty INTEGER NOT NULL DEFAULT 0,
  free_qty INTEGER NOT NULL DEFAULT 0,
  amount NUMERIC(14, 2) NOT NULL DEFAULT 0,
  adjustment_amount NUMERIC(14, 2) NOT NULL DEFAULT 0,
  final_amount NUMERIC(14, 2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS statement_export_files (
  id TEXT PRIMARY KEY,
  statement_id TEXT NOT NULL REFERENCES statements(id),
  preview_type TEXT NOT NULL,
  download_token TEXT NOT NULL UNIQUE,
  file_name TEXT NOT NULL,
  content_type TEXT NOT NULL DEFAULT 'application/vnd.ms-excel; charset=utf-8',
  storage_provider TEXT NOT NULL DEFAULT 'database',
  storage_key TEXT NOT NULL DEFAULT '',
  content_text TEXT NOT NULL DEFAULT '',
  content_digest TEXT NOT NULL DEFAULT '',
  operation_log_id TEXT,
  created_by TEXT REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS statement_send_records (
  id TEXT PRIMARY KEY,
  statement_id TEXT NOT NULL REFERENCES statements(id),
  channel TEXT NOT NULL,
  sent_to TEXT,
  export_file_id TEXT,
  include_payment_qr BOOLEAN NOT NULL DEFAULT false,
  sent_by TEXT REFERENCES users(id),
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  remark TEXT,
  receipt_status TEXT NOT NULL DEFAULT 'pending',
  receipt_at TIMESTAMPTZ,
  receipt_by TEXT REFERENCES users(id),
  receipt_note TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS statement_confirmation_records (
  id TEXT PRIMARY KEY,
  statement_id TEXT NOT NULL REFERENCES statements(id),
  send_record_id TEXT REFERENCES statement_send_records(id),
  confirmation_type TEXT NOT NULL DEFAULT 'customer_reply',
  channel TEXT NOT NULL DEFAULT 'wechat',
  confirmed_by_customer TEXT NOT NULL DEFAULT '',
  confirmed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  content TEXT NOT NULL DEFAULT '',
  attachment_ids_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  recorded_by TEXT REFERENCES users(id),
  operation_log_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS payment_records (
  id TEXT PRIMARY KEY,
  biz_no TEXT NOT NULL UNIQUE,
  statement_id TEXT NOT NULL REFERENCES statements(id),
  customer_id TEXT NOT NULL REFERENCES customers(id),
  amount NUMERIC(14, 2) NOT NULL,
  payment_method TEXT,
  payment_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT '已登记待确认',
  registered_by TEXT REFERENCES users(id),
  confirmed_by TEXT REFERENCES users(id),
  confirmed_at TIMESTAMPTZ,
  evidence_attachment_id TEXT,
  remark TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS variance_records (
  id TEXT PRIMARY KEY,
  statement_id TEXT NOT NULL REFERENCES statements(id),
  payment_record_id TEXT REFERENCES payment_records(id),
  variance_amount NUMERIC(14, 2) NOT NULL,
  handling_result TEXT NOT NULL,
  reason TEXT,
  status TEXT NOT NULL DEFAULT '待确认',
  confirmed_by TEXT REFERENCES users(id),
  confirmed_at TIMESTAMPTZ,
  attachment_id TEXT,
  created_by TEXT REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS todos (
  id TEXT PRIMARY KEY,
  biz_no TEXT NOT NULL UNIQUE,
  type TEXT NOT NULL,
  ref_type TEXT NOT NULL,
  ref_id TEXT NOT NULL,
  priority TEXT NOT NULL DEFAULT '普通',
  status TEXT NOT NULL DEFAULT '未处理',
  summary TEXT,
  due_at TIMESTAMPTZ,
  remind_at TIMESTAMPTZ,
  handled_by TEXT REFERENCES users(id),
  handled_at TIMESTAMPTZ,
  handling_result TEXT,
  created_by TEXT REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS todo_events (
  id TEXT PRIMARY KEY,
  todo_id TEXT NOT NULL REFERENCES todos(id),
  event_type TEXT NOT NULL,
  event_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  operator_id TEXT REFERENCES users(id),
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS attachments (
  id TEXT PRIMARY KEY,
  file_name TEXT NOT NULL,
  file_type TEXT NOT NULL,
  purpose TEXT NOT NULL,
  mime_type TEXT NOT NULL DEFAULT '',
  file_size_bytes BIGINT,
  has_content BOOLEAN NOT NULL DEFAULT false,
  storage_provider TEXT NOT NULL DEFAULT '',
  storage_key TEXT NOT NULL DEFAULT '',
  storage_url TEXT NOT NULL DEFAULT '',
  content_ref TEXT,
  content_digest TEXT NOT NULL DEFAULT '',
  thumbnail_storage_key TEXT NOT NULL DEFAULT '',
  thumbnail_url TEXT NOT NULL DEFAULT '',
  signed_url_expires_at TIMESTAMPTZ,
  uploaded_by TEXT REFERENCES users(id),
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  captured_at TIMESTAMPTZ,
  ocr_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  watermark_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'uploaded',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS attachment_links (
  id TEXT PRIMARY KEY,
  attachment_id TEXT NOT NULL REFERENCES attachments(id),
  owner_type TEXT NOT NULL,
  owner_id TEXT NOT NULL,
  purpose TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(attachment_id, owner_type, owner_id, purpose)
);

CREATE TABLE IF NOT EXISTS attachment_access_logs (
  id TEXT PRIMARY KEY,
  attachment_id TEXT NOT NULL REFERENCES attachments(id),
  operation_log_id TEXT NOT NULL,
  action TEXT NOT NULL,
  operator_id TEXT REFERENCES users(id),
  access_mode TEXT NOT NULL DEFAULT '',
  delivery_mode TEXT NOT NULL DEFAULT '',
  storage_provider TEXT NOT NULL DEFAULT '',
  storage_key TEXT NOT NULL DEFAULT '',
  owner_type TEXT NOT NULL DEFAULT '',
  owner_id TEXT NOT NULL DEFAULT '',
  purpose TEXT NOT NULL DEFAULT '',
  file_name TEXT NOT NULL DEFAULT '',
  content_type TEXT NOT NULL DEFAULT '',
  expires_at TIMESTAMPTZ,
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS operation_logs (
  id TEXT PRIMARY KEY,
  target_type TEXT NOT NULL,
  target_id TEXT NOT NULL,
  action TEXT NOT NULL,
  before_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  after_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  reason TEXT,
  operator_id TEXT REFERENCES users(id),
  page_key TEXT,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS after_sales_records (
  id TEXT PRIMARY KEY,
  biz_no TEXT NOT NULL UNIQUE,
  customer_id TEXT NOT NULL REFERENCES customers(id),
  order_line_id TEXT REFERENCES order_lines(id),
  fulfillment_id TEXT REFERENCES fulfillment_records(id),
  issue_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT '待处理',
  amount_impact NUMERIC(14, 2) NOT NULL DEFAULT 0,
  handling_result TEXT,
  created_by TEXT REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS responsibility_clues (
  id TEXT PRIMARY KEY,
  ref_type TEXT NOT NULL,
  ref_id TEXT NOT NULL,
  stage TEXT NOT NULL,
  possible_owner_id TEXT REFERENCES users(id),
  reference_loss_amount NUMERIC(14, 2) NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT '待确认',
  confirmed_by TEXT REFERENCES users(id),
  confirmed_at TIMESTAMPTZ,
  remark TEXT,
  created_by TEXT REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_statements_customer_status ON statements(customer_id, status);
CREATE INDEX IF NOT EXISTS idx_statements_period ON statements(period_start, period_end);
CREATE INDEX IF NOT EXISTS idx_statement_lines_statement ON statement_lines(statement_id);
CREATE INDEX IF NOT EXISTS idx_statement_lines_order_line ON statement_lines(order_line_id);
CREATE INDEX IF NOT EXISTS idx_statement_export_files_statement ON statement_export_files(statement_id, created_at);
CREATE INDEX IF NOT EXISTS idx_statement_export_files_token ON statement_export_files(download_token);
CREATE INDEX IF NOT EXISTS idx_payment_records_statement ON payment_records(statement_id);
CREATE INDEX IF NOT EXISTS idx_variance_records_statement ON variance_records(statement_id);
CREATE INDEX IF NOT EXISTS idx_todos_status ON todos(status);
CREATE INDEX IF NOT EXISTS idx_todos_type ON todos(type);
CREATE INDEX IF NOT EXISTS idx_todos_priority_due ON todos(priority, due_at);
CREATE INDEX IF NOT EXISTS idx_todos_ref ON todos(ref_type, ref_id);
CREATE INDEX IF NOT EXISTS idx_todo_events_todo ON todo_events(todo_id);
CREATE INDEX IF NOT EXISTS idx_attachments_purpose_status ON attachments(purpose, status);
CREATE INDEX IF NOT EXISTS idx_attachments_uploaded_at ON attachments(uploaded_at);
CREATE INDEX IF NOT EXISTS idx_attachments_storage_provider_key ON attachments(storage_provider, storage_key);
CREATE INDEX IF NOT EXISTS idx_attachment_links_owner ON attachment_links(owner_type, owner_id, purpose);
CREATE INDEX IF NOT EXISTS idx_attachment_links_attachment ON attachment_links(attachment_id);
CREATE INDEX IF NOT EXISTS idx_attachment_access_logs_attachment ON attachment_access_logs(attachment_id, occurred_at);
CREATE INDEX IF NOT EXISTS idx_attachment_access_logs_operator ON attachment_access_logs(operator_id, occurred_at);
CREATE INDEX IF NOT EXISTS idx_attachment_access_logs_action ON attachment_access_logs(action, access_mode);
CREATE INDEX IF NOT EXISTS idx_operation_logs_target ON operation_logs(target_type, target_id);
CREATE INDEX IF NOT EXISTS idx_operation_logs_operator ON operation_logs(operator_id);
CREATE INDEX IF NOT EXISTS idx_after_sales_customer ON after_sales_records(customer_id);
CREATE INDEX IF NOT EXISTS idx_after_sales_order_line ON after_sales_records(order_line_id);
CREATE INDEX IF NOT EXISTS idx_responsibility_clues_ref ON responsibility_clues(ref_type, ref_id);
