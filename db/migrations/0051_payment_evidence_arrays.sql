-- Keep every authenticated receipt attachment and migrate the historical first attachment.
ALTER TABLE payment_records ADD COLUMN IF NOT EXISTS evidence_attachment_ids JSONB NOT NULL DEFAULT '[]'::jsonb;
UPDATE payment_records SET evidence_attachment_ids = jsonb_build_array(evidence_attachment_id)
WHERE evidence_attachment_id IS NOT NULL AND evidence_attachment_id <> '' AND evidence_attachment_ids = '[]'::jsonb;
ALTER TABLE payment_records ADD CONSTRAINT payment_evidence_ids_valid CHECK (
  jsonb_typeof(evidence_attachment_ids) = 'array'
  AND NOT jsonb_path_exists(evidence_attachment_ids, '$[*] ? (@.type() != "string" || @ == "")')
);
