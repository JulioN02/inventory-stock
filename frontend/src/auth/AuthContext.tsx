import { createContext, useContext, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { api, setAccessToken, setSessionExpiredHandler } from '../api/client.ts'
import type { LoginResponse, User } from '../types.ts'

/**
 * Minimal auth state: user + in-memory access token (react-19 skill:
 * no useMemo/useCallback — React Compiler handles memoization).
 */
interface AuthState {
  user: User | null
  initializing: boolean
  login: (username: string, password: string) => Promise<void>
  register: (input: { username: string; email: string; password: string }) => Promise<void>
  logout: () => Promise<void>
  hasPermission: (permission: string) => boolean
}

const AuthContext = createContext<AuthState | null>(null)

/**
 * Frontend mirror of the seeded role → permission matrix (manually mirrored,
 * no codegen in v1). Used only for UI gating — the server enforces RBAC.
 */
const ROLE_PERMISSIONS: Record<string, readonly string[]> = {
  admin: [
    'users:create',
    'catalog:create',
    'catalog:read',
    'catalog:update',
    'catalog:deactivate',
  ],
  operator: ['catalog:create', 'catalog:read', 'catalog:update', 'catalog:deactivate'],
  viewer: ['catalog:read'],
  auditor: ['catalog:read'],
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [initializing, setInitializing] = useState(true)

  useEffect(() => {
    let cancelled = false
    setSessionExpiredHandler(() => {
      setUser(null)
      window.location.assign('/login')
    })
    // Restore session on load via the httpOnly refresh cookie (no token stored).
    ;(async () => {
      try {
        const data = await api.post<LoginResponse>('/api/auth/refresh', {})
        if (!cancelled) {
          setAccessToken(data.accessToken)
          setUser(data.user)
        }
      } catch {
        setAccessToken(null)
      } finally {
        if (!cancelled) setInitializing(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  async function login(username: string, password: string): Promise<void> {
    const data = await api.post<LoginResponse>('/api/auth/login', { username, password })
    setAccessToken(data.accessToken)
    setUser(data.user)
  }

  async function register(input: { username: string; email: string; password: string }): Promise<void> {
    // Admin-only endpoint (OQ-3): users:create permission required server-side.
    await api.post<{ user: User }>('/api/auth/register', input)
  }

  async function logout(): Promise<void> {
    try {
      // Cookie-only call: works even with an expired access token (AUTH-4).
      await fetch('/api/auth/logout', { method: 'POST', headers: { 'Content-Type': 'application/json' } })
    } catch {
      // idempotent
    }
    setAccessToken(null)
    setUser(null)
  }

  function hasPermission(permission: string): boolean {
    if (!user) return false
    return (ROLE_PERMISSIONS[user.role] ?? []).includes(permission)
  }

  return (
    <AuthContext.Provider value={{ user, initializing, login, register, logout, hasPermission }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}