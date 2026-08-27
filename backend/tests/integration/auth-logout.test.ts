import { beforeEach, test } from 'node:test'
import assert from 'node:assert/strict'
import request from 'supertest'
import { createTestContext } from '../helpers/testApp.ts'
import { resetDatabase } from '../helpers/db.ts'
import { createUser } from '../helpers/users.ts'

const ctx = createTestContext()
beforeEach(async () => {
  await resetDatabase(ctx.pool)
})
test.after(async () => {
  await ctx.pool.end()
})

test('AUTH-4: logout revokes the refresh row and clears the cookie', async () => {
  await createUser(ctx.pool, {
    username: 'ana',
    email: 'ana@test.local',
    password: 'AnaPass1',
    role: 'viewer',
  })
  const ag = request.agent(ctx.app)
  const login = await ag.post('/api/auth/login').send({ username: 'ana', password: 'AnaPass1' })
  assert.equal(login.status, 200)

  const logout = await ag.post('/api/auth/logout').send({})
  assert.equal(logout.status, 200)
  assert.deepEqual(logout.body, { ok: true })
  const setCookie = logout.headers['set-cookie'] as string[] | undefined
  assert.ok(setCookie && setCookie.length === 1, 'cookie cleared')
  assert.match(setCookie[0]!, /refresh_token=;/, 'cookie value emptied')
  // Express clears via Expires=epoch (and/or Max-Age=0 depending on version)
  assert.match(
    setCookie[0]!,
    /(Max-Age=0|Expires=Thu, 01 Jan 1970)/,
    'cookie expires immediately',
  )

  // Refresh with the (now revoked) session cookie → 401.
  const refresh = await ag.post('/api/auth/refresh').send({})
  assert.equal(refresh.status, 401)
  const { rows } = await ctx.pool.query(`SELECT revoked_at FROM refresh_tokens`)
  assert.equal(rows.length, 1)
  assert.ok(rows[0].revoked_at !== null, 'refresh row revoked server-side')
})

test('AUTH-4: logout twice → 200 both times (idempotent)', async () => {
  const first = await request(ctx.app).post('/api/auth/logout').send({})
  const second = await request(ctx.app).post('/api/auth/logout').send({})
  assert.equal(first.status, 200)
  assert.equal(second.status, 200)
})