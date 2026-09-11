// Throwaway helper for local dev / smoke-gate only. Docker wasn't
// available/approvable in the session that wrote it, so this stands in for
// `docker run postgres` + migrate: a real Postgres (PGlite, WASM) with the
// drizzle migrations applied, exposed over the Postgres wire protocol on
// 127.0.0.1:55433 so that `next dev` (via DATABASE_URL) talks to it exactly
// like it would to a real Postgres container. Run via `pnpm --dir api dev:pg`.
import { PGlite } from '@electric-sql/pglite'
import { drizzle } from 'drizzle-orm/pglite'
import { migrate } from 'drizzle-orm/pglite/migrator'
import { PGLiteSocketServer } from '@electric-sql/pglite-socket'
import * as schema from '../lib/db/schema.ts'

const cliente = new PGlite()
const db = drizzle(cliente, { schema })
await migrate(db, { migrationsFolder: './drizzle' })

const server = new PGLiteSocketServer({ db: cliente, port: 55433, host: '127.0.0.1' })
await server.start()
console.log('pglite socket server listening on 127.0.0.1:55433 (migrations applied)')

process.on('SIGINT', async () => {
  await server.stop()
  await cliente.close()
  process.exit(0)
})
