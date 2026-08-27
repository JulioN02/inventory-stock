-- 003_movements.up.sql — immutable movement ledger + derived stock (I2, per design #911)
-- Stock is NEVER stored (MOV-4): derived via SQL SUM over append-only movements.
-- NOTE (recut): purchase_order_line_id is OMITTED — purchasing (I3) was cut.
-- Idempotent: CREATE IF NOT EXISTS / CREATE OR REPLACE / DROP TRIGGER IF EXISTS.

CREATE TABLE IF NOT EXISTS movements (
  id BIGSERIAL PRIMARY KEY,
  product_id UUID NOT NULL REFERENCES products(id),
  warehouse_id UUID NOT NULL REFERENCES warehouses(id),
  quantity NUMERIC(12,1) NOT NULL CHECK (quantity > 0),   -- always positive magnitude
  sign SMALLINT NOT NULL CHECK (sign IN (1,-1)),          -- direction: SUM = quantity * sign
  type TEXT NOT NULL CHECK (type IN ('receiving','sale','transfer_in','transfer_out','adjustment')),
  CHECK (                                                    -- sign/type coherence (D3)
    (type IN ('receiving','transfer_in') AND sign = 1) OR
    (type IN ('sale','transfer_out') AND sign = -1) OR
    (type = 'adjustment')                                    -- adjustment: sign ±1
  ),
  unit_price NUMERIC(12,2),                                -- cost basis (receiving/sale), else NULL
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  idempotency_key UUID UNIQUE,                             -- user-supplied; primary row of an operation; NULL on secondary rows (PG UNIQUE treats NULLs as distinct)
  operation_group_id UUID,                                 -- links rows of one multi-row op (transfer); = idempotency_key for transfers
  request_hash CHAR(64),                                   -- SHA-256 hex of canonical payload (LAB-02)
  actor_user_id UUID REFERENCES users(id),
  reference TEXT,                                          -- optional notes / adjustment reason
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_movements_product ON movements(product_id);
CREATE INDEX IF NOT EXISTS idx_movements_warehouse ON movements(warehouse_id);
CREATE INDEX IF NOT EXISTS idx_movements_occurred ON movements(occurred_at);
CREATE INDEX IF NOT EXISTS idx_movements_product_warehouse ON movements(product_id, warehouse_id);
CREATE INDEX IF NOT EXISTS idx_movements_group ON movements(operation_group_id);
CREATE INDEX IF NOT EXISTS idx_movements_type ON movements(type);

-- Derived stock — SQL aggregation (decision D2): always current, never materialized.
CREATE OR REPLACE VIEW stock_levels AS
  SELECT product_id, warehouse_id, SUM(quantity * sign) AS stock
  FROM movements GROUP BY product_id, warehouse_id;

-- Defense-in-depth immutability (MOV-9): corrections are NEW adjustment rows,
-- never UPDATE/DELETE. Reused by audit_log in I4.
CREATE OR REPLACE FUNCTION forbid_ledger_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'movements are append-only: UPDATE/DELETE forbidden';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_movements_append_only ON movements;
CREATE TRIGGER trg_movements_append_only
  BEFORE UPDATE OR DELETE ON movements FOR EACH ROW EXECUTE FUNCTION forbid_ledger_mutation();