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

  it('banco indisponível devolve 503 com CORS em vez do 500 padrão do Next', async () => {
    await encerrar()
    encerrar = async () => {} // já fechado; evita fechar de novo no afterEach
    const r = await get(`?dispositivo=${A}`)
    expect(r.status).toBe(503)
    expect(r.headers.get('Access-Control-Allow-Origin')).toBe(PAGES)
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
