import { Router } from 'express'
import type { Pool } from 'pg'
import type { AppConfig } from '../../config/env.ts'
import { validateDto } from '../../middleware/validate.ts'
import { requireAuth } from '../../middleware/requireAuth.ts'
import { requirePermission } from '../../middleware/requirePermission.ts'
import { PERMISSIONS } from '../../permissions/registry.ts'
import { createAuthController } from './controller.ts'
import { loginSchema, registerSchema } from './dto.ts'

export function createAuthRouter(deps: { db: Pool; config: AppConfig }): Router {
  const router = Router()
  const ctrl = createAuthController(deps)

  // OQ-3 confirmed: registration is ADMIN-ONLY (users:create), NOT public.
  router.post(
    '/register',
    requireAuth(deps.config.jwtSecret),
    requirePermission(deps.db, PERMISSIONS.users.create),
    validateDto(registerSchema),
    ctrl.register,
  )
  router.post('/login', validateDto(loginSchema), ctrl.login)
  router.post('/refresh', ctrl.refresh)
  router.post('/logout', ctrl.logout)

  return router
}