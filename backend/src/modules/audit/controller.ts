import type { Request, Response } from 'express'
import type { Db } from '../../db/pool.ts'
import type { ZodType } from 'zod'
import { ApiError } from '../../middleware/errorHandler.ts'
import { auditListQuerySchema } from './dto.ts'
import * as auditService from './service.ts'

export interface AuditController {
  list: (req: Request, res: Response) => Promise<void>
}

function parseQuery<T>(req: Request, schema: ZodType<T>): T {
  const parsed = schema.safeParse(req.query)
  if (!parsed.success) {
    throw new ApiError(422, 'VALIDATION_ERROR', 'Invalid query parameters')
  }
  return parsed.data
}

/** Orchestration only (≤15 lines/endpoint). Read-only — no write endpoints exist. */
export function createAuditController(deps: { db: Db }): AuditController {
  const { db } = deps

  async function list(req: Request, res: Response): Promise<void> {
    res.json(await auditService.listAudit(db, parseQuery(req, auditListQuerySchema)))
  }

  return { list }
}