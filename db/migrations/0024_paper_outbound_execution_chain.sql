-- Paper-led finished-goods outbound is separate from physical execution and customer delivery.
-- Existing records are intentionally marked for review; this migration never infers that a
-- historical print or physical outbound record was a completed customer delivery.

ALTER TABLE fulfillment_records
  ADD COLUMN IF NOT EXISTS paper_outbound_status TEXT NOT NULL DEFAULT '待生成纸单';

ALTER TABLE fulfillment_records
  ADD COLUMN IF NOT EXISTS paper_outbound_document_id TEXT;

ALTER TABLE fulfillment_records
  ADD COLUMN IF NOT EXISTS physical_outbound_at TIMESTAMPTZ;

ALTER TABLE fulfillment_records
  ADD COLUMN IF NOT EXISTS physical_executor_employee_id TEXT;

ALTER TABLE fulfillment_records
  ADD COLUMN IF NOT EXISTS physical_outbound_document_id TEXT;

ALTER TABLE fulfillment_records
  ADD COLUMN IF NOT EXISTS physical_outbound_document_version INTEGER;

ALTER TABLE fulfillment_records
  ADD COLUMN IF NOT EXISTS final_delivery_status TEXT NOT NULL DEFAULT '待最终交付';

ALTER TABLE fulfillment_records
  ADD COLUMN IF NOT EXISTS final_delivery_at TIMESTAMPTZ;

ALTER TABLE fulfillment_records
  ADD COLUMN IF NOT EXISTS legacy_state_review_required BOOLEAN NOT NULL DEFAULT false;

-- Every record present before this migration has ambiguous legacy semantics. Do not assume
-- that its prior status came from a current paper document, a physical handoff, or delivery.
UPDATE fulfillment_records
SET
  paper_outbound_status = '历史待复核',
  final_delivery_status = '历史待复核',
  legacy_state_review_required = true
WHERE paper_outbound_document_id IS NULL
  AND physical_outbound_at IS NULL
  AND final_delivery_at IS NULL;

CREATE TABLE IF NOT EXISTS paper_outbound_documents (
  id TEXT PRIMARY KEY,
  fulfillment_id TEXT NOT NULL REFERENCES fulfillment_records(id),
  print_record_id TEXT NOT NULL REFERENCES print_records(id),
  document_type TEXT NOT NULL,
  document_version INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT '待打印确认',
  printed_by TEXT REFERENCES users(id),
  printed_at TIMESTAMPTZ,
  handed_to_warehouse_by TEXT REFERENCES users(id),
  handed_to_warehouse_at TIMESTAMPTZ,
  handover_note TEXT NOT NULL DEFAULT '',
  voided_by TEXT REFERENCES users(id),
  voided_at TIMESTAMPTZ,
  void_reason TEXT NOT NULL DEFAULT '',
  revision INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (fulfillment_id, document_version),
  UNIQUE (print_record_id)
);

CREATE TABLE IF NOT EXISTS warehouse_outbound_executions (
  id TEXT PRIMARY KEY,
  fulfillment_id TEXT NOT NULL REFERENCES fulfillment_records(id),
  paper_outbound_document_id TEXT NOT NULL REFERENCES paper_outbound_documents(id),
  paper_document_version INTEGER NOT NULL,
  result TEXT NOT NULL,
  expected_qty INTEGER NOT NULL,
  actual_qty INTEGER,
  physical_executor_employee_id TEXT NOT NULL REFERENCES employees(id),
  feedback_channel TEXT NOT NULL,
  executed_at TIMESTAMPTZ NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  authenticated_operator_id TEXT NOT NULL REFERENCES users(id),
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revision INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_paper_outbound_documents_fulfillment_version
  ON paper_outbound_documents (fulfillment_id, document_version DESC);

CREATE INDEX IF NOT EXISTS idx_paper_outbound_documents_print_record
  ON paper_outbound_documents (print_record_id);

CREATE INDEX IF NOT EXISTS idx_warehouse_outbound_executions_fulfillment_executed
  ON warehouse_outbound_executions (fulfillment_id, executed_at DESC);

CREATE INDEX IF NOT EXISTS idx_warehouse_outbound_executions_document
  ON warehouse_outbound_executions (paper_outbound_document_id, paper_document_version);
