import { beforeEach, test } from 'node:test'
import assert from 'node:assert/strict'
import request from 'supertest'
import jwt from 'jsonwebtoken'
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

function signAccess(overrides: Partial<jwt.JwtPayload> = {}): string {
  return jwt.sign(
    { sub: 'u1', username: 'alice', role: 'viewer', typ: 'access', ...overrides },
    ctx.jwtSecret,
    { expiresIn: 60 },
  )
}

test('AUTH-5: valid Bearer token proceeds (GET /api/products → 200)', async () => {
  await createUser(ctx.pool, {
    username: 'alice',
    email: 'alice@test.local',
    password: 'AlicePass1',
    role: 'viewer',
  })
  const token = await loginAndGetToken(ctx.app, 'alice', 'AlicePass1')
  const res = await request(ctx.app)
    .get('/api/products')
    .set('Authorization', `Bearer ${token}`)
  assert.equal(res.status, 200)
})

test('AUTH-5: expired token → 401 UNAUTHENTICATED', async () => {
  const expired = jwt.sign(
    { sub: 'u1', username: 'alice', role: 'viewer', typ: 'access' },
    ctx.jwtSecret,
    { expiresIn: -10 },
  )
  const res = await request(ctx.app)
    .get('/api/products')
    .set('Authorization', `Bearer ${expired}`)
  assert.equal(res.status, 401)
  assert.equal(res.body.error.code, 'UNAUTHENTICATED')
})

test('AUTH-5: malformed token → 401', async () => {
  const res = await request(ctx.app)
    .get('/api/products')
    .set('Authorization', 'Bearer not.a.jwt')
  assert.equal(res.status, 401)
  assert.equal(res.body.error.code, 'UNAUTHENTICATED')
})

test('AUTH-5: missing token → 401', async () => {
  const res = await request(ctx.app).get('/api/products')
  assert.equal(res.status, 401)
  assert.equal(res.body.error.code, 'UNAUTHENTICATED')
})

test('AUTH-5: refresh token cannot be used as an access token → 401', async () => {
  await createUser(ctx.pool, {
    username: 'bob',
    email: 'bob@test.local',
    password: 'BobPass1',
    role: 'viewer',
  })
  const login = await request(ctx.app).post('/api/auth/login').send({ username: 'bob', password: 'BobPass1' })
  const cookie = (login.headers['set-cookie'] as string[] | undefined)?.[0] ?? ''
  const rawRefresh = cookie.split('=')[1]!.split(';')[0]!.replace(/^s:/, '')
  const res = await request(ctx.app)
    .get('/api/products')
    .set('Authorization', `Bearer ${rawRefresh}`)
  assert.equal(res.status, 401)
})

test('AUTH-6: operator creates a product → 201', async () => {
  await createUser(ctx.pool, {
    username: 'op1',
    email: 'op1@test.local',
    password: 'Operator1',
    role: 'operator',
  })
  const token = await loginAndGetToken(ctx.app, 'op1', 'Operator1')
  const res = await request(ctx.app)
    .post('/api/products')
    .set('Authorization', `Bearer ${token}`)
    .send({ sku: 'SKU-OP-1', name: 'Operator Widget', unit: 'unit', price: '5.00' })
  assert.equal(res.status, 201)
})

test('AUTH-6: viewer create → 403 (authenticated, unauthorized)', async () => {
  await createUser(ctx.pool, {
    username: 'viewer1',
    email: 'viewer1@test.local',
    password: 'ViewerPass1',
    role: 'viewer',
  })
  const token = await loginAndGetToken(ctx.app, 'viewer1', 'ViewerPass1')
  const res = await request(ctx.app)
    .post('/api/products')
    .set('Authorization', `Bearer ${token}`)
    .send({ sku: 'SKU-X', name: 'Nope', unit: 'unit', price: '1.00' })
  assert.equal(res.status, 403)
  assert.equal(res.body.error.code, 'FORBIDDEN')
})

test('AUTH-6: unauthenticated request to protected route → 401, never 403', async () => {
  const res = await request(ctx.app)
    .post('/api/products')
    .send({ sku: 'SKU-X', name: 'Nope', unit: 'unit', price: '1.00' })
  assert.equal(res.status, 401)
  assert.equal(res.body.error.code, 'UNAUTHENTICATED')
})

test('AUTH-5/6: admin bypass — admin can access protected route', async () => {
  await createUser(ctx.pool, {
    username: 'root',
    email: 'root@test.local',
    password: 'RootPass1',
    role: 'admin',
  })
  const token = await loginAndGetToken(ctx.app, 'root', 'RootPass1')
  const res = await request(ctx.app)
    .post('/api/products')
    .set('Authorization', `Bearer ${token}`)
    .send({ sku: 'SKU-ADMIN', name: 'Admin Widget', unit: 'unit', price: '9.99' })
  assert.equal(res.status, 201)
})

test('AUTH-5: stale JWT claim (invalid role shape) rejected', async () => {
  const res = await request(ctx.app)
    .get('/api/products')
    .set('Authorization', `Bearer ${signAccess({ role: undefined })}`)
  assert.equal(res.status, 401)
})