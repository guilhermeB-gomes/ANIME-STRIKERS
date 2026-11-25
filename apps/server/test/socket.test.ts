import { io as connect, type Socket } from 'socket.io-client';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { Ack, AuctionView, RoomView, TeamView, TournamentView } from '@strikers/shared';
import { createApp, type RunningApp } from '../src/app';
import { loadConfig } from '../src/config';
import { MemoryRepository } from '../src/repositories/memory';

let app: RunningApp;
let base: string;
const open: Socket[] = [];

beforeAll(async () => {
  app = createApp({
    config: loadConfig({ NODE_ENV: 'test', SESSION_SECRET: 'test-secret-with-more-than-16-chars' }),
    repo: new MemoryRepository(),
    httpLimits: { global: 1000, guests: 1000 },
    game: { auctionDurationMs: 150, intermissionMs: 20, firstAuctionDelayMs: 50, antiSnipeWindowMs: 20, antiSnipeExtensionMs: 100, botDelayScale: 0.004 },
  });
  await new Promise<void>((resolve) => app.httpServer.listen(0, resolve));
  const addr = app.httpServer.address();
  base = `http://127.0.0.1:${typeof addr === 'object' && addr ? addr.port : 0}`;
});
afterEach(() => {
  while (open.length) open.pop()?.disconnect();
});
afterAll(async () => {
  await app.close();
});

interface Guest {
  id: string;
  name: string;
  token: string;
}

async function newGuest(name: string): Promise<Guest> {
  const res = await fetch(`${base}/api/guests`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name }) });
  const body = (await res.json()) as { player: { id: string; name: string }; token: string };
  return { id: body.player.id, name: body.player.name, token: body.token };
}

class Client {
  room: RoomView | null = null;
  auction: AuctionView | null = null;
  teams: TeamView[] = [];
  tournament: TournamentView | null = null;
  notices: string[] = [];
  constructor(
    public readonly socket: Socket,
    public readonly guest: Guest,
  ) {
    socket.on('room:state', (r: RoomView) => (this.room = r));
    socket.on('auction:state', (a: AuctionView | null) => (this.auction = a));
    socket.on('teams:state', (t: TeamView[]) => (this.teams = t));
    socket.on('tournament:state', (t: TournamentView | null) => (this.tournament = t));
    socket.on('notice', (n: { message: string }) => this.notices.push(n.message));
  }
  emit<T = undefined>(event: string, payload?: unknown): Promise<Ack<T>> {
    return new Promise((resolve) => this.socket.emit(event, payload, resolve));
  }
  get me() {
    return this.room?.participants.find((p) => p.id === this.room?.youId);
  }
}

async function client(guest: Guest): Promise<Client> {
  const socket = connect(base, { auth: { token: guest.token }, transports: ['websocket'], forceNew: true, reconnection: false });
  open.push(socket);
  await new Promise<void>((resolve, reject) => {
    socket.once('connect', () => resolve());
    socket.once('connect_error', (e) => reject(e));
  });
  return new Client(socket, guest);
}

async function until(cond: () => boolean, label: string, timeoutMs = 8000): Promise<void> {
  const start = Date.now();
  while (!cond()) {
    if (Date.now() - start > timeoutMs) throw new Error(`Timeout esperando: ${label}`);
    await new Promise((r) => setTimeout(r, 10));
  }
}

async function room(names: string[], settings = { maxPlayers: 4, botSlots: 0, botLevel: 'NORMAL' as const }) {
  const guests = await Promise.all(names.map(newGuest));
  const clients = await Promise.all(guests.map(client));
  const [host, ...others] = clients as [Client, ...Client[]];
  const created = await host.emit<{ code: string }>('room:create', { mode: 'multi', ...settings });
  if (!created.ok) throw new Error(created.error.message);
  for (const c of others) {
    const joined = await c.emit<{ code: string }>('room:join', { code: created.data.code });
    if (!joined.ok) throw new Error(joined.error.message);
  }
  await until(() => clients.every((c) => c.room?.participants.filter((p) => !p.isBot).length === clients.length), 'lobby sincronizado');
  return { host, others, clients, code: created.data.code };
}

