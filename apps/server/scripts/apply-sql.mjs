// Aplica um arquivo .sql (ex.: a migration) em um banco limpo. Alternativa ao `prisma migrate deploy`
// quando o schema-engine do Prisma não pode ser baixado. Uso: DATABASE_URL=... node scripts/apply-sql.mjs arquivo.sql [--reset]
import { readFileSync } from 'node:fs';
import pg from 'pg';

const [file, flag] = process.argv.slice(2);
if (!file || !process.env.DATABASE_URL) {
  console.error('Uso: DATABASE_URL=... node scripts/apply-sql.mjs arquivo.sql [--reset]');
  process.exit(1);
}
const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
if (flag === '--reset') await client.query('DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;');
await client.query(readFileSync(file, 'utf8'));
const { rows } = await client.query("SELECT count(*)::int AS n FROM information_schema.tables WHERE table_schema = 'public'");
console.log(`SQL aplicado. Tabelas no schema public: ${rows[0].n}`);
await client.end();
