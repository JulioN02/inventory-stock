import crypto from 'node:crypto'
import { beforeEach, test } from 'node:test'
import assert from 'node:assert/strict'
import { createTestContext } from '../helpers/testApp.ts'
import { resetDatabase } from '../helpers/db.ts'
import { createUser, loginAndGetToken } from '../helpers/users.ts'
import { createProduct, createWarehouse, movementCount, registerMovement, stockAt } from '../helpers/stock.ts'

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

interface RaceResult {
  statuses: number[]
  productId: string
  warehouseId: string
}

/**
 * LAB-01 harness (MOV-8): N concurrent out-movements racing for the last unit.
 * The advisory lock serializes writers per (product, warehouse); the inline
 * SUM recheck inside the same tx rejects everyone past the available stock.
 * Exactly one 201 per available unit; ledger rows = successes only.
 */
async function raceSales(opts: { stockQty: string; saleQty: string; concurrency: number }): Promise<RaceResult> {
  const token = await operatorToken()
  const productId = await createProduct(ctx.app, token, 'SKU-RACE')
  const warehouseId = await createWarehouse(ctx.app, token, 'WH-RACE')
  await registerMovement(ctx.app, token, {
    product_id: productId,
    warehouse_id: warehouseId,
    quantity: opts.stockQty,
    type: 'receiving',
    idempotency_key: crypto.randomUUID(),
  })

  const requests = Array.from({ length: opts.concurrency }, () =>
    registerMovement(ctx.app, token, {
      product_id: productId,
      warehouse_id: warehouseId,
      quantity: opts.saleQty,
      type: 'sale',
      idempotency_key: crypto.randomUUID(),
    }),
  )
  const responses = await Promise.all(requests)
  return { statuses: responses.map((r) => r.status), productId, warehouseId }
}

test('MOV-8: stock 1 + 5 concurrent sales of 1 → exactly 1×201, 4×409, 1 ledger row, stock 0', async () => {
  const { statuses, productId, warehouseId } = await raceSales({ stockQty: '1.0', saleQty: '1.0', concurrency: 5 })
  assert.equal(statuses.filter((s) => s === 201).length, 1, `expected 1×201, got ${JSON.stringify(statuses)}`)
  assert.equal(statuses.filter((s) => s === 409).length, 4, `expected 4×409, got ${JSON.stringify(statuses)}`)

  assert.equal(await movementCount(ctx.pool), 2, 'receiving + exactly 1 sale row')
  assert.equal(await stockAt(ctx.pool, productId, warehouseId), '0.0', 'final derived stock 0, never negative')
})

test('MOV-8: 10 concurrent sales on stock 3 → exactly 3×201, 7×409, stock 0', async () => {
  const { statuses, productId, warehouseId } = await raceSales({ stockQty: '3.0', saleQty: '1.0', concurrency: 10 })
  assert.equal(statuses.filter((s) => s === 201).length, 3, `expected 3×201, got ${JSON.stringify(statuses)}`)
  assert.equal(statuses.filter((s) => s === 409).length, 7, `expected 7×409, got ${JSON.stringify(statuses)}`)

  assert.equal(await movementCount(ctx.pool), 4, 'receiving + exactly 3 sale rows')
  assert.equal(await stockAt(ctx.pool, productId, warehouseId), '0.0')
})

test('MOV-8: concurrent sales with distinct keys never produce a lost update (stock ≥ 0 always)', async () => {
  const { statuses, productId, warehouseId } = await raceSales({ stockQty: '2.0', saleQty: '1.0', concurrency: 4 })
  assert.equal(statuses.filter((s) => s === 201).length, 2, `expected 2×201, got ${JSON.stringify(statuses)}`)
  assert.equal(await movementCount(ctx.pool), 3, 'receiving + exactly 2 sales')
  assert.equal(await stockAt(ctx.pool, productId, warehouseId), '0.0')
})