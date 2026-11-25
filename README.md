# ANIME STRIKERS

Jogo de navegador de **futebol estratégico com leilão de personagens de anime**. Você entra em uma sala, disputa personagens em leilões em tempo real (contra amigos e/ou bots), monta um time de 5 titulares, escolhe a formação e compete em um campeonato de pontos corridos.

> **Aviso:** fan game **não oficial**, sem fins lucrativos e sem afiliação com as franquias citadas (Blue Lock, Naruto, Dragon Ball, One Piece, Jujutsu Kaisen, Inazuma Eleven, Captain Tsubasa). Os nomes pertencem aos seus detentores. Todas as ilustrações são **arte original em SVG gerada por código**; nenhuma imagem oficial é usada.

## O que já funciona

- **Salas privadas** com código de 5 caracteres, link de convite, 2 a 8 participantes, bots para completar vagas, lobby em tempo real, saída/entrada e **reconexão**.
- **Leilão em tempo real**: cronômetro de 15 s sincronizado pelo relógio do **servidor**, +5 s para lances nos últimos 3 s, incremento de 1 M, histórico, orçamento de 100 M, reserva para completar o time, sem contratação dupla.
- **Bots** em 3 níveis (fácil, normal, difícil) que só usam informação pública, não estouram orçamento e evitam gastar tudo cedo.
- **56 personagens** (7 universos, 5 raridades) com atributos fixos, OVR por posição, habilidade especial que afeta a partida, cartas com efeitos por raridade.
- **Escalação** em campo de futebol, 3 formações, sinergia, avisos de posição inadequada e escalação automática.
- **Simulação de partida** determinística por seed, com narração, gols, assistências, MVP e estatísticas; **campeonato** com classificação e histórico.
- **Persistência em PostgreSQL** (14 tabelas, migration, seed): o estado sobrevive a atualizar a página e a reiniciar o servidor (os timers do leilão são retomados).
- Interface **mobile-first**, tema escuro neon, acessível (foco visível, teclado, rótulos, `prefers-reduced-motion`).

Regras e fórmulas: [`docs/REGRAS_DO_JOGO.md`](docs/REGRAS_DO_JOGO.md). Arquitetura: [`docs/ARQUITETURA.md`](docs/ARQUITETURA.md).

## Requisitos

- **Node.js 20.12 ou superior** (testado com Node 22) e npm 10+
- **PostgreSQL 16+** (o `docker-compose.yml` sobe um) — opcional para jogar rápido: sem `DATABASE_URL` o servidor usa memória e avisa no log

## Instalação e execução local

```bash
# 1) dependências (o postinstall gera o cliente do Prisma)
npm install

# 2) configuração
cp .env.example .env          # ajuste SESSION_SECRET (>= 16 caracteres)

# 3) banco de dados (PostgreSQL via Docker)
docker compose up -d
npm run db:migrate            # prisma migrate deploy
npm run db:seed               # carrega o catálogo (o servidor também faz isso ao subir, se faltar)

# 4) frontend + backend juntos
npm run dev
```

Abra **http://localhost:5173**. O servidor roda em `http://localhost:3001` e o Vite encaminha `/api` e `/socket.io` para ele.
Rodar separado: `npm run dev -w @strikers/server` e `npm run dev -w @strikers/client`.

**Sem Docker?** Use qualquer PostgreSQL e ajuste `DATABASE_URL`, ou rode só em memória (apague `DATABASE_URL`). Em Linux, `apps/server/scripts/embedded-postgres.sh start` sobe um PostgreSQL local a partir de um pacote npm (imprime a `DATABASE_URL`; aplique a migration com `DATABASE_URL=... node apps/server/scripts/apply-sql.mjs apps/server/prisma/migrations/20260101000000_init/migration.sql`).

## Como testar o multiplayer em duas janelas

1. Com `npm run dev` rodando, abra **http://localhost:5173** em uma janela normal e em uma **janela anônima** (cada uma tem sua própria sessão de convidado).
2. Janela 1: digite um nome → **Criar sala** (participantes: 2, bots: 0). Anote o código (ou clique em **Copiar convite**).
3. Janela 2: digite outro nome → **Entrar em sala** e informe o código (ou abra o link de convite `/entrar/CODIGO`).
4. Os dois veem o mesmo lobby. Na janela 1 clique em **Iniciar leilão**.
5. Dê lances nas duas janelas: o maior lance, o líder, o cronômetro e o histórico aparecem iguais nas duas; ao fim, o orçamento e o elenco do vencedor atualizam nas duas.
6. **Atualize uma das janelas (F5)** no meio do leilão: ela reconecta sozinha e volta ao mesmo estado.
7. Ao fim do leilão, monte o time, e a janela 1 clica em **Iniciar campeonato → Simular tudo**. Os resultados aparecem iguais nas duas.

