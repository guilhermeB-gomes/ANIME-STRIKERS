/**
 * Demonstração reproduzível do multiplayer: sobe o servidor, conecta 3 clientes Socket.IO reais
 * (2 humanos simulados + 1 bot do servidor) e imprime a partida passo a passo.
 * Uso: npm run demo:multiplayer   (DATABASE_URL opcional: com ela grava no PostgreSQL)
 */
import { io as connect, type Socket } from 'socket.io-client';
import { getCharacter, mulberry32, type Ack, type AuctionView, type RoomView, type TeamView, type TournamentView } from '@strikers/shared';
import { createApp } from '../src/app';
import { decideBid } from '../src/bots/bot-brain';
import { loadConfig } from '../src/config';
import { MemoryRepository } from '../src/repositories/memory';
import type { GameRepository } from '../src/repositories/types';

const t0 = Date.now();
const log = (msg: string) => console.log(`[${((Date.now() - t0) / 1000).toFixed(1).padStart(5)}s] ${msg}`);

interface Player {
  name: string;
  socket: Socket;
  token: string;
  room: RoomView | null;
  auction: AuctionView | null;
  teams: TeamView[];
  tournament: TournamentView | null;
  lastBidFor: string;
}

function emit<T = undefined>(p: Player, event: string, payload?: unknown): Promise<Ack<T>> {
  return new Promise((resolve) => p.socket.emit(event, payload, resolve));
}

