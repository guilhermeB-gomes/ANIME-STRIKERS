import type { BotLevel, Formation, MatchResultView, RoomStatus } from '@strikers/shared';

export interface GuestRecord {
  id: string;
  name: string;
  wins: number;
  draws: number;
  losses: number;
  createdAt: number;
}

export interface ParticipantState {
  id: string;
  /** Nulo para bots. */
  playerId: string | null;
  name: string;
  isBot: boolean;
  botLevel: BotLevel | null;
  budget: number;
  connected: boolean;
  joinOrder: number;
}

export interface RosterEntry {
  characterId: string;
  price: number;
}

export interface TeamState {
  participantId: string;
  formation: Formation;
  lineup: (string | null)[];
  roster: RosterEntry[];
}

export interface BidState {
  id: string;
  participantId: string;
  amount: number;
  at: number;
}

export interface AuctionState {
  id: string;
  index: number;
  characterId: string;
  startingBid: number;
  currentBid: number | null;
  leaderId: string | null;
  bids: BidState[];
  status: 'ACTIVE' | 'CLOSED';
  startedAt: number;
  endsAt: number;
  winnerId: string | null;
  finalPrice: number | null;
  nextStartsAt: number | null;
}

export interface FixtureState {
  round: number;
  homeId: string;
  awayId: string;
  matchId: string | null;
}

export interface TournamentState {
  id: string;
  status: 'IN_PROGRESS' | 'FINISHED';
  roundsPlayed: number;
  totalRounds: number;
  fixtures: FixtureState[];
  matches: MatchResultView[];
}

export interface RoomState {
  id: string;
  code: string;
  hostId: string;
  status: RoomStatus;
  maxPlayers: number;
  botSlots: number;
  botLevel: BotLevel;
  seed: number;
  createdAt: number;
  participants: ParticipantState[];
  teams: Record<string, TeamState>;
  /** Ids dos personagens, na ordem em que serão leiloados. */
  queue: string[];
  /** Quantos leilões já foram iniciados. */
  queueIndex: number;
  auction: AuctionState | null;
  tournament: TournamentState | null;
}
