-- 002_catalog.up.sql — products + warehouses (I1, per design #911)
-- No quantity columns on products — stock is NEVER stored (MOV-4).
-- Soft deactivate only (CAT-4/CAT-6).

CREATE TABLE IF NOT EXISTS products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sku TEXT NOT NULL UNIQUE,                        -- normalized upper-case
  name TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 200),
  unit TEXT NOT NULL,                              -- const set kg|g|l|ml|unit|box|pair (DTO-validated)
  price NUMERIC(12,2) NOT NULL CHECK (price >= 0),
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS warehouses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  code TEXT NOT NULL UNIQUE,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);