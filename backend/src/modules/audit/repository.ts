import type { Db } from '../../db/pool.ts'

/**
 * Audit repository (LAB-08 / AUD-1..6).
 *
 * Two write paths, per decision D14:
 * - `write`: SAME-transaction helper — called from domain repositories inside
 *   an existing `withTransaction` flow. If the domain change rolls back, its
 *   audit row rolls back with it (AUD-2).
 * - `writeBestEffort`: separate write for auth denial/failure events
 *   (login failure, refresh reuse, permission denied, logout). Wrapped in
 *   try/catch — it can NEVER fail the request (D14).
 */

export type ActorType = 'user' | 'system' | 'anonymous'

export interface AuditEntry {
  actorType: ActorType
  actorUserId?: string | null
  action: string
  entityType?: string | null
  entityId?: string | null
  /** Entity snapshot / outcome only — NEVER passwords, hashes, tokens or secrets (AUD-6). */
  payload?: Record<string, unknown> | null
  ip?: string | null
  userAgent?: string | null
}

export async function write(db: Db, entry: AuditEntry): Promise<void> {
  await db.query(
    `INSERT INTO audit_log
       (actor_type, actor_user_id, action, entity_type, entity_id, payload, ip, user_agent)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8)`,
    [
      entry.actorType,
      entry.actorUserId ?? null,
      entry.action,
      entry.entityType ?? null,
      entry.entityId ?? null,
      JSON.stringify(entry.payload ?? {}),
      entry.ip ?? null,
      entry.userAgent ?? null,
    ],
  )
}

/** D14: best-effort write — never throws, never fails the request. */
export async function writeBestEffort(db: Db, entry: AuditEntry): Promise<void> {
  try {
    await write(db, entry)
  } catch (err) {
    console.error(`audit write failed (best-effort, action=${entry.action}):`, err)
  }
}

export interface AuditLogRecord {
  id: string // BIGSERIAL → string (pg int8)
  actor_type: string
  actor_user_id: string | null
  action: string
  entity_type: string | null
  entity_id: string | null
  payload: Record<string, unknown> // jsonb parsed by pg
  ip: string | null
  user_agent: string | null
  occurred_at: Date
}

export interface AuditListResult {
  items: AuditLogRecord[]
  total: number
}

/**
 * AUD-5: read-only, paginated query with parameterized filters.
 * Date filters compare against occurred_at (timestamptz); every user input
 * flows through $n placeholders — never string-interpolated.
 */
export async function listAudit(
  db: Db,
  opts: {
    actor?: string
    action?: string
    entityType?: string
    from?: string
    to?: string
    page: number
    pageSize: number
  },
): Promise<AuditListResult> {
  const where: string[] = []
  const values: unknown[] = []
  if (opts.actor) {
    values.push(opts.actor)
    where.push(`actor_user_id = $${values.length}`)
  }
  if (opts.action) {
    values.push(opts.action)
    where.push(`action = $${values.length}`)
  }
  if (opts.entityType) {
    values.push(opts.entityType)
    where.push(`entity_type = $${values.length}`)
  }
  if (opts.from) {
    values.push(opts.from)
    where.push(`occurred_at >= $${values.length}::timestamptz`)
  }
  if (opts.to) {
    values.push(opts.to)
    where.push(`occurred_at <= $${values.length}::timestamptz`)
  }
  const whereSql = where.length > 0 ? `WHERE ${where.join(' AND ')}` : ''
  const offset = (opts.page - 1) * opts.pageSize

  const count = await db.query(`SELECT COUNT(*)::int AS total FROM audit_log ${whereSql}`, values)
  const data = await db.query(
    `SELECT * FROM audit_log ${whereSql}
     ORDER BY occurred_at DESC, id DESC
     LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
    [...values, opts.pageSize, offset],
  )
  return {
    items: data.rows as AuditLogRecord[],
    total: (count.rows[0] as { total: number }).total,
  }
}