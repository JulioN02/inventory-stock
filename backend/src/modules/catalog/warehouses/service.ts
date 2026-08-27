import type { Pool, PoolClient } from 'pg'
import { ApiError, isUniqueViolation } from '../../../middleware/errorHandler.ts'
import type { Db } from '../../../db/pool.ts'
import { withTransaction } from '../../../db/transaction.ts'
import * as auditRepo from '../../audit/repository.ts'
import type { WarehouseCreateInput, WarehouseListQuery, WarehouseUpdateInput } from './dto.ts'
import * as warehouseRepo from './repository.ts'
import type { WarehouseRecord } from './repository.ts'

export interface WarehouseDto {
  id: string
  name: string
  code: string
  active: boolean
  createdAt: string
  updatedAt: string
}

export function toWarehouseDto(row: WarehouseRecord): WarehouseDto {
  return {
    id: row.id,
    name: row.name,
    code: row.code,
    active: row.active,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  }
}

function mapUniqueViolation(err: unknown): ApiError {
  const message = String(err instanceof Error ? err.message : err)
  if (message.includes('warehouses_name_key')) {
    return new ApiError(409, 'WAREHOUSE_NAME_TAKEN', 'A warehouse with this name already exists')
  }
  if (message.includes('warehouses_code_key')) {
    return new ApiError(409, 'WAREHOUSE_CODE_TAKEN', 'A warehouse with this code already exists')
  }
  return new ApiError(409, 'WAREHOUSE_TAKEN', 'Duplicate warehouse name or code')
}

/** AUD-2: the audit row is written in the SAME transaction as the domain change. */
function writeWarehouseAudit(
  client: PoolClient,
  entry: {
    actorUserId: string
    action: string
    entityId: string
    payload: Record<string, unknown>
  },
): Promise<void> {
  return auditRepo.write(client, {
    actorType: 'user',
    actorUserId: entry.actorUserId,
    action: entry.action,
    entityType: 'warehouse',
    entityId: entry.entityId,
    payload: entry.payload,
  })
}

/** CAT-5: create with name/code uniqueness (409). Audit same-tx (AUD-1). */
export async function createWarehouse(
  pool: Pool,
  actorId: string,
  input: WarehouseCreateInput,
): Promise<WarehouseDto> {
  try {
    return await withTransaction(pool, async (client) => {
      const row = await warehouseRepo.createWarehouse(client, input)
      await writeWarehouseAudit(client, {
        actorUserId: actorId,
        action: 'catalog.warehouse.create',
        entityId: row.id,
        payload: { name: row.name, code: row.code },
      })
      return toWarehouseDto(row)
    })
  } catch (err) {
    if (isUniqueViolation(err)) throw mapUniqueViolation(err)
    throw err
  }
}

/** CAT-6: update name/code with uniqueness re-check. Audit same-tx. */
export async function updateWarehouse(
  pool: Pool,
  actorId: string,
  id: string,
  patch: WarehouseUpdateInput,
): Promise<WarehouseDto> {
  try {
    return await withTransaction(pool, async (client) => {
      const row = await warehouseRepo.updateWarehouse(client, id, patch)
      if (!row) throw new ApiError(404, 'NOT_FOUND', 'Warehouse not found')
      await writeWarehouseAudit(client, {
        actorUserId: actorId,
        action: 'catalog.warehouse.update',
        entityId: row.id,
        payload: { name: row.name, code: row.code },
      })
      return toWarehouseDto(row)
    })
  } catch (err) {
    if (isUniqueViolation(err)) throw mapUniqueViolation(err)
    throw err
  }
}

export async function listWarehouses(db: Db, query: WarehouseListQuery) {
  const result = await warehouseRepo.listWarehouses(db, {
    includeInactive: query.include_inactive === 'true',
    page: query.page,
    pageSize: query.pageSize,
  })
  return {
    items: result.items.map(toWarehouseDto),
    total: result.total,
    page: query.page,
    pageSize: query.pageSize,
  }
}

/** CAT-6: soft deactivate. Audit same-tx. */
export async function deactivateWarehouse(
  pool: Pool,
  actorId: string,
  id: string,
): Promise<WarehouseDto> {
  return withTransaction(pool, async (client) => {
    const row = await warehouseRepo.deactivateWarehouse(client, id)
    if (!row) throw new ApiError(404, 'NOT_FOUND', 'Warehouse not found')
    await writeWarehouseAudit(client, {
      actorUserId: actorId,
      action: 'catalog.warehouse.deactivate',
      entityId: row.id,
      payload: { name: row.name, code: row.code, active: false },
    })
    return toWarehouseDto(row)
  })
}