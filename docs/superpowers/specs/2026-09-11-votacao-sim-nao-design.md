# Votação Sim/Não nas casas — design

Data: 2026-09-11 · Repo: `nicolasib/rei-leao-2027`

## Problema

A página compara 23 casas na mesma régua de custo por pessoa, mas a decisão do
grupo acontece fora dela — no WhatsApp, sem placar. Queremos que cada pessoa
marque Sim ou Não em cada casa e que a página mostre o acumulado de todo mundo,
com as mais aprovadas em cima.

## Estado atual

`index.html`: 996 linhas, sem build, publicado em GitHub Pages
(`https://nicolasib.github.io/rei-leao-2027/`, branch `main`, raiz do repo,
`.nojekyll`). As 23 casas vivem no array `casas` (`index.html:419`), os cards
são strings montadas por `card()` (`index.html:745`), `render()`
(`index.html:806`) filtra → ordena → agrupa por região → injeta em `#grid`.
O estado é o objeto `S` (`index.html:724`). Já existe delegação de clique em
`#grid` (`index.html:957`) e os grupos nascem **colapsados**
(`S.fechados` começa com todos os grupos).

Não há servidor nenhum: qualquer acumulação entre pessoas precisa de backend novo.

## Decisões

| Decisão | Escolha |
|---|---|
| Identidade do votante | Anônima por dispositivo |
| Onde a página fica | Continua no GitHub Pages; só a API vai pra Vercel |
| Estados do voto | Sim (+1) · Não (−1) · sem voto (0), clique no voto atual desfaz |
| Visualização | Ordenação "Mais votadas" + selo de saldo no card |
| Código da API | Subpasta `api/` no mesmo repo, Vercel com Root Directory `api` |
| Banco | Postgres Neon (aba Storage da Vercel) + Drizzle — mesmo padrão do `desafio-fit` |

### Por que Route Handlers e não Server Actions

No `desafio-fit` o form e o servidor são a mesma origem. Aqui a página fica em
`nicolasib.github.io` e o servidor em `*.vercel.app`: Server Action é
cross-origin e o Next rejeita. O serverside continua sendo Next, mas via Route
Handlers (`app/api/votos/route.ts`) com CORS liberado pra origem do Pages.

### Por que localStorage e não cookie

Um cookie setado pelo domínio da Vercel, lido a partir do Pages, é cookie de
terceiro: Safari/iOS bloqueia por padrão e boa parte do grupo votaria como
"pessoa nova" a cada visita. O id do dispositivo nasce no cliente
(`crypto.randomUUID()`), vive no `localStorage` do próprio Pages (first-party,
ninguém bloqueia) e viaja no corpo da requisição. O servidor nunca seta cookie,
então o CORS dispensa `credentials`.

Consequência aceita: a mesma pessoa no celular e no desktop conta como dois
votos, e limpar os dados do site zera os votos daquele dispositivo.

### Sem autenticação

Quem descobrir a URL da API pode votar, e o id do dispositivo é forjável. Pra
uma página `noindex` que compara casas de réveillon pra um grupo de amigos, o
custo de fraude é uma piada interna — não construímos defesa contra isso. A
única barreira é de integridade de dados, não de acesso: `casa_id` precisa estar
na lista fechada dos 23 ids e `valor` precisa ser 1, 0 ou −1.

## Escala

`saldo = (nº de Sim) − (nº de Não)`. Sem voto não pontua. É daí que sai a
diferença de 2 pontos: quem estava em Sim e muda pra Não move a casa de +1 pra
−1. Casas sem voto nenhum ficam em 0, entre as aprovadas e as reprovadas.

## Modelo de dados

Uma tabela. As casas **não** entram no banco — o `casa_id` é a string que já
existe no array do `index.html` (`"st2"`, `"cipo1"`…).

```
voto
  id              uuid  pk default random
  dispositivo_id  uuid  not null
  casa_id         text  not null
  valor           smallint not null   -- check (valor in (1, -1))
  criado_em       timestamptz not null default now()
  atualizado_em   timestamptz not null default now()
  unique (dispositivo_id, casa_id)
```

