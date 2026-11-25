import type { AuctionState, BidState, GuestRecord, RoomState } from '../types/state';

export interface MatchHistoryEntry {
  matchId: string;
  roomCode: string;
  round: number;
  homeName: string;
  awayName: string;
  homeGoals: number;
  awayGoals: number;
  result: 'V' | 'E' | 'D';
  at: number;
}

/**
 * Porta de persistência. O estado em memória do GameService é o que responde em tempo real;
 * o repositório grava tudo que é necessário para recuperar salas, leilões, elencos e campeonatos.
 */
export interface GameRepository {
  saveGuest(guest: GuestRecord): Promise<void>;
  getGuest(id: string): Promise<GuestRecord | null>;
  /** Sala + participantes + times + elencos (idempotente). */
  saveRoom(room: RoomState): Promise<void>;
  deleteRoom(roomId: string): Promise<void>;
  /** Leilão + todos os lances (idempotente). */
  saveAuction(room: RoomState, auction: AuctionState): Promise<void>;
  /** Um novo lance e o novo estado do leilão. */
  saveBid(room: RoomState, auction: AuctionState, bid: BidState): Promise<void>;
  /** Campeonato + partidas + eventos + classificação (idempotente). */
  saveTournament(room: RoomState): Promise<void>;
  /** Atualiza vitórias/empates/derrotas dos convidados ao fim do campeonato. */
  recordResults(room: RoomState): Promise<void>;
  /** Salas ativas ou recentes, para retomar após reinício. */
  loadRecentRooms(sinceMs: number): Promise<RoomState[]>;
  listRoomCodes(): Promise<string[]>;
  getHistory(playerId: string, limit: number): Promise<MatchHistoryEntry[]>;
  close(): Promise<void>;
}
