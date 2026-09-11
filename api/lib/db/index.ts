import { drizzle as drizzleNeon } from 'drizzle-orm/neon-http'
import { drizzle as drizzlePg } from 'drizzle-orm/node-postgres'
import { neon } from '@neondatabase/serverless'
import { Pool } from 'pg'
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core'
import * as schema from './schema'

function resolverUrl(): string {
  const url = process.env.DATABASE_URL ?? process.env.POSTGRES_URL
  if (!url) {
    throw new Error(
      'Nenhuma URL de banco: defina DATABASE_URL ou POSTGRES_URL — em dev no ' +
        '.env.local, em produção nas Environment Variables da Vercel.',
    )
  }
  return url
}

function resolverDriver(url: string): 'neon' | 'postgres' {
  const explicito = process.env.DB_DRIVER
  if (explicito === undefined) return /neon\.tech/.test(url) ? 'neon' : 'postgres'
  if (explicito === 'neon' || explicito === 'postgres') return explicito
  throw new Error(`DB_DRIVER inválido: "${explicito}". Aceitos: "neon" ou "postgres".`)
}

function conectar(): Db {
  const url = resolverUrl()
  return resolverDriver(url) === 'neon'
    ? drizzleNeon(neon(url), { schema })
    : drizzlePg(new Pool({ connectionString: url }), { schema })
}

let conexao: Db | null = null

// A conexão nasce na primeira query, não no import: `next build` importa todo
// módulo de rota para ler a config, e um import que conecta derrubaria o build
// num ambiente que não tem — nem deveria ter — acesso ao banco.
export const db: Db = new Proxy({} as Db, {
  get(_alvo, prop) {
    conexao ??= conectar()
    const valor = Reflect.get(conexao, prop, conexao)
    return typeof valor === 'function' ? valor.bind(conexao) : valor
  },
})

// Supertipo estrutural do Drizzle, não `typeof db`: é o que permite passar o
// db do PGlite nos testes para as mesmas funções.
export type Db = PgDatabase<PgQueryResultHKT, typeof schema>
