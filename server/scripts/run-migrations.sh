#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
MIGRATIONS_DIR="${ROOT_DIR}/migrations"

if [[ -n "${DATABASE_URL:-}" ]]; then
  PSQL_CMD=(psql "$DATABASE_URL" -v ON_ERROR_STOP=1)
elif [[ -n "${MIGRATION_DATABASE_URL:-}" ]]; then
  PSQL_CMD=(psql "$MIGRATION_DATABASE_URL" -v ON_ERROR_STOP=1)
else
  : "${DB_HOST:=localhost}"
  : "${DB_PORT:=5432}"
  : "${DB_NAME:=chatbot_dev}"
  : "${DB_USER:=postgres}"
  export PGPASSWORD="${DB_PASSWORD:-}"
  PSQL_CMD=(psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -v ON_ERROR_STOP=1)
fi

echo "Ensuring applied_migrations table exists..."
"${PSQL_CMD[@]}" <<'SQL'
CREATE TABLE IF NOT EXISTS applied_migrations (
  filename TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
SQL

shopt -s nullglob
for file in "$MIGRATIONS_DIR"/*.sql; do
  name="$(basename "$file")"
  already="$("${PSQL_CMD[@]}" -tAc "SELECT 1 FROM applied_migrations WHERE filename = '$name' LIMIT 1;" | tr -d '[:space:]')"
  if [[ "$already" == "1" ]]; then
    echo "Skip $name (already applied)"
    continue
  fi
  echo "Applying $name..."
  "${PSQL_CMD[@]}" -f "$file"
  "${PSQL_CMD[@]}" -c "INSERT INTO applied_migrations (filename) VALUES ('$name') ON CONFLICT DO NOTHING;"
  echo "Applied $name"
done

echo "Migrations complete."
