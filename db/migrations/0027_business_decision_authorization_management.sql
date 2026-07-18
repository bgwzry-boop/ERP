-- Server-authoritative business-decision authorization management and evidence drafts.
-- This migration is additive only. It deliberately creates no authorization rows.

ALTER TABLE business_decision_authorizations
  ADD COLUMN IF NOT EXISTS updated_by TEXT REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS deactivated_by TEXT REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS deactivated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS deactivation_reason TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS operation_log_id TEXT REFERENCES operation_logs(id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'business_decision_authorizations_status_check'
  ) THEN
    ALTER TABLE business_decision_authorizations
      ADD CONSTRAINT business_decision_authorizations_status_check
      CHECK (status IN ('active', 'inactive'));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'business_decision_authorizations_deactivation_check'
  ) THEN
    ALTER TABLE business_decision_authorizations
      ADD CONSTRAINT business_decision_authorizations_deactivation_check
      CHECK (status <> 'active' OR deactivated_at IS NULL);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS business_decision_evidence_drafts (
  id TEXT PRIMARY KEY,
  business_type TEXT NOT NULL,
  business_id TEXT NOT NULL,
  decision_scope TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  created_by TEXT NOT NULL REFERENCES users(id),
  revision INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  consumed_by_decision_id TEXT REFERENCES business_decision_records(id),
  CHECK (decision_scope IN (
    'order_priority',
    'production_schedule',
    'raw_material_purchase',
    'fulfillment_quantity_variance',
    'statement_variance',
    'statement_write_off'
  )),
  CHECK (status IN ('pending', 'consumed', 'voided')),
  CHECK (revision >= 1),
  CHECK (
    (status = 'consumed' AND consumed_by_decision_id IS NOT NULL)
    OR (status <> 'consumed' AND consumed_by_decision_id IS NULL)
  )
);

ALTER TABLE business_decision_records
  ADD COLUMN IF NOT EXISTS evidence_draft_id TEXT REFERENCES business_decision_evidence_drafts(id);

CREATE OR REPLACE FUNCTION erp_consume_business_decision_evidence_draft()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  draft_record business_decision_evidence_drafts%ROWTYPE;
  expected_count INTEGER;
  valid_count INTEGER;
BEGIN
  IF NEW.evidence_draft_id IS NULL OR NEW.evidence_draft_id = '' THEN
    IF jsonb_array_length(NEW.evidence_attachment_ids_json) > 0 THEN
      RAISE EXCEPTION 'ERP_BUSINESS_DECISION_EVIDENCE_DRAFT_REQUIRED';
    END IF;
    RETURN NEW;
  END IF;

  SELECT * INTO draft_record
  FROM business_decision_evidence_drafts
  WHERE id = NEW.evidence_draft_id
  FOR UPDATE;

  IF NOT FOUND OR draft_record.status <> 'pending' THEN
    RAISE EXCEPTION 'ERP_BUSINESS_DECISION_EVIDENCE_DRAFT_NOT_PENDING';
  END IF;
  IF draft_record.business_type <> NEW.business_type
     OR draft_record.business_id <> NEW.business_id
     OR draft_record.decision_scope <> NEW.decision_scope THEN
    RAISE EXCEPTION 'ERP_BUSINESS_DECISION_EVIDENCE_DRAFT_TARGET_MISMATCH';
  END IF;

  SELECT COUNT(DISTINCT attachment_id) INTO expected_count
  FROM jsonb_array_elements_text(NEW.evidence_attachment_ids_json) AS evidence_id(attachment_id);
  SELECT COUNT(DISTINCT attachment.id) INTO valid_count
  FROM attachments AS attachment
  JOIN attachment_links AS link ON link.attachment_id = attachment.id
  WHERE link.owner_type = 'business_decision_evidence_draft'
    AND link.owner_id = NEW.evidence_draft_id
    AND link.purpose = 'business_decision_evidence'
    AND attachment.id IN (
      SELECT attachment_id FROM jsonb_array_elements_text(NEW.evidence_attachment_ids_json) AS evidence_id(attachment_id)
    )
    AND attachment.status = 'uploaded'
    AND attachment.has_content = true
    AND attachment.uploaded_by IS NOT NULL
    AND attachment.uploaded_by <> ''
    AND COALESCE(attachment.file_size_bytes, 0) > 0
    AND attachment.file_size_bytes <= 15728640
    AND attachment.file_type IN ('image', 'pdf', 'document', 'spreadsheet');

  IF expected_count > 5 OR expected_count <> jsonb_array_length(NEW.evidence_attachment_ids_json) OR expected_count <> valid_count THEN
    RAISE EXCEPTION 'ERP_BUSINESS_DECISION_EVIDENCE_ATTACHMENT_INVALID';
  END IF;

  UPDATE business_decision_evidence_drafts
  SET status = 'consumed',
      consumed_by_decision_id = NEW.id,
      revision = revision + 1,
      updated_at = NEW.entered_at
  WHERE id = NEW.evidence_draft_id AND status = 'pending';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ERP_BUSINESS_DECISION_EVIDENCE_DRAFT_CONCURRENTLY_CONSUMED';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_consume_business_decision_evidence_draft ON business_decision_records;
CREATE TRIGGER trg_consume_business_decision_evidence_draft
AFTER INSERT ON business_decision_records
FOR EACH ROW EXECUTE FUNCTION erp_consume_business_decision_evidence_draft();

CREATE INDEX IF NOT EXISTS idx_business_decision_authorizations_employee_scope
  ON business_decision_authorizations (employee_id, decision_scope, status, active_from, active_to);
CREATE INDEX IF NOT EXISTS idx_business_decision_authorizations_status_effective
  ON business_decision_authorizations (status, active_from, active_to);
CREATE INDEX IF NOT EXISTS idx_business_decision_evidence_drafts_business
  ON business_decision_evidence_drafts (business_type, business_id, decision_scope, status);
CREATE INDEX IF NOT EXISTS idx_business_decision_evidence_drafts_creator
  ON business_decision_evidence_drafts (created_by, status, updated_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_business_decision_records_evidence_draft
  ON business_decision_records (evidence_draft_id)
  WHERE evidence_draft_id IS NOT NULL;
