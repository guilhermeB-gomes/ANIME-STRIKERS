import { defineConfig } from 'prisma/config';
import { loadDotEnv } from './src/load-env';

loadDotEnv();

// DATABASE_URL é obrigatória para migrate/seed. Para `prisma generate` basta um valor qualquer.
export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  datasource: { url: process.env.DATABASE_URL ?? 'postgresql://strikers:strikers@localhost:5432/anime_strikers?schema=public' },
});
