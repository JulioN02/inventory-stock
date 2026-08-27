import { Router } from 'express'
import type { Db } from '../../../db/pool.ts'
import type { AppConfig } from '../../../config/env.ts'
import { validateDto } from '../../../middleware/validate.ts'
import { requireAuth } from '../../../middleware/requireAuth.ts'
import { requirePermission } from '../../../middleware/requirePermission.ts'
import { PERMISSIONS } from '../../../permissions/registry.ts'
import type { Permission } from '../../../permissions/registry.ts'
import { createProductsController } from './controller.ts'
import { productCreateSchema, productUpdateSchema } from './dto.ts'

export function createProductsRouter(deps: { db: Db; config: AppConfig }): Router {
  const router = Router()
  const ctrl = createProductsController(deps)
  const auth = requireAuth(deps.config.jwtSecret)
  const perm = (permission: Permission) => requirePermission(deps.db, permission)

  router.post('/', auth, perm(PERMISSIONS.catalog.create), validateDto(productCreateSchema), ctrl.create)
  router.patch('/:id', auth, perm(PERMISSIONS.catalog.update), validateDto(productUpdateSchema), ctrl.update)
  router.get('/', auth, perm(PERMISSIONS.catalog.read), ctrl.list)
  router.delete('/:id', auth, perm(PERMISSIONS.catalog.deactivate), ctrl.remove)

  return router
}