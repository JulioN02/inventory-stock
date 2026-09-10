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
const KEY_D = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'

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

// ── MOV-TRACE: running balance per ledger row ────────────────────────────────
// Receiving 5 → sale 2 → adjustment +1 (ledger order). Display order is
// (occurred_at DESC, id DESC), so the newest row comes first.

const KEY_ADJUST = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'

async function seedTraceHistory(): Promise<{ token: string; productId: string; warehouseId: string }> {
  const token = await operatorToken()
  const productId = await createProduct(ctx.app, token, 'SKU-TRACE')
  const warehouseId = await createWarehouse(ctx.app, token, 'WH-TRACE')
  await registerMovement(ctx.app, token, {
    product_id: productId,
    warehouse_id: warehouseId,
    quantity: '5.0',
    type: 'receiving',
    idempotency_key: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  })
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
      reason: 'count correction',
      idempotency_key: KEY_ADJUST,
    })
  return { token, productId, warehouseId }
}

function findLedgerRow(items: Array<Record<string, unknown>>, type: string): Record<string, unknown> {
  const row = items.find((item) => item.type === type)
  assert.ok(row, `${type} row present`)
  return row
}

test('MOV-TRACE: receiving 5 → sale 2 → adjustment +1 → per-row stock_before/stock_after (strings, full ledger)', async () => {
  const { token } = await seedTraceHistory()
  const res = await request(ctx.app).get('/api/movements').set('Authorization', `Bearer ${token}`)
  assert.equal(res.status, 200)
  const items = res.body.items as Array<Record<string, unknown>>
  assert.equal(items.length, 3)

  // Display order: adjustment (newest), sale, receiving (oldest).
  assert.equal(items[0]!.type, 'adjustment')
  assert.equal(items[1]!.type, 'sale')
  assert.equal(items[2]!.type, 'receiving')

  const receiving = findLedgerRow(items, 'receiving')
  assert.equal(receiving.stock_before, '0')
  assert.equal(receiving.stock_after, '5.0')

  const sale = findLedgerRow(items, 'sale')
  assert.equal(sale.stock_before, '5.0')
  assert.equal(sale.stock_after, '3.0')

  const adjustment = findLedgerRow(items, 'adjustment')
  assert.equal(adjustment.stock_before, '3.0')
  assert.equal(adjustment.stock_after, '4.0')

  for (const row of items) {
    assert.equal(typeof row.stock_before, 'string', 'stock_before serialized as string (D13)')
    assert.equal(typeof row.stock_after, 'string', 'stock_after serialized as string (D13)')
  }
})

test('MOV-TRACE: type filter keeps full-history balances (sale row still 5.0 → 3.0)', async () => {
  const { token } = await seedTraceHistory()
  const res = await request(ctx.app)
    .get('/api/movements?type=sale')
    .set('Authorization', `Bearer ${token}`)
  assert.equal(res.status, 200)
  const items = res.body.items as Array<Record<string, unknown>>
  assert.equal(items.length, 1)
  assert.equal(items[0]!.type, 'sale')
  assert.equal(items[0]!.stock_before, '5.0')
  assert.equal(items[0]!.stock_after, '3.0')
})

test('MOV-TRACE: pagination keeps full-ledger balances (page 2 oldest derives from outside the page)', async () => {
  const { token } = await seedTraceHistory()
  // Full unfiltered ledger for cross-check.
  const all = await request(ctx.app).get('/api/movements').set('Authorization', `Bearer ${token}`)
  const allItems = all.body.items as Array<Record<string, unknown>>

  const page1 = await request(ctx.app)
    .get('/api/movements?page=1&pageSize=2')
    .set('Authorization', `Bearer ${token}`)
  assert.equal(page1.status, 200)
  const p1 = page1.body.items as Array<Record<string, unknown>>
  assert.equal(p1.length, 2)
  for (const row of p1) {
    const full = allItems.find((item) => item.id === row.id)
    assert.ok(full, 'page-1 row exists in full ledger')
    assert.equal(row.stock_before, full.stock_before, 'page-1 stock_before matches full ledger')
    assert.equal(row.stock_after, full.stock_after, 'page-1 stock_after matches full ledger')
  }

  const page2 = await request(ctx.app)
    .get('/api/movements?page=2&pageSize=2')
    .set('Authorization', `Bearer ${token}`)
  assert.equal(page2.status, 200)
  const p2 = page2.body.items as Array<Record<string, unknown>>
  assert.equal(p2.length, 1, 'page 2 holds the oldest row')
  const oldest = p2[0]!
  assert.equal(oldest.type, 'receiving')
  assert.equal(oldest.stock_before, '0', 'before comes from history outside the page (nothing precedes it)')
  assert.equal(oldest.stock_after, '5.0')
})

test('MOV-TRACE: transfer rows carry their own per-warehouse balance (W1 5→2, W2 1→4)', async () => {
  const token = await operatorToken()
  const productId = await createProduct(ctx.app, token, 'SKU-XTRACE')
  const w1 = await createWarehouse(ctx.app, token, 'WH-T1')
  const w2 = await createWarehouse(ctx.app, token, 'WH-T2')
  await registerMovement(ctx.app, token, {
    product_id: productId,
    warehouse_id: w1,
    quantity: '5.0',
    type: 'receiving',
    idempotency_key: KEY_B,
  })
  await registerMovement(ctx.app, token, {
    product_id: productId,
    warehouse_id: w2,
    quantity: '1.0',
    type: 'receiving',
    idempotency_key: KEY_C,
  })
  const transfer = await request(ctx.app)
    .post('/api/movements/transfers')
    .set('Authorization', `Bearer ${token}`)
    .send({
      product_id: productId,
      source_warehouse_id: w1,
      destination_warehouse_id: w2,
      quantity: '3.0',
      idempotency_key: KEY_D,
    })
  assert.equal(transfer.status, 201)

  const res = await request(ctx.app).get('/api/movements').set('Authorization', `Bearer ${token}`)
  assert.equal(res.status, 200)
  const items = res.body.items as Array<Record<string, unknown>>
  const out = findLedgerRow(items, 'transfer_out')
  const inn = findLedgerRow(items, 'transfer_in')
  assert.equal(out.warehouse_id, w1)
  assert.equal(out.stock_before, '5.0')
  assert.equal(out.stock_after, '2.0', 'W1 balance after moving 3 of 5')
  assert.equal(inn.warehouse_id, w2)
  assert.equal(inn.stock_before, '1.0')
  assert.equal(inn.stock_after, '4.0', 'W2 balance after receiving 3 onto 1')
})