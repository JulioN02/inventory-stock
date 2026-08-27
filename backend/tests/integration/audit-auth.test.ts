import { beforeEach, test } from 'node:test'
import assert from 'node:assert/strict'
import request from 'supertest'
import type { Pool } from 'pg'
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

test('AUD-3: login success → auth.login.success row with safe payload (AUD-6)', async () => {
  const { id } = await createUser(ctx.pool, {
    username: 'maria',
    email: 'maria@test.local',
    password: 'MariaPass1',
    role: 'operator',
  })
  const res = await request(ctx.app)
    .post('/api/auth/login')
    .send({ username: 'maria', password: 'MariaPass1' })
  assert.equal(res.status, 200)

  const row = await lastAudit(ctx.pool, 'auth.login.success')
  assert.ok(row, 'audit row must exist for the successful login')
  assert.equal(row.actor_type, 'user')
  assert.equal(row.actor_user_id, id)
  assert.equal(row.entity_type, 'user')
  assert.equal(row.entity_id, id)
  assert.deepEqual(row.payload, { username: 'maria', outcome: 'success' })

  // AUD-6: no credential material anywhere in the audit row.
  const serialized = JSON.stringify(row)
  assert.doesNotMatch(serialized, /MariaPass1/i, 'password must never appear in the audit row')
  assert.doesNotMatch(serialized, /(password|token|hash|secret)/i, 'no credential-like keys in the payload')
})

test('AUD-3: wrong password → identical 401 AND auth.login.failure row', async () => {
  const { id } = await createUser(ctx.pool, {
    username: 'carlos',
    email: 'carlos@test.local',
    password: 'CarlosPass1',
    role: 'viewer',
  })
  const res = await request(ctx.app)
    .post('/api/auth/login')
    .send({ username: 'carlos', password: 'WrongPass99' })
  assert.equal(res.status, 401)
  assert.equal(res.body.error.code, 'INVALID_CREDENTIALS')

  const row = await lastAudit(ctx.pool, 'auth.login.failure')
  assert.ok(row, 'failed login must still be audited')
  assert.equal(row.actor_type, 'user')
  assert.equal(row.actor_user_id, id)
  assert.deepEqual(row.payload, { username: 'carlos', outcome: 'failure' })
  assert.doesNotMatch(JSON.stringify(row), /WrongPass99|CarlosPass1/i, 'passwords never logged')
})

test('AUD-3: unknown user → identical 401 AND anonymous auth.login.failure row', async () => {
  const res = await request(ctx.app)
    .post('/api/auth/login')
    .send({ username: 'ghost', password: 'Whatever1' })
  assert.equal(res.status, 401)

  const row = await lastAudit(ctx.pool, 'auth.login.failure')
  assert.ok(row)
  assert.equal(row.actor_type, 'anonymous')
  assert.equal(row.actor_user_id, null)
  assert.deepEqual(row.payload, { username: 'ghost', outcome: 'failure' })
})

test('AUD-3: refresh reuse → auth.refresh.reuse row with family invalidation marker', async () => {
  const { id } = await createUser(ctx.pool, {
    username: 'op1',
    email: 'op1@test.local',
    password: 'Operator1',
    role: 'operator',
  })
  const ag: Agent = request.agent(ctx.app)
  const login = await ag.post('/api/auth/login').send({ username: 'op1', password: 'Operator1' })
  assert.equal(login.status, 200)
  const beforeCookie = (login.headers['set-cookie'] as string[] | undefined)?.[0] ?? ''

  const rotated = await ag.post('/api/auth/refresh').send({})
  assert.equal(rotated.status, 200)

  // Replay the pre-rotation cookie → reuse detected → family invalidated.
  const replayed = await request(ctx.app)
    .post('/api/auth/refresh')
    .set('Cookie', beforeCookie)
    .send({})
  assert.equal(replayed.status, 401)

  const row = await lastAudit(ctx.pool, 'auth.refresh.reuse')
  assert.ok(row, 'reuse event must be audited')
  assert.equal(row.actor_type, 'user')
  assert.equal(row.actor_user_id, id)
  assert.equal(row.payload.outcome, 'family_invalidated')
  assert.ok(typeof row.payload.family_id === 'string' && row.payload.family_id.length === 36)

  // The audited family is the one that got invalidated.
  const { rows } = await ctx.pool.query(
    `SELECT DISTINCT family_id FROM refresh_tokens WHERE user_id = $1`,
    [id],
  )
  const familyId = (rows[0] as { family_id: string }).family_id
  assert.equal(row.payload.family_id, familyId, 'marker points at the invalidated family')
})

test('AUD-3: permission denied → auth.permission.denied row (best-effort, still 403)', async () => {
  await createUser(ctx.pool, {
    username: 'v1',
    email: 'v1@test.local',
    password: 'Viewer1',
    role: 'viewer', // viewer has NO catalog:create
  })
  const login = await request(ctx.app)
    .post('/api/auth/login')
    .send({ username: 'v1', password: 'Viewer1' })
  const token = login.body.accessToken as string

  const res = await request(ctx.app)
    .post('/api/products')
    .set('Authorization', `Bearer ${token}`)
    .send({ sku: 'SKU-NOPE', name: 'Nope', unit: 'unit', price: '1.00' })
  assert.equal(res.status, 403)

  const row = await lastAudit(ctx.pool, 'auth.permission.denied')
  assert.ok(row, 'denied permission must be audited best-effort')
  assert.equal(row.actor_type, 'user')
  assert.equal(row.actor_user_id, login.body.user.id)
  assert.equal(row.payload.permission, 'catalog:create')
})

test('AUD-3: logout → auth.logout row with the actor', async () => {
  const { id } = await createUser(ctx.pool, {
    username: 'op2',
    email: 'op2@test.local',
    password: 'Operator1',
    role: 'operator',
  })
  const ag: Agent = request.agent(ctx.app)
  const login = await ag.post('/api/auth/login').send({ username: 'op2', password: 'Operator1' })
  assert.equal(login.status, 200)

  const res = await ag.post('/api/auth/logout').send({})
  assert.equal(res.status, 200)

  const row = await lastAudit(ctx.pool, 'auth.logout')
  assert.ok(row, 'logout must be audited')
  assert.equal(row.actor_type, 'user')
  assert.equal(row.actor_user_id, id)
  assert.equal(row.payload.outcome, 'success')
})