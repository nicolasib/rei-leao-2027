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
