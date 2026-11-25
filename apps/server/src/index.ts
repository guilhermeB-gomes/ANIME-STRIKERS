import { loadConfig } from './config';
import { loadDotEnv } from './load-env';
import { createApp } from './app';
import { logger } from './logger';
import { MemoryRepository } from './repositories/memory';
import type { GameRepository } from './repositories/types';

async function createRepository(databaseUrl: string | undefined): Promise<GameRepository> {
  if (!databaseUrl) {
    logger.warn('DATABASE_URL não definida: usando repositório em MEMÓRIA (os dados somem ao reiniciar). Configure o PostgreSQL para persistência.');
    return new MemoryRepository();
  }
  const { createPrismaRepository } = await import('./repositories/prisma');
  return createPrismaRepository(databaseUrl);
}

async function main(): Promise<void> {
  loadDotEnv();
  const config = loadConfig();
  const repo = await createRepository(config.databaseUrl);
  const app = createApp({ config, repo });
  const restored = await app.service.restore();
  if (restored > 0) logger.info(`${restored} sala(s) recuperada(s) do banco.`);

  const sweep = setInterval(() => app.service.sweepIdleRooms(6 * 60 * 60 * 1000), 10 * 60 * 1000);
  sweep.unref();

  await new Promise<void>((resolve) => app.httpServer.listen(config.port, resolve));
  logger.info(`ANIME STRIKERS server em http://localhost:${config.port}`);

  const stop = () => {
    clearInterval(sweep);
    void app.close().then(() => process.exit(0));
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
}

main().catch((error: unknown) => {
  logger.error('Falha ao iniciar o servidor:', error);
  process.exit(1);
});
