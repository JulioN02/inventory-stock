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

/** Product + two warehouses, source seeded with `sourceQty`. */
async function seeded(sourceQty = '5.0'): Promise<{
  token: string
  productId: string
  sourceId: string
  destId: string
}> {
  const token = await operatorToken()
  const productId = await createProduct(ctx.app, token, 'SKU-XFER')
  const sourceId = await createWarehouse(ctx.app, token, 'WH-SRC')
  const destId = await createWarehouse(ctx.app, token, 'WH-DST')
  await registerMovement(ctx.app, token, {
    product_id: productId,
    warehouse_id: sourceId,
    quantity: sourceQty,
    type: 'receiving',
    idempotency_key: KEY_A,
  })
  return { token, productId, sourceId, destId }
}

function transferBody(
  productId: string,
  sourceId: string,
  destId: string,
  quantity: string,
  key: string,
): Record<string, unknown> {
  return {
    product_id: productId,
    source_warehouse_id: sourceId,
    destination_warehouse_id: destId,
    quantity,
    idempotency_key: key,
  }
}

test('MOV-5: valid transfer A→B → 2 rows atomically, group id shared, stocks updated', async () => {
  const { token, productId, sourceId, destId } = await seeded()
  const res = await request(ctx.app)
    .post('/api/movements/transfers')
    .set('Authorization', `Bearer ${token}`)
    .send(transferBody(productId, sourceId, destId, '3.0', KEY_B))
  assert.equal(res.status, 201)
  assert.equal(res.body.movement.type, 'transfer_out')
  assert.equal(res.body.movement.sign, -1)
  assert.equal(res.body.movement.idempotency_key, KEY_B, 'primary row carries the key')
  assert.equal(res.body.movement.operation_group_id, KEY_B)

  const { rows } = await ctx.pool.query(
    `SELECT type, sign, quantity::text AS quantity, idempotency_key, operation_group_id
     FROM movements ORDER BY id`,
  )
  assert.equal(rows.length, 3, 'receiving + transfer_out + transfer_in')
  const out = (rows as Array<Record<string, unknown>>).find((r) => r.type === 'transfer_out')
  const inn = (rows as Array<Record<string, unknown>>).find((r) => r.type === 'transfer_in')
  assert.equal(out?.sign, -1)
  assert.equal(inn?.sign, 1)
  assert.equal(inn?.idempotency_key, null, 'secondary row has NULL key (PG UNIQUE treats NULLs distinct)')
  assert.equal(out?.operation_group_id, inn?.operation_group_id, 'rows share the operation group')

  assert.equal(await stockAt(ctx.pool, productId, sourceId), '2.0', 'source -3')
  assert.equal(await stockAt(ctx.pool, productId, destId), '3.0', 'destination +3')
})

test('MOV-5: source = destination → 422, zero rows', async () => {
  const { token, productId, sourceId } = await seeded()
  const res = await request(ctx.app)
    .post('/api/movements/transfers')
    .set('Authorization', `Bearer ${token}`)
    .send(transferBody(productId, sourceId, sourceId, '3.0', KEY_B))
  assert.equal(res.status, 422)
  assert.equal(res.body.error.code, 'VALIDATION_ERROR')
  assert.equal(await movementCount(ctx.pool), 1, 'only the seeded receiving row')
})

test('MOV-5: insufficient source → 409, zero rows', async () => {
  const { token, productId, sourceId, destId } = await seeded('2.0')
  const res = await request(ctx.app)
    .post('/api/movements/transfers')
    .set('Authorization', `Bearer ${token}`)
    .send(transferBody(productId, sourceId, destId, '3.0', KEY_B))
  assert.equal(res.status, 409)
  assert.equal(res.body.error.code, 'INSUFFICIENT_STOCK')
  assert.equal(await movementCount(ctx.pool), 1, 'both transfer rows rolled back')
  assert.equal(await stockAt(ctx.pool, productId, destId), '0')
})

