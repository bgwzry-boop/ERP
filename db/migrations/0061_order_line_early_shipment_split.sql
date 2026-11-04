-- P2-03 (owner 2026-11-04): an unfinished custom order may ship what is already made today; the
-- rest is split onto a follow-up ("续做") order line that ships later. The follow-up line points
-- back at the line it came from, so the order, statement and customer views can show them together.
ALTER TABLE order_lines
  ADD COLUMN IF NOT EXISTS split_from_order_line_id TEXT REFERENCES order_lines(id);

CREATE INDEX IF NOT EXISTS idx_order_lines_split_from
  ON order_lines (split_from_order_line_id) WHERE split_from_order_line_id IS NOT NULL;
