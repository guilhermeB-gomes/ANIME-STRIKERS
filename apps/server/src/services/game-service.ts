import { randomInt, randomUUID } from 'node:crypto';
import {
  ANTI_SNIPE_EXTENSION_MS,
  ANTI_SNIPE_WINDOW_MS,
  AUCTION_DURATION_MS,
  CHARACTERS,
  INITIAL_BUDGET,
  INTERMISSION_MS,
  MAX_ROSTER,
  MIN_PARTICIPANTS,
  MIN_PRICE,
  ROOM_CODE_ALPHABET,
  ROOM_CODE_LENGTH,
  STARTERS,
  autoLineup,
  computeTeamProfile,
  getCharacter,
  hashString,
  mulberry32,
  validateLineupIds,
  type Character,
  type LineupInput,
  type Notice,
  type RoomCreateInput,
  type RoomSettingsInput,
  type RoomStatus,
} from '@strikers/shared';
import { budgetReserve, nextEndsAt, validateBid } from '../game-engine/auction-rules';
import { computeStandings, generateRoundRobin, totalRoundsFor } from '../game-engine/fixtures';
import { simulateMatch, type TeamInput } from '../game-engine/match';
import { buildAuctionQueue } from '../game-engine/queue';
import { decideBid } from '../bots/bot-brain';
import { BOT_NAMES } from '../bots/names';
import { DomainError } from '../errors';
import { logger } from '../logger';
import type { GameRepository } from '../repositories/types';
import type { AuctionState, BidState, ParticipantState, RoomState, TeamState } from '../types/state';
import { buildAuctionView, buildRoomView, buildTeamViews, buildTournamentView } from './views';

export interface Actor {
  playerId: string;
  name: string;
}

/** Como o GameService avisa os clientes. A camada de socket implementa; os testes podem espiar. */
export interface Broadcaster {
  roomChanged(room: RoomState): void;
  auctionChanged(room: RoomState): void;
  teamsChanged(room: RoomState): void;
  tournamentChanged(room: RoomState): void;
  notice(room: RoomState, notice: Notice, onlyPlayerId?: string): void;
}

export interface GameConfig {
  auctionDurationMs: number;
  intermissionMs: number;
  firstAuctionDelayMs: number;
  antiSnipeWindowMs: number;
  antiSnipeExtensionMs: number;
  /** Multiplica o atraso dos bots (testes usam valores pequenos). */
  botDelayScale: number;
}

export const DEFAULT_GAME_CONFIG: GameConfig = {
  auctionDurationMs: AUCTION_DURATION_MS,
  intermissionMs: INTERMISSION_MS,
  firstAuctionDelayMs: 3_000,
  antiSnipeWindowMs: ANTI_SNIPE_WINDOW_MS,
  antiSnipeExtensionMs: ANTI_SNIPE_EXTENSION_MS,
  botDelayScale: 1,
};

export interface Timers {
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
}

export interface GameServiceDeps {
  repo: GameRepository;
  broadcaster: Broadcaster;
  config?: Partial<GameConfig>;
  now?: () => number;
  timers?: Timers;
  newSeed?: () => number;
  newId?: () => string;
}

interface RoomTimers {
  end: unknown;
  next: unknown;
  bots: Map<string, unknown>;
}

export interface RoomInfo {
  code: string;
  status: RoomStatus;
  humans: number;
  humanCapacity: number;
  maxPlayers: number;
}

export interface Snapshot {
  room: ReturnType<typeof buildRoomView>;
  auction: ReturnType<typeof buildAuctionView>;
  teams: ReturnType<typeof buildTeamViews>;
  tournament: ReturnType<typeof buildTournamentView>;
}

const RESTORE_WINDOW_MS = 24 * 60 * 60 * 1000;

export class GameService {
  private readonly rooms = new Map<string, RoomState>();
  private readonly playerRoom = new Map<string, string>();
  private readonly roomTimers = new Map<string, RoomTimers>();
  private readonly persistQueues = new Map<string, Promise<void>>();
  private usedCodes = new Set<string>();

