import { pgTable, uuid, text, smallint, timestamp, unique, check } from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'

/**
 * Um voto por dispositivo por casa. Neutro não é uma linha com valor 0 — é a
 * ausência da linha, o que mantém sum(valor) como a definição literal do saldo.
 * As casas não estão no banco: casa_id é a string do array do index.html,
 * validada contra lib/casas.ts na borda.
 */
export const voto = pgTable('voto', {
  id: uuid('id').primaryKey().defaultRandom(),
  dispositivoId: uuid('dispositivo_id').notNull(),
  casaId: text('casa_id').notNull(),
  valor: smallint('valor').notNull(),
  criadoEm: timestamp('criado_em', { withTimezone: true }).notNull().defaultNow(),
  atualizadoEm: timestamp('atualizado_em', { withTimezone: true }).notNull().defaultNow(),
}, t => [
  unique('voto_dispositivo_casa').on(t.dispositivoId, t.casaId),
  check('voto_valor', sql`${t.valor} in (1, -1)`),
])
