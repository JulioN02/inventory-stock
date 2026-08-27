import { beforeEach, test } from 'node:test'
import assert from 'node:assert/strict'
import request from 'supertest'
import { createTestContext } from '../helpers/testApp.ts'
import { resetDatabase } from '../helpers/db.ts'
import { createUser, loginAndGetToken } from '../helpers/users.ts'
import { createProduct, createWarehouse, registerMovement, stockAt } from '../helpers/stock.ts'

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

/** One receiving row + one sale row in the ledger. Returns the movement ids. */
async function seeded(): Promise<{ token: string; productId: string; warehouseId: string; saleId: string }> {
  const token = await operatorToken()
  const productId = await createProduct(ctx.app, token, 'SKU-IMM')
  const warehouseId = await createWarehouse(ctx.app, token, 'WH-IMM')
  await registerMovement(ctx.app, token, {
    product_id: productId,
    warehouse_id: warehouseId,
    quantity: '5.0',
    type: 'receiving',
    idempotency_key: '11111111-1111-4111-8111-111111111111',
  })
  const sale = await registerMovement(ctx.app, token, {
    product_id: productId,
    warehouse_id: warehouseId,
    quantity: '2.0',
    type: 'sale',
    idempotency_key: '22222222-2222-4222-8222-222222222222',
  })
  return { token, productId, warehouseId, saleId: sale.body.movement.id as string }
}

test('MOV-9: UPDATE on movements → DB error (append-only trigger)', async () => {
  const { productId, warehouseId, saleId } = await seeded()
  await assert.rejects(
    ctx.pool.query(`UPDATE movements SET quantity = 99.0 WHERE id = $1`, [saleId]),
    /append-only/,
    'UPDATE must be rejected by the trigger',
  )
  assert.equal(await stockAt(ctx.pool, productId, warehouseId), '3.0', 'data intact after failed UPDATE')
})

test('MOV-9: DELETE on movements → DB error (append-only trigger)', async () => {
  const { saleId } = await seeded()
  await assert.rejects(
    ctx.pool.query(`DELETE FROM movements WHERE id = $1`, [saleId]),
    /append-only/,
    'DELETE must be rejected by the trigger',
  )
  const { rows } = await ctx.pool.query(`SELECT COUNT(*)::int AS n FROM movements`)
  assert.equal((rows[0] as { n: number }).n, 2, 'both rows still present after failed DELETE')
})

test('MOV-1: raw INSERT with incoherent sign/type → DB CHECK violation (23514)', async () => {
  const { productId, warehouseId } = await seeded()
  const insert = `INSERT INTO movements (product_id, warehouse_id, quantity, sign, type) VALUES ($1, $2, 5.0, $3, $4)`
  for (const [sign, type] of [
    [-1, 'receiving'], // receiving must be +1
    [1, 'sale'], // sale must be -1
    [-1, 'transfer_in'], // transfer_in must be +1
    [1, 'transfer_out'], // transfer_out must be -1
  ] as Array<[number, string]>) {
    const err = await ctx.pool.query(insert, [productId, warehouseId, sign, type]).catch((e: unknown) => e)
    assert.ok(err instanceof Error, `expected a DB error for sign=${sign} type=${type}`)
    assert.equal(
      (err as { code?: string }).code,
      '23514',
      `CHECK must reject sign=${sign} type=${type} (check_violation)`,
    )
    assert.match(
      (err as Error).message,
      /violates check constraint/,
      `constraint message for sign=${sign} type=${type}`,
    )
  }
})

test('MOV-1: adjustment rows accept both signs (triangulation)', async () => {
  const { productId, warehouseId } = await seeded()
  for (const sign of [1, -1]) {
    const { rows } = await ctx.pool.query(
      `INSERT INTO movements (product_id, warehouse_id, quantity, sign, type)
       VALUES ($1, $2, 2.0, $3, 'adjustment') RETURNING id`,
      [productId, warehouseId, sign],
    )
    assert.equal(rows.length, 1, `adjustment sign=${sign} must be accepted by the CHECK`)
  }
  // +2 and -2 net to zero: stock stays 5.0 - 2.0 = 3.0, proving both rows landed.
  assert.equal(await stockAt(ctx.pool, productId, warehouseId), '3.0')
})

test('MOV-9: corrections are NEW adjustment rows — original row untouched, stock reflects the fix', async () => {
  const { token, productId, warehouseId } = await seeded()
  // Correct the record with a new adjustment row (+2), never an UPDATE.
  const fix = await request(ctx.app)
    .post('/api/movements/adjustments')
    .set('Authorization', `Bearer ${token}`)
    .send({
      product_id: productId,
      warehouse_id: warehouseId,
      quantity: '2.0',
      reason: 'correction: undercounted the original receiving',
      idempotency_key: '33333333-3333-4333-8333-333333333333',
    })
  assert.equal(fix.status, 201)
  assert.equal(fix.body.movement.type, 'adjustment')

  const { rows } = await ctx.pool.query(
    `SELECT type, quantity::text AS quantity FROM movements ORDER BY id`,
  )
  assert.equal(rows.length, 3)
  assert.deepEqual(
    (rows as Array<{ type: string; quantity: string }>).map((r) => [r.type, r.quantity]),
    [
      ['receiving', '5.0'],
      ['sale', '2.0'],
      ['adjustment', '2.0'],
    ],
    'original rows byte-identical; correction appended',
  )
  assert.equal(await stockAt(ctx.pool, productId, warehouseId), '5.0')
})