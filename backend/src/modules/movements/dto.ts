import { z } from 'zod'
import { decimalString, positiveDecimalString, signedDecimalString } from '../../lib/decimal.ts'
import { MOVEMENT_TYPES } from './logic.ts'

/**
 * Movement DTOs (validation contracts). Sign is NEVER accepted from the client
 * — it is derived server-side from the type (OQ-1). Numerics travel as strings
 * with a fixed scale (quantity ≤ 1 decimal, unit_price ≤ 2).
 */

export const DIRECT_MOVEMENT_TYPES = {
  receiving: MOVEMENT_TYPES.receiving,
  sale: MOVEMENT_TYPES.sale,
} as const
export type DirectMovementType = (typeof DIRECT_MOVEMENT_TYPES)[keyof typeof DIRECT_MOVEMENT_TYPES]
const DIRECT_MOVEMENT_TYPE_VALUES = [
  DIRECT_MOVEMENT_TYPES.receiving,
  DIRECT_MOVEMENT_TYPES.sale,
] as const

/** MOV-2: single-row ledger registration (receiving/sale only). */
export const movementCreateSchema = z
  .object({
    product_id: z.uuid(),
    warehouse_id: z.uuid(),
    quantity: positiveDecimalString(1),
    type: z.enum(DIRECT_MOVEMENT_TYPE_VALUES),
    idempotency_key: z.uuid(),
    unit_price: decimalString(2).optional(),
    reference: z.string().trim().max(200).optional(),
  })
  .strict()

/** MOV-5: atomic two-row transfer (transfer_out primary + transfer_in secondary). */
export const transferCreateSchema = z
  .object({
    product_id: z.uuid(),
    source_warehouse_id: z.uuid(),
    destination_warehouse_id: z.uuid(),
    quantity: positiveDecimalString(1),
    idempotency_key: z.uuid(),
    reference: z.string().trim().max(200).optional(),
  })
  .strict()
  .refine((value) => value.source_warehouse_id !== value.destination_warehouse_id, {
    message: 'source and destination warehouses must differ',
    path: ['destination_warehouse_id'],
  })

/** MOV-6: adjustment with mandatory non-empty reason, ± quantity (never zero). */
export const adjustmentCreateSchema = z
  .object({
    product_id: z.uuid(),
    warehouse_id: z.uuid(),
    quantity: signedDecimalString(1),
    reason: z.string().trim().min(1).max(500),
    idempotency_key: z.uuid(),
  })
  .strict()

/** OQ-2: ledger list query — filters + pagination. */
export const movementListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  type: z.enum([
    MOVEMENT_TYPES.receiving,
    MOVEMENT_TYPES.sale,
    MOVEMENT_TYPES.transferIn,
    MOVEMENT_TYPES.transferOut,
    MOVEMENT_TYPES.adjustment,
  ]).optional(),
  product_id: z.uuid().optional(),
  warehouse_id: z.uuid().optional(),
})

/** MOV-4: derived stock query — optional warehouse filter. */
export const stockQuerySchema = z.object({
  warehouse_id: z.uuid().optional(),
})

/** MOV-7: low-stock query — strictly below threshold (default 5). */
export const lowStockQuerySchema = z.object({
  threshold: z.coerce.number().finite().default(5),
  warehouse_id: z.uuid().optional(),
})

export type MovementCreateInput = z.infer<typeof movementCreateSchema>
export type TransferCreateInput = z.infer<typeof transferCreateSchema>
export type AdjustmentCreateInput = z.infer<typeof adjustmentCreateSchema>
export type MovementListQuery = z.infer<typeof movementListQuerySchema>
export type StockQuery = z.infer<typeof stockQuerySchema>
export type LowStockQuery = z.infer<typeof lowStockQuerySchema>