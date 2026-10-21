# Ask OFRC — Hostinger VPS setup

One app. There is no separate staging or production stack.

## Target URLs

- App: https://ask.ofrc-admin.com
- API: https://api-ask.ofrc-admin.com/api/health
- Internal proxy: `127.0.0.1:8089`
- App directory: `/opt/ofrc/chatbot`
- Uploads: `/var/www/ofrc/chatbot/uploads`
- Database: `chatbot`
- Secrets file on the VPS: `/opt/ofrc/chatbot/server/.env.docker` (never commit)

## One-time VPS prep

```bash
# Directories
sudo mkdir -p /opt/ofrc/chatbot
sudo mkdir -p /var/www/ofrc/chatbot/uploads
sudo chown -R ofrc:ofrc /var/www/ofrc/chatbot
sudo chmod 750 /var/www/ofrc/chatbot/uploads

# Confirm port 8089 is free
ss -tlnp | grep 8089 || true

# Postgres
sudo -u postgres psql <<'SQL'
CREATE DATABASE chatbot;
GRANT ALL PRIVILEGES ON DATABASE chatbot TO ofrc_app;
\c chatbot
CREATE EXTENSION IF NOT EXISTS vector;
GRANT ALL ON SCHEMA public TO ofrc_app;
SQL
```

## DNS (Hostinger hPanel)

Create A records for `ofrc-admin.com` pointing at the VPS IP:

- `ask`
- `api-ask`

## Nginx + Certbot

Copy templates from `nginx/` into `/etc/nginx/sites-available/`, symlink into `sites-enabled`, then:

```bash
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d ask.ofrc-admin.com -d api-ask.ofrc-admin.com
```

## Secrets on VPS

```bash
cp server/.env.docker.example /opt/ofrc/chatbot/server/.env.docker
# edit DB password, RECOVERY_PASSWORD, and GROQ_API_KEY
# OLLAMA_BASE_URL=http://ofrc-ollama:11434
chmod 600 /opt/ofrc/chatbot/server/.env.docker
```

## Ollama (once per VPS)

Do not publish port 11434 on a public address. UFW already allows only 22, 80, and 443 from the internet; the compose file binds Ollama to `127.0.0.1:11434`.

```bash
sudo mkdir -p /opt/ofrc/ollama
sudo cp deploy/ollama/docker-compose.yml /opt/ofrc/ollama/docker-compose.yml
cd /opt/ofrc/ollama
docker compose up -d
docker exec ofrc-ollama ollama pull nomic-embed-text
```

Chat model: **GPT-OSS 120B** on Groq (`openai/gpt-oss-120b`). Embeddings: **nomic-embed-text** (768-dim, Apache 2.0) on this container. The container uses 2 GB and 1 CPU and loads the embedding model only. Chat answers stream from Groq. If `gemma3:1b` is already on disk, leave it until a chat succeeds, then remove it with `docker exec ofrc-ollama ollama rm gemma3:1b`. Do not pull it for a new install.

## Deploy app code

From your Mac (break-glass):

```bash
chmod +x deploy.sh
./deploy.sh
```

Or push to the `main` branch to run GitHub Actions on runner `ofrc-vps`.

## Health check after the containers start

`docker compose up -d` prints `Started` as soon as the process starts. The new frontend is not listening yet. Caddy on `127.0.0.1:8089` answers that gap with **502** (`dial tcp …:80: connect: connection refused`). That first 502 is the startup gap, not a bad build. A single `curl` in the GitHub job will fail the deploy even though the site is fine a second later.

`deploy.sh` and `.github/scripts/deploy-on-vps.sh` retry the frontend page and `/api/health` for about 20 seconds (10 attempts, 2 seconds apart). The job fails only if both checks are still failing after that.

A manual check on the VPS should retry the same way:

```bash
curl -fsS -H "Host: ask.ofrc-admin.com" -o /dev/null \
  --retry 10 --retry-delay 2 --retry-all-errors \
  "http://127.0.0.1:8089/"
curl -fsS -H "Host: api-ask.ofrc-admin.com" \
  --retry 10 --retry-delay 2 --retry-all-errors \
  "http://127.0.0.1:8089/api/health"
```

`--retry-all-errors` is required. Plain `--retry` does not retry an HTTP 502.

## After first deploy