**Neutro não é uma linha com zero — é a ausência da linha.** Desvotar faz
DELETE. Isso mantém `sum(valor)` como a definição direta do saldo e evita a
terceira representação do mesmo estado.

Sem índice extra: o unique já serve a busca por dispositivo, e a agregação
varre uma tabela de algumas centenas de linhas (23 casas × ~10 pessoas).

## API

Base: `https://<projeto>.vercel.app`

### `GET /api/votos?dispositivo=<uuid>`

```json
{ "casas": { "st2": { "sim": 5, "nao": 2, "saldo": 3, "meu": 1 }, "…": {} } }
```

- Só as casas com pelo menos um voto aparecem; o cliente trata ausência como
  `{sim:0, nao:0, saldo:0, meu:0}`.
- `meu` é o voto deste dispositivo: `1`, `-1` ou `0`. Sem o parâmetro
  `dispositivo`, vem `0` em todas.
- Duas queries: uma agregação (`count(*) filter (where valor = 1)`,
  `count(*) filter (where valor = -1)`, `sum(valor)`, `group by casa_id`) e uma
  busca dos votos do dispositivo. Nunca 23 queries.
- `Cache-Control: no-store`.

### `POST /api/votos`

```json
{ "dispositivo": "<uuid>", "casa": "st2", "valor": 1 }
```

- `valor` `1` ou `-1`: upsert (`on conflict (dispositivo_id, casa_id) do update`,
  atualizando `atualizado_em`). `valor` `0`: delete.
- Resposta: o estado novo daquela casa — `{ "casa": "st2", "sim": 5, "nao": 1,
  "saldo": 4, "meu": 1 }`. O cliente reconcilia com isso em vez de recontar sozinho.
- Idempotente: repetir o mesmo POST devolve a mesma coisa.

### Erros

`400 { "erro": "<mensagem>" }` para: `dispositivo` que não é UUID, `casa` fora da
lista dos 23 ids, `valor` fora de {1, 0, −1}, body que não é JSON válido.
`500 { "erro": "..." }` para falha de banco. Validação com Zod, na borda.

### CORS

Origens permitidas: `https://nicolasib.github.io` sempre, mais
`http://localhost:<qualquer porta>` quando `NODE_ENV !== 'production'` (é como
o smoke gate e o dev local alcançam a API). `OPTIONS` responde o preflight.
Origem desconhecida não recebe o header — o browser bloqueia.

## Cliente (`index.html`)

### Estado

```js
S.dispositivo  // uuid do localStorage, criado na primeira visita
S.votos        // { [casaId]: {sim, nao, saldo, meu} } | null enquanto carrega ou se a API falhar
```

`const API = localStorage.getItem("rl_api") || "https://<projeto>.vercel.app"` —
o override existe pro smoke gate e pro dev local apontarem pra API local.

### Ciclo

1. A página pinta na hora com os dados locais, como hoje. Nada espera rede.
2. `GET /api/votos` em seguida; quando responde, `S.votos` preenche e a grade
   re-renderiza uma vez.
3. Clique num botão de voto: calcula o próximo estado (Sim marcado + clique em
   Sim = neutro; Sim marcado + clique em Não = Não), aplica otimista em
   `S.votos`, **repinta só o bloco de voto daquele card** e dispara o POST. A resposta reconcilia
   os números. Se o POST falhar, reverte e mostra o erro dentro do card.
4. Refetch quando a aba volta ao foco (`visibilitychange` + `focus`), no máximo
   um a cada 5s. Sem polling.

**O clique nunca reordena a lista.** Mesmo com "Mais votadas" ativo: mover o card
pra fora do dedo no instante do toque é pior que o placar ficar um momento fora
de ordem. A ordem se resolve no próximo refetch de foco ou quando a pessoa toca
de novo no botão de ordenar.

### UI no card

Bloco novo em `card()`, logo antes de `.card-links`:

