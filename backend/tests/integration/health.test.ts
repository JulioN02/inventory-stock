import { test } from 'node:test'
import assert from 'node:assert/strict'
import request from 'supertest'
import { createTestContext } from '../helpers/testApp.ts'

test('GET /api/health returns 200 with status ok', async () => {
  const ctx = createTestContext()
  try {
    const res = await request(ctx.app).get('/api/health')
    assert.equal(res.status, 200)
    assert.deepEqual(res.body, { status: 'ok' })
  } finally {
    await ctx.pool.end()
  }
})

test('unknown route returns uniform 404 error shape', async () => {
  const ctx = createTestContext()
  try {
    const res = await request(ctx.app).get('/api/nope')
    assert.equal(res.status, 404)
    assert.equal(res.body.error.code, 'NOT_FOUND')
  } finally {
    await ctx.pool.end()
  }
})