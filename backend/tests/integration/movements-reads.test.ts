import { beforeEach, test } from 'node:test'
import assert from 'node:assert/strict'
import request from 'supertest'
import { createTestContext } from '../helpers/testApp.ts'
import { resetDatabase } from '../helpers/db.ts'
import { createUser, loginAndGetToken } from '../helpers/users.ts'
import { createProduct, createWarehouse, registerMovement } from '../helpers/stock.ts'

const ctx = createTestContext()
beforeEach(async () => {
  await resetDatabase(ctx.pool)
})
test.after(async () => {
  await ctx.pool.end()
})

async function operatorToken(): Promise<string> {
  await createUser(ctx.pool, {
    username: 'op1',
    email: 'op1@test.local',
    password: 'Operator1',
    role: 'operator',
  })
  return loginAndGetToken(ctx.app, 'op1', 'Operator1')
}

async function seedStock(opts?: { sku?: string; whCode?: string; quantity?: string }): Promise<{
  token: string
  productId: string
  warehouseId: string
}> {
  const token = await operatorToken()
  const productId = await createProduct(ctx.app, token, opts?.sku ?? 'SKU-READ')
  const warehouseId = await createWarehouse(ctx.app, token, opts?.whCode ?? 'WH-READ')
  await registerMovement(ctx.app, token, {
    product_id: productId,
    warehouse_id: warehouseId,
    quantity: opts?.quantity ?? '5.0',
    type: 'receiving',
    idempotency_key: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  })
  return { token, productId, warehouseId }
}

const KEY_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const KEY_C = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'

test('MOV-4: GET /api/stock derives the SUM per product+warehouse (string numerics, scale 1)', async () => {
  const { token, productId, warehouseId } = await seedStock()
  // sale 2 of 5 → stock 3.0
  await registerMovement(ctx.app, token, {
    product_id: productId,
    warehouse_id: warehouseId,
    quantity: '2.0',
    type: 'sale',
    idempotency_key: KEY_B,
  })
  const res = await request(ctx.app).get('/api/stock').set('Authorization', `Bearer ${token}`)
  assert.equal(res.status, 200)
  const row = (res.body.items as Array<Record<string, string>>).find(
    (item) => item.product_id === productId && item.warehouse_id === warehouseId,
  )
  assert.ok(row, 'product+warehouse row present')
  assert.equal(row.stock, '3.0')
  assert.equal(typeof row.stock, 'string', 'numeric serialized as string (no float drift)')
  assert.equal(row.sku, 'SKU-READ')
  assert.equal(row.warehouse_code, 'WH-READ')
})

test('MOV-4: product with no movements → stock 0 (included, not absent)', async () => {
  const token = await operatorToken()
  const productId = await createProduct(ctx.app, token, 'SKU-NOMOV')
  const warehouseId = await createWarehouse(ctx.app, token, 'WH-NOMOV')
  const res = await request(ctx.app).get('/api/stock').set('Authorization', `Bearer ${token}`)
  const row = (res.body.items as Array<Record<string, string>>).find(
    (item) => item.product_id === productId && item.warehouse_id === warehouseId,
  )
  assert.ok(row, 'zero-stock row is present (OQ-5)')
  assert.equal(row.stock, '0')
})

test('MOV-4: warehouse filter → only that warehouse rows', async () => {
  const { token, productId } = await seedStock()
  const warehouseB = await createWarehouse(ctx.app, token, 'WH-B')
  await registerMovement(ctx.app, token, {
    product_id: productId,
    warehouse_id: warehouseB,
    quantity: '7.0',
    type: 'receiving',
    idempotency_key: KEY_C,
  })
  const res = await request(ctx.app)
    .get(`/api/stock?warehouse_id=${warehouseB}`)
    .set('Authorization', `Bearer ${token}`)
  assert.equal(res.status, 200)
  const items = res.body.items as Array<Record<string, string>>
  assert.ok(items.length > 0)
  assert.ok(items.every((item) => item.warehouse_id === warehouseB), 'all rows are for the filtered warehouse')
  const row = items.find((item) => item.product_id === productId)
  assert.equal(row?.stock, '7.0')
})

