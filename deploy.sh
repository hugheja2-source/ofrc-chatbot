#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
VPS_IP="${VPS_IP:-187.124.85.179}"
VPS_USER="${VPS_USER:-root}"
VPS_SSH_KEY="${VPS_SSH_KEY:-$HOME/.ssh/ofrc_deploy_ed25519}"
VPS_DIR="${VPS_DIR:-/opt/ofrc/chatbot}"

echo "Deploying Ask OFRC → ${VPS_USER}@${VPS_IP}:${VPS_DIR}"

rsync -az --delete \
  --exclude '.git' \
  --exclude 'node_modules' \
  --exclude 'server/node_modules' \
  --exclude 'dist' \
  --exclude 'server/dist' \
  --exclude 'server/.env.docker' \
  --exclude 'uploads' \
  --exclude 'server/uploads' \
  -e "ssh -i ${VPS_SSH_KEY}" \
  "${ROOT_DIR}/" "${VPS_USER}@${VPS_IP}:${VPS_DIR}/"

ssh -i "${VPS_SSH_KEY}" "${VPS_USER}@${VPS_IP}" bash -s <<EOF
set -euo pipefail
cd "${VPS_DIR}"
test -f server/.env.docker || { echo "Missing server/.env.docker on VPS"; exit 1; }
docker network inspect ofrc_ollama >/dev/null 2>&1 || { echo "Missing ofrc_ollama network. Start deploy/ollama on the VPS first."; exit 1; }
docker compose -f docker-compose.yml build api migrate frontend
docker compose -f docker-compose.yml --profile tools run -T --rm migrate </dev/null
docker compose -f docker-compose.yml up -d
wait_for() {
  local name="\$1"
  shift
  local attempt
  for attempt in 1 2 3 4 5 6 7 8 9 10; do
    if "\$@"; then
      return 0
    fi
    echo "\${name} not ready (attempt \${attempt})"
    sleep 2
  done
  echo "\${name} did not become ready"
  return 1
}
wait_for "frontend" curl -fsS -H "Host: ask.ofrc-admin.com" -o /dev/null --connect-timeout 5 --max-time 15 "http://127.0.0.1:8089/"
wait_for "api" curl -fsS -H "Host: api-ask.ofrc-admin.com" --connect-timeout 5 --max-time 15 "http://127.0.0.1:8089/api/health"
echo "DEPLOY_OK"
EOF
