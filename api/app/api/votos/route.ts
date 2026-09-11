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
