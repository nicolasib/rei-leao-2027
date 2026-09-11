# Votação Sim/Não — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: use `superpowers:subagent-driven-development`, `superpowers:executing-plans`, ou `parallel-plan-execution` (`plo`) para executar tarefa a tarefa. Steps usam checkbox (`- [ ]`) para acompanhamento.

**Goal:** cada pessoa marca Sim/Não em cada uma das 23 casas e a página mostra o placar acumulado do grupo, com as mais aprovadas em cima.

**Architecture:** a página continua estática no GitHub Pages. Um app Next novo mora na subpasta `api/` do mesmo repo e é publicado na Vercel com Root Directory `api`, expondo Route Handlers (`/api/votos`) com CORS. O voto é anônimo por dispositivo: id gerado no cliente e guardado no `localStorage` do próprio Pages. Postgres Neon + Drizzle, uma tabela.

**Tech Stack:** Next 16.3.1 (App Router, Route Handlers), React 19.2.8, Drizzle ORM 0.45, Postgres (Neon em produção, PGlite em memória nos testes), Zod 4, Vitest 4, pnpm 10.33.0. O front é o `index.html` que já existe: JS vanilla, sem build.

**Spec:** `docs/superpowers/specs/2026-09-11-votacao-sim-nao-design.md`

## Global Constraints

- Toda a implementação acontece na branch `feat/votacao-sim-nao`. Nunca commitar em `main`.
- O app Next vive em `api/`. Nada dentro de `api/` pode ser necessário para a página funcionar: se a API estiver fora do ar, `index.html` continua sendo o comparador de custo completo.
- `saldo = (nº de Sim) − (nº de Não)`. Sem voto não pontua.
- Neutro **não** é linha com `valor = 0`: é a ausência da linha. Desvotar é DELETE.
- `valor` aceito na API: `1`, `0`, `-1`. `valor` aceito no banco: `1`, `-1`.
- Os 23 ids de casa são a lista fechada: `st2, st3, ln1, ln2, cap1, sso, nl1, nl2, sjdr1, sjdr2, rm, st4, cipo1, cipo2, cipo3, vertente, igarape, felix, cipoc, itag, cillis, renascer, jab`.
- Origem CORS permitida sempre: `https://nicolasib.github.io`. Em `NODE_ENV !== 'production'`, também `http://localhost:<qualquer porta>`.
- Sem cookie, sem `credentials`, sem autenticação.
- Nomes de domínio em português (`voto`, `dispositivoId`, `casaId`, `saldo`, `placar`), seguindo o `desafio-fit`.
- Versões copiadas do `desafio-fit` para manter um só padrão entre os dois projetos.

---

### Task 1: Scaffold do app Next em `api/` e a lista fechada de casas

**Files:**
- Create: `api/package.json`, `api/tsconfig.json`, `api/next.config.ts`, `api/vitest.config.ts`, `api/.gitignore`, `api/.env.example`
- Create: `api/lib/casas.ts`
- Test: `api/tests/casas.test.ts`

**Interfaces:**
- Consumes: nada.
- Produces: `CASAS_IDS: readonly string[]` e `type CasaId` em `@/lib/casas`, usados na validação (Task 4).

**Smoke Gate:** N/A — no UI surface.

- [ ] **Step 1: Criar o esqueleto do projeto**

```bash
cd api
```

`api/package.json`:

```json
{
  "name": "rei-leao-votos",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "test": "vitest run",
    "db:generate": "drizzle-kit generate",
    "db:migrate": "drizzle-kit migrate"
  },
  "dependencies": {
    "@neondatabase/serverless": "^1.1.0",
    "drizzle-orm": "^0.45.2",
    "next": "16.3.1",
    "pg": "^8.23.0",
    "react": "19.2.8",
    "react-dom": "19.2.8",
    "zod": "^4.4.3"
  },
  "devDependencies": {
    "@electric-sql/pglite": "^0.5.5",
    "@types/node": "^20",
    "@types/pg": "^8.23.1",
    "@types/react": "^19",
    "dotenv": "^17.4.2",
    "drizzle-kit": "^0.31.10",
    "typescript": "^5",
    "vitest": "^4.1.10"
  },
  "packageManager": "pnpm@10.33.0"
}
```

`api/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": false,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": { "@/*": ["./*"] }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

`api/next.config.ts`:

```ts
import type { NextConfig } from 'next'

const config: NextConfig = {}

export default config
```

`api/vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config'
import path from 'node:path'

export default defineConfig({
  test: { environment: 'node', include: ['tests/**/*.test.ts'] },
  resolve: { alias: { '@': path.resolve(__dirname, '.') } },
})
```

`api/.gitignore`:

```
node_modules
.next
.env
.env.local
*.tsbuildinfo
next-env.d.ts
```

`api/.env.example`:

```
# Postgres. Em dev: qualquer Postgres local. Em produção: injetado pela Vercel
# ao provisionar o Postgres na aba Storage.
DATABASE_URL=postgres://postgres@127.0.0.1:5432/rei_leao_votos

# Em produção, na Vercel, defina explicitamente DB_DRIVER=neon. O chute por
# domínio cai em node-postgres quando o host não é neon.tech e degrada em
# silêncio dentro de uma function serverless.
# DB_DRIVER=neon
```

- [ ] **Step 2: Instalar**

Run: `cd api && pnpm install`
Expected: instala sem erro.

- [ ] **Step 3: Escrever o teste que falha**

`api/tests/casas.test.ts`:

```ts
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, it, expect } from 'vitest'
import { CASAS_IDS } from '@/lib/casas'

