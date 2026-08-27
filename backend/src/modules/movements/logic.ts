import { createHash } from 'node:crypto'

/**
 * Pure movement logic — sign derivation (OQ-1) + canonical request_hash
 * (LAB-02). Framework-independent and unit-tested (tests/unit/movements.test.ts).
 */

export const MOVEMENT_TYPES = {
  receiving: 'receiving',
  sale: 'sale',
  transferIn: 'transfer_in',
  transferOut: 'transfer_out',
  adjustment: 'adjustment',
} as const
export type MovementType = (typeof MOVEMENT_TYPES)[keyof typeof MOVEMENT_TYPES]

export const MOVEMENT_SIGNS = { plus: 1, minus: -1 } as const
export type MovementSign = (typeof MOVEMENT_SIGNS)[keyof typeof MOVEMENT_SIGNS]

/**
 * OQ-1: receiving/transfer_in = +1, sale/transfer_out = −1.
 * Adjustment takes the sign of the client-supplied quantity (adjustment: ±).
 */
export function deriveSign(type: MovementType, quantity: string): MovementSign {
  if (type === MOVEMENT_TYPES.adjustment) {
    return quantity.trim().startsWith('-') ? MOVEMENT_SIGNS.minus : MOVEMENT_SIGNS.plus
  }
  if (type === MOVEMENT_TYPES.receiving || type === MOVEMENT_TYPES.transferIn) {
    return MOVEMENT_SIGNS.plus
  }
  return MOVEMENT_SIGNS.minus
}

/** Quantity magnitude for storage — movements.quantity is always > 0. */
export function quantityMagnitude(quantity: string): string {
  return quantity.trim().replace(/^[+-]/, '')
}

/**
 * Canonical JSON serialization (LAB-02): object keys sorted lexicographically,
 * arrays in payload order. Numbers are NEVER parsed — they stay exactly as
 * received (strings), preserving "10.5" vs "10.50" fidelity.
 */
export function canonicalStringify(value: unknown): string {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') {
    return JSON.stringify(value)
  }
  if (typeof value === 'number') {
    return JSON.stringify(value)
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalStringify(item)).join(',')}]`
  }
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>
    const keys = Object.keys(record).sort()
    const body = keys.map((key) => `${JSON.stringify(key)}:${canonicalStringify(record[key])}`).join(',')
    return `{${body}}`
  }
  return JSON.stringify(value)
}

/**
 * SHA-256 hex over the canonical payload. `idempotency_key` identifies the
 * operation, NOT its content — excluded from the hash (LAB-02). Same payload
 * ⇒ same hash; same key with a different hash ⇒ 409.
 */
export function computeRequestHash(payload: Record<string, unknown>): string {
  const { idempotency_key: _excluded, ...content } = payload
  return createHash('sha256').update(canonicalStringify(content)).digest('hex')
}