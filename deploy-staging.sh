#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
VPS_IP="${VPS_IP:-187.124.85.179}"
VPS_USER="${VPS_USER:-root}"
VPS_SSH_KEY="${VPS_SSH_KEY:-$HOME/.ssh/ofrc_deploy_ed25519}"
VPS_DIR="${VPS_DIR:-/opt/ofrc/chatbot-staging}"

echo "Deploying OFRC Chatbot staging → ${VPS_USER}@${VPS_IP}:${VPS_DIR}"

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
test -f server/.env.staging.docker || { echo "Missing server/.env.staging.docker on VPS"; exit 1; }
docker network inspect ofrc_ollama >/dev/null 2>&1 || { echo "Missing ofrc_ollama network. Start deploy/ollama on the VPS first."; exit 1; }
docker compose -f docker-compose.staging.yml build api migrate frontend
docker compose -f docker-compose.staging.yml --profile tools run -T --rm migrate </dev/null
docker compose -f docker-compose.staging.yml up -d
curl -fsS -H "Host: chat-staging.ofrc-admin.com" -o /dev/null --connect-timeout 5 "http://127.0.0.1:8089/"
curl -fsS -H "Host: api-chat-staging.ofrc-admin.com" --connect-timeout 5 "http://127.0.0.1:8089/api/health"
echo "STAGING_DEPLOY_OK"
EOF
