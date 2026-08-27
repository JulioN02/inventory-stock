import type { Db } from '../../db/pool.ts'
import type { AuditListQuery } from './dto.ts'
import * as auditRepo from './repository.ts'
import type { AuditLogRecord } from './repository.ts'

export interface AuditDto {
  id: string
  actor_type: string
  actor_user_id: string | null
  action: string
  entity_type: string | null
  entity_id: string | null
  payload: Record<string, unknown>
  ip: string | null
  user_agent: string | null
  occurred_at: string
}

export function toAuditDto(row: AuditLogRecord): AuditDto {
  return {
    id: row.id,
    actor_type: row.actor_type,
    actor_user_id: row.actor_user_id,
    action: row.action,
    entity_type: row.entity_type,
    entity_id: row.entity_id,
    payload: row.payload, // jsonb → object (pg parses it)
    ip: row.ip,
    user_agent: row.user_agent,
    occurred_at: new Date(row.occurred_at).toISOString(),
  }
}

/** AUD-5: read-only paginated list with parameterized filters. */
export async function listAudit(db: Db, query: AuditListQuery) {
  const result = await auditRepo.listAudit(db, {
    actor: query.actor,
    action: query.action,
    entityType: query.entity_type,
    from: query.from,
    to: query.to,
    page: query.page,
    pageSize: query.pageSize,
  })
  return {
    items: result.items.map(toAuditDto),
    total: result.total,
    page: query.page,
    pageSize: query.pageSize,
  }
}