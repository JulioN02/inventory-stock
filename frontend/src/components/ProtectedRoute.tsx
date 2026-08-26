import { Navigate } from 'react-router-dom'
import type { ReactNode } from 'react'
import { useAuth } from '../auth/AuthContext.tsx'

/** Guards a route: waits for session restore, then redirects to /login. */
export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { user, initializing } = useAuth()
  if (initializing) {
    return <div className="page-loading">Cargando…</div>
  }
  if (!user) {
    return <Navigate to="/login" replace />
  }
  return children
}