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
