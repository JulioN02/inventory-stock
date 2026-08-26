import { beforeEach, test } from 'node:test'
import assert from 'node:assert/strict'
import request from 'supertest'
import jwt from 'jsonwebtoken'
import { createTestContext } from '../helpers/testApp.ts'
import { resetDatabase } from '../helpers/db.ts'
import { createUser } from '../helpers/users.ts'

type Agent = ReturnType<typeof request.agent>

const ctx = createTestContext()
beforeEach(async () => {
  await resetDatabase(ctx.pool)
})
test.after(async () => {
  await ctx.pool.end()
})

async function seedOperator(): Promise<void> {
  await createUser(ctx.pool, {
    username: 'op1',
    email: 'op1@test.local',
    password: 'Operator1',
    role: 'operator',
  })
}

function agent(): Agent {
  return request.agent(ctx.app)
}

async function login(ag: Agent): Promise<{ accessToken: string; cookie: string }> {
  const res = await ag.post('/api/auth/login').send({ username: 'op1', password: 'Operator1' })
  assert.equal(res.status, 200)
  const setCookie = res.headers['set-cookie'] as string[] | undefined
  const cookie = setCookie?.[0] ?? ''
  return { accessToken: res.body.accessToken as string, cookie }
}

test('AUTH-3: valid refresh → 200 with new access token + rotated cookie', async () => {
  await seedOperator()
  const ag = agent()
  const before = await login(ag)

  const res = await ag.post('/api/auth/refresh').send({})
  assert.equal(res.status, 200)
  assert.ok(typeof res.body.accessToken === 'string')
  assert.notEqual(res.body.accessToken, before.accessToken, 'new access token issued')
  const setCookie = res.headers['set-cookie'] as string[] | undefined
  assert.ok(setCookie && setCookie.length === 1)
  assert.notEqual(setCookie[0], before.cookie, 'cookie rotated to a new value')

  // Old row revoked with replaced_by set; new row in the SAME family.
  const { rows } = await ctx.pool.query(
    `SELECT id, family_id, revoked_at, replaced_by FROM refresh_tokens ORDER BY created_at`,
  )
  assert.equal(rows.length, 2)
  assert.equal(rows[0].family_id, rows[1].family_id, 'rotation keeps the family')
  assert.ok(rows[0].revoked_at !== null, 'old token revoked')
  assert.equal(rows[0].replaced_by, rows[1].id, 'old row points to the new jti')
  assert.equal(rows[1].revoked_at, null, 'new token active')
})

test('AUTH-3: replayed rotated token → 401 AND family invalidated (sibling rejected)', async () => {
  await seedOperator()
  const ag = agent()
  const before = await login(ag)

  const rotated = await ag.post('/api/auth/refresh').send({})
  assert.equal(rotated.status, 200)
  const siblingCookie = (rotated.headers['set-cookie'] as string[] | undefined)?.[0] ?? ''

  // Replay the pre-rotation cookie → reuse detected → 401.
  const replayed = await request(ctx.app)
    .post('/api/auth/refresh')
    .set('Cookie', before.cookie)
    .send({})
  assert.equal(replayed.status, 401)

  // Family invalidated: the valid sibling (post-rotation cookie) is now rejected too.
  const sibling = await request(ctx.app)
    .post('/api/auth/refresh')
    .set('Cookie', siblingCookie)
    .send({})
  assert.equal(sibling.status, 401)
  assert.equal(sibling.body.error.code, 'UNAUTHENTICATED')

  const { rows } = await ctx.pool.query(`SELECT revoked_at FROM refresh_tokens`)
  assert.equal(rows.length, 2)
  assert.ok(rows.every((r: { revoked_at: Date | null }) => r.revoked_at !== null), 'entire family revoked')
})

test('AUTH-3: no cookie → 401', async () => {
  const res = await request(ctx.app).post('/api/auth/refresh').send({})
  assert.equal(res.status, 401)
  assert.equal(res.body.error.code, 'UNAUTHENTICATED')
})

test('AUTH-3: expired refresh token → 401', async () => {
  await seedOperator()
  const { id } = await createUser(ctx.pool, {
    username: 'tmp',
    email: 'tmp@test.local',
    password: 'TmpPass1',
    role: 'viewer',
  })
  const expired = jwt.sign(
    { sub: id, jti: '11111111-1111-4111-8111-111111111111', fam: '22222222-2222-4222-8222-222222222222', typ: 'refresh' },
    ctx.jwtSecret,
    { expiresIn: -60 },
  )
  const res = await request(ctx.app)
    .post('/api/auth/refresh')
    .set('Cookie', `refresh_token=s%3A${expired}.sig`)
    .send({})
  assert.equal(res.status, 401)
})