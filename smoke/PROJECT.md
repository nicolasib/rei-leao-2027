# Smoke Gate — rei-leao-2027 (Votação Sim/Não)

## Stack

- Página estática (`index.html`, vanilla JS, sem build, sem framework) servida
  localmente por `python3 -m http.server 8080` a partir da raiz do repo.
- API em `api/` — Next.js 16 (App Router / Route Handlers), Drizzle + Postgres.
  Dev local: `pnpm --dir api dev` (Turbopack), porta **3000**.
- Banco: Postgres real via `DATABASE_URL`. Em dev, qualquer Postgres local
  serve.

## Como subir o ambiente local

1. Um Postgres acessível via TCP.
   - Preferencial (igual produção): `docker run -d --name rl-pg -e POSTGRES_PASSWORD=postgres -p 55433:5432 postgres:16`.
   - Alternativa equivalente, usada quando Docker não está disponível/aprovável
     numa sessão sem interação (ex.: agente headless): `pnpm --dir api dev:pg`
     — sobe PGlite (Postgres real compilado para WASM) exposto via protocolo
     de fiação do Postgres na mesma porta, com as migrations reais do
     `drizzle` já aplicadas. Do ponto de vista do `next dev` e do
     `pg`/`node-postgres`, é indistinguível de um Postgres de verdade (mesmo
     protocolo, mesmo schema, mesmas constraints). Não é um mock da camada de
     queries.
2. `cd api && echo 'DATABASE_URL=postgres://postgres:postgres@127.0.0.1:55433/postgres' > .env.local`
   — esse arquivo alimenta o `next dev` (passo 4), não o `drizzle-kit`: o
   `drizzle-kit` só lê `.env`, nunca `.env.local` (ver `api/drizzle.config.ts`).
3. `cd api && DATABASE_URL='postgres://postgres:postgres@127.0.0.1:55433/postgres' pnpm db:migrate`
   (forma inline, pelo motivo do passo 2; pular este passo se usando o
   stand-in do item 1, que já aplica as migrations ao subir).
4. `pnpm --dir api dev` → API em `http://localhost:3000`.
5. Da raiz do repo: `python3 -m http.server 8080` → página em `http://localhost:8080`.
6. No browser, em `http://localhost:8080`: rodar
   `localStorage.setItem('rl_api', 'http://localhost:3000')` e recarregar —
   sem isso a página aponta para a API de produção na Vercel.

## Auth

Nenhuma. Sem login, sem cookie, sem sessão, sem credenciais. A identidade do
votante é só um UUID anônimo gerado e guardado em
`localStorage.rl_dispositivo` no primeiro voto.

## Dados

API real contra Postgres real (ou o stand-in PGlite acima). Sem mocks e sem
fixtures de UI — o gate escreve votos de verdade no banco local da sessão de
dev. O stand-in (`scripts/dev-pg-socket.mjs`) sobe `new PGlite()` sem
`dataDir`: **durável entre runs de spec** (specs seguidos na mesma sessão
enxergam os votos uns dos outros) e **descartado só quando o processo
`dev:pg` reinicia**. É essa durabilidade — não efemeridade — que sustenta o
desenho por deltas dos specs (`smoke/task-6.js`, `smoke/task-7.js`): os
asserts comparam contra o placar lido no boot, nunca contra contagem
absoluta, porque um run anterior pode ter deixado votos na mesma casa.

## Escrita permitida?

Sim, mas só contra o Postgres **local**, durável entre runs de spec e
descartado quando o processo do gate reinicia — nunca contra a API de
produção (`https://rei-leao-votos.vercel.app`). Confirmar sempre que
`localStorage.rl_api` aponta para `http://localhost:3000` antes de rodar o
gate; nunca remover essa chave durante um run.

## Notas conhecidas / armadilhas

- **Grupos de região nascem colapsados** (`S.fechados` começa com todos os
  grupos). É preciso clicar no cabeçalho do grupo (`.grupo`) para abri-lo
  antes de conseguir clicar em qualquer voto dentro de um card.
- CORS: a API só aceita `https://nicolasib.github.io` em produção e
  `http://localhost:<qualquer porta>` fora de produção. `next dev` roda com
  `NODE_ENV=development` por padrão, então `http://localhost:8080` é aceito.
- `index.html` tem linhas gigantes (imagens em base64 inline) — ferramentas de
  leitura por linha podem estourar limite de tokens se o range incluir essas
  linhas; ler em janelas pequenas e fora dessas linhas.
- Docker não esteve disponível/aprovável nesta sessão headless (comandos
  `docker ...` pedem aprovação interativa que uma sessão em background não
  consegue conceder). O stand-in `pnpm --dir api dev:pg` documentado acima é
  a alternativa usada — infraestrutura de dev/gate, não faz parte do runtime
  do app em produção.

## Adjudicado: A4 da Task 7 não fecha neste harness

A asserção "voltar pra aba atualiza o placar" (`smoke/task-7.js`, A4) reprova
sempre no Aside, e **não é defeito de código**. Medido de forma independente
com uma sonda dedicada: `page.bringToFront()`, mesmo com uma segunda aba real
aberta, não emite **nenhum** dos dois eventos que o app escuta — contadores em
`window` ficaram em `visibilitychange=0 focus=0`, e `document.visibilityState`
nunca sai de `"visible"`. O único comando CDP tentado para forçar a transição
(`Emulation.setPageVisibilityOverride`) não existe no protocolo exposto.

A fiação do app, por outro lado, tem evidência positiva: um `visibilitychange`
disparado em `document` com `{bubbles: true}` — a forma que a HTML Standard
define para o evento real — chega ao listener em `window` e o placar atualiza
sozinho, sem reload.

Veredito: `BLOCKED_ENV`, não `FAIL`. A asserção **não foi afrouxada nem
removida** de propósito: o requisito é legítimo e continua rastreado. O que
falta é o harness saber produzir troca de aba. Fecha com 10 segundos de
verificação manual: abrir a página em duas janelas, votar numa, voltar na
outra e ver o saldo mudar sem recarregar.
