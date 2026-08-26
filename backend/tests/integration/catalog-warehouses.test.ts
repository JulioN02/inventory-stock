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

async function operatorToken(): Promise<string> {
  await createUser(ctx.pool, {
    username: 'op1',
    email: 'op1@test.local',
    password: 'Operator1',
    role: 'operator',
  })
  return loginAndGetToken(ctx.app, 'op1', 'Operator1')
}

test('CAT-5: valid warehouse → 201', async () => {
  const token = await operatorToken()
  const res = await request(ctx.app)
    .post('/api/warehouses')
    .set('Authorization', `Bearer ${token}`)
    .send({ name: 'Main Warehouse', code: 'WH-MAIN' })
  assert.equal(res.status, 201)
  assert.equal(res.body.warehouse.name, 'Main Warehouse')
  assert.equal(res.body.warehouse.code, 'WH-MAIN')
  assert.equal(res.body.warehouse.active, true)
})

test('CAT-5: duplicate name → 409', async () => {
  const token = await operatorToken()
  const first = await request(ctx.app)
    .post('/api/warehouses')
    .set('Authorization', `Bearer ${token}`)
    .send({ name: 'Same Name', code: 'WH-1' })
  assert.equal(first.status, 201)
  const second = await request(ctx.app)
    .post('/api/warehouses')
    .set('Authorization', `Bearer ${token}`)
    .send({ name: 'Same Name', code: 'WH-2' })
  assert.equal(second.status, 409)
  assert.equal(second.body.error.code, 'WAREHOUSE_NAME_TAKEN')
})

test('CAT-5: duplicate code → 409', async () => {
  const token = await operatorToken()
  const first = await request(ctx.app)
    .post('/api/warehouses')
    .set('Authorization', `Bearer ${token}`)
    .send({ name: 'One', code: 'WH-DUP' })
  assert.equal(first.status, 201)
  const second = await request(ctx.app)
    .post('/api/warehouses')
    .set('Authorization', `Bearer ${token}`)
    .send({ name: 'Two', code: 'WH-DUP' })
  assert.equal(second.status, 409)
  assert.equal(second.body.error.code, 'WAREHOUSE_CODE_TAKEN')
})

test('CAT-6: update warehouse → 200', async () => {
  const token = await operatorToken()
  const created = await request(ctx.app)
    .post('/api/warehouses')
    .set('Authorization', `Bearer ${token}`)
    .send({ name: 'Old Name', code: 'WH-U' })
  const res = await request(ctx.app)
    .patch(`/api/warehouses/${created.body.warehouse.id}`)
    .set('Authorization', `Bearer ${token}`)
    .send({ name: 'New Name' })
  assert.equal(res.status, 200)
  assert.equal(res.body.warehouse.name, 'New Name')
  assert.equal(res.body.warehouse.code, 'WH-U')
})

test('CAT-6: list filters active correctly', async () => {
  const token = await operatorToken()
  const active = await request(ctx.app)
    .post('/api/warehouses')
    .set('Authorization', `Bearer ${token}`)
    .send({ name: 'Active WH', code: 'WH-A' })
  await request(ctx.app)
    .post('/api/warehouses')
    .set('Authorization', `Bearer ${token}`)
    .send({ name: 'Dormant WH', code: 'WH-D' })
  await request(ctx.app)
    .delete(`/api/warehouses/${active.body.warehouse.id}`)
    .set('Authorization', `Bearer ${token}`)

  const list = await request(ctx.app)
    .get('/api/warehouses')
    .set('Authorization', `Bearer ${token}`)
  assert.equal(list.status, 200)
  assert.equal(list.body.items.length, 1, 'only active by default')
  assert.equal(list.body.items[0].code, 'WH-D')
  assert.equal(list.body.total, 1)

  const all = await request(ctx.app)
    .get('/api/warehouses?include_inactive=true')
    .set('Authorization', `Bearer ${token}`)
  assert.equal(all.body.items.length, 2, 'inactive included on demand')
})

test('CAT-6: soft deactivate → 200 active=false, history intact', async () => {
  const token = await operatorToken()
  const created = await request(ctx.app)
    .post('/api/warehouses')
    .set('Authorization', `Bearer ${token}`)
    .send({ name: 'To Deactivate', code: 'WH-X' })
  const res = await request(ctx.app)
    .delete(`/api/warehouses/${created.body.warehouse.id}`)
    .set('Authorization', `Bearer ${token}`)
  assert.equal(res.status, 200)
  assert.equal(res.body.warehouse.active, false)

  const all = await request(ctx.app)
    .get('/api/warehouses?include_inactive=true')
    .set('Authorization', `Bearer ${token}`)
  assert.equal(all.body.items.length, 1, 'row still present (no hard delete)')
})