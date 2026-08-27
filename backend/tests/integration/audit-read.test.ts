import { beforeEach, test } from 'node:test'
import assert from 'node:assert/strict'
import request from 'supertest'
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

/** Seeds users and a few audit rows (product create + login success). Returns the actor user id. */
async function seededAuditData(): Promise<{ auditorToken: string; operatorToken: string; operatorId: string }> {
  const operator = await createUser(ctx.pool, {
    username: 'op1',
    email: 'op1@test.local',
    password: 'Operator1',
    role: 'operator',
  })
  await createUser(ctx.pool, {
    username: 'aud1',
    email: 'aud1@test.local',
    password: 'Auditor1',
    role: 'auditor',
  })
  const auditorToken = await loginAndGetToken(ctx.app, 'aud1', 'Auditor1')
  const operatorToken = await loginAndGetToken(ctx.app, 'op1', 'Operator1')

  await request(ctx.app)
    .post('/api/products')
    .set('Authorization', `Bearer ${operatorToken}`)
    .send({ sku: 'SKU-A1', name: 'Audited One', unit: 'unit', price: '1.00' })
  await request(ctx.app)
    .post('/api/products')
    .set('Authorization', `Bearer ${operatorToken}`)
    .send({ sku: 'SKU-A2', name: 'Audited Two', unit: 'kg', price: '2.00' })
  await request(ctx.app)
    .post('/api/auth/login')
    .send({ username: 'nobody', password: 'WrongPass1' }) // auth.login.failure row

  return { auditorToken, operatorToken, operatorId: operator.id }
}

test('AUD-5: auditor → 200 with paginated items and total', async () => {
  const { auditorToken } = await seededAuditData()
  const res = await request(ctx.app)
    .get('/api/audit')
    .set('Authorization', `Bearer ${auditorToken}`)
  assert.equal(res.status, 200)
  assert.ok(Array.isArray(res.body.items))
  assert.ok(res.body.total >= 3, 'catalog + auth rows all present')
  assert.equal(res.body.page, 1)
  assert.equal(res.body.pageSize, 20)
  const first = res.body.items[0] as { action: string; payload: Record<string, unknown>; occurred_at: string }
  assert.ok(typeof first.action === 'string' && first.action.length > 0)
  assert.ok(typeof first.occurred_at === 'string', 'occurred_at serialized as ISO string')
  assert.ok(typeof first.payload === 'object', 'jsonb payload comes back as an object')
})

test('AUD-5: filter by action → only matching rows', async () => {
  const { auditorToken } = await seededAuditData()
  const res = await request(ctx.app)
    .get('/api/audit?action=catalog.product.create')
    .set('Authorization', `Bearer ${auditorToken}`)
  assert.equal(res.status, 200)
  assert.equal(res.body.total, 2)
  assert.ok(res.body.items.every((r: { action: string }) => r.action === 'catalog.product.create'))
})

test('AUD-5: filter by entity_type → only matching rows', async () => {
  const { auditorToken } = await seededAuditData()
  const res = await request(ctx.app)
    .get('/api/audit?entity_type=product')
    .set('Authorization', `Bearer ${auditorToken}`)
  assert.equal(res.status, 200)
  assert.equal(res.body.total, 2)
  assert.ok(res.body.items.every((r: { entity_type: string }) => r.entity_type === 'product'))
})

test('AUD-5: filter by actor (user id) → only that user actions', async () => {
  const { auditorToken, operatorId } = await seededAuditData()
  const res = await request(ctx.app)
    .get(`/api/audit?actor=${operatorId}`)
    .set('Authorization', `Bearer ${auditorToken}`)
  assert.equal(res.status, 200)
  // op1: 1 login.success + 2 product creates — all keyed to the operator.
  assert.equal(res.body.total, 3)
  assert.ok(res.body.items.every((r: { actor_user_id: string }) => r.actor_user_id === operatorId))
})

test('AUD-5: date range with no matches → empty array, 200', async () => {
  const { auditorToken } = await seededAuditData()
  const res = await request(ctx.app)
    .get('/api/audit')
    .query({ from: '2030-01-01T00:00:00.000Z' })
    .set('Authorization', `Bearer ${auditorToken}`)
  assert.equal(res.status, 200)
  assert.deepEqual(res.body.items, [])
  assert.equal(res.body.total, 0)
})

test('AUD-5: pagination → page 2 returns the remaining rows', async () => {
  const { auditorToken } = await seededAuditData()
  const res = await request(ctx.app)
    .get('/api/audit?page=2&pageSize=2')
    .set('Authorization', `Bearer ${auditorToken}`)
  assert.equal(res.status, 200)
  assert.equal(res.body.page, 2)
  assert.equal(res.body.pageSize, 2)
  // 5 rows: 2 login.success (aud1+op1) + 2 product creates + 1 login.failure.
  assert.equal(res.body.total, 5)
  assert.equal(res.body.items.length, 2, '5 total rows: 2 on page 1, 2 on page 2, 1 on page 3')
})

test('AUD-5: operator (no audit:read) → 403', async () => {
  const { operatorToken } = await seededAuditData()
  const res = await request(ctx.app)
    .get('/api/audit')
    .set('Authorization', `Bearer ${operatorToken}`)
  assert.equal(res.status, 403)
  assert.equal(res.body.error.code, 'FORBIDDEN')
})

test('AUD-5: no token → 401', async () => {
  const res = await request(ctx.app).get('/api/audit')
  assert.equal(res.status, 401)
  assert.equal(res.body.error.code, 'UNAUTHENTICATED')
})