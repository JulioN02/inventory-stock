import type { Db } from '../../../db/pool.ts'

export interface ProductRecord {
  id: string
  sku: string
  name: string
  unit: string
  price: string
  active: boolean
  created_at: Date
  updated_at: Date
}

export interface ProductListResult {
  items: ProductRecord[]
  total: number
}

export async function createProduct(
  db: Db,
  input: { sku: string; name: string; unit: string; price: string },
): Promise<ProductRecord> {
  const { rows } = await db.query(
    `INSERT INTO products (sku, name, unit, price) VALUES ($1, $2, $3, $4) RETURNING *`,
    [input.sku, input.name, input.unit, input.price],
  )
  return rows[0] as ProductRecord
}

export async function updateProduct(
  db: Db,
  id: string,
  patch: { sku?: string; name?: string; unit?: string; price?: string },
): Promise<ProductRecord | null> {
  const fields: Array<[string, unknown]> = [
    ['sku', patch.sku],
    ['name', patch.name],
    ['unit', patch.unit],
    ['price', patch.price],
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
    `UPDATE products SET ${sets.join(', ')}, updated_at = now() WHERE id = $${values.length} RETURNING *`,
    values,
  )
  return (rows[0] as ProductRecord | undefined) ?? null
}

export async function listProducts(
  db: Db,
  opts: { search?: string; includeInactive: boolean; page: number; pageSize: number },
): Promise<ProductListResult> {
  const where: string[] = []
  const values: unknown[] = []
  if (!opts.includeInactive) where.push('active = true')
  if (opts.search) {
    values.push(`%${opts.search}%`)
    where.push(`(sku ILIKE $${values.length} OR name ILIKE $${values.length})`)
  }
  const whereSql = where.length > 0 ? `WHERE ${where.join(' AND ')}` : ''
  const offset = (opts.page - 1) * opts.pageSize

  const count = await db.query(`SELECT COUNT(*)::int AS total FROM products ${whereSql}`, values)
  const data = await db.query(
    `SELECT * FROM products ${whereSql} ORDER BY created_at ASC, id ASC
     LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
    [...values, opts.pageSize, offset],
  )
  return { items: data.rows as ProductRecord[], total: (count.rows[0] as { total: number }).total }
}

export async function deactivateProduct(db: Db, id: string): Promise<ProductRecord | null> {
  const { rows } = await db.query(
    `UPDATE products SET active = false, updated_at = now() WHERE id = $1 RETURNING *`,
    [id],
  )
  return (rows[0] as ProductRecord | undefined) ?? null
}