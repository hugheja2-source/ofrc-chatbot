# User Requirements — OFRC Chatbot

Living requirements for the Odd Fellows Recreation Club chatbot. Update this document whenever system behavior or product decisions change.

**Related docs:** [docs/ADMIN_HELP_GUIDE.md](docs/ADMIN_HELP_GUIDE.md), [docs/ADMIN_RUNBOOK.md](docs/ADMIN_RUNBOOK.md), [docs/deploy/STAGING_SETUP.md](docs/deploy/STAGING_SETUP.md)

---

## 1. System overview

A greenfield web application that answers questions about OFRC using **only** club-provided material (RAG). That material is uploaded PDFs and public pages, posts, and PDFs imported from [OFRCNews.com](https://ofrcnews.com). It does **not** search the public internet while answering.

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

**Stack:** React + TypeScript + Vite (frontend); Express + TypeScript (API); PostgreSQL + `pgvector` (host DB); Ollama on the VPS (chat + embeddings); Docker Compose + Nginx aligned with Member Portal.

**Current release:** 1.1.14. The header shows `Release 1.1.14` and `powered by Gemma 3 1B` as plain text for everyone. The Ollama tag is not shown. That line is not a link. Release notes are admin-only (`/admin/release-notes`).

---

## 2. User roles

### 2.1 General user (public)

- No authentication.
- Ask natural-language questions on the public chat page.
- See persistent instructions and contact/emergency information.
- View last five questions in a sidebar (this browser tab only).
- Copy assistant responses to the clipboard.
- Start a new chat session.
- See the release number and “powered by” the chat model’s primary name in the site header as plain text, with no link to release notes. The technical model id is not shown.

### 2.2 Admin

- Login with username and password (bcrypt + DB-backed Bearer sessions).
- Manage documents (upload PDF, import public OFRCNews.com pages, assign category, train/re-train, delete).
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
   - See OFRCNews.com for documents referenced here. (OFRCNews.com links to https://ofrcnews.com)
   - Direct questions or any requests for support to ofrcassistant@outlook.com.
   - For OFRC after-hours emergencies, call 707-909-0700.
   - For life-threatening emergencies, call 911. (**2× font size, red**)

### 3.2 Chat behavior

- Answers grounded only in retrieved club document chunks (no live web search). Imported OFRCNews.com pages count as club documents after an admin trains them.
- May ask clarifying questions when the query is ambiguous or retrieval is weak.
- When answers use documents, include **reference file name(s)** in the response (and/or a References section).
- Rate-limited public chat endpoint so the shared VPS stays responsive while the local model is answering.
- **Copy** control on each assistant reply (copies answer + references when applicable).
- Each assistant reply shows **First word** (time until the first token) and **Finished** (time until the reply is complete). Finished sits immediately left of Copy. These times are not copied with the answer.
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
- **Import from OFRCNews.com** lists public pages, posts, and PDFs on https://ofrcnews.com. The admin chooses which ones to fetch and train. Shop, cart, checkout, account, and thank-you pages are skipped. Pages that require a member login are not fetched.
- Importing an address already in the library downloads it again and re-trains it. **Refresh** on a web item does the same.
- Only `ofrcnews.com` can be imported. The server does not fetch arbitrary URLs.
- A page with almost no readable text (a bare calendar, image, or form) is skipped with an error. Other selected items still train.

### 4.2 Topics

- Categorized list of topics and key facts after successful training.
- Ability to delete a topic or individual key fact.
- Topic extraction failure must not block document from becoming `ready` if chunks were stored (chat can still use the document).

### 4.3 Account

- Change password (min 8 characters).
- Recovery-only: create admin, list admins, reset password.

### 4.4 Help

- In-app Admin Help guide describing how to use admin features (see [docs/ADMIN_HELP_GUIDE.md](docs/ADMIN_HELP_GUIDE.md)).
- Read release notes (Admin → Release notes). Signed-out visitors cannot open them.

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

LLM runs on the club VPS with [Ollama](https://ollama.com) (no paid API, no Gemini key).

| Role | Model | Ollama tag | Notes |
|------|--------|------------|--------|
| Chat and topic extraction | Gemma 3 1B | `gemma3:1b` | Gemma Terms of Use (free for club Q&A). About 806 MB on disk. Chosen over Gemma 3 4B so a CPU prompt finishes in a few seconds. |
| Embeddings | nomic-embed-text | `nomic-embed-text` | 768 dimensions, matching `chunks.embedding vector(768)`. |

Chosen for the Hostinger KVM 2 (2 vCPU, 8 GB RAM) that also runs the member portal and other club apps. There is no swap, so 7B models are out. Gemma 3 4B stayed loaded and streamed, but reading a normal prompt still took about 19 seconds on CPU before the first word. Gemma 3 1B is the chat model so that wait is shorter. Qwen2.5 3B was not selected: the Ollama build is under the Qwen Research License (non-commercial research and evaluation only). Context is capped at 4096 tokens, and a chat prompt uses at most 3 retrieved chunks. Gemma and the embedding model both stay loaded. Answers stream to the page as tokens arrive. One Ollama container (`ofrc-ollama` on the `ofrc_ollama` network, bound to `127.0.0.1:11434`, 7 GB memory cap, both CPUs) is shared by staging and production. Switching the embedding model requires re-training every document; Gemini vectors are not compatible even at the same dimension. Topic extraction uses the start of long PDFs so the prompt fits that context window.

---

## 6. Hosting & ops (alignment)

- Hostinger VPS alongside Member Portal.
- Staging first: `/opt/ofrc/chatbot-staging`, proxy `127.0.0.1:8089`, DB `chatbot_staging`.
- Production (deferred): `/opt/ofrc/chatbot-production`, proxy `127.0.0.1:8091`, DB `chatbot_production`.
- Secrets in VPS-only `server/.env.*.docker` (never commit).
- Separate Compose project/network from Member Portal.
- Ollama lives in `/opt/ofrc/ollama` (`deploy/ollama/docker-compose.yml`), not inside the chatbot compose project, so an app redeploy does not delete the models.
- Chatbot API sets `OLLAMA_BASE_URL=http://ofrc-ollama:11434` and joins the `ofrc_ollama` network.
- API proxy read timeout is 180s so CPU inference can finish.

---

## 7. Out of scope (v1)

- Member Portal SSO / shared members table
- Live internet search while answering a question
- Native mobile apps
- Models larger than Gemma 3 1B for chat on this VPS

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
| 2026-10-19 | Release 1.1.0: chat and embeddings moved from Gemini to Ollama 0.40.6 on the VPS. Chat model Gemma 3 4B (`gemma3:4b`). Embeddings `nomic-embed-text` (768-dim). Header shows release number and powered-by line. Documents must be re-trained. |
| 2026-10-19 | Release 1.1.10: release notes are admin-only. Public header still shows release 1.1.10 and the AI model. |
| 2026-10-19 | Release 1.1.11: header release number is plain text for everyone, with no link to release notes. |
| 2026-10-19 | Release 1.1.12: keep Gemma and embeddings loaded, shorter prompts (3 chunks, 4096 context), stream chat tokens. |
| 2026-10-19 | Release 1.1.13: chat model switched to Gemma 3 1B (`gemma3:1b`) so CPU answers start sooner. Embeddings stay `nomic-embed-text`. |
| 2026-10-19 | Ask page shows time to first word and time until the reply finishes, to the left of Copy. |
| 2026-10-19 | Release 1.1.14: admins can import public OFRCNews.com pages, posts, and PDFs into the knowledge base. Chat still answers only from trained material. |

*When changing product behavior, add a row here and update the relevant sections above.*
