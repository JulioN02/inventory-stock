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

test('CAT-1: valid product → 201, price as string, SKU upper-normalized', async () => {
  const token = await operatorToken()
  const res = await request(ctx.app)
    .post('/api/products')
    .set('Authorization', `Bearer ${token}`)
    .send({ sku: 'sku-abc-1', name: 'Widget', unit: 'unit', price: '9.99' })

  assert.equal(res.status, 201)
  const product = res.body.product as {
    sku: string
    name: string
    unit: string
    price: string
    active: boolean
  }
  assert.equal(product.sku, 'SKU-ABC-1', 'SKU normalized to upper case')
  assert.equal(product.name, 'Widget')
  assert.equal(product.unit, 'unit')
  assert.equal(product.price, '9.99', 'numeric serialized as string (no float drift)')
  assert.equal(typeof product.price, 'string')
  assert.equal(product.active, true)
})

test('CAT-1: duplicate SKU → 409', async () => {
  const token = await operatorToken()
  const payload = { sku: 'SKU-DUP', name: 'First', unit: 'unit', price: '1.00' }
  const first = await request(ctx.app)
    .post('/api/products')
    .set('Authorization', `Bearer ${token}`)
    .send(payload)
  assert.equal(first.status, 201)
  const second = await request(ctx.app)
    .post('/api/products')
    .set('Authorization', `Bearer ${token}`)
    .send({ ...payload, name: 'Second' })
  assert.equal(second.status, 409)
  assert.equal(second.body.error.code, 'SKU_TAKEN')
})

test('CAT-1: price with 3 decimals → 422', async () => {
  const token = await operatorToken()
  const res = await request(ctx.app)
    .post('/api/products')
    .set('Authorization', `Bearer ${token}`)
    .send({ sku: 'SKU-P3', name: 'Bad Price', unit: 'unit', price: '9.999' })
  assert.equal(res.status, 422)
  assert.equal(res.body.error.code, 'VALIDATION_ERROR')
})

test('CAT-2: update name+price → 200 with updated values', async () => {
  const token = await operatorToken()
  const created = await request(ctx.app)
    .post('/api/products')
    .set('Authorization', `Bearer ${token}`)
    .send({ sku: 'SKU-U1', name: 'Old Name', unit: 'kg', price: '2.50' })
  const id = created.body.product.id as string

  const res = await request(ctx.app)
    .patch(`/api/products/${id}`)
    .set('Authorization', `Bearer ${token}`)
    .send({ name: 'New Name', price: '3.75' })
  assert.equal(res.status, 200)
  assert.equal(res.body.product.name, 'New Name')
  assert.equal(res.body.product.price, '3.75')
  assert.equal(res.body.product.sku, 'SKU-U1')
})

test('CAT-2: rename SKU to an existing SKU → 409', async () => {
  const token = await operatorToken()
  await request(ctx.app)
    .post('/api/products')
    .set('Authorization', `Bearer ${token}`)
    .send({ sku: 'SKU-A', name: 'A', unit: 'unit', price: '1.00' })
  const b = await request(ctx.app)
    .post('/api/products')
    .set('Authorization', `Bearer ${token}`)
    .send({ sku: 'SKU-B', name: 'B', unit: 'unit', price: '1.00' })

  const res = await request(ctx.app)
    .patch(`/api/products/${b.body.product.id}`)
    .set('Authorization', `Bearer ${token}`)
    .send({ sku: 'sku-a' })
  assert.equal(res.status, 409)
  assert.equal(res.body.error.code, 'SKU_TAKEN')
})

test('CAT-2: payload includes `stock` → 422 rejected by DTO (stock is derived)', async () => {
  const token = await operatorToken()
  const created = await request(ctx.app)
    .post('/api/products')
    .set('Authorization', `Bearer ${token}`)
    .send({ sku: 'SKU-S1', name: 'S', unit: 'unit', price: '1.00' })
  const res = await request(ctx.app)
    .patch(`/api/products/${created.body.product.id}`)
    .set('Authorization', `Bearer ${token}`)
    .send({ stock: 5 })
  assert.equal(res.status, 422)
  assert.equal(res.body.error.code, 'VALIDATION_ERROR')
})

