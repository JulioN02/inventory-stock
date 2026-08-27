import { ApiError, isUniqueViolation } from '../../../middleware/errorHandler.ts'
import type { Db } from '../../../db/pool.ts'
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

/** CAT-5: create with name/code uniqueness (409). */
export async function createWarehouse(
  db: Db,
  input: WarehouseCreateInput,
): Promise<WarehouseDto> {
  try {
    return toWarehouseDto(await warehouseRepo.createWarehouse(db, input))
  } catch (err) {
    if (isUniqueViolation(err)) throw mapUniqueViolation(err)
    throw err
  }
}

/** CAT-6: update name/code with uniqueness re-check. */
export async function updateWarehouse(
  db: Db,
  id: string,
  patch: WarehouseUpdateInput,
): Promise<WarehouseDto> {
  try {
    const row = await warehouseRepo.updateWarehouse(db, id, patch)
    if (!row) throw new ApiError(404, 'NOT_FOUND', 'Warehouse not found')
    return toWarehouseDto(row)
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

/** CAT-6: soft deactivate. */
export async function deactivateWarehouse(db: Db, id: string): Promise<WarehouseDto> {
  const row = await warehouseRepo.deactivateWarehouse(db, id)
  if (!row) throw new ApiError(404, 'NOT_FOUND', 'Warehouse not found')
  return toWarehouseDto(row)
}