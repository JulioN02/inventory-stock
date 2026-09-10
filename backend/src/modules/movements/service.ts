import type { Pool } from 'pg'
import { ApiError } from '../../middleware/errorHandler.ts'
import type { Db } from '../../db/pool.ts'
import { withTransaction } from '../../db/transaction.ts'
import * as auditRepo from '../audit/repository.ts'
import type {
  AdjustmentCreateInput,
  LowStockQuery,
  MovementCreateInput,
  MovementListQuery,
  StockQuery,
  TransferCreateInput,
} from './dto.ts'
import {
  MOVEMENT_SIGNS,
  MOVEMENT_TYPES,
  computeRequestHash,
  deriveSign,
  quantityMagnitude,
} from './logic.ts'
import * as movementRepo from './repository.ts'
import type { MovementRecord, MovementListRecord } from './repository.ts'

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

export function toMovementDto(row: MovementRecord): MovementDto {
  return {
    id: row.id,
    product_id: row.product_id,
    warehouse_id: row.warehouse_id,
    quantity: row.quantity, // string numerics pass through (D13)
    sign: row.sign,
    type: row.type,
    unit_price: row.unit_price,
    occurred_at: new Date(row.occurred_at).toISOString(),
    idempotency_key: row.idempotency_key,
    operation_group_id: row.operation_group_id,
    reference: row.reference,
    actor_user_id: row.actor_user_id,
    created_at: new Date(row.created_at).toISOString(),
  }
}

export interface MovementWriteResult {
  movement: MovementDto
  /** true = LAB-02 replay (200), false = new operation (201). */
  replay: boolean
}

/**
 * LAB-02 replay resolution: same hash → 200 with the existing row; different
 * hash → 409 (same key, different payload).
 */
function replayOrConflict(existing: MovementRecord, requestHash: string): MovementWriteResult {
  if (existing.request_hash === requestHash) {
    return { movement: toMovementDto(existing), replay: true }
  }
  throw new ApiError(
    409,
    'IDEMPOTENCY_CONFLICT',
    'idempotency_key was already used with a different payload',
  )
}

/**
 * LAB-01 negative-stock invariant: inline SUM recheck inside the movement tx.
 * The insert stays uncommitted; on violation the whole tx ROLLBACKs → 409 and
 * no ledger row survives.
 */
async function assertStockNonNegative(db: Db, productId: string, warehouseId: string): Promise<void> {
  const stock = await movementRepo.currentStock(db, productId, warehouseId)
  if (parseFloat(stock) < 0) {
    throw new ApiError(409, 'INSUFFICIENT_STOCK', 'Operation would drive stock below zero')
  }
}

async function assertReferencesActive(
  db: Db,
  productId: string,
  warehouseId: string,
): Promise<void> {
  const refs = await movementRepo.checkReferences(db, productId, warehouseId)
  if (!refs) {
    throw new ApiError(422, 'REFERENCE_NOT_FOUND', 'Product or warehouse does not exist')
  }
  if (!refs.productActive || !refs.warehouseActive) {
    throw new ApiError(422, 'REFERENCE_INACTIVE', 'Product or warehouse is inactive')
  }
}

/**
 * MOV-2/3: idempotent single-row registration (receiving/sale).
 * Sequence per design #912: BEGIN → idempotency probe → (out-movement)
 * advisory lock → INSERT ON CONFLICT DO NOTHING → SUM recheck → COMMIT.
 */
