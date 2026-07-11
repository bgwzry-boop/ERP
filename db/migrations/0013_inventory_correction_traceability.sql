-- Persist the complete inventory-correction review linkage without changing stock.

ALTER TABLE inventory_correction_drafts
  ADD COLUMN IF NOT EXISTS todo_id TEXT REFERENCES todos(id);

ALTER TABLE inventory_correction_drafts
  ADD COLUMN IF NOT EXISTS remark TEXT;

ALTER TABLE inventory_correction_drafts
  ADD COLUMN IF NOT EXISTS attachment_ids JSONB NOT NULL DEFAULT '[]'::jsonb;

CREATE INDEX IF NOT EXISTS idx_inventory_correction_drafts_todo
  ON inventory_correction_drafts(todo_id);
