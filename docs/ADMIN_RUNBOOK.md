# OFRC Chatbot — Admin runbook

## Roles

- **Public users:** anyone with the chat URL; no login.
- **Admins:** username/password for `/admin`.
- **Recovery account:** seeded from `RECOVERY_USERNAME` / `RECOVERY_PASSWORD` on API boot. Can create admins and reset passwords. Do not delete it.

## Train the bot (add knowledge)

1. Sign in at `/admin`.
2. Open **Documents**.
3. Choose a **category** (or create one).
4. Upload a PDF → **Upload & train**.
5. Wait until status is `ready`.
6. Open **Topics** and confirm categories, topics, and key facts look right.
7. Ask a related question on the public chat page.

### Re-train

Use **Re-train** on a document after replacing content or if ingest failed.

### Delete

**Delete** removes the file, chunks, and related topics/facts.

## Seed documents (initial corpus)

Files live in `seed/documents/`:

| Category | File |
|----------|------|
| Bylaws | `bylaws.pdf` |
| Reservations & Booking | `reservation-booking-guide.pdf` |
| Event Sites | `event-site-descriptions.pdf` |
| Event Agreement | `event-agreement.pdf` |
| Campground Rules | `campground-rules.pdf` |
| Cabin Rules | `cabin-rules.pdf` |

Local/API host with DB + Ollama configured (`gemma3:1b` and `nomic-embed-text`):

```bash
cd server
cp .env.example .env   # fill OLLAMA_BASE_URL, DB_*, RECOVERY_PASSWORD
npm install
bash scripts/run-migrations.sh
npm run seed
```

On staging you can also upload these six PDFs via Admin → Documents.

## Change password

**Account → Change my password.**

## Recovery: reset another admin

1. Sign in as the recovery account.
2. **Account → Reset admin password.**
3. Tell the admin the temporary password out of band; they should change it after login.

## Smoke checks

```bash
curl -fsS https://api-chat-staging.ofrc-admin.com/api/health
curl -fsS -I https://chat-staging.ofrc-admin.com/
```

On the VPS:

```bash
curl -fsS -H "Host: api-chat-staging.ofrc-admin.com" http://127.0.0.1:8089/api/health
```

## Important limits

- Answers use **only** retrieved club documents (no web search).
- Public chat is rate-limited so the shared VPS stays responsive while Ollama is answering.
- Release 1.1.0 embeddings are `nomic-embed-text`. Re-train existing documents after this upgrade (`npm run retrain` from `server/`, or Admin → Documents → Re-train). Gemini vectors are not reusable.
- Keep `server/.env.*.docker` on the VPS only; never commit secrets.
