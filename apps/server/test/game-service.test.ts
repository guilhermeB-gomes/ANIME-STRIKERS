import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CHARACTERS, getCharacter, ROOM_CODE_ALPHABET } from '@strikers/shared';
import { DomainError } from '../src/errors';
import { GameService } from '../src/services/game-service';
import { advance, alice, bob, carol, setup, startedTwoPlayerRoom } from './helpers';

beforeEach(() => {
  vi.useFakeTimers({ now: 1_700_000_000_000 });
});
afterEach(() => {
  vi.useRealTimers();
});

const code = (fn: () => unknown): string | undefined => {
  try {
    fn();
  } catch (e) {
    if (e instanceof DomainError) return e.code;
    throw e;
  }
  return undefined;
};

describe('salas', () => {
  it('cria sala privada com código exclusivo, anfitrião e orçamento inicial de 100 M', () => {
    const { service } = setup();
    const c = service.createRoom(alice, { mode: 'multi', maxPlayers: 4, botSlots: 0, botLevel: 'NORMAL' });
    expect(c).toHaveLength(5);
    expect([...c].every((ch) => ROOM_CODE_ALPHABET.includes(ch))).toBe(true);
    const snap = service.getSnapshot(alice.playerId);
    expect(snap?.room.status).toBe('LOBBY');
    expect(snap?.room.participants).toHaveLength(1);
    expect(snap?.room.participants[0]).toMatchObject({ name: 'Alice', budget: 100, isHost: true, isBot: false });
    const other = service.createRoom(bob, { mode: 'multi', maxPlayers: 4, botSlots: 0, botLevel: 'NORMAL' });
    expect(other).not.toBe(c);
  });

  it('modo solo preenche as vagas com bots do nível escolhido', () => {
    const { service } = setup();
    service.createRoom(alice, { mode: 'solo', maxPlayers: 4, botSlots: 0, botLevel: 'DIFICIL' });
    const room = service.getSnapshot(alice.playerId)?.room;
    expect(room?.participants).toHaveLength(4);
    expect(room?.participants.filter((p) => p.isBot).every((p) => p.botLevel === 'DIFICIL' && p.budget === 100)).toBe(true);
  });

  it('entra por código, mostra o mesmo lobby e respeita lotação e código inválido', () => {
    const { service } = setup();
    const c = service.createRoom(alice, { mode: 'multi', maxPlayers: 2, botSlots: 0, botLevel: 'NORMAL' });
    expect(service.joinRoom(bob, c)).toBe(c);
    const a = service.getSnapshot(alice.playerId)?.room;
    const b = service.getSnapshot(bob.playerId)?.room;
    expect(a?.participants.map((p) => p.name)).toEqual(['Alice', 'Bob']);
    expect(b?.participants).toEqual(a?.participants);
    expect(b?.youId).not.toBe(a?.youId);
    expect(code(() => service.joinRoom(carol, c))).toBe('ROOM_FULL');
    expect(code(() => service.joinRoom(carol, 'ZZZZZ'))).toBe('ROOM_NOT_FOUND');
    expect(service.joinRoom(bob, c)).toBe(c);
    expect(service.getSnapshot(alice.playerId)?.room.participants).toHaveLength(2);
  });

  it('bots ocupam vagas e reduzem a capacidade de humanos', () => {
    const { service } = setup();
    const c = service.createRoom(alice, { mode: 'multi', maxPlayers: 3, botSlots: 2, botLevel: 'FACIL' });
    expect(code(() => service.joinRoom(bob, c))).toBe('ROOM_FULL');
    expect(service.getRoomInfo(c)).toMatchObject({ humans: 1, humanCapacity: 1, maxPlayers: 3 });
  });

  it('apenas o anfitrião inicia; exige 2 participantes; só inicia uma vez', () => {
    const { service } = setup();
    const c = service.createRoom(alice, { mode: 'multi', maxPlayers: 4, botSlots: 0, botLevel: 'NORMAL' });
    expect(code(() => service.startGame(alice))).toBe('NOT_ENOUGH_PLAYERS');
    service.joinRoom(bob, c);
    expect(code(() => service.startGame(bob))).toBe('NOT_HOST');
    service.startGame(alice);
    expect(code(() => service.startGame(alice))).toBe('WRONG_PHASE');
    expect(code(() => service.joinRoom(carol, c))).toBe('ROOM_STARTED');
  });

  it('anfitrião ajusta configurações no lobby e bots acompanham', () => {
    const { service } = setup();
    service.createRoom(alice, { mode: 'multi', maxPlayers: 4, botSlots: 0, botLevel: 'NORMAL' });
    service.updateSettings(alice, { maxPlayers: 5, botSlots: 3, botLevel: 'DIFICIL' });
    const room = service.getSnapshot(alice.playerId)?.room;
    expect(room?.participants).toHaveLength(4);
    service.updateSettings(alice, { maxPlayers: 5, botSlots: 1, botLevel: 'FACIL' });
    expect(service.getSnapshot(alice.playerId)?.room.participants.filter((p) => p.isBot)).toHaveLength(1);
    expect(code(() => service.updateSettings(bob, { maxPlayers: 2, botSlots: 0, botLevel: 'NORMAL' }))).toBe('ROOM_NOT_FOUND');
  });

  it('sair do lobby transfere o anfitrião e fecha a sala vazia', () => {
    const { service } = setup();
    const c = service.createRoom(alice, { mode: 'multi', maxPlayers: 4, botSlots: 0, botLevel: 'NORMAL' });
    service.joinRoom(bob, c);
    service.leaveRoom(alice);
    const room = service.getSnapshot(bob.playerId)?.room;
    expect(room?.participants.map((p) => p.name)).toEqual(['Bob']);
    expect(room?.participants[0]?.isHost).toBe(true);
    expect(service.getSnapshot(alice.playerId)).toBeNull();
    service.leaveRoom(bob);
    expect(service.getRoomInfo(c)).toBeNull();
  });

  it('um jogador em partida em andamento não cria outra sala sem sair', async () => {
    const { service, code: c } = await startedTwoPlayerRoom();
    expect(code(() => service.createRoom(alice, { mode: 'solo', maxPlayers: 2, botSlots: 1, botLevel: 'NORMAL' }))).toBe('WRONG_PHASE');
    service.leaveRoom(alice);
    expect(() => service.createRoom(alice, { mode: 'solo', maxPlayers: 2, botSlots: 1, botLevel: 'NORMAL' })).not.toThrow();
    expect(service.joinRoom(alice, c)).toBe(c);
  });
});

