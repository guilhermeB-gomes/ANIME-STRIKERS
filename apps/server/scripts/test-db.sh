#!/usr/bin/env bash
# Roda os testes de integração com PostgreSQL REAL: sobe um Postgres embutido (sem Docker),
# aplica a migration SQL, executa o vitest com TEST_DATABASE_URL e desliga o banco.
# Com Docker, você pode usar o docker-compose.yml e definir TEST_DATABASE_URL manualmente.
set -euo pipefail
cd "$(dirname "$0")/.."
export PRISMA_SCHEMA_ENGINE_BINARY="${PRISMA_SCHEMA_ENGINE_BINARY:-/bin/true}"
URL="$(scripts/embedded-postgres.sh start)"
trap 'scripts/embedded-postgres.sh stop || true' EXIT
DATABASE_URL="$URL" node scripts/apply-sql.mjs prisma/migrations/20260101000000_init/migration.sql --reset
TEST_DATABASE_URL="$URL" npx vitest run test/prisma-repository.test.ts "$@"
