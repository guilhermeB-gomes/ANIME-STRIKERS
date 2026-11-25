import {
  computeTeamProfile,
  getCharacter,
  type AuctionView,
  type RoomView,
  type TeamView,
  type TournamentView,
} from '@strikers/shared';
import { computeStandings } from '../game-engine/fixtures';
import { minNextBid } from '../game-engine/auction-rules';
import type { RoomState } from '../types/state';

/** Constrói as visões públicas enviadas aos clientes. Nada aqui expõe dados internos do servidor. */

export function buildRoomView(room: RoomState, youId: string): RoomView {
  return {
    code: room.code,
    status: room.status,
    maxPlayers: room.maxPlayers,
    botSlots: room.botSlots,
    botLevel: room.botLevel,
    hostId: room.hostId,
    youId,
    participants: room.participants.map((p) => ({
      id: p.id,
      name: p.name,
      isBot: p.isBot,
      botLevel: p.botLevel,
      budget: p.budget,
      connected: p.isBot ? true : p.connected,
      isHost: p.id === room.hostId,
      roster: (room.teams[p.id]?.roster ?? []).map((r) => r.characterId),
    })),
    auctionIndex: room.queueIndex,
    auctionTotal: room.queue.length,
  };
}

export function buildAuctionView(room: RoomState, now: number): AuctionView | null {
  const a = room.auction;
  if (!a) return null;
  return {
    id: a.id,
    index: a.index,
    total: room.queue.length,
    characterId: a.characterId,
    startingBid: a.startingBid,
    currentBid: a.currentBid,
    leaderId: a.leaderId,
    bids: a.bids.slice(-30).map((b) => ({ id: b.id, participantId: b.participantId, amount: b.amount, at: b.at })),
    status: a.status,
    endsAt: a.endsAt,
    serverNow: now,
    minNextBid: minNextBid(a.startingBid, a.currentBid),
    winnerId: a.winnerId,
    finalPrice: a.finalPrice,
    nextStartsAt: a.nextStartsAt,
  };
}

export function buildTeamViews(room: RoomState): TeamView[] {
  return room.participants.flatMap((p) => {
    const team = room.teams[p.id];
    if (!team) return [];
    const chars = team.lineup.map((id) => (id ? getCharacter(id) : null));
    return [
      {
        participantId: p.id,
        formation: team.formation,
        lineup: team.lineup,
        roster: team.roster.map((r) => ({ characterId: r.characterId, price: r.price })),
        profile: computeTeamProfile(chars, team.formation),
      },
    ];
  });
}

export function buildTournamentView(room: RoomState): TournamentView | null {
  const t = room.tournament;
  if (!t) return null;
  return {
    status: t.status,
    roundsPlayed: t.roundsPlayed,
    totalRounds: t.totalRounds,
    fixtures: t.fixtures.map((f) => ({ round: f.round, homeId: f.homeId, awayId: f.awayId, matchId: f.matchId })),
    matches: t.matches,
    standings: computeStandings(
      [...room.participants].sort((a, b) => a.joinOrder - b.joinOrder).map((p) => p.id),
      t.matches,
    ),
  };
}
