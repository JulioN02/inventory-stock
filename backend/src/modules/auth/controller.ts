import type { Request, Response } from 'express'
import type { Pool } from 'pg'
import type { AppConfig } from '../../config/env.ts'
import type { LoginInput, RegisterInput } from './dto.ts'
import * as authService from './service.ts'
import { clearRefreshCookie, readRefreshCookie, setRefreshCookie } from './cookies.ts'

export interface AuthController {
  register: (req: Request, res: Response) => Promise<void>
  login: (req: Request, res: Response) => Promise<void>
  refresh: (req: Request, res: Response) => Promise<void>
  logout: (req: Request, res: Response) => Promise<void>
}

/** Orchestration only — every endpoint stays under 15 lines (vertical-slices). */
export function createAuthController(deps: { db: Pool; config: AppConfig }): AuthController {
  const { db, config } = deps

  /** Request context for audit rows (ip/user_agent MAY be recorded, AUD-1). */
  function meta(req: Request): { ip: string | null; userAgent: string | undefined } {
    return { ip: req.ip ?? null, userAgent: req.get('user-agent') ?? undefined }
  }

  async function register(req: Request, res: Response): Promise<void> {
    const user = await authService.register(db, req.body as RegisterInput)
    res.status(201).json({ user })
  }

  async function login(req: Request, res: Response): Promise<void> {
    const result = await authService.login(db, req.body as LoginInput, config.jwtSecret, meta(req))
    setRefreshCookie(res, result.refreshToken, config)
    res.json({ user: result.user, accessToken: result.accessToken })
  }

  async function refresh(req: Request, res: Response): Promise<void> {
    const result = await authService.refresh(db, readRefreshCookie(req), config.jwtSecret, meta(req))
    setRefreshCookie(res, result.refreshToken, config)
    res.json({ user: result.user, accessToken: result.accessToken })
  }

  async function logout(req: Request, res: Response): Promise<void> {
    await authService.logout(db, readRefreshCookie(req), meta(req))
    clearRefreshCookie(res, config)
    res.json({ ok: true })
  }

  return { register, login, refresh, logout }
}