// Task 7 — botão "Mais votadas" (ordena por saldo, empate pro mais barato),
// voto não reordena a grade embaixo do dedo, e recarga do placar ao voltar
// pra aba (visibilitychange/focus reais, via page.bringToFront()).
//
// Casas usadas (todas em grupos de região diferentes entre si, exceto o par
// de A3 que é intencionalmente do mesmo grupo):
//   A1: Sim em cipo1 (Serra do Cipó) e sjdr1 (São João del Rei); Não em
//       renascer (Divinópolis) — as duas de Sim empatam em saldo +1, então o
//       desempate por preço decide quem fica em 1º.
//   A2: a última casa da grade depois de A1 (descoberta em runtime).
//   A3: par dentro de São Thomé das Letras (st2/st3/st4) — escolhido em
//       runtime pelo primeiro par com preços por pessoa diferentes.
//   A4: ln1 (Lavras Novas · Ouro Preto) — intocada nas outras asserções, e
//       fora do grupo de Nova Lima (nl1/nl2) que o brief pediu pra evitar.

const BASE = 'http://localhost:8080';
const API_LOCAL = 'http://localhost:3000';

async function abrirGrupo(page, casa) {
  await page.evaluate((c) => {
    const bloco = document.querySelector(`[data-voto-casa="${c}"]`);
    if (!bloco) return;
    const sec = bloco.closest('.grupo-sec');
    const btn = sec && sec.querySelector('.grupo');
    if (btn && btn.getAttribute('aria-expanded') === 'false') btn.click();
  }, casa);
  await sleep(400);
}

