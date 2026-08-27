import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  MOVEMENT_SIGNS,
  canonicalStringify,
  computeRequestHash,
  deriveSign,
  quantityMagnitude,
} from '../../src/modules/movements/logic.ts'

/**
 * T2-2: pure movement logic — sign derivation (OQ-1) + canonical request_hash
 * (LAB-02). No DB. These functions drive the immutability + idempotency
 * behavior of the whole ledger.
 */

test('OQ-1: deriveSign — receiving/transfer_in = +1, sale/transfer_out = -1', () => {
  assert.equal(deriveSign('receiving', '5.0'), MOVEMENT_SIGNS.plus)
  assert.equal(deriveSign('transfer_in', '5.0'), MOVEMENT_SIGNS.plus)
  assert.equal(deriveSign('sale', '5.0'), MOVEMENT_SIGNS.minus)
  assert.equal(deriveSign('transfer_out', '5.0'), MOVEMENT_SIGNS.minus)
})

test('OQ-1: deriveSign — adjustment sign comes from the quantity sign', () => {
  assert.equal(deriveSign('adjustment', '+2.5'), MOVEMENT_SIGNS.plus)
  assert.equal(deriveSign('adjustment', '2.5'), MOVEMENT_SIGNS.plus)
  assert.equal(deriveSign('adjustment', '-3.0'), MOVEMENT_SIGNS.minus)
})

test('quantityMagnitude strips the sign for storage (quantity column is always > 0)', () => {
  assert.equal(quantityMagnitude('5.0'), '5.0')
  assert.equal(quantityMagnitude('+2.5'), '2.5')
  assert.equal(quantityMagnitude('-3.0'), '3.0')
})

test('canonicalStringify sorts object keys — key order is irrelevant', () => {
  const a = canonicalStringify({ product_id: 'p', warehouse_id: 'w', quantity: '5.0' })
  const b = canonicalStringify({ warehouse_id: 'w', quantity: '5.0', product_id: 'p' })
  assert.equal(a, b)
})

test('canonicalStringify preserves array order (lines are payload-ordered)', () => {
  assert.notEqual(canonicalStringify(['a', 'b']), canonicalStringify(['b', 'a']))
})

test('LAB-02: same payload ⇒ same hash', () => {
  const payload = {
    product_id: '11111111-1111-4111-8111-111111111111',
    warehouse_id: '22222222-2222-4222-8222-222222222222',
    quantity: '5.0',
    type: 'receiving',
    reference: 'first batch',
  }
  assert.equal(computeRequestHash(payload), computeRequestHash({ ...payload }))
})

test('LAB-02: idempotency_key is EXCLUDED from the hash', () => {
  const base = {
    product_id: '11111111-1111-4111-8111-111111111111',
    warehouse_id: '22222222-2222-4222-8222-222222222222',
    quantity: '5.0',
    type: 'receiving',
  }
  assert.equal(
    computeRequestHash({ ...base, idempotency_key: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' }),
    computeRequestHash({ ...base, idempotency_key: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' }),
  )
})

test('LAB-02: different payload ⇒ different hash', () => {
  const base = {
    product_id: '11111111-1111-4111-8111-111111111111',
    warehouse_id: '22222222-2222-4222-8222-222222222222',
    quantity: '5.0',
    type: 'receiving',
  }
  assert.notEqual(computeRequestHash(base), computeRequestHash({ ...base, quantity: '6.0' }))
  assert.notEqual(computeRequestHash(base), computeRequestHash({ ...base, type: 'sale' }))
})

test('LAB-02: numerics stay as received strings — "10.5" vs "10.50" differ (no float parsing)', () => {
  const base = {
    product_id: '11111111-1111-4111-8111-111111111111',
    warehouse_id: '22222222-2222-4222-8222-222222222222',
    type: 'receiving',
  }
  assert.notEqual(
    computeRequestHash({ ...base, quantity: '10.5' }),
    computeRequestHash({ ...base, quantity: '10.50' }),
  )
})