1. Open https://ask.ofrc-admin.com/admin/login
2. Sign in with recovery credentials from env
3. Upload seed PDFs (or run seed from a machine that can reach Ollama and the database)
4. Re-train any documents that were embedded with Gemini
5. Ask a test question on the public chat page

## Renaming the old staging stack (one-time cutover)

The app used to run as a staging stack at `chat-staging.ofrc-admin.com` / `api-chat-staging.ofrc-admin.com`, in `/opt/ofrc/chatbot-staging`, with database `chatbot_staging`. These are the manual steps to move that live data to the names above. Do not push to `main` until the new URL answers, because a push deploys.

1. In Hostinger hPanel, add the `ask` and `api-ask` A records above. Leave the old records in place for now. Wait until `dig +short ask.ofrc-admin.com` and `dig +short api-ask.ofrc-admin.com` return the VPS IP.
2. On the VPS, back up, then stop the old stack so Postgres allows the rename:

   ```bash
   mkdir -p /var/www/ofrc/backups
   sudo -u postgres pg_dump chatbot_staging > /var/www/ofrc/backups/chatbot-staging-$(date +%Y%m%d-%H%M%S).sql
   cd /opt/ofrc/chatbot-staging
   docker compose -f docker-compose.staging.yml down
   ```

3. Rename the database and move the uploads. The host `pg_hba.conf` also has a per-database line (`host chatbot_staging ofrc_app 172.16.0.0/12 …`); rename that database name to `chatbot` too and reload Postgres, or the API containers on the new Docker network cannot connect:

   ```bash
   sudo sed -i 's/^host[[:space:]]\+chatbot_staging/host    chatbot/' /etc/postgresql/14/main/pg_hba.conf
   sudo -u postgres psql -c "SELECT pg_reload_conf();"
   sudo -u postgres psql -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = 'chatbot_staging' AND pid <> pg_backend_pid();"
   sudo -u postgres psql -c "ALTER DATABASE chatbot_staging RENAME TO chatbot;"
   mkdir -p /var/www/ofrc/chatbot
   mv /var/www/ofrc/chatbot/staging/uploads /var/www/ofrc/chatbot/uploads
   ```

4. Uploaded file paths are stored as absolute `documents.storage_path` values, so point them at the new directory:

   ```bash
   sudo -u postgres psql -d chatbot -c "SELECT storage_path FROM documents LIMIT 5;"
   sudo -u postgres psql -d chatbot -c "UPDATE documents SET storage_path = replace(storage_path, '/var/www/ofrc/chatbot/staging/uploads', '/var/www/ofrc/chatbot/uploads') WHERE storage_path LIKE '/var/www/ofrc/chatbot/staging/uploads%';"
   ```

5. Move the app tree and the secrets file, then set `ALLOWED_ORIGINS=https://ask.ofrc-admin.com`, `DB_NAME=chatbot`, and `UPLOAD_DIR=/var/www/ofrc/chatbot/uploads` in it. Leave the passwords and `GROQ_API_KEY` unchanged:

   ```bash
   mv /opt/ofrc/chatbot-staging /opt/ofrc/chatbot
   mv /opt/ofrc/chatbot/server/.env.staging.docker /opt/ofrc/chatbot/server/.env.docker
   chmod 600 /opt/ofrc/chatbot/server/.env.docker
   ```

6. From the laptop, run `./deploy.sh`. It rsyncs into `/opt/ofrc/chatbot` without replacing `.env.docker`.
7. Install the new Nginx sites (commands above), run Certbot for the two new names, and confirm:

   ```bash
   curl -fsS -I https://ask.ofrc-admin.com/
   curl -fsS https://api-ask.ofrc-admin.com/api/health
   ```

   Sign in at https://ask.ofrc-admin.com/admin/login and open one trained document.
8. Only after that, remove the old Nginx sites, the old certificate (`certbot certificates` shows its name), and the `chat-staging` / `api-chat-staging` DNS records. Do not remove `/opt/ofrc/ollama` or the `ofrc_ollama` network.
9. On GitHub, fast-forward `main` from the old `staging` branch, push `main`, then delete the `staging` branch. Confirm the “Deploy chatbot” Action passed and that the default branch is `main`. If `git merge --ff-only` refuses, stop and do not force-push.

## Rollback Nginx only

```bash
sudo rm /etc/nginx/sites-enabled/ask.ofrc-admin.com.conf
sudo rm /etc/nginx/sites-enabled/api-ask.ofrc-admin.com.conf
sudo nginx -t && sudo systemctl reload nginx
```
