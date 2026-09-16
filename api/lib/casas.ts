/**
 * Os ids das casas vivem no array `casas` do index.html — o HTML é a fonte da
 * verdade. Esta lista existe só para a API recusar casa desconhecida, e
 * tests/casas.test.ts falha se as duas divergirem.
 */
export const CASAS_IDS = [
  'st2', 'nl1', 'nl2', 'sjdr1', 'cipo3', 'felix', 'cipoc', 'itag',
  'cillis', 'renascer', 'jeq', 'felix2', 'claudio', 'arcos', 'bougain',
  'tm', 'pim1', 'manh', 'pim2', 'guape',
] as const

export type CasaId = (typeof CASAS_IDS)[number]
