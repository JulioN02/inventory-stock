import type { ReactNode } from 'react'
import { useAuth } from '../auth/AuthContext.tsx'

/**
 * UI-level role gating. The SERVER is the source of truth (requirePermission);
 * this only hides actions the current role cannot perform.
 */
export function RoleGate({
  permission,
  children,
  fallback = null,
}: {
  permission: string
  children: ReactNode
  fallback?: ReactNode
}) {
  const { hasPermission } = useAuth()
  return hasPermission(permission) ? children : fallback
}