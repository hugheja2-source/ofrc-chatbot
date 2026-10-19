#!/usr/bin/env bash
set -euo pipefail

SRC_DIR="${1:-$GITHUB_WORKSPACE}"
DEST_DIR="/opt/ofrc/chatbot-staging"

echo "Rsync chatbot staging from ${SRC_DIR} → ${DEST_DIR}"
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
test -f server/.env.staging.docker || { echo "Missing server/.env.staging.docker"; exit 1; }
docker network inspect ofrc_ollama >/dev/null 2>&1 || { echo "Missing ofrc_ollama network. Start deploy/ollama on the VPS first."; exit 1; }

docker compose -f docker-compose.staging.yml build api migrate frontend
docker compose -f docker-compose.staging.yml --profile tools run -T --rm migrate </dev/null
docker compose -f docker-compose.staging.yml up -d

# Compose reports Started before Caddy inside the new container is listening.
# A single curl in that gap gets 502 from the proxy and fails the job.
wait_for() {
  local name="$1"
  shift
  local attempt
  for attempt in 1 2 3 4 5 6 7 8 9 10; do
    if "$@"; then
      return 0
    fi
    echo "${name} not ready (attempt ${attempt})"
    sleep 2
  done
  echo "${name} did not become ready"
  return 1
}

wait_for "frontend" curl -fsS -H "Host: chat-staging.ofrc-admin.com" -o /dev/null --connect-timeout 5 --max-time 15 "http://127.0.0.1:8089/"
wait_for "api" curl -fsS -H "Host: api-chat-staging.ofrc-admin.com" --connect-timeout 5 --max-time 15 "http://127.0.0.1:8089/api/health"
echo "STAGING_DEPLOY_OK"
