-- 003_movements.down.sql
DROP TRIGGER IF EXISTS trg_movements_append_only ON movements;
DROP FUNCTION IF EXISTS forbid_ledger_mutation();
DROP VIEW IF EXISTS stock_levels;
DROP TABLE IF EXISTS movements CASCADE;