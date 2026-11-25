import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client';
import { loadDotEnv } from '../src/load-env';
import { seedCatalog } from '../src/repositories/catalog-seed';

loadDotEnv();

const url = process.env.DATABASE_URL;
if (!url) throw new Error('Defina DATABASE_URL para executar o seed.');

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });

seedCatalog(prisma)
  .then((r) => console.info(`Seed concluído: ${r.animes} animes, ${r.abilities} habilidades, ${r.characters} personagens.`))
  .catch((error: unknown) => {
    console.error('Falha no seed:', error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
