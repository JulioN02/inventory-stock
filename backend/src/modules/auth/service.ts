import crypto from 'node:crypto'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { ApiError, isUniqueViolation } from '../../middleware/errorHandler.ts'
import type { Db } from '../../db/pool.ts'
import type { LoginInput, RegisterInput } from './dto.ts'
import * as authRepo from './repository.ts'

export const BCRYPT_COST = 10 // OQ-4 confirmed: spec floor, internal tool perf
export const ACCESS_TOKEN_TTL_SECONDS = 15 * 60
export const REFRESH_TOKEN_TTL_SECONDS = 7 * 24 * 60 * 60
export const DEFAULT_ROLE = 'viewer' // decision D12

export interface PublicUser {
  id: string
  username: string
  email: string
  role: string
  active: boolean
  createdAt: string
}

export function toPublicUser(user: authRepo.UserRecord): PublicUser {
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    role: user.role,
    active: user.active,
    createdAt: new Date(user.created_at).toISOString(),
  }
}

export function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, BCRYPT_COST)
}

export function sha256Hex(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex')
}

export function signAccessToken(
  user: { id: string; username: string; role: string },
  secret: string,
): string {
  return jwt.sign(
    // jti makes every issuance cryptographically distinct (AUTH-3 tests prove rotation).
    { sub: user.id, username: user.username, role: user.role, typ: 'access', jti: crypto.randomUUID() },
    secret,
    { expiresIn: ACCESS_TOKEN_TTL_SECONDS },
  )
}

export function signRefreshToken(
  payload: { sub: string; jti: string; fam: string },
  secret: string,
): string {
  return jwt.sign({ sub: payload.sub, jti: payload.jti, fam: payload.fam, typ: 'refresh' }, secret, {
    expiresIn: REFRESH_TOKEN_TTL_SECONDS,
  })
}

export interface TokenPair {
  accessToken: string
  refreshToken: string
}

async function issueTokenPair(
  db: Db,
  user: authRepo.UserRecord,
  secret: string,
): Promise<TokenPair> {
  const jti = crypto.randomUUID()
  const familyId = crypto.randomUUID()
  const rawRefresh = signRefreshToken({ sub: user.id, jti, fam: familyId }, secret)
  await authRepo.insertRefreshToken(db, {
    id: jti,
    userId: user.id,
    familyId,
    tokenHash: sha256Hex(rawRefresh),
    expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_SECONDS * 1000),
  })
  return { accessToken: signAccessToken(user, secret), refreshToken: rawRefresh }
}

/** AUTH-1: admin-only registration (OQ-3), default role viewer (D12). */
export async function register(db: Db, input: RegisterInput): Promise<PublicUser> {
  const passwordHash = await hashPassword(input.password)
  try {
    const user = await authRepo.insertUserWithRole(db, { ...input, passwordHash }, DEFAULT_ROLE)
    return toPublicUser(user)
  } catch (err) {
    if (isUniqueViolation(err)) {
      throw new ApiError(409, 'USERNAME_TAKEN', 'Username or email already in use')
    }
    throw err
  }
}

/** AUTH-2: login. Identical 401 for unknown user vs wrong password (no enumeration). */
export async function login(
  db: Db,
  input: LoginInput,
  secret: string,
): Promise<{ user: PublicUser } & TokenPair> {
  const user = await authRepo.findByUsername(db, input.username)
  const passwordOk = user ? await bcrypt.compare(input.password, user.password_hash) : false
  if (!user || !passwordOk || !user.active) {
    throw new ApiError(401, 'INVALID_CREDENTIALS', 'Invalid username or password')
  }
  const tokens = await issueTokenPair(db, user, secret)
  return { user: toPublicUser(user), ...tokens }
}

export interface RefreshResult extends TokenPair {
  user: PublicUser
}

/** AUTH-3: rotation with reuse detection — family invalidation on replay. */
export async function refresh(db: Db, rawToken: string | undefined, secret: string): Promise<RefreshResult> {
  if (!rawToken) {
    throw new ApiError(401, 'UNAUTHENTICATED', 'Refresh token missing')
  }
  let payload: jwt.JwtPayload
  try {
    payload = jwt.verify(rawToken, secret) as jwt.JwtPayload
  } catch {
    throw new ApiError(401, 'UNAUTHENTICATED', 'Invalid or expired refresh token')
  }
  if (
    payload.typ !== 'refresh' ||
    typeof payload.sub !== 'string' ||
    typeof payload.jti !== 'string' ||
    typeof payload.fam !== 'string'
  ) {
    throw new ApiError(401, 'UNAUTHENTICATED', 'Invalid refresh token')
  }

  const row = await authRepo.findByTokenHash(db, sha256Hex(rawToken))
  if (!row) {
    throw new ApiError(401, 'UNAUTHENTICATED', 'Invalid refresh token')
  }
  if (row.revoked_at !== null) {
    // Reuse of an already-rotated token → invalidate the ENTIRE family.
    await authRepo.revokeFamily(db, row.family_id)
    throw new ApiError(401, 'UNAUTHENTICATED', 'Refresh token has been reused')
  }
  if (new Date(row.expires_at).getTime() <= Date.now()) {
    await authRepo.revokeToken(db, row.id, null)
    throw new ApiError(401, 'UNAUTHENTICATED', 'Refresh token expired')
  }

  const user = await authRepo.findById(db, row.user_id)
  if (!user) {
    throw new ApiError(401, 'UNAUTHENTICATED', 'Invalid refresh token')
  }

  // Rotate: revoke old row (replaced_by = new jti), insert new row in the same family.
  const newJti = crypto.randomUUID()
  await authRepo.revokeToken(db, row.id, newJti)
  const newRaw = signRefreshToken({ sub: user.id, jti: newJti, fam: row.family_id }, secret)
  await authRepo.insertRefreshToken(db, {
    id: newJti,
    userId: user.id,
    familyId: row.family_id,
    tokenHash: sha256Hex(newRaw),
    expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_SECONDS * 1000),
  })
  return { user: toPublicUser(user), accessToken: signAccessToken(user, secret), refreshToken: newRaw }
}

/** AUTH-4: logout — idempotent, revokes the current refresh row. */
export async function logout(db: Db, rawToken: string | undefined): Promise<void> {
  if (!rawToken) return
  await authRepo.revokeByTokenHash(db, sha256Hex(rawToken))
}