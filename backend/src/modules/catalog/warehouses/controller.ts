import type { Request, Response } from 'express'
import type { Db } from '../../../db/pool.ts'
import { ApiError } from '../../../middleware/errorHandler.ts'
import type { WarehouseCreateInput, WarehouseUpdateInput } from './dto.ts'
import { warehouseListQuerySchema } from './dto.ts'
import * as warehouseService from './service.ts'

export interface WarehousesController {
  create: (req: Request, res: Response) => Promise<void>
  update: (req: Request, res: Response) => Promise<void>
  list: (req: Request, res: Response) => Promise<void>
  remove: (req: Request, res: Response) => Promise<void>
}

function paramId(req: Request): string {
  const raw = req.params.id
  const id = Array.isArray(raw) ? raw[0] : raw
  if (!id) throw new ApiError(400, 'VALIDATION_ERROR', 'Missing id parameter')
  return id
}

export function createWarehousesController(deps: { db: Db }): WarehousesController {
  const { db } = deps

  async function create(req: Request, res: Response): Promise<void> {
    const warehouse = await warehouseService.createWarehouse(db, req.body as WarehouseCreateInput)
    res.status(201).json({ warehouse })
  }

  async function update(req: Request, res: Response): Promise<void> {
    const warehouse = await warehouseService.updateWarehouse(
      db,
      paramId(req),
      req.body as WarehouseUpdateInput,
    )
    res.json({ warehouse })
  }

  async function list(req: Request, res: Response): Promise<void> {
    const parsed = warehouseListQuerySchema.safeParse(req.query)
    if (!parsed.success) {
      throw new ApiError(422, 'VALIDATION_ERROR', 'Invalid query parameters')
    }
    res.json(await warehouseService.listWarehouses(db, parsed.data))
  }

  async function remove(req: Request, res: Response): Promise<void> {
    const warehouse = await warehouseService.deactivateWarehouse(db, paramId(req))
    res.json({ warehouse })
  }

  return { create, update, list, remove }
}