  private readonly repo: GameRepository;
  private readonly out: Broadcaster;
  private readonly config: GameConfig;
  private readonly now: () => number;
  private readonly timers: Timers;
  private readonly newSeed: () => number;
  private readonly newId: () => string;

  constructor(deps: GameServiceDeps) {
    this.repo = deps.repo;
    this.out = deps.broadcaster;
    this.config = { ...DEFAULT_GAME_CONFIG, ...deps.config };
    this.now = deps.now ?? Date.now;
    this.timers = deps.timers ?? {
      setTimeout: (fn, ms) => setTimeout(fn, ms),
      clearTimeout: (h) => clearTimeout(h as NodeJS.Timeout),
    };
    this.newSeed = deps.newSeed ?? (() => randomInt(1, 2 ** 31 - 1));
    this.newId = deps.newId ?? randomUUID;
  }

  // ───────────────────────── infraestrutura ─────────────────────────

  /** Grava em ordem por sala. Erros são registrados (nunca engolidos) e não derrubam o jogo. */
  private persist(room: RoomState, task: (snapshot: RoomState) => Promise<void>): void {
    const snapshot = structuredClone(room);
    const previous = this.persistQueues.get(room.id) ?? Promise.resolve();
    const next = previous.then(() => task(snapshot)).catch((error: unknown) => {
      logger.error(`Falha ao persistir sala ${room.code}:`, error);
    });
    this.persistQueues.set(room.id, next);
  }

  /** Aguarda todas as gravações pendentes (testes e desligamento). */
  async flush(): Promise<void> {
    await Promise.all([...this.persistQueues.values()]);
  }

  shutdown(): void {
    for (const t of this.roomTimers.values()) {
      this.timers.clearTimeout(t.end);
      this.timers.clearTimeout(t.next);
      for (const h of t.bots.values()) this.timers.clearTimeout(h);
    }
    this.roomTimers.clear();
  }

  private timersOf(room: RoomState): RoomTimers {
    let t = this.roomTimers.get(room.id);
    if (!t) {
      t = { end: undefined, next: undefined, bots: new Map() };
      this.roomTimers.set(room.id, t);
    }
    return t;
  }

  private clearBotTimers(room: RoomState): void {
    const t = this.timersOf(room);
    for (const h of t.bots.values()) this.timers.clearTimeout(h);
    t.bots.clear();
  }

  private requireRoom(actor: Actor): RoomState {
    const code = this.playerRoom.get(actor.playerId);
    const room = code ? this.rooms.get(code) : undefined;
    if (!room) throw new DomainError('ROOM_NOT_FOUND', 'Você não está em nenhuma sala.');
    return room;
  }

  private requireParticipant(room: RoomState, actor: Actor): ParticipantState {
    const p = room.participants.find((x) => x.playerId === actor.playerId);
    if (!p) throw new DomainError('NOT_PARTICIPANT', 'Você não participa desta sala.');
    return p;
  }

  private requireHost(room: RoomState, actor: Actor): ParticipantState {
    const p = this.requireParticipant(room, actor);
    if (room.hostId !== p.id) throw new DomainError('NOT_HOST', 'Apenas o anfitrião pode fazer isso.');
    return p;
  }

  private humans(room: RoomState): ParticipantState[] {
    return room.participants.filter((p) => !p.isBot);
  }

  private broadcastAll(room: RoomState): void {
    this.out.roomChanged(room);
    this.out.auctionChanged(room);
    this.out.teamsChanged(room);
    this.out.tournamentChanged(room);
  }

  // ───────────────────────── recuperação ─────────────────────────

  /** Carrega salas recentes do banco e retoma timers (leilão em andamento, próximo leilão, bots). */
  async restore(): Promise<number> {
    this.usedCodes = new Set(await this.repo.listRoomCodes());
    const stored = await this.repo.loadRecentRooms(this.now() - RESTORE_WINDOW_MS);
    for (const room of stored.sort((a, b) => a.createdAt - b.createdAt)) {
      for (const p of room.participants) if (!p.isBot) p.connected = false;
      this.rooms.set(room.code, room);
      this.usedCodes.add(room.code);
      if (room.status !== 'FINISHED') {
        for (const p of room.participants) if (p.playerId) this.playerRoom.set(p.playerId, room.code);
      }
      this.resumeTimers(room);
    }
    return stored.length;
  }

