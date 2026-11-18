-- Payment records contain cumulative receipts, not new receipt amounts.
-- Capture the immediately preceding balance for new registrations and leave
-- older rows untouched so the existing audit trail can still be reconciled.
ALTER TABLE payment_records
  ADD COLUMN IF NOT EXISTS statement_received_before NUMERIC(14, 2);
