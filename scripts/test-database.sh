#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
container="model-pulse-schema-test-$$"
trap 'docker rm -f "$container" >/dev/null 2>&1 || true' EXIT
# No published ports, volumes or access to an application database.
docker run -d --rm --network none --name "$container" -e POSTGRES_HOST_AUTH_METHOD=trust "${POSTGRES_TEST_IMAGE:-postgres:17-alpine}" >/dev/null
ready=0
for attempt in {1..30}; do
  if docker exec "$container" pg_isready -U postgres >/dev/null 2>&1; then ready=1; break; fi
  sleep 1
done
[[ "$ready" == 1 ]] || { echo 'Test PostgreSQL did not become ready'; exit 1; }
run_sql() { docker exec -i "$container" psql -X -U postgres -d "$1" -v ON_ERROR_STOP=1 -q; }
run_sql postgres <<'SQL'
CREATE ROLE anon;
CREATE ROLE authenticated;
CREATE ROLE service_role BYPASSRLS;
CREATE DATABASE fresh;
SQL
run_sql fresh < supabase/schema.sql
run_sql fresh < supabase/schema-dev.sql
for schema in public dev; do
  sed "s/__SCHEMA__/$schema/g" tests/provider-schema.sql | run_sql fresh
  echo "fresh/$schema: supplier constraints and history verified"
done