test('OQ-2: GET /api/movements lists the ledger with filters and pagination', async () => {
  const { token, productId, warehouseId } = await seedStock()
  await registerMovement(ctx.app, token, {
    product_id: productId,
    warehouse_id: warehouseId,
    quantity: '2.0',
    type: 'sale',
    idempotency_key: KEY_B,
  })
  await request(ctx.app)
    .post('/api/movements/adjustments')
    .set('Authorization', `Bearer ${token}`)
    .send({
      product_id: productId,
      warehouse_id: warehouseId,
      quantity: '1.0',
      reason: 'found one extra unit',
      idempotency_key: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
    })

  const all = await request(ctx.app).get('/api/movements').set('Authorization', `Bearer ${token}`)
  assert.equal(all.status, 200)
  assert.equal(all.body.total, 3)
  assert.equal(all.body.items.length, 3)

  const byType = await request(ctx.app)
    .get('/api/movements?type=sale')
    .set('Authorization', `Bearer ${token}`)
  assert.equal(byType.body.total, 1)
  assert.equal(byType.body.items[0].type, 'sale')

  const byProduct = await request(ctx.app)
    .get(`/api/movements?product_id=${productId}`)
    .set('Authorization', `Bearer ${token}`)
  assert.equal(byProduct.body.total, 3)

  const byWarehouse = await request(ctx.app)
    .get(`/api/movements?warehouse_id=${warehouseId}`)
    .set('Authorization', `Bearer ${token}`)
  assert.equal(byWarehouse.body.total, 3)

  const page = await request(ctx.app)
    .get('/api/movements?page=1&pageSize=2')
    .set('Authorization', `Bearer ${token}`)
  assert.equal(page.body.items.length, 2)
  assert.equal(page.body.page, 1)
  assert.equal(page.body.pageSize, 2)

  const ledgerRow = page.body.items[0] as Record<string, string>
  assert.equal(typeof ledgerRow.quantity, 'string')
  assert.ok('sku' in ledgerRow && 'warehouse_code' in ledgerRow, 'ledger rows join catalog names')
})

test('MOV-7: low stock — stock 3 < threshold 5 → included; stock 5 → excluded (strictly below)', async () => {
  const token = await operatorToken()
  const lowProduct = await createProduct(ctx.app, token, 'SKU-LOW')
  const lowWh = await createWarehouse(ctx.app, token, 'WH-LOW')
  await registerMovement(ctx.app, token, {
    product_id: lowProduct,
    warehouse_id: lowWh,
    quantity: '3.0',
    type: 'receiving',
    idempotency_key: KEY_B,
  })
  const okProduct = await createProduct(ctx.app, token, 'SKU-OK')
  await registerMovement(ctx.app, token, {
    product_id: okProduct,
    warehouse_id: lowWh,
    quantity: '5.0',
    type: 'receiving',
    idempotency_key: KEY_C,
  })

  const res = await request(ctx.app)
    .get('/api/stock/low?threshold=5')
    .set('Authorization', `Bearer ${token}`)
  assert.equal(res.status, 200)
  const skus = (res.body.items as Array<{ sku: string; stock: string }>).map((i) => i.sku)
  assert.ok(skus.includes('SKU-LOW'), 'stock 3 is strictly below threshold 5')
  assert.ok(!skus.includes('SKU-OK'), 'stock 5 is NOT below threshold 5 (boundary excluded)')
  const lowRow = (res.body.items as Array<{ sku: string; stock: string }>).find((i) => i.sku === 'SKU-LOW')
  assert.equal(lowRow?.stock, '3.0', 'included with current stock, string numeric')
})

test('MOV-7: no products below threshold → empty array', async () => {
  const { token } = await seedStock({ quantity: '5.0' })
  const res = await request(ctx.app)
    .get('/api/stock/low?threshold=1')
    .set('Authorization', `Bearer ${token}`)
  assert.equal(res.status, 200)
  assert.deepEqual(res.body.items, [], 'nothing strictly below threshold 1')
})

test('MOV-7: threshold defaults to 5 when omitted', async () => {
  const { token } = await seedStock({ quantity: '3.0' })
  const res = await request(ctx.app).get('/api/stock/low').set('Authorization', `Bearer ${token}`)
  assert.equal(res.status, 200)
  assert.equal((res.body.items as unknown[]).length, 1, 'stock 3 < default 5 → included')
})

test('AUTH-6: stock/movements reads require movements:read (viewer ok, auditor 403)', async () => {
  const { token, productId, warehouseId } = await seedStock()
  void token
  void productId
  void warehouseId
  await createUser(ctx.pool, {
    username: 'auditor1',
    email: 'auditor1@test.local',
    password: 'Auditor1',
    role: 'auditor',
  })
  const auditorToken = await loginAndGetToken(ctx.app, 'auditor1', 'Auditor1')
  const denied = await request(ctx.app).get('/api/stock').set('Authorization', `Bearer ${auditorToken}`)
  assert.equal(denied.status, 403)
  const deniedLedger = await request(ctx.app).get('/api/movements').set('Authorization', `Bearer ${auditorToken}`)
  assert.equal(deniedLedger.status, 403)

  await createUser(ctx.pool, {
    username: 'viewer2',
    email: 'viewer2@test.local',
    password: 'Viewer123',
    role: 'viewer',
  })
  const viewerToken = await loginAndGetToken(ctx.app, 'viewer2', 'Viewer123')
  const allowed = await request(ctx.app).get('/api/stock').set('Authorization', `Bearer ${viewerToken}`)
  assert.equal(allowed.status, 200, 'viewer has movements:read')
})