Para ver o mesmo fluxo **sem abrir o navegador**: `npm run demo:multiplayer` (sobe o servidor, conecta 3 clientes Socket.IO reais e imprime a partida passo a passo; com `DATABASE_URL` definida, grava no PostgreSQL).

## Testes e verificações

| Comando | O que roda |
|---|---|
| `npm run lint` | ESLint (TypeScript, hooks do React) em todo o monorepo |
| `npm run typecheck` | `tsc` em modo `strict` nos 3 pacotes |
| `npm test` | Vitest: regras compartilhadas, motor de jogo, bots, `GameService`, HTTP + Socket.IO (clientes reais), configuração e componentes React |
| `npm run test:db` | Testes de integração contra **PostgreSQL real** (sobe um banco embutido, aplica a migration, roda e desliga). Com Docker/PostgreSQL próprio: `TEST_DATABASE_URL=... npx vitest run test/prisma-repository.test.ts` em `apps/server` |
| `npm run build` | Build do cliente (Vite) e do servidor (esbuild → `apps/server/dist`) |
| `npm run test:e2e` | Playwright (desktop, tablet e smartphone): fluxos A, B, C e D contra o servidor de produção |

E2E: rode `npx playwright install chromium` uma vez (em `apps/client`). Se o seu ambiente não puder baixar navegadores do CDN do Playwright, use `E2E_USE_SPARTICUZ=1 npm run test:e2e` (usa o Chromium empacotado em `@sparticuz/chromium`). Os testes sobem o servidor sozinhos em uma porta própria, com o leilão acelerado por variáveis `GAME_*`.

### Resultados reais desta entrega

As saídas completas estão em [`docs/evidencias/`](docs/evidencias). Resumo (executado neste ambiente, Node 22):

| Verificação | Resultado real |
|---|---|
| `npm run lint` | ✅ 0 erros, 0 avisos (`docs/evidencias/lint.txt`) |
| `npm run typecheck` | ✅ 3 pacotes, `strict` (`typecheck.txt`) |
| `npm test` | ✅ **94 testes passando**: 18 regras compartilhadas, 17 componentes React, 59 servidor (22 motor/bots, 22 `GameService`, 10 HTTP + Socket.IO com clientes reais, 5 configuração). 5 testes de PostgreSQL ficam ignorados aqui por exigirem banco (`test.txt`) |
| `npm run test:db` | ✅ **5/5 contra PostgreSQL 17.5 real**: catálogo, partida inteira persistida e recuperada idêntica em "servidor novo", estatísticas do jogador, leilão retomado com timer, restrições do banco (`test-db.txt`) |
| `npm run build` | ✅ cliente (Vite) e servidor (esbuild); o bundle `node dist/index.js` foi iniciado e serviu a API e o cliente (`build.txt`) |
| `npm run test:e2e` | ✅ **5/5 em Chromium real**: Fluxo A (contra bots), Fluxos B+C (2 janelas, sincronização, recarregar a página), Fluxo D em desktop 1280×800, tablet 820×1180 e smartphone 390×844 (`e2e-playwright.txt`, capturas em `screenshots/`) |
| `npm run demo:multiplayer` | ✅ 3 clientes Socket.IO: lobby idêntico, `NOT_HOST` recusado, 19 contratações sem repetição, estado e resultados idênticos nos dois clientes (`demo-multiplayer.txt`) |

Bugs que os testes pegaram e foram corrigidos durante o desenvolvimento: SPA fallback quebrado com `CLIENT_DIST` relativo, `.env` não era carregado, bots gastando até 45% do orçamento em um único personagem, avisos empilhados cobrindo a tela no celular e controles de lance fora da primeira tela no celular.

## Build e deploy

