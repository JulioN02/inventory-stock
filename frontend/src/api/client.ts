/**
 * Lightweight fetch wrapper (react-19 skill: plain hooks/fetch layer, no
 * TanStack Query in v1). Access token lives in MEMORY only (never
 * localStorage — XSS surface, AUTH-2). On a 401 it retries once after a
 * POST /api/auth/refresh (httpOnly cookie), then redirects to /login.
 */
export class ApiClientError extends Error {
  readonly status: number
  readonly code: string

  constructor(status: number, code: string, message: string) {
    super(message)
    this.status = status
    this.code = code
  }
}

interface ErrorBody {
  error?: { code?: string; message?: string }
}

let accessToken: string | null = null
let onSessionExpired: (() => void) | null = null

export function setAccessToken(token: string | null): void {
  accessToken = token
}

export function setSessionExpiredHandler(handler: () => void): void {
  onSessionExpired = handler
}

async function refreshAccessToken(): Promise<string | null> {
  const res = await fetch('/api/auth/refresh', { method: 'POST', headers: { 'Content-Type': 'application/json' } })
  if (!res.ok) return null
  const data = (await res.json()) as { accessToken: string }
  accessToken = data.accessToken
  return accessToken
}

interface RequestOptions extends RequestInit {
  retried?: boolean
}

export async function apiFetch<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const headers = new Headers(options.headers)
  headers.set('Content-Type', 'application/json')
  if (accessToken) headers.set('Authorization', `Bearer ${accessToken}`)

  const isLogin = path.startsWith('/api/auth/login')
  const isRefresh = path === '/api/auth/refresh'
  let res = await fetch(path, { ...options, headers })

  if (res.status === 401 && !options.retried && !isLogin && !isRefresh) {
    const token = await refreshAccessToken()
    if (token) {
      return apiFetch<T>(path, { ...options, retried: true })
    }
    setAccessToken(null)
    onSessionExpired?.()
    throw new ApiClientError(401, 'UNAUTHENTICATED', 'Session expired')
  }

  if (!res.ok) {
    let body: ErrorBody | null = null
    try {
      body = (await res.json()) as ErrorBody
    } catch {
      body = null
    }
    throw new ApiClientError(
      res.status,
      body?.error?.code ?? 'UNKNOWN',
      body?.error?.message ?? `Request failed with status ${res.status}`,
    )
  }
  return (await res.json()) as T
}

export const api = {
  get: <T>(path: string): Promise<T> => apiFetch<T>(path),
  post: <T>(path: string, body: unknown): Promise<T> =>
    apiFetch<T>(path, { method: 'POST', body: JSON.stringify(body) }),
  patch: <T>(path: string, body: unknown): Promise<T> =>
    apiFetch<T>(path, { method: 'PATCH', body: JSON.stringify(body) }),
  delete: <T>(path: string): Promise<T> => apiFetch<T>(path, { method: 'DELETE' }),
}