export async function registerMovement(
  pool: Pool,
  actorId: string,
  input: MovementCreateInput,
): Promise<MovementWriteResult> {
  const sign = deriveSign(input.type, input.quantity)
  const requestHash = computeRequestHash({ ...input })

  return withTransaction(pool, async (client) => {
    // LAB-02 probe: replay/409 needs no lock and no reference re-check.
    const existing = await movementRepo.findByKey(client, input.idempotency_key)
    if (existing) return replayOrConflict(existing, requestHash)

    await assertReferencesActive(client, input.product_id, input.warehouse_id)

    if (sign === MOVEMENT_SIGNS.minus) {
      await movementRepo.acquireProductLock(client, input.product_id, input.warehouse_id)
    }

    const inserted = await movementRepo.insertMovementIfAbsent(client, {
      productId: input.product_id,
      warehouseId: input.warehouse_id,
      quantity: input.quantity,
      sign,
      type: input.type,
      idempotencyKey: input.idempotency_key,
      operationGroupId: null,
      requestHash,
      actorUserId: actorId,
      unitPrice: input.unit_price ?? null,
      reference: input.reference ?? null,
    })
    if (!inserted) {
      // Race lost: another tx committed this key between probe and insert.
      const raced = await movementRepo.findByKey(client, input.idempotency_key)
      return replayOrConflict(raced!, requestHash)
    }

    if (sign === MOVEMENT_SIGNS.minus) {
      await assertStockNonNegative(client, input.product_id, input.warehouse_id)
    }
    // AUD-1/AUD-2: audit row in the SAME transaction — a rollback takes it away.
    await auditRepo.write(client, {
      actorType: 'user',
      actorUserId: actorId,
      action: 'movements.movement.create',
      entityType: 'movement',
      entityId: inserted.id,
      payload: {
        type: inserted.type,
        quantity: inserted.quantity,
        sign: inserted.sign,
        product_id: inserted.product_id,
        warehouse_id: inserted.warehouse_id,
        idempotency_key: inserted.idempotency_key,
        reference: inserted.reference ?? null,
      },
    })
    return { movement: toMovementDto(inserted), replay: false }
  })
}

/**
 * MOV-5: atomic transfer — transfer_out (−, source, carries the key) and
 * transfer_in (+, destination, NULL key) in ONE tx, sorted dual advisory
 * locks (deadlock impossible), negative-stock recheck at SOURCE only.
 */
export async function transfer(
  pool: Pool,
  actorId: string,
  input: TransferCreateInput,
): Promise<MovementWriteResult> {
  const requestHash = computeRequestHash({ ...input })

  return withTransaction(pool, async (client) => {
    const existing = await movementRepo.findByKey(client, input.idempotency_key)
    if (existing) return replayOrConflict(existing, requestHash)

    const refs = await movementRepo.checkTransferReferences(
      client,
      input.product_id,
      input.source_warehouse_id,
      input.destination_warehouse_id,
    )
    if (!refs) {
      throw new ApiError(422, 'REFERENCE_NOT_FOUND', 'Product or warehouse does not exist')
    }
    if (!refs.productActive || !refs.sourceActive || !refs.destinationActive) {
      throw new ApiError(422, 'REFERENCE_INACTIVE', 'Product or warehouse is inactive')
    }

    // Sorted acquisition — deadlock impossible (design D5).
    await movementRepo.acquireProductLocksSorted(client, [
      { productId: input.product_id, warehouseId: input.source_warehouse_id },
      { productId: input.product_id, warehouseId: input.destination_warehouse_id },
    ])

    const outRow = await movementRepo.insertMovementIfAbsent(client, {
      productId: input.product_id,
      warehouseId: input.source_warehouse_id,
      quantity: input.quantity,
      sign: MOVEMENT_SIGNS.minus,
      type: MOVEMENT_TYPES.transferOut,
      idempotencyKey: input.idempotency_key,
      operationGroupId: input.idempotency_key,
      requestHash,
      actorUserId: actorId,
      reference: input.reference ?? null,
    })
    if (!outRow) {
      const raced = await movementRepo.findByKey(client, input.idempotency_key)
      return replayOrConflict(raced!, requestHash)
    }

    await movementRepo.insertMovementIfAbsent(client, {
      productId: input.product_id,
      warehouseId: input.destination_warehouse_id,
      quantity: input.quantity,
      sign: MOVEMENT_SIGNS.plus,
      type: MOVEMENT_TYPES.transferIn,
      idempotencyKey: null, // secondary row: PG UNIQUE treats NULLs as distinct
      operationGroupId: input.idempotency_key,
      requestHash,
      actorUserId: actorId,
      reference: input.reference ?? null,
    })

    // Destination only gains — recheck the SOURCE only.
    await assertStockNonNegative(client, input.product_id, input.source_warehouse_id)
    // AUD-1: one audit row per atomic transfer, same-tx (rollback removes it).
    await auditRepo.write(client, {
      actorType: 'user',
      actorUserId: actorId,
      action: 'movements.transfer.create',
      entityType: 'movement',
      entityId: outRow.id,
      payload: {
        type: 'transfer',
        quantity: outRow.quantity,
        sign: outRow.sign,
        product_id: outRow.product_id,
        source_warehouse_id: input.source_warehouse_id,
        destination_warehouse_id: input.destination_warehouse_id,
        operation_group_id: outRow.operation_group_id,
        idempotency_key: outRow.idempotency_key,
      },
    })
    return { movement: toMovementDto(outRow), replay: false }
  })
}

