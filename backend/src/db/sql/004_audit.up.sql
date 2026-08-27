-- 004_audit.up.sql — append-only audit trail (I4, per design #911 LAB-08 + #913)
-- Idempotent: CREATE IF NOT EXISTS / DROP TRIGGER IF EXISTS.
-- Append-only trigger reuses forbid_ledger_mutation() from 003_movements.up.sql
-- (never dropped here — it is owned by the movements migration).

CREATE TABLE IF NOT EXISTS audit_log (
  id BIGSERIAL PRIMARY KEY,
  actor_type TEXT NOT NULL CHECK (actor_type IN ('user','system','anonymous')),
  actor_user_id UUID REFERENCES users(id),
  action TEXT NOT NULL,                  -- 'auth.login.success', 'catalog.product.create', ...
  entity_type TEXT,
  entity_id TEXT,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,   -- NEVER passwords/tokens/hashes (AUD-6)
  ip TEXT,
  user_agent TEXT,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_actor ON audit_log(actor_user_id);
CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_log(action);
CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_log(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_occurred ON audit_log(occurred_at);

-- Defense-in-depth append-only (AUD-4): the app layer never issues
-- UPDATE/DELETE on audit_log; the trigger raises regardless.
DROP TRIGGER IF EXISTS trg_audit_append_only ON audit_log;
CREATE TRIGGER trg_audit_append_only
  BEFORE UPDATE OR DELETE ON audit_log FOR EACH ROW EXECUTE FUNCTION forbid_ledger_mutation();