test('MOV-5: idempotent retry of a transfer → 200, no new rows', async () => {
  const { token, productId, sourceId, destId } = await seeded()
  const payload = transferBody(productId, sourceId, destId, '3.0', KEY_B)
  const first = await request(ctx.app)
    .post('/api/movements/transfers')
    .set('Authorization', `Bearer ${token}`)
    .send(payload)
  assert.equal(first.status, 201)
  const second = await request(ctx.app)
    .post('/api/movements/transfers')
    .set('Authorization', `Bearer ${token}`)
    .send(payload)
  assert.equal(second.status, 200, 'replay → 200')
  assert.equal(second.body.movement.id, first.body.movement.id)
  assert.equal(await movementCount(ctx.pool), 3, 'receiving + 2 transfer rows, no duplicates')
})

test('MOV-5: same key, different transfer payload → 409', async () => {
  const { token, productId, sourceId, destId } = await seeded()
  const first = await request(ctx.app)
    .post('/api/movements/transfers')
    .set('Authorization', `Bearer ${token}`)
    .send(transferBody(productId, sourceId, destId, '3.0', KEY_B))
  assert.equal(first.status, 201)
  const conflict = await request(ctx.app)
    .post('/api/movements/transfers')
    .set('Authorization', `Bearer ${token}`)
    .send(transferBody(productId, sourceId, destId, '4.0', KEY_B))
  assert.equal(conflict.status, 409)
  assert.equal(conflict.body.error.code, 'IDEMPOTENCY_CONFLICT')
})

test('MOV-5: missing idempotency_key → 422', async () => {
  const { token, productId, sourceId, destId } = await seeded()
  const res = await request(ctx.app)
    .post('/api/movements/transfers')
    .set('Authorization', `Bearer ${token}`)
    .send({
      product_id: productId,
      source_warehouse_id: sourceId,
      destination_warehouse_id: destId,
      quantity: '1.0',
    })
  assert.equal(res.status, 422)
})

test('MOV-5: transfer into a deactivated warehouse → 422, zero rows', async () => {
  const { token, productId, sourceId, destId } = await seeded()
  await request(ctx.app).delete(`/api/warehouses/${destId}`).set('Authorization', `Bearer ${token}`)
  const res = await request(ctx.app)
    .post('/api/movements/transfers')
    .set('Authorization', `Bearer ${token}`)
    .send(transferBody(productId, sourceId, destId, '1.0', KEY_B))
  assert.equal(res.status, 422)
  assert.equal(await movementCount(ctx.pool), 1)
})

test('MOV-5: concurrent OPPOSITE transfers → both 201, no deadlock, invariants hold', async () => {
  const { token, productId, sourceId, destId } = await seeded('5.0')
  // Seed destination too so the opposite transfer has stock.
  await registerMovement(ctx.app, token, {
    product_id: productId,
    warehouse_id: destId,
    quantity: '5.0',
    type: 'receiving',
    idempotency_key: '33333333-3333-4333-8333-333333333333',
  })

  const aToB = request(ctx.app)
    .post('/api/movements/transfers')
    .set('Authorization', `Bearer ${token}`)
    .send(transferBody(productId, sourceId, destId, '2.0', '44444444-4444-4444-8444-444444444444'))
  const bToA = request(ctx.app)
    .post('/api/movements/transfers')
    .set('Authorization', `Bearer ${token}`)
    .send(transferBody(productId, destId, sourceId, '3.0', '55555555-5555-5555-8555-555555555555'))

  const timeout = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error('deadlock: transfers did not complete within 10s')), 10_000)
  })
  const [resA, resB] = (await Promise.race([
    Promise.all([aToB, bToA]),
    timeout,
  ])) as [request.Response, request.Response]

  assert.equal(resA.status, 201, `A→B: ${resA.status} ${JSON.stringify(resA.body)}`)
  assert.equal(resB.status, 201, `B→A: ${resB.status} ${JSON.stringify(resB.body)}`)
  // A: 5 - 2 + 3 = 6 ; B: 5 + 2 - 3 = 4
  assert.equal(await stockAt(ctx.pool, productId, sourceId), '6.0')
  assert.equal(await stockAt(ctx.pool, productId, destId), '4.0')
  assert.equal(await movementCount(ctx.pool), 6, '2 receiving + 4 transfer rows, all committed')
})