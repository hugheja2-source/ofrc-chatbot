# OFRC Chatbot

Club-document chatbot for Odd Fellows Recreation Club. Public visitors ask questions; admins upload PDFs or import public OFRCNews.com pages and train a RAG knowledge base. Answers stay grounded in that trained material. Chat does not search the web while answering. Chat runs on Groq. Embeddings run on Ollama on the club VPS.

**Release 1.1.16** — powered by GPT-OSS 120B (`openai/gpt-oss-120b`) on Groq. Embeddings: `nomic-embed-text`. The chat page leads with “How can we help?” Contact lists and date schedules stay together during training, so documents trained before this release need to be trained again. The header release number is plain text. Release notes are admin-only.

## Stack

- Frontend: React + TypeScript + Vite
- API: Node.js + Express + TypeScript
- DB: PostgreSQL + `pgvector` on the Hostinger VPS host
- LLM: Groq GPT-OSS 120B for chat and topic extraction; Ollama on the VPS for `nomic-embed-text` embeddings
- Deploy: Docker Compose + host Nginx/TLS (same pattern as Member Portal)

## URLs

| App | API |
|-----|-----|
| https://ask.ofrc-admin.com | https://api-ask.ofrc-admin.com |

## Local development

```bash
# Terminal 1 — API
cd server
cp .env.example .env
# Set DB_*, OLLAMA_BASE_URL, GROQ_API_KEY, RECOVERY_PASSWORD
# Ollama must be running for embeddings (local, or SSH tunnel to the VPS port 11434)
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
- [docs/deploy/VPS_SETUP.md](docs/deploy/VPS_SETUP.md) — Hostinger VPS setup and deploy

## Deploy

See [docs/deploy/VPS_SETUP.md](docs/deploy/VPS_SETUP.md) and [docs/ADMIN_RUNBOOK.md](docs/ADMIN_RUNBOOK.md).

```bash
./deploy.sh
```

## License

Private — OFRC internal use.
