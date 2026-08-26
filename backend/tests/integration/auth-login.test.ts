import { beforeEach, test } from 'node:test'
import assert from 'node:assert/strict'
import request from 'supertest'
import jwt from 'jsonwebtoken'
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

test('AUTH-2: valid credentials → 200, access token in body, httpOnly refresh cookie', async () => {
  await createUser(ctx.pool, {
    username: 'maria',
    email: 'maria@test.local',
    password: 'MariaPass1',
    role: 'operator',
  })
  const res = await request(ctx.app)
    .post('/api/auth/login')
    .send({ username: 'maria', password: 'MariaPass1' })

  assert.equal(res.status, 200)
  const { user, accessToken } = res.body as { user: { role: string }; accessToken: string }
  assert.equal(user.role, 'operator')
  assert.ok(typeof accessToken === 'string' && accessToken.length > 20)

  const claims = jwt.decode(accessToken) as jwt.JwtPayload
  assert.equal(claims.sub, res.body.user.id)
  assert.equal(claims.username, 'maria')
  assert.equal(claims.role, 'operator')
  assert.equal(claims.typ, 'access')
  const ttl = (claims.exp ?? 0) - (claims.iat ?? 0)
  assert.equal(ttl, 15 * 60, 'access TTL is 15 minutes')

  const setCookie = res.headers['set-cookie'] as string[] | undefined
  assert.ok(setCookie && setCookie.length === 1, 'one Set-Cookie header expected')
  const cookie = setCookie[0]!
  assert.match(cookie, /^refresh_token=s%3A/, 'refresh token is a signed cookie')
  assert.match(cookie, /HttpOnly/)
  assert.match(cookie, /SameSite=Lax/)
  assert.match(cookie, /Path=\/api\/auth/)
  assert.match(cookie, /Max-Age=604800/, 'refresh cookie lives 7 days')
  assert.doesNotMatch(cookie, /Secure/, 'Secure flag is off in development')

  // Raw token never stored: DB holds the SHA-256 hash of the cookie value.
  const rawToken = cookie.split('=')[1]!.split(';')[0]!
  const { rows } = await ctx.pool.query(
    `SELECT token_hash, family_id, user_id, expires_at, revoked_at FROM refresh_tokens`,
  )
  assert.equal(rows.length, 1, 'one refresh token row persisted')
  assert.notEqual(rows[0].token_hash, rawToken, 'raw token must not be stored (AUTH-7)')
  assert.equal(rows[0].token_hash.length, 64, 'token_hash is SHA-256 hex')
  assert.equal(rows[0].user_id, res.body.user.id)
  assert.equal(rows[0].revoked_at, null, 'active token is not revoked')
})

test('AUTH-2: wrong password → 401, identical body to unknown user (no enumeration)', async () => {
  await createUser(ctx.pool, {
    username: 'carlos',
    email: 'carlos@test.local',
    password: 'CarlosPass1',
    role: 'viewer',
  })
  const wrongPassword = await request(ctx.app)
    .post('/api/auth/login')
    .send({ username: 'carlos', password: 'WrongPass99' })
  const unknownUser = await request(ctx.app)
    .post('/api/auth/login')
    .send({ username: 'ghost', password: 'Whatever1' })

  assert.equal(wrongPassword.status, 401)
  assert.equal(unknownUser.status, 401)
  assert.deepEqual(wrongPassword.body, unknownUser.body, 'identical response shape')
  assert.equal(wrongPassword.body.error.code, 'INVALID_CREDENTIALS')
})

test('AUTH-2: inactive user cannot log in', async () => {
  const { id } = await createUser(ctx.pool, {
    username: 'gone',
    email: 'gone@test.local',
    password: 'GonePass1',
    role: 'viewer',
  })
  await ctx.pool.query(`UPDATE users SET active = false WHERE id = $1`, [id])
  const res = await request(ctx.app)
    .post('/api/auth/login')
    .send({ username: 'gone', password: 'GonePass1' })
  assert.equal(res.status, 401)
  assert.equal(res.body.error.code, 'INVALID_CREDENTIALS')
})