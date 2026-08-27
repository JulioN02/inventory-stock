import { z } from 'zod'

/**
 * Shared decimal-string helpers — numerics travel as strings (decision D13:
 * node-postgres returns NUMERIC as string; JSON serialization is pass-through).
 * Accepts JSON numbers too, canonicalized to strings (no float parsing).
 */

/** Non-negative decimal string with a maximum scale. */
export function decimalString(maxScale: number) {
  return z
    .union([z.string(), z.number()])
    .transform((value) => (typeof value === 'number' ? String(value) : value.trim()))
    .refine((value) => /^\d+(\.\d+)?$/.test(value), {
      message: 'must be a non-negative decimal number',
    })
    .refine((value) => {
      const parts = value.split('.')
      return parts.length === 1 || (parts[1]?.length ?? 0) <= maxScale
    }, { message: `must have at most ${maxScale} decimal place(s)` })
}

/** Positive decimal string (quantities: magnitude always > 0). */
export function positiveDecimalString(maxScale: number) {
  return decimalString(maxScale).refine((value) => parseFloat(value) > 0, {
    message: 'must be greater than zero',
  })
}

/** Signed decimal string (adjustments: ± quantity, never zero). */
export function signedDecimalString(maxScale: number) {
  return z
    .union([z.string(), z.number()])
    .transform((value) => (typeof value === 'number' ? String(value) : value.trim()))
    .refine((value) => /^[+-]?\d+(\.\d+)?$/.test(value), {
      message: 'must be a signed decimal number',
    })
    .refine((value) => {
      const parts = value.replace(/^[+-]/, '').split('.')
      return parts.length === 1 || (parts[1]?.length ?? 0) <= maxScale
    }, { message: `must have at most ${maxScale} decimal place(s)` })
    .refine((value) => parseFloat(value) !== 0, { message: 'must be non-zero' })
}