// Mesmo formato do smoke/task-6.js: saldo, os dois aria-pressed, contagem.
function estadoVoto(page, casa) {
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

function precoPP(page, casa) {
  return page.evaluate((c) => {
    const bloco = document.querySelector(`[data-voto-casa="${c}"]`);
    const card = bloco && bloco.closest('article');
    const p = card && card.querySelector('.price-n');
    return p ? p.textContent.trim() : null;
  }, casa);
}

const parseBRL = (s) => Number(String(s).replace(/[^\d]/g, ''));

function ordemDom(page) {
  return page.evaluate(() =>
    Array.from(document.querySelectorAll('[data-voto-casa]')).map((el) => el.getAttribute('data-voto-casa')));
}

function estadoOrdenacao(page) {
  return page.evaluate(() => {
    const est = (id) => {
      const el = document.querySelector(`[data-sort="${id}"]`);
      return el ? el.getAttribute('aria-pressed') : 'ausente';
    };
    const primeira = document.querySelector('[data-voto-casa]');
    return `pp:${est('pp')} dist:${est('dist')} rate:${est('rate')} votos:${est('votos')} | primeira:${primeira ? primeira.getAttribute('data-voto-casa') : 'nenhuma'}`;
  });
}

const sel = (casa, v) => `[data-voto-casa="${casa}"] [data-voto="${v}"]`;

// --- ambiente: aponta pra API local, começa sem voto nenhum do meu device ---
const page = await openTab(BASE);
await page.evaluate((api) => {
  localStorage.clear();
  localStorage.setItem('rl_api', api);
}, API_LOCAL);
await page.reload();
await sleep(1800);

const baseline = await page.evaluate(async (api) => {
  const r = await fetch(`${api}/api/votos`);
  return r.ok ? await r.json() : null;
}, API_LOCAL);
note(`baseline /api/votos: ${JSON.stringify(baseline)}`);
await shot(page, 'inicial');

// ---------------------------------------------------------------------------
// A1 · CLICKABLE — "Mais votadas" ordena por saldo (empate -> mais barato)
// ---------------------------------------------------------------------------
await abrirGrupo(page, 'cipo1');
await abrirGrupo(page, 'sjdr1');
await abrirGrupo(page, 'renascer');

const precoCipo1Txt = await precoPP(page, 'cipo1');
const precoSjdr1Txt = await precoPP(page, 'sjdr1');
const precoCipo1 = parseBRL(precoCipo1Txt);
const precoSjdr1 = parseBRL(precoSjdr1Txt);
const vencedorA1 = precoCipo1 <= precoSjdr1 ? 'cipo1' : 'sjdr1';
note(`A1 empate esperado: cipo1=${precoCipo1Txt}(${precoCipo1}) sjdr1=${precoSjdr1Txt}(${precoSjdr1}) -> vencedor esperado ${vencedorA1}`);

await page.locator(sel('cipo1', 1)).click();
await sleep(300);
await page.locator(sel('sjdr1', 1)).click();
await sleep(300);
await page.locator(sel('renascer', -1)).click();
await sleep(300);
await shot(page, 'votos-lancados');

await assertClickable(
  page, '[data-sort="votos"]', () => estadoOrdenacao(page),
  `pp:false dist:false rate:false votos:true | primeira:${vencedorA1}`,
  'A1', 'clicar "Mais votadas" ordena por saldo, empate pro mais barato',
);
await shot(page, 'mais-votadas');

// ---------------------------------------------------------------------------
// A2 · CLICKABLE — voto não reordena a grade
// ---------------------------------------------------------------------------
const ordemAntesA2 = await ordemDom(page);
const casaA2 = ordemAntesA2[ordemAntesA2.length - 1];
note(`A2 alvo (última da grade): ${casaA2}; ordem antes: ${JSON.stringify(ordemAntesA2)}`);

await abrirGrupo(page, casaA2);
const antesA2 = await estadoVoto(page, casaA2);
const antesA2Parsed = parseEstadoVoto(antesA2);
function esperadoA2() {
  const sim = antesA2Parsed.sim - (antesA2Parsed.meu === 1 ? 1 : 0) + 1;
  const nao = antesA2Parsed.nao - (antesA2Parsed.meu === -1 ? 1 : 0);
  return formatarEstadoVoto({ sim, nao, saldo: sim - nao, meu: 1 });
}
const esperadoEstadoA2 = esperadoA2();
note(`A2 antes: ${antesA2} -> esperado depois: ${esperadoEstadoA2} (ordem deve continuar igual)`);

await assertClickable(
  page, sel(casaA2, 1),
  () => Promise.all([estadoVoto(page, casaA2), ordemDom(page)]).then(([e, o]) => `${e} || ordem:${JSON.stringify(o)}`),
  `${esperadoEstadoA2} || ordem:${JSON.stringify(ordemAntesA2)}`,
  'A2', `voto em ${casaA2} (última da grade) não reordena com "Mais votadas" ativo`,
);
await shot(page, 'voto-nao-reordena');

// ---------------------------------------------------------------------------
// A3 · STATE — empate de saldo vai pro mais barato (mesmo grupo de região)
// ---------------------------------------------------------------------------
const trioSaoThome = ['st2', 'st3', 'st4'];
for (const c of trioSaoThome) await abrirGrupo(page, c);
const precosSaoThome = {};
for (const c of trioSaoThome) precosSaoThome[c] = parseBRL(await precoPP(page, c));
note(`A3 preços São Thomé das Letras: ${JSON.stringify(precosSaoThome)}`);

let parA3 = null;
for (let i = 0; i < trioSaoThome.length && !parA3; i++) {
  for (let j = i + 1; j < trioSaoThome.length && !parA3; j++) {
    const [a, b] = [trioSaoThome[i], trioSaoThome[j]];
    if (precosSaoThome[a] !== precosSaoThome[b]) parA3 = [a, b];
  }
}

if (!parA3) {
  __rec('A3', 'STATE', false, `plano defeituoso: as três casas de São Thomé empatam em preço (${JSON.stringify(precosSaoThome)}) — sem par com preços diferentes pra testar o desempate`);
} else {
  const [x, y] = parA3;
  const [barata, cara] = precosSaoThome[x] <= precosSaoThome[y] ? [x, y] : [y, x];
  const ordemAtual = await ordemDom(page);
  const idxBarata = ordemAtual.indexOf(barata);
  const idxCara = ordemAtual.indexOf(cara);
  const ok = idxBarata !== -1 && idxCara !== -1 && idxBarata < idxCara;
  __rec('A3', 'STATE', ok,
    `par usado: ${barata}=R$${precosSaoThome[barata]} (índice ${idxBarata}) vs ${cara}=R$${precosSaoThome[cara]} (índice ${idxCara}); ambas saldo 0, mesmo grupo (São Thomé das Letras); esperado ${barata} antes de ${cara}`);
  note(`A3 resultado: ${ok ? 'ok' : 'FALHOU'} — ordem completa: ${JSON.stringify(ordemAtual)}`);
}
await shot(page, 'desempate-sao-tome');

// ---------------------------------------------------------------------------
// A4 · STATE — voltar pra aba rebusca o placar (sem reload)
// ---------------------------------------------------------------------------
const CASA_A4 = 'ln1';
await abrirGrupo(page, CASA_A4);
const antesA4 = await estadoVoto(page, CASA_A4);
const antesA4Parsed = parseEstadoVoto(antesA4);
note(`A4 antes (aba do gate): ${antesA4}`);

// "outro dispositivo" vota Sim em ln1 direto na API, sem tocar o DOM da aba.
const respostaOutroDispositivo = await page.evaluate(async (api) => {
  const dispositivoAlheio = crypto.randomUUID();
  const r = await fetch(`${api}/api/votos`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ dispositivo: dispositivoAlheio, casa: 'ln1', valor: 1 }),
  });
  return { status: r.status, corpo: r.ok ? await r.json() : await r.text() };
}, API_LOCAL);
note(`A4 voto de outro dispositivo: ${JSON.stringify(respostaOutroDispositivo)}`);

