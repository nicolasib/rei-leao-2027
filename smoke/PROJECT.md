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
fixtures de UI — o gate escreve votos de verdade no banco local efêmero da
sessão de dev.

## Escrita permitida?

Sim, mas só contra o Postgres **local e efêmero** subido para o gate — nunca
contra a API de produção (`https://rei-leao-votos.vercel.app`). Confirmar
sempre que `localStorage.rl_api` aponta para `http://localhost:3000` antes de
rodar o gate; nunca remover essa chave durante um run.

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
