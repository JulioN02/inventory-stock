import crypto from 'node:crypto'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import type { Pool } from 'pg'
import { ApiError, isUniqueViolation } from '../../middleware/errorHandler.ts'
import type { Db } from '../../db/pool.ts'
import { withTransaction } from '../../db/transaction.ts'
import * as auditRepo from '../audit/repository.ts'
import type { LoginInput, RegisterInput } from './dto.ts'
import * as authRepo from './repository.ts'

export const BCRYPT_COST = 10 // OQ-4 confirmed: spec floor, internal tool perf
export const ACCESS_TOKEN_TTL_SECONDS = 15 * 60
export const REFRESH_TOKEN_TTL_SECONDS = 7 * 24 * 60 * 60
export const DEFAULT_ROLE = 'viewer' // decision D12

/** Optional request context recorded on auth audit rows (ip/user_agent MAY be recorded, AUD-1). */
export interface AuthMeta {
  ip?: string | null
  userAgent?: string | null
}

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

/** AUTH-1: admin-only registration (OQ-3), default role viewer (D12). REG-ROLE: optional whitelisted role. */
export async function register(db: Db, input: RegisterInput): Promise<PublicUser> {
  const passwordHash = await hashPassword(input.password)
  const role = input.role ?? DEFAULT_ROLE // D-P11: default viewer; whitelist enforced by the DTO
  try {
    // Explicit fields only — `role` must never leak into the repository spread.
    const user = await authRepo.insertUserWithRole(
      db,
      { username: input.username, email: input.email, password: input.password, passwordHash },
      role,
    )
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
  meta?: AuthMeta,
): Promise<{ user: PublicUser } & TokenPair> {
  const user = await authRepo.findByUsername(db, input.username)
  const passwordOk = user ? await bcrypt.compare(input.password, user.password_hash) : false
  if (!user || !passwordOk || !user.active) {
    // AUD-3: best-effort audit — the identical 401 is still logged, and the
    // payload never reveals WHICH field failed (no enumeration, AUTH-2).
    await auditRepo.writeBestEffort(db, {
      actorType: user ? 'user' : 'anonymous',
      actorUserId: user?.id ?? null,
      action: 'auth.login.failure',
      entityType: 'user',
      entityId: user?.id ?? null,
      payload: { username: input.username, outcome: 'failure' },
      ip: meta?.ip ?? null,
      userAgent: meta?.userAgent ?? null,
    })
    throw new ApiError(401, 'INVALID_CREDENTIALS', 'Invalid username or password')
  }
  const tokens = await issueTokenPair(db, user, secret)
  // AUD-3: login success audit (best-effort — never fails the request, D14).
  // AUD-6: payload carries id/username/outcome only — NO credential material.
  await auditRepo.writeBestEffort(db, {
    actorType: 'user',
    actorUserId: user.id,
    action: 'auth.login.success',
    entityType: 'user',
    entityId: user.id,
    payload: { username: user.username, outcome: 'success' },
    ip: meta?.ip ?? null,
    userAgent: meta?.userAgent ?? null,
  })
  return { user: toPublicUser(user), ...tokens }
}

export interface RefreshResult extends TokenPair {
  user: PublicUser
}

/** Discriminated outcome of the rotation transaction (see refresh). */
type RotationOutcome =
  | { kind: 'ok'; user: PublicUser; accessToken: string; refreshToken: string }
  | { kind: 'reuse' }
  | { kind: 'expired' }
  | { kind: 'invalid' }

/**
 * AUTH-3: rotation with reuse detection — family invalidation on replay.
 *
 * W1 fix: the whole read → revoke → insert rotation runs inside ONE
 * transaction, so the "one active token per family" invariant holds under
 * concurrency. `findByTokenHashForUpdate` uses `FOR UPDATE SKIP LOCKED`:
 * a concurrent refresh of the same token finds the row LOCKED → no row → 401
 * invalid without touching the family (the winner's new token survives); a
 * true sequential replay finds the row unlocked but revoked → reuse branch →
 * family invalidated. The reuse/expired branches return normally so the
 * transaction COMMITS their revocation before the 401 is thrown (a throw
 * inside the transaction would ROLLBACK the family invalidation).
 */
export async function refresh(pool: Pool, rawToken: string | undefined, secret: string, meta?: AuthMeta): Promise<RefreshResult> {
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

  const outcome = await withTransaction<RotationOutcome>(pool, async (client) => {
    const row = await authRepo.findByTokenHashForUpdate(client, sha256Hex(rawToken))
    if (!row) {
      return { kind: 'invalid' }
    }
    if (row.revoked_at !== null) {
      // Reuse of an already-rotated token → invalidate the ENTIRE family.
      await authRepo.revokeFamily(client, row.family_id)
      // AUD-3: best-effort marker of the family invalidation, same-tx with the
      // revoke (the tx COMMITs the invalidation; the 401 is thrown after it).
      await auditRepo.writeBestEffort(client, {
        actorType: 'user',
        actorUserId: row.user_id,
        action: 'auth.refresh.reuse',
        entityType: 'refresh_token',
        entityId: row.id,
        payload: { family_id: row.family_id, outcome: 'family_invalidated' },
        ip: meta?.ip ?? null,
        userAgent: meta?.userAgent ?? null,
      })
      return { kind: 'reuse' }
    }
    if (new Date(row.expires_at).getTime() <= Date.now()) {
      await authRepo.revokeToken(client, row.id, null)
      return { kind: 'expired' }
    }

    const user = await authRepo.findById(client, row.user_id)
    if (!user) {
      return { kind: 'invalid' }
    }

    // Rotate: revoke old row (replaced_by = new jti), insert new row in the same family.
    const newJti = crypto.randomUUID()
    const revoked = await authRepo.revokeToken(client, row.id, newJti)
    if (!revoked) {
      // Safety net while holding the row lock (unreachable in practice):
      // the row was already revoked under our lock → replay semantics.
      await authRepo.revokeFamily(client, row.family_id)
      return { kind: 'reuse' }
    }
    const newRaw = signRefreshToken({ sub: user.id, jti: newJti, fam: row.family_id }, secret)
    await authRepo.insertRefreshToken(client, {
      id: newJti,
      userId: user.id,
      familyId: row.family_id,
      tokenHash: sha256Hex(newRaw),
      expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_SECONDS * 1000),
    })
    return {
      kind: 'ok',
      user: toPublicUser(user),
      accessToken: signAccessToken(user, secret),
      refreshToken: newRaw,
    }
  })

  if (outcome.kind === 'ok') {
    return outcome
  }
  switch (outcome.kind) {
    case 'reuse':
      throw new ApiError(401, 'UNAUTHENTICATED', 'Refresh token has been reused')
    case 'expired':
      throw new ApiError(401, 'UNAUTHENTICATED', 'Refresh token expired')
    default:
      throw new ApiError(401, 'UNAUTHENTICATED', 'Invalid refresh token')
  }
}

/** AUTH-4: logout — idempotent, revokes the current refresh row. */
export async function logout(db: Db, rawToken: string | undefined, meta?: AuthMeta): Promise<void> {
  if (!rawToken) return
  const userId = await authRepo.revokeByTokenHash(db, sha256Hex(rawToken))
  if (userId) {
    // AUD-3: best-effort audit of the session end.
    await auditRepo.writeBestEffort(db, {
      actorType: 'user',
      actorUserId: userId,
      action: 'auth.logout',
      entityType: 'user',
      entityId: userId,
      payload: { outcome: 'success' },
      ip: meta?.ip ?? null,
      userAgent: meta?.userAgent ?? null,
    })
  }
}