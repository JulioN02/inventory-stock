import { beforeEach, test } from 'node:test'
import assert from 'node:assert/strict'
import { createTestContext } from '../helpers/testApp.ts'
import { resetDatabase } from '../helpers/db.ts'

const ctx = createTestContext()
beforeEach(async () => {
  await resetDatabase(ctx.pool)
})
test.after(async () => {
  await ctx.pool.end()
})

async function seedAuditRow(): Promise<string> {
  const { rows } = await ctx.pool.query(
    `INSERT INTO audit_log (actor_type, action, payload)
     VALUES ('system', 'test.seed', '{"note":"immutability probe"}') RETURNING id`,
  )
  return String((rows[0] as { id: string }).id)
}

test('AUD-4: UPDATE on audit_log → DB error (append-only trigger)', async () => {
  const id = await seedAuditRow()
  await assert.rejects(
    ctx.pool.query(`UPDATE audit_log SET action = 'test.tampered' WHERE id = $1`, [id]),
    /append-only/,
    'UPDATE must be rejected by the trigger',
  )
  const { rows } = await ctx.pool.query(`SELECT action FROM audit_log WHERE id = $1`, [id])
  assert.equal((rows[0] as { action: string }).action, 'test.seed', 'row untouched after failed UPDATE')
})

test('AUD-4: DELETE on audit_log → DB error (append-only trigger)', async () => {
  const id = await seedAuditRow()
  await assert.rejects(
    ctx.pool.query(`DELETE FROM audit_log WHERE id = $1`, [id]),
    /append-only/,
    'DELETE must be rejected by the trigger',
  )
  const { rows } = await ctx.pool.query(`SELECT COUNT(*)::int AS n FROM audit_log WHERE id = $1`, [id])
  assert.equal((rows[0] as { n: number }).n, 1, 'row still present after failed DELETE')
})

test('AUD-4: INSERT on audit_log is allowed', async () => {
  const { rows } = await ctx.pool.query(
    `INSERT INTO audit_log (actor_type, action) VALUES ('system', 'test.insert-ok') RETURNING id`,
  )
  assert.equal(rows.length, 1, 'INSERT is the only permitted write')
})