async function until(cond: () => boolean, label: string, timeoutMs = 180_000): Promise<void> {
  const start = Date.now();
  while (!cond()) {
    if (Date.now() - start > timeoutMs) throw new Error(`Timeout: ${label}`);
    await new Promise((r) => setTimeout(r, 20));
  }
}

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  let repo: GameRepository = new MemoryRepository();
  if (url) {
    const { createPrismaRepository } = await import('../src/repositories/prisma');
    repo = await createPrismaRepository(url);
    log('Persistência: PostgreSQL');
  } else {
    log('Persistência: memória (defina DATABASE_URL para usar PostgreSQL)');
  }
  const app = createApp({
    config: loadConfig({ NODE_ENV: 'development', SESSION_SECRET: 'demo-secret-with-more-than-16-chars' }),
    repo,
    httpLimits: { global: 10_000, guests: 1_000 },
    game: { auctionDurationMs: 1_500, intermissionMs: 250, firstAuctionDelayMs: 400, antiSnipeWindowMs: 250, antiSnipeExtensionMs: 300, botDelayScale: 0.06 },
  });
  await new Promise<void>((resolve) => app.httpServer.listen(0, resolve));
  const addr = app.httpServer.address();
  const base = `http://127.0.0.1:${typeof addr === 'object' && addr ? addr.port : 0}`;
  log(`Servidor no ar em ${base}`);

  const makePlayer = async (name: string): Promise<Player> => {
    const res = await fetch(`${base}/api/guests`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name }) });
    const { token } = (await res.json()) as { token: string };
    const socket = connect(base, { auth: { token }, transports: ['websocket'], forceNew: true });
    const p: Player = { name, socket, token, room: null, auction: null, teams: [], tournament: null, lastBidFor: '' };
    socket.on('room:state', (r: RoomView) => (p.room = r));
    socket.on('auction:state', (a: AuctionView | null) => (p.auction = a));
    socket.on('teams:state', (t: TeamView[]) => (p.teams = t));
    socket.on('tournament:state', (t: TournamentView | null) => (p.tournament = t));
    await new Promise<void>((resolve) => socket.once('connect', () => resolve()));
    log(`${name} conectou (convidado autenticado por token assinado)`);
    return p;
  };

  const ana = await makePlayer('Ana');
  const beto = await makePlayer('Beto');
  const humans = [ana, beto];
  const nameOf = (id: string | null) => ana.room?.participants.find((p) => p.id === id)?.name ?? '—';

  const created = await emit<{ code: string }>(ana, 'room:create', { mode: 'multi', maxPlayers: 3, botSlots: 1, botLevel: 'NORMAL' });
  if (!created.ok) throw new Error(created.error.message);
  log(`Ana criou a sala. Código gerado: ${created.data.code}`);
  const joined = await emit(beto, 'room:join', { code: created.data.code });
  log(`Beto entrou pelo código: ${joined.ok ? 'ok' : joined.error.message}`);
  await until(() => humans.every((h) => h.room?.participants.length === 3), 'lobby');
  log(`Lobby idêntico para todos: ${ana.room?.participants.map((p) => `${p.name}${p.isHost ? ' (anfitrião)' : ''}${p.isBot ? ' [bot]' : ''}`).join(', ')}`);
  const notHost = await emit(beto, 'room:start', {});
  log(`Beto (não anfitrião) tenta iniciar: ${notHost.ok ? 'ok?!' : `recusado → ${notHost.error.code}`}`);

  // Humanos simulados disputam usando a mesma heurística dos bots (apenas visão pública + próprio orçamento).
  const strategy = (p: Player) => {
    const a = p.auction;
    const me = p.room?.participants.find((x) => x.id === p.room?.youId);
    if (!a || !me || a.status !== 'ACTIVE' || a.leaderId === me.id || p.lastBidFor === `${a.id}:${a.bids.length}`) return;
    const decision = decideBid(
      { level: p.name === 'Ana' ? 'DIFICIL' : 'NORMAL', character: getCharacter(a.characterId), minNextBid: a.minNextBid, budget: me.budget, roster: me.roster.map(getCharacter) },
      mulberry32(a.bids.length + a.index * 31 + p.name.length),
    );
    if (!decision) return;
    p.lastBidFor = `${a.id}:${a.bids.length}`;
    setTimeout(() => void emit(p, 'auction:bid', { auctionId: a.id, amount: decision.amount }), decision.delayMs * 0.06);
  };
  const timer = setInterval(() => humans.forEach(strategy), 40);

  const seen = new Set<string>();
  const reporter = setInterval(() => {
    const a = ana.auction;
    if (a?.status === 'CLOSED' && !seen.has(a.id)) {
      seen.add(a.id);
      const c = getCharacter(a.characterId);
      const result = a.winnerId ? `${nameOf(a.winnerId)} contratou por ${a.finalPrice} M (${a.bids.length} lances)` : 'sem lances';
      log(`Leilão ${String(a.index + 1).padStart(2)}/${a.total}: ${c.name} (${c.position}, OVR ${c.ovr}, base ${a.startingBid} M) → ${result}`);
    }
  }, 20);

  const started = await emit(ana, 'room:start', {});
  log(`Ana inicia o leilão: ${started.ok ? 'ok' : started.error.message}`);
  await until(() => humans.every((h) => h.room?.status === 'TEAM_BUILDING'), 'fim do leilão');
  clearInterval(timer);
  clearInterval(reporter);
  const a = ana.auction;
  if (a?.status === 'CLOSED' && !seen.has(a.id)) {
    const c = getCharacter(a.characterId);
    log(`Leilão ${a.index + 1}/${a.total}: ${c.name} → ${a.winnerId ? `${nameOf(a.winnerId)} por ${a.finalPrice} M` : 'sem lances'}`);
  }

  log('— Orçamentos e elencos ao fim do leilão (visão da Ana = visão do Beto) —');
  const same = JSON.stringify(ana.room?.participants) === JSON.stringify(beto.room?.participants);
  for (const p of ana.room?.participants ?? []) {
    const team = ana.teams.find((t) => t.participantId === p.id);
    log(`${p.name.padEnd(10)} orçamento ${String(p.budget).padStart(3)} M | gasto ${String(team?.roster.reduce((s, r) => s + r.price, 0)).padStart(3)} M | elenco ${p.roster.length} | força ${team?.profile.strength}`);
  }
  log(`Estado idêntico nos dois clientes: ${same ? 'SIM' : 'NÃO'}`);
  const owned = (ana.room?.participants ?? []).flatMap((p) => p.roster);
  log(`Personagens contratados: ${owned.length}, repetidos: ${owned.length - new Set(owned).size}`);

  await emit(ana, 'tournament:start', {});
  await until(() => humans.every((h) => h.tournament?.status === 'IN_PROGRESS'), 'campeonato');
  log('Campeonato iniciado (pontos corridos, turno único)');
  await emit(ana, 'tournament:playRound', { all: true });
  await until(() => humans.every((h) => h.tournament?.status === 'FINISHED'), 'resultados');
  const tour = ana.tournament as TournamentView;
  for (const m of tour.matches) {
    log(`Rodada ${m.round}: ${nameOf(m.homeId)} ${m.homeGoals} x ${m.awayGoals} ${nameOf(m.awayId)} | MVP: ${m.mvpCharacterId ? getCharacter(m.mvpCharacterId).name : '—'}`);
  }
  log('— Classificação final —');
  console.log('  #  Treinador   P   V  E  D  GP GC  SG');
  tour.standings.forEach((s, i) => {
    console.log(`  ${i + 1}  ${nameOf(s.participantId).padEnd(10)} ${String(s.points).padStart(2)}  ${String(s.wins).padStart(2)} ${String(s.draws).padStart(2)} ${String(s.losses).padStart(2)} ${String(s.goalsFor).padStart(3)} ${String(s.goalsAgainst).padStart(2)} ${String(s.goalDiff).padStart(3)}`);
  });
  log(`Resultados idênticos para os dois clientes: ${JSON.stringify(ana.tournament) === JSON.stringify(beto.tournament) ? 'SIM' : 'NÃO'}`);
  const sample = tour.matches[0]?.events.filter((e) => e.type !== 'ATAQUE').slice(0, 6) ?? [];
  log('Trecho narrado da 1ª partida:');
  for (const e of sample) console.log(`     ${String(e.minute).padStart(2)}' ${e.text}`);

  humans.forEach((h) => h.socket.disconnect());
  await app.close();
  log('Demonstração concluída.');
}

main().catch((error: unknown) => {
  console.error('Falha na demonstração:', error);
  process.exit(1);
});
