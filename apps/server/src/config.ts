import { z } from 'zod';
import type { GameConfig } from './services/game-service';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3001),
  CLIENT_ORIGIN: z.string().default('http://localhost:5173'),
  SESSION_SECRET: z.string().min(16, 'SESSION_SECRET precisa ter pelo menos 16 caracteres.').optional(),
  DATABASE_URL: z.string().optional(),
  CLIENT_DIST: z.string().optional(),
  // Ajuste fino do ritmo do jogo (ms). Omitidos = regras oficiais (15 s, janela de 3 s, +5 s...). Úteis em testes E2E.
  GAME_AUCTION_MS: z.coerce.number().int().min(100).optional(),
  GAME_INTERMISSION_MS: z.coerce.number().int().min(0).optional(),
  GAME_FIRST_DELAY_MS: z.coerce.number().int().min(0).optional(),
  GAME_SNIPE_WINDOW_MS: z.coerce.number().int().min(0).optional(),
  GAME_SNIPE_EXTENSION_MS: z.coerce.number().int().min(0).optional(),
  GAME_BOT_DELAY_SCALE: z.coerce.number().min(0.001).max(10).optional(),
});

export interface AppConfig {
  nodeEnv: 'development' | 'test' | 'production';
  port: number;
  clientOrigins: string[];
  sessionSecret: string;
  databaseUrl: string | undefined;
  clientDist: string | undefined;
  game: Partial<GameConfig>;
}

const DEV_SECRET = 'dev-only-secret-change-me-before-deploy';

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = envSchema.parse(env);
  if (parsed.NODE_ENV === 'production' && !parsed.SESSION_SECRET) {
    throw new Error('SESSION_SECRET é obrigatório em produção.');
  }
  return {
    nodeEnv: parsed.NODE_ENV,
    port: parsed.PORT,
    clientOrigins: parsed.CLIENT_ORIGIN.split(',').map((o) => o.trim()).filter(Boolean),
    sessionSecret: parsed.SESSION_SECRET ?? DEV_SECRET,
    databaseUrl: parsed.DATABASE_URL,
    clientDist: parsed.CLIENT_DIST,
    game: {
      ...(parsed.GAME_AUCTION_MS !== undefined && { auctionDurationMs: parsed.GAME_AUCTION_MS }),
      ...(parsed.GAME_INTERMISSION_MS !== undefined && { intermissionMs: parsed.GAME_INTERMISSION_MS }),
      ...(parsed.GAME_FIRST_DELAY_MS !== undefined && { firstAuctionDelayMs: parsed.GAME_FIRST_DELAY_MS }),
      ...(parsed.GAME_SNIPE_WINDOW_MS !== undefined && { antiSnipeWindowMs: parsed.GAME_SNIPE_WINDOW_MS }),
      ...(parsed.GAME_SNIPE_EXTENSION_MS !== undefined && { antiSnipeExtensionMs: parsed.GAME_SNIPE_EXTENSION_MS }),
      ...(parsed.GAME_BOT_DELAY_SCALE !== undefined && { botDelayScale: parsed.GAME_BOT_DELAY_SCALE }),
    },
  };
}
