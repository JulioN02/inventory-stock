import { beforeEach, test } from 'node:test'
import assert from 'node:assert/strict'
import request from 'supertest'
import type { Pool } from 'pg'
import { createTestContext } from '../helpers/testApp.ts'
import { resetDatabase } from '../helpers/db.ts'
import { createUser, loginAndGetToken } from '../helpers/users.ts'

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

async function countAudit(pool: Pool, action: string): Promise<number> {
  const { rows } = await pool.query(
    `SELECT COUNT(*)::int AS n FROM audit_log WHERE action = $1`,
    [action],
  )
  return (rows[0] as { n: number }).n
}

test('AUD-1: product create → audit row with actor/action/entity, committed with the change', async () => {
  const { token, userId } = await operator()
  const res = await request(ctx.app)
    .post('/api/products')
    .set('Authorization', `Bearer ${token}`)
    .send({ sku: 'SKU-AUD', name: 'Audited', unit: 'unit', price: '9.99' })
  assert.equal(res.status, 201)

  const row = await lastAudit(ctx.pool, 'catalog.product.create')
  assert.ok(row, 'audit row must exist for the product create')
  assert.equal(row.actor_type, 'user')
  assert.equal(row.actor_user_id, userId, 'actor is the authenticated user')
  assert.equal(row.entity_type, 'product')
  assert.equal(row.entity_id, res.body.product.id)
  assert.equal(row.payload.sku, 'SKU-AUD')
  assert.equal(row.payload.price, '9.99')
})

test('AUD-1: product update → catalog.product.update audit row', async () => {
  const { token, userId } = await operator()
  const created = await request(ctx.app)
    .post('/api/products')
    .set('Authorization', `Bearer ${token}`)
    .send({ sku: 'SKU-UPD', name: 'Before', unit: 'kg', price: '1.00' })
  const id = created.body.product.id as string

  const res = await request(ctx.app)
    .patch(`/api/products/${id}`)
    .set('Authorization', `Bearer ${token}`)
    .send({ name: 'After', price: '2.50' })
  assert.equal(res.status, 200)

  const row = await lastAudit(ctx.pool, 'catalog.product.update')
  assert.ok(row)
  assert.equal(row.actor_user_id, userId)
  assert.equal(row.entity_id, id)
  assert.equal(row.payload.name, 'After')
  assert.equal(row.payload.price, '2.50')
})

test('AUD-1: product deactivate → catalog.product.deactivate audit row', async () => {
  const { token, userId } = await operator()
  const created = await request(ctx.app)
    .post('/api/products')
    .set('Authorization', `Bearer ${token}`)
    .send({ sku: 'SKU-DIE', name: 'Doomed', unit: 'unit', price: '1.00' })
  const id = created.body.product.id as string

  const res = await request(ctx.app)
    .delete(`/api/products/${id}`)
    .set('Authorization', `Bearer ${token}`)
  assert.equal(res.status, 200)

  const row = await lastAudit(ctx.pool, 'catalog.product.deactivate')
  assert.ok(row)
  assert.equal(row.actor_user_id, userId)
  assert.equal(row.entity_id, id)
  assert.equal(row.payload.active, false)
})

test('AUD-1: warehouse create/update/deactivate → catalog.warehouse.* audit rows', async () => {
  const { token, userId } = await operator()
  const created = await request(ctx.app)
    .post('/api/warehouses')
    .set('Authorization', `Bearer ${token}`)
    .send({ name: 'Main WH', code: 'WH-MAIN' })
  assert.equal(created.status, 201)
  const id = created.body.warehouse.id as string

  const createRow = await lastAudit(ctx.pool, 'catalog.warehouse.create')
  assert.ok(createRow)
  assert.equal(createRow.actor_user_id, userId)
  assert.equal(createRow.entity_id, id)
  assert.equal(createRow.payload.code, 'WH-MAIN')

  const upd = await request(ctx.app)
    .patch(`/api/warehouses/${id}`)
    .set('Authorization', `Bearer ${token}`)
    .send({ name: 'Main WH 2' })
  assert.equal(upd.status, 200)
  const updateRow = await lastAudit(ctx.pool, 'catalog.warehouse.update')
  assert.ok(updateRow)
  assert.equal(updateRow.entity_id, id)
  assert.equal(updateRow.payload.name, 'Main WH 2')

  const del = await request(ctx.app)
    .delete(`/api/warehouses/${id}`)
    .set('Authorization', `Bearer ${token}`)
  assert.equal(del.status, 200)
  const deactivateRow = await lastAudit(ctx.pool, 'catalog.warehouse.deactivate')
  assert.ok(deactivateRow)
  assert.equal(deactivateRow.entity_id, id)
  assert.equal(deactivateRow.payload.active, false)
})

test('AUD-2: rolled-back product update (SKU conflict → 409) leaves NO audit row', async () => {
  const { token } = await operator()
  await request(ctx.app)
    .post('/api/products')
    .set('Authorization', `Bearer ${token}`)
    .send({ sku: 'SKU-AA', name: 'A', unit: 'unit', price: '1.00' })
  const b = await request(ctx.app)
    .post('/api/products')
    .set('Authorization', `Bearer ${token}`)
    .send({ sku: 'SKU-BB', name: 'B', unit: 'unit', price: '1.00' })
  const bId = b.body.product.id as string

  const before = await countAudit(ctx.pool, 'catalog.product.update')
  const res = await request(ctx.app)
    .patch(`/api/products/${bId}`)
    .set('Authorization', `Bearer ${token}`)
    .send({ sku: 'sku-aa' }) // collides with SKU-AA → 409, whole tx rolls back
  assert.equal(res.status, 409)
  assert.equal(res.body.error.code, 'SKU_TAKEN')

  const after = await countAudit(ctx.pool, 'catalog.product.update')
  assert.equal(after, before, 'no audit row survives the rolled-back update (same-tx writes)')
})