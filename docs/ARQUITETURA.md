# ANIME STRIKERS — Arquitetura

> Fan game não oficial, sem afiliação com as franquias citadas. Artes originais em SVG geradas por código; o catálogo aceita ilustrações autorizadas no futuro.

## 1. Visão geral

Monorepo npm workspaces:

| Pacote | Responsabilidade |
|---|---|
| `packages/shared` | Tipos, schemas Zod, protocolo Socket.IO, catálogo de 56 personagens e **regras puras** (OVR, sinergia, escalação). Usado por cliente e servidor |
| `apps/server` | Express + Socket.IO + Prisma/PostgreSQL. **Única autoridade** sobre salas, leilões, orçamento, partidas e campeonato |
| `apps/client` | React + Vite + Tailwind. Mostra o estado e envia *intenções* ("quero dar este lance"); nunca altera estado sozinho |

## 2. Servidor em camadas

```
socket/ , routes/   transporte: autentica, valida com Zod, limita taxa, delega
services/           GameService (casos de uso e estado), AuthService, views, rate-limiter
game-engine/        lógica pura sem I/O: regras de lance, fila, calendário/classificação, simulação
bots/               decisão de lances (somente informação pública)
repositories/       porta GameRepository + implementações Memory (testes/dev) e Prisma (PostgreSQL)
```

`game-engine` e `bots` não importam Express, Socket.IO nem Prisma, então são testados de forma determinística (RNG com seed).

**Estado:** o `GameService` mantém as salas em memória (rápido para tempo real) e **grava no banco a cada mudança**, em fila ordenada por sala. Ao iniciar, `restore()` recarrega as salas recentes (24 h) e **retoma os timers** (leilão em andamento, próximo leilão, bots). Erros de gravação são registrados e nunca engolidos.

**Concorrência:** a mutação de um lance é síncrona, e o Node processa um evento por vez. Lances simultâneos são ordenados pela chegada, sem lock explícito, e o banco ainda protege com `UNIQUE (roomId, characterId)` em `TeamPlayer`.

## 3. Identidade e sessão

1. `POST /api/guests { name }` cria um `GuestPlayer` e devolve `token = playerId.HMAC-SHA256(playerId)` (segredo `SESSION_SECRET`, comparação com `timingSafeEqual`).
2. O token fica no `localStorage` (apenas identidade). O handshake do Socket.IO o envia; sem token válido a conexão é recusada (`UNAUTHENTICATED`).
3. Cada jogador entra no canal privado `player:{id}`. Atualizar a página reconecta com o mesmo token; o servidor envia o estado da sala (reconexão), e o participante volta como "conectado".
4. Contas persistentes podem ser adicionadas depois ligando `GuestPlayer` a um `User` (senha com argon2).

## 4. Protocolo Socket.IO

Cliente → servidor (todos com *ack*, payload validado com Zod, limitados por taxa): `room:create`, `room:join`, `room:leave`, `room:settings`, `room:start`, `auction:bid`, `team:setLineup`, `tournament:start`, `tournament:playRound`.

Servidor → cliente: `room:state` (visão por jogador, com `youId`), `auction:state` (inclui `serverNow` e `endsAt`), `teams:state`, `tournament:state`, `notice`, `room:closed`.

Erros de domínio têm código estável (`ROOM_FULL`, `BID_TOO_LOW`, `INSUFFICIENT_BUDGET`, `NOT_HOST`, `RATE_LIMITED`...). Eventos desconhecidos são ignorados; campos extras são descartados pelo Zod.

## 5. Modelo de dados (PostgreSQL)

`GuestPlayer` · `Room` · `RoomParticipant` · `Anime` · `Character` · `CharacterAbility` · `Auction` · `Bid` · `Team` · `TeamPlayer` · `Match` · `MatchEvent` · `Tournament` · `TournamentStanding` (14 tabelas, `apps/server/prisma/schema.prisma`).

Restrições: `Room.code` único; `UNIQUE(roomId, playerId)` e `UNIQUE(roomId, joinOrder)` em participantes; `UNIQUE(roomId, index)` e `UNIQUE(roomId, characterId)` em leilões; **`UNIQUE(roomId, characterId)` em `TeamPlayer`** (sem contratação dupla); `CHECK (budget >= 0)`, `CHECK (amount > 0)`; chaves estrangeiras com `ON DELETE CASCADE` onde faz sentido.

Migration: `prisma/migrations/20260101000000_init/migration.sql`. O catálogo (`seed`) é carregado por `npm run db:seed` e também automaticamente na subida do servidor, se faltar.

## 6. Segurança

Zod em toda entrada (HTTP e Socket) · Helmet (CSP completo em produção) · CORS restrito a `CLIENT_ORIGIN` · rate limit HTTP por IP (global e criação de convidados) e por jogador em eventos de socket (`auction:bid`: 8 de rajada, 4/s) · corpo JSON limitado a 10 kB e pacote de socket a 10 kB · token HMAC · erros padronizados sem stack trace · segredos só em `.env` · `Notice` e visões enviadas contêm apenas dados públicos · o servidor ignora comandos que não conhece.

## 7. Cliente

Rotas: `/` (início), `/sala` (muda de tela pela fase da sala: lobby → leilão → escalação → campeonato), `/entrar/:code` (convite), `/como-jogar`, `/configuracoes`. Estado do jogo em um `GameProvider` (contexto) alimentado por eventos do servidor; avisos por toasts acessíveis (sem `alert()`); cronômetro do leilão calculado do relógio do servidor; `prefers-reduced-motion` e opção "Reduzir animações".

## 8. Como foi validado neste projeto

PostgreSQL real (17.5, binários do pacote npm `embedded-postgres`, sem Docker) para testes de integração e demonstração; Chromium real (`@sparticuz/chromium` + Playwright) para E2E. Os resultados reais estão em `docs/evidencias/`.
