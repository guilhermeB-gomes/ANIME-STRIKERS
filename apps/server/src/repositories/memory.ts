import type { AuctionState, BidState, GuestRecord, RoomState } from '../types/state';
import type { GameRepository, MatchHistoryEntry } from './types';

/** Repositório em memória: usado em testes e quando DATABASE_URL não está configurada. */
export class MemoryRepository implements GameRepository {
  private guests = new Map<string, GuestRecord>();
  private rooms = new Map<string, { room: RoomState; updatedAt: number }>();
  private recorded = new Set<string>();

  async saveGuest(guest: GuestRecord): Promise<void> {
    this.guests.set(guest.id, { ...guest });
  }

  async getGuest(id: string): Promise<GuestRecord | null> {
    const g = this.guests.get(id);
    return g ? { ...g } : null;
  }

  async saveRoom(room: RoomState): Promise<void> {
    this.rooms.set(room.id, { room: structuredClone(room), updatedAt: Date.now() });
  }

  async deleteRoom(roomId: string): Promise<void> {
    this.rooms.delete(roomId);
  }

  async saveAuction(room: RoomState): Promise<void> {
    await this.saveRoom(room);
  }

  async saveBid(room: RoomState, _auction: AuctionState, _bid: BidState): Promise<void> {
    await this.saveRoom(room);
  }

  async saveTournament(room: RoomState): Promise<void> {
    await this.saveRoom(room);
  }

  async recordResults(room: RoomState): Promise<void> {
    if (!room.tournament || this.recorded.has(room.id)) return;
    this.recorded.add(room.id);
    for (const p of room.participants) {
      if (!p.playerId) continue;
      const g = this.guests.get(p.playerId);
      if (!g) continue;
      for (const m of room.tournament.matches) {
        if (m.homeId !== p.id && m.awayId !== p.id) continue;
        const mine = m.homeId === p.id ? m.homeGoals : m.awayGoals;
        const theirs = m.homeId === p.id ? m.awayGoals : m.homeGoals;
        if (mine > theirs) g.wins++;
        else if (mine < theirs) g.losses++;
        else g.draws++;
      }
    }
  }

  async loadRecentRooms(sinceMs: number): Promise<RoomState[]> {
    return [...this.rooms.values()].filter((r) => r.updatedAt >= sinceMs).map((r) => structuredClone(r.room));
  }

  async listRoomCodes(): Promise<string[]> {
    return [...this.rooms.values()].map((r) => r.room.code);
  }

  async getHistory(playerId: string, limit: number): Promise<MatchHistoryEntry[]> {
    const out: MatchHistoryEntry[] = [];
    for (const { room, updatedAt } of this.rooms.values()) {
      const me = room.participants.find((p) => p.playerId === playerId);
      if (!me || !room.tournament) continue;
      const name = (id: string) => room.participants.find((p) => p.id === id)?.name ?? '?';
      for (const m of room.tournament.matches) {
        if (m.homeId !== me.id && m.awayId !== me.id) continue;
        const mine = m.homeId === me.id ? m.homeGoals : m.awayGoals;
        const theirs = m.homeId === me.id ? m.awayGoals : m.homeGoals;
        out.push({
          matchId: m.id,
          roomCode: room.code,
          round: m.round,
          homeName: name(m.homeId),
          awayName: name(m.awayId),
          homeGoals: m.homeGoals,
          awayGoals: m.awayGoals,
          result: mine > theirs ? 'V' : mine < theirs ? 'D' : 'E',
          at: updatedAt,
        });
      }
    }
    return out.sort((a, b) => b.at - a.at).slice(0, limit);
  }

  async close(): Promise<void> {
    /* nada a fechar */
  }
}
