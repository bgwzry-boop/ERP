-- D01: exact receipt confirmation is distinct from an operating allowance decision.
ALTER TABLE statement_write_off_records ALTER COLUMN business_decision_id DROP NOT NULL;
ALTER TABLE statement_write_off_records ADD COLUMN settlement_kind TEXT NOT NULL DEFAULT 'authorized';
ALTER TABLE statement_write_off_records ADD COLUMN receipt_confirmation_json JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE statement_write_off_records ADD CONSTRAINT statement_exact_payment_kind_guard CHECK (
  (settlement_kind = 'authorized' AND business_decision_id IS NOT NULL)
  OR (settlement_kind = 'office_exact_payment' AND business_decision_id IS NULL
    AND receivable_snapshot > 0 AND received_snapshot = receivable_snapshot
    AND variance_snapshot = 0 AND write_off_amount = 0
    AND COALESCE(receipt_confirmation_json ->> 'schema', '') = 'office-exact-payment-v1'
    AND COALESCE(receipt_confirmation_json ->> 'paymentRecordId', '') <> ''
    AND COALESCE(receipt_confirmation_json ->> 'customerConfirmationRecordId', '') <> ''
    AND COALESCE(receipt_confirmation_json ->> 'paymentAttachmentId', '') <> ''
    AND COALESCE(receipt_confirmation_json ->> 'customerAttachmentId', '') <> ''
    AND receipt_confirmation_json ->> 'paymentAttachmentId' <> receipt_confirmation_json ->> 'customerAttachmentId'
    AND COALESCE(receipt_confirmation_json ->> 'operatorId', '') = recorded_by)
);
