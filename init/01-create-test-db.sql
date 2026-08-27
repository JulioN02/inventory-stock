-- Test database lives in the SAME container as the dev database (decision D10).
-- The docker-entrypoint runs this file only on first initialization (fresh volume).
CREATE DATABASE inventory_stock_test;