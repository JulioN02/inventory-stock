-- 004_audit.down.sql
-- forbid_ledger_mutation() is NOT dropped here — it is owned by 003_movements.
DROP TRIGGER IF EXISTS trg_audit_append_only ON audit_log;
DROP TABLE IF EXISTS audit_log CASCADE;