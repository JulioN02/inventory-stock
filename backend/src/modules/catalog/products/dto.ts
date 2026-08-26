import { z } from 'zod'

export const UNITS = ['kg', 'g', 'l', 'ml', 'unit', 'box', 'pair'] as const
export type Unit = (typeof UNITS)[number]

/**
 * Decimal string with a maximum scale — numerics travel as strings
 * (decision D13). Accepts JSON numbers too, canonicalized to strings.
 */
function decimalString(maxScale: number) {
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

const skuSchema = z
  .string()
  .trim()
  .min(1)
  .max(50)
  .regex(/^[A-Za-z0-9._-]+$/, 'SKU may contain letters, digits, dots, dashes and underscores')
  .transform((value) => value.toUpperCase())

export const productCreateSchema = z
  .object({
    sku: skuSchema,
    name: z.string().trim().min(1).max(200),
    unit: z.enum(UNITS),
    price: decimalString(2), // scale 2 (CAT-7)
  })
  .strict() // rejects `stock` / quantity fields (CAT-2: stock is derived, never stored)

export const productUpdateSchema = z
  .object({
    sku: skuSchema.optional(),
    name: z.string().trim().min(1).max(200).optional(),
    unit: z.enum(UNITS).optional(),
    price: decimalString(2).optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: 'at least one field must be provided',
  })

export type ProductCreateInput = z.infer<typeof productCreateSchema>
export type ProductUpdateInput = z.infer<typeof productUpdateSchema>

export const productListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().min(1).optional(),
  include_inactive: z.enum(['true', 'false']).default('false'),
})

export type ProductListQuery = z.infer<typeof productListQuerySchema>