/**
 * Frontend mirror of the server role → permission matrix.
 *
 * SINGLE SOURCE OF TRUTH for the UI mirror is the backend:
 *   - backend/src/permissions/registry.ts  (ROLE_PERMISSIONS)
 *   - backend/src/db/sql/001_auth_rbac.up.sql (seeded role_permissions)
 *
 * W2 fix (verify-report): the mirror previously granted `auditor` `catalog:read`,
 * which the server does NOT (auditor = audit:read + reports:read only) — the
 * auditor saw Products/Warehouses in the UI while the API returned 403. The map
 * below now matches the server matrix EXACTLY for every role. UI gating only
 * hides actions; the server still enforces RBAC (requirePermission).
 *
 * Const-type pattern (typescript skill): const object + derived union — no
 * bare string unions.
 */
export const ROLE_PERMISSIONS = {
  admin: [
    'users:create',
    'catalog:create',
    'catalog:read',
    'catalog:update',
    'catalog:deactivate',
    'movements:create',
    'movements:read',
    'purchasing:create',
    'purchasing:read',
    'purchasing:update',
    'purchasing:receive',
    'audit:read',
    'reports:read',
  ],
  operator: [
    'catalog:create',
    'catalog:read',
    'catalog:update',
    'catalog:deactivate',
    'movements:create',
    'movements:read',
    'purchasing:create',
    'purchasing:read',
    'purchasing:update',
    'purchasing:receive',
  ],
  viewer: ['catalog:read', 'movements:read', 'purchasing:read', 'reports:read'],
  auditor: ['audit:read', 'reports:read'],
} as const

export type RoleName = keyof typeof ROLE_PERMISSIONS
export type RolePermission = (typeof ROLE_PERMISSIONS)[RoleName][number]

/**
 * Pure lookup for the mirror (kept out of AuthContext so it stays trivially
 * testable). Unknown roles get an empty set — they see no permission-gated UI.
 */
export function getRolePermissions(role: string): readonly string[] {
  if (role in ROLE_PERMISSIONS) {
    return ROLE_PERMISSIONS[role as RoleName]
  }
  return []
}