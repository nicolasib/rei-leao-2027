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
