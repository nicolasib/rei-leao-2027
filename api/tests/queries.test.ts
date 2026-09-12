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
    await registrarVoto(db, { dispositivoId: B, casaId: 'cipo2', valor: -1 })

    const placar = await listarPlacar(db, A)

    expect(Object.keys(placar).sort()).toEqual(['cipo2', 'st2'])
    expect(placar.st2).toEqual({ sim: 2, nao: 0, saldo: 2, meu: 1 })
    expect(placar.cipo2).toEqual({ sim: 0, nao: 1, saldo: -1, meu: 0 })
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
