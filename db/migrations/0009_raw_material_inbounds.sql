CREATE TABLE IF NOT EXISTS raw_material_inbounds (
  id TEXT PRIMARY KEY,
  delivery_note_no TEXT NOT NULL DEFAULT '',
  supplier_name TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT '',
  payload_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_raw_material_inbounds_status
  ON raw_material_inbounds (status);

CREATE INDEX IF NOT EXISTS idx_raw_material_inbounds_delivery_note_no
  ON raw_material_inbounds (delivery_note_no);

CREATE INDEX IF NOT EXISTS idx_raw_material_inbounds_supplier_name
  ON raw_material_inbounds (supplier_name);

CREATE INDEX IF NOT EXISTS idx_raw_material_inbounds_payload_gin
  ON raw_material_inbounds USING gin (payload_json);