describe('lista fechada de casas', () => {
  // A API valida contra CASAS_IDS e o HTML é a fonte da verdade das casas.
  // Sem este teste, uma casa nova no index.html vira 400 silencioso na API.
  it('bate exatamente com os ids do index.html', () => {
    const html = readFileSync(resolve(__dirname, '../../index.html'), 'utf8')
    const noHtml = [...html.matchAll(/\{id:"([^"]+)"/g)].map(m => m[1])

    expect(noHtml).toHaveLength(23)
    expect([...CASAS_IDS].sort()).toEqual([...noHtml].sort())
  })
})
```

- [ ] **Step 4: Rodar e ver falhar**

Run: `cd api && pnpm test`
Expected: FAIL — não resolve `@/lib/casas`.

- [ ] **Step 5: Criar a lista**

`api/lib/casas.ts`:

```ts
/**
 * Os ids das casas vivem no array `casas` do index.html — o HTML é a fonte da
 * verdade. Esta lista existe só para a API recusar casa desconhecida, e
 * tests/casas.test.ts falha se as duas divergirem.
 */
export const CASAS_IDS = [
  'st2', 'st3', 'ln1', 'ln2', 'cap1', 'sso', 'nl1', 'nl2', 'sjdr1', 'sjdr2',
  'rm', 'st4', 'cipo1', 'cipo2', 'cipo3', 'vertente', 'igarape', 'felix',
  'cipoc', 'itag', 'cillis', 'renascer', 'jab',
] as const

export type CasaId = (typeof CASAS_IDS)[number]
```

- [ ] **Step 6: Rodar e ver passar**

Run: `cd api && pnpm test`
Expected: PASS — 1 teste.

- [ ] **Step 7: Commit**

```bash
git add api/
git commit -m "feat(api): scaffold do app Next e lista fechada das 23 casas"
```

---

### Task 2: Tabela `voto` — schema, conexão e migration

**Files:**
- Create: `api/lib/db/schema.ts`, `api/lib/db/index.ts`, `api/drizzle.config.ts`
- Create: `api/tests/helpers/db-teste.ts`
- Test: `api/tests/schema.test.ts`
- Generated: `api/drizzle/0000_*.sql` + `api/drizzle/meta/`

**Interfaces:**
- Consumes: nada.
- Produces: `voto` (tabela Drizzle) em `@/lib/db/schema`; `db` e `type Db` em `@/lib/db`; `criarDbDeTeste(): Promise<{ db: Db; encerrar: () => Promise<void> }>` em `tests/helpers/db-teste`.

**Smoke Gate:** N/A — no UI surface.

- [ ] **Step 1: Escrever o teste que falha**

`api/tests/schema.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { eq } from 'drizzle-orm'
import { criarDbDeTeste } from './helpers/db-teste'
import { voto } from '@/lib/db/schema'

const DISPOSITIVO = '11111111-1111-4111-8111-111111111111'

describe('tabela voto', () => {
  it('grava um voto e devolve os campos com default', async () => {
    const { db, encerrar } = await criarDbDeTeste()

    const [linha] = await db.insert(voto)
      .values({ dispositivoId: DISPOSITIVO, casaId: 'st2', valor: 1 }).returning()

    expect(linha.valor).toBe(1)
    expect(linha.casaId).toBe('st2')
    expect(linha.criadoEm).toBeInstanceOf(Date)

    await encerrar()
  })

  it('recusa dois votos do mesmo dispositivo na mesma casa', async () => {
    const { db, encerrar } = await criarDbDeTeste()
    await db.insert(voto).values({ dispositivoId: DISPOSITIVO, casaId: 'st2', valor: 1 })

    await expect(
      db.insert(voto).values({ dispositivoId: DISPOSITIVO, casaId: 'st2', valor: -1 }),
    ).rejects.toThrow()

    await encerrar()
  })

  it('recusa valor fora de {1, -1} — neutro é ausência de linha, não zero', async () => {
    const { db, encerrar } = await criarDbDeTeste()

    await expect(
      db.insert(voto).values({ dispositivoId: DISPOSITIVO, casaId: 'st2', valor: 0 }),
    ).rejects.toThrow()

    await encerrar()
  })

  it('aceita o mesmo dispositivo em casas diferentes', async () => {
    const { db, encerrar } = await criarDbDeTeste()
    await db.insert(voto).values([
      { dispositivoId: DISPOSITIVO, casaId: 'st2', valor: 1 },
      { dispositivoId: DISPOSITIVO, casaId: 'cipo1', valor: -1 },
    ])

    const linhas = await db.select().from(voto).where(eq(voto.dispositivoId, DISPOSITIVO))
    expect(linhas).toHaveLength(2)

    await encerrar()
  })
})
```

`api/tests/helpers/db-teste.ts`:

```ts
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
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd api && pnpm test tests/schema.test.ts`
Expected: FAIL — não resolve `@/lib/db/schema`.

- [ ] **Step 3: Escrever o schema**

`api/lib/db/schema.ts`:

```ts
import { pgTable, uuid, text, smallint, timestamp, unique, check } from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'

/**
 * Um voto por dispositivo por casa. Neutro não é uma linha com valor 0 — é a
 * ausência da linha, o que mantém sum(valor) como a definição literal do saldo.
 * As casas não estão no banco: casa_id é a string do array do index.html,
 * validada contra lib/casas.ts na borda.
 */
export const voto = pgTable('voto', {
  id: uuid('id').primaryKey().defaultRandom(),
  dispositivoId: uuid('dispositivo_id').notNull(),
  casaId: text('casa_id').notNull(),
  valor: smallint('valor').notNull(),
  criadoEm: timestamp('criado_em', { withTimezone: true }).notNull().defaultNow(),
  atualizadoEm: timestamp('atualizado_em', { withTimezone: true }).notNull().defaultNow(),
}, t => [
  unique('voto_dispositivo_casa').on(t.dispositivoId, t.casaId),
  check('voto_valor', sql`${t.valor} in (1, -1)`),
])
```

`api/lib/db/index.ts` (mesmo padrão do `desafio-fit`: driver por URL e conexão preguiçosa):

```ts
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
```

`api/drizzle.config.ts`:

```ts
import type { Config } from 'drizzle-kit'

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
```

- [ ] **Step 4: Gerar a migration**

Run: `cd api && DATABASE_URL=postgres://localhost/naousado pnpm db:generate`
Expected: cria `drizzle/0000_*.sql` com `CREATE TABLE "voto"`, o unique e o check. `db:generate` lê só o schema — a URL não precisa apontar para um banco que existe.

Confira o SQL gerado antes de seguir: ele precisa ter `CONSTRAINT "voto_valor" CHECK` e `CONSTRAINT "voto_dispositivo_casa" UNIQUE`.

- [ ] **Step 5: Rodar e ver passar**

Run: `cd api && pnpm test tests/schema.test.ts`
Expected: PASS — 4 testes.

- [ ] **Step 6: Commit**

```bash
git add api/
git commit -m "feat(api): tabela voto com unique por dispositivo e check de valor"
```

---

### Task 3: Queries do placar

**Files:**
- Create: `api/lib/db/queries.ts`
- Test: `api/tests/queries.test.ts`

**Interfaces:**
- Consumes: `voto` de `@/lib/db/schema`, `type Db` de `@/lib/db`, `criarDbDeTeste` do helper.
- Produces, em `@/lib/db/queries`:
  - `type Placar = { sim: number; nao: number; saldo: number; meu: number }`
  - `listarPlacar(db: Db, dispositivoId?: string): Promise<Record<string, Placar>>`
  - `placarDaCasa(db: Db, casaId: string, dispositivoId?: string): Promise<Placar>`
  - `registrarVoto(db: Db, p: { dispositivoId: string; casaId: string; valor: 1 | 0 | -1 }): Promise<Placar>`

**Smoke Gate:** N/A — no UI surface.

- [ ] **Step 1: Escrever o teste que falha**

`api/tests/queries.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { criarDbDeTeste } from './helpers/db-teste'
import { listarPlacar, placarDaCasa, registrarVoto } from '@/lib/db/queries'
import { voto } from '@/lib/db/schema'

const A = '11111111-1111-4111-8111-111111111111'
const B = '22222222-2222-4222-8222-222222222222'

describe('placar', () => {
  it('um Sim vale +1', async () => {
    const { db, encerrar } = await criarDbDeTeste()

    const p = await registrarVoto(db, { dispositivoId: A, casaId: 'st2', valor: 1 })

    expect(p).toEqual({ sim: 1, nao: 0, saldo: 1, meu: 1 })
    await encerrar()
  })

  it('trocar Sim por Não move a casa dois pontos', async () => {
    const { db, encerrar } = await criarDbDeTeste()
    await registrarVoto(db, { dispositivoId: A, casaId: 'st2', valor: 1 })

    const p = await registrarVoto(db, { dispositivoId: A, casaId: 'st2', valor: -1 })

    expect(p).toEqual({ sim: 0, nao: 1, saldo: -1, meu: -1 })
    await encerrar()
  })

  it('votar zero apaga a linha e zera o saldo', async () => {
    const { db, encerrar } = await criarDbDeTeste()
    await registrarVoto(db, { dispositivoId: A, casaId: 'st2', valor: 1 })

    const p = await registrarVoto(db, { dispositivoId: A, casaId: 'st2', valor: 0 })

    expect(p).toEqual({ sim: 0, nao: 0, saldo: 0, meu: 0 })
    expect(await db.select().from(voto)).toHaveLength(0)
    await encerrar()
  })

  it('desvotar de um dispositivo não mexe no voto do outro', async () => {
    const { db, encerrar } = await criarDbDeTeste()
    await registrarVoto(db, { dispositivoId: A, casaId: 'st2', valor: 1 })
    await registrarVoto(db, { dispositivoId: B, casaId: 'st2', valor: 1 })

    const p = await registrarVoto(db, { dispositivoId: A, casaId: 'st2', valor: 0 })

    expect(p).toEqual({ sim: 1, nao: 0, saldo: 1, meu: 0 })
    await encerrar()
  })

  it('soma dispositivos diferentes e devolve o voto de quem perguntou', async () => {
    const { db, encerrar } = await criarDbDeTeste()
    await registrarVoto(db, { dispositivoId: A, casaId: 'st2', valor: 1 })
    await registrarVoto(db, { dispositivoId: B, casaId: 'st2', valor: -1 })

    expect(await placarDaCasa(db, 'st2', A)).toEqual({ sim: 1, nao: 1, saldo: 0, meu: 1 })
    expect(await placarDaCasa(db, 'st2', B)).toEqual({ sim: 1, nao: 1, saldo: 0, meu: -1 })
    await encerrar()
  })

  it('listarPlacar traz só as casas votadas, com o meu voto em cada', async () => {
    const { db, encerrar } = await criarDbDeTeste()
    await registrarVoto(db, { dispositivoId: A, casaId: 'st2', valor: 1 })
    await registrarVoto(db, { dispositivoId: B, casaId: 'st2', valor: 1 })
    await registrarVoto(db, { dispositivoId: B, casaId: 'cipo1', valor: -1 })

    const placar = await listarPlacar(db, A)

    expect(Object.keys(placar).sort()).toEqual(['cipo1', 'st2'])
    expect(placar.st2).toEqual({ sim: 2, nao: 0, saldo: 2, meu: 1 })
    expect(placar.cipo1).toEqual({ sim: 0, nao: 1, saldo: -1, meu: 0 })
    await encerrar()
  })

  it('sem dispositivo, meu é sempre 0', async () => {
    const { db, encerrar } = await criarDbDeTeste()
    await registrarVoto(db, { dispositivoId: A, casaId: 'st2', valor: 1 })

    const placar = await listarPlacar(db)

    expect(placar.st2).toEqual({ sim: 1, nao: 0, saldo: 1, meu: 0 })
    await encerrar()
  })

  it('casa sem voto nenhum não aparece no placar', async () => {
    const { db, encerrar } = await criarDbDeTeste()

    expect(await listarPlacar(db, A)).toEqual({})
    expect(await placarDaCasa(db, 'st2', A)).toEqual({ sim: 0, nao: 0, saldo: 0, meu: 0 })
    await encerrar()
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd api && pnpm test tests/queries.test.ts`
Expected: FAIL — não resolve `@/lib/db/queries`.

- [ ] **Step 3: Escrever as queries**

`api/lib/db/queries.ts`:

```ts
import { and, eq, sql } from 'drizzle-orm'
import { voto } from './schema'
import type { Db } from './index'

export type Placar = { sim: number; nao: number; saldo: number; meu: number }

const VAZIO: Placar = { sim: 0, nao: 0, saldo: 0, meu: 0 }

// count() e sum() voltam como string no driver do Postgres; mapWith(Number)
// evita "1" + 1 = "11" do lado de fora.
const agregados = {
  casaId: voto.casaId,
  sim: sql<number>`count(*) filter (where ${voto.valor} = 1)`.mapWith(Number),
  nao: sql<number>`count(*) filter (where ${voto.valor} = -1)`.mapWith(Number),
  saldo: sql<number>`coalesce(sum(${voto.valor}), 0)`.mapWith(Number),
}

/** Placar de todas as casas com pelo menos um voto. Duas queries, nunca 23. */
export async function listarPlacar(
  db: Db,
  dispositivoId?: string,
): Promise<Record<string, Placar>> {
  const linhas = await db.select(agregados).from(voto).groupBy(voto.casaId)

  const meus = dispositivoId
    ? await db.select({ casaId: voto.casaId, valor: voto.valor })
        .from(voto).where(eq(voto.dispositivoId, dispositivoId))
    : []
  const meuPorCasa = new Map(meus.map(m => [m.casaId, m.valor]))

  const placar: Record<string, Placar> = {}
  for (const l of linhas) {
    placar[l.casaId] = { sim: l.sim, nao: l.nao, saldo: l.saldo, meu: meuPorCasa.get(l.casaId) ?? 0 }
  }
  return placar
}

export async function placarDaCasa(
  db: Db,
  casaId: string,
  dispositivoId?: string,
): Promise<Placar> {
  const [linha] = await db.select(agregados).from(voto)
    .where(eq(voto.casaId, casaId)).groupBy(voto.casaId)
  if (!linha) return { ...VAZIO }

  const meu = dispositivoId
    ? (await db.select({ valor: voto.valor }).from(voto)
        .where(and(eq(voto.casaId, casaId), eq(voto.dispositivoId, dispositivoId))))[0]?.valor ?? 0
    : 0

  return { sim: linha.sim, nao: linha.nao, saldo: linha.saldo, meu }
}

/**
 * valor 1 ou -1 grava (upsert); valor 0 apaga. Devolve o placar da casa já
 * atualizado — o cliente reconcilia com isso em vez de recontar sozinho.
 */
export async function registrarVoto(
  db: Db,
  p: { dispositivoId: string; casaId: string; valor: 1 | 0 | -1 },
): Promise<Placar> {
  if (p.valor === 0) {
    await db.delete(voto)
      .where(and(eq(voto.dispositivoId, p.dispositivoId), eq(voto.casaId, p.casaId)))
  } else {
    await db.insert(voto)
      .values({ dispositivoId: p.dispositivoId, casaId: p.casaId, valor: p.valor })
      .onConflictDoUpdate({
        target: [voto.dispositivoId, voto.casaId],
        set: { valor: p.valor, atualizadoEm: sql`now()` },
      })
  }
  return placarDaCasa(db, p.casaId, p.dispositivoId)
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `cd api && pnpm test`
Expected: PASS — todos os testes das Tasks 1–3.

- [ ] **Step 5: Commit**

```bash
git add api/
git commit -m "feat(api): queries de placar — agregação, upsert e desvoto"
```

---

### Task 4: Validação de entrada e CORS

**Files:**
- Create: `api/lib/validacao.ts`, `api/lib/cors.ts`
- Test: `api/tests/validacao.test.ts`, `api/tests/cors.test.ts`

**Interfaces:**
- Consumes: `CASAS_IDS` de `@/lib/casas`.
- Produces:
  - `@/lib/validacao`: `postSchema` (Zod) e `ehUuid(v: string): boolean`
  - `@/lib/cors`: `origemPermitida(origem: string | null, producao: boolean): string | null` e `cabecalhosCors(origem: string | null, producao?: boolean): Record<string, string>`

**Smoke Gate:** N/A — no UI surface.

- [ ] **Step 1: Escrever os testes que falham**

`api/tests/validacao.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { postSchema, ehUuid } from '@/lib/validacao'

const A = '11111111-1111-4111-8111-111111111111'

describe('validação do POST', () => {
  it('aceita sim, não e neutro numa casa conhecida', () => {
    for (const valor of [1, 0, -1]) {
      expect(postSchema.safeParse({ dispositivo: A, casa: 'st2', valor }).success).toBe(true)
    }
  })

  it('recusa casa fora da lista fechada', () => {
    expect(postSchema.safeParse({ dispositivo: A, casa: 'casa-inventada', valor: 1 }).success).toBe(false)
  })

  it('recusa valor fora de {1, 0, -1}', () => {
    expect(postSchema.safeParse({ dispositivo: A, casa: 'st2', valor: 2 }).success).toBe(false)
    expect(postSchema.safeParse({ dispositivo: A, casa: 'st2', valor: '1' }).success).toBe(false)
  })

  it('recusa dispositivo que não é uuid', () => {
    expect(postSchema.safeParse({ dispositivo: 'eu-mesmo', casa: 'st2', valor: 1 }).success).toBe(false)
  })

  it('ehUuid separa uuid de lixo', () => {
    expect(ehUuid(A)).toBe(true)
    expect(ehUuid('eu-mesmo')).toBe(false)
  })
})
```

`api/tests/cors.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { origemPermitida, cabecalhosCors } from '@/lib/cors'

const PAGES = 'https://nicolasib.github.io'

describe('CORS', () => {
  it('libera o GitHub Pages em produção', () => {
    expect(origemPermitida(PAGES, true)).toBe(PAGES)
  })

  it('não libera origem estranha, nem em dev', () => {
    expect(origemPermitida('https://evil.example', true)).toBeNull()
    expect(origemPermitida('https://evil.example', false)).toBeNull()
  })

  it('libera localhost só fora de produção', () => {
    expect(origemPermitida('http://localhost:8080', false)).toBe('http://localhost:8080')
    expect(origemPermitida('http://localhost:8080', true)).toBeNull()
  })

  it('sem Origin não devolve cabeçalho nenhum', () => {
    expect(cabecalhosCors(null, true)).toEqual({})
  })

  it('monta os cabeçalhos com Vary: Origin', () => {
    const h = cabecalhosCors(PAGES, true)
    expect(h['Access-Control-Allow-Origin']).toBe(PAGES)
    expect(h['Access-Control-Allow-Methods']).toContain('POST')
    expect(h['Vary']).toBe('Origin')
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd api && pnpm test tests/validacao.test.ts tests/cors.test.ts`
Expected: FAIL — não resolve `@/lib/validacao` nem `@/lib/cors`.

- [ ] **Step 3: Escrever validação e CORS**

`api/lib/validacao.ts`:

```ts
import { z } from 'zod'
import { CASAS_IDS } from './casas'

// Zod 4: os formatos de string são funções de topo (z.uuid()), não métodos.
export const postSchema = z.object({
  dispositivo: z.uuid(),
  casa: z.enum(CASAS_IDS),
  valor: z.union([z.literal(1), z.literal(0), z.literal(-1)]),
})

export type PostVoto = z.infer<typeof postSchema>

export const ehUuid = (v: string): boolean => z.uuid().safeParse(v).success
```

`api/lib/cors.ts`:

```ts
const PAGES = 'https://nicolasib.github.io'
const LOCAL = /^http:\/\/localhost(:\d+)?$/

/**
 * A página mora no GitHub Pages e a API na Vercel: sem CORS o browser recusa
 * toda chamada. localhost entra fora de produção porque é assim que o dev e o
 * smoke gate alcançam a API local.
 */
export function origemPermitida(origem: string | null, producao: boolean): string | null {
  if (!origem) return null
  if (origem === PAGES) return origem
  if (!producao && LOCAL.test(origem)) return origem
  return null
}

export function cabecalhosCors(
  origem: string | null,
  producao: boolean = process.env.NODE_ENV === 'production',
): Record<string, string> {
  const ok = origemPermitida(origem, producao)
  if (!ok) return {}
  return {
    'Access-Control-Allow-Origin': ok,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  }
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `cd api && pnpm test`
Expected: PASS — tudo verde.

- [ ] **Step 5: Commit**

```bash
git add api/
git commit -m "feat(api): validação Zod da entrada e cabeçalhos de CORS"
```

---

### Task 5: Route Handler `/api/votos`

**Files:**
- Create: `api/app/api/votos/route.ts`
- Test: `api/tests/rota.test.ts`

**Interfaces:**
- Consumes: `db` de `@/lib/db`; `listarPlacar`, `registrarVoto` de `@/lib/db/queries`; `postSchema`, `ehUuid` de `@/lib/validacao`; `cabecalhosCors` de `@/lib/cors`.
- Produces: `GET`, `POST`, `OPTIONS` exportados de `@/app/api/votos/route`.
  - `GET /api/votos?dispositivo=<uuid>` → `200 { casas: Record<string, Placar> }`
  - `POST /api/votos` body `{ dispositivo, casa, valor }` → `200 { casa: string } & Placar`
  - Erros → `400 { erro: string }`

**Smoke Gate:** N/A — no UI surface.

- [ ] **Step 1: Escrever o teste que falha**

`api/tests/rota.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { criarDbDeTeste } from './helpers/db-teste'

// O handler importa `db` do módulo; o teste precisa que esse `db` seja o PGlite
// desta execução. O Proxy delega a cada chamada, então trocar `estado.db` no
// beforeEach basta — e não depende de getter sobreviver ao namespace do mock.
const estado = vi.hoisted(() => ({ db: null as any }))
vi.mock('@/lib/db', () => ({
  db: new Proxy({}, {
    get(_alvo, prop) {
      const valor = Reflect.get(estado.db, prop, estado.db)
      return typeof valor === 'function' ? valor.bind(estado.db) : valor
    },
  }),
}))

const { GET, POST, OPTIONS } = await import('@/app/api/votos/route')

const PAGES = 'https://nicolasib.github.io'
const A = '11111111-1111-4111-8111-111111111111'
let encerrar: () => Promise<void>

beforeEach(async () => {
  const t = await criarDbDeTeste()
  estado.db = t.db
  encerrar = t.encerrar
})
afterEach(async () => { await encerrar() })

const get = (qs = '', origem: string | null = PAGES) =>
  GET(new Request(`http://localhost/api/votos${qs}`, {
    headers: origem ? { origin: origem } : {},
  }))

const post = (body: unknown, origem: string | null = PAGES) =>
  POST(new Request('http://localhost/api/votos', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(origem ? { origin: origem } : {}) },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  }))

describe('GET /api/votos', () => {
  it('devolve objeto vazio quando ninguém votou', async () => {
    const r = await get(`?dispositivo=${A}`)
    expect(r.status).toBe(200)
    expect(await r.json()).toEqual({ casas: {} })
  })

  it('não deixa o placar ser cacheado', async () => {
    const r = await get(`?dispositivo=${A}`)
    expect(r.headers.get('Cache-Control')).toBe('no-store')
  })

  it('devolve o placar com o meu voto depois de um POST', async () => {
    await post({ dispositivo: A, casa: 'st2', valor: 1 })
    const r = await get(`?dispositivo=${A}`)
    expect((await r.json()).casas.st2).toEqual({ sim: 1, nao: 0, saldo: 1, meu: 1 })
  })

  it('sem dispositivo devolve as contagens sem o meu voto', async () => {
    await post({ dispositivo: A, casa: 'st2', valor: 1 })
    const r = await get()
    expect((await r.json()).casas.st2).toEqual({ sim: 1, nao: 0, saldo: 1, meu: 0 })
  })

  it('recusa dispositivo que não é uuid', async () => {
    const r = await get('?dispositivo=eu-mesmo')
    expect(r.status).toBe(400)
    expect(await r.json()).toHaveProperty('erro')
  })

  it('libera a origem do Pages e ignora origem estranha', async () => {
    expect((await get('', PAGES)).headers.get('Access-Control-Allow-Origin')).toBe(PAGES)
    expect((await get('', 'https://evil.example')).headers.get('Access-Control-Allow-Origin')).toBeNull()
  })
})

describe('POST /api/votos', () => {
  it('grava o voto e devolve o placar novo da casa', async () => {
    const r = await post({ dispositivo: A, casa: 'st2', valor: 1 })
    expect(r.status).toBe(200)
    expect(await r.json()).toEqual({ casa: 'st2', sim: 1, nao: 0, saldo: 1, meu: 1 })
  })

  it('é idempotente: repetir o mesmo voto não duplica', async () => {
    await post({ dispositivo: A, casa: 'st2', valor: 1 })
    const r = await post({ dispositivo: A, casa: 'st2', valor: 1 })
    expect(await r.json()).toEqual({ casa: 'st2', sim: 1, nao: 0, saldo: 1, meu: 1 })
  })

  it('valor 0 desfaz o voto', async () => {
    await post({ dispositivo: A, casa: 'st2', valor: 1 })
    const r = await post({ dispositivo: A, casa: 'st2', valor: 0 })
    expect(await r.json()).toEqual({ casa: 'st2', sim: 0, nao: 0, saldo: 0, meu: 0 })
  })

  it('recusa casa fora da lista fechada', async () => {
    const r = await post({ dispositivo: A, casa: 'casa-inventada', valor: 1 })
    expect(r.status).toBe(400)
  })

  it('recusa valor fora de {1, 0, -1}', async () => {
    expect((await post({ dispositivo: A, casa: 'st2', valor: 7 })).status).toBe(400)
  })

  it('recusa body que não é JSON', async () => {
    expect((await post('nada disso')).status).toBe(400)
  })
})

describe('OPTIONS /api/votos', () => {
  it('responde o preflight do Pages', async () => {
    const r = await OPTIONS(new Request('http://localhost/api/votos', {
      method: 'OPTIONS', headers: { origin: PAGES },
    }))
    expect(r.status).toBe(204)
    expect(r.headers.get('Access-Control-Allow-Origin')).toBe(PAGES)
    expect(r.headers.get('Access-Control-Allow-Methods')).toContain('POST')
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd api && pnpm test tests/rota.test.ts`
Expected: FAIL — não resolve `@/app/api/votos/route`.

- [ ] **Step 3: Escrever o handler**

`api/app/api/votos/route.ts`:

```ts
import { db } from '@/lib/db'
import { listarPlacar, registrarVoto } from '@/lib/db/queries'
import { postSchema, ehUuid } from '@/lib/validacao'
import { cabecalhosCors } from '@/lib/cors'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const erro = (msg: string, cors: Record<string, string>, status = 400) =>
  Response.json({ erro: msg }, { status, headers: cors })

export async function OPTIONS(req: Request) {
  return new Response(null, { status: 204, headers: cabecalhosCors(req.headers.get('origin')) })
}

export async function GET(req: Request) {
  const cors = cabecalhosCors(req.headers.get('origin'))
  const dispositivo = new URL(req.url).searchParams.get('dispositivo')

  if (dispositivo !== null && !ehUuid(dispositivo)) {
    return erro('dispositivo precisa ser um uuid', cors)
  }

  const casas = await listarPlacar(db, dispositivo ?? undefined)
  // no-store: o placar muda a cada voto e a página busca de novo ao voltar ao foco.
  return Response.json({ casas }, { headers: { ...cors, 'Cache-Control': 'no-store' } })
}

export async function POST(req: Request) {
  const cors = cabecalhosCors(req.headers.get('origin'))

  let bruto: unknown
  try {
    bruto = await req.json()
  } catch {
    return erro('corpo precisa ser JSON', cors)
  }

  const parsed = postSchema.safeParse(bruto)
  if (!parsed.success) return erro('dispositivo, casa ou valor inválido', cors)

  const { dispositivo, casa, valor } = parsed.data
  const placar = await registrarVoto(db, { dispositivoId: dispositivo, casaId: casa, valor })

  return Response.json({ casa, ...placar }, { headers: { ...cors, 'Cache-Control': 'no-store' } })
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `cd api && pnpm test`
Expected: PASS — todos os testes das Tasks 1–5.

- [ ] **Step 5: Verificar que o build passa**

Run: `cd api && pnpm exec tsc --noEmit && pnpm build`
Expected: sem erro de tipo e build concluído. O build não conecta no banco — a conexão é preguiçosa de propósito.

- [ ] **Step 6: Commit**

```bash
git add api/
git commit -m "feat(api): endpoint /api/votos com GET, POST e preflight"
```

---

### Task 6: Botões de voto no card

**Files:**
- Modify: `index.html` — bloco `<style>` (antes de `/* ---------- cards ---------- */`), estado `S` (`index.html:724`), `card()` (`index.html:745`), delegação de clique em `#grid` (`index.html:957`), fim do script (antes do `render();` final)
- Create: `smoke/PROJECT.md` (se ainda não existir no repo)

**Interfaces:**
- Consumes: `GET/POST /api/votos` da Task 5.
- Produces, no escopo do script do `index.html`: `S.votos`, `S.dispositivo`, `placar(id)`, `blocoVoto(c)`, `pintarVoto(id)`, `votar(casaId, clicado)`, `carregarVotos()`.

**Nota sobre TDD:** o `index.html` não tem runner de teste — é um arquivo sem build, servido como está. O teste desta task é o smoke gate, que roda o app de verdade. Não invente um harness de teste para o HTML.

**Smoke Gate:**
- `CLICKABLE` clicar **Sim** num card com placar `0`: o saldo do card passa a `+1`, o botão fica `aria-pressed="true"` e a contagem passa a `1 sim · 0 não`.
- `CLICKABLE` clicar **Sim** de novo no mesmo card: o saldo volta a `0`, `aria-pressed="false"` e a contagem volta a `ninguém votou ainda`.
- `CLICKABLE` clicar **Não** num card que estava em Sim: o saldo vai de `+1` para `−1` (a diferença de dois pontos), `Sim` fica `aria-pressed="false"` e `Não` fica `aria-pressed="true"`.
- `CLICKABLE` recarregar a página depois de votar: o voto continua marcado (veio do servidor, não do DOM).
- Com a API derrubada: os botões aparecem `disabled`, a linha diz `votos indisponíveis`, e o preço por pessoa e os filtros continuam funcionando.
- **Os grupos de região nascem colapsados** (`S.fechados` começa cheio): o roteiro precisa clicar no cabeçalho do grupo antes de tentar votar num card.

- [ ] **Step 1: Subir o ambiente local**

```bash
# 1. Postgres local para a API
docker run -d --name rl-pg -e POSTGRES_PASSWORD=postgres -p 55433:5432 postgres:16

# 2. Migrar
cd api
echo 'DATABASE_URL=postgres://postgres:postgres@127.0.0.1:55433/postgres' > .env.local
pnpm db:migrate

# 3. API em :3000
pnpm dev

# 4. Página estática em :8080, da raiz do repo, noutro terminal
cd .. && python3 -m http.server 8080
```

No browser, em `http://localhost:8080`, antes de testar:
`localStorage.setItem('rl_api', 'http://localhost:3000')` e recarregue.

- [ ] **Step 2: Adicionar o CSS**

Inserir no bloco `<style>`, imediatamente antes do comentário `/* ---------- cards ---------- */`:

```css
/* ---------- votos ---------- */
.voto{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin:14px 0 0;padding:12px 0 0;border-top:1px solid var(--line)}
.voto-b{display:inline-flex;align-items:center;gap:5px;background:none;border:1px solid var(--line-2);border-radius:var(--r);
  font-family:inherit;font-size:14px;line-height:20px;color:var(--ink-65);padding:5px 12px;cursor:pointer}
.voto-b:hover:not(:disabled){background:var(--hover)}
.voto-b[aria-pressed="true"].voto-sim{background:var(--green-bg);color:var(--green-tx);border-color:transparent;font-weight:500}
.voto-b[aria-pressed="true"].voto-nao{background:var(--red-bg);color:var(--red-tx);border-color:transparent;font-weight:500}
.voto-b:disabled{opacity:.45;cursor:default}
.voto-saldo{margin-left:auto;font-size:16px;font-weight:600;color:var(--ink-40);font-variant-numeric:tabular-nums}
.voto-saldo.pos{color:var(--green-tx)}
.voto-saldo.neg{color:var(--red-tx)}
.voto-cont{flex:0 0 100%;font-size:12px;color:var(--ink-50)}
.voto-erro{flex:0 0 100%;font-size:12px;color:var(--red-tx)}
```

- [ ] **Step 3: Adicionar estado e cliente da API**

Em `index.html:724`, acrescentar `votos` ao estado:

```js
let S = {...DEFAULTS, sort:"pp", f:{pool:false,bbq:false,rated:false,fit:false}, fechados:new Set(Object.values(GRUPOS)), votos:null};
```

Logo depois da linha `const brl = n => ...` (`index.html:725`), inserir:

```js
/* ---------- votos ---------- */
// A página é estática no GitHub Pages; o placar vem da API na Vercel.
// rl_api existe para o dev local e o smoke gate apontarem pro next dev.
const API = localStorage.getItem("rl_api") || "https://rei-leao-votos.vercel.app";

// Identidade anônima por dispositivo. Cookie não serve: viria do domínio da
// Vercel, seria cookie de terceiro e o Safari bloqueia por padrão.
function dispositivoId(){
  let v = localStorage.getItem("rl_dispositivo");
  if(!v){ v = crypto.randomUUID(); localStorage.setItem("rl_dispositivo", v); }
  return v;
}

const VAZIO = {sim:0, nao:0, saldo:0, meu:0};
// S.votos === null significa "não temos placar" (carregando ou API fora).
const placar = id => (S.votos && S.votos[id]) || VAZIO;

// Recalcula o placar local a partir do voto anterior desta pessoa, para a UI
// otimista não precisar esperar a rede.
function aplicarVoto(p, meu){
  const sim = p.sim - (p.meu === 1 ? 1 : 0) + (meu === 1 ? 1 : 0);
  const nao = p.nao - (p.meu === -1 ? 1 : 0) + (meu === -1 ? 1 : 0);
  return {sim, nao, saldo: sim - nao, meu};
}

function blocoVoto(c){
  if(!S.votos) return `<div class="voto" data-voto-casa="${c.id}">
    <button class="voto-b voto-sim" disabled>Sim</button>
    <button class="voto-b voto-nao" disabled>Não</button>
    <span class="voto-cont">votos indisponíveis</span>
  </div>`;
  const p = placar(c.id);
  const cls = p.saldo > 0 ? "pos" : p.saldo < 0 ? "neg" : "";
  const total = p.sim + p.nao;
  return `<div class="voto" data-voto-casa="${c.id}">
    <button class="voto-b voto-sim" data-voto="1" data-casa="${c.id}" aria-pressed="${p.meu===1}">Sim</button>
    <button class="voto-b voto-nao" data-voto="-1" data-casa="${c.id}" aria-pressed="${p.meu===-1}">Não</button>
    <span class="voto-saldo ${cls}">${p.saldo > 0 ? "+" : ""}${p.saldo}</span>
    <span class="voto-cont">${total ? `${p.sim} sim · ${p.nao} não` : "ninguém votou ainda"}</span>
  </div>`;
}

// Repinta só este bloco: re-renderizar a grade inteira no clique tiraria o card
// de baixo do dedo de quem votou.
function pintarVoto(id, erro){
  const el = document.querySelector(`[data-voto-casa="${id}"]`);
  if(!el) return;
  el.outerHTML = blocoVoto(casas.find(c => c.id === id));
  if(erro){
    const novo = document.querySelector(`[data-voto-casa="${id}"]`);
    if(novo) novo.insertAdjacentHTML("beforeend", `<span class="voto-erro">não deu pra salvar — tente de novo</span>`);
  }
}

async function votar(casaId, clicado){
  if(!S.votos) return;
  const antes = {...placar(casaId)};
  // Clicar no voto que já está marcado volta pro neutro.
  const meu = antes.meu === clicado ? 0 : clicado;

  S.votos[casaId] = aplicarVoto(antes, meu);
  pintarVoto(casaId);

  try{
    const r = await fetch(API + "/api/votos", {
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body: JSON.stringify({dispositivo: dispositivoId(), casa: casaId, valor: meu})
    });
    if(!r.ok) throw new Error(r.status);
    const d = await r.json();
    S.votos[casaId] = {sim:d.sim, nao:d.nao, saldo:d.saldo, meu:d.meu};
    pintarVoto(casaId);
  }catch(e){
    S.votos[casaId] = antes;
    pintarVoto(casaId, true);
  }
}

let ultimoFetch = 0;
async function carregarVotos(){
  const agora = Date.now();
  if(agora - ultimoFetch < 5000) return;   // o foco dispara fácil; um a cada 5s basta
  ultimoFetch = agora;
  try{
    const r = await fetch(`${API}/api/votos?dispositivo=${dispositivoId()}`, {cache:"no-store"});
    if(!r.ok) throw new Error(r.status);
    const d = await r.json();
    S.votos = d.casas || {};
    render();
  }catch(e){
    // Mantém o que já tinha. Se nunca carregou, S.votos segue null e os cards
    // mostram "votos indisponíveis" — a página continua inteira sem isso.
  }
}
```

- [ ] **Step 4: Colocar o bloco no card**

Em `card()`, inserir `${blocoVoto(c)}` imediatamente antes de `<div class="card-links">`:

```js
    ${c.warn.length?`<div class="warn">${I.warn}<div>${c.warn.map(x=>`<p>${x}</p>`).join("")}</div></div>`:""}
    ${blocoVoto(c)}
    <div class="card-links">
```

- [ ] **Step 5: Ligar o clique**

Dentro do listener `grid.addEventListener("click", ...)`, **antes** da linha `const t=e.target.closest("[data-gal]");` — senão o clique no voto abriria a galeria:

```js
  const v=e.target.closest("[data-voto]");
  if(v){ votar(v.dataset.casa, +v.dataset.voto); return; }
```

- [ ] **Step 6: Carregar o placar no boot**

Na última linha do script, trocar `render();` por:

```js
render();
carregarVotos();
```

- [ ] **Step 7: Rodar o smoke gate**

Use a skill `smoke-gate`. Se `smoke/PROJECT.md` não existir no repo, rode o bootstrap dela primeiro — este repo é página estática servida por `python3 -m http.server 8080` com a API em `next dev` na :3000, e o app não tem autenticação nenhuma.

Expected: todas as asserções do bloco **Smoke Gate** desta task passam. Falha bloqueia a task — não afrouxe asserção.

- [ ] **Step 8: Commit**

```bash
git add index.html smoke/
git commit -m "feat: botões de Sim e Não no card com placar acumulado"
```

---

### Task 7: Ordenação "Mais votadas" e atualização ao voltar pra aba

**Files:**
- Modify: `index.html` — toolbar (`index.html:322`), `render()` (`index.html:814-816`), fim do script

**Interfaces:**
- Consumes: `placar(id)` e `carregarVotos()` da Task 6.
- Produces: `S.sort === "votos"` como quarta ordenação.

**Smoke Gate:**
- `CLICKABLE` clicar em **Mais votadas**: o botão fica `aria-pressed="true"`, os outros três de ordenar ficam `false`, e a primeira casa da grade passa a ser a de maior saldo (prepare o estado votando Sim em duas casas de grupos diferentes e Não numa terceira).
- `CLICKABLE` com **Mais votadas** ativo, votar Sim numa casa do fim da lista: o saldo do card muda na hora e **a ordem não muda** até o próximo carregamento — é a decisão de não tirar o card de baixo do dedo.
- `CLICKABLE` empate de saldo: entre duas casas com o mesmo saldo, a mais barata por pessoa vem primeiro.
- Voltar pra aba depois de sair: o placar é buscado de novo (observável trocando o voto noutra aba/janela e voltando — o saldo atualiza sem recarregar a página).

- [ ] **Step 1: Adicionar o botão na toolbar**

Depois de `<button class="tb" data-sort="rate" aria-pressed="false">Mais bem avaliada</button>` (`index.html:322`):

```html
      <button class="tb" data-sort="votos" aria-pressed="false">Mais votadas</button>
```

Não precisa de listener novo: o `querySelectorAll(".tb[data-sort],.tb[data-filter]")` que já existe (`index.html:857`) pega o botão novo pelo atributo.

- [ ] **Step 2: Ordenar por saldo**

Em `render()`, depois da linha do `S.sort==="rate"`:

```js
  // Saldo desc; empate vai pro mais barato por pessoa, que é o critério padrão
  // da página. Casas sem voto valem 0 e caem entre as aprovadas e as reprovadas.
  if(S.sort==="votos") list.sort((a,b)=> placar(b.id).saldo - placar(a.id).saldo || calc(a).tot - calc(b).tot);
```

- [ ] **Step 3: Rebuscar quando a aba volta ao foco**

No fim do script, junto do `carregarVotos()` do boot:

```js
// Sem polling: só quando a pessoa volta pra aba é que vale gastar uma requisição.
addEventListener("visibilitychange", ()=>{ if(document.visibilityState === "visible") carregarVotos(); });
addEventListener("focus", carregarVotos);
```

- [ ] **Step 4: Rodar o smoke gate**

Use a skill `smoke-gate` com as asserções do bloco **Smoke Gate** desta task, mais as da Task 6 (regressão).

Expected: tudo passa.

- [ ] **Step 5: Commit**

```bash
git add index.html
git commit -m "feat: ordenação por mais votadas e recarga do placar ao voltar pra aba"
```

---

### Task 8: Deploy na Vercel e URL de produção — TAREFA MANUAL

Esta task tem passos no dashboard da Vercel. Um agente não consegue executá-la sozinha: pare aqui e devolva pro humano.

**Files:**
- Modify: `index.html` (a constante `API`), `README.md`

**Smoke Gate:** a página publicada em `https://nicolasib.github.io/rei-leao-2027/` aceita um voto e o placar sobrevive a um recarregamento — feito à mão, no browser, depois do deploy.

- [ ] **Step 1: Criar o projeto na Vercel**

Importar o repo `nicolasib/rei-leao-2027`, e em **Settings → Build & Deployment → Root Directory** apontar para `api`. Sem isso a Vercel tenta construir a raiz, que não é um projeto Node.

- [ ] **Step 2: Provisionar o Postgres**

Aba **Storage → Marketplace → Postgres**, anexando ao projeto. A connection string é injetada automaticamente — não crie conta separada nem cole string na mão.

- [ ] **Step 3: Fixar o driver**

Em **Settings → Environment Variables**, adicionar `DB_DRIVER=neon` em Production. O chute por domínio cai em node-postgres quando o host não é `neon.tech`, e isso degrada em silêncio dentro de uma function serverless.

- [ ] **Step 4: Rodar a migration em produção**

```bash
cd api
DATABASE_URL='<connection string da Vercel>' pnpm db:migrate
```

Confirme com `psql '<string>' -c '\d voto'` que a tabela, o unique e o check existem.

- [ ] **Step 5: Apontar a página pro deploy**

Trocar no `index.html` a URL padrão pela real do projeto:

```js
const API = localStorage.getItem("rl_api") || "https://<nome-real-do-projeto>.vercel.app";
```

- [ ] **Step 6: Documentar no README**

Acrescentar ao `README.md`:

```markdown
## Votação

Os botões de Sim/Não de cada casa gravam num Postgres pela API em `api/` — um
app Next publicado na Vercel com Root Directory `api`. A página em si continua
estática no GitHub Pages.

O voto é anônimo por dispositivo: o id nasce no browser e vive no
`localStorage` desta página. Mesma pessoa em dois aparelhos conta como dois
votos, e limpar os dados do site zera os votos daquele aparelho.

Saldo = (nº de Sim) − (nº de Não). Clicar de novo no voto já marcado desfaz.

Para rodar a API local: veja `api/.env.example`, suba um Postgres, rode
`pnpm db:migrate` e `pnpm dev` dentro de `api/`. Na página, aponte para ela com
`localStorage.setItem('rl_api', 'http://localhost:3000')`.
```

- [ ] **Step 7: Commit e PR**

```bash
git add index.html README.md
git commit -m "feat: apontar a página pro endpoint de votos em produção"
git push -u origin feat/votacao-sim-nao
gh pr create --title "Votação Sim/Não com placar acumulado" --body "$(cat <<'CORPO'
Cada pessoa marca Sim ou Não em cada casa e a página mostra o placar do grupo,
com uma ordenação nova por mais votadas.

A página continua estática no GitHub Pages. O serverside é um app Next em
\`api/\`, publicado na Vercel com Root Directory \`api\`, com Postgres Neon e uma
tabela só (\`voto\`). Voto anônimo por dispositivo: id gerado no browser e
guardado no localStorage da própria página — cookie não serviria, seria de
terceiro e o Safari bloqueia.

Saldo = sims − nãos. Clicar no voto já marcado desfaz; neutro é ausência de
linha no banco, não linha com zero.

Arquivos afetados:
- \`index.html\` — bloco de voto no card, ordenação "Mais votadas", carga e
  recarga do placar
- \`api/\` — app Next novo (schema, queries, validação, CORS, route handler)
- \`docs/superpowers/\` — spec e plano

Testes: \`cd api && pnpm test\` (Vitest + PGlite) e \`pnpm build\`. Smoke gate
rodado nos cards e na ordenação.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
CORPO
)"
```

- [ ] **Step 8: Verificar em produção**

Abrir `https://nicolasib.github.io/rei-leao-2027/` depois do merge, votar numa casa, recarregar e confirmar que o voto continua lá. Abrir noutro aparelho e confirmar que o saldo soma os dois.
