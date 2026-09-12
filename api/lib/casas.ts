/**
 * Os ids das casas vivem no array `casas` do index.html — o HTML é a fonte da
 * verdade. Esta lista existe só para a API recusar casa desconhecida, e
 * tests/casas.test.ts falha se as duas divergirem.
 */
export const CASAS_IDS = [
  'st2', 'st3', 'nl1', 'nl2', 'sjdr1', 'cipo2', 'cipo3', 'vertente', 'felix',
  'cipoc', 'itag', 'cillis', 'renascer', 'pl', 'jeq', 'felix2', 'claudio',
  'arcos', 'moeda', 'bougain', 'tm', 'iga', 'pim1', 'manh', 'pim2', 'guape',
  'tamboril',
] as const

export type CasaId = (typeof CASAS_IDS)[number]
