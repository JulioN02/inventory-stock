import type { RequestHandler } from 'express'
import jwt from 'jsonwebtoken'
import { ApiError } from './errorHandler.ts'

interface AccessTokenClaims {
  sub: string
  username: string
  role: string
  typ: 'access'
}

/**
 * AUTH-5: verifies the Bearer access token (HS256) and attaches req.user.
 * Missing / malformed / expired / wrong-typ tokens → uniform 401
 * { code: 'UNAUTHENTICATED' } — never 403 (401 unauthenticated vs 403 unauthorized).
 */
export function requireAuth(jwtSecret: string): RequestHandler {
  return (req, _res, next) => {
    const header = req.headers.authorization
    const token = header?.startsWith('Bearer ') ? header.slice('Bearer '.length) : undefined
    if (!token) {
      next(new ApiError(401, 'UNAUTHENTICATED', 'Authentication required'))
      return
    }
    try {
      const payload = jwt.verify(token, jwtSecret) as jwt.JwtPayload & Partial<AccessTokenClaims>
      if (
        payload.typ !== 'access' ||
        typeof payload.sub !== 'string' ||
        typeof payload.username !== 'string' ||
        typeof payload.role !== 'string'
      ) {
        next(new ApiError(401, 'UNAUTHENTICATED', 'Invalid token'))
        return
      }
      req.user = { id: payload.sub, username: payload.username, role: payload.role }
      next()
    } catch {
      next(new ApiError(401, 'UNAUTHENTICATED', 'Invalid or expired token'))
    }
  }
}