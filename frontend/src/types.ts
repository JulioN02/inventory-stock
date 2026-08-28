// Domain types — mirror the server DTOs manually (no codegen in v1).
// Numerics travel as strings (decision D13).

export interface User {
  id: string
  username: string
  email: string
  role: string
  active: boolean
  createdAt: string
}

export interface Product {
  id: string
  sku: string
  name: string
  unit: string
  price: string
  active: boolean
  createdAt: string
  updatedAt: string
}

export interface Warehouse {
  id: string
  name: string
  code: string
  active: boolean
  createdAt: string
  updatedAt: string
}

export interface ListResult<T> {
  items: T[]
  total: number
  page: number
  pageSize: number
}

/** I2: derived stock row (GET /api/stock) — stock is a string numeric, scale 1. */
export interface StockItem {
  product_id: string
  sku: string
  name: string
  warehouse_id: string
  warehouse_code: string
  stock: string
}

/** I2: low-stock row (GET /api/stock/low) — strictly below threshold. */
export interface LowStockItem {
  product_id: string
  sku: string
  name: string
  stock: string
}

export interface LoginResponse {
  user: User
  accessToken: string
}

export interface RegisterResponse {
  user: User
}

// ── I6 portal-operativo: movements + audit ──────────────────────────────
// Mirror the server DTOs exactly (backend movements/service.ts + logic.ts).
// Const-object + derived union (typescript skill — no bare string unions).

export const MOVEMENT_TYPES = {
  receiving: 'receiving',
  sale: 'sale',
  transferIn: 'transfer_in',
  transferOut: 'transfer_out',
  adjustment: 'adjustment',
} as const
export type MovementType = (typeof MOVEMENT_TYPES)[keyof typeof MOVEMENT_TYPES]

export const DIRECT_MOVEMENT_TYPES = { receiving: 'receiving', sale: 'sale' } as const
export type DirectMovementType =
  (typeof DIRECT_MOVEMENT_TYPES)[keyof typeof DIRECT_MOVEMENT_TYPES]

/** Ledger row (backend movements/service.ts MovementDto). Numerics are strings (D13). */
export interface MovementDto {
  id: string
  product_id: string
  warehouse_id: string
  quantity: string
  sign: number
  type: string
  unit_price: string | null
  occurred_at: string
  idempotency_key: string | null
  operation_group_id: string | null
  reference: string | null
  actor_user_id: string | null
  created_at: string
}

/** Ledger list row — DTO plus the joined catalog labels (backend movements/repository.ts). */
export interface MovementListItemDto extends MovementDto {
  sku: string
  warehouse_code: string
}

// Write payloads — mirror the server DTOs (string numerics D13; sign is
// NEVER sent — the server derives it, OQ-1).
export interface MovementCreateInput {
  product_id: string
  warehouse_id: string
  quantity: string
  type: DirectMovementType
  idempotency_key: string
  unit_price?: string
  reference?: string
}

export interface TransferCreateInput {
  product_id: string
  source_warehouse_id: string
  destination_warehouse_id: string
  quantity: string
  idempotency_key: string
  reference?: string
}

export interface AdjustmentCreateInput {
  product_id: string
  warehouse_id: string
  quantity: string
  reason: string
  idempotency_key: string
}

/** POST /api/movements* response body (200 replay | 201 new). */
export interface MovementWriteResult {
  movement: MovementDto
}

/** Audit row (backend audit/service.ts AuditDto). */
export interface AuditDto {
  id: string
  actor_type: string
  actor_user_id: string | null
  action: string
  entity_type: string | null
  entity_id: string | null
  payload: Record<string, unknown>
  ip: string | null
  user_agent: string | null
  occurred_at: string
}