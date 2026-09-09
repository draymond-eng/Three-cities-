#!/usr/bin/env bash
# Load the schema into a throwaway Postgres and run the booking-rule tests.
#
#   ./supabase/run-tests.sh                      # uses a local socket at $PGSOCK
#   PGSOCK=/var/tmp/pgtest/sock ./supabase/run-tests.sh
#
# Needs Postgres 16+ with btree_gist available. Nothing here touches your
# Supabase project — it builds and drops a local database called club_test.
set -euo pipefail
cd "$(dirname "$0")/.."

PSQL=(psql ${PGSOCK:+-h "$PGSOCK"} -U "${PGUSER:-postgres}")

"${PSQL[@]}" -q -c "drop database if exists club_test"
"${PSQL[@]}" -q -c "create database club_test"

# Stand-ins for the Supabase platform objects the schema builds on.
"${PSQL[@]}" -d club_test -v ON_ERROR_STOP=1 -q <<'SQL'
create schema if not exists auth;
create table if not exists auth.users (
  id uuid primary key default gen_random_uuid(),
  email text,
  raw_user_meta_data jsonb default '{}'::jsonb
);
create or replace function auth.uid() returns uuid
  language sql stable as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated; end if;
end $$;
SQL

"${PSQL[@]}" -d club_test -v ON_ERROR_STOP=1 -q -f supabase/schema.sql
OUT=$("${PSQL[@]}" -d club_test -q -t -A -f supabase/schema.test.sql 2>&1 | grep -v '^$\|^set_config\|^[0-9]')
echo "$OUT"

FAILED=$(echo "$OUT" | grep -c '^FAIL' || true)
"${PSQL[@]}" -q -c "drop database if exists club_test" >/dev/null

echo
if [ "$FAILED" -gt 0 ]; then echo "$FAILED check(s) FAILED"; exit 1; fi
echo "All checks passed."
