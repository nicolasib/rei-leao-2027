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
