/**
 * Const-type permission registry (typescript skill: const objects + union
 * types — never bare string unions). Mirrors the seeded `permissions` table
 * and the role → permission matrix in the migrations.
 *
 * `users:create` is the admin-only register permission (OQ-3 confirmed).
 */
export const PERMISSIONS = {
  users: { create: 'users:create' },
  catalog: {
    create: 'catalog:create',
    read: 'catalog:read',
    update: 'catalog:update',
    deactivate: 'catalog:deactivate',
  },
  movements: { create: 'movements:create', read: 'movements:read' },
  purchasing: {
    create: 'purchasing:create',
    read: 'purchasing:read',
    update: 'purchasing:update',
    receive: 'purchasing:receive',
  },
  audit: { read: 'audit:read' },
  reports: { read: 'reports:read' },
} as const

/** Mapped-type union: every leaf value of the nested const object (e.g. 'catalog:create'). */
export type Permission = {
  [Module in keyof typeof PERMISSIONS]: (typeof PERMISSIONS)[Module][keyof (typeof PERMISSIONS)[Module]]
}[keyof typeof PERMISSIONS]

export const ALL_PERMISSIONS: readonly Permission[] = Object.values(PERMISSIONS).flatMap(
  (module) => Object.values(module) as Permission[],
)

export const ROLES = {
  admin: 'admin',
  operator: 'operator',
  viewer: 'viewer',
  auditor: 'auditor',
} as const

export type Role = (typeof ROLES)[keyof typeof ROLES]

const catalogWrite = [
  PERMISSIONS.catalog.create,
  PERMISSIONS.catalog.read,
  PERMISSIONS.catalog.update,
  PERMISSIONS.catalog.deactivate,
] as const

const movementsWrite = [PERMISSIONS.movements.create, PERMISSIONS.movements.read] as const

const purchasingWrite = [
  PERMISSIONS.purchasing.create,
  PERMISSIONS.purchasing.read,
  PERMISSIONS.purchasing.update,
  PERMISSIONS.purchasing.receive,
] as const

const readOnly = [
  PERMISSIONS.catalog.read,
  PERMISSIONS.movements.read,
  PERMISSIONS.purchasing.read,
] as const

/** Mirrors the seeded role → permission matrix (migrations 001_auth_rbac). */
export const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  admin: ALL_PERMISSIONS,
  operator: [...catalogWrite, ...movementsWrite, ...purchasingWrite],
  viewer: [...readOnly, PERMISSIONS.reports.read],
  auditor: [PERMISSIONS.audit.read, PERMISSIONS.reports.read],
}