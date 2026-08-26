import { z } from 'zod'

export const warehouseCreateSchema = z
  .object({
    name: z.string().trim().min(1).max(200),
    code: z.string().trim().min(1).max(50).regex(/^[A-Za-z0-9._-]+$/, 'invalid code format'),
  })
  .strict()

export const warehouseUpdateSchema = z
  .object({
    name: z.string().trim().min(1).max(200).optional(),
    code: z.string().trim().min(1).max(50).regex(/^[A-Za-z0-9._-]+$/, 'invalid code format').optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: 'at least one field must be provided',
  })

export const warehouseListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  include_inactive: z.enum(['true', 'false']).default('false'),
})

export type WarehouseCreateInput = z.infer<typeof warehouseCreateSchema>
export type WarehouseUpdateInput = z.infer<typeof warehouseUpdateSchema>
export type WarehouseListQuery = z.infer<typeof warehouseListQuerySchema>