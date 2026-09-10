import { ApiClientError } from '../api/client.ts'
import type { MessageKey, TFunction } from './types.ts'

/**
 * Every backend error code (spec I4 table — 15 server codes) plus the
 * client-side UNKNOWN fallback. Const object + derived union (typescript
 * skill: no enums, erasableSyntaxOnly).
 */
export const ERROR_CODES = [
  'UNAUTHENTICATED',
  'INVALID_CREDENTIALS',
  'FORBIDDEN',
  'NOT_FOUND',
  'SKU_TAKEN',
  'WAREHOUSE_TAKEN',
  'WAREHOUSE_NAME_TAKEN',
  'WAREHOUSE_CODE_TAKEN',
  'USERNAME_TAKEN',
  'REFERENCE_NOT_FOUND',
  'REFERENCE_INACTIVE',
  'INSUFFICIENT_STOCK',
  'IDEMPOTENCY_CONFLICT',
  'VALIDATION_ERROR',
  'INTERNAL_ERROR',
  'UNKNOWN',
] as const

export type ErrorCode = (typeof ERROR_CODES)[number]

/**
 * Code → dictionary key. `satisfies Record<ErrorCode, MessageKey>` guarantees
 * at compile time that every backend code has a localized message (design:
 * central `localizeError`, never raw `err.message`).
 */
export const ERROR_MESSAGE_KEYS = {
  UNAUTHENTICATED: 'errors.UNAUTHENTICATED',
  INVALID_CREDENTIALS: 'errors.INVALID_CREDENTIALS',
  FORBIDDEN: 'errors.FORBIDDEN',
  NOT_FOUND: 'errors.NOT_FOUND',
  SKU_TAKEN: 'errors.SKU_TAKEN',
  WAREHOUSE_TAKEN: 'errors.WAREHOUSE_TAKEN',
  WAREHOUSE_NAME_TAKEN: 'errors.WAREHOUSE_NAME_TAKEN',
  WAREHOUSE_CODE_TAKEN: 'errors.WAREHOUSE_CODE_TAKEN',
  USERNAME_TAKEN: 'errors.USERNAME_TAKEN',
  REFERENCE_NOT_FOUND: 'errors.REFERENCE_NOT_FOUND',
  REFERENCE_INACTIVE: 'errors.REFERENCE_INACTIVE',
  INSUFFICIENT_STOCK: 'errors.INSUFFICIENT_STOCK',
  IDEMPOTENCY_CONFLICT: 'errors.IDEMPOTENCY_CONFLICT',
  VALIDATION_ERROR: 'errors.VALIDATION_ERROR',
  INTERNAL_ERROR: 'errors.INTERNAL_ERROR',
  UNKNOWN: 'errors.UNKNOWN',
} as const satisfies Record<ErrorCode, MessageKey>

export const UNKNOWN_ERROR_KEY: MessageKey = ERROR_MESSAGE_KEYS.UNKNOWN

/** Resolve any raw code string to a dictionary key, falling back to UNKNOWN. */
export function lookupErrorKey(code: string): MessageKey {
  if (code in ERROR_MESSAGE_KEYS) {
    return ERROR_MESSAGE_KEYS[code as ErrorCode]
  }
  return UNKNOWN_ERROR_KEY
}

/**
 * Central error localizer (spec I4). ApiClientError codes map to localized
 * messages; anything else (network TypeError, JSON parse, unknown) falls back
 * to the localized UNKNOWN message in the active locale.
 */
export function localizeError(error: unknown, t: TFunction): string {
  if (error instanceof ApiClientError) {
    return t(lookupErrorKey(error.code))
  }
  return t(UNKNOWN_ERROR_KEY)
}