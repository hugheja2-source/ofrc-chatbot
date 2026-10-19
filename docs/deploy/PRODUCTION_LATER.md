# Production (deferred)

When ready to add production after staging is stable:

1. DNS A records: `chat` and `api-chat` under `ofrc-admin.com`
2. Dirs: `/opt/ofrc/chatbot-production`, `/var/www/ofrc/chatbot/production/uploads`
3. DB: `chatbot_production` + `CREATE EXTENSION vector`
4. Nginx templates: `nginx/chat.ofrc-admin.com.conf`, `nginx/api-chat.ofrc-admin.com.conf` → proxy `127.0.0.1:8091`
5. Certbot for both hostnames
6. `server/.env.production.docker` from the example (chmod 600). Ollama is already shared from `/opt/ofrc/ollama`; set `OLLAMA_BASE_URL=http://ofrc-ollama:11434`.
7. Deploy: `./deploy-production.sh` or push/merge to `main`

Do not clone staging DB into production as a habit; seed/train documents deliberately.
