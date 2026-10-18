# OFRC Chatbot

Club-document chatbot for Odd Fellows Recreation Club. Public visitors ask questions; admins upload PDFs and train a RAG knowledge base. Answers stay grounded in uploaded documents (Gemini free tier; no web search).

## Stack

- Frontend: React + TypeScript + Vite
- API: Node.js + Express + TypeScript
- DB: PostgreSQL + `pgvector` on the Hostinger VPS host
- Deploy: Docker Compose + host Nginx/TLS (same pattern as Member Portal)

## URLs

| Env | App | API |
|-----|-----|-----|
| Staging | https://chat-staging.ofrc-admin.com | https://api-chat-staging.ofrc-admin.com |
| Production | https://chat.ofrc-admin.com | https://api-chat.ofrc-admin.com |

## Local development

```bash
# Terminal 1 — API
cd server
cp .env.example .env
# Set DB_*, GEMINI_API_KEY, RECOVERY_PASSWORD
npm install
bash scripts/run-migrations.sh
npm run dev

# Terminal 2 — UI
cd ..
npm install
npm run dev
```

Open http://localhost:5173 — Vite proxies `/api` to `:4100`.

Admin: http://localhost:5173/admin/login (recovery user from `.env`).

Optional seed ingest:

```bash
cd server && npm run seed
```

## Docs

- [USER_REQUIREMENTS.md](USER_REQUIREMENTS.md) — living product requirements (update with each change)
- [docs/ADMIN_HELP_GUIDE.md](docs/ADMIN_HELP_GUIDE.md) — admin how-to (also under Admin → Help in the app)
- [docs/ADMIN_RUNBOOK.md](docs/ADMIN_RUNBOOK.md) — ops / recovery / seed
- [docs/deploy/STAGING_SETUP.md](docs/deploy/STAGING_SETUP.md) — Hostinger staging

## Deploy (staging)

See [docs/deploy/STAGING_SETUP.md](docs/deploy/STAGING_SETUP.md) and [docs/ADMIN_RUNBOOK.md](docs/ADMIN_RUNBOOK.md).

```bash
./deploy-staging.sh
```

## License

Private — OFRC internal use.
