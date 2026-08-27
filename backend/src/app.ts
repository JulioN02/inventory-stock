import type { Express } from 'express'
import express from 'express'
import cookieParser from 'cookie-parser'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Pool } from 'pg'
import type { AppConfig } from './config/env.ts'
import { notFoundHandler, errorHandler } from './middleware/errorMiddleware.ts'
import { createAuthRouter } from './modules/auth/routes.ts'
import { createCatalogRouter } from './modules/catalog/routes.ts'
import { createMovementsRouter } from './modules/movements/routes.ts'

export interface AppDeps {
  db: Pool
  config: AppConfig
}

/**
 * Application factory. Kept dependency-injectable so tests can build the app
 * with their own pool and secrets (no module-level side effects).
 */
export function createApp({ db, config }: AppDeps): Express {
  const app = express()
  app.disable('x-powered-by')
  app.use(cookieParser(config.cookieSecret))
  app.use(express.json({ limit: '100kb' }))

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok' })
  })

  app.use('/api/auth', createAuthRouter({ db, config }))
  app.use('/api/products', createCatalogRouter({ db, config }).products)
  app.use('/api/warehouses', createCatalogRouter({ db, config }).warehouses)
  const movementsRouter = createMovementsRouter({ db, config })
  app.use('/api/movements', movementsRouter.movements)
  app.use('/api/stock', movementsRouter.stock)

  // Production: serve the built SPA from a single origin (decision D3).
  // Wired in I1 — does not block when frontend/dist does not exist yet.
  if (config.isProduction) {
    const distPath = path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      '../../frontend/dist',
    )
    const indexPath = path.join(distPath, 'index.html')
    if (existsSync(indexPath)) {
      app.use(express.static(distPath))
      app.use((req, res, next) => {
        if (req.method === 'GET' && !req.path.startsWith('/api/')) {
          res.sendFile(indexPath)
          return
        }
        next()
      })
    }
  }

  app.use(notFoundHandler)
  app.use(errorHandler)
  return app
}