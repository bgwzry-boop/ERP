CREATE TABLE IF NOT EXISTS raw_material_supplier_statement_reviews (
  id TEXT PRIMARY KEY,
  supplier_name TEXT NOT NULL DEFAULT '',
  file_name TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT '',
  review_status TEXT NOT NULL DEFAULT '',
  payload_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_raw_material_supplier_statement_reviews_supplier_name
  ON raw_material_supplier_statement_reviews (supplier_name);

CREATE INDEX IF NOT EXISTS idx_raw_material_supplier_statement_reviews_status
  ON raw_material_supplier_statement_reviews (status);

CREATE INDEX IF NOT EXISTS idx_raw_material_supplier_statement_reviews_review_status
  ON raw_material_supplier_statement_reviews (review_status);

CREATE INDEX IF NOT EXISTS idx_raw_material_supplier_statement_reviews_payload_gin
  ON raw_material_supplier_statement_reviews USING gin (payload_json);
