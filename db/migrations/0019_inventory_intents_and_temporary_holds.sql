-- Persist stock inquiries and temporary holds before a formal order line exists.

CREATE TABLE IF NOT EXISTS inventory_intents (
  id TEXT PRIMARY KEY,
  source_draft_id TEXT NOT NULL REFERENCES order_drafts(id),
  source_message_id TEXT NOT NULL,
  conversation_id TEXT NOT NULL DEFAULT '',
  customer_id TEXT REFERENCES customers(id),
  intent_type TEXT NOT NULL,
  intent_status TEXT NOT NULL,
  source_text TEXT NOT NULL DEFAULT '',
  candidate_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  cancellation_scope TEXT,
  related_reservation_id TEXT,
  related_order_line_id TEXT REFERENCES order_lines(id),
  revision INTEGER NOT NULL DEFAULT 1,
  created_by TEXT REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(source_draft_id, source_message_id, intent_type)
);

ALTER TABLE inventory_reservations
  ALTER COLUMN order_line_id DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS source_intent_id TEXT REFERENCES inventory_intents(id),
  ADD COLUMN IF NOT EXISTS customer_id TEXT REFERENCES customers(id),
  ADD COLUMN IF NOT EXISTS source_message_id TEXT,
  ADD COLUMN IF NOT EXISTS metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'inventory_reservations_order_or_intent_check'
  ) THEN
    ALTER TABLE inventory_reservations
      ADD CONSTRAINT inventory_reservations_order_or_intent_check
      CHECK (order_line_id IS NOT NULL OR source_intent_id IS NOT NULL);
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_inventory_reservations_active_intent
  ON inventory_reservations(source_intent_id)
  WHERE source_intent_id IS NOT NULL AND status = '生效';

CREATE INDEX IF NOT EXISTS idx_inventory_intents_status_created
  ON inventory_intents(intent_status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_inventory_intents_customer_status
  ON inventory_intents(customer_id, intent_status);

CREATE INDEX IF NOT EXISTS idx_inventory_reservations_temporary_expiry
  ON inventory_reservations(expires_at)
  WHERE reservation_type = '临时留货' AND status = '生效';
