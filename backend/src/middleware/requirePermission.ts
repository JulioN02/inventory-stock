import type { RequestHandler } from 'express'
import type { Db } from '../db/pool.ts'
import type { Permission } from '../permissions/registry.ts'
import { ApiError } from './errorHandler.ts'

/**
 * Per-request DB lookup of the user's permission (decision D7 — no JWT-embedded
 * permissions, no in-memory cache). Runs AFTER requireAuth: missing user → 401.
 */
export function hasPermission(db: Db, userId: string, permission: Permission): Promise<boolean> {
  return db
    .query(
      `SELECT 1
       FROM user_roles ur
       JOIN role_permissions rp ON rp.role_id = ur.role_id
       JOIN permissions p ON p.id = rp.permission_id
       WHERE ur.user_id = $1 AND p.code = $2
       LIMIT 1`,
      [userId, permission],
    )
    .then((result) => result.rowCount !== null && result.rowCount > 0)
}

/** AUTH-6: RBAC enforcement on protected routes. 403 when the permission is absent. */
export function requirePermission(db: Db, permission: Permission): RequestHandler {
  return async (req, _res, next) => {
    if (!req.user) {
      next(new ApiError(401, 'UNAUTHENTICATED', 'Authentication required'))
      return
    }
    try {
      const allowed = await hasPermission(db, req.user.id, permission)
      if (!allowed) {
        // Best-effort audit (auth.permission.denied) arrives with the audit
        // module in I4 — audit_log is not created yet in I1.
        next(new ApiError(403, 'FORBIDDEN', `Missing permission: ${permission}`))
        return
      }
      next()
    } catch (err) {
      next(err)
    }
  }
}