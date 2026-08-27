import { z } from 'zod'

/**
 * Audit query DTO (AUD-5): read-only, paginated, parameterized filters
 * (actor, action, entity_type, date range). `actor` is the actor_user_id UUID.
 */
export const auditListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  actor: z.string().uuid().optional(),
  action: z.string().trim().min(1).max(100).optional(),
  entity_type: z.string().trim().min(1).max(100).optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
})

export type AuditListQuery = z.infer<typeof auditListQuerySchema>