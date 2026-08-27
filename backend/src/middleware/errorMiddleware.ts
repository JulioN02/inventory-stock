import type { ErrorRequestHandler, RequestHandler } from 'express'
import { ApiError } from './errorHandler.ts'

export const notFoundHandler: RequestHandler = (req, res) => {
  res.status(404).json({
    error: { code: 'NOT_FOUND', message: `Route ${req.method} ${req.path} not found` },
  })
}

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof ApiError) {
    const body: { code: string; message: string; details?: unknown } = {
      code: err.code,
      message: err.message,
    }
    if (err.details !== undefined) body.details = err.details
    res.status(err.status).json({ error: body })
    return
  }
  // Never leak internals; generic 500 for unexpected failures (AUTH-7).
  console.error('Unhandled error:', err)
  res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } })
}