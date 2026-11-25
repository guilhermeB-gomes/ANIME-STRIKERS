import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { guestCreateSchema } from '@strikers/shared';
import type { GameRepository } from '../repositories/types';
import type { GuestRecord } from '../types/state';
import { DomainError } from '../errors';


/** Identidade de convidado com token assinado (HMAC-SHA256). Não guarda estado de jogo. */
export class AuthService {
  private cache = new Map<string, GuestRecord>();

  constructor(
    private readonly secret: string,
    private readonly repo: GameRepository,
  ) {}

  private sign(playerId: string): string {
    return createHmac('sha256', this.secret).update(playerId).digest('base64url');
  }

  async createGuest(rawName: unknown): Promise<{ player: GuestRecord; token: string }> {
    const parsed = guestCreateSchema.safeParse({ name: rawName });
    if (!parsed.success) {
      throw new DomainError('VALIDATION', parsed.error.issues[0]?.message ?? 'Nome inválido.');
    }
    const player: GuestRecord = { id: randomUUID(), name: parsed.data.name, wins: 0, draws: 0, losses: 0, createdAt: Date.now() };
    await this.repo.saveGuest(player);
    this.cache.set(player.id, player);
    return { player, token: `${player.id}.${this.sign(player.id)}` };
  }

  /** Retorna o convidado se o token for autêntico e o registro existir; senão null. */
  async authenticate(token: unknown): Promise<GuestRecord | null> {
    if (typeof token !== 'string' || token.length > 200) return null;
    const dot = token.lastIndexOf('.');
    if (dot < 1) return null;
    const id = token.slice(0, dot);
    const given = Buffer.from(token.slice(dot + 1));
    const expected = Buffer.from(this.sign(id));
    if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
    const cached = this.cache.get(id);
    if (cached) return cached;
    const stored = await this.repo.getGuest(id);
    if (stored) this.cache.set(id, stored);
    return stored;
  }

  /** Atualiza o cache depois que as estatísticas mudam. */
  async refresh(id: string): Promise<GuestRecord | null> {
    this.cache.delete(id);
    const stored = await this.repo.getGuest(id);
    if (stored) this.cache.set(id, stored);
    return stored;
  }
}
