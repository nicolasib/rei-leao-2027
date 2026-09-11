import { PGlite } from '@electric-sql/pglite'
import { drizzle } from 'drizzle-orm/pglite'
import { migrate } from 'drizzle-orm/pglite/migrator'
import * as schema from '@/lib/db/schema'

// Postgres de verdade, em memória, com as migrations aplicadas: os testes
// exercitam unique e check constraint, que um mock não teria.
export async function criarDbDeTeste() {
  const cliente = new PGlite()
  const db = drizzle(cliente, { schema })
  await migrate(db, { migrationsFolder: './drizzle' })
  return { db, encerrar: () => cliente.close() }
}
