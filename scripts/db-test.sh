#!/usr/bin/env bash
# Spins up a throwaway local Postgres, mocks the Supabase runtime, applies all
# migrations, and runs the security/compliance assertion suite.
set -euo pipefail

# macOS: postgres aborts with "postmaster became multithreaded during startup"
# when locale env vars are unset/invalid.
export LC_ALL=C
export LANG=C

PG_BIN="${PG_BIN:-/opt/homebrew/opt/postgresql@17/bin}"
PORT="${DB_TEST_PORT:-54329}"
DIR="$(mktemp -d /tmp/mailboxos-dbtest.XXXXXX)"
export PGDATA="$DIR/data"
export PGHOST="$DIR"
DB=mailboxos_test

cleanup() {
  "$PG_BIN/pg_ctl" -D "$PGDATA" stop -m immediate >/dev/null 2>&1 || true
  rm -rf "$DIR"
}
trap cleanup EXIT

"$PG_BIN/initdb" -D "$PGDATA" --auth=trust --no-locale --encoding=UTF8 >/dev/null
"$PG_BIN/pg_ctl" -D "$PGDATA" -o "-p $PORT -k $DIR -c listen_addresses=''" -l "$DIR/pg.log" start >/dev/null
"$PG_BIN/createdb" -p "$PORT" "$DB"

PSQL=("$PG_BIN/psql" -v ON_ERROR_STOP=1 -q -p "$PORT" -d "$DB")

echo "→ Supabase environment mock"
"${PSQL[@]}" -f "$(dirname "$0")/db-test-setup.sql"

echo "→ Applying migrations"
for f in "$(dirname "$0")/../supabase/migrations/"*.sql; do
  echo "   $(basename "$f")"
  "${PSQL[@]}" -f "$f"
done

echo "→ Running assertions"
"${PSQL[@]}" -f "$(dirname "$0")/db-test-assertions.sql"
