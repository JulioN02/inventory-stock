import bcrypt from 'bcryptjs'
import type { Pool } from 'pg'
import type { Express } from 'express'
import request from 'supertest'

export interface CreatedUser {
  id: string
}

/** Creates a user directly in the DB with a bcrypt hash and a role (test bootstrap). */
export async function createUser(
  pool: Pool,
  input: { username: string; email: string; password: string; role: string },
): Promise<CreatedUser> {
  const hash = await bcrypt.hash(input.password, 10)
  const { rows } = await pool.query(
    `INSERT INTO users (username, email, password_hash) VALUES ($1, $2, $3) RETURNING id`,
    [input.username, input.email, hash],
  )
  await pool.query(
    `INSERT INTO user_roles (user_id, role_id) SELECT $1, id FROM roles WHERE name = $2`,
    [rows[0].id, input.role],
  )
  return rows[0] as CreatedUser
}

/** Logs in via the real API and returns the access token. */
export async function loginAndGetToken(
  app: Express,
  username: string,
  password: string,
): Promise<string> {
  const res = await request(app).post('/api/auth/login').send({ username, password })
  if (res.status !== 200) {
    throw new Error(`login failed: ${res.status} ${JSON.stringify(res.body)}`)
  }
  return res.body.accessToken as string
}

/** Bootstrap: admin user + real API login. Returns access token and login response. */
export async function adminToken(
  app: Express,
  pool: Pool,
  username = 'admin',
  password = 'AdminPass123',
): Promise<{ token: string; login: request.Response }> {
  await createUser(pool, {
    username,
    email: 'admin@test.local',
    password,
    role: 'admin',
  })
  const login = await request(app).post('/api/auth/login').send({ username, password })
  if (login.status !== 200) {
    throw new Error(`admin login failed: ${login.status} ${JSON.stringify(login.body)}`)
  }
  return { token: login.body.accessToken as string, login }
}