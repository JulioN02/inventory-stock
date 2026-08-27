import type { Db } from '../../../db/pool.ts'

export interface WarehouseRecord {
  id: string
  name: string
  code: string
  active: boolean
  created_at: Date
  updated_at: Date
}

export interface WarehouseListResult {
  items: WarehouseRecord[]
  total: number
}

export async function createWarehouse(
  db: Db,
  input: { name: string; code: string },
): Promise<WarehouseRecord> {
  const { rows } = await db.query(
    `INSERT INTO warehouses (name, code) VALUES ($1, $2) RETURNING *`,
    [input.name, input.code],
  )
  return rows[0] as WarehouseRecord
}

export async function updateWarehouse(
  db: Db,
  id: string,
  patch: { name?: string; code?: string },
): Promise<WarehouseRecord | null> {
  const fields: Array<[string, unknown]> = [
    ['name', patch.name],
    ['code', patch.code],
  ]
  const sets: string[] = []
  const values: unknown[] = []
  for (const [column, value] of fields) {
    if (value !== undefined) {
      values.push(value)
      sets.push(`${column} = $${values.length}`)
    }
  }
  if (sets.length === 0) return null
  values.push(id)
  const { rows } = await db.query(
    `UPDATE warehouses SET ${sets.join(', ')}, updated_at = now() WHERE id = $${values.length} RETURNING *`,
    values,
  )
  return (rows[0] as WarehouseRecord | undefined) ?? null
}

export async function listWarehouses(
  db: Db,
  opts: { includeInactive: boolean; page: number; pageSize: number },
): Promise<WarehouseListResult> {
  const where = opts.includeInactive ? '' : 'WHERE active = true'
  const offset = (opts.page - 1) * opts.pageSize
  const count = await db.query(`SELECT COUNT(*)::int AS total FROM warehouses ${where}`)
  const data = await db.query(
    `SELECT * FROM warehouses ${where} ORDER BY created_at ASC, id ASC LIMIT $1 OFFSET $2`,
    [opts.pageSize, offset],
  )
  return { items: data.rows as WarehouseRecord[], total: (count.rows[0] as { total: number }).total }
}

export async function deactivateWarehouse(db: Db, id: string): Promise<WarehouseRecord | null> {
  const { rows } = await db.query(
    `UPDATE warehouses SET active = false, updated_at = now() WHERE id = $1 RETURNING *`,
    [id],
  )
  return (rows[0] as WarehouseRecord | undefined) ?? null
}