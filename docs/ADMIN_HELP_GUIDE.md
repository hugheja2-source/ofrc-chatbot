# OFRC Chatbot — Admin Help Guide

How to use the Admin section to keep the public chat accurate and up to date.

Full product requirements: [USER_REQUIREMENTS.md](../USER_REQUIREMENTS.md).  
Technical ops (deploy, seed, recovery env): [ADMIN_RUNBOOK.md](ADMIN_RUNBOOK.md).

---

## 1. Signing in

1. Open **/admin** (or choose **Admin** in the top nav).
2. Enter your username and password.
3. You land on **Topics**.

If you forget your password, ask someone with the **recovery** account to reset it under **Account**.

---

## 2. What Admin is for

| Area | Purpose |
|------|---------|
| **Topics** | Review categories, topics, and key facts the system extracted from trained documents |
| **Documents** | Upload PDFs, import public OFRCNews.com pages, assign categories, train / re-train, or delete documents |
| **Account** | Change your password; recovery users can create admins and reset passwords |
| **Help** | This guide (in the app) |

The public **Ask** page is for visitors. They do not log in. Answers come only from documents you have trained. The chat does not look up the open internet while someone is asking a question.

---

## 3. Documents — upload and train

### 3.1 Add knowledge

1. Go to **Documents**.
2. Optionally choose a **category**, or create one with **Add category**.
3. Choose a **PDF** file.
4. Click **Upload & train**.
5. Wait until the document status is **ready**.

Training means:

1. Text is extracted from the PDF  
2. Text is split into chunks and embedded  
3. Chunks are stored for chat retrieval  
4. Topics and key facts are generated for the Topics page (if the AI step succeeds)

If topic extraction fails but chunks succeed, the document can still be **ready** and usable in chat. Check **Topics** afterward; you can re-train later.

### 3.2 Change category

On an existing document in the list, use the **Category** dropdown to assign a different category (or Uncategorized). Related topics for that document are updated to match.

Use **Search documents** above the list to find a file by name, category, status, error text, or OFRCNews address.

### 3.3 Import from OFRCNews.com

1. Go to **Documents**.
2. Click **Load OFRCNews.com**.
3. Check the public pages, posts, and PDFs you want. New items are checked for you.
4. Optionally choose a **category for new imports**.
5. Click **Import & train** and wait. Each item is fetched and trained one at a time.

Shop, cart, checkout, and account pages are left out. Member-only pages behind a login are not read. A page that is only a form, calendar, or image may fail with “not enough readable text”; the other selected items still train.

Importing something already in the library downloads it again and re-trains it. On that document, **Refresh** does the same thing. Uploaded PDFs still use **Re-train**, which does not download anything.

### 3.4 Re-train

Use **Re-train** (or **Refresh** for an OFRCNews item) when:

- Training previously **failed**
- You want to refresh embeddings / topics for the same file
- An OFRCNews page changed and you want the new text
- Model or pipeline settings changed and you need a fresh ingest

### 3.5 Delete

**Delete** removes the uploaded file and its chunks, topics, and key facts. Visitors will no longer get answers from that document.

### 3.6 Statuses

| Status | Meaning |
|--------|---------|
| pending | Uploaded; not trained yet |
| processing | Training in progress |
| ready | Available for chat |
| failed | Training error—see error text; try **Re-train** |

### 3.7 Recommended starter documents

| Category | Typical file |
|----------|----------------|
| Bylaws | Club bylaws PDF |
| Reservations & Booking | Reservation booking guide |
| Event Sites | Event site descriptions |
| Event Agreement | Event agreement |
| Campground Rules | Campground rules |
| Cabin Rules | Cabin rules |

---

## 4. Topics — review the knowledge map

1. Open **Topics**.
2. Browse by **category**, or use **Search topics** to find a title, fact, category, or source file.
3. Expand topics to see **key facts**.
4. Remove outdated topics or facts with **Delete topic** / **remove** on a fact.

Topics are a human-readable view of what was learned. Chat retrieval uses the underlying document chunks, so keeping documents trained and accurate matters most.

---

## 5. Account

### 5.1 Change your password

1. Open **Account**.
2. Enter current password and a new password (at least 8 characters).
3. Save.

### 5.2 Recovery account only

If you are signed in as the recovery user:

- **Create admin** — add another admin username/password  
- **Reset admin password** — set a temporary password; their other sessions end  

Do not share the recovery password casually. Store it securely (deployment env / password manager).

---

## 6. Checking that chat works

After training:

1. Open **Public chat** (or **Ask** in the top nav).
2. Ask a question that the new document should answer.
3. Confirm the reply is sensible and lists **References** (document file names) when grounded in docs.
4. Use **Copy** on a reply if you need to paste it elsewhere.

---

## 7. Common problems

| Symptom | What to try |
|---------|-------------|
| Internal error / failed training | The on-server model may be busy or down; **Re-train**; check the document error message. After release 1.1.0, re-train so search uses `nomic-embed-text`. |
| Chat says it doesn’t have the info | Train or re-train the relevant PDF, or import the OFRCNews page that has the answer; ask a clearer question |
| Topics empty but document ready | Topic extraction may have failed; chat can still work—re-train if you need the Topics list |
| Can’t log in | Use recovery account to reset password, or check recovery env vars on the server |
| Upload rejected | PDF only; file must be under the configured size limit (~25 MB) |

---

## 8. What admins should not expect (v1)

- Training does **not** fine-tune a private model; it indexes club PDFs for retrieval. Answers are generated by Gemma 3 1B (`gemma3:1b`) on the club VPS.
- The bot will **not** look up answers on the public web while someone is chatting. OFRCNews.com is used only when an admin imports it.
- Admin accounts are **separate** from the Member Portal (no shared login in v1).

---

*Update this guide when Admin features change. Keep [USER_REQUIREMENTS.md](../USER_REQUIREMENTS.md) in sync.*
