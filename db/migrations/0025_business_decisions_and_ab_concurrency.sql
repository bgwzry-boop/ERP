-- Business decision evidence, delegated entry, and AB-office concurrency.
-- This migration is additive and idempotent. It never invents decision makers for
-- historical records and never changes the existing raw-material or paper-outbound flows.

CREATE TABLE IF NOT EXISTS business_decision_authorizations (
  id TEXT PRIMARY KEY,
  employee_id TEXT NOT NULL REFERENCES employees(id),
  decision_scope TEXT NOT NULL,
  max_amount NUMERIC(14, 2),
  active_from TIMESTAMPTZ NOT NULL,
  active_to TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'active',
  authorization_note TEXT NOT NULL DEFAULT '',
  revision INTEGER NOT NULL DEFAULT 1,
  created_by TEXT REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (decision_scope IN (
    'order_priority',
    'production_schedule',
    'raw_material_purchase',
    'fulfillment_quantity_variance',
    'statement_variance',
    'statement_write_off'
  )),
  CHECK (max_amount IS NULL OR max_amount >= 0),
  CHECK (active_to IS NULL OR active_to >= active_from),
  CHECK (revision >= 1)
);

CREATE TABLE IF NOT EXISTS business_decision_records (
  id TEXT PRIMARY KEY,
  business_type TEXT NOT NULL,
  business_id TEXT NOT NULL,
  decision_scope TEXT NOT NULL,
  decision_type TEXT NOT NULL,
  decision_maker_employee_id TEXT NOT NULL REFERENCES employees(id),
  decision_maker_employee_no_snapshot TEXT NOT NULL,
  decision_maker_name_snapshot TEXT NOT NULL,
  decision_channel TEXT NOT NULL,
  decided_at TIMESTAMPTZ NOT NULL,
  decision_content_json JSONB NOT NULL,
  authorization_id TEXT REFERENCES business_decision_authorizations(id),
  authorization_snapshot_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  authorization_basis TEXT NOT NULL,
  amount_snapshot NUMERIC(14, 2),
  currency TEXT NOT NULL DEFAULT 'CNY',
  evidence_attachment_ids_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  entered_by_user_id TEXT NOT NULL REFERENCES users(id),
  entered_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  supersedes_decision_id TEXT REFERENCES business_decision_records(id),
  late_entry BOOLEAN NOT NULL DEFAULT false,
  late_entry_reason TEXT NOT NULL DEFAULT '',
  revision INTEGER NOT NULL DEFAULT 1,
  operation_log_id TEXT REFERENCES operation_logs(id),
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  CHECK (decision_scope IN (
    'order_priority',
    'production_schedule',
    'raw_material_purchase',
    'fulfillment_quantity_variance',
    'statement_variance',
    'statement_write_off'
  )),
  CHECK (decision_type IN ('direct', 'delegated')),
  CHECK (decision_channel IN ('in_person', 'phone', 'wechat', 'paper', 'self_system')),
  CHECK (status IN ('active', 'superseded')),
  CHECK (jsonb_typeof(decision_content_json) = 'object'),
  CHECK (jsonb_typeof(authorization_snapshot_json) = 'object'),
  CHECK (jsonb_typeof(evidence_attachment_ids_json) = 'array'),
  CHECK (decided_at <= entered_at),
  CHECK (revision >= 1),
  CHECK (supersedes_decision_id IS NULL OR supersedes_decision_id <> id)
);

CREATE TABLE IF NOT EXISTS raw_material_purchase_requests (
  id TEXT PRIMARY KEY,
  supplier_id TEXT NOT NULL DEFAULT '',
  supplier_name_snapshot TEXT NOT NULL,
  material_lines_json JSONB NOT NULL,
  required_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT '待执行',
  business_decision_id TEXT NOT NULL REFERENCES business_decision_records(id),
  created_by TEXT NOT NULL REFERENCES users(id),
  revision INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (jsonb_typeof(material_lines_json) = 'array'),
  CHECK (status IN ('待执行', '已联系供应商', '已下单', '部分到货', '已完成', '已取消')),
  CHECK (revision >= 1)
);