/**
 * MOV-6: adjustment — ± quantity with mandatory reason, idempotent via key,
 * negative-stock invariant for negative adjustments (LAB-01).
 */
export async function adjust(
  pool: Pool,
  actorId: string,
  input: AdjustmentCreateInput,
): Promise<MovementWriteResult> {
  const sign = deriveSign(MOVEMENT_TYPES.adjustment, input.quantity)
  const magnitude = quantityMagnitude(input.quantity)
  const requestHash = computeRequestHash({ ...input })

  return withTransaction(pool, async (client) => {
    const existing = await movementRepo.findByKey(client, input.idempotency_key)
    if (existing) return replayOrConflict(existing, requestHash)

    await assertReferencesActive(client, input.product_id, input.warehouse_id)

    if (sign === MOVEMENT_SIGNS.minus) {
      await movementRepo.acquireProductLock(client, input.product_id, input.warehouse_id)
    }

    const inserted = await movementRepo.insertMovementIfAbsent(client, {
      productId: input.product_id,
      warehouseId: input.warehouse_id,
      quantity: magnitude,
      sign,
      type: MOVEMENT_TYPES.adjustment,
      idempotencyKey: input.idempotency_key,
      operationGroupId: null,
      requestHash,
      actorUserId: actorId,
      reference: input.reason, // the mandatory reason is the row's reference
    })
    if (!inserted) {
      const raced = await movementRepo.findByKey(client, input.idempotency_key)
      return replayOrConflict(raced!, requestHash)
    }

    if (sign === MOVEMENT_SIGNS.minus) {
      await assertStockNonNegative(client, input.product_id, input.warehouse_id)
    }
    // AUD-1: adjustment audit row, same-tx (rollback removes it).
    await auditRepo.write(client, {
      actorType: 'user',
      actorUserId: actorId,
      action: 'movements.adjustment.create',
      entityType: 'movement',
      entityId: inserted.id,
      payload: {
        type: inserted.type,
        quantity: inserted.quantity,
        sign: inserted.sign,
        product_id: inserted.product_id,
        warehouse_id: inserted.warehouse_id,
        idempotency_key: inserted.idempotency_key,
        reason: inserted.reference ?? null,
      },
    })
    return { movement: toMovementDto(inserted), replay: false }
  })
}

export interface MovementListItemDto extends MovementDto {
  sku: string
  warehouse_code: string
  /** MOV-TRACE: running balance before this row, full-ledger (string numeric). */
  stock_before: string
  /** MOV-TRACE: running balance after this row, full-ledger (string numeric). */
  stock_after: string
}

function toMovementListItemDto(row: MovementListRecord): MovementListItemDto {
  return {
    ...toMovementDto(row),
    sku: row.sku,
    warehouse_code: row.warehouse_code,
    stock_before: row.stock_before,
    stock_after: row.stock_after,
  }
}

/** OQ-2: ledger list with filters + pagination. */
export async function listMovements(db: Db, query: MovementListQuery) {
  const result = await movementRepo.listMovements(db, {
    type: query.type,
    productId: query.product_id,
    warehouseId: query.warehouse_id,
    page: query.page,
    pageSize: query.pageSize,
  })
  return {
    items: result.items.map(toMovementListItemDto),
    total: result.total,
    page: query.page,
    pageSize: query.pageSize,
  }
}

/** MOV-4: derived stock per product×warehouse (zero-stock included, OQ-5). */
export async function getStock(db: Db, query: StockQuery) {
  const rows = await movementRepo.getStock(db, query.warehouse_id)
  return { items: rows }
}

/** MOV-7: strictly-below threshold low stock. */
export async function getLowStock(db: Db, query: LowStockQuery) {
  const rows = await movementRepo.getLowStock(db, {
    threshold: query.threshold,
    warehouseId: query.warehouse_id,
  })
  return { items: rows, threshold: query.threshold }
}