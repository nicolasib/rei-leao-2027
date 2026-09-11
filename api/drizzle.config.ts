import type { Config } from 'drizzle-kit'
import { config } from 'dotenv'

config({ path: '.env.local' })

function resolverUrl(): string {
  const url = process.env.DATABASE_URL ?? process.env.POSTGRES_URL
  if (!url) throw new Error('Defina DATABASE_URL ou POSTGRES_URL para rodar o drizzle-kit.')
  return url
}

export default {
  schema: './lib/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: { url: resolverUrl() },
} satisfies Config
