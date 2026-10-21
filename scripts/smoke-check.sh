#!/usr/bin/env bash
set -euo pipefail

APP_URL="${APP_URL:-http://127.0.0.1:8089/}"
API_HEALTH="${API_HEALTH:-http://127.0.0.1:8089/api/health}"
APP_HOST="${APP_HOST:-ask.ofrc-admin.com}"
API_HOST="${API_HOST:-api-ask.ofrc-admin.com}"

echo "Checking app via Host: ${APP_HOST}"
curl -fsS -H "Host: ${APP_HOST}" -o /dev/null "${APP_URL}"
echo "OK app"

echo "Checking API health via Host: ${API_HOST}"
curl -fsS -H "Host: ${API_HOST}" "${API_HEALTH}"
echo
echo "SMOKE_OK"
