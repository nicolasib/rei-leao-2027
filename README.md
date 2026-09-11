# Rei leão 2027

Comparador das 12 casas de Airbnb para o réveillon de 30/12/2026 a 03/01/2027,
com o custo real por pessoa (hospedagem + combustível + comida) recalculado ao vivo.

Página estática, sem build. Publicada em GitHub Pages a partir de `index.html`.

## Votação

Cada casa tem botões de **Sim** e **Não**; o placar é do grupo todo. `saldo =
(nº de Sim) − (nº de Não)` — clicar no voto já marcado desfaz, e a ordenação
**Mais votadas** usa o saldo, desempatando pelo mais barato por pessoa.

A página segue estática aqui no GitHub Pages. O serverside é o app Next em
`api/`, publicado na Vercel (projeto `rei-leao-votos`, Root Directory `api`)
com Postgres na Neon e uma tabela só.

O voto é **anônimo por dispositivo**: um uuid gerado no browser e guardado no
`localStorage` desta página. Cookie não serviria — viria do domínio da Vercel,
seria cookie de terceiro e o Safari bloqueia. Duas consequências: a mesma
pessoa no celular e no desktop conta como dois votos, e limpar os dados do
site zera os votos daquele aparelho.

Se a API estiver fora do ar, os botões desabilitam e o resto da página
continua funcionando como comparador de custo.

### Rodar a API local

```bash
cd api
pnpm install
pnpm dev:pg     # Postgres (PGlite) na 55433, migrations aplicadas no boot
pnpm dev        # API em http://localhost:3000
```

Na página, aponte para ela com
`localStorage.setItem('rl_api', 'http://localhost:3000')` e recarregue.
Detalhes do ambiente e do smoke gate em `smoke/PROJECT.md`.
