import type { BotLevel, Formation } from './types';
import type { TeamProfile } from './lineup';

/** Códigos de erro de domínio, estáveis para o cliente traduzir em mensagens amigáveis. */
export const ERROR_CODES = [
  'VALIDATION',
  'UNAUTHENTICATED',
  'ROOM_NOT_FOUND',
  'INVALID_CODE',
  'ROOM_FULL',
  'ROOM_STARTED',
  'NOT_HOST',
  'NOT_PARTICIPANT',
  'NOT_ENOUGH_PLAYERS',
  'WRONG_PHASE',
  'AUCTION_CLOSED',
  'AUCTION_MISMATCH',
  'BID_TOO_LOW',
  'ALREADY_LEADING',
  'INSUFFICIENT_BUDGET',
  'ROSTER_FULL',
  'ALREADY_OWNED',
  'INVALID_LINEUP',
  'RATE_LIMITED',
  'INTERNAL',
] as const;
export type ErrorCode = (typeof ERROR_CODES)[number];

export interface DomainErrorPayload {
  code: ErrorCode;
  message: string;
}

export type Ack<T = undefined> = { ok: true; data: T } | { ok: false; error: DomainErrorPayload };

export type RoomStatus = 'LOBBY' | 'AUCTION' | 'TEAM_BUILDING' | 'TOURNAMENT' | 'FINISHED';

export interface ParticipantView {
  id: string;
  name: string;
  isBot: boolean;
  botLevel: BotLevel | null;
  budget: number;
  connected: boolean;
  isHost: boolean;
  /** Ids dos personagens contratados (informação pública). */
  roster: string[];
}

export interface RoomView {
  code: string;
  status: RoomStatus;
  maxPlayers: number;
  botSlots: number;
  botLevel: BotLevel;
  hostId: string;
  youId: string;
  participants: ParticipantView[];
  auctionIndex: number;
  auctionTotal: number;
}

export interface BidView {
  id: string;
  participantId: string;
  amount: number;
  at: number;
}

export type AuctionStatus = 'ACTIVE' | 'CLOSED';

export interface AuctionView {
  id: string;
  index: number;
  total: number;
  characterId: string;
  startingBid: number;
  currentBid: number | null;
  leaderId: string | null;
  bids: BidView[];
  status: AuctionStatus;
  endsAt: number;
  /** Relógio do servidor no momento do envio; o cliente calcula o offset. */
  serverNow: number;
  minNextBid: number;
  winnerId: string | null;
  finalPrice: number | null;
  /** Quando o próximo leilão começa (apenas depois de encerrado). */
  nextStartsAt: number | null;
}

export interface TeamView {
  participantId: string;
  formation: Formation;
  lineup: (string | null)[];
  roster: { characterId: string; price: number }[];
  profile: TeamProfile;
}

export type MatchEventType = 'INICIO' | 'ATAQUE' | 'CONTRA_ATAQUE' | 'PASSE' | 'FINALIZACAO' | 'DEFESA' | 'GOL' | 'HABILIDADE' | 'FIM';

export interface MatchEventView {
  minute: number;
  type: MatchEventType;
  participantId: string | null;
  characterId: string | null;
  assistCharacterId: string | null;
  text: string;
}

export interface MatchSideStats {
  possession: number;
  shots: number;
  onTarget: number;
  saves: number;
}

export interface MatchResultView {
  id: string;
  round: number;
  homeId: string;
  awayId: string;
  homeGoals: number;
  awayGoals: number;
  events: MatchEventView[];
  stats: { home: MatchSideStats; away: MatchSideStats };
  mvpCharacterId: string | null;
}

export interface StandingView {
  participantId: string;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDiff: number;
  points: number;
}

export interface FixtureView {
  round: number;
  homeId: string;
  awayId: string;
  matchId: string | null;
}

export interface TournamentView {
  status: 'IN_PROGRESS' | 'FINISHED';
  roundsPlayed: number;
  totalRounds: number;
  fixtures: FixtureView[];
  matches: MatchResultView[];
  standings: StandingView[];
}

export interface Notice {
  kind: 'info' | 'success' | 'warning' | 'error';
  message: string;
}

export interface RoomCreateResult {
  code: string;
}

export interface ClientToServerEvents {
  'room:create': (payload: unknown, ack: (res: Ack<RoomCreateResult>) => void) => void;
  'room:join': (payload: unknown, ack: (res: Ack<RoomCreateResult>) => void) => void;
  'room:leave': (payload: unknown, ack: (res: Ack) => void) => void;
  'room:settings': (payload: unknown, ack: (res: Ack) => void) => void;
  'room:start': (payload: unknown, ack: (res: Ack) => void) => void;
  'auction:bid': (payload: unknown, ack: (res: Ack<{ amount: number }>) => void) => void;
  'team:setLineup': (payload: unknown, ack: (res: Ack) => void) => void;
  'tournament:start': (payload: unknown, ack: (res: Ack) => void) => void;
  'tournament:playRound': (payload: unknown, ack: (res: Ack) => void) => void;
}

export interface ServerToClientEvents {
  'room:state': (room: RoomView) => void;
  'auction:state': (auction: AuctionView | null) => void;
  'teams:state': (teams: TeamView[]) => void;
  'tournament:state': (tournament: TournamentView | null) => void;
  'room:closed': (payload: { reason: string }) => void;
  notice: (notice: Notice) => void;
}

export interface SocketAuth {
  token: string;
}
