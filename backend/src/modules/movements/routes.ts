import { Router } from 'express'
import type { Pool } from 'pg'
import type { AppConfig } from '../../config/env.ts'
import { validateDto } from '../../middleware/validate.ts'
import { requireAuth } from '../../middleware/requireAuth.ts'
import { requirePermission } from '../../middleware/requirePermission.ts'
import { PERMISSIONS } from '../../permissions/registry.ts'
import type { Permission } from '../../permissions/registry.ts'
import { createMovementsController } from './controller.ts'
import { adjustmentCreateSchema, movementCreateSchema, transferCreateSchema } from './dto.ts'

/**
 * Two routers, one factory (mirrors catalog): `/api/movements` (ledger
 * write + read) and `/api/stock` (derived stock reads). Both require
 * movements:create / movements:read respectively (AUTH-6).
 */
export function createMovementsRouter(deps: { db: Pool; config: AppConfig }): {
  movements: Router
  stock: Router
} {
  const ctrl = createMovementsController(deps)
  const auth = requireAuth(deps.config.jwtSecret)
  const perm = (permission: Permission) => requirePermission(deps.db, permission)

  const movements = Router()
  movements.post('/', auth, perm(PERMISSIONS.movements.create), validateDto(movementCreateSchema), ctrl.create)
  movements.get('/', auth, perm(PERMISSIONS.movements.read), ctrl.list)
  movements.post('/transfers', auth, perm(PERMISSIONS.movements.create), validateDto(transferCreateSchema), ctrl.transfer)
  movements.post('/adjustments', auth, perm(PERMISSIONS.movements.create), validateDto(adjustmentCreateSchema), ctrl.adjust)

  const stock = Router()
  stock.get('/', auth, perm(PERMISSIONS.movements.read), ctrl.stock)
  stock.get('/low', auth, perm(PERMISSIONS.movements.read), ctrl.lowStock)

  return { movements, stock }
}