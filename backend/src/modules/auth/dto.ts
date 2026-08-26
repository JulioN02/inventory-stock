import { z } from 'zod'

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