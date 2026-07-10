-- V1 core migration draft: customers and master data.
-- Customer names are intentionally not globally unique; duplicate contacts only create prompts.

CREATE TABLE IF NOT EXISTS price_tables (
  id TEXT PRIMARY KEY,
  biz_no TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  version_no INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'active',
  effective_from TIMESTAMPTZ,
  effective_to TIMESTAMPTZ,
  created_by TEXT REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS customers (
  id TEXT PRIMARY KEY,
  biz_no TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  short_name TEXT,
  settlement_cycle TEXT NOT NULL DEFAULT '未设置',
  price_table_id TEXT REFERENCES price_tables(id),
  risk_status TEXT NOT NULL DEFAULT '正常',
  debt_amount_snapshot NUMERIC(14, 2) NOT NULL DEFAULT 0,
  enabled BOOLEAN NOT NULL DEFAULT true,
  created_by TEXT REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS customer_contacts (
  id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL REFERENCES customers(id),
  contact_name TEXT,
  phone TEXT,
  role TEXT,
  is_default BOOLEAN NOT NULL DEFAULT false,
  remark TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS customer_addresses (
  id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL REFERENCES customers(id),
  contact_id TEXT REFERENCES customer_contacts(id),
  address TEXT NOT NULL,
  area TEXT,
  default_fulfillment_method TEXT,
  is_default BOOLEAN NOT NULL DEFAULT false,
  remark TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS customer_notes (
  id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL REFERENCES customers(id),
  note_type TEXT NOT NULL,
  content TEXT NOT NULL,
  visible_to TEXT NOT NULL DEFAULT 'office',
  created_by TEXT REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS standard_colors (
  id TEXT PRIMARY KEY,
  color_key TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS color_aliases (
  id TEXT PRIMARY KEY,
  alias TEXT NOT NULL,
  standard_color_id TEXT NOT NULL REFERENCES standard_colors(id),
  source_type TEXT NOT NULL DEFAULT 'global',
  source_id TEXT,
  enabled BOOLEAN NOT NULL DEFAULT true,
  created_by TEXT REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(alias, source_type, source_id)
);

CREATE TABLE IF NOT EXISTS size_specs (
  id TEXT PRIMARY KEY,
  size_key TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  width_mm NUMERIC(10, 2),
  height_mm NUMERIC(10, 2),
  gusset_mm NUMERIC(10, 2),
  seam_mm NUMERIC(10, 2),
  enabled BOOLEAN NOT NULL DEFAULT true,
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS finished_goods_styles (
  id TEXT PRIMARY KEY,
  style_key TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT true,
  allowed_size_keys TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS price_table_items (
  id TEXT PRIMARY KEY,
  price_table_id TEXT NOT NULL REFERENCES price_tables(id),
  size_key TEXT,
  standard_color_id TEXT REFERENCES standard_colors(id),
  handle_type TEXT,
  style_key TEXT,
  bag_price NUMERIC(14, 4) NOT NULL DEFAULT 0,
  print_price NUMERIC(14, 4) NOT NULL DEFAULT 0,
  other_fee NUMERIC(14, 2) NOT NULL DEFAULT 0,
  min_qty INTEGER,
  enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_customers_name ON customers(name);
CREATE INDEX IF NOT EXISTS idx_customers_short_name ON customers(short_name);
CREATE INDEX IF NOT EXISTS idx_customers_enabled ON customers(enabled);
CREATE INDEX IF NOT EXISTS idx_customer_contacts_phone ON customer_contacts(phone);
CREATE INDEX IF NOT EXISTS idx_customer_contacts_customer ON customer_contacts(customer_id);
CREATE INDEX IF NOT EXISTS idx_customer_addresses_customer ON customer_addresses(customer_id);
CREATE INDEX IF NOT EXISTS idx_color_aliases_standard_color ON color_aliases(standard_color_id);
CREATE INDEX IF NOT EXISTS idx_price_table_items_price_table ON price_table_items(price_table_id);
