-- Align the database evidence gate with the shared 30MB / 50MB / 200MB upload policy.
-- This replaces only the evidence-draft validation function; existing records are unchanged.

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
    AND attachment.file_size_bytes <= 52428800
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
