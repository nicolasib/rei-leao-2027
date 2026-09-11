/**
 * Os ids das casas vivem no array `casas` do index.html — o HTML é a fonte da
 * verdade. Esta lista existe só para a API recusar casa desconhecida, e
 * tests/casas.test.ts falha se as duas divergirem.
 */
export const CASAS_IDS = [
  'st2', 'st3', 'ln1', 'ln2', 'cap1', 'sso', 'nl1', 'nl2', 'sjdr1', 'sjdr2',
  'rm', 'st4', 'cipo1', 'cipo2', 'cipo3', 'vertente', 'igarape', 'felix',
  'cipoc', 'itag', 'cillis', 'renascer', 'jab',
] as const

export type CasaId = (typeof CASAS_IDS)[number]
