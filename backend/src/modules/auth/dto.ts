import { z } from 'zod'

/**
 * REG-ROLE (I6): roles assignable at registration. Whitelist excludes
 * 'admin' on purpose — admin is NOT grantable via the API (escalation
 * control, D-P11); 'admin' → 422 VALIDATION_ERROR via z.enum.
 * Const-array + derived union (typescript skill — no bare string unions).
 */
export const REGISTERABLE_ROLES = ['operator', 'viewer', 'auditor'] as const
export type RegisterableRole = (typeof REGISTERABLE_ROLES)[number]

/** AUTH-1 password policy: ≥ 8 chars, at least one letter and one digit. */
export const registerSchema = z
  .object({
    username: z
      .string()
      .trim()
      .min(3)
      .max(50)
      .regex(/^[a-zA-Z0-9_]+$/, 'username may contain letters, digits and underscores'),
    email: z.email().max(254),
    password: z
      .string()
      .min(8, 'password must be at least 8 characters')
      .max(72, 'password must be at most 72 characters')
      .regex(/[a-zA-Z]/, 'password must contain a letter')
      .regex(/[0-9]/, 'password must contain a digit'),
    // REG-ROLE: optional whitelisted role; default 'viewer' applied in the service.
    role: z.enum(REGISTERABLE_ROLES).optional(),
  })
  .strict()

export const loginSchema = z
  .object({
    username: z.string().min(1),
    password: z.string().min(1),
  })
  .strict()

export type RegisterInput = z.infer<typeof registerSchema>
export type LoginInput = z.infer<typeof loginSchema>