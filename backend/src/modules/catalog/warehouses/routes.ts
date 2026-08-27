import { Router } from 'express'
import type { Db } from '../../../db/pool.ts'
import type { AppConfig } from '../../../config/env.ts'
import { validateDto } from '../../../middleware/validate.ts'
import { requireAuth } from '../../../middleware/requireAuth.ts'
import { requirePermission } from '../../../middleware/requirePermission.ts'
import { PERMISSIONS } from '../../../permissions/registry.ts'
import type { Permission } from '../../../permissions/registry.ts'
import { createWarehousesController } from './controller.ts'
import { warehouseCreateSchema, warehouseUpdateSchema } from './dto.ts'

export function createWarehousesRouter(deps: { db: Db; config: AppConfig }): Router {
  const router = Router()
  const ctrl = createWarehousesController(deps)
  const auth = requireAuth(deps.config.jwtSecret)
  const perm = (permission: Permission) => requirePermission(deps.db, permission)

  router.post('/', auth, perm(PERMISSIONS.catalog.create), validateDto(warehouseCreateSchema), ctrl.create)
  router.patch('/:id', auth, perm(PERMISSIONS.catalog.update), validateDto(warehouseUpdateSchema), ctrl.update)
  router.get('/', auth, perm(PERMISSIONS.catalog.read), ctrl.list)
  router.delete('/:id', auth, perm(PERMISSIONS.catalog.deactivate), ctrl.remove)

  return router
}