CREATE TABLE IF NOT EXISTS fulfillment_quantity_variance_resolutions (
  id TEXT PRIMARY KEY,
  fulfillment_id TEXT NOT NULL REFERENCES fulfillment_records(id),
  fulfillment_exception_id TEXT REFERENCES fulfillment_exceptions(id),
  expected_qty INTEGER NOT NULL,
  actual_qty INTEGER NOT NULL,
  resolution_result TEXT NOT NULL,
  business_decision_id TEXT NOT NULL REFERENCES business_decision_records(id),
  recorded_by TEXT NOT NULL REFERENCES users(id),
  revision INTEGER NOT NULL DEFAULT 1,
  operation_log_id TEXT REFERENCES operation_logs(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (expected_qty >= 0),
  CHECK (actual_qty >= 0),
  CHECK (resolution_result IN (
    '按实际数量出库',
    '补货后再出库',
    '赠送数量',
    '暂停等待确认',
    '作废本次出库指令'
  )),
  CHECK (revision >= 1)
);

CREATE TABLE IF NOT EXISTS statement_write_off_records (
  id TEXT PRIMARY KEY,
  statement_id TEXT NOT NULL REFERENCES statements(id),
  receivable_snapshot NUMERIC(14, 2) NOT NULL,
  received_snapshot NUMERIC(14, 2) NOT NULL,
  variance_snapshot NUMERIC(14, 2) NOT NULL,
  write_off_amount NUMERIC(14, 2) NOT NULL,
  handling_result TEXT NOT NULL,
  business_decision_id TEXT NOT NULL REFERENCES business_decision_records(id),
  recorded_by TEXT NOT NULL REFERENCES users(id),
  revision INTEGER NOT NULL DEFAULT 1,
  operation_log_id TEXT REFERENCES operation_logs(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (write_off_amount >= 0),
  CHECK (revision >= 1)
);

-- production_tasks already receives this column in migration 0014. Keep the guard
-- here so installations upgrading from older partial migration sets remain safe.
ALTER TABLE production_tasks
  ADD COLUMN IF NOT EXISTS revision INTEGER NOT NULL DEFAULT 1;

CREATE INDEX IF NOT EXISTS idx_business_decision_records_business
  ON business_decision_records (business_type, business_id, decided_at DESC);
CREATE INDEX IF NOT EXISTS idx_business_decision_records_maker
  ON business_decision_records (decision_maker_employee_id, decided_at DESC);
CREATE INDEX IF NOT EXISTS idx_business_decision_records_operator
  ON business_decision_records (entered_by_user_id, entered_at DESC);
CREATE INDEX IF NOT EXISTS idx_business_decision_records_scope
  ON business_decision_records (decision_scope, decided_at DESC);
CREATE INDEX IF NOT EXISTS idx_business_decision_records_status
  ON business_decision_records (status, decided_at DESC);
CREATE INDEX IF NOT EXISTS idx_business_decision_records_supersedes
  ON business_decision_records (supersedes_decision_id);
CREATE INDEX IF NOT EXISTS idx_business_decision_authorizations_employee_scope
  ON business_decision_authorizations (employee_id, decision_scope, status, active_from, active_to);
CREATE INDEX IF NOT EXISTS idx_raw_material_purchase_requests_status_required
  ON raw_material_purchase_requests (status, required_at);
CREATE INDEX IF NOT EXISTS idx_raw_material_purchase_requests_decision
  ON raw_material_purchase_requests (business_decision_id);
CREATE INDEX IF NOT EXISTS idx_fulfillment_quantity_variance_resolutions_fulfillment
  ON fulfillment_quantity_variance_resolutions (fulfillment_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_fulfillment_quantity_variance_resolutions_decision
  ON fulfillment_quantity_variance_resolutions (business_decision_id);
CREATE INDEX IF NOT EXISTS idx_statement_write_off_records_statement
  ON statement_write_off_records (statement_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_statement_write_off_records_decision
  ON statement_write_off_records (business_decision_id);