  private resumeTimers(room: RoomState): void {
    if (room.status !== 'AUCTION') return;
    const a = room.auction;
    if (a && a.status === 'ACTIVE') {
      this.scheduleEnd(room, a);
      this.scheduleBots(room);
    } else if (a && a.status === 'CLOSED') {
      this.scheduleNext(room, Math.max(0, (a.nextStartsAt ?? this.now()) - this.now()));
    } else {
      this.scheduleNext(room, this.config.firstAuctionDelayMs);
    }
  }

  // ───────────────────────── salas ─────────────────────────

  private generateCode(): string {
    for (let attempt = 0; attempt < 50; attempt++) {
      let code = '';
      for (let i = 0; i < ROOM_CODE_LENGTH; i++) code += ROOM_CODE_ALPHABET[randomInt(ROOM_CODE_ALPHABET.length)];
      if (!this.usedCodes.has(code) && !this.rooms.has(code)) return code;
    }
    throw new DomainError('INTERNAL', 'Não foi possível gerar um código de sala.');
  }

  private newParticipant(room: RoomState, init: Pick<ParticipantState, 'playerId' | 'name' | 'isBot' | 'botLevel'>): ParticipantState {
    const joinOrder = room.participants.reduce((max, p) => Math.max(max, p.joinOrder), -1) + 1;
    const p: ParticipantState = { id: this.newId(), budget: INITIAL_BUDGET, connected: !init.isBot, joinOrder, ...init };
    room.participants.push(p);
    room.teams[p.id] = { participantId: p.id, formation: 'equilibrada', lineup: Array<string | null>(STARTERS).fill(null), roster: [] };
    return p;
  }

  private syncBots(room: RoomState): void {
    const bots = room.participants.filter((p) => p.isBot);
    for (const bot of bots) bot.botLevel = room.botLevel;
    while (bots.length > room.botSlots) {
      const removed = bots.pop();
      if (!removed) break;
      room.participants = room.participants.filter((p) => p.id !== removed.id);
      delete room.teams[removed.id];
    }
    while (bots.length < room.botSlots) {
      const used = new Set(room.participants.map((p) => p.name));
      const name = BOT_NAMES.find((n) => !used.has(n)) ?? `Bot ${bots.length + 1}`;
      bots.push(this.newParticipant(room, { playerId: null, name, isBot: true, botLevel: room.botLevel }));
    }
  }

  private detachFromCurrentRoom(actor: Actor): void {
    const code = this.playerRoom.get(actor.playerId);
    const current = code ? this.rooms.get(code) : undefined;
    if (!current) {
      this.playerRoom.delete(actor.playerId);
      return;
    }
    if (current.status === 'LOBBY') {
      this.leaveRoom(actor);
    } else if (current.status === 'FINISHED') {
      this.playerRoom.delete(actor.playerId);
    } else {
      throw new DomainError('WRONG_PHASE', `Você já está em uma partida em andamento (sala ${current.code}). Saia dela antes de criar outra.`);
    }
  }

  createRoom(actor: Actor, input: RoomCreateInput): string {
    this.detachFromCurrentRoom(actor);
    const room: RoomState = {
      id: this.newId(),
      code: this.generateCode(),
      hostId: '',
      status: 'LOBBY',
      maxPlayers: input.maxPlayers,
      botSlots: input.mode === 'solo' ? input.maxPlayers - 1 : input.botSlots,
      botLevel: input.botLevel,
      seed: this.newSeed(),
      createdAt: this.now(),
      participants: [],
      teams: {},
      queue: [],
      queueIndex: 0,
      auction: null,
      tournament: null,
    };
    const host = this.newParticipant(room, { playerId: actor.playerId, name: actor.name, isBot: false, botLevel: null });
    room.hostId = host.id;
    this.syncBots(room);
    this.rooms.set(room.code, room);
    this.usedCodes.add(room.code);
    this.playerRoom.set(actor.playerId, room.code);
    this.persist(room, (s) => this.repo.saveRoom(s));
    this.out.roomChanged(room);
    return room.code;
  }

