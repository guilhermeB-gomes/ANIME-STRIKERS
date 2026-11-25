import pg from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ABILITIES, ANIMES, CHARACTERS } from '@strikers/shared';
import { type PrismaRepository, createPrismaRepository } from '../src/repositories/prisma';
import { GameService } from '../src/services/game-service';
import { FakeClock, SpyBroadcaster, alice, bob } from './helpers';

/**
 * Integração com PostgreSQL REAL. Só roda quando TEST_DATABASE_URL está definida
 * (use `npm run test:db -w @strikers/server`, que sobe um Postgres e aplica a migration).
 */
const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)('PrismaRepository (PostgreSQL real)', () => {
  let repo: PrismaRepository;
  let raw: pg.Client;

  beforeAll(async () => {
    repo = await createPrismaRepository(url as string);
    raw = new pg.Client({ connectionString: url });
    await raw.connect();
  });
  afterAll(async () => {
    await repo.close();
    await raw.end();
  });
  beforeEach(async () => {
    await raw.query('TRUNCATE "Room", "GuestPlayer" CASCADE');
  });

  const build = (clock: FakeClock, spy = new SpyBroadcaster()) =>
    new GameService({
      repo,
      broadcaster: spy,
      now: clock.now,
      timers: clock.timers,
      config: { auctionDurationMs: 15_000, intermissionMs: 3_000, firstAuctionDelayMs: 3_000, botDelayScale: 1 },
    });

  async function playFullGame(service: GameService, clock: FakeClock) {
    const code = service.createRoom(alice, { mode: 'multi', maxPlayers: 3, botSlots: 1, botLevel: 'NORMAL' });
    service.joinRoom(bob, code);
    service.startGame(alice);
    for (let i = 0; i < 600 && service.getSnapshot(alice.playerId)?.room.status === 'AUCTION'; i++) {
      clock.advance(3_000);
      if (i % 10 === 0) await service.flush();
    }
    service.startTournament(alice);
    service.playRound(alice, true);
    await service.flush();
    return code;
  }

  it('carrega o catálogo completo e é idempotente', async () => {
    const count = async (t: string) => (await raw.query(`SELECT count(*)::int n FROM "${t}"`)).rows[0].n as number;
    expect(await count('Character')).toBe(CHARACTERS.length);
    expect(await count('Anime')).toBe(ANIMES.length);
    expect(await count('CharacterAbility')).toBe(Object.keys(ABILITIES).length);
    const again = await createPrismaRepository(url as string);
    await again.close();
    expect(await count('Character')).toBe(CHARACTERS.length);
    const row = (await raw.query(`SELECT ovr, velocidade, "secondaryPositions" FROM "Character" WHERE id = 'naruto-naruto-uzumaki'`)).rows[0];
    expect(row.ovr).toBe(CHARACTERS.find((c) => c.id === 'naruto-naruto-uzumaki')?.ovr);
    expect(row.secondaryPositions).toEqual(['MEI']);
  });

  it('persiste uma partida inteira e a recupera idêntica em um servidor novo', async () => {
    await repo.saveGuest({ id: alice.playerId, name: alice.name, wins: 0, draws: 0, losses: 0, createdAt: 1 });
    await repo.saveGuest({ id: bob.playerId, name: bob.name, wins: 0, draws: 0, losses: 0, createdAt: 2 });
    const clock = new FakeClock();
    const service = build(clock);
    const code = await playFullGame(service, clock);
    const before = service.getSnapshot(alice.playerId);
    expect(before?.room.status).toBe('FINISHED');
    expect(before?.tournament?.matches).toHaveLength(3);

    const clock2 = new FakeClock();
    const restarted = build(clock2);
    expect(await restarted.restore()).toBe(1);
    const after = restarted.getSnapshot(alice.playerId);
    // FINISHED não religa o jogador à sala; ele volta pelo código (reconexão explícita).
    expect(after).toBeNull();
    restarted.joinRoom(alice, code);
    const rejoined = restarted.getSnapshot(alice.playerId);
    expect(rejoined?.room.participants.map((p) => ({ ...p, connected: false }))).toEqual(before?.room.participants.map((p) => ({ ...p, connected: false })));
    expect(rejoined?.teams).toEqual(before?.teams);
    expect(rejoined?.tournament).toEqual(before?.tournament);
    expect(rejoined?.auction).toEqual({ ...(before?.auction as object), serverNow: rejoined?.auction?.serverNow });

    // Consistência no próprio banco: orçamento = 100 - gastos; elenco sem duplicatas na sala.
    const rows = (
      await raw.query(`SELECT p.name, p.budget, COALESCE(sum(tp.price),0)::int AS spent, count(tp.id)::int AS n
        FROM "RoomParticipant" p LEFT JOIN "Team" t ON t."participantId" = p.id LEFT JOIN "TeamPlayer" tp ON tp."teamId" = t.id GROUP BY p.id`)
    ).rows as { budget: number; spent: number; n: number }[];
    expect(rows).toHaveLength(3);
    for (const r of rows) {
      expect(r.budget + r.spent).toBe(100);
      expect(r.n).toBeGreaterThanOrEqual(5);
    }
    expect((await raw.query('SELECT count(*)::int n, count(DISTINCT "characterId")::int d FROM "TeamPlayer"')).rows[0]).toMatchObject({ n: rows.reduce((s, r) => s + r.n, 0) });
    expect((await raw.query('SELECT count(*)::int n FROM "Bid"')).rows[0].n).toBeGreaterThan(0);
    expect((await raw.query('SELECT count(*)::int n FROM "TournamentStanding"')).rows[0].n).toBe(3);
    expect((await raw.query('SELECT count(*)::int n FROM "MatchEvent"')).rows[0].n).toBeGreaterThan(30);
    restarted.shutdown();
    service.shutdown();
  });

  it('atualiza vitórias/empates/derrotas uma única vez e devolve o histórico', async () => {
    await repo.saveGuest({ id: alice.playerId, name: alice.name, wins: 0, draws: 0, losses: 0, createdAt: 1 });
    await repo.saveGuest({ id: bob.playerId, name: bob.name, wins: 0, draws: 0, losses: 0, createdAt: 2 });
    const clock = new FakeClock();
    const service = build(clock);
    await playFullGame(service, clock);
    const stats = async () => (await repo.getGuest(alice.playerId)) as { wins: number; draws: number; losses: number };
    const s = await stats();
    expect(s.wins + s.draws + s.losses).toBe(2); // 3 participantes, turno único: 2 jogos cada
    const snapshotRoom = (await repo.loadRecentRooms(0))[0];
    if (!snapshotRoom) throw new Error('sala não encontrada');
    await repo.recordResults(snapshotRoom);
    expect(await stats()).toEqual(s);
    const history = await repo.getHistory(alice.playerId, 10);
    expect(history).toHaveLength(2);
    expect(history.every((h) => ['V', 'E', 'D'].includes(h.result))).toBe(true);
    service.shutdown();
  });

  it('retoma um leilão em andamento com lances e relógio', async () => {
    await repo.saveGuest({ id: alice.playerId, name: alice.name, wins: 0, draws: 0, losses: 0, createdAt: 1 });
    await repo.saveGuest({ id: bob.playerId, name: bob.name, wins: 0, draws: 0, losses: 0, createdAt: 2 });
    const clock = new FakeClock();
    const service = build(clock);
    const code = service.createRoom(alice, { mode: 'multi', maxPlayers: 2, botSlots: 0, botLevel: 'NORMAL' });
    service.joinRoom(bob, code);
    service.startGame(alice);
    clock.advance(3_000);
    const a = service.getSnapshot(alice.playerId)?.auction;
    if (!a) throw new Error('sem leilão');
    service.placeBid(alice, { auctionId: a.id, amount: a.startingBid });
    service.placeBid(bob, { auctionId: a.id, amount: a.startingBid + 3 });
    await service.flush();
    service.shutdown();

    const clock2 = new FakeClock();
    clock2.t = clock.t;
    const restarted = build(clock2);
    await restarted.restore();
    const r = restarted.getSnapshot(bob.playerId);
    expect(r?.room.status).toBe('AUCTION');
    expect(r?.auction).toMatchObject({ id: a.id, currentBid: a.startingBid + 3, status: 'ACTIVE', endsAt: a.endsAt });
    expect(r?.auction?.bids.map((b) => b.amount)).toEqual([a.startingBid, a.startingBid + 3]);
    clock2.advance(15_000);
    await restarted.flush();
    const done = restarted.getSnapshot(bob.playerId);
    expect(done?.auction).toMatchObject({ status: 'CLOSED', finalPrice: a.startingBid + 3 });
    expect(done?.room.participants.find((p) => p.name === 'Bob')?.budget).toBe(100 - (a.startingBid + 3));
    restarted.shutdown();
  });

  it('o banco impede contratação duplicada, orçamento negativo e lance inválido', async () => {
    await repo.saveGuest({ id: alice.playerId, name: alice.name, wins: 0, draws: 0, losses: 0, createdAt: 1 });
    const clock = new FakeClock();
    const service = build(clock);
    service.createRoom(alice, { mode: 'solo', maxPlayers: 2, botSlots: 1, botLevel: 'FACIL' });
    await service.flush();
    const p = (await raw.query('SELECT id FROM "RoomParticipant" WHERE "isBot" = false')).rows[0].id as string;
    const room = (await raw.query('SELECT id FROM "Room"')).rows[0].id as string;
    const other = (await raw.query('SELECT id FROM "RoomParticipant" WHERE "isBot" = true')).rows[0].id as string;
    await raw.query(`INSERT INTO "TeamPlayer"(id,"teamId","roomId","characterId",price,"rosterIndex") VALUES ('x1','team-${p}','${room}','naruto-gaara',3,0)`);
    await expect(raw.query(`INSERT INTO "TeamPlayer"(id,"teamId","roomId","characterId",price,"rosterIndex") VALUES ('x2','team-${other}','${room}','naruto-gaara',3,0)`)).rejects.toThrow(/duplicate key/);
    await expect(raw.query(`UPDATE "RoomParticipant" SET budget = -1 WHERE id = '${p}'`)).rejects.toThrow(/budget_nonneg/);
    await expect(raw.query(`INSERT INTO "Auction"(id,"roomId","characterId",index,status,"startingBid","startedAt","endsAt") VALUES ('a1','${room}','inexistente',0,'ACTIVE',1,now(),now())`)).rejects.toThrow(/foreign key/);
    service.shutdown();
  });
});
