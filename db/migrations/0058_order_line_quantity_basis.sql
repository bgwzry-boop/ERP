-- Owner decision 2026-11-03: a peer may bring rolls of cloth to print without saying how many
-- pieces ("送来 10 卷料印"). Such an external-print line is ordered by incoming rolls; its
-- quantity is only known when printing is done, and the price tier follows the actual good prints.
ALTER TABLE order_lines
  ADD COLUMN IF NOT EXISTS qty_basis TEXT NOT NULL DEFAULT 'pieces',
  ADD COLUMN IF NOT EXISTS incoming_roll_count INTEGER;

ALTER TABLE order_lines
  ADD CONSTRAINT order_lines_qty_basis_check CHECK (qty_basis IN ('pieces', 'incoming_rolls')),
  ADD CONSTRAINT order_lines_incoming_roll_count_check CHECK (
    (qty_basis = 'pieces' AND incoming_roll_count IS NULL)
    OR (qty_basis = 'incoming_rolls' AND incoming_roll_count BETWEEN 1 AND 9999 AND original_qty = 0)
  );
