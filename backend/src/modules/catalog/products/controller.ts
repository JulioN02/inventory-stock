import type { Request, Response } from 'express'
import type { Db } from '../../../db/pool.ts'
import { ApiError } from '../../../middleware/errorHandler.ts'
import type { ProductCreateInput, ProductUpdateInput } from './dto.ts'
import { productListQuerySchema } from './dto.ts'
import * as productService from './service.ts'

export interface ProductsController {
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

/** Orchestration only (≤15 lines/endpoint). */
export function createProductsController(deps: { db: Db }): ProductsController {
  const { db } = deps

  async function create(req: Request, res: Response): Promise<void> {
    const product = await productService.createProduct(db, req.body as ProductCreateInput)
    res.status(201).json({ product })
  }

  async function update(req: Request, res: Response): Promise<void> {
    const product = await productService.updateProduct(
      db,
      paramId(req),
      req.body as ProductUpdateInput,
    )
    res.json({ product })
  }

  async function list(req: Request, res: Response): Promise<void> {
    const parsed = productListQuerySchema.safeParse(req.query)
    if (!parsed.success) {
      throw new ApiError(422, 'VALIDATION_ERROR', 'Invalid query parameters')
    }
    res.json(await productService.listProducts(db, parsed.data))
  }

  async function remove(req: Request, res: Response): Promise<void> {
    const product = await productService.deactivateProduct(db, paramId(req))
    res.json({ product })
  }

  return { create, update, list, remove }
}