- Dois botões, `Sim` e `Não`, com `aria-pressed` refletindo o voto do dispositivo.
  Marcado usa a paleta que já existe: verde (`--green-bg`/`--green-tx`) no Sim,
  vermelho (`--red-bg`/`--red-tx`) no Não.
- Saldo em destaque com sinal (`+4`, `−2`, `0`), verde quando positivo, vermelho
  quando negativo, `--ink-40` no zero.
- Contagem miúda: `5 sim · 1 não`. Sem voto nenhum: "ninguém votou ainda".
- O bloco tem `data-voto-casa="<id>"` pra ser repintado in-place sem re-render.
- Enquanto `S.votos` é `null` por falha da API: botões `disabled` e a linha
  "votos indisponíveis". A página segue inteira como comparador de custo — a
  votação é aditiva, nunca um pré-requisito.

Os cliques entram na delegação que já existe em `#grid` (`index.html:957`),
antes do teste de `[data-gal]`, pra não abrir a galeria ao votar.

### Ordenação

Quarto botão na toolbar, depois de "Mais bem avaliada" (`index.html:322`):
`<button class="tb" data-sort="votos">Mais votadas</button>`. Em `render()`:
saldo desc, desempate por custo por pessoa asc. O agrupamento por região
continua como está — cada grupo herda a posição da casa mais bem colocada dele.

## Sincronia dos 23 ids

`api/lib/casas.ts` exporta `CASAS_IDS` (a lista fechada usada na validação). Um
teste lê `../index.html`, extrai os ids por regex (`{id:"…"`) e falha se as duas
listas divergirem — é o que impede uma casa nova no HTML de virar 400 silencioso
na API.

## Testes

Vitest + PGlite em memória (mesmo arranjo do `desafio-fit`):

- Sim registra saldo +1; trocar pro Não leva a −1 (a diferença de 2 pontos).
- Clicar no voto atual apaga a linha e zera o saldo.
- Dois dispositivos na mesma casa somam; o `meu` de cada um é o voto dele.
- `GET` devolve `{sim, nao, saldo}` coerentes com as linhas.
- 400 para casa desconhecida, valor inválido, dispositivo não-UUID, body inválido.
- CORS: preflight responde pra origem do Pages e não responde pra origem estranha.
- Os 23 ids do `index.html` batem com `CASAS_IDS`.

## Smoke gate

Aside Browser, com a página servida localmente e a API em `next dev`
(`localStorage.rl_api` apontando pro local). **Os grupos nascem colapsados — o
roteiro abre o grupo antes de tentar votar.**

- `CLICKABLE` Sim num card: saldo vai de `0` pra `+1` e o botão fica
  `aria-pressed="true"`.
- `CLICKABLE` Sim de novo: volta pra `0`, `aria-pressed="false"`, e a contagem volta pra "ninguém votou ainda".
- `CLICKABLE` Não num card votado em Sim: saldo vai de `+1` pra `−1`.
- `CLICKABLE` "Mais votadas": a primeira casa da grade passa a ser a de maior saldo.
- API fora do ar: botões desabilitados, "votos indisponíveis", e os cards de
  custo continuam corretos.

## Deploy

- Vercel, projeto novo, **Root Directory `api`**, apontando pro mesmo repo.
- Storage → Marketplace → Postgres; a Vercel injeta a connection string.
- Env: `DATABASE_URL` (injetada) e `DB_DRIVER=neon` explícito em produção — o
  chute por domínio degrada em silêncio dentro de function serverless.
- `pnpm db:migrate` roda a migration da tabela `voto`. Não há seed.
- A URL do deploy entra no `const API` do `index.html` num commit próprio,
  depois que o endpoint estiver de pé.
- O GitHub Pages continua servindo a raiz do repo. A pasta `api/` fica visível
  publicamente como arquivos estáticos: feio, inofensivo — o repo já é público e
  `.env` não é commitado.

## Fora de escopo

Login, saber quem votou no quê, comentário por casa, editar as casas pelo
servidor, mover a página pro Next, notificação de voto novo, histórico de
mudança de voto.
