import { beforeEach, test } from 'node:test'
import assert from 'node:assert/strict'
import request from 'supertest'
import { createTestContext } from '../helpers/testApp.ts'
import { resetDatabase } from '../helpers/db.ts'
import { createUser, loginAndGetToken } from '../helpers/users.ts'
import {
  createProduct,
  createWarehouse,
  movementCount,
  registerMovement,
  stockAt,
} from '../helpers/stock.ts'

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

const KEY_A = '11111111-1111-4111-8111-111111111111'
const KEY_B = '22222222-2222-4222-8222-222222222222'
const KEY_C = '33333333-3333-4333-8333-333333333333'

async function seeded(quantity = '5.0'): Promise<{ token: string; productId: string; warehouseId: string }> {
  const token = await operatorToken()
  const productId = await createProduct(ctx.app, token, 'SKU-ADJ')
  const warehouseId = await createWarehouse(ctx.app, token, 'WH-ADJ')
  await registerMovement(ctx.app, token, {
    product_id: productId,
    warehouse_id: warehouseId,
    quantity,
    type: 'receiving',
    idempotency_key: KEY_A,
  })
  return { token, productId, warehouseId }
}

function adjust(
  token: string,
  body: Record<string, unknown>,
): request.Test {
  return request(ctx.app).post('/api/movements/adjustments').set('Authorization', `Bearer ${token}`).send(body)
}

test('MOV-6: positive adjustment +2 → new +adjustment row, stock increases', async () => {
  const { token, productId, warehouseId } = await seeded()
  const res = await adjust(token, {
    product_id: productId,
    warehouse_id: warehouseId,
    quantity: '2.0',
    reason: 'stocktake found extra units',
    idempotency_key: KEY_B,
  })
  assert.equal(res.status, 201)
  assert.equal(res.body.movement.type, 'adjustment')
  assert.equal(res.body.movement.sign, 1)
  assert.equal(res.body.movement.quantity, '2.0')
  assert.equal(res.body.movement.reference, 'stocktake found extra units', 'reason stored in reference')
  assert.equal(await stockAt(ctx.pool, productId, warehouseId), '7.0')
})

test('MOV-6: negative adjustment within stock → row, stock decreases', async () => {
  const { token, productId, warehouseId } = await seeded()
  const res = await adjust(token, {
    product_id: productId,
    warehouse_id: warehouseId,
    quantity: '-2.0',
    reason: 'damaged units written off',
    idempotency_key: KEY_B,
  })
  assert.equal(res.status, 201)
  assert.equal(res.body.movement.sign, -1)
  assert.equal(await stockAt(ctx.pool, productId, warehouseId), '3.0')
})

test('MOV-6: negative adjustment beyond stock → 409, no row', async () => {
  const { token, productId, warehouseId } = await seeded('2.0')
  const res = await adjust(token, {
    product_id: productId,
    warehouse_id: warehouseId,
    quantity: '-3.0',
    reason: 'should be rejected',
    idempotency_key: KEY_B,
  })
  assert.equal(res.status, 409)
  assert.equal(res.body.error.code, 'INSUFFICIENT_STOCK')
  assert.equal(await movementCount(ctx.pool), 1)
  assert.equal(await stockAt(ctx.pool, productId, warehouseId), '2.0')
})

test('MOV-6: adjustments are idempotent via idempotency_key', async () => {
  const { token, productId, warehouseId } = await seeded()
  const payload = {
    product_id: productId,
    warehouse_id: warehouseId,
    quantity: '-2.0',
    reason: 'damaged units',
    idempotency_key: KEY_B,
  }
  const first = await adjust(token, payload)
  assert.equal(first.status, 201)
  const retry = await adjust(token, payload)
  assert.equal(retry.status, 200, 'replay → 200')
  assert.equal(retry.body.movement.id, first.body.movement.id)
  assert.equal(await movementCount(ctx.pool), 2, 'receiving + adjustment, no duplicate')
  const conflict = await adjust(token, { ...payload, quantity: '-1.0' })
  assert.equal(conflict.status, 409)
  assert.equal(conflict.body.error.code, 'IDEMPOTENCY_CONFLICT')
})

test('MOV-6: missing or empty reason → 422', async () => {
  const { token, productId, warehouseId } = await seeded()
  const missing = await adjust(token, {
    product_id: productId,
    warehouse_id: warehouseId,
    quantity: '1.0',
    idempotency_key: KEY_B,
  })
  assert.equal(missing.status, 422)
  const empty = await adjust(token, {
    product_id: productId,
    warehouse_id: warehouseId,
    quantity: '1.0',
    reason: '   ',
    idempotency_key: KEY_C,
  })
  assert.equal(empty.status, 422)
})

test('MOV-6: zero quantity → 422 (adjustments must be non-zero)', async () => {
  const { token, productId, warehouseId } = await seeded()
  const res = await adjust(token, {
    product_id: productId,
    warehouse_id: warehouseId,
    quantity: '0.0',
    reason: 'no-op',
    idempotency_key: KEY_B,
  })
  assert.equal(res.status, 422)
})

test('MOV-6: quantity scale > 1 → 422', async () => {
  const { token, productId, warehouseId } = await seeded()
  const res = await adjust(token, {
    product_id: productId,
    warehouse_id: warehouseId,
    quantity: '1.25',
    reason: 'bad scale',
    idempotency_key: KEY_B,
  })
  assert.equal(res.status, 422)
})