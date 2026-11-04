-- P2-03 (owner 2026-11-04): an unfinished custom order may ship what is made by the end of the day
-- ("出多少发多少"); the rest is split onto a follow-up ("续做") order line that ships later.
-- The follow-up line points back at the line it came from, so the order, delivery notes and the
-- customer's view show every batch of one order item together.
ALTER TABLE order_lines
  ADD COLUMN IF NOT EXISTS split_from_order_line_id TEXT REFERENCES order_lines(id);

CREATE INDEX IF NOT EXISTS idx_order_lines_split_from
  ON order_lines (split_from_order_line_id) WHERE split_from_order_line_id IS NOT NULL;

-- Whether, how much and how to ship is the customer's call (they send their own courier). The
-- office tells the customer how many are made; when the customer wants today's part, the office
-- records it here ("有多少发多少" = no cap, or at most N). The packers then pack whole packages and the
-- split ships exactly what was packed. The record is cleared when the split happens.
ALTER TABLE production_tasks
  ADD COLUMN IF NOT EXISTS early_ship_requested_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS early_ship_requested_by TEXT REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS early_ship_note TEXT,
  ADD COLUMN IF NOT EXISTS early_ship_max_qty INTEGER CHECK (early_ship_max_qty IS NULL OR early_ship_max_qty > 0);