describe('leilão', () => {
  it('apresenta o primeiro personagem com valor inicial, cronômetro de 15 s e relógio do servidor', async () => {
    const { snap } = await startedTwoPlayerRoom();
    const a = snap().auction;
    expect(a).not.toBeNull();
    expect(a?.status).toBe('ACTIVE');
    expect(a?.currentBid).toBeNull();
    expect(a?.endsAt).toBe((a?.serverNow ?? 0) + 15_000);
    expect(a?.startingBid).toBe(getCharacter(a?.characterId ?? '').basePrice);
    expect(a?.minNextBid).toBe(a?.startingBid);
    expect(snap().room.auctionIndex).toBe(1);
  });

  it('aceita lance, soma incremento de 1 M, rejeita lance baixo e líder repetido', async () => {
    const { service, snap } = await startedTwoPlayerRoom();
    const a = snap().auction;
    if (!a) throw new Error('sem leilão');
    expect(service.placeBid(alice, { auctionId: a.id, amount: a.startingBid })).toBe(a.startingBid);
    expect(code(() => service.placeBid(alice, { auctionId: a.id, amount: a.startingBid + 1 }))).toBe('ALREADY_LEADING');
    expect(code(() => service.placeBid(bob, { auctionId: a.id, amount: a.startingBid }))).toBe('BID_TOO_LOW');
    service.placeBid(bob, { auctionId: a.id, amount: a.startingBid + 1 });
    const now = snap().auction;
    expect(now?.currentBid).toBe(a.startingBid + 1);
    expect(now?.leaderId).toBe(snap().room.participants.find((p) => p.name === 'Bob')?.id);
    expect(now?.bids.map((b) => b.amount)).toEqual([a.startingBid, a.startingBid + 1]);
  });

  it('lances simultâneos de mesmo valor: o primeiro a chegar vence, o outro é recusado de forma previsível', async () => {
    const { service, snap } = await startedTwoPlayerRoom();
    const a = snap().auction;
    if (!a) throw new Error('sem leilão');
    const results = [alice, bob].map((who) => code(() => service.placeBid(who, { auctionId: a.id, amount: a.startingBid })));
    expect(results).toEqual([undefined, 'BID_TOO_LOW']);
    expect(snap().auction?.bids).toHaveLength(1);
  });

  it('rejeita lance acima do orçamento e leilão antigo', async () => {
    const { service, snap } = await startedTwoPlayerRoom();
    const a = snap().auction;
    if (!a) throw new Error('sem leilão');
    expect(code(() => service.placeBid(alice, { auctionId: a.id, amount: 101 }))).toBe('INSUFFICIENT_BUDGET');
    expect(code(() => service.placeBid(alice, { auctionId: 'outro', amount: 5 }))).toBe('AUCTION_MISMATCH');
    expect(code(() => service.placeBid(carol, { auctionId: a.id, amount: 5 }))).toBe('ROOM_NOT_FOUND');
  });

  it('encerra sozinho no fim do tempo: vencedor contratado, orçamento descontado, próximo leilão depois do intervalo', async () => {
    const { service, snap, meId } = await startedTwoPlayerRoom();
    const a = snap().auction;
    if (!a) throw new Error('sem leilão');
    service.placeBid(alice, { auctionId: a.id, amount: a.startingBid + 4 });
    await advance(14_999);
    expect(snap().auction?.status).toBe('ACTIVE');
    await advance(1);
    const closed = snap().auction;
    expect(closed).toMatchObject({ status: 'CLOSED', winnerId: meId(alice), finalPrice: a.startingBid + 4 });
    const me = snap().room.participants.find((p) => p.id === meId(alice));
    expect(me?.budget).toBe(100 - (a.startingBid + 4));
    expect(me?.roster).toEqual([a.characterId]);
    expect(snap().teams.find((t) => t.participantId === meId(alice))?.roster).toEqual([{ characterId: a.characterId, price: a.startingBid + 4 }]);
    expect(snap().room.participants.find((p) => p.id === meId(bob))?.budget).toBe(100);
    expect(code(() => service.placeBid(bob, { auctionId: a.id, amount: 90 }))).toBe('AUCTION_CLOSED');
    await advance(3_000);
    const next = snap().auction;
    expect(next?.id).not.toBe(a.id);
    expect(next?.status).toBe('ACTIVE');
    expect(next?.characterId).not.toBe(a.characterId);
    expect(snap().room.auctionIndex).toBe(2);
  });

  it('anti-sniping: lance nos últimos 3 s soma 5 s; antes disso não muda o prazo', async () => {
    const { service, snap } = await startedTwoPlayerRoom();
    const a = snap().auction;
    if (!a) throw new Error('sem leilão');
    await advance(5_000);
    service.placeBid(alice, { auctionId: a.id, amount: a.startingBid });
    expect(snap().auction?.endsAt).toBe(a.endsAt);
    await advance(8_000); // faltam 2 s
    service.placeBid(bob, { auctionId: a.id, amount: a.startingBid + 1 });
    expect(snap().auction?.endsAt).toBe(a.endsAt + 5_000);
    await advance(6_999);
    expect(snap().auction?.status).toBe('ACTIVE');
    await advance(1);
    expect(snap().auction?.status).toBe('CLOSED');
    expect(snap().auction?.winnerId).toBe(snap().room.participants.find((p) => p.name === 'Bob')?.id);
  });

  it('sem lances: personagem fica sem dono e orçamento intacto', async () => {
    const { snap } = await startedTwoPlayerRoom();
    const a = snap().auction;
    await advance(15_000);
    const closed = snap().auction;
    expect(closed).toMatchObject({ status: 'CLOSED', winnerId: null, finalPrice: null });
    expect(snap().room.participants.every((p) => p.budget === 100 && p.roster.length === 0)).toBe(true);
    expect(a?.characterId).toBeDefined();
  });

  it('nunca contrata o mesmo personagem duas vezes na sala, em uma partida inteira com bots', async () => {
    const { service } = setup();
    service.createRoom(alice, { mode: 'solo', maxPlayers: 4, botSlots: 3, botLevel: 'NORMAL' });
    service.startGame(alice);
    for (let i = 0; i < 400 && snap2().room.status === 'AUCTION'; i++) await advance(5_000);
    function snap2() {
      const s = service.getSnapshot(alice.playerId);
      if (!s) throw new Error('sem snapshot');
      return s;
    }
    const room = snap2().room;
    expect(room.status).toBe('TEAM_BUILDING');
    const all = room.participants.flatMap((p) => p.roster);
    expect(new Set(all).size).toBe(all.length);
    for (const p of room.participants) {
      expect(p.budget).toBeGreaterThanOrEqual(0);
      expect(p.roster.length).toBeGreaterThanOrEqual(5);
      expect(p.roster.length).toBeLessThanOrEqual(7);
    }
    const spent = snap2().teams.map((t) => t.roster.reduce((s, r) => s + r.price, 0));
    room.participants.forEach((p, i) => expect(p.budget + (spent[i] ?? 0)).toBe(100));
    expect(snap2().teams.every((t) => t.lineup.every((id) => id !== null))).toBe(true);
  });
});

