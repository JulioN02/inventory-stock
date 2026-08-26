import { env } from './config/env.ts'
import { createPool } from './db/pool.ts'
import { createApp } from './app.ts'

const pool = createPool(env.DATABASE_URL)
const app = createApp({ db: pool, config: env.appConfig })

app.listen(env.PORT, () => {
  console.log(`Inventory & Stock API listening on :${env.PORT} (${env.NODE_ENV})`)
})