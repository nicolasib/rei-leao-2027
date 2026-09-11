// Task 6 — botões de Sim/Não no card, placar acumulado.
// Casa de teste: nl1 (Casa Brizza). Os grupos de região nascem colapsados,
// então cada verificação abre o grupo antes de olhar o card.
//
// O Postgres do gate é durável entre runs (ver smoke/PROJECT.md), então os
// asserts abaixo são deltas sobre o placar de nl1 lido logo após o boot
// (baseline), nunca contagens absolutas — rodar o spec duas vezes não pode
// reprovar só por causa do que o run anterior deixou na casa.

const BASE = 'http://localhost:8080';
const API_LOCAL = 'http://localhost:3000';
const API_MORTA = 'http://127.0.0.1:9';
const CASA = 'nl1';

async function abrirGrupo(page, casa) {
  await page.evaluate((c) => {
    const bloco = document.querySelector(`[data-voto-casa="${c}"]`);
    if (!bloco) return;
    const sec = bloco.closest('.grupo-sec');
    const btn = sec && sec.querySelector('.grupo');
    if (btn && btn.getAttribute('aria-expanded') === 'false') btn.click();
  }, casa);
  await sleep(500);
}

// Uma string com tudo que a asserção precisa ver: saldo, os dois aria-pressed
// (ou :off quando desabilitado) e a contagem.
function estado(page, casa) {
  return page.evaluate((c) => {
    const r = document.querySelector(`[data-voto-casa="${c}"]`);
    if (!r) return 'sem bloco de voto';
    const saldo = r.querySelector('.voto-saldo');
    const sim = r.querySelector('.voto-sim');
    const nao = r.querySelector('.voto-nao');
    const cont = r.querySelector('.voto-cont');
    const b = (el, nome) => !el ? `${nome}:ausente`
      : el.disabled ? `${nome}:off` : `${nome}:${el.getAttribute('aria-pressed')}`;
    return [
      saldo ? saldo.textContent.trim() : 'sem saldo',
      b(sim, 'sim'), b(nao, 'nao'),
      cont ? cont.textContent.trim() : 'sem contagem',
    ].join(' | ');
  }, casa);
}

// "+1 | sim:true | nao:false | 1 sim · 0 não" -> {sim,nao,saldo,meu}
function parseEstadoVoto(s) {
  const [saldoTxt, simTxt, naoTxt, contTxt] = s.split(' | ');
  const saldo = parseInt(saldoTxt.replace('+', ''), 10);
  const meu = simTxt === 'sim:true' ? 1 : naoTxt === 'nao:true' ? -1 : 0;
  let sim = 0, nao = 0;
  const m = contTxt.match(/(\d+) sim · (\d+) não/);
  if (m) { sim = Number(m[1]); nao = Number(m[2]); }
  return { sim, nao, saldo, meu };
}

function formatarEstadoVoto({ sim, nao, saldo, meu }) {
  const total = sim + nao;
  return [
    `${saldo > 0 ? '+' : ''}${saldo}`,
    `sim:${meu === 1}`,
    `nao:${meu === -1}`,
    total ? `${sim} sim · ${nao} não` : 'ninguém votou ainda',
  ].join(' | ');
}

const sel = (casa, v) => `[data-voto-casa="${casa}"] [data-voto="${v}"]`;

// --- ambiente: aponta pra API local e começa sem voto nenhum -------------
const page = await openTab(BASE);
await page.evaluate((api) => {
  localStorage.clear();
  localStorage.setItem('rl_api', api);
}, API_LOCAL);
await page.reload();
await sleep(1800);
await abrirGrupo(page, CASA);

const inicial = await estado(page, CASA);
const baseline = parseEstadoVoto(inicial);
note(`estado inicial (baseline para os deltas abaixo): ${inicial}`);
await shot(page, 'inicial');

// --- A1: Sim leva o saldo a +1 sobre o baseline --------------------------
const esperadoA1 = formatarEstadoVoto({
  sim: baseline.sim + 1, nao: baseline.nao, saldo: baseline.saldo + 1, meu: 1,
});
await assertClickable(
  page, sel(CASA, 1), () => estado(page, CASA),
  esperadoA1,
  'A1', 'clicar Sim',
);
await shot(page, 'sim-marcado');

// --- A2: clicar Sim de novo desfaz (volta exatamente ao baseline) --------
await assertClickable(
  page, sel(CASA, 1), () => estado(page, CASA),
  inicial,
  'A2', 'clicar Sim de novo (desfaz)',
);
await shot(page, 'neutro');

// --- A3: Sim -> Não move dois pontos sobre o baseline --------------------
await assertClickable(
  page, sel(CASA, 1), () => estado(page, CASA),
  esperadoA1,
  'A3a', 'voltar pra Sim antes de trocar',
);
const esperadoA3b = formatarEstadoVoto({
  sim: baseline.sim, nao: baseline.nao + 1, saldo: baseline.saldo - 1, meu: -1,
});
await assertClickable(
  page, sel(CASA, -1), () => estado(page, CASA),
  esperadoA3b,
  'A3b', 'trocar Sim por Não (+1 -> -1)',
);
await shot(page, 'nao-marcado');

// --- A4: o voto veio do servidor, não do DOM -----------------------------
await page.reload();
await sleep(1800);
await abrirGrupo(page, CASA);
const depoisDoReload = await estado(page, CASA);
__rec('A4', 'STATE', depoisDoReload === esperadoA3b,
  `após recarregar: ${depoisDoReload} (esperado ${esperadoA3b})`);
await shot(page, 'apos-reload');

// --- CONSOLE: nenhum erro durante carga e votos --------------------------
await assertConsole(page, 'A5', 'console durante carga e votos');

// --- A6: API fora do ar degrada sem derrubar a página --------------------
await page.evaluate((api) => localStorage.setItem('rl_api', api), API_MORTA);
await page.reload();
await sleep(2000);
await abrirGrupo(page, CASA);
const offline = await estado(page, CASA);
__rec('A6', 'STATE',
  offline === 'sem saldo | sim:off | nao:off | votos indisponíveis',
  `com a API fora: ${offline}`);

// a página tem que continuar sendo o comparador de custo
const precoSegueVivo = await page.evaluate((c) => {
  const card = document.querySelector(`[data-voto-casa="${c}"]`).closest('article');
  const p = card && card.querySelector('.price-n');
  return p ? p.textContent.trim() : 'sem preço';
}, CASA);
__rec('A7', 'STATE', /^R\$\s?\d/.test(precoSegueVivo),
  `custo por pessoa com a API fora: ${precoSegueVivo}`);
await shot(page, 'api-fora');

// devolve a chave pro estado documentado no PROJECT.md
await page.evaluate((api) => localStorage.setItem('rl_api', api), API_LOCAL);

emit();