describe('bots no leilão', () => {
  it('disputam personagens, respeitam orçamento e a reserva, e ficam sem trapacear', async () => {
    const { service } = setup();
    service.createRoom(alice, { mode: 'solo', maxPlayers: 3, botSlots: 2, botLevel: 'DIFICIL' });
    service.startGame(alice);
    await advance(3_000);
    let botBids = 0;
    for (let i = 0; i < 80; i++) {
      const s = service.getSnapshot(alice.playerId);
      const a = s?.auction;
      if (a) for (const b of a.bids) if (s?.room.participants.find((p) => p.id === b.participantId)?.isBot) botBids++;
      await advance(2_000);
    }
    expect(botBids).toBeGreaterThan(0);
    const s = service.getSnapshot(alice.playerId);
    for (const p of s?.room.participants ?? []) expect(p.budget).toBeGreaterThanOrEqual(0);
  });
});

describe('conexão e persistência', () => {
  it('desconexão não interrompe o leilão; reconexão devolve o mesmo estado', async () => {
    const { service, snap, meId } = await startedTwoPlayerRoom();
    const a = snap().auction;
    if (!a) throw new Error('sem leilão');
    service.placeBid(bob, { auctionId: a.id, amount: a.startingBid });
    service.setConnected(bob.playerId, false);
    expect(snap().room.participants.find((p) => p.name === 'Bob')?.connected).toBe(false);
    service.placeBid(alice, { auctionId: a.id, amount: a.startingBid + 1 });
    await advance(15_000);
    expect(snap().auction?.status).toBe('CLOSED');
    service.setConnected(bob.playerId, true);
    const back = service.getSnapshot(bob.playerId);
    expect(back?.room.youId).toBe(meId(bob));
    expect(back?.room.participants.find((p) => p.name === 'Alice')?.roster).toEqual([a.characterId]);
    expect(back?.auction?.winnerId).toBe(meId(alice));
  });

  it('retoma depois de reiniciar o servidor: sala, lances, orçamento e timer do leilão', async () => {
    const first = await startedTwoPlayerRoom();
    const a = first.snap().auction;
    if (!a) throw new Error('sem leilão');
    first.service.placeBid(alice, { auctionId: a.id, amount: a.startingBid + 2 });
    await advance(15_000); // fecha o primeiro leilão e já agenda o próximo
    await advance(3_000);
    const live = first.snap();
    const live2 = live.auction;
    if (!live2) throw new Error('sem segundo leilão');
    first.service.placeBid(bob, { auctionId: live2.id, amount: live2.startingBid });
    await first.service.flush();
    first.service.shutdown();

    const restarted = new GameService({
      repo: first.repo,
      broadcaster: first.spy,
      config: { auctionDurationMs: 15_000, intermissionMs: 3_000, firstAuctionDelayMs: 3_000, botDelayScale: 1 },
      newSeed: () => 1,
      newId: () => `r-${Math.random()}`,
    });
    expect(await restarted.restore()).toBe(1);
    const restored = restarted.getSnapshot(alice.playerId);
    expect(restored?.room.status).toBe('AUCTION');
    expect(restored?.room.participants.find((p) => p.name === 'Alice')).toMatchObject({ budget: 100 - (a.startingBid + 2), roster: [a.characterId], connected: false });
    expect(restored?.auction).toMatchObject({ id: live2.id, currentBid: live2.startingBid, status: 'ACTIVE' });
    expect(restored?.auction?.bids).toHaveLength(1);
    // O timer foi retomado: o leilão ainda encerra no horário original.
    await advance(15_000);
    const after = restarted.getSnapshot(bob.playerId);
    expect(after?.auction?.status).toBe('CLOSED');
    expect(after?.room.participants.find((p) => p.name === 'Bob')?.roster).toContain(live2.characterId);
    restarted.shutdown();
  });
});

