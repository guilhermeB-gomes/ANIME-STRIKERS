export interface BucketSpec {
  capacity: number;
  refillPerSec: number;
}

/** Token bucket por chave (jogador + tipo de evento). Relógio injetável para testes. */
export class RateLimiter {
  private buckets = new Map<string, { tokens: number; updatedAt: number }>();

  constructor(
    private readonly specFor: (event: string) => BucketSpec,
    private readonly now: () => number = Date.now,
  ) {}

  take(playerId: string, event: string): boolean {
    const spec = this.specFor(event);
    const key = `${playerId}:${event}`;
    const t = this.now();
    const bucket = this.buckets.get(key) ?? { tokens: spec.capacity, updatedAt: t };
    bucket.tokens = Math.min(spec.capacity, bucket.tokens + ((t - bucket.updatedAt) / 1000) * spec.refillPerSec);
    bucket.updatedAt = t;
    const allowed = bucket.tokens >= 1;
    if (allowed) bucket.tokens -= 1;
    this.buckets.set(key, bucket);
    return allowed;
  }

  forget(playerId: string): void {
    for (const key of this.buckets.keys()) if (key.startsWith(`${playerId}:`)) this.buckets.delete(key);
  }
}

export function defaultSpec(event: string): BucketSpec {
  return event === 'auction:bid' ? { capacity: 8, refillPerSec: 4 } : { capacity: 20, refillPerSec: 5 };
}
