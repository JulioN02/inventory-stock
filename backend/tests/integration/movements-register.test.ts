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

async function seeded(): Promise<{ token: string; productId: string; warehouseId: string }> {
  const token = await operatorToken()
  const productId = await createProduct(ctx.app, token, 'SKU-MOV')
  const warehouseId = await createWarehouse(ctx.app, token, 'WH-MAIN')
  return { token, productId, warehouseId }
}

const KEY_A = '11111111-1111-4111-8111-111111111111'
const KEY_B = '22222222-2222-4222-8222-222222222222'

test('MOV-2: valid receiving → 201, ledger row with sign +1, stock derived', async () => {
  const { token, productId, warehouseId } = await seeded()
  const res = await registerMovement(ctx.app, token, {
    product_id: productId,
    warehouse_id: warehouseId,
    quantity: '5.0',
    type: 'receiving',
    idempotency_key: KEY_A,
  })
  assert.equal(res.status, 201)
  const movement = res.body.movement as {
    id: string
    type: string
    sign: number
    quantity: string
    idempotency_key: string
    actor_user_id: string
  }
  assert.equal(movement.type, 'receiving')
  assert.equal(movement.sign, 1)
  assert.equal(movement.quantity, '5.0', 'numeric serialized as string, scale 1')
  assert.equal(typeof movement.id, 'string')
  assert.equal(movement.idempotency_key, KEY_A)
  assert.equal(typeof movement.actor_user_id, 'string', 'actor recorded')
  assert.equal(await stockAt(ctx.pool, productId, warehouseId), '5.0')
})

test('MOV-2: valid sale → 201, ledger row with sign -1', async () => {
  const { token, productId, warehouseId } = await seeded()
  await registerMovement(ctx.app, token, {
    product_id: productId,
    warehouse_id: warehouseId,
    quantity: '5.0',
    type: 'receiving',
    idempotency_key: KEY_A,
  })
  const res = await registerMovement(ctx.app, token, {
    product_id: productId,
    warehouse_id: warehouseId,
    quantity: '2.0',
    type: 'sale',
    idempotency_key: KEY_B,
  })
  assert.equal(res.status, 201)
  assert.equal(res.body.movement.sign, -1)
  assert.equal(res.body.movement.type, 'sale')
  assert.equal(await stockAt(ctx.pool, productId, warehouseId), '3.0')
})

test('MOV-2: retry same key+payload → 200 with the SAME movement, row count unchanged', async () => {
  const { token, productId, warehouseId } = await seeded()
  const payload = {
    product_id: productId,
    warehouse_id: warehouseId,
    quantity: '5.0',
    type: 'receiving',
    idempotency_key: KEY_A,
  }
  const first = await registerMovement(ctx.app, token, payload)
  assert.equal(first.status, 201)
  const second = await registerMovement(ctx.app, token, payload)
  assert.equal(second.status, 200, 'replay is a 200, not 201')
  assert.equal(second.body.movement.id, first.body.movement.id, 'same ledger row returned')
  assert.equal(await movementCount(ctx.pool), 1, 'no second ledger row')
})

test('MOV-2: same key, different payload → 409', async () => {
  const { token, productId, warehouseId } = await seeded()
  const first = await registerMovement(ctx.app, token, {
    product_id: productId,
    warehouse_id: warehouseId,
    quantity: '5.0',
    type: 'receiving',
    idempotency_key: KEY_A,
  })
  assert.equal(first.status, 201)
  const conflict = await registerMovement(ctx.app, token, {
    product_id: productId,
    warehouse_id: warehouseId,
    quantity: '9.0',
    type: 'receiving',
    idempotency_key: KEY_A,
  })
  assert.equal(conflict.status, 409)
  assert.equal(conflict.body.error.code, 'IDEMPOTENCY_CONFLICT')
  assert.equal(await movementCount(ctx.pool), 1)
})

test('MOV-2: missing idempotency_key → 422', async () => {
  const { token, productId, warehouseId } = await seeded()
  const res = await registerMovement(ctx.app, token, {
    product_id: productId,
    warehouse_id: warehouseId,
    quantity: '5.0',
    type: 'receiving',
  })
  assert.equal(res.status, 422)
  assert.equal(res.body.error.code, 'VALIDATION_ERROR')
})

test('MOV-2: direct register rejects transfer types (they belong to the transfers endpoint)', async () => {
  const { token, productId, warehouseId } = await seeded()
  const res = await registerMovement(ctx.app, token, {
    product_id: productId,
    warehouse_id: warehouseId,
    quantity: '5.0',
    type: 'transfer_in',
    idempotency_key: KEY_A,
  })
  assert.equal(res.status, 422)
  assert.equal(res.body.error.code, 'VALIDATION_ERROR')
})

