import { beforeEach, test } from 'node:test'
import assert from 'node:assert/strict'
import request from 'supertest'
import { createTestContext } from '../helpers/testApp.ts'
import { resetDatabase } from '../helpers/db.ts'
import { createUser, adminToken } from '../helpers/users.ts'

const ctx = createTestContext()
beforeEach(async () => {
  await resetDatabase(ctx.pool)
})
test.after(async () => {
  await ctx.pool.end()
})

test('AUTH-1: valid registration → 201, bcrypt hash stored, default role viewer', async () => {
  const { token } = await adminToken(ctx.app, ctx.pool)
  const res = await request(ctx.app)
    .post('/api/auth/register')
    .set('Authorization', `Bearer ${token}`)
    .send({ username: 'julio', email: 'julio@test.local', password: 'Secret123' })

  assert.equal(res.status, 201)
  assert.equal(res.body.user.username, 'julio')
  assert.equal(res.body.user.email, 'julio@test.local')
  assert.equal(res.body.user.role, 'viewer')
  assert.equal(res.body.user.password_hash, undefined, 'hash must never be exposed')

  const { rows } = await ctx.pool.query(
    `SELECT u.password_hash, r.name AS role
     FROM users u JOIN user_roles ur ON ur.user_id = u.id JOIN roles r ON r.id = ur.role_id
     WHERE u.username = $1`,
    ['julio'],
  )
  assert.equal(rows.length, 1)
  assert.notEqual(rows[0].password_hash, 'Secret123', 'password never stored plaintext')
  assert.match(rows[0].password_hash, /^\$2[aby]\$\d+/, 'stored value is a bcrypt hash')
  assert.equal(rows[0].role, 'viewer')
})

test('AUTH-1: duplicate username → 409, no second user', async () => {
  const { token } = await adminToken(ctx.app, ctx.pool)
  const payload = { username: 'dupe', email: 'dupe@test.local', password: 'Secret123' }
  const first = await request(ctx.app)
    .post('/api/auth/register')
    .set('Authorization', `Bearer ${token}`)
    .send(payload)
  assert.equal(first.status, 201)

  const second = await request(ctx.app)
    .post('/api/auth/register')
    .set('Authorization', `Bearer ${token}`)
    .send({ ...payload, email: 'other@test.local' })
  assert.equal(second.status, 409)
  assert.equal(second.body.error.code, 'USERNAME_TAKEN')

  const { rows } = await ctx.pool.query(`SELECT COUNT(*)::int AS n FROM users WHERE username = $1`, [
    'dupe',
  ])
  assert.equal(rows[0].n, 1)
})

test('AUTH-1: weak password → 422 validation error', async () => {
  const { token } = await adminToken(ctx.app, ctx.pool)
  const res = await request(ctx.app)
    .post('/api/auth/register')
    .set('Authorization', `Bearer ${token}`)
    .send({ username: 'weak', email: 'weak@test.local', password: 'short' })
  assert.equal(res.status, 422)
  assert.equal(res.body.error.code, 'VALIDATION_ERROR')
  const { rows } = await ctx.pool.query(`SELECT COUNT(*)::int AS n FROM users WHERE username = $1`, [
    'weak',
  ])
  assert.equal(rows[0].n, 0, 'invalid user must not be persisted')
})

test('OQ-3: unauthenticated register → 401 (register is protected, not public)', async () => {
  const res = await request(ctx.app)
    .post('/api/auth/register')
    .send({ username: 'anon', email: 'anon@test.local', password: 'Secret123' })
  assert.equal(res.status, 401)
  assert.equal(res.body.error.code, 'UNAUTHENTICATED')
})

test('OQ-3: non-admin (viewer) register → 403', async () => {
  await createUser(ctx.pool, {
    username: 'viewer1',
    email: 'viewer1@test.local',
    password: 'ViewerPass1',
    role: 'viewer',
  })
  const token = await loginAndGetTokenViewer()
  const res = await request(ctx.app)
    .post('/api/auth/register')
    .set('Authorization', `Bearer ${token}`)
    .send({ username: 'hacker', email: 'hacker@test.local', password: 'Secret123' })
  assert.equal(res.status, 403)
  assert.equal(res.body.error.code, 'FORBIDDEN')
})

async function loginAndGetTokenViewer(): Promise<string> {
  const login = await request(ctx.app)
    .post('/api/auth/login')
    .send({ username: 'viewer1', password: 'ViewerPass1' })
  return login.body.accessToken as string
}