import type { Request, Response } from 'express'
import type { Pool } from 'pg'
import type { ZodType } from 'zod'
import { ApiError } from '../../middleware/errorHandler.ts'
import type { AdjustmentCreateInput, MovementCreateInput, TransferCreateInput } from './dto.ts'
import { lowStockQuerySchema, movementListQuerySchema, stockQuerySchema } from './dto.ts'
import * as movementService from './service.ts'

export interface MovementsController {
  create: (req: Request, res: Response) => Promise<void>
  list: (req: Request, res: Response) => Promise<void>
  transfer: (req: Request, res: Response) => Promise<void>
  adjust: (req: Request, res: Response) => Promise<void>
  stock: (req: Request, res: Response) => Promise<void>
  lowStock: (req: Request, res: Response) => Promise<void>
}

/** requireAuth runs before every handler — the actor is always present. */
function actorId(req: Request): string {
  if (!req.user) {
    throw new ApiError(401, 'UNAUTHENTICATED', 'Authentication required')
  }
  return req.user.id
}

function parseQuery<T>(req: Request, schema: ZodType<T>): T {
  const parsed = schema.safeParse(req.query)
  if (!parsed.success) {
    throw new ApiError(422, 'VALIDATION_ERROR', 'Invalid query parameters')
  }
  return parsed.data
}

/** Orchestration only (≤15 lines/endpoint). Writes run in a transaction (service). */
export function createMovementsController(deps: { db: Pool }): MovementsController {
  const { db } = deps

  async function create(req: Request, res: Response): Promise<void> {
    const result = await movementService.registerMovement(db, actorId(req), req.body as MovementCreateInput)
    res.status(result.replay ? 200 : 201).json({ movement: result.movement })
  }

  async function list(req: Request, res: Response): Promise<void> {
    res.json(await movementService.listMovements(db, parseQuery(req, movementListQuerySchema)))
  }

  async function transfer(req: Request, res: Response): Promise<void> {
    const result = await movementService.transfer(db, actorId(req), req.body as TransferCreateInput)
    res.status(result.replay ? 200 : 201).json({ movement: result.movement })
  }

  async function adjust(req: Request, res: Response): Promise<void> {
    const result = await movementService.adjust(db, actorId(req), req.body as AdjustmentCreateInput)
    res.status(result.replay ? 200 : 201).json({ movement: result.movement })
  }

  async function stock(req: Request, res: Response): Promise<void> {
    res.json(await movementService.getStock(db, parseQuery(req, stockQuerySchema)))
  }

  async function lowStock(req: Request, res: Response): Promise<void> {
    res.json(await movementService.getLowStock(db, parseQuery(req, lowStockQuerySchema)))
  }

  return { create, list, transfer, adjust, stock, lowStock }
}