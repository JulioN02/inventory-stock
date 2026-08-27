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

// W1 (verify-report): refresh rotation must be atomic. Concurrent refreshes
// with the SAME token must yield exactly one winner; the family invariant
// "one active token per family" must hold afterwards.
test('AUTH-3 (W1): concurrent refreshes with the same token → exactly one 200, one active token', async () => {
  await seedOperator()
  const ag = agent()
  const before = await login(ag)

  // Warm the pool: cold pg connections take ~100ms each to create, which would
  // SERIALIZE the burst (each request would see the winner's already-committed
  // rotation → family killed → 0 active). With connections ready, the 5 requests
  // reach the DB within a few ms of each other and the row lock does its job.
  await Promise.all(Array.from({ length: 8 }, () => ctx.pool.query('SELECT 1')))

  const attempts = Array.from({ length: 5 }, () =>
    request(ctx.app).post('/api/auth/refresh').set('Cookie', before.cookie).send({}),
  )
  const results = await Promise.all(attempts)

  const ok = results.filter((r) => r.status === 200)
  const unauthorized = results.filter((r) => r.status === 401)
  assert.equal(ok.length, 1, 'exactly one concurrent refresh wins the rotation')
  assert.equal(unauthorized.length, 4, 'the remaining concurrent refreshes are rejected with 401')

  const { rows } = await ctx.pool.query(
    `SELECT id, family_id, revoked_at FROM refresh_tokens ORDER BY created_at`,
  )
  const familyIds = new Set(rows.map((r: { family_id: string }) => r.family_id))
  assert.equal(familyIds.size, 1, 'rotation kept a single family')
  const active = rows.filter((r: { revoked_at: Date | null }) => r.revoked_at === null)
  assert.equal(active.length, 1, 'exactly one active token remains for the family')
})

// Triangulation: the winner's surviving token must still work (the family was
// not collateral-damaged by the concurrent losers).
test('AUTH-3 (W1): winner token from the concurrent burst remains usable', async () => {
  await seedOperator()
  const ag = agent()
  const before = await login(ag)
  await Promise.all(Array.from({ length: 8 }, () => ctx.pool.query('SELECT 1')))

  const results = await Promise.all(
    Array.from({ length: 5 }, () =>
      request(ctx.app).post('/api/auth/refresh').set('Cookie', before.cookie).send({}),
    ),
  )
  const winner = results.find((r) => r.status === 200)
  assert.ok(winner, 'exactly one request wins the rotation')
  const winnerCookie = (winner.headers['set-cookie'] as string[] | undefined)?.[0]
  assert.ok(winnerCookie, 'winner receives a rotated cookie')

  // The winner's new token is the single survivor — a follow-up refresh works.
  const followUp = await request(ctx.app)
    .post('/api/auth/refresh')
    .set('Cookie', winnerCookie)
    .send({})
  assert.equal(followUp.status, 200)
  assert.ok(typeof followUp.body.accessToken === 'string')
})

// Triangulation: reuse detection must still hold AFTER the concurrent burst —
// replaying the pre-burst token invalidates the family (winner's token too).
test('AUTH-3 (W1): replaying the original token after the burst → 401 and family invalidated', async () => {
  await seedOperator()
  const ag = agent()
  const before = await login(ag)
  await Promise.all(Array.from({ length: 8 }, () => ctx.pool.query('SELECT 1')))

  await Promise.all(
    Array.from({ length: 5 }, () =>
      request(ctx.app).post('/api/auth/refresh').set('Cookie', before.cookie).send({}),
    ),
  )

  const replay = await request(ctx.app)
    .post('/api/auth/refresh')
    .set('Cookie', before.cookie)
    .send({})
  assert.equal(replay.status, 401)
  assert.equal(replay.body.error.code, 'UNAUTHENTICATED')

  const { rows } = await ctx.pool.query(`SELECT revoked_at FROM refresh_tokens`)
  assert.equal(rows.length, 2)
  assert.ok(rows.every((r: { revoked_at: Date | null }) => r.revoked_at !== null), 'entire family revoked')
})