```bash
npm ci
npm run build                          # cliente em apps/client/dist, servidor em apps/server/dist
export NODE_ENV=production
export SESSION_SECRET="$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")"
export DATABASE_URL="postgresql://usuario:senha@host:5432/anime_strikers?schema=public"
export CLIENT_ORIGIN="https://seu-dominio.com"
export CLIENT_DIST=./apps/client/dist
npm run db:migrate                     # aplica as migrations
npm run db:seed                        # opcional (o servidor também carrega o catálogo)
node apps/server/dist/index.js         # serve API, WebSocket e o cliente na mesma porta (PORT, padrão 3001)
```

Notas de produção: coloque o servidor atrás de HTTPS (o Helmet envia CSP com `upgrade-insecure-requests` em produção); `SESSION_SECRET` é obrigatório; os WebSockets precisam passar pelo proxy reverso (`Upgrade`/`Connection`); uma instância por banco (o estado dos leilões em andamento vive em memória e é recuperado do banco se o processo reiniciar).

## Estrutura do projeto

```
anime-strikers/
├── apps/
│   ├── client/            React + Vite + Tailwind (src/components, pages, layouts, hooks, services, stores, socket)
│   │   ├── e2e/           testes Playwright (flows.spec.ts, responsive.spec.ts)
│   │   └── test/          testes de componentes (Vitest + Testing Library)
│   └── server/            Express + Socket.IO + Prisma
│       ├── prisma/        schema.prisma, migrations/, seed.ts
│       ├── scripts/       build.mjs, demo-multiplayer.ts, embedded-postgres.sh, test-db.sh, apply-sql.mjs
│       ├── src/           app, config, socket/, routes/, services/, game-engine/, bots/, repositories/, types/
│       └── test/          unitários, integração (HTTP + Socket.IO) e PostgreSQL real
├── packages/shared/       tipos, protocolo, schemas Zod, catálogo (56 personagens), OVR, sinergia, escalação
├── docs/                  ARQUITETURA.md, REGRAS_DO_JOGO.md, evidencias/ (saídas reais e capturas de tela)
├── docker-compose.yml     PostgreSQL 16
├── .env.example
├── eslint.config.js
└── package.json           workspaces + scripts
```

## Limitações conhecidas

- **`prisma migrate deploy` não foi executado aqui:** o ambiente de desenvolvimento não consegue baixar o `schema-engine` do Prisma. A migration (`prisma/migrations/20260101000000_init/migration.sql`) foi **escrita à mão**, aplicada a um PostgreSQL 17 real com `pg` e exercitada por 5 testes de integração, mas o Prisma não a comparou com o schema. Se você alterar o schema, gere novas migrations normalmente com `prisma migrate dev`; se `migrate dev` apontar diferenças na primeira vez, gere a migration de ajuste.
- **O `docker-compose.yml` não foi executado** (sem Docker no ambiente). Ele só declara um PostgreSQL 16 com as credenciais do `.env.example`.
- **Uma instância de servidor por banco.** Não há escala horizontal (os timers de leilão vivem no processo). Para escalar seria preciso um adaptador Redis do Socket.IO e coordenação dos timers.
- **Convidados apenas:** não há contas com senha; a identidade é um token no navegador (limpar os dados do navegador perde o histórico). A arquitetura já separa `GuestPlayer` para evoluir.
- **Arte:** os avatares são ilustrações geométricas geradas por código (originais, mas simples). O catálogo aceita imagens autorizadas no futuro, mas isso ainda não foi implementado na interface.
- **Sem animações com Framer Motion:** os efeitos (brilho, partículas, borda animada) usam CSS e respeitam movimento reduzido.
- **Playwright usa o Chromium empacotado** neste ambiente; em outros navegadores (Firefox, WebKit) os E2E não foram executados.
- Se um participante nunca voltar, a partida continua para os demais, mas as ações dele (ex.: escalação) ficam como a escalação automática.

## Próximas melhorias recomendadas

1. Contas persistentes (e-mail/senha com argon2, recuperação) e ranking global.
2. Upload/curadoria de ilustrações autorizadas e um painel para cadastrar universos e personagens.
3. Estratégias táticas por partida (pressão, contra-ataque) e evolução/XP de personagens.
4. Adaptador Redis para Socket.IO e fila de timers para múltiplas instâncias.
5. Modo torneio com mata-mata, trocas entre treinadores e leilões de reservas.
6. Testes visuais (screenshots de referência) e execução de E2E em Firefox/WebKit no CI.
