import type { Express } from 'express'
import type { Pool } from 'pg'
import request from 'supertest'

/**
 * I2 test bootstrap: catalog references + movement registration via the real
 * API (the catalog slice is already covered by its own suites). Each helper
 * throws with the response body on failure so a setup error is not silent.
 */

export async function createProduct(
  app: Express,
  token: string,
  sku: string,
  name = 'Demo Product',
): Promise<string> {
  const res = await request(app)
    .post('/api/products')
    .set('Authorization', `Bearer ${token}`)
    .send({ sku, name, unit: 'unit', price: '10.00' })
  if (res.status !== 201) {
    throw new Error(`createProduct failed: ${res.status} ${JSON.stringify(res.body)}`)
  }
  return res.body.product.id as string
}

export async function createWarehouse(
  app: Express,
  token: string,
  code: string,
  name?: string,
): Promise<string> {
  const res = await request(app)
    .post('/api/warehouses')
    .set('Authorization', `Bearer ${token}`)
    .send({ name: name ?? `Warehouse ${code}`, code })
  if (res.status !== 201) {
    throw new Error(`createWarehouse failed: ${res.status} ${JSON.stringify(res.body)}`)
  }
  return res.body.warehouse.id as string
}

export async function registerMovement(
  app: Express,
  token: string,
  body: Record<string, unknown>,
): Promise<request.Response> {
  return request(app).post('/api/movements').set('Authorization', `Bearer ${token}`).send(body)
}

/** Derived stock for a product+warehouse via the same SUM expression the service uses. */
export async function stockAt(pool: Pool, productId: string, warehouseId: string): Promise<string> {
  const { rows } = await pool.query(
    `SELECT COALESCE(SUM(quantity * sign), 0)::text AS stock
     FROM movements WHERE product_id = $1 AND warehouse_id = $2`,
    [productId, warehouseId],
  )
  return (rows[0] as { stock: string }).stock
}

export async function movementCount(pool: Pool): Promise<number> {
  const { rows } = await pool.query(`SELECT COUNT(*)::int AS n FROM movements`)
  return (rows[0] as { n: number }).n
}