test('MOV-3: oversell beyond stock → 409, ledger unchanged', async () => {
  const { token, productId, warehouseId } = await seeded()
  await registerMovement(ctx.app, token, {
    product_id: productId,
    warehouse_id: warehouseId,
    quantity: '5.0',
    type: 'receiving',
    idempotency_key: KEY_A,
  })
  const res = await registerMovement(ctx.app, token, {
    product_id: productId,
    warehouse_id: warehouseId,
    quantity: '6.0',
    type: 'sale',
    idempotency_key: KEY_B,
  })
  assert.equal(res.status, 409)
  assert.equal(res.body.error.code, 'INSUFFICIENT_STOCK')
  assert.equal(await movementCount(ctx.pool), 1, 'failed sale rolled back, no ledger row')
  assert.equal(await stockAt(ctx.pool, productId, warehouseId), '5.0')
})

test('MOV-3: exact-boundary sale (stock 5, sell 5) → 201, final stock 0', async () => {
  const { token, productId, warehouseId } = await seeded()
  await registerMovement(ctx.app, token, {
    product_id: productId,
    warehouse_id: warehouseId,
    quantity: '5.0',
    type: 'receiving',
    idempotency_key: KEY_A,
  })
  const res = await registerMovement(ctx.app, token, {
    product_id: productId,
    warehouse_id: warehouseId,
    quantity: '5.0',
    type: 'sale',
    idempotency_key: KEY_B,
  })
  assert.equal(res.status, 201, 'selling exactly the available stock is allowed')
  assert.equal(await stockAt(ctx.pool, productId, warehouseId), '0.0', 'ledger nets to scale-1 zero')
})

test('MOV-3: quantity with 2 decimals → 422 (scale 1 for quantities)', async () => {
  const { token, productId, warehouseId } = await seeded()
  const res = await registerMovement(ctx.app, token, {
    product_id: productId,
    warehouse_id: warehouseId,
    quantity: '5.25',
    type: 'receiving',
    idempotency_key: KEY_A,
  })
  assert.equal(res.status, 422)
})

test('MOV-3: quantity zero or negative → 422', async () => {
  const { token, productId, warehouseId } = await seeded()
  const zero = await registerMovement(ctx.app, token, {
    product_id: productId,
    warehouse_id: warehouseId,
    quantity: '0.0',
    type: 'receiving',
    idempotency_key: KEY_A,
  })
  assert.equal(zero.status, 422)
  const negative = await registerMovement(ctx.app, token, {
    product_id: productId,
    warehouse_id: warehouseId,
    quantity: '-1.0',
    type: 'receiving',
    idempotency_key: KEY_B,
  })
  assert.equal(negative.status, 422)
})

test('MOV-3: sale to a deactivated product → 422 (catalog active check)', async () => {
  const { token, productId, warehouseId } = await seeded()
  await registerMovement(ctx.app, token, {
    product_id: productId,
    warehouse_id: warehouseId,
    quantity: '5.0',
    type: 'receiving',
    idempotency_key: KEY_A,
  })
  await request(ctx.app).delete(`/api/products/${productId}`).set('Authorization', `Bearer ${token}`)
  const res = await registerMovement(ctx.app, token, {
    product_id: productId,
    warehouse_id: warehouseId,
    quantity: '1.0',
    type: 'sale',
    idempotency_key: KEY_B,
  })
  assert.equal(res.status, 422)
  assert.equal(res.body.error.code, 'REFERENCE_INACTIVE')
})

test('MOV-3: unknown product → 422 (never a 500 FK crash)', async () => {
  const { token, warehouseId } = await seeded()
  const res = await registerMovement(ctx.app, token, {
    product_id: '99999999-9999-4999-8999-999999999999',
    warehouse_id: warehouseId,
    quantity: '1.0',
    type: 'receiving',
    idempotency_key: KEY_A,
  })
  assert.equal(res.status, 422)
  assert.equal(res.body.error.code, 'REFERENCE_NOT_FOUND')
})

test('AUTH-6: viewer cannot register movements → 403; unauthenticated → 401', async () => {
  const { productId, warehouseId } = await seeded()
  await createUser(ctx.pool, {
    username: 'viewer1',
    email: 'viewer1@test.local',
    password: 'Viewer123',
    role: 'viewer',
  })
  const viewerToken = await loginAndGetToken(ctx.app, 'viewer1', 'Viewer123')
  const denied = await registerMovement(ctx.app, viewerToken, {
    product_id: productId,
    warehouse_id: warehouseId,
    quantity: '5.0',
    type: 'receiving',
    idempotency_key: KEY_A,
  })
  assert.equal(denied.status, 403)

  const anon = await request(ctx.app).post('/api/movements').send({
    product_id: productId,
    warehouse_id: warehouseId,
    quantity: '5.0',
    type: 'receiving',
    idempotency_key: KEY_A,
  })
  assert.equal(anon.status, 401, 'never 403 without authentication')
})