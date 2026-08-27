import type { Pool, PoolClient } from 'pg'
import { ApiError, isUniqueViolation } from '../../../middleware/errorHandler.ts'
import type { Db } from '../../../db/pool.ts'
import { withTransaction } from '../../../db/transaction.ts'
import * as auditRepo from '../../audit/repository.ts'
import type { ProductCreateInput, ProductListQuery, ProductUpdateInput } from './dto.ts'
import * as productRepo from './repository.ts'
import type { ProductRecord } from './repository.ts'

export interface ProductDto {
  id: string
  sku: string
  name: string
  unit: string
  price: string
  active: boolean
  createdAt: string
  updatedAt: string
}

export function toProductDto(row: ProductRecord): ProductDto {
  return {
    id: row.id,
    sku: row.sku,
    name: row.name,
    unit: row.unit,
    price: row.price, // string numerics pass through (D13)
    active: row.active,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  }
}

/** AUD-2: the audit row is written in the SAME transaction as the domain change. */
function writeProductAudit(
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
    entityType: 'product',
    entityId: entry.entityId,
    payload: entry.payload,
  })
}

/** CAT-1: create with SKU uniqueness (409). Audit row same-tx (AUD-1/AUD-2). */
export async function createProduct(
  pool: Pool,
  actorId: string,
  input: ProductCreateInput,
): Promise<ProductDto> {
  try {
    return await withTransaction(pool, async (client) => {
      const row = await productRepo.createProduct(client, input)
      await writeProductAudit(client, {
        actorUserId: actorId,
        action: 'catalog.product.create',
        entityId: row.id,
        payload: { sku: row.sku, name: row.name, unit: row.unit, price: row.price },
      })
      return toProductDto(row)
    })
  } catch (err) {
    if (isUniqueViolation(err)) {
      throw new ApiError(409, 'SKU_TAKEN', 'A product with this SKU already exists')
    }
    throw err
  }
}

/** CAT-2: update name/unit/price/SKU with uniqueness re-check. Audit same-tx. */
export async function updateProduct(
  pool: Pool,
  actorId: string,
  id: string,
  patch: ProductUpdateInput,
): Promise<ProductDto> {
  try {
    return await withTransaction(pool, async (client) => {
      const row = await productRepo.updateProduct(client, id, patch)
      if (!row) throw new ApiError(404, 'NOT_FOUND', 'Product not found')
      await writeProductAudit(client, {
        actorUserId: actorId,
        action: 'catalog.product.update',
        entityId: row.id,
        payload: { sku: row.sku, name: row.name, unit: row.unit, price: row.price },
      })
      return toProductDto(row)
    })
  } catch (err) {
    if (isUniqueViolation(err)) {
      throw new ApiError(409, 'SKU_TAKEN', 'A product with this SKU already exists')
    }
    throw err
  }
}

/** CAT-3: paginated list + search + active filter. */
export async function listProducts(db: Db, query: ProductListQuery) {
  const result = await productRepo.listProducts(db, {
    search: query.search,
    includeInactive: query.include_inactive === 'true',
    page: query.page,
    pageSize: query.pageSize,
  })
  return {
    items: result.items.map(toProductDto),
    total: result.total,
    page: query.page,
    pageSize: query.pageSize,
  }
}

/** CAT-4: soft deactivate (history preserved). Audit same-tx. */
export async function deactivateProduct(
  pool: Pool,
  actorId: string,
  id: string,
): Promise<ProductDto> {
  return withTransaction(pool, async (client) => {
    const row = await productRepo.deactivateProduct(client, id)
    if (!row) throw new ApiError(404, 'NOT_FOUND', 'Product not found')
    await writeProductAudit(client, {
      actorUserId: actorId,
      action: 'catalog.product.deactivate',
      entityId: row.id,
      payload: { sku: row.sku, active: false },
    })
    return toProductDto(row)
  })
}