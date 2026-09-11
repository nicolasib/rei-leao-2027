import { z } from 'zod'
import { CASAS_IDS } from './casas'

// Zod 4: os formatos de string são funções de topo (z.uuid()), não métodos.
export const postSchema = z.object({
  dispositivo: z.uuid(),
  casa: z.enum(CASAS_IDS),
  valor: z.union([z.literal(1), z.literal(0), z.literal(-1)]),
})

export const ehUuid = (v: string): boolean => z.uuid().safeParse(v).success