describe('HTTP', () => {
  it('health, cabeçalhos de segurança (Helmet) e 404 de rota desconhecida', async () => {
    const res = await fetch(`${base}/api/health`);
    expect(res.status).toBe(200);
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    expect(res.headers.get('x-powered-by')).toBeNull();
    expect((await fetch(`${base}/api/nada`)).status).toBe(404);
  });

  it('cria convidado com validação e CORS restrito à origem configurada', async () => {
    const ok = await fetch(`${base}/api/guests`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: '  Treinador Z  ' }) });
    expect(ok.status).toBe(201);
    const body = (await ok.json()) as { player: { name: string }; token: string };
    expect(body.player.name).toBe('Treinador Z');
    expect(body.token).toContain('.');
    const bad = await fetch(`${base}/api/guests`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: '<script>' }) });
    expect(bad.status).toBe(400);
    expect(((await bad.json()) as { error: { code: string } }).error.code).toBe('VALIDATION');
    const broken = await fetch(`${base}/api/guests`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{oops' });
    expect(broken.status).toBe(400);
    const allowed = await fetch(`${base}/api/health`, { headers: { origin: 'http://localhost:5173' } });
    expect(allowed.headers.get('access-control-allow-origin')).toBe('http://localhost:5173');
    const denied = await fetch(`${base}/api/health`, { headers: { origin: 'http://evil.example' } });
    expect(denied.headers.get('access-control-allow-origin')).toBeNull();
  });

  it('valida código de sala, exige token em /me e aplica rate limit ao criar convidados', async () => {
    expect((await fetch(`${base}/api/rooms/ab0I1`)).status).toBe(400);
    expect((await fetch(`${base}/api/rooms/ZZZZZ`)).status).toBe(404);
    expect((await fetch(`${base}/api/me`)).status).toBe(401);
    expect((await fetch(`${base}/api/me`, { headers: { authorization: 'Bearer forjado.token' } })).status).toBe(401);
    const g = await newGuest('Perfil');
    const me = await fetch(`${base}/api/me`, { headers: { authorization: `Bearer ${g.token}` } });
    expect(me.status).toBe(200);
    expect(((await me.json()) as { player: { wins: number } }).player.wins).toBe(0);
    // Instância separada com limite baixo de criação de convidados.
    const strict = createApp({
      config: loadConfig({ NODE_ENV: 'test', SESSION_SECRET: 'test-secret-with-more-than-16-chars' }),
      repo: new MemoryRepository(),
      httpLimits: { global: 1000, guests: 3 },
    });
    await new Promise<void>((resolve) => strict.httpServer.listen(0, resolve));
    const addr = strict.httpServer.address();
    const strictBase = `http://127.0.0.1:${typeof addr === 'object' && addr ? addr.port : 0}`;
    const statuses: number[] = [];
    for (let i = 0; i < 6; i++) {
      const r = await fetch(`${strictBase}/api/guests`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: `Spam ${i}` }) });
      statuses.push(r.status);
    }
    expect(statuses.slice(0, 3)).toEqual([201, 201, 201]);
    expect(statuses.slice(3)).toEqual([429, 429, 429]);
    await strict.close();
  });
});

describe('autenticação do socket', () => {
  it('recusa conexão sem token e com token forjado', async () => {
    for (const auth of [{}, { token: 'abc' }, { token: 'id-falso.assinatura' }]) {
      const socket = connect(base, { auth, transports: ['websocket'], forceNew: true, reconnection: false });
      open.push(socket);
      const err = await new Promise<Error>((resolve) => socket.once('connect_error', resolve));
      expect(err.message).toBe('UNAUTHENTICATED');
    }
  });
});

