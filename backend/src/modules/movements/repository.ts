import type { Db } from '../../db/pool.ts'
import type { MovementSign } from './logic.ts'

export interface MovementRecord {
  id: string // BIGSERIAL → string (pg int8)
  product_id: string
  warehouse_id: string
  quantity: string // NUMERIC → string (D13)
  sign: number
  type: string
  unit_price: string | null
  occurred_at: Date
  idempotency_key: string | null
  operation_group_id: string | null
  request_hash: string | null
  actor_user_id: string | null
  reference: string | null
  created_at: Date
}

export interface MovementInsertInput {
  productId: string
  warehouseId: string
  quantity: string
  sign: MovementSign
  type: string
  idempotencyKey: string | null
  operationGroupId: string | null
  requestHash: string
  actorUserId: string
  unitPrice?: string | null
  reference?: string | null
}

/** Ledger row joined with catalog names (GET /api/movements). */
export interface MovementListRecord extends MovementRecord {
  sku: string
  warehouse_code: string
}

export interface MovementListResult {
  items: MovementListRecord[]
  total: number
}

/**
 * LAB-02 idempotent insert: INSERT ON CONFLICT (idempotency_key) DO NOTHING
 * RETURNING — a returned row means "new operation", no row means "key exists".
 */
export async function insertMovementIfAbsent(
  db: Db,
  input: MovementInsertInput,
): Promise<MovementRecord | null> {
  const { rows } = await db.query(
    `INSERT INTO movements
       (product_id, warehouse_id, quantity, sign, type, idempotency_key,
        operation_group_id, request_hash, actor_user_id, unit_price, reference)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
     ON CONFLICT (idempotency_key) DO NOTHING
     RETURNING *`,
    [
      input.productId,
      input.warehouseId,
      input.quantity,
      input.sign,
      input.type,
      input.idempotencyKey,
      input.operationGroupId,
      input.requestHash,
      input.actorUserId,
      input.unitPrice ?? null,
      input.reference ?? null,
    ],
  )
  return (rows[0] as MovementRecord | undefined) ?? null
}

/** LAB-02 probe / race-loser re-read: existing primary row by key. */
export async function findByKey(db: Db, idempotencyKey: string): Promise<MovementRecord | null> {
  const { rows } = await db.query(
    `SELECT * FROM movements WHERE idempotency_key = $1`,
    [idempotencyKey],
  )
  return (rows[0] as MovementRecord | undefined) ?? null
}

/**
 * LAB-01 (D5): transaction-scoped advisory lock for one (product, warehouse).
 * Blocks concurrent writers; released automatically at COMMIT/ROLLBACK.
 */
export async function acquireProductLock(
  db: Db,
  productId: string,
  warehouseId: string,
): Promise<void> {
  await db.query(`SELECT pg_advisory_xact_lock(hashtextextended($1::text, 0))`, [
    `${productId}:${warehouseId}`,
  ])
}

/**
 * MOV-5: acquire MULTIPLE advisory locks in deterministic sorted order
 * (deadlock impossible). Keys are `product:warehouse` composites; sorting is
 * applied in SQL via ORDER BY on the VALUES list.
 */
export async function acquireProductLocksSorted(
  db: Db,
  locks: ReadonlyArray<{ productId: string; warehouseId: string }>,
): Promise<void> {
  if (locks.length === 0) return
  const keys = locks.map((lock) => `${lock.productId}:${lock.warehouseId}`)
  const placeholders = keys.map((_, index) => `$${index + 1}::text`).join(', ')
  await db.query(
    `SELECT pg_advisory_xact_lock(hashtextextended(t.k, 0))
     FROM (VALUES (${placeholders})) AS t(k)
     ORDER BY t.k`,
    keys,
  )
}

/** Inline SUM recheck inside the movement tx — sees the tx's own uncommitted rows. */
export async function currentStock(
  db: Db,
  productId: string,
  warehouseId: string,
): Promise<string> {
  const { rows } = await db.query(
    `SELECT COALESCE(SUM(quantity * sign), 0)::text AS stock
     FROM movements WHERE product_id = $1 AND warehouse_id = $2`,
    [productId, warehouseId],
  )
  return (rows[0] as { stock: string }).stock
}

/**
 * Catalog reference check: product and warehouse must exist and be active.
 * Returns null when either reference is missing.
 */
export async function checkReferences(
  db: Db,
  productId: string,
  warehouseId: string,
): Promise<{ productActive: boolean; warehouseActive: boolean } | null> {
  const { rows } = await db.query(
    `SELECT p.active AS product_active, w.active AS warehouse_active
     FROM products p
     JOIN warehouses w ON w.id = $2
     WHERE p.id = $1`,
    [productId, warehouseId],
  )
  const row = rows[0] as { product_active: boolean; warehouse_active: boolean } | undefined
  if (!row) return null
  return { productActive: row.product_active, warehouseActive: row.warehouse_active }
}