const esperadoA4 = formatarEstadoVoto({
  sim: antesA4Parsed.sim + 1,
  nao: antesA4Parsed.nao,
  saldo: antesA4Parsed.sim + 1 - antesA4Parsed.nao,
  meu: antesA4Parsed.meu, // não é meu voto — meu continua o que já era
});
note(`A4 esperado após o rebusque: ${esperadoA4}`);

// throttle de carregarVotos() é 5s (ultimoFetch); o boot já gastou uma janela.
await sleep(6500);

let mecanismoA4 = 'não tentado';
let depoisA4 = null;
try {
  const page2 = await openTab('about:blank');
  await sleep(500);
  note(`A4: segunda aba aberta (${page2.targetId}), a original deveria ter ido pra background`);
  await page.bringToFront();
  mecanismoA4 = 'page.bringToFront() real, via segunda aba';
  await sleep(1500);
  depoisA4 = await estadoVoto(page, CASA_A4);
  await closeTab(page2);
} catch (e) {
  mecanismoA4 = `mecanismo real falhou: ${String(e)}`;
}

if (depoisA4 === null) {
  __rec('A4', 'STATE', false, `BLOCKED_ENV nesta linha — não foi possível confirmar via troca real de aba (${mecanismoA4}). Não fabriquei verde com evento sintético.`);
} else {
  const ok = depoisA4 === esperadoA4;
  __rec('A4', 'STATE', ok,
    `mecanismo: ${mecanismoA4}; antes: ${antesA4}; depois (sem reload): ${depoisA4}; esperado: ${esperadoA4}`);
}
await shot(page, 'apos-voltar-de-aba');

// nota advisory (não conta pro veredito): confere se o listener reage a um
// evento sintético dispatchado no document, já que o app escuta em window e
// o browser dispara visibilitychange no document.
try {
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await sleep(1500);
  const depoisSintetico = await estadoVoto(page, CASA_A4);
  note(`A4 (advisory, não conta) — após dispatch sintético de visibilitychange no document: ${depoisSintetico}`);
} catch (e) {
  note(`A4 (advisory) dispatch sintético falhou: ${String(e)}`);
}

// ---------------------------------------------------------------------------
// A5 · CONSOLE — console limpo durante carga, ordenação e votos
// ---------------------------------------------------------------------------
await assertConsole(page, 'A5', 'console durante carga, troca de ordenação e votos');

// devolve a chave pro estado documentado no PROJECT.md
await page.evaluate((api) => localStorage.setItem('rl_api', api), API_LOCAL);

emit();
