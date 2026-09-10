import type { MessageKey, TFunction } from './types.ts'

/**
 * Role display labels (spec I3 / task 2.5). Server role **values** stay
 * untouched — only the rendered label is localized. `roles.*` keys live in the
 * dictionary so both locales are checked for completeness.
 */
export const KNOWN_ROLES = ['admin', 'operator', 'viewer', 'auditor'] as const

export type KnownRole = (typeof KNOWN_ROLES)[number]

/** Role code → display-label dictionary key. */
export const ROLE_LABEL_KEYS = {
  admin: 'roles.admin',
  operator: 'roles.operator',
  viewer: 'roles.viewer',
  auditor: 'roles.auditor',
} as const satisfies Record<KnownRole, MessageKey>

/** Runtime guard for arbitrary server role strings. */
export function isKnownRole(role: string): role is KnownRole {
  return (KNOWN_ROLES as readonly string[]).includes(role)
}

/**
 * Localized display label for a role code. Unknown/future server roles fall
 * back to the raw value so arbitrary strings never render blank or throw.
 */
export function localizeRole(role: string, t: TFunction): string {
  return isKnownRole(role) ? t(ROLE_LABEL_KEYS[role]) : role
}