describe('multiplayer (3 jogadores reais)', () => {
  it('cria sala, entra por código, todos veem o mesmo lobby, e erros de entrada são amigáveis', async () => {
    const { host, others, clients, code } = await room(['Ana', 'Beto', 'Caio']);
    expect(code).toMatch(/^[A-Z2-9]{5}$/);
    for (const c of clients) expect(c.room?.participants.map((p) => p.name)).toEqual(['Ana', 'Beto', 'Caio']);
    expect(host.room?.hostId).toBe(host.room?.youId);
    expect(others[0]?.room?.hostId).toBe(host.room?.youId);
    expect(new Set(clients.map((c) => c.room?.youId)).size).toBe(3);

    const extra = await client(await newGuest('Dani'));
    const missing = await extra.emit('room:join', { code: 'ZZZZZ' });
    expect(missing).toMatchObject({ ok: false, error: { code: 'ROOM_NOT_FOUND' } });
    const invalid = await extra.emit('room:join', { code: '123' });
    expect(invalid).toMatchObject({ ok: false, error: { code: 'VALIDATION' } });
    await host.emit('room:settings', { maxPlayers: 3, botSlots: 0, botLevel: 'NORMAL' });
    expect(await extra.emit('room:join', { code })).toMatchObject({ ok: false, error: { code: 'ROOM_FULL' } });
    expect(await others[0]?.emit('room:start', {})).toMatchObject({ ok: false, error: { code: 'NOT_HOST' } });
  });

  it('leilão sincronizado: mesmo estado para todos, lances simultâneos resolvidos de forma única, orçamento protegido', async () => {
    const { host, others, clients } = await room(['Ana', 'Beto', 'Caio']);
    const [beto, caio] = others as [Client, Client];
    expect(await host.emit('room:start', {})).toMatchObject({ ok: true });
    await until(() => clients.every((c) => c.auction?.status === 'ACTIVE'), 'primeiro leilão ativo');

    const views = clients.map((c) => c.auction as AuctionView);
    expect(new Set(views.map((v) => v.id)).size).toBe(1);
    expect(new Set(views.map((v) => v.characterId)).size).toBe(1);
    const a = views[0] as AuctionView;
    expect(Math.abs(a.serverNow - Date.now())).toBeLessThan(2000);
    expect(a.endsAt).toBeGreaterThan(a.serverNow);

    // Dois lances simultâneos com o mesmo valor: exatamente um é aceito.
    const [r1, r2] = await Promise.all([beto.emit('auction:bid', { auctionId: a.id, amount: a.startingBid }), caio.emit('auction:bid', { auctionId: a.id, amount: a.startingBid })]);
    expect([r1.ok, r2.ok].filter(Boolean)).toHaveLength(1);
    const loser = r1.ok ? r2 : r1;
    expect(loser).toMatchObject({ ok: false, error: { code: 'BID_TOO_LOW' } });
    await until(() => clients.every((c) => c.auction?.bids.length === 1), 'lance propagado');
    expect(new Set(clients.map((c) => c.auction?.leaderId)).size).toBe(1);

    // Lance acima do orçamento, payload malformado e campo extra malicioso.
    expect(await host.emit('auction:bid', { auctionId: a.id, amount: 5000 })).toMatchObject({ ok: false, error: { code: 'VALIDATION' } });
    expect(await host.emit('auction:bid', { auctionId: a.id, amount: 101 })).toMatchObject({ ok: false, error: { code: 'INSUFFICIENT_BUDGET' } });
    expect(await host.emit('auction:bid', { auctionId: a.id, amount: '5' })).toMatchObject({ ok: false, error: { code: 'VALIDATION' } });
    expect(await host.emit('auction:bid', { auctionId: 'falso', amount: 5 })).toMatchObject({ ok: false, error: { code: 'AUCTION_MISMATCH' } });
    const sneaky = await host.emit('auction:bid', { auctionId: a.id, amount: a.startingBid + 1, budget: 9999, winner: true });
    expect(sneaky.ok).toBe(true);
    expect(host.me?.budget).toBe(100);

    // Comandos inventados não alteram nada.
    host.socket.emit('room:setBudget', { budget: 9999 });
    host.socket.emit('auction:forceWin', { auctionId: a.id });
    await new Promise((r) => setTimeout(r, 30));
    expect(host.me?.budget).toBe(100);

    // Encerramento automático: todos veem o mesmo vencedor, orçamento descontado e personagem no elenco.
    await until(() => clients.every((c) => c.auction?.status === 'CLOSED' && c.auction.id === a.id), 'leilão encerrado');
    const closed = host.auction as AuctionView;
    expect(closed.winnerId).toBe(host.room?.youId);
    expect(closed.finalPrice).toBe(a.startingBid + 1);
    await until(() => clients.every((c) => c.room?.participants.find((p) => p.id === closed.winnerId)?.budget === 100 - (a.startingBid + 1)), 'orçamento sincronizado');
    for (const c of clients) {
      expect(c.room?.participants.find((p) => p.id === closed.winnerId)?.roster).toEqual([a.characterId]);
      expect(c.room?.participants.filter((p) => p.id !== closed.winnerId).every((p) => p.budget === 100)).toBe(true);
    }
    expect(host.notices.some((m) => m.includes('contratou'))).toBe(true);
  });

  it('anti-sniping vale no servidor: lance na janela final estende o prazo para todos', async () => {
    const { host, others, clients } = await room(['Ana', 'Beto']);
    await host.emit('room:start', {});
    await until(() => clients.every((c) => c.auction?.status === 'ACTIVE'), 'leilão ativo');
    const a = host.auction as AuctionView;
    await new Promise((r) => setTimeout(r, Math.max(0, a.endsAt - Date.now() - 10)));
    const res = await (others[0] as Client).emit('auction:bid', { auctionId: a.id, amount: a.startingBid });
    if (res.ok) {
      await until(() => (host.auction?.id === a.id ? host.auction.endsAt > a.endsAt : true), 'prazo estendido');
      if (host.auction?.id === a.id) expect(host.auction.endsAt).toBe(a.endsAt + 100);
    } else {
      expect(res.error.code).toBe('AUCTION_CLOSED');
    }
  });

  it('desconexão não para o leilão e a reconexão recupera o estado da sessão', async () => {
    const { host, others, clients } = await room(['Ana', 'Beto']);
    const beto = others[0] as Client;
    await host.emit('room:start', {});
    await until(() => clients.every((c) => c.auction?.status === 'ACTIVE'), 'leilão ativo');
    const first = host.auction as AuctionView;
    const betoId = beto.room?.youId;
    beto.socket.disconnect();
    await until(() => host.room?.participants.find((p) => p.id === betoId)?.connected === false, 'desconexão visível');
    const res = await host.emit('auction:bid', { auctionId: first.id, amount: first.startingBid });
    expect(res.ok).toBe(true);
    await until(() => host.auction?.id === first.id && host.auction.status === 'CLOSED', 'leilão encerra sem o Beto');

    const back = await client(beto.guest);
    await until(() => back.room !== null && back.auction !== null && back.teams.length === 2, 'snapshot na reconexão');
    expect(back.room?.youId).toBe(betoId);
    expect(back.room?.status).toBe('AUCTION');
    expect(back.me?.connected).toBe(true);
    expect(back.room?.participants.find((p) => p.isHost)?.roster).toEqual(host.room?.participants.find((p) => p.isHost)?.roster);
    await until(() => host.room?.participants.find((p) => p.id === betoId)?.connected === true, 'reconexão visível');
    expect(back.room?.auctionIndex).toBeGreaterThanOrEqual(1);
    expect(host.room?.participants.find((p) => p.isHost)?.roster).toContain(first.characterId);
  });

  it('limita a taxa de lances por jogador', async () => {
    const { host, clients } = await room(['Ana', 'Beto']);
    await host.emit('room:start', {});
    await until(() => clients.every((c) => c.auction?.status === 'ACTIVE'), 'leilão ativo');
    const a = host.auction as AuctionView;
    const results = await Promise.all(Array.from({ length: 30 }, () => host.emit('auction:bid', { auctionId: a.id, amount: 1 })));
    expect(results.some((r) => !r.ok && r.error.code === 'RATE_LIMITED')).toBe(true);
  });

  it('partida completa com 2 humanos + 1 bot: leilão, escalação, campeonato e resultados sincronizados', async () => {
    const { host, others, clients } = await room(['Ana', 'Beto'], { maxPlayers: 3, botSlots: 1, botLevel: 'NORMAL' });
    const beto = others[0] as Client;
    expect(host.room?.participants).toHaveLength(3);
    expect(await host.emit('room:start', {})).toMatchObject({ ok: true });
    await until(() => clients.every((c) => c.room?.status === 'TEAM_BUILDING'), 'fim do leilão', 30_000);

    const rooms = clients.map((c) => c.room as RoomView);
    expect(rooms[1]?.participants).toEqual(rooms[0]?.participants);
    const everyone = rooms[0]?.participants ?? [];
    const owned = everyone.flatMap((p) => p.roster);
    expect(new Set(owned).size).toBe(owned.length);
    for (const p of everyone) {
      expect(p.budget).toBeGreaterThanOrEqual(0);
      expect(p.roster.length).toBeGreaterThanOrEqual(5);
    }
    const mine = host.teams.find((t) => t.participantId === host.room?.youId) as TeamView;
    const ids = mine.roster.map((r) => r.characterId);

    const bad = await host.emit('team:setLineup', { formation: 'ofensiva', lineup: ['naruto-gaara', null, null, null, null].map((x) => (ids.includes(x as string) ? 'nao-existe' : x)) });
    expect(bad).toMatchObject({ ok: false, error: { code: 'INVALID_LINEUP' } });
    const lineup = [...mine.lineup].reverse();
    expect(await host.emit('team:setLineup', { formation: 'defensiva', lineup })).toMatchObject({ ok: true });
    await until(() => beto.teams.find((t) => t.participantId === host.room?.youId)?.formation === 'defensiva', 'escalação visível para todos');
    expect(await beto.emit('tournament:start', {})).toMatchObject({ ok: false, error: { code: 'NOT_HOST' } });
    expect(await host.emit('tournament:start', {})).toMatchObject({ ok: true });
    await until(() => clients.every((c) => c.tournament?.status === 'IN_PROGRESS'), 'campeonato iniciado');
    expect(await host.emit('team:setLineup', { formation: 'ofensiva', lineup })).toMatchObject({ ok: false, error: { code: 'WRONG_PHASE' } });
    expect(await beto.emit('tournament:playRound', {})).toMatchObject({ ok: false, error: { code: 'NOT_HOST' } });

    expect(await host.emit('tournament:playRound', {})).toMatchObject({ ok: true });
    await until(() => clients.every((c) => c.tournament?.roundsPlayed === 1), 'rodada 1 sincronizada');
    expect(await host.emit('tournament:playRound', { all: true })).toMatchObject({ ok: true });
    await until(() => clients.every((c) => c.tournament?.status === 'FINISHED'), 'campeonato encerrado');
    expect(clients.every((c) => c.room?.status === 'FINISHED')).toBe(true);
    const t0 = host.tournament as TournamentView;
    expect(beto.tournament).toEqual(t0);
    expect(t0.matches).toHaveLength(3);
    expect(t0.standings.map((s) => s.played)).toEqual([2, 2, 2]);
    expect(t0.matches.every((m) => m.events.length > 5 && m.events[0]?.type === 'INICIO')).toBe(true);
    const me = await fetch(`${base}/api/me`, { headers: { authorization: `Bearer ${host.guest.token}` } });
    const profile = (await me.json()) as { player: { wins: number; draws: number; losses: number }; history: unknown[] };
    expect(profile.player.wins + profile.player.draws + profile.player.losses).toBe(2);
    expect(profile.history).toHaveLength(2);
  }, 45_000);
});