  joinRoom(actor: Actor, code: string): string {
    const room = this.rooms.get(code);
    if (!room) throw new DomainError('ROOM_NOT_FOUND', 'Sala não encontrada. Confira o código.');

    const existing = room.participants.find((p) => p.playerId === actor.playerId);
    if (existing) {
      // Reentrada/reconexão: devolve o jogador à sala sem mudar nada no jogo.
      const previous = this.playerRoom.get(actor.playerId);
      if (previous && previous !== code) this.detachFromCurrentRoom(actor);
      this.playerRoom.set(actor.playerId, code);
      existing.connected = true;
      this.out.roomChanged(room);
      return code;
    }
    if (room.status !== 'LOBBY') throw new DomainError('ROOM_STARTED', 'Esta partida já começou.');
    if (this.humans(room).length >= room.maxPlayers - room.botSlots) throw new DomainError('ROOM_FULL', 'A sala está cheia.');
    this.detachFromCurrentRoom(actor);
    this.newParticipant(room, { playerId: actor.playerId, name: actor.name, isBot: false, botLevel: null });
    this.playerRoom.set(actor.playerId, code);
    this.persist(room, (s) => this.repo.saveRoom(s));
    this.out.roomChanged(room);
    this.out.notice(room, { kind: 'info', message: `${actor.name} entrou na sala.` });
    return code;
  }

  leaveRoom(actor: Actor): void {
    const room = this.requireRoom(actor);
    const me = this.requireParticipant(room, actor);
    this.playerRoom.delete(actor.playerId);

    if (room.status !== 'LOBBY') {
      me.connected = false;
      this.out.roomChanged(room);
      return;
    }
    room.participants = room.participants.filter((p) => p.id !== me.id);
    delete room.teams[me.id];
    const remainingHumans = this.humans(room);
    if (remainingHumans.length === 0) {
      this.rooms.delete(room.code);
      this.persist(room, (s) => this.repo.deleteRoom(s.id));
      return;
    }
    if (room.hostId === me.id) {
      const nextHost = [...remainingHumans].sort((a, b) => a.joinOrder - b.joinOrder)[0];
      if (nextHost) room.hostId = nextHost.id;
    }
    this.persist(room, (s) => this.repo.saveRoom(s));
    this.out.roomChanged(room);
    this.out.notice(room, { kind: 'info', message: `${actor.name} saiu da sala.` });
  }

  updateSettings(actor: Actor, input: RoomSettingsInput): void {
    const room = this.requireRoom(actor);
    this.requireHost(room, actor);
    if (room.status !== 'LOBBY') throw new DomainError('WRONG_PHASE', 'As configurações só podem mudar no lobby.');
    if (this.humans(room).length > input.maxPlayers - input.botSlots) {
      throw new DomainError('ROOM_FULL', 'Há mais jogadores na sala do que vagas com essa configuração.');
    }
    room.maxPlayers = input.maxPlayers;
    room.botSlots = input.botSlots;
    room.botLevel = input.botLevel;
    this.syncBots(room);
    this.persist(room, (s) => this.repo.saveRoom(s));
    this.out.roomChanged(room);
    this.out.teamsChanged(room);
  }

  setConnected(playerId: string, connected: boolean): void {
    const code = this.playerRoom.get(playerId);
    const room = code ? this.rooms.get(code) : undefined;
    const p = room?.participants.find((x) => x.playerId === playerId);
    if (!room || !p || p.connected === connected) return;
    p.connected = connected;
    this.out.roomChanged(room);
  }

  getSnapshot(playerId: string): Snapshot | null {
    const code = this.playerRoom.get(playerId);
    const room = code ? this.rooms.get(code) : undefined;
    const me = room?.participants.find((p) => p.playerId === playerId);
    if (!room || !me) return null;
    return {
      room: buildRoomView(room, me.id),
      auction: buildAuctionView(room, this.now()),
      teams: buildTeamViews(room),
      tournament: buildTournamentView(room),
    };
  }

  isInRoom(playerId: string, code: string): boolean {
    return this.playerRoom.get(playerId) === code;
  }

