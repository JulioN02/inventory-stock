import { beforeEach, test } from 'node:test'
import assert from 'node:assert/strict'
import request from 'supertest'
import type { Pool } from 'pg'
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

async function operator(): Promise<{ token: string; userId: string }> {
  const { id } = await createUser(ctx.pool, {
    username: 'op1',
    email: 'op1@test.local',
    password: 'Operator1',
    role: 'operator',
  })
  return { token: await loginAndGetToken(ctx.app, 'op1', 'Operator1'), userId: id }
}

async function seeded(): Promise<{ token: string; userId: string; productId: string; warehouseId: string }> {
  const { token, userId } = await operator()
  const productId = await createProduct(ctx.app, token, 'SKU-AUDM')
  const warehouseId = await createWarehouse(ctx.app, token, 'WH-AUDM')
  return { token, userId, productId, warehouseId }
}

interface AuditRow {
  actor_type: string
  actor_user_id: string | null
  action: string
  entity_type: string | null
  entity_id: string | null
  payload: Record<string, unknown>
}

async function lastAudit(pool: Pool, action: string): Promise<AuditRow | null> {
  const { rows } = await pool.query(
    `SELECT actor_type, actor_user_id, action, entity_type, entity_id, payload
     FROM audit_log WHERE action = $1 ORDER BY id DESC LIMIT 1`,
    [action],
  )
  return (rows[0] as AuditRow | undefined) ?? null
}

async function countMovementAudit(pool: Pool, idempotencyKey: string): Promise<number> {
  const { rows } = await pool.query(
    `SELECT COUNT(*)::int AS n FROM audit_log
     WHERE action = 'movements.movement.create' AND payload->>'idempotency_key' = $1`,
    [idempotencyKey],
  )
  return (rows[0] as { n: number }).n
}

test('AUD-1: movement create → movements.movement.create row in the same transaction', async () => {
  const { token, userId, productId, warehouseId } = await seeded()
  const res = await registerMovement(ctx.app, token, {
    product_id: productId,
    warehouse_id: warehouseId,
    quantity: '5.0',
    type: 'receiving',
    idempotency_key: 'aaaa1111-1111-4111-8111-111111111111',
  })
  assert.equal(res.status, 201)

  const row = await lastAudit(ctx.pool, 'movements.movement.create')
  assert.ok(row, 'audit row must exist for the new movement')
  assert.equal(row.actor_type, 'user')
  assert.equal(row.actor_user_id, userId)
  assert.equal(row.entity_type, 'movement')
  assert.equal(row.entity_id, res.body.movement.id)
  assert.equal(row.payload.type, 'receiving')
  assert.equal(row.payload.quantity, '5.0')
  assert.equal(row.payload.sign, 1)
})

test('AUD-2: rejected movement (insufficient stock → 409) leaves NO movement audit row', async () => {
  const { token, productId, warehouseId } = await seeded()
  await registerMovement(ctx.app, token, {
    product_id: productId,
    warehouse_id: warehouseId,
    quantity: '1.0',
    type: 'receiving',
    idempotency_key: 'bbbb1111-1111-4111-8111-111111111111',
  })

  const res = await registerMovement(ctx.app, token, {
    product_id: productId,
    warehouse_id: warehouseId,
    quantity: '5.0',
    type: 'sale',
    idempotency_key: 'cccc1111-1111-4111-8111-111111111111',
  })
  assert.equal(res.status, 409)
  assert.equal(res.body.error.code, 'INSUFFICIENT_STOCK')

  const n = await countMovementAudit(ctx.pool, 'cccc1111-1111-4111-8111-111111111111')
  assert.equal(n, 0, 'rolled-back movement must NOT leave an audit row (same-tx writes)')
})

test('AUD-2 (triangulate): idempotent replay → 200, NO second audit row', async () => {
  const { token, productId, warehouseId } = await seeded()
  const key = 'dddd1111-1111-4111-8111-111111111111'
  const payload = {
    product_id: productId,
    warehouse_id: warehouseId,
    quantity: '3.0',
    type: 'receiving',
    idempotency_key: key,
  }
  const first = await registerMovement(ctx.app, token, payload)
  assert.equal(first.status, 201)
  assert.equal(await countMovementAudit(ctx.pool, key), 1, 'one audit row for the new operation')

  const replay = await registerMovement(ctx.app, token, payload)
  assert.equal(replay.status, 200)
  assert.equal(
    await countMovementAudit(ctx.pool, key),
    1,
    'a replay is not a new operation — no extra audit row',
  )
})

test('AUD-1: transfer → movements.transfer.create row (atomic two-row op, one audit row)', async () => {
  const { token, userId, productId, warehouseId } = await seeded()
  await registerMovement(ctx.app, token, {
    product_id: productId,
    warehouse_id: warehouseId,
    quantity: '5.0',
    type: 'receiving',
    idempotency_key: 'eeee1111-1111-4111-8111-111111111111',
  })
  const wh2 = await createWarehouse(ctx.app, token, 'WH-AUDM-2')

  const res = await request(ctx.app)
    .post('/api/movements/transfers')
    .set('Authorization', `Bearer ${token}`)
    .send({
      product_id: productId,
      source_warehouse_id: warehouseId,
      destination_warehouse_id: wh2,
      quantity: '2.0',
      idempotency_key: 'ffff1111-1111-4111-8111-111111111111',
    })
  assert.equal(res.status, 201)

  const row = await lastAudit(ctx.pool, 'movements.transfer.create')
  assert.ok(row, 'audit row must exist for the transfer')
  assert.equal(row.actor_user_id, userId)
  assert.equal(row.entity_type, 'movement')
  assert.equal(row.entity_id, res.body.movement.id)
  assert.equal(row.payload.source_warehouse_id, warehouseId)
  assert.equal(row.payload.destination_warehouse_id, wh2)
})

test('AUD-1: adjustment → movements.adjustment.create row', async () => {
  const { token, userId, productId, warehouseId } = await seeded()
  const res = await request(ctx.app)
    .post('/api/movements/adjustments')
    .set('Authorization', `Bearer ${token}`)
    .send({
      product_id: productId,
      warehouse_id: warehouseId,
      quantity: '2.5',
      reason: 'count correction',
      idempotency_key: 'abab1111-1111-4111-8111-111111111111',
    })
  assert.equal(res.status, 201)

  const row = await lastAudit(ctx.pool, 'movements.adjustment.create')
  assert.ok(row)
  assert.equal(row.actor_user_id, userId)
  assert.equal(row.entity_id, res.body.movement.id)
  assert.equal(row.payload.reason, 'count correction')
  assert.equal(row.payload.sign, 1)
})