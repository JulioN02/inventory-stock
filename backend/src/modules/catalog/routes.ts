import { Router } from 'express'
import type { Db } from '../../db/pool.ts'
import type { AppConfig } from '../../config/env.ts'
import { createProductsRouter } from './products/routes.ts'
import { createWarehousesRouter } from './warehouses/routes.ts'

export interface CatalogRouters {
  products: Router
  warehouses: Router
}

export function createCatalogRouter(deps: { db: Db; config: AppConfig }): CatalogRouters {
  return {
    products: createProductsRouter(deps),
    warehouses: createWarehousesRouter(deps),
  }
}