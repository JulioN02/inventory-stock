import type { Db } from '../../db/pool.ts'
import type { RegisterInput } from './dto.ts'

export interface UserRecord {
  id: string
  username: string
  email: string
  password_hash: string
  active: boolean
  role: string
  created_at: Date
}

export interface RefreshTokenRecord {
  id: string
  user_id: string
  family_id: string
  token_hash: string
  expires_at: Date
  revoked_at: Date | null
  replaced_by: string | null
}

/** Inserts a user with its default role in one transaction unit. */
export async function insertUserWithRole(
  db: Db,
  input: RegisterInput & { passwordHash: string },
  role: string,
): Promise<UserRecord> {
  const { rows } = await db.query(
    `INSERT INTO users (username, email, password_hash)
     VALUES ($1, $2, $3)
     RETURNING id, username, email, password_hash, active, created_at`,
    [input.username, input.email, input.passwordHash],
  )
  const user = rows[0] as UserRecord
  await db.query(
    `INSERT INTO user_roles (user_id, role_id)
     SELECT $1, id FROM roles WHERE name = $2`,
    [user.id, role],
  )
  return { ...user, role }
}

export async function findByUsername(db: Db, username: string): Promise<UserRecord | null> {
  const { rows } = await db.query(
    `SELECT u.id, u.username, u.email, u.password_hash, u.active, u.created_at, r.name AS role
     FROM users u
     JOIN user_roles ur ON ur.user_id = u.id
     JOIN roles r ON r.id = ur.role_id
     WHERE u.username = $1`,
    [username],
  )
  return (rows[0] as UserRecord | undefined) ?? null
}

export async function findById(db: Db, id: string): Promise<UserRecord | null> {
  const { rows } = await db.query(
    `SELECT u.id, u.username, u.email, u.password_hash, u.active, u.created_at, r.name AS role
     FROM users u
     JOIN user_roles ur ON ur.user_id = u.id
     JOIN roles r ON r.id = ur.role_id
     WHERE u.id = $1`,
    [id],
  )
  return (rows[0] as UserRecord | undefined) ?? null
}

export interface InsertRefreshTokenInput {
  id: string
  userId: string
  familyId: string
  tokenHash: string
  expiresAt: Date
}

export async function insertRefreshToken(
  db: Db,
  input: InsertRefreshTokenInput,
): Promise<void> {
  await db.query(
    `INSERT INTO refresh_tokens (id, user_id, family_id, token_hash, expires_at)
     VALUES ($1, $2, $3, $4, $5)`,
    [input.id, input.userId, input.familyId, input.tokenHash, input.expiresAt],
  )
}

/**
 * W1: locks the refresh-token row for the duration of the rotation transaction.
 * `FOR UPDATE SKIP LOCKED` makes concurrent refreshes of the SAME token fail
 * fast (no row → 401) while the winner's transaction is still open, so a
 * concurrent loser never observes the rotation as a "replay". A genuine
 * sequential replay (row not locked) still reads the revoked row and hits the
 * reuse branch, which invalidates the whole family (AUTH-3).
 */
export async function findByTokenHashForUpdate(
  db: Db,
  tokenHash: string,
): Promise<RefreshTokenRecord | null> {
  const { rows } = await db.query(
    `SELECT * FROM refresh_tokens WHERE token_hash = $1 FOR UPDATE SKIP LOCKED`,
    [tokenHash],
  )
  return (rows[0] as RefreshTokenRecord | undefined) ?? null
}

/** Rotates: revokes the old row and records which jti replaced it. Returns false when the row was already revoked. */
export async function revokeToken(db: Db, id: string, replacedBy: string | null): Promise<boolean> {
  const { rows } = await db.query(
    `UPDATE refresh_tokens SET revoked_at = now(), replaced_by = $2
     WHERE id = $1 AND revoked_at IS NULL
     RETURNING id`,
    [id, replacedBy],
  )
  return rows.length > 0
}

/** Reuse detection: invalidates every still-active token of the family. */
export async function revokeFamily(db: Db, familyId: string): Promise<void> {
  await db.query(
    `UPDATE refresh_tokens SET revoked_at = now()
     WHERE family_id = $1 AND revoked_at IS NULL`,
    [familyId],
  )
}

export async function revokeByTokenHash(db: Db, tokenHash: string): Promise<void> {
  await db.query(
    `UPDATE refresh_tokens SET revoked_at = now()
     WHERE token_hash = $1 AND revoked_at IS NULL`,
    [tokenHash],
  )
}