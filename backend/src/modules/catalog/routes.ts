import { Router } from 'express'
import type { Pool } from 'pg'
import type { AppConfig } from '../../config/env.ts'
import { createProductsRouter } from './products/routes.ts'
import { createWarehousesRouter } from './warehouses/routes.ts'

export interface CatalogRouters {
  products: Router
  warehouses: Router
}

export function createCatalogRouter(deps: { db: Pool; config: AppConfig }): CatalogRouters {
  return {
    products: createProductsRouter(deps),
    warehouses: createWarehousesRouter(deps),
  }
}