  getRoomInfo(code: string): RoomInfo | null {
    const room = this.rooms.get(code);
    if (!room) return null;
    return {
      code: room.code,
      status: room.status,
      humans: this.humans(room).length,
      humanCapacity: room.maxPlayers - room.botSlots,
      maxPlayers: room.maxPlayers,
    };
  }

  /** Remove salas finalizadas/abandonadas da memória (o banco continua com o histórico). */
  sweepIdleRooms(ttlMs: number): number {
    let removed = 0;
    for (const room of [...this.rooms.values()]) {
      const anyConnected = this.humans(room).some((p) => p.connected);
      if (anyConnected || this.now() - room.createdAt < ttlMs) continue;
      const t = this.roomTimers.get(room.id);
      if (t) {
        this.timers.clearTimeout(t.end);
        this.timers.clearTimeout(t.next);
        for (const h of t.bots.values()) this.timers.clearTimeout(h);
        this.roomTimers.delete(room.id);
      }
      this.rooms.delete(room.code);
      this.persistQueues.delete(room.id);
      for (const p of room.participants) if (p.playerId && this.playerRoom.get(p.playerId) === room.code) this.playerRoom.delete(p.playerId);
      removed++;
    }
    return removed;
  }

  // ───────────────────────── início e leilão ─────────────────────────

  startGame(actor: Actor): void {
    const room = this.requireRoom(actor);
    this.requireHost(room, actor);
    if (room.status !== 'LOBBY') throw new DomainError('WRONG_PHASE', 'A partida já começou.');
    if (room.participants.length < MIN_PARTICIPANTS) {
      throw new DomainError('NOT_ENOUGH_PLAYERS', `São necessários pelo menos ${MIN_PARTICIPANTS} participantes (use bots para completar).`);
    }
    room.status = 'AUCTION';
    room.queue = buildAuctionQueue(room.seed, room.participants.length);
    room.queueIndex = 0;
    room.auction = null;
    this.persist(room, (s) => this.repo.saveRoom(s));
    this.broadcastAll(room);
    this.out.notice(room, { kind: 'success', message: 'O leilão vai começar!' });
    this.scheduleNext(room, this.config.firstAuctionDelayMs);
  }

  private scheduleNext(room: RoomState, delayMs: number): void {
    const t = this.timersOf(room);
    this.timers.clearTimeout(t.next);
    t.next = this.timers.setTimeout(() => this.startNextAuction(room), delayMs);
  }

  private scheduleEnd(room: RoomState, auction: AuctionState): void {
    const t = this.timersOf(room);
    this.timers.clearTimeout(t.end);
    t.end = this.timers.setTimeout(() => this.closeAuction(room, auction.id), Math.max(0, auction.endsAt - this.now()));
  }

  private startNextAuction(room: RoomState): void {
    if (room.status !== 'AUCTION') return;
    const characterId = room.queue[room.queueIndex];
    if (characterId === undefined) {
      this.finishAuctionPhase(room);
      return;
    }
    const character = getCharacter(characterId);
    const now = this.now();
    const auction: AuctionState = {
      id: this.newId(),
      index: room.queueIndex,
      characterId,
      startingBid: character.basePrice,
      currentBid: null,
      leaderId: null,
      bids: [],
      status: 'ACTIVE',
      startedAt: now,
      endsAt: now + this.config.auctionDurationMs,
      winnerId: null,
      finalPrice: null,
      nextStartsAt: null,
    };
    room.queueIndex++;
    room.auction = auction;
    this.persist(room, (s) => this.repo.saveRoom(s).then(() => this.repo.saveAuction(s, auction)));
    this.out.roomChanged(room);
    this.out.auctionChanged(room);

    if (!this.anyoneCanBid(room, auction)) {
      // Ninguém pode cobrir nem o valor inicial: encerra sem vencedor em vez de esperar o relógio.
      this.closeAuction(room, auction.id, true);
      return;
    }
    this.scheduleEnd(room, auction);
    this.scheduleBots(room);
  }

  private anyoneCanBid(room: RoomState, auction: AuctionState): boolean {
    return room.participants.some((p) => this.checkBid(room, auction, p, auction.startingBid).ok);
  }

