#!/usr/bin/env bash
set -euo pipefail

SRC_DIR="${1:-$GITHUB_WORKSPACE}"
DEST_DIR="/opt/ofrc/chatbot-production"

echo "Rsync chatbot production from ${SRC_DIR} → ${DEST_DIR}"
mkdir -p "${DEST_DIR}"
rsync -az --delete \
  --exclude '.git' \
  --exclude 'node_modules' \
  --exclude 'server/node_modules' \
  --exclude 'dist' \
  --exclude 'server/dist' \
  --exclude 'server/.env.staging.docker' \
  --exclude 'server/.env.production.docker' \
  --exclude 'uploads' \
  --exclude 'server/uploads' \
  "${SRC_DIR}/" "${DEST_DIR}/"

cd "${DEST_DIR}"
test -f server/.env.production.docker || { echo "Missing server/.env.production.docker"; exit 1; }

docker compose -f docker-compose.production.yml build api migrate frontend
docker compose -f docker-compose.production.yml --profile tools run --rm migrate
docker compose -f docker-compose.production.yml up -d

curl -fsS -H "Host: chat.ofrc-admin.com" -o /dev/null --connect-timeout 5 "http://127.0.0.1:8091/"
curl -fsS -H "Host: api-chat.ofrc-admin.com" --connect-timeout 5 "http://127.0.0.1:8091/api/health"
echo "PRODUCTION_DEPLOY_OK"
