import crypto from 'node:crypto'
import type { Express } from 'express'
import type { Pool } from 'pg'
import { createApp } from '../../src/app.ts'
import { createTestPool } from './db.ts'

export interface TestContext {
  app: Express
  pool: Pool
  jwtSecret: string
  cookieSecret: string
}

/** Fresh app + pool per test context; secrets generated per run (never hardcoded). */
export function createTestContext(): TestContext {
  const jwtSecret = crypto.randomBytes(32).toString('hex')
  const cookieSecret = crypto.randomBytes(32).toString('hex')
  const pool = createTestPool()
  const app = createApp({
    db: pool,
    config: { jwtSecret, cookieSecret, isProduction: false, corsOrigin: 'http://localhost:5173' },
  })
  return { app, pool, jwtSecret, cookieSecret }
}