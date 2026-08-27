import { Router } from 'express'
import type { Pool } from 'pg'
import type { AppConfig } from '../../config/env.ts'
import { requireAuth } from '../../middleware/requireAuth.ts'
import { requirePermission } from '../../middleware/requirePermission.ts'
import { PERMISSIONS } from '../../permissions/registry.ts'
import { createAuditController } from './controller.ts'

/**
 * AUD-5: read-only audit query API. `audit:read` only — the auditor role is
 * seeded with it (001_auth_rbac). No write endpoints exist on this router.
 */
export function createAuditRouter(deps: { db: Pool; config: AppConfig }): Router {
  const router = Router()
  const ctrl = createAuditController(deps)

  router.get('/', requireAuth(deps.config.jwtSecret), requirePermission(deps.db, PERMISSIONS.audit.read), ctrl.list)

  return router
}