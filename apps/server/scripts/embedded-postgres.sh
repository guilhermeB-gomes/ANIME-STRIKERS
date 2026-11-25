#!/usr/bin/env bash
# Sobe um PostgreSQL local SEM Docker, usando os binários do pacote npm `embedded-postgres`.
# Útil em ambientes sem Docker (CI, sandboxes). Uso: scripts/embedded-postgres.sh start|stop
# Imprime a DATABASE_URL. Requer `npm i -D embedded-postgres` na raiz do repositório.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
BIN="$ROOT/node_modules/@embedded-postgres/linux-x64/native/bin"
LIB="$ROOT/node_modules/@embedded-postgres/linux-x64/native/lib"
DATA="${PGDATA_DIR:-/tmp/strikers-pg/data}"
PORT="${PGPORT_LOCAL:-54329}"
RUN_AS=()
if [ "$(id -u)" = "0" ]; then
  RUN_AS=(runuser -u nobody --)
  mkdir -p "$(dirname "$DATA")"
  chown nobody "$(dirname "$DATA")"
  chown -R nobody "$ROOT/node_modules/@embedded-postgres" 2>/dev/null || true
fi
run() { "${RUN_AS[@]}" env LD_LIBRARY_PATH="$LIB" "$@"; }
case "${1:-start}" in
  start)
    if [ ! -d "$DATA" ]; then
      echo strikers > "$(dirname "$DATA")/pw"
      [ "$(id -u)" = "0" ] && chown nobody "$(dirname "$DATA")/pw"
      run "$BIN/initdb" -D "$DATA" -U strikers --pwfile="$(dirname "$DATA")/pw" --auth=password >/dev/null
    fi
    run "$BIN/pg_ctl" -D "$DATA" -o "-p $PORT -k /tmp" -l "$(dirname "$DATA")/log" -w start >/dev/null
    echo "postgresql://strikers:strikers@127.0.0.1:$PORT/postgres"
    ;;
  stop) run "$BIN/pg_ctl" -D "$DATA" stop >/dev/null ;;
esac
