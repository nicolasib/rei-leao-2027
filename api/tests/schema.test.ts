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