  private checkBid(room: RoomState, auction: AuctionState, bidder: ParticipantState, amount: number) {
    const owned = room.participants.some((p) => room.teams[p.id]?.roster.some((r) => r.characterId === auction.characterId));
    return validateBid({
      auctionStatus: auction.status,
      now: this.now(),
      endsAt: auction.endsAt,
      startingBid: auction.startingBid,
      currentBid: auction.currentBid,
      leaderId: auction.leaderId,
      bidderId: bidder.id,
      bidderBudget: bidder.budget,
      bidderRosterSize: room.teams[bidder.id]?.roster.length ?? 0,
      characterAlreadyOwned: owned,
      amount,
    });
  }

  placeBid(actor: Actor, input: { auctionId: string; amount: number }): number {
    const room = this.requireRoom(actor);
    const me = this.requireParticipant(room, actor);
    if (room.status !== 'AUCTION') throw new DomainError('WRONG_PHASE', 'Não há leilão em andamento.');
    const auction = room.auction;
    if (!auction || auction.id !== input.auctionId) {
      throw new DomainError('AUCTION_MISMATCH', 'Este leilão já mudou. Acompanhe o personagem atual.');
    }
    this.submitBid(room, auction, me, input.amount);
    return input.amount;
  }

  /**
   * Único ponto que altera um leilão ativo. É síncrono: o loop de eventos do Node processa um lance
   * por vez, então lances simultâneos são ordenados pela chegada ao servidor (primeiro válido vence;
   * o seguinte com o mesmo valor é rejeitado como BID_TOO_LOW).
   */
  private submitBid(room: RoomState, auction: AuctionState, bidder: ParticipantState, amount: number): void {
    const check = this.checkBid(room, auction, bidder, amount);
    if (!check.ok) throw new DomainError(check.code, check.message);

    const now = this.now();
    const bid: BidState = { id: this.newId(), participantId: bidder.id, amount, at: now };
    auction.bids.push(bid);
    auction.currentBid = amount;
    auction.leaderId = bidder.id;
    const newEnd = nextEndsAt(now, auction.endsAt, this.config.antiSnipeWindowMs, this.config.antiSnipeExtensionMs);
    const extended = newEnd !== auction.endsAt;
    auction.endsAt = newEnd;
    if (extended) this.scheduleEnd(room, auction);

    this.persist(room, (s) => this.repo.saveBid(s, auction, bid));
    this.out.auctionChanged(room);
    this.scheduleBots(room);
  }

  private scheduleBots(room: RoomState): void {
    const auction = room.auction;
    if (!auction || auction.status !== 'ACTIVE') return;
    const t = this.timersOf(room);
    for (const bot of room.participants.filter((p) => p.isBot && p.botLevel)) {
      if (auction.leaderId === bot.id || t.bots.has(bot.id)) continue;
      const decision = this.botDecision(room, auction, bot);
      if (!decision) continue;
      const handle = this.timers.setTimeout(() => {
        t.bots.delete(bot.id);
        const current = room.auction;
        if (!current || current.id !== auction.id || current.status !== 'ACTIVE' || current.leaderId === bot.id) return;
        const again = this.botDecision(room, current, bot);
        if (!again) return;
        try {
          this.submitBid(room, current, bot, again.amount);
        } catch (error) {
          if (!(error instanceof DomainError)) throw error;
          logger.info(`Bot ${bot.name} teve lance recusado: ${error.code}`);
        }
      }, Math.max(1, Math.round(decision.delayMs * this.config.botDelayScale)));
      t.bots.set(bot.id, handle);
    }
  }

  private botDecision(room: RoomState, auction: AuctionState, bot: ParticipantState) {
    if (!bot.botLevel) return null;
    const min = auction.currentBid === null ? auction.startingBid : auction.currentBid + 1;
    const rng = mulberry32(hashString(`${room.seed}:${auction.index}:${bot.id}:${auction.bids.length}`));
    return decideBid(
      {
        level: bot.botLevel,
        character: getCharacter(auction.characterId),
        minNextBid: min,
        budget: bot.budget,
        roster: (room.teams[bot.id]?.roster ?? []).map((r) => getCharacter(r.characterId)),
      },
      rng,
    );
  }

