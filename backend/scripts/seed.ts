import 'dotenv/config'
import bcrypt from 'bcryptjs'
import { Client } from 'pg'

/**
 * Admin bootstrap (decision D12): the admin USER is never seeded by a
 * migration — it is created here from env-only credentials (password never
 * committed). Idempotent: existing admin is left untouched.
 */
async function main(): Promise<void> {
  const username = process.env.ADMIN_USERNAME ?? 'admin'
  const password = process.env.ADMIN_PASSWORD
  const email = process.env.ADMIN_EMAIL ?? 'admin@example.com'
  if (!password || password.length < 8) {
    console.error('ADMIN_PASSWORD env var is required (min 8 chars)')
    process.exit(1)
  }

  const client = new Client({
    connectionString:
      process.env.DATABASE_URL ?? 'postgres://postgres:postgres@localhost:55434/inventory_stock',
  })
  await client.connect()
  try {
    const hash = await bcrypt.hash(password, 10) // OQ-4: cost 10
    const { rows } = await client.query(
      `INSERT INTO users (username, email, password_hash) VALUES ($1, $2, $3)
       ON CONFLICT (username) DO NOTHING
       RETURNING id`,
      [username, email, hash],
    )
    if (rows.length === 0) {
      console.log(`Admin user '${username}' already exists — skipped.`)
      return
    }
    await client.query(
      `INSERT INTO user_roles (user_id, role_id)
       SELECT $1, id FROM roles WHERE name = 'admin'
       ON CONFLICT DO NOTHING`,
      [rows[0].id],
    )
    console.log(`Admin user '${username}' created with role 'admin'.`)
  } finally {
    await client.end()
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})