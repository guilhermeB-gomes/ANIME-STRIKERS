import { vi } from 'vitest';
import type { Notice } from '@strikers/shared';
import { MemoryRepository } from '../src/repositories/memory';
import { GameService, type Actor, type Broadcaster, type GameConfig } from '../src/services/game-service';
import type { RoomState } from '../src/types/state';

export class SpyBroadcaster implements Broadcaster {
  events: string[] = [];
  notices: { notice: Notice; to?: string }[] = [];
  roomChanged = () => void this.events.push('room');
  auctionChanged = () => void this.events.push('auction');
  teamsChanged = () => void this.events.push('teams');
  tournamentChanged = () => void this.events.push('tournament');
  notice(_room: RoomState, notice: Notice, to?: string) {
    this.notices.push({ notice, ...(to ? { to } : {}) });
  }
}

export const alice: Actor = { playerId: 'player-alice', name: 'Alice' };
export const bob: Actor = { playerId: 'player-bob', name: 'Bob' };
export const carol: Actor = { playerId: 'player-carol', name: 'Carol' };

export function setup(overrides: Partial<GameConfig> = {}, repo = new MemoryRepository()) {
  let counter = 0;
  const spy = new SpyBroadcaster();
  const service = new GameService({
    repo,
    broadcaster: spy,
    config: { auctionDurationMs: 15_000, intermissionMs: 3_000, firstAuctionDelayMs: 3_000, botDelayScale: 1, ...overrides },
    newSeed: () => 12345,
    newId: () => `id-${++counter}`,
  });
  return { service, spy, repo };
}

export const advance = (ms: number) => vi.advanceTimersByTimeAsync(ms);

/** Cria sala multi com 2 humanos, inicia e deixa o primeiro leilão ativo. */
export async function startedTwoPlayerRoom(overrides: Partial<GameConfig> = {}) {
  const ctx = setup(overrides);
  const code = ctx.service.createRoom(alice, { mode: 'multi', maxPlayers: 2, botSlots: 0, botLevel: 'NORMAL' });
  ctx.service.joinRoom(bob, code);
  ctx.service.startGame(alice);
  await advance(3_000);
  const snap = () => {
    const s = ctx.service.getSnapshot(alice.playerId);
    if (!s) throw new Error('sem snapshot');
    return s;
  };
  const meId = (actor: Actor) => {
    const s = ctx.service.getSnapshot(actor.playerId);
    if (!s) throw new Error('sem snapshot');
    return s.room.youId;
  };
  return { ...ctx, code, snap, meId };
}

/** Relógio manual: substitui setTimeout/Date, sem tocar nos timers globais (seguro com I/O real de banco). */
export class FakeClock {
  t = 1_700_000_000_000;
  private seq = 0;
  private queue: { id: number; at: number; fn: () => void }[] = [];
  now = () => this.t;
  timers = {
    setTimeout: (fn: () => void, ms: number): unknown => {
      const id = ++this.seq;
      this.queue.push({ id, at: this.t + ms, fn });
      return id;
    },
    clearTimeout: (handle: unknown): void => {
      this.queue = this.queue.filter((x) => x.id !== handle);
    },
  };

  advance(ms: number): void {
    const target = this.t + ms;
    for (;;) {
      const next = [...this.queue].sort((a, b) => a.at - b.at || a.id - b.id)[0];
      if (!next || next.at > target) break;
      this.queue = this.queue.filter((x) => x.id !== next.id);
      this.t = Math.max(this.t, next.at);
      next.fn();
    }
    this.t = target;
  }
}
