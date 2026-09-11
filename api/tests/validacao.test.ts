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
