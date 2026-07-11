-- Version mutable rows touched by order-line void and quantity-adjustment transactions.

ALTER TABLE inventory_reservations
  ADD COLUMN IF NOT EXISTS revision INTEGER NOT NULL DEFAULT 1;

ALTER TABLE statement_lines
  ADD COLUMN IF NOT EXISTS revision INTEGER NOT NULL DEFAULT 1;
