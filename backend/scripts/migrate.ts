import 'dotenv/config'
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { Client } from 'pg'

const SQL_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../src/db/sql')

function resolveUrl(target?: string): string {
  const url = new URL(
    process.env.DATABASE_URL ?? 'postgres://postgres:postgres@localhost:55434/inventory_stock',
  )
  if (target) url.pathname = `/${target}`
  return url.toString()
}

async function main(): Promise<void> {
  const args = process.argv.slice(2)
  const dbFlag = args.find((a) => a.startsWith('--db='))?.split('=')[1]
  const direction = args.includes('--down') ? 'down' : 'up'
  const target =
    dbFlag === 'test' ? 'inventory_stock_test' : dbFlag === 'dev' ? 'inventory_stock' : undefined

  const files = readdirSync(SQL_DIR)
    .filter((f) => f.endsWith(`.${direction}.sql`))
    .sort()
  if (direction === 'down') files.reverse()

  const client = new Client({ connectionString: resolveUrl(target) })
  await client.connect()
  try {
    for (const file of files) {
      const sql = readFileSync(path.join(SQL_DIR, file), 'utf8')
      console.log(`Applying ${file} (${direction})`)
      await client.query(sql)
    }
    console.log(`Migration ${direction} complete (${files.length} files) → ${target ?? 'DATABASE_URL'}`)
  } finally {
    await client.end()
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})