/** Transfer variant: product + BOTH warehouses must exist and be active. */
export async function checkTransferReferences(
  db: Db,
  productId: string,
  sourceWarehouseId: string,
  destinationWarehouseId: string,
): Promise<{ productActive: boolean; sourceActive: boolean; destinationActive: boolean } | null> {
  const { rows } = await db.query(
    `SELECT p.active AS product_active,
            w1.active AS source_active,
            w2.active AS destination_active
     FROM products p
     JOIN warehouses w1 ON w1.id = $2
     JOIN warehouses w2 ON w2.id = $3
     WHERE p.id = $1`,
    [productId, sourceWarehouseId, destinationWarehouseId],
  )
  const row = rows[0] as
    | { product_active: boolean; source_active: boolean; destination_active: boolean }
    | undefined
  if (!row) return null
  return {
    productActive: row.product_active,
    sourceActive: row.source_active,
    destinationActive: row.destination_active,
  }
}

/** Ledger list with filters + pagination (OQ-2). */
export async function listMovements(
  db: Db,
  opts: {
    type?: string
    productId?: string
    warehouseId?: string
    page: number
    pageSize: number
  },
): Promise<MovementListResult> {
  const where: string[] = []
  const values: unknown[] = []
  if (opts.type) {
    values.push(opts.type)
    where.push(`m.type = $${values.length}`)
  }
  if (opts.productId) {
    values.push(opts.productId)
    where.push(`m.product_id = $${values.length}`)
  }
  if (opts.warehouseId) {
    values.push(opts.warehouseId)
    where.push(`m.warehouse_id = $${values.length}`)
  }
  const whereSql = where.length > 0 ? `WHERE ${where.join(' AND ')}` : ''
  const offset = (opts.page - 1) * opts.pageSize

  const count = await db.query(
    `SELECT COUNT(*)::int AS total FROM movements m ${whereSql}`,
    values,
  )
  const data = await db.query(
    `SELECT m.*, p.sku, w.code AS warehouse_code
     FROM movements m
     JOIN products p ON p.id = m.product_id
     JOIN warehouses w ON w.id = m.warehouse_id
     ${whereSql}
     ORDER BY m.occurred_at DESC, m.id DESC
     LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
    [...values, opts.pageSize, offset],
  )
  return {
    items: data.rows as MovementListRecord[],
    total: (count.rows[0] as { total: number }).total,
  }
}

export interface StockRow {
  product_id: string
  sku: string
  name: string
  warehouse_id: string
  warehouse_code: string
  stock: string
}

/**
 * MOV-4: derived stock per product×warehouse via the stock_levels view,
 * zero-filled (OQ-5: stock 0 included), optional warehouse filter.
 */
export async function getStock(db: Db, warehouseId?: string): Promise<StockRow[]> {
  const { rows } = await db.query(
    `SELECT p.id AS product_id, p.sku, p.name,
            w.id AS warehouse_id, w.code AS warehouse_code,
            COALESCE(s.stock, 0)::text AS stock
     FROM products p
     CROSS JOIN warehouses w
     LEFT JOIN stock_levels s ON s.product_id = p.id AND s.warehouse_id = w.id
     WHERE p.active = true AND w.active = true
       AND ($1::uuid IS NULL OR w.id = $1)
     ORDER BY p.sku, w.code`,
    [warehouseId ?? null],
  )
  return rows as StockRow[]
}

export interface LowStockRow {
  product_id: string
  sku: string
  name: string
  stock: string
}

/**
 * MOV-7: products whose derived stock is STRICTLY below the threshold
 * (HAVING SUM < threshold — boundary excluded), aggregated across warehouses.
 */
export async function getLowStock(
  db: Db,
  opts: { threshold: number; warehouseId?: string },
): Promise<LowStockRow[]> {
  const { rows } = await db.query(
    `SELECT p.id AS product_id, p.sku, p.name,
            COALESCE(SUM(m.quantity * m.sign), 0)::text AS stock
     FROM products p
     LEFT JOIN movements m ON m.product_id = p.id
       AND ($2::uuid IS NULL OR m.warehouse_id = $2)
     WHERE p.active = true
     GROUP BY p.id, p.sku, p.name
     HAVING COALESCE(SUM(m.quantity * m.sign), 0) < $1::numeric
     ORDER BY p.sku`,
    [opts.threshold, opts.warehouseId ?? null],
  )
  return rows as LowStockRow[]
}