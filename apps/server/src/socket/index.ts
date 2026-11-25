import type { Server as HttpServer } from 'node:http';
import { Server, type Socket } from 'socket.io';
import type { ZodType } from 'zod';
import {
  bidSchema,
  emptyPayloadSchema,
  lineupSchema,
  playRoundSchema,
  roomCreateSchema,
  roomJoinSchema,
  roomSettingsSchema,
  type Ack,
  type ClientToServerEvents,
  type DomainErrorPayload,
  type Notice,
  type ServerToClientEvents,
} from '@strikers/shared';
import { DomainError } from '../errors';
import { logger } from '../logger';
import type { AuthService } from '../services/auth-service';
import type { Actor, Broadcaster, GameService } from '../services/game-service';
import type { RateLimiter } from '../services/rate-limiter';
import { buildAuctionView, buildRoomView, buildTeamViews, buildTournamentView } from '../services/views';
import type { RoomState } from '../types/state';

export interface SocketData {
  player: Actor;
}

export type StrikersServer = Server<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>;
type StrikersSocket = Socket<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>;

const channel = (playerId: string) => `player:${playerId}`;

/** Envia o estado para cada jogador humano da sala (cada um no seu canal privado). */
export class SocketBroadcaster implements Broadcaster {
  private isMember: (playerId: string, code: string) => boolean = () => true;

  constructor(
    private readonly io: StrikersServer,
    private readonly now: () => number = Date.now,
  ) {}

  setMembership(fn: (playerId: string, code: string) => boolean): void {
    this.isMember = fn;
  }

  private recipients(room: RoomState) {
    return room.participants.filter((p) => p.playerId !== null && this.isMember(p.playerId, room.code));
  }

  roomChanged(room: RoomState): void {
    for (const p of this.recipients(room)) this.io.to(channel(p.playerId as string)).emit('room:state', buildRoomView(room, p.id));
  }

  auctionChanged(room: RoomState): void {
    const view = buildAuctionView(room, this.now());
    for (const p of this.recipients(room)) this.io.to(channel(p.playerId as string)).emit('auction:state', view);
  }

  teamsChanged(room: RoomState): void {
    const views = buildTeamViews(room);
    for (const p of this.recipients(room)) this.io.to(channel(p.playerId as string)).emit('teams:state', views);
  }

  tournamentChanged(room: RoomState): void {
    const view = buildTournamentView(room);
    for (const p of this.recipients(room)) this.io.to(channel(p.playerId as string)).emit('tournament:state', view);
  }

  notice(room: RoomState, notice: Notice, onlyPlayerId?: string): void {
    for (const p of this.recipients(room)) {
      if (onlyPlayerId && p.playerId !== onlyPlayerId) continue;
      this.io.to(channel(p.playerId as string)).emit('notice', notice);
    }
  }
}

export function createIo(httpServer: HttpServer, origins: string[]): StrikersServer {
  return new Server(httpServer, { cors: { origin: origins, methods: ['GET', 'POST'] }, maxHttpBufferSize: 10_000 });
}

export function toErrorPayload(error: unknown): DomainErrorPayload {
  if (error instanceof DomainError) return { code: error.code, message: error.message };
  logger.error('Erro inesperado em evento de socket:', error);
  return { code: 'INTERNAL', message: 'Erro interno do servidor. Tente novamente.' };
}

interface Deps {
  io: StrikersServer;
  service: GameService;
  auth: AuthService;
  limiter: RateLimiter;
}

/** Autenticação no handshake, entrada/saída de sala, e todos os comandos (validados com Zod). */
export function registerSocketHandlers({ io, service, auth, limiter }: Deps): void {
  const connections = new Map<string, number>();

  io.use((socket, next) => {
    const token: unknown = socket.handshake.auth?.token;
    auth
      .authenticate(token)
      .then((player) => {
        if (!player) {
          next(new Error('UNAUTHENTICATED'));
          return;
        }
        socket.data.player = { playerId: player.id, name: player.name };
        next();
      })
      .catch((error: unknown) => {
        logger.error('Falha na autenticação do socket:', error);
        next(new Error('UNAUTHENTICATED'));
      });
  });

  const sendSnapshot = (playerId: string) => {
    const snap = service.getSnapshot(playerId);
    const target = io.to(channel(playerId));
    if (!snap) {
      // Sem sala ativa (ex.: servidor reiniciado sem banco): o cliente limpa qualquer estado antigo.
      target.emit('room:closed', { reason: 'NO_ROOM' });
      return;
    }
    target.emit('room:state', snap.room);
    target.emit('auction:state', snap.auction);
    target.emit('teams:state', snap.teams);
    target.emit('tournament:state', snap.tournament);
  };

  io.on('connection', (socket: StrikersSocket) => {
    const actor = socket.data.player;
    void socket.join(channel(actor.playerId));
    connections.set(actor.playerId, (connections.get(actor.playerId) ?? 0) + 1);
    service.setConnected(actor.playerId, true);
    sendSnapshot(actor.playerId);

    socket.on('disconnect', () => {
      const left = (connections.get(actor.playerId) ?? 1) - 1;
      if (left <= 0) {
        connections.delete(actor.playerId);
        limiter.forget(actor.playerId);
        service.setConnected(actor.playerId, false);
      } else {
        connections.set(actor.playerId, left);
      }
    });

    // Visão sem tipos por evento apenas para registrar handlers genéricos; payloads são `unknown` e validados com Zod.
    const raw = socket as unknown as { on(event: string, fn: (payload: unknown, ack?: unknown) => void): void };

    const handle = <T, R>(event: keyof ClientToServerEvents, schema: ZodType<T>, run: (data: T) => R, after?: () => void) => {
      raw.on(event, (payload, ack) => {
        const reply = (res: Ack<unknown>) => {
          if (typeof ack === 'function') (ack as (r: Ack<unknown>) => void)(res);
        };
        try {
          if (!limiter.take(actor.playerId, event)) throw new DomainError('RATE_LIMITED', 'Muitas ações em pouco tempo. Aguarde um instante.');
          const parsed = schema.safeParse(payload);
          if (!parsed.success) throw new DomainError('VALIDATION', parsed.error.issues[0]?.message ?? 'Dados inválidos.');
          const data = run(parsed.data);
          after?.();
          reply({ ok: true, data: data ?? undefined });
        } catch (error) {
          reply({ ok: false, error: toErrorPayload(error) });
        }
      });
    };

    handle('room:create', roomCreateSchema, (d) => ({ code: service.createRoom(actor, d) }), () => sendSnapshot(actor.playerId));
    handle('room:join', roomJoinSchema, (d) => ({ code: service.joinRoom(actor, d.code) }), () => sendSnapshot(actor.playerId));
    handle('room:leave', emptyPayloadSchema, () => service.leaveRoom(actor));
    handle('room:settings', roomSettingsSchema, (d) => service.updateSettings(actor, d));
    handle('room:start', emptyPayloadSchema, () => service.startGame(actor));
    handle('auction:bid', bidSchema, (d) => ({ amount: service.placeBid(actor, d) }));
    handle('team:setLineup', lineupSchema, (d) => service.setLineup(actor, d));
    handle('tournament:start', emptyPayloadSchema, () => service.startTournament(actor));
    handle('tournament:playRound', playRoundSchema, (d) => service.playRound(actor, d?.all ?? false));
  });
}