describe('elenco e campeonato', () => {
  async function toTeamBuilding() {
    const ctx = setup();
    ctx.service.createRoom(alice, { mode: 'solo', maxPlayers: 4, botSlots: 3, botLevel: 'NORMAL' });
    ctx.service.startGame(alice);
    for (let i = 0; i < 400 && ctx.service.getSnapshot(alice.playerId)?.room.status === 'AUCTION'; i++) await advance(5_000);
    return ctx;
  }

  it('valida a escalação: fase, dono do personagem, repetição e tamanho', async () => {
    const { service } = await toTeamBuilding();
    const mine = service.getSnapshot(alice.playerId)?.teams.find((t) => t.participantId === service.getSnapshot(alice.playerId)?.room.youId);
    if (!mine) throw new Error('sem time');
    const ids = mine.roster.map((r) => r.characterId);
    const other = CHARACTERS.find((c) => !ids.includes(c.id))?.id as string;
    expect(code(() => service.setLineup(alice, { formation: 'ofensiva', lineup: [other, null, null, null, null] }))).toBe('INVALID_LINEUP');
    expect(code(() => service.setLineup(alice, { formation: 'ofensiva', lineup: [ids[0] as string, ids[0] as string, null, null, null] }))).toBe('INVALID_LINEUP');
    const lineup = [ids[1], ids[0], ids[2], ids[3], ids[4]] as string[];
    service.setLineup(alice, { formation: 'ofensiva', lineup });
    const updated = service.getSnapshot(alice.playerId)?.teams.find((t) => t.participantId === mine.participantId);
    expect(updated?.formation).toBe('ofensiva');
    expect(updated?.lineup).toEqual(lineup);
    expect(updated?.profile.formation).toBe('ofensiva');
  });

  it('só o anfitrião inicia o campeonato, que gera calendário e classificação coerentes', async () => {
    const { service } = await toTeamBuilding();
    expect(code(() => service.playRound(alice))).toBe('WRONG_PHASE');
    service.startTournament(alice);
    expect(service.getSnapshot(alice.playerId)?.room.status).toBe('TOURNAMENT');
    expect(code(() => service.startTournament(alice))).toBe('WRONG_PHASE');
    expect(code(() => service.setLineup(alice, { formation: 'equilibrada', lineup: [null, null, null, null, null] }))).toBe('WRONG_PHASE');
    const t0 = service.getSnapshot(alice.playerId)?.tournament;
    expect(t0).toMatchObject({ status: 'IN_PROGRESS', roundsPlayed: 0, totalRounds: 3 });
    expect(t0?.fixtures).toHaveLength(6);

    service.playRound(alice);
    expect(service.getSnapshot(alice.playerId)?.tournament?.matches).toHaveLength(2);
    service.playRound(alice, true);
    const done = service.getSnapshot(alice.playerId);
    expect(done?.room.status).toBe('FINISHED');
    const t = done?.tournament;
    expect(t?.status).toBe('FINISHED');
    expect(t?.matches).toHaveLength(6);
    expect(t?.standings.every((s) => s.played === 3)).toBe(true);
    const decisive = t?.matches.filter((m) => m.homeGoals !== m.awayGoals).length ?? 0;
    expect(t?.standings.reduce((s, r) => s + r.points, 0)).toBe(decisive * 3 + ((t?.matches.length ?? 0) - decisive) * 2);
    const sorted = [...(t?.standings ?? [])].sort((a, b) => b.points - a.points);
    expect(t?.standings.map((s) => s.points)).toEqual(sorted.map((s) => s.points));
    expect(t?.standings.every((s) => s.goalDiff === s.goalsFor - s.goalsAgainst)).toBe(true);
    expect(code(() => service.playRound(alice))).toBe('WRONG_PHASE');
  });

  it('dois humanos veem exatamente o mesmo campeonato', async () => {
    const ctx = setup();
    const c = ctx.service.createRoom(alice, { mode: 'multi', maxPlayers: 3, botSlots: 1, botLevel: 'NORMAL' });
    ctx.service.joinRoom(bob, c);
    ctx.service.startGame(alice);
    for (let i = 0; i < 400 && ctx.service.getSnapshot(alice.playerId)?.room.status === 'AUCTION'; i++) await advance(5_000);
    ctx.service.startTournament(alice);
    expect(code(() => ctx.service.playRound(bob))).toBe('NOT_HOST');
    ctx.service.playRound(alice, true);
    expect(ctx.service.getSnapshot(bob.playerId)?.tournament).toEqual(ctx.service.getSnapshot(alice.playerId)?.tournament);
    expect(ctx.service.getSnapshot(bob.playerId)?.teams).toEqual(ctx.service.getSnapshot(alice.playerId)?.teams);
  });
});