  private closeAuction(room: RoomState, auctionId: string, immediate = false): void {
    const auction = room.auction;
    if (!auction || auction.id !== auctionId || auction.status !== 'ACTIVE') return;
    if (!immediate && this.now() < auction.endsAt) {
      this.scheduleEnd(room, auction);
      return;
    }
    const t = this.timersOf(room);
    this.timers.clearTimeout(t.end);
    this.clearBotTimers(room);

    const character = getCharacter(auction.characterId);
    const winner = auction.leaderId ? room.participants.find((p) => p.id === auction.leaderId) : undefined;
    const price = auction.currentBid;
    const team = winner ? room.teams[winner.id] : undefined;
    const owned = room.participants.some((p) => room.teams[p.id]?.roster.some((r) => r.characterId === character.id));
    auction.status = 'CLOSED';

    if (winner && team && price !== null) {
      if (winner.budget >= price && team.roster.length < MAX_ROSTER && !owned) {
        winner.budget -= price;
        team.roster.push({ characterId: character.id, price });
        team.lineup = autoLineup(team.roster.map((r) => getCharacter(r.characterId)));
        auction.winnerId = winner.id;
        auction.finalPrice = price;
      } else {
        logger.error(`Contratação recusada no fechamento (sala ${room.code}, ${winner.name}, ${character.name}).`);
      }
    }
    const delay = auction.winnerId ? this.config.intermissionMs : Math.min(this.config.intermissionMs, 1_000);
    auction.nextStartsAt = this.now() + delay;

    this.persist(room, (s) => this.repo.saveRoom(s).then(() => this.repo.saveAuction(s, auction)));
    this.broadcastAll(room);
    this.out.notice(
      room,
      auction.winnerId && winner
        ? { kind: 'success', message: `${winner.name} contratou ${character.name} por ${auction.finalPrice} M!` }
        : { kind: 'info', message: `${character.name} ficou sem lances.` },
    );
    this.scheduleNext(room, delay);
  }

  private finishAuctionPhase(room: RoomState): void {
    this.clearBotTimers(room);
    this.completeRosters(room);
    room.status = 'TEAM_BUILDING';
    this.persist(room, (s) => this.repo.saveRoom(s));
    this.broadcastAll(room);
    this.out.notice(room, { kind: 'success', message: 'Leilão encerrado! Monte sua escalação.' });
  }

  /** Quem terminou com menos de 5 personagens recebe agentes livres baratos (pelo preço base, se houver orçamento). */
  private completeRosters(room: RoomState): void {
    const owned = new Set(room.participants.flatMap((p) => (room.teams[p.id]?.roster ?? []).map((r) => r.characterId)));
    for (const p of room.participants) {
      const team = room.teams[p.id];
      if (!team) continue;
      const signed: Character[] = [];
      while (team.roster.length < STARTERS) {
        const missing = STARTERS - team.roster.length;
        const maxPrice = Math.min(3, p.budget - (missing - 1) * MIN_PRICE);
        const pool = CHARACTERS.filter((c) => !owned.has(c.id) && c.basePrice <= maxPrice && p.budget - c.basePrice >= budgetReserve(team.roster.length));
        const current = team.roster.map((r) => getCharacter(r.characterId));
        const needed = this.neededSlotCharacter(current);
        const pick = [...pool].sort((a, b) => needed(b) - needed(a) || b.ovr - a.ovr)[0];
        if (!pick) break;
        owned.add(pick.id);
        p.budget -= pick.basePrice;
        team.roster.push({ characterId: pick.id, price: pick.basePrice });
        signed.push(pick);
      }
      if (p.playerId && signed.length > 0) {
        const list = signed.map((c) => `${c.name} (${c.basePrice} M)`).join(', ');
        this.out.notice(room, { kind: 'info', message: `Agentes livres contratados para completar seu time: ${list}.` }, p.playerId);
      }
      team.lineup = autoLineup(team.roster.map((r) => getCharacter(r.characterId)));
    }
  }

  /** Pontua candidatos pelo ganho na escalação atual (quanto mais o time melhora, maior). */
  private neededSlotCharacter(current: Character[]): (candidate: Character) => number {
    const strength = (chars: Character[]) => computeTeamProfile(autoLineup(chars).map((id) => (id ? getCharacter(id) : null)), 'equilibrada').strength;
    const base = strength(current);
    return (candidate) => strength([...current, candidate]) - base;
  }

  // ───────────────────────── elenco e campeonato ─────────────────────────

  setLineup(actor: Actor, input: LineupInput): void {
    const room = this.requireRoom(actor);
    const me = this.requireParticipant(room, actor);
    if (room.status !== 'TEAM_BUILDING') throw new DomainError('WRONG_PHASE', 'A escalação só pode ser alterada depois do leilão e antes do campeonato.');
    const team = room.teams[me.id] as TeamState;
    const error = validateLineupIds(input.lineup, team.roster.map((r) => r.characterId));
    if (error) throw new DomainError('INVALID_LINEUP', error);
    team.formation = input.formation;
    team.lineup = [...input.lineup];
    this.persist(room, (s) => this.repo.saveRoom(s));
    this.out.teamsChanged(room);
  }

  startTournament(actor: Actor): void {
    const room = this.requireRoom(actor);
    this.requireHost(room, actor);
    if (room.status !== 'TEAM_BUILDING') throw new DomainError('WRONG_PHASE', 'O campeonato só começa depois do leilão.');
    const ids = [...room.participants].sort((a, b) => a.joinOrder - b.joinOrder).map((p) => p.id);
    room.tournament = {
      id: this.newId(),
      status: 'IN_PROGRESS',
      roundsPlayed: 0,
      totalRounds: totalRoundsFor(ids.length),
      fixtures: generateRoundRobin(ids).map((f) => ({ ...f, matchId: null })),
      matches: [],
    };
    room.status = 'TOURNAMENT';
    this.persist(room, (s) => this.repo.saveRoom(s).then(() => this.repo.saveTournament(s)));
    this.out.roomChanged(room);
    this.out.tournamentChanged(room);
    this.out.notice(room, { kind: 'success', message: 'O campeonato começou!' });
  }

  playRound(actor: Actor, all = false): void {
    const room = this.requireRoom(actor);
    this.requireHost(room, actor);
    const t = room.tournament;
    if (room.status !== 'TOURNAMENT' || !t) throw new DomainError('WRONG_PHASE', 'O campeonato não está em andamento.');
    do {
      this.simulateNextRound(room);
    } while (all && t.status === 'IN_PROGRESS');

    this.persist(room, (s) => this.repo.saveRoom(s).then(() => this.repo.saveTournament(s)));
    if (t.status === 'FINISHED') {
      this.persist(room, (s) => this.repo.recordResults(s));
      const champion = computeStandings(
        [...room.participants].sort((a, b) => a.joinOrder - b.joinOrder).map((p) => p.id),
        t.matches,
      )[0];
      const name = room.participants.find((p) => p.id === champion?.participantId)?.name ?? '?';
      this.out.notice(room, { kind: 'success', message: `Campeonato encerrado! Campeão: ${name}.` });
    }
    this.out.roomChanged(room);
    this.out.tournamentChanged(room);
  }

  private teamInput(room: RoomState, participantId: string): TeamInput {
    const team = room.teams[participantId] as TeamState;
    const lineup = team.lineup.map((id) => (id ? getCharacter(id) : null));
    return { participantId, lineup, profile: computeTeamProfile(lineup, team.formation) };
  }

  private simulateNextRound(room: RoomState): void {
    const t = room.tournament;
    if (!t || t.status !== 'IN_PROGRESS') return;
    const round = t.roundsPlayed + 1;
    for (const fixture of t.fixtures.filter((f) => f.round === round)) {
      const matchId = this.newId();
      const result = simulateMatch({
        matchId,
        round,
        home: this.teamInput(room, fixture.homeId),
        away: this.teamInput(room, fixture.awayId),
        seed: hashString(`${room.seed}|${round}|${fixture.homeId}|${fixture.awayId}`),
      });
      fixture.matchId = matchId;
      t.matches.push(result);
    }
    t.roundsPlayed = round;
    if (round >= t.totalRounds) {
      t.status = 'FINISHED';
      room.status = 'FINISHED';
    }
  }
}
