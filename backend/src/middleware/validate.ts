import type { RequestHandler } from 'express'
import type { ZodType } from 'zod'
import { ApiError } from './errorHandler.ts'

/**
 * Zod v4 DTO validation middleware. On success the parsed (typed) value
 * replaces req.body; on failure it forwards a uniform 422 with issue details.
 */
export function validateDto<T>(schema: ZodType<T>): RequestHandler {
  return (req, _res, next) => {
    const result = schema.safeParse(req.body)
    if (!result.success) {
      const details = result.error.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      }))
      next(new ApiError(422, 'VALIDATION_ERROR', 'Invalid request payload', details))
      return
    }
    req.body = result.data
    next()
  }
}