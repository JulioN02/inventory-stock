import 'dotenv/config'
import { z } from 'zod'

export interface AppConfig {
  jwtSecret: string
  cookieSecret: string
  isProduction: boolean
  corsOrigin: string
}

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters (HS256)'),
  COOKIE_SECRET: z.string().min(32, 'COOKIE_SECRET must be at least 32 characters'),
  CORS_ORIGIN: z.string().url().default('http://localhost:5173'),
})

const parsed = EnvSchema.safeParse(process.env)
if (!parsed.success) {
  console.error('Invalid environment configuration:')
  console.error(JSON.stringify(parsed.error.flatten().fieldErrors, null, 2))
  throw new Error('Invalid environment configuration')
}

export const env = {
  NODE_ENV: parsed.data.NODE_ENV,
  PORT: parsed.data.PORT,
  DATABASE_URL: parsed.data.DATABASE_URL,
  appConfig: {
    jwtSecret: parsed.data.JWT_SECRET,
    cookieSecret: parsed.data.COOKIE_SECRET,
    isProduction: parsed.data.NODE_ENV === 'production',
    corsOrigin: parsed.data.CORS_ORIGIN,
  } satisfies AppConfig,
}