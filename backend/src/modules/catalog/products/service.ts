import { ApiError, isUniqueViolation } from '../../../middleware/errorHandler.ts'
import type { Db } from '../../../db/pool.ts'
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

/** CAT-1: create with SKU uniqueness (409). */
export async function createProduct(
  db: Db,
  input: ProductCreateInput,
): Promise<ProductDto> {
  try {
    return toProductDto(await productRepo.createProduct(db, input))
  } catch (err) {
    if (isUniqueViolation(err)) {
      throw new ApiError(409, 'SKU_TAKEN', 'A product with this SKU already exists')
    }
    throw err
  }
}

/** CAT-2: update name/unit/price/SKU with uniqueness re-check. */
export async function updateProduct(
  db: Db,
  id: string,
  patch: ProductUpdateInput,
): Promise<ProductDto> {
  try {
    const row = await productRepo.updateProduct(db, id, patch)
    if (!row) throw new ApiError(404, 'NOT_FOUND', 'Product not found')
    return toProductDto(row)
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

/** CAT-4: soft deactivate (history preserved). */
export async function deactivateProduct(db: Db, id: string): Promise<ProductDto> {
  const row = await productRepo.deactivateProduct(db, id)
  if (!row) throw new ApiError(404, 'NOT_FOUND', 'Product not found')
  return toProductDto(row)
}