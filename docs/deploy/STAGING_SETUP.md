# OFRC Chatbot — Staging Hostinger setup

Staging-only first. Production can wait.

## Target URLs

- App: https://chat-staging.ofrc-admin.com
- API: https://api-chat-staging.ofrc-admin.com/api/health

## One-time VPS prep

```bash
# Directories
sudo mkdir -p /opt/ofrc/chatbot-staging
sudo mkdir -p /var/www/ofrc/chatbot/staging/uploads
sudo chown -R ofrc:ofrc /var/www/ofrc/chatbot
sudo chmod 750 /var/www/ofrc/chatbot/staging/uploads

# Confirm port 8089 is free
ss -tlnp | grep -E '8088|8089|8090|8091' || true

# Postgres
sudo -u postgres psql <<'SQL'
CREATE DATABASE chatbot_staging;
GRANT ALL PRIVILEGES ON DATABASE chatbot_staging TO ofrc_app;
\c chatbot_staging
CREATE EXTENSION IF NOT EXISTS vector;
GRANT ALL ON SCHEMA public TO ofrc_app;
SQL
```

## DNS (Hostinger hPanel)

Create A records for `ofrc-admin.com` pointing at the VPS IP (same as memberportal-staging):

- `chat-staging`
- `api-chat-staging`

## Nginx + Certbot

Copy templates from `nginx/` into `/etc/nginx/sites-available/`, symlink into `sites-enabled`, then:

```bash
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d chat-staging.ofrc-admin.com -d api-chat-staging.ofrc-admin.com
```

## Secrets on VPS

```bash
cp server/.env.staging.docker.example /opt/ofrc/chatbot-staging/server/.env.staging.docker
# edit DB password and RECOVERY_PASSWORD
# OLLAMA_BASE_URL=http://ofrc-ollama:11434
chmod 600 /opt/ofrc/chatbot-staging/server/.env.staging.docker
```

## Ollama (once per VPS)

Shared by staging and production. Do not publish port 11434 on a public address. UFW already allows only 22, 80, and 443 from the internet; the compose file binds Ollama to `127.0.0.1:11434`.

```bash
sudo mkdir -p /opt/ofrc/ollama
sudo cp deploy/ollama/docker-compose.yml /opt/ofrc/ollama/docker-compose.yml
cd /opt/ofrc/ollama
docker compose up -d
docker exec ofrc-ollama ollama pull gemma3:1b
docker exec ofrc-ollama ollama pull nomic-embed-text
```

Chat model: **Gemma 3 1B** (`gemma3:1b`, Gemma Terms of Use). Embeddings: **nomic-embed-text** (768-dim, Apache 2.0). The container may use 7 GB and both CPUs, and the chat model and embeddings stay loaded. Chat answers stream. Do not use `qwen2.5:3b` for this app; that Ollama build is research-only. Gemma 3 4B can stay on disk, but it is not the chat model.

## Deploy app code

From your Mac (break-glass):

```bash
chmod +x deploy-staging.sh
./deploy-staging.sh
```

Or push to the `staging` branch to run GitHub Actions on runner `ofrc-vps`.

## Health check after the containers start

`docker compose up -d` prints `Started` as soon as the process starts. The new frontend is not listening yet. Caddy on `127.0.0.1:8089` answers that gap with **502** (`dial tcp …:80: connect: connection refused`). That first 502 is the startup gap, not a bad build. A single `curl` in the GitHub job will fail the deploy even though the site is fine a second later.

`deploy-staging.sh` and `.github/scripts/deploy-staging-on-vps.sh` retry the frontend page and `/api/health` for about 20 seconds (10 attempts, 2 seconds apart). The job fails only if both checks are still failing after that. Production uses the same retry on port `8091`.

A manual check on the VPS should retry the same way:

```bash
curl -fsS -H "Host: chat-staging.ofrc-admin.com" -o /dev/null \
  --retry 10 --retry-delay 2 --retry-all-errors \
  "http://127.0.0.1:8089/"
curl -fsS -H "Host: api-chat-staging.ofrc-admin.com" \
  --retry 10 --retry-delay 2 --retry-all-errors \
  "http://127.0.0.1:8089/api/health"
```

`--retry-all-errors` is required. Plain `--retry` does not retry an HTTP 502.

## After first deploy

1. Open https://chat-staging.ofrc-admin.com/admin/login
2. Sign in with recovery credentials from env
3. Upload seed PDFs (or run seed from a machine that can reach Ollama and the database)
4. Re-train any documents that were embedded with Gemini
5. Ask a test question on the public chat page

## Rollback Nginx only

```bash
sudo rm /etc/nginx/sites-enabled/chat-staging.ofrc-admin.com.conf
sudo rm /etc/nginx/sites-enabled/api-chat-staging.ofrc-admin.com.conf
sudo nginx -t && sudo systemctl reload nginx
```
