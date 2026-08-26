import 'dotenv/config'
import { createPool } from '../../src/db/pool.ts'
import type { Pool } from 'pg'

/** Derives the test database URL from DATABASE_URL (decision D10: same container). */
export function testDatabaseUrl(): string {
  const url = new URL(
    process.env.DATABASE_URL ?? 'postgres://postgres:postgres@localhost:55434/inventory_stock',
  )
  url.pathname = '/inventory_stock_test'
  return url.toString()
}

export function createTestPool(): Pool {
  return createPool(testDatabaseUrl())
}

const TRUNCATE_TABLES = 'refresh_tokens, user_roles, users, products, warehouses'

/**
 * Resets runtime data between tests. Roles/permissions stay seeded by the
 * migration (truncated tables are only runtime-owned rows).
 */
export async function resetDatabase(pool: Pool): Promise<void> {
  await pool.query(`TRUNCATE TABLE ${TRUNCATE_TABLES} RESTART IDENTITY CASCADE`)
}