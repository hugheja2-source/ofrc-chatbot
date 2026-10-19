#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
VPS_IP="${VPS_IP:-187.124.85.179}"
VPS_USER="${VPS_USER:-root}"
VPS_SSH_KEY="${VPS_SSH_KEY:-$HOME/.ssh/ofrc_deploy_ed25519}"
VPS_DIR="${VPS_DIR:-/opt/ofrc/chatbot-production}"

read -r -p "Type yes to deploy PRODUCTION chatbot: " confirm
[[ "$confirm" == "yes" ]] || { echo "Aborted."; exit 1; }

echo "Backing up chatbot_production..."
ssh -i "${VPS_SSH_KEY}" "${VPS_USER}@${VPS_IP}" \
  "mkdir -p /var/www/ofrc/backups && pg_dump -U ofrc_app chatbot_production > /var/www/ofrc/backups/chatbot-production-\$(date +%Y%m%d-%H%M%S).sql || true"

echo "Deploying OFRC Chatbot production → ${VPS_USER}@${VPS_IP}:${VPS_DIR}"

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
  -e "ssh -i ${VPS_SSH_KEY}" \
  "${ROOT_DIR}/" "${VPS_USER}@${VPS_IP}:${VPS_DIR}/"

ssh -i "${VPS_SSH_KEY}" "${VPS_USER}@${VPS_IP}" bash -s <<EOF
set -euo pipefail
cd "${VPS_DIR}"
test -f server/.env.production.docker || { echo "Missing server/.env.production.docker on VPS"; exit 1; }
docker network inspect ofrc_ollama >/dev/null 2>&1 || { echo "Missing ofrc_ollama network. Start deploy/ollama on the VPS first."; exit 1; }
docker compose -f docker-compose.production.yml build api migrate frontend
docker compose -f docker-compose.production.yml --profile tools run -T --rm migrate </dev/null
docker compose -f docker-compose.production.yml up -d
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
wait_for "frontend" curl -fsS -H "Host: chat.ofrc-admin.com" -o /dev/null --connect-timeout 5 --max-time 15 "http://127.0.0.1:8091/"
wait_for "api" curl -fsS -H "Host: api-chat.ofrc-admin.com" --connect-timeout 5 --max-time 15 "http://127.0.0.1:8091/api/health"
echo "PRODUCTION_DEPLOY_OK"
EOF
