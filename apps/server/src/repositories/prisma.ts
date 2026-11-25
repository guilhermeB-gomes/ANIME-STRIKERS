import { PrismaPg } from '@prisma/adapter-pg';
import { CHARACTERS, type BotLevel, type Formation, type MatchResultView, type MatchSideStats, type RoomStatus } from '@strikers/shared';
import { type Prisma, PrismaClient } from '../generated/prisma/client';
import { computeStandings } from '../game-engine/fixtures';
import { logger } from '../logger';
import type { AuctionState, BidState, FixtureState, GuestRecord, ParticipantState, RoomState, TeamState } from '../types/state';
import { seedCatalog } from './catalog-seed';
import type { GameRepository, MatchHistoryEntry } from './types';

type Tx = Prisma.TransactionClient;
const d = (ms: number) => new Date(ms);

/** Implementação PostgreSQL (Prisma 7 + driver adapter pg). */
export class PrismaRepository implements GameRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async saveGuest(g: GuestRecord): Promise<void> {
    const data = { name: g.name, wins: g.wins, draws: g.draws, losses: g.losses };
    await this.prisma.guestPlayer.upsert({ where: { id: g.id }, create: { id: g.id, createdAt: d(g.createdAt), ...data }, update: data });
  }

  async getGuest(id: string): Promise<GuestRecord | null> {
    const g = await this.prisma.guestPlayer.findUnique({ where: { id } });
    return g ? { id: g.id, name: g.name, wins: g.wins, draws: g.draws, losses: g.losses, createdAt: g.createdAt.getTime() } : null;
  }

  async saveRoom(room: RoomState): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const data = {
        status: room.status,
        hostParticipantId: room.hostId || null,
        maxPlayers: room.maxPlayers,
        botSlots: room.botSlots,
        botLevel: room.botLevel,
        seed: room.seed,
        queue: room.queue,
        queueIndex: room.queueIndex,
      };
      await tx.room.upsert({ where: { id: room.id }, create: { id: room.id, code: room.code, createdAt: d(room.createdAt), ...data }, update: data });
      await tx.roomParticipant.deleteMany({ where: { roomId: room.id, id: { notIn: room.participants.map((p) => p.id) } } });
      for (const p of room.participants) {
        const pd = { name: p.name, isBot: p.isBot, botLevel: p.botLevel, budget: p.budget, joinOrder: p.joinOrder, playerId: p.playerId };
        await tx.roomParticipant.upsert({ where: { id: p.id }, create: { id: p.id, roomId: room.id, ...pd }, update: pd });
        const team = room.teams[p.id];
        if (!team) continue;
        const teamId = `team-${p.id}`;
        const td = { formation: team.formation, lineup: team.lineup as Prisma.InputJsonValue };
        await tx.team.upsert({ where: { id: teamId }, create: { id: teamId, participantId: p.id, ...td }, update: td });
        for (const [index, r] of team.roster.entries()) {
          const id = `${room.id}:${r.characterId}`;
          await tx.teamPlayer.upsert({
            where: { id },
            create: { id, teamId, roomId: room.id, characterId: r.characterId, price: r.price, rosterIndex: index },
            update: { price: r.price, rosterIndex: index },
          });
        }
      }
    });
  }

  async deleteRoom(roomId: string): Promise<void> {
    await this.prisma.room.deleteMany({ where: { id: roomId } });
  }

  private async upsertAuction(tx: Tx, roomId: string, a: AuctionState): Promise<void> {
    const data = {
      status: a.status,
      startingBid: a.startingBid,
      currentBid: a.currentBid,
      leaderId: a.leaderId,
      startedAt: d(a.startedAt),
      endsAt: d(a.endsAt),
      winnerId: a.winnerId,
      finalPrice: a.finalPrice,
      nextStartsAt: a.nextStartsAt === null ? null : d(a.nextStartsAt),
    };
    await tx.auction.upsert({ where: { id: a.id }, create: { id: a.id, roomId, characterId: a.characterId, index: a.index, ...data }, update: data });
  }

  async saveAuction(room: RoomState, auction: AuctionState): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await this.upsertAuction(tx, room.id, auction);
      if (auction.bids.length > 0) {
        await tx.bid.createMany({
          data: auction.bids.map((b) => ({ id: b.id, auctionId: auction.id, participantId: b.participantId, amount: b.amount, createdAt: d(b.at) })),
          skipDuplicates: true,
        });
      }
    });
  }

  async saveBid(room: RoomState, auction: AuctionState, bid: BidState): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await this.upsertAuction(tx, room.id, auction);
      await tx.bid.createMany({ data: [{ id: bid.id, auctionId: auction.id, participantId: bid.participantId, amount: bid.amount, createdAt: d(bid.at) }], skipDuplicates: true });
    });
  }

  async saveTournament(room: RoomState): Promise<void> {
    const t = room.tournament;
    if (!t) return;
    await this.prisma.$transaction(async (tx) => {
      const data = { status: t.status, roundsPlayed: t.roundsPlayed, totalRounds: t.totalRounds, fixtures: t.fixtures as unknown as Prisma.InputJsonValue };
      await tx.tournament.upsert({ where: { id: t.id }, create: { id: t.id, roomId: room.id, ...data }, update: data });
      const known = new Set((await tx.match.findMany({ where: { tournamentId: t.id }, select: { id: true } })).map((m) => m.id));
      for (const m of t.matches) {
        if (known.has(m.id)) continue;
        await tx.match.create({
          data: {
            id: m.id,
            tournamentId: t.id,
            round: m.round,
            homeId: m.homeId,
            awayId: m.awayId,
            homeGoals: m.homeGoals,
            awayGoals: m.awayGoals,
            stats: m.stats as unknown as Prisma.InputJsonValue,
            mvpCharacterId: m.mvpCharacterId,
          },
        });
        await tx.matchEvent.createMany({
          data: m.events.map((e, seq) => ({
            id: `${m.id}:${seq}`,
            matchId: m.id,
            seq,
            minute: e.minute,
            type: e.type,
            participantId: e.participantId,
            characterId: e.characterId,
            assistCharacterId: e.assistCharacterId,
            text: e.text,
          })),
        });
      }
      const ids = [...room.participants].sort((a, b) => a.joinOrder - b.joinOrder).map((p) => p.id);
      for (const [position, s] of computeStandings(ids, t.matches).entries()) {
        const sd = { position: position + 1, played: s.played, wins: s.wins, draws: s.draws, losses: s.losses, goalsFor: s.goalsFor, goalsAgainst: s.goalsAgainst, goalDiff: s.goalDiff, points: s.points };
        const id = `${t.id}:${s.participantId}`;
        await tx.tournamentStanding.upsert({ where: { id }, create: { id, tournamentId: t.id, participantId: s.participantId, ...sd }, update: sd });
      }
    });
  }

  async recordResults(room: RoomState): Promise<void> {
    const t = room.tournament;
    if (!t) return;
    await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.tournament.updateMany({ where: { id: t.id, resultsRecorded: false }, data: { resultsRecorded: true } });
      if (claimed.count === 0) return;
      for (const p of room.participants) {
        if (!p.playerId) continue;
        let wins = 0;
        let draws = 0;
        let losses = 0;
        for (const m of t.matches) {
          if (m.homeId !== p.id && m.awayId !== p.id) continue;
          const mine = m.homeId === p.id ? m.homeGoals : m.awayGoals;
          const theirs = m.homeId === p.id ? m.awayGoals : m.homeGoals;
          if (mine > theirs) wins++;
          else if (mine < theirs) losses++;
          else draws++;
        }
        await tx.guestPlayer.update({ where: { id: p.playerId }, data: { wins: { increment: wins }, draws: { increment: draws }, losses: { increment: losses } } });
      }
    });
  }

  async loadRecentRooms(sinceMs: number): Promise<RoomState[]> {
    const rows = await this.prisma.room.findMany({
      where: { updatedAt: { gte: d(sinceMs) } },
      include: {
        participants: { include: { team: { include: { players: { orderBy: { rosterIndex: 'asc' } } } } }, orderBy: { joinOrder: 'asc' } },
        auctions: { orderBy: { index: 'desc' }, take: 1, include: { bids: { orderBy: [{ createdAt: 'asc' }, { amount: 'asc' }] } } },
        tournament: { include: { matches: { orderBy: { round: 'asc' }, include: { events: { orderBy: { seq: 'asc' } } } } } },
      },
    });

    return rows.map((r): RoomState => {
      const participants: ParticipantState[] = r.participants.map((p) => ({
        id: p.id,
        playerId: p.playerId,
        name: p.name,
        isBot: p.isBot,
        botLevel: (p.botLevel as BotLevel | null) ?? null,
        budget: p.budget,
        connected: false,
        joinOrder: p.joinOrder,
      }));
      const teams: Record<string, TeamState> = {};
      for (const p of r.participants) {
        if (!p.team) continue;
        teams[p.id] = {
          participantId: p.id,
          formation: p.team.formation as Formation,
          lineup: p.team.lineup as (string | null)[],
          roster: p.team.players.map((tp) => ({ characterId: tp.characterId, price: tp.price })),
        };
      }
      const a = r.auctions[0];
      const auction: AuctionState | null = a
        ? {
            id: a.id,
            index: a.index,
            characterId: a.characterId,
            startingBid: a.startingBid,
            currentBid: a.currentBid,
            leaderId: a.leaderId,
            bids: a.bids.map((b) => ({ id: b.id, participantId: b.participantId, amount: b.amount, at: b.createdAt.getTime() })),
            status: a.status as 'ACTIVE' | 'CLOSED',
            startedAt: a.startedAt.getTime(),
            endsAt: a.endsAt.getTime(),
            winnerId: a.winnerId,
            finalPrice: a.finalPrice,
            nextStartsAt: a.nextStartsAt ? a.nextStartsAt.getTime() : null,
          }
        : null;
      const t = r.tournament;
      const tournament: RoomState['tournament'] = t
        ? {
            id: t.id,
            status: t.status as 'IN_PROGRESS' | 'FINISHED',
            roundsPlayed: t.roundsPlayed,
            totalRounds: t.totalRounds,
            fixtures: t.fixtures as unknown as FixtureState[],
            matches: t.matches.map(
              (m): MatchResultView => ({
                id: m.id,
                round: m.round,
                homeId: m.homeId,
                awayId: m.awayId,
                homeGoals: m.homeGoals,
                awayGoals: m.awayGoals,
                stats: m.stats as unknown as { home: MatchSideStats; away: MatchSideStats },
                mvpCharacterId: m.mvpCharacterId,
                events: m.events.map((e) => ({
                  minute: e.minute,
                  type: e.type as MatchResultView['events'][number]['type'],
                  participantId: e.participantId,
                  characterId: e.characterId,
                  assistCharacterId: e.assistCharacterId,
                  text: e.text,
                })),
              }),
            ),
          }
        : null;
      return {
        id: r.id,
        code: r.code,
        hostId: r.hostParticipantId ?? participants[0]?.id ?? '',
        status: r.status as RoomStatus,
        maxPlayers: r.maxPlayers,
        botSlots: r.botSlots,
        botLevel: r.botLevel as BotLevel,
        seed: r.seed,
        createdAt: r.createdAt.getTime(),
        participants,
        teams,
        queue: r.queue,
        queueIndex: r.queueIndex,
        auction,
        tournament,
      };
    });
  }

  async listRoomCodes(): Promise<string[]> {
    return (await this.prisma.room.findMany({ select: { code: true } })).map((r) => r.code);
  }

  async getHistory(playerId: string, limit: number): Promise<MatchHistoryEntry[]> {
    const rows = await this.prisma.match.findMany({
      where: { OR: [{ home: { playerId } }, { away: { playerId } }] },
      orderBy: { playedAt: 'desc' },
      take: limit,
      include: { home: true, away: true, tournament: { include: { room: { select: { code: true } } } } },
    });
    return rows.map((m) => {
      const isHome = m.home.playerId === playerId;
      const mine = isHome ? m.homeGoals : m.awayGoals;
      const theirs = isHome ? m.awayGoals : m.homeGoals;
      return {
        matchId: m.id,
        roomCode: m.tournament.room.code,
        round: m.round,
        homeName: m.home.name,
        awayName: m.away.name,
        homeGoals: m.homeGoals,
        awayGoals: m.awayGoals,
        result: mine > theirs ? 'V' : mine < theirs ? 'D' : 'E',
        at: m.playedAt.getTime(),
      };
    });
  }

  async close(): Promise<void> {
    await this.prisma.$disconnect();
  }
}

/** Cria o repositório e garante que o catálogo está no banco (os leilões referenciam Character por FK). */
export async function createPrismaRepository(databaseUrl: string): Promise<PrismaRepository> {
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) });
  const count = await prisma.character.count();
  if (count < CHARACTERS.length) {
    logger.info('Carregando catálogo de personagens no banco...');
    await seedCatalog(prisma);
  }
  return new PrismaRepository(prisma);
}
