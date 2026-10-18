# User Requirements — OFRC Chatbot

Living requirements for the Odd Fellows Recreation Club chatbot. Update this document whenever system behavior or product decisions change.

**Related docs:** [docs/ADMIN_HELP_GUIDE.md](docs/ADMIN_HELP_GUIDE.md), [docs/ADMIN_RUNBOOK.md](docs/ADMIN_RUNBOOK.md), [docs/deploy/STAGING_SETUP.md](docs/deploy/STAGING_SETUP.md)

---

## 1. System overview

A greenfield web application that answers questions about OFRC using **only** club-provided documents (RAG). It does **not** search the public internet for answers.

| Audience | Access |
|----------|--------|
| General users | Anyone with the URL; no login |
| Admins | Username/password; upload documents and train the knowledge base |
| Recovery admin | Env-seeded account that can create admins and reset passwords |

**URLs (planned / Hostinger):**

| Env | App | API |
|-----|-----|-----|
| Staging | https://chat-staging.ofrc-admin.com | https://api-chat-staging.ofrc-admin.com |
| Production | https://chat.ofrc-admin.com | https://api-chat.ofrc-admin.com |

**Stack:** React + TypeScript + Vite (frontend); Express + TypeScript (API); PostgreSQL + `pgvector` (host DB); Gemini free tier (chat + embeddings); Docker Compose + Nginx aligned with Member Portal.

---

## 2. User roles

### 2.1 General user (public)

- No authentication.
- Ask natural-language questions on the public chat page.
- See persistent instructions and contact/emergency information.
- View last five questions in a sidebar (this browser tab only).
- Copy assistant responses to the clipboard.
- Start a new chat session.

### 2.2 Admin

- Login with username and password (bcrypt + DB-backed Bearer sessions).
- Manage documents (upload PDF, assign category, train/re-train, delete).
- Create categories.
- Browse categorized topics and key facts extracted after training.
- Change own password.
- Access in-app **Help** guide.

### 2.3 Recovery admin

- Seeded on API start from `RECOVERY_USERNAME` / `RECOVERY_PASSWORD`.
- All admin capabilities, plus:
  - List admins
  - Create admins
  - Reset any admin password (clears that admin’s sessions)
- Must not be deletable via normal admin UI.

---

## 3. Public chat requirements

### 3.1 Persistent instructions (always visible under “Ask OFRC”)

1. Ask me about OFRC bylaws, camping, cabins, reservations, or event sites. I only use information shared by the club to answer questions in this chat.
2. Contact lines (each on its own line, with dividers):
   - Contact the OFRC Assistant at ofrcassistant@outlook.com with any questions or for any support.
   - For OFRC after-hours emergencies, call 707-909-0700.
   - For life-threatening emergencies, call 911. (**2× font size, red**)

### 3.2 Chat behavior

- Answers grounded only in retrieved club document chunks (no web search).
- May ask clarifying questions when the query is ambiguous or retrieval is weak.
- When answers use documents, include **reference file name(s)** in the response (and/or a References section).
- Rate-limited public chat endpoint to protect free LLM quota.
- **Copy** control on each assistant reply (copies answer + references when applicable).
- **New chat** button: fixed size; not stretched by the instruction/contact column.

### 3.3 Recent questions sidebar

- Shows up to the last **five** questions asked.
- Clicking a question opens/restores that Q&A in the chat.
- Stored in **sessionStorage** (per browser tab); not shared across users, tabs, or devices.
- Cleared on page reload (including empty cache + hard reload).
- Not stored as a shared server-side “recent questions” list for all visitors.

---

## 4. Admin requirements

### 4.1 Documents

- Upload PDF only.
- Optional category assignment on upload; ability to create categories.
- Change category on an **existing** document (updates document and related topics).
- **Upload & train** runs ingest: extract text → chunk → embed → store vectors; then attempt topic/key-fact extraction.
- Document statuses: `pending`, `processing`, `ready`, `failed`.
- **Re-train** re-runs ingest for an existing document.
- **Delete** removes document, chunks, and related topics/facts.

### 4.2 Topics

- Categorized list of topics and key facts after successful training.
- Ability to delete a topic or individual key fact.
- Topic extraction failure must not block document from becoming `ready` if chunks were stored (chat can still use the document).

### 4.3 Account

- Change password (min 8 characters).
- Recovery-only: create admin, list admins, reset password.

### 4.4 Help

- In-app Admin Help guide describing how to use admin features (see [docs/ADMIN_HELP_GUIDE.md](docs/ADMIN_HELP_GUIDE.md)).

---

## 5. Knowledge / “training”

“Train” means RAG ingest, not fine-tuning a private model.

**Initial seed categories / files:**

| Category | Seed file |
|----------|-----------|
| Bylaws | `bylaws.pdf` |
| Reservations & Booking | `reservation-booking-guide.pdf` |
| Event Sites | `event-site-descriptions.pdf` |
| Event Agreement | `event-agreement.pdf` |
| Campground Rules | `campground-rules.pdf` |
| Cabin Rules | `cabin-rules.pdf` |

LLM: Google Gemini (free tier). Embeddings via `gemini-embedding-001` (768-dim). Chat model configurable (default `gemini-3.8-flash`).

---

## 6. Hosting & ops (alignment)

- Hostinger VPS alongside Member Portal.
- Staging first: `/opt/ofrc/chatbot-staging`, proxy `127.0.0.1:8089`, DB `chatbot_staging`.
- Production (deferred): `/opt/ofrc/chatbot-production`, proxy `127.0.0.1:8091`, DB `chatbot_production`.
- Secrets in VPS-only `server/.env.*.docker` (never commit).
- Separate Compose project/network from Member Portal.

---

## 7. Out of scope (v1)

- Member Portal SSO / shared members table
- Fully offline / on-VPS LLM (Ollama)
- Internet search for answers
- Native mobile apps

---

## 8. Change log

| Date | Change |
|------|--------|
| 2026-10-18 | Initial greenfield requirements: public RAG chat, admin document training, recovery account, Hostinger-aligned deploy |
| 2026-10-18 | Answers must cite reference document filenames |
| 2026-10-18 | Persistent instructions + contact/emergency lines on Ask page |
| 2026-10-18 | Splash welcome no longer repeats contact block |
| 2026-10-18 | Instruction copy: club-shared information only |
| 2026-10-18 | Contact copy: questions/support; after-hours then 911 (911 red, 2× size) |
| 2026-10-18 | Recent questions sidebar (5); per-tab; cleared on reload |
| 2026-10-18 | Copy button on assistant responses |
| 2026-10-18 | New chat button fixed size (not stretched by contact column) |
| 2026-10-18 | Gemini models: embedding-001 + current Flash; clearer ingest errors |
| 2026-10-18 | Added USER_REQUIREMENTS.md and Admin Help guide (markdown + in-app Admin → Help) |
| 2026-10-18 | Admins can change category on an existing document |
| 2026-10-18 | Default chat model switched to gemini-3.1-flash-lite (free-tier quota); clearer 429 errors |
| 2026-10-18 | OFRC logo added to site header brand |

*When changing product behavior, add a row here and update the relevant sections above.*
