import { existsSync } from 'node:fs';
import { createServer, type Server as HttpServer } from 'node:http';
import { join, resolve } from 'node:path';
import cors from 'cors';
import express, { type ErrorRequestHandler } from 'express';
import { rateLimit } from 'express-rate-limit';
import helmet from 'helmet';
import { ZodError } from 'zod';
import type { ErrorCode } from '@strikers/shared';
import type { AppConfig } from './config';
import { DomainError } from './errors';
import { logger } from './logger';
import type { GameRepository } from './repositories/types';
import { createRouter } from './routes/http';
import { AuthService } from './services/auth-service';
import { GameService, type GameConfig } from './services/game-service';
import { RateLimiter, defaultSpec } from './services/rate-limiter';
import { SocketBroadcaster, createIo, registerSocketHandlers, type StrikersServer } from './socket';

export interface AppOptions {
  config: AppConfig;
  repo: GameRepository;
  game?: Partial<GameConfig>;
  /** Limites HTTP por IP/minuto. Testes sobem o valor. */
  httpLimits?: { global: number; guests: number };
}

export interface RunningApp {
  httpServer: HttpServer;
  io: StrikersServer;
  service: GameService;
  auth: AuthService;
  close(): Promise<void>;
}

const STATUS: Partial<Record<ErrorCode, number>> = {
  VALIDATION: 400,
  INVALID_CODE: 400,
  UNAUTHENTICATED: 401,
  ROOM_NOT_FOUND: 404,
  RATE_LIMITED: 429,
};

const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  if (error instanceof DomainError) {
    res.status(STATUS[error.code] ?? 409).json({ error: { code: error.code, message: error.message } });
    return;
  }
  if (error instanceof ZodError) {
    res.status(400).json({ error: { code: 'VALIDATION', message: error.issues[0]?.message ?? 'Dados inválidos.' } });
    return;
  }
  if (error instanceof SyntaxError) {
    res.status(400).json({ error: { code: 'VALIDATION', message: 'JSON inválido.' } });
    return;
  }
  logger.error('Erro HTTP inesperado:', error);
  res.status(500).json({ error: { code: 'INTERNAL', message: 'Erro interno do servidor.' } });
};

export function createApp({ config, repo, game, httpLimits }: AppOptions): RunningApp {
  const gameConfig = { ...config.game, ...game };
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);
  // Em produção o CSP padrão do Helmet (inclui upgrade-insecure-requests, para HTTPS). Em dev/test aceitamos http.
  app.use(
    helmet(config.nodeEnv === 'production' ? {} : { contentSecurityPolicy: { directives: { ...helmet.contentSecurityPolicy.getDefaultDirectives(), 'upgrade-insecure-requests': null } } }),
  );
  app.use(cors({ origin: config.clientOrigins }));
  app.use(express.json({ limit: '10kb' }));

  const limits = httpLimits ?? { global: 300, guests: 20 };
  const limiterHandler = (_req: express.Request, res: express.Response) => {
    res.status(429).json({ error: { code: 'RATE_LIMITED', message: 'Muitas requisições. Tente novamente em instantes.' } });
  };
  app.use('/api', rateLimit({ windowMs: 60_000, limit: limits.global, standardHeaders: true, legacyHeaders: false, handler: limiterHandler }));
  const guestRateLimit = rateLimit({ windowMs: 60_000, limit: limits.guests, standardHeaders: true, legacyHeaders: false, handler: limiterHandler });

  const httpServer = createServer(app);
  const io = createIo(httpServer, config.clientOrigins);
  const broadcaster = new SocketBroadcaster(io);
  const service = new GameService({ repo, broadcaster, config: gameConfig });
  broadcaster.setMembership((playerId, code) => service.isInRoom(playerId, code));
  const auth = new AuthService(config.sessionSecret, repo);
  const limiter = new RateLimiter(defaultSpec);

  app.use('/api', createRouter({ auth, service, repo, guestRateLimit }));
  app.use('/api', (_req, res) => {
    res.status(404).json({ error: { code: 'ROOM_NOT_FOUND', message: 'Rota não encontrada.' } });
  });

  const dist = config.clientDist ? resolve(config.clientDist) : undefined;
  if (dist && existsSync(join(dist, 'index.html'))) {
    app.use(express.static(dist));
    app.use((req, res, next) => {
      if (req.method !== 'GET') return next();
      res.sendFile(join(dist, 'index.html'));
    });
  }

  app.use(errorHandler);
  registerSocketHandlers({ io, service, auth, limiter });

  return {
    httpServer,
    io,
    service,
    auth,
    async close() {
      service.shutdown();
      await service.flush();
      await io.close();
      if (httpServer.listening) await new Promise<void>((resolve) => httpServer.close(() => resolve()));
      await repo.close();
    },
  };
}
