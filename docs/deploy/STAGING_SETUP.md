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
# edit DB password, GEMINI_API_KEY, RECOVERY_PASSWORD
chmod 600 /opt/ofrc/chatbot-staging/server/.env.staging.docker
```

## Deploy app code

From your Mac (break-glass):

```bash
chmod +x deploy-staging.sh
./deploy-staging.sh
```

Or push to the `staging` branch to run GitHub Actions on runner `ofrc-vps`.

## After first deploy

1. Open https://chat-staging.ofrc-admin.com/admin/login
2. Sign in with recovery credentials from env
3. Upload seed PDFs (or run seed from a machine with `GEMINI_API_KEY` and DB access)
4. Ask a test question on the public chat page

## Rollback Nginx only

```bash
sudo rm /etc/nginx/sites-enabled/chat-staging.ofrc-admin.com.conf
sudo rm /etc/nginx/sites-enabled/api-chat-staging.ofrc-admin.com.conf
sudo nginx -t && sudo systemctl reload nginx
```