test('CAT-3: list with pagination → correct page and total', async () => {
  const token = await operatorToken()
  for (let i = 1; i <= 5; i++) {
    await request(ctx.app)
      .post('/api/products')
      .set('Authorization', `Bearer ${token}`)
      .send({ sku: `SKU-PG-${i}`, name: `Product ${i}`, unit: 'unit', price: `${i}.00` })
  }
  const page1 = await request(ctx.app)
    .get('/api/products?page=1&pageSize=2')
    .set('Authorization', `Bearer ${token}`)
  assert.equal(page1.status, 200)
  assert.equal(page1.body.items.length, 2)
  assert.equal(page1.body.total, 5)
  assert.equal(page1.body.page, 1)

  const page3 = await request(ctx.app)
    .get('/api/products?page=3&pageSize=2')
    .set('Authorization', `Bearer ${token}`)
  assert.equal(page3.body.items.length, 1)
  assert.equal(page3.body.items[0].sku, 'SKU-PG-5', 'ascending creation order fills page 3')
})

test('CAT-3: search partial SKU → only matching products', async () => {
  const token = await operatorToken()
  await request(ctx.app)
    .post('/api/products')
    .set('Authorization', `Bearer ${token}`)
    .send({ sku: 'SKU-FIND-ME', name: 'Target', unit: 'unit', price: '1.00' })
  await request(ctx.app)
    .post('/api/products')
    .set('Authorization', `Bearer ${token}`)
    .send({ sku: 'SKU-OTHER', name: 'Other', unit: 'unit', price: '1.00' })

  const res = await request(ctx.app)
    .get('/api/products?search=FIND')
    .set('Authorization', `Bearer ${token}`)
  assert.equal(res.status, 200)
  assert.equal(res.body.items.length, 1)
  assert.equal(res.body.items[0].sku, 'SKU-FIND-ME')
})

test('CAT-3: page beyond data → empty array, 200', async () => {
  const token = await operatorToken()
  const res = await request(ctx.app)
    .get('/api/products?page=99&pageSize=20')
    .set('Authorization', `Bearer ${token}`)
  assert.equal(res.status, 200)
  assert.deepEqual(res.body.items, [])
  assert.equal(res.body.total, 0)
})

test('CAT-4: deactivate → 200 active=false, excluded from default list, visible with include_inactive', async () => {
  const token = await operatorToken()
  const created = await request(ctx.app)
    .post('/api/products')
    .set('Authorization', `Bearer ${token}`)
    .send({ sku: 'SKU-DEACT', name: 'Doomed', unit: 'unit', price: '1.00' })
  const id = created.body.product.id as string

  const res = await request(ctx.app)
    .delete(`/api/products/${id}`)
    .set('Authorization', `Bearer ${token}`)
  assert.equal(res.status, 200)
  assert.equal(res.body.product.active, false, 'soft deactivate only')

  const list = await request(ctx.app)
    .get('/api/products')
    .set('Authorization', `Bearer ${token}`)
  assert.equal(list.body.items.length, 0, 'inactive excluded by default')

  const withInactive = await request(ctx.app)
    .get('/api/products?include_inactive=true')
    .set('Authorization', `Bearer ${token}`)
  assert.equal(withInactive.body.items.length, 1, 'history preserved via include_inactive')
  assert.equal(withInactive.body.items[0].active, false)
})

test('CAT-1: invalid unit → 422', async () => {
  const token = await operatorToken()
  const res = await request(ctx.app)
    .post('/api/products')
    .set('Authorization', `Bearer ${token}`)
    .send({ sku: 'SKU-UNIT', name: 'Bad Unit', unit: 'pallet', price: '1.00' })
  assert.equal(res.status, 422)
})

test('CAT-7: negative price → 422', async () => {
  const token = await operatorToken()
  const res = await request(ctx.app)
    .post('/api/products')
    .set('Authorization', `Bearer ${token}`)
    .send({ sku: 'SKU-NEG', name: 'Negative', unit: 'unit', price: '-1.00' })
  assert